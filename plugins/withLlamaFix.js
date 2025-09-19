const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * This plugin fixes issues with the llama.rn native module in the React Native New Architecture by:
 * 1. Adding necessary header search paths for React components
 * 2. Fixing duplicate header issues in the Pods project
 * 3. Ensuring proper TurboModule registration and C++17 settings for llama.rn
 * 4. Setting up correct header search paths to find React Native's RCTDeprecation
 */
const withLlamaRnFix = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      try {
        console.log('🔄 Setting up TurboModule fixes specifically for llama.rn');
        
        const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
        
        if (fs.existsSync(podfilePath)) {
          let podfileContent = fs.readFileSync(podfilePath, 'utf8');
          
          const llamaRnTargetName = 'llama-rn'; // Target only llama-rn
          const hookMarker = `# Fix TurboModule header issues for ${llamaRnTargetName}`;

          if (!podfileContent.includes(hookMarker)) {
            console.log(`✏️ Adding TurboModule fixes to Podfile for ${llamaRnTargetName}`);
            
            podfileContent = podfileContent.replace(
              /post_install do \|installer\|/,
              `post_install do |installer|
    ${hookMarker}
    installer.pods_project.targets.each do |target|
      if target.name == '${llamaRnTargetName}'
        target.build_configurations.each do |config|
          # Fix header search paths for React
          header_search_paths = config.build_settings['HEADER_SEARCH_PATHS'] || []
          if header_search_paths.is_a?(String)
            header_search_paths = header_search_paths.split(' ')
          end
          react_paths = [
            '"$(PODS_ROOT)/Headers/Public/React-Core"',
            '"$(PODS_ROOT)/Headers/Public/React"',
            '"$(PODS_ROOT)/Headers/Public/React-RCTEventEmitter"',
            '"$(PODS_ROOT)/Headers/Public/React-cxxreact"',
            '"$(PODS_ROOT)/Headers/Public/React-jsi"',
            '"$(PODS_ROOT)/Headers/Public/ReactCommon"',
            '"$(PODS_ROOT)/Headers/Public/React-callinvoker"',
            '"$(PODS_ROOT)/Headers/Public/React-runtimeexecutor"',
            '"$(PODS_ROOT)/../node_modules/react-native/ReactApple/Libraries/RCTFoundation"',
            '"$(PODS_ROOT)/../node_modules/react-native/ReactApple"'
          ]
          react_paths.each do |path|
            header_search_paths << path unless header_search_paths.include?(path)
          end
          config.build_settings['HEADER_SEARCH_PATHS'] = header_search_paths
          
          config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
          config.build_settings['CLANG_CXX_LIBRARY'] = 'libc++'
          
          # Add C++17 compatibility flags for newer Xcode versions (16+)
          cpp_flags = config.build_settings['OTHER_CPLUSPLUSFLAGS'] || []
          compat_flags = ' -D_LIBCPP_ENABLE_CXX17_REMOVED_FEATURES=1 -D_LIBCPP_HAS_NO_INCOMPLETE_FORMAT -D_LIBCPP_AVAILABILITY_CUSTOM_VECTOR_BOOL_SPECIALIZATION'
          if cpp_flags.is_a?(String) && !cpp_flags.include?(compat_flags.strip)
            config.build_settings['OTHER_CPLUSPLUSFLAGS'] = "#{cpp_flags}#{compat_flags}"
          elsif cpp_flags.is_a?(Array) && !cpp_flags.join(' ').include?(compat_flags.strip)
            config.build_settings['OTHER_CPLUSPLUSFLAGS'] = cpp_flags + [compat_flags.strip]
          else
            config.build_settings['OTHER_CPLUSPLUSFLAGS'] = ['$(inherited)', compat_flags.strip]
          end
          
          # Add folly flags
          other_cflags = config.build_settings['OTHER_CFLAGS'] || []
          folly_flags_str = ' -DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1 -DFOLLY_CFG_NO_COROUTINES=1'
          if other_cflags.is_a?(String) && !other_cflags.include?(folly_flags_str.strip)
            config.build_settings['OTHER_CFLAGS'] = "#{other_cflags}#{folly_flags_str}"
          elsif other_cflags.is_a?(Array) && !other_cflags.join(' ').include?(folly_flags_str.strip)
            config.build_settings['OTHER_CFLAGS'] = other_cflags + [folly_flags_str.strip]
          else
            config.build_settings['OTHER_CFLAGS'] = ['$(inherited)', folly_flags_str.strip]
          end
          
          # Enable TurboModule architecture flags
          gcc_defs = config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] || ['$(inherited)']
          if gcc_defs.is_a?(String)
            gcc_defs = gcc_defs.split(' ')
          end
          unless gcc_defs.include?('RCT_NEW_ARCH_ENABLED=1')
            gcc_defs << 'RCT_NEW_ARCH_ENABLED=1'
          end
          config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = gcc_defs
        end
      end
    end`
            );
            
            fs.writeFileSync(podfilePath, podfileContent);
            console.log(`✅ Successfully added TurboModule fixes to Podfile for ${llamaRnTargetName}`);
          } else {
            console.log(`✅ TurboModule fixes for ${llamaRnTargetName} already present in Podfile`);
          }
        } else {
          console.warn('❌ Could not find Podfile to patch for llama.rn fixes');
        }
        
      } catch (error) {
        console.error(`❌ Error applying llama.rn TurboModule fixes: ${error}`);
      }
      
      return config;
    },
  ]);
};

module.exports = withLlamaRnFix; // Ensure export name matches require in app.config.js 