const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withUDPModuleFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let podfileContents = fs.readFileSync(podfilePath, 'utf-8');

      // Prefer using vendored llama.rn xcframework if present; otherwise we can fall back to source.
      // Do not force RNLLAMA_BUILD_FROM_SOURCE globally here.

      // Do not modify global CocoaPods modular header settings. Keep system defaults.

      // Find the post_install block and add our fixes
      const postInstallRegex = /post_install do \|installer\|/;

      if (!podfileContents.includes('FOLLY_COROUTINES_AND_NEW_ARCH_FIX_APPLIED_V3')) {
        const customFix = `
    # FOLLY_COROUTINES_AND_NEW_ARCH_FIX_APPLIED_V3
    # Custom GCC_PREPROCESSOR_DEFINITIONS for specific targets
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        # Ensure GCC_PREPROCESSOR_DEFINITIONS is an array for robust manipulation
        defs = Array(config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'])
        defs.delete('$(inherited)') # Remove if present, we'll add it to the front
        defs = defs.flat_map { |d| d.is_a?(String) ? d.shellsplit : d } # Handle strings with spaces
        defs.compact! # Remove nils
        defs.uniq!

        # Only touch build settings for our C++ native modules
        cxx_targets = ['llama-rn', 'react-native-udp-direct', 'UDPDirectModule', 'UDPModule']
        if cxx_targets.include?(target.name)
          # Ensure modern C++ is enabled and libc++ is used (fixes <tuple> not found)
          config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++20'
          config.build_settings['CLANG_CXX_LIBRARY'] = 'libc++'
          config.build_settings['CLANG_ENABLE_MODULES'] = 'NO'
          config.build_settings['DEFINES_MODULE'] = 'NO'

          # Ensure standard library headers and React JSI headers are discoverable (scoped to our targets)
          header_paths = config.build_settings['HEADER_SEARCH_PATHS'] || '$(inherited)'
          if header_paths.is_a?(String)
            header_paths = [header_paths]
          end
          header_paths << '$(SDKROOT)/usr/include/c++/v1'
        else
          header_paths = config.build_settings['HEADER_SEARCH_PATHS'] || '$(inherited)'
          if header_paths.is_a?(String)
            header_paths = [header_paths]
          end
          # Do not mutate header paths for non-C++ targets
        end

        if target.name == 'RCT-Folly'
          # Ensure FOLLY_HAS_COROUTINES is explicitly set to 0 for RCT-Folly
          # This prevents issues with missing Coroutine.h by disabling the feature
          defs.delete_if { |d| d.start_with?('FOLLY_HAS_COROUTINES=') }
          defs.push('FOLLY_HAS_COROUTINES=0')
          puts "[PodfileFix] RCT-Folly: Set FOLLY_HAS_COROUTINES=0"
        end

        if ['react-native-udp-direct', 'UDPDirectModule', 'UDPModule'].include?(target.name)
          # For our custom modules, also ensure Folly coroutines are off and New Arch is on
          defs.delete_if { |d| d.start_with?('FOLLY_HAS_COROUTINES=') }
          defs.push('FOLLY_HAS_COROUTINES=0')

          defs.delete_if { |d| d.start_with?('RCT_NEW_ARCH_ENABLED=') }
          defs.push('RCT_NEW_ARCH_ENABLED=1')

          # Also add FOLLY_CFG_NO_COROUTINES=1 to OTHER_CPLUSPLUSFLAGS for these targets
          # to match how RCT-Folly itself is compiled.
          current_cpp_flags = config.build_settings['OTHER_CPLUSPLUSFLAGS'] || '$(inherited)'
          new_cpp_flags = [current_cpp_flags]
          unless new_cpp_flags.any? { |f| f.include?('FOLLY_CFG_NO_COROUTINES') }
            new_cpp_flags.push('-DFOLLY_CFG_NO_COROUTINES=1')
          end
          config.build_settings['OTHER_CPLUSPLUSFLAGS'] = new_cpp_flags.join(' ')

          # Add React JSI headers for this module
          header_paths << '$(PODS_CONFIGURATION_BUILD_DIR)/React-jsi/React_jsi.framework/Headers'
          header_paths << '$(PODS_ROOT)/Headers/Public/React-jsi'

          puts "[PodfileFix] #{target.name}: Set FOLLY_HAS_COROUTINES=0, RCT_NEW_ARCH_ENABLED=1 and FOLLY_CFG_NO_COROUTINES=1"
        end

        # Apply updated header search paths and definitions (header_paths may be unchanged for non-C++ targets)
        config.build_settings['HEADER_SEARCH_PATHS'] = header_paths.uniq.join(' ')
        final_definitions = ['$(inherited)'] + defs
        config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = final_definitions.uniq.join(' ')
      end
    end
`;

        // Find the end of the post_install block (before the last 'end' in that section)
        // We need to insert our code before the closing of the post_install block
        const lines = podfileContents.split('\n');
        let postInstallIndex = -1;
        let bracketCount = 0;
        let inPostInstall = false;

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('post_install do |installer|')) {
            inPostInstall = true;
            postInstallIndex = i;
            bracketCount = 1;
          } else if (inPostInstall) {
            if (lines[i].includes(' do ') || lines[i].includes(' do|')) {
              bracketCount++;
            }
            if (lines[i].trim() === 'end') {
              bracketCount--;
              if (bracketCount === 0) {
                // Found the end of post_install block
                // Insert our code before this end
                lines.splice(i, 0, customFix);
                break;
              }
            }
          }
        }

        podfileContents = lines.join('\n');
      }

      fs.writeFileSync(podfilePath, podfileContents);

      return config;
    },
  ]);
}

module.exports = withUDPModuleFix;