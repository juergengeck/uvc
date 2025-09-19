const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * withRCTDeprecationPod
 *
 * Adds the RCTDeprecation pod from React Native to the Podfile with proper module
 * settings to ensure Swift can import it correctly.
 *
 * The key aspects of this plugin:
 * 1. Adds the RCTDeprecation pod with modular_headers = true
 * 2. Sets DEFINES_MODULE = YES in post_install to ensure module map generation
 * 3. Sets proper SWIFT_INCLUDE_PATHS to ensure the module can be found
 */
module.exports = function withRCTDeprecationPod(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const iosDir = config.modRequest.platformProjectRoot;
      const podfilePath = path.join(iosDir, 'Podfile');
      let content = fs.readFileSync(podfilePath, 'utf8');

      // Check if the RCTDeprecation pod entry already exists
      if (content.includes("pod 'RCTDeprecation'") || content.includes('RCTDeprecation.podspec')) {
        console.log('✅ RCTDeprecation pod already exists in Podfile - no changes needed by withRCTDeprecationPod plugin.');
      } else {
        // Locate 'use_expo_modules!' line to insert immediately after
        const expoModulesRegex = /(use_expo_modules![^\n]*\n)/;
        const match = content.match(expoModulesRegex);
        let insertIndex;
        
          if (match) {
          insertIndex = content.indexOf(match[0]) + match[0].length;
        } else {
          // Try alternative insertion points
          const targetRegex = /target ['"].*['"] do\s*\n/;
          const targetMatch = content.match(targetRegex);
          if (targetMatch) {
            insertIndex = content.indexOf(targetMatch[0]) + targetMatch[0].length;
          }
        }
        
        if (insertIndex) {
          // Add the pod with modular_headers=true, which helps with module map generation
        const podLine = "  pod 'RCTDeprecation', :path => '../node_modules/react-native/ReactApple/Libraries/RCTFoundation/RCTDeprecation', :modular_headers => true\n";
        
        content = content.slice(0, insertIndex) + podLine + content.slice(insertIndex);
        
          fs.writeFileSync(podfilePath, content);
          console.log('✅ Added RCTDeprecation pod to Podfile with modular_headers=true.');
        } else {
          console.warn('⚠️ Could not find use_expo_modules! line, RCTDeprecation pod not added by withRCTDeprecationPod plugin.');
        }
      }

      // Update or add post_install hook
      const postInstallBlock = `
  # Ensure proper module map generation for RCTDeprecation
  installer.pods_project.targets.each do |target|
    if target.name == 'RCTDeprecation'
      target.build_configurations.each do |config|
        # Ensure the module is properly defined for Swift
        config.build_settings['DEFINES_MODULE'] = 'YES'
        
        # Set proper header search paths
        header_search_paths = config.build_settings['HEADER_SEARCH_PATHS'] || '$(inherited)'
        unless header_search_paths.include?('${PODS_ROOT}/Headers/Public/RCTDeprecation')
          config.build_settings['HEADER_SEARCH_PATHS'] = header_search_paths + ' ${PODS_ROOT}/Headers/Public/RCTDeprecation'
        end
        
        # Ensure Swift can find the module
        swift_include_paths = config.build_settings['SWIFT_INCLUDE_PATHS'] || '$(inherited)'
        unless swift_include_paths.include?('${PODS_ROOT}/Headers/Public')
          config.build_settings['SWIFT_INCLUDE_PATHS'] = swift_include_paths + ' ${PODS_ROOT}/Headers/Public'
        end
      end
    end
    
    # Also update the app target to ensure it can find the module
    if target.name == 'lamaone'
      target.build_configurations.each do |config|
        # Add module map directory to Swift include paths
        swift_include_paths = config.build_settings['SWIFT_INCLUDE_PATHS'] || '$(inherited)'
        unless swift_include_paths.include?('${PODS_ROOT}/Headers/Public')
          config.build_settings['SWIFT_INCLUDE_PATHS'] = swift_include_paths + ' ${PODS_ROOT}/Headers/Public'
        end
        
        # Enable modules for C and Objective-C
        config.build_settings['CLANG_ENABLE_MODULES'] = 'YES'
        
        # Ensure module maps are used
        config.build_settings['CLANG_ENABLE_MODULE_MAPS'] = 'YES'
      end
    end
  end`;

      // Check if there's an existing post_install hook
      const postInstallRegex = /(post_install\s+do\s+\|installer\|\s+)([^e]*)(end)/m;
      const postInstallMatch = content.match(postInstallRegex);

      if (postInstallMatch) {
        // Add our code to the existing post_install block
        const newPostInstallContent = postInstallMatch[1] + postInstallMatch[2] + postInstallBlock + "\n  " + postInstallMatch[3];
        content = content.replace(postInstallRegex, newPostInstallContent);
      } else {
        // Add a new post_install block
        content += `\npost_install do |installer|${postInstallBlock}\nend\n`;
      }

      fs.writeFileSync(podfilePath, content);
      console.log('✅ Updated post_install hook to properly configure RCTDeprecation module.');

      return config;
    },
  ]);
}; 