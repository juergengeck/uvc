// @ts-check
const { withPodfile } = require('@expo/config-plugins');

// This block contains all the custom modifications needed for the Podfile.
// It will be appended as a new post_install block, which is safer than modifying an existing one.
const podfileModificationsBlock = `
# Set environment variable for llama.rn to build from source
ENV['RNLLAMA_BUILD_FROM_SOURCE'] = '1'
# Custom build settings applied by withSaferPodfileMods.js
post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      # Set C++ standard to C++17. Required for React Native 0.71+ and to fix 'tuple' not found errors.
      config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'

      # --- Specific Pod Modifications ---

      if target.name == 'RCT-Folly'
        # Disable Folly coroutines to prevent build errors with missing headers.
        defs = Array(config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'])
        defs.delete_if { |d| d.is_a?(String) && d.start_with?('FOLLY_HAS_COROUTINES=') }
        defs.push('FOLLY_HAS_COROUTINES=0')
        config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = defs.uniq
      end

      if ['UDPDirectModule', 'UDPModule'].include?(target.name)
        # Apply custom settings for UDP modules.
        defs = Array(config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'])
        defs.delete_if { |d| d.is_a?(String) && d.start_with?('FOLLY_HAS_COROUTINES=') }
        defs.push('FOLLY_HAS_COROUTINES=0')
        
        defs.delete_if { |d| d.is_a?(String) && d.start_with?('RCT_NEW_ARCH_ENABLED=') }
        defs.push('RCT_NEW_ARCH_ENABLED=1')
        config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = defs.uniq

        # Add required C++ flags.
        current_cpp_flags = config.build_settings['OTHER_CPLUSPLUSFLAGS'] || '$(inherited)'
        new_cpp_flags = [current_cpp_flags]
        unless new_cpp_flags.any? { |f| f.is_a?(String) && f.include?('FOLLY_CFG_NO_COROUTINES') }
          new_cpp_flags.push('-DFOLLY_CFG_NO_COROUTINES=1')
        end
        config.build_settings['OTHER_CPLUSPLUSFLAGS'] = new_cpp_flags.join(' ')
      end
    end
  end
end
`;

/**
 * A safer Expo config plugin to apply custom Podfile modifications.
 * It inserts the ENV variable at the top and appends post_install modifications.
 */
const withSaferPodfileMods = (config) => {
  return withPodfile(config, (modConfig) => {
    const { modResults } = modConfig;

    // Insert RNLLAMA_BUILD_FROM_SOURCE at the top, after the requires
    const lines = modResults.contents.split('\n');
    let insertIndex = 0;

    // Find where to insert (after the require statements)
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('require ')) {
        insertIndex = i + 1;
      } else if (lines[i].trim() !== '' && !lines[i].startsWith('#')) {
        // Stop at first non-empty, non-comment line after requires
        break;
      }
    }

    // Check if ENV variable already exists
    if (!modResults.contents.includes("ENV['RNLLAMA_BUILD_FROM_SOURCE']")) {
      lines.splice(insertIndex, 0, "\n# Set environment variable for llama.rn to build from source");
      lines.splice(insertIndex + 1, 0, "ENV['RNLLAMA_BUILD_FROM_SOURCE'] = '1'");
      modResults.contents = lines.join('\n');
    }

    // Note: We're not appending the post_install block anymore as it conflicts
    // Instead, we rely on the ENV variable being set early in the file
    return modConfig;
  });
};

module.exports = withSaferPodfileMods;
