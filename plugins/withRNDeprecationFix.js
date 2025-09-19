const { createRunOncePlugin, withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const PLUGIN_NAME = "with-rn-deprecation-fix";

/**
 * Plugin to configure header search paths for UDP modules
 * 
 * Instead of patching macros, we simply ensure our modules can find
 * the headers they need through proper header search paths.
 */
const withRNDeprecationFix = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const platformRoot = config.modRequest.platformProjectRoot;
      
      console.log("🔄 Setting up modulemap imports and header search paths for RCTDeprecation");
      
      // 1. Create a direct modulemap import file that will be included in the bridging header
      const moduleMapImportDir = path.join(platformRoot, "modulemap-imports");
      if (!fs.existsSync(moduleMapImportDir)) {
        fs.mkdirSync(moduleMapImportDir, { recursive: true });
      }
      
      const moduleMapImportPath = path.join(moduleMapImportDir, "RCTDeprecationModuleImport.h");
      const moduleMapImportContent = `
/**
 * RCTDeprecationModuleImport.h
 * 
 * This file is used to make RCTDeprecation symbols visible to Swift by
 * including the umbrella header directly, which avoids depending on an
 * already-loaded module map in Xcode's precompiled headers.
 */
#pragma once

#import <RCTDeprecation/RCTDeprecation-umbrella.h>
`;
      
      fs.writeFileSync(moduleMapImportPath, moduleMapImportContent);
      console.log(`✅ Created module import helper at ${moduleMapImportPath}`);
      
      // 2. Find and modify the bridging header to include our import
      // Expo creates bridging header at ios/{appname}/{appname}-Bridging-Header.h
      const bridgingHeaderPath = path.join(platformRoot, "lamaone", "lamaone-Bridging-Header.h");
      
      if (fs.existsSync(bridgingHeaderPath)) {
        let bridgingHeaderContent = fs.readFileSync(bridgingHeaderPath, "utf8");
        
        // Only add the import if it doesn't already exist
        if (!bridgingHeaderContent.includes("RCTDeprecationModuleImport.h")) {
          // Add our module import to the top of the file
          // Path is relative to ios/lamaone/ so we need to go up one level
          bridgingHeaderContent = `// RCTDeprecation module import - added by withRNDeprecationFix plugin
#import "../../modulemap-imports/RCTDeprecationModuleImport.h"

${bridgingHeaderContent}`;
          
          fs.writeFileSync(bridgingHeaderPath, bridgingHeaderContent);
          console.log(`✅ Updated bridging header at ${bridgingHeaderPath}`);
        }
      } else {
        console.warn(`⚠️ Bridging header not found at ${bridgingHeaderPath}`);
      }
      
      // 3. Update the Podfile to ensure module maps are properly generated
      const podfilePath = path.join(platformRoot, "Podfile");
      let podfileContent = fs.readFileSync(podfilePath, "utf8");
      
      // Check if our RCTDeprecation fix is already in the Podfile
      if (!podfileContent.includes("RCTDeprecation Module Fix")) {
        console.log(`✏️ Adding RCTDeprecation moduleMap fix to Podfile`);
        
        // Create our enhanced fix code - simplified to avoid the pod_targets error
        const rctDeprecationFixCode = `
    # RCTDeprecation Module Fix
    installer.pods_project.targets.each do |target|
      target_name = target.name
      if ['UDPModule', 'UDPDirectModule', 'lamaone', 'RCTDeprecation'].include?(target_name)
        target.build_configurations.each do |config|
          # Add React Native's header search paths
          config.build_settings['HEADER_SEARCH_PATHS'] ||= '$(inherited)'
          additional_paths = "$(PODS_ROOT)/../node_modules/react-native/ReactCommon $(PODS_ROOT)/../node_modules/react-native/React $(PODS_ROOT)/../node_modules/react-native/ReactApple $(PODS_ROOT)/Headers/Public/RCTDeprecation"
          config.build_settings['HEADER_SEARCH_PATHS'] = "#{additional_paths} " + config.build_settings['HEADER_SEARCH_PATHS']
          
          # Ensure Swift can also find public headers when generating interface builder previews / storyboards
          config.build_settings['SWIFT_INCLUDE_PATHS'] ||= '$(inherited)'
          unless config.build_settings['SWIFT_INCLUDE_PATHS'].include?('$(PODS_ROOT)/Headers/Public')
            config.build_settings['SWIFT_INCLUDE_PATHS'] = config.build_settings['SWIFT_INCLUDE_PATHS'] + ' $(PODS_ROOT)/Headers/Public'
          end
          
          # Add flags to explicitly import module maps for Swift
          config.build_settings['OTHER_SWIFT_FLAGS'] ||= '$(inherited)'
          unless config.build_settings['OTHER_SWIFT_FLAGS'].include?('-Xcc -fmodule-map-file=$(PODS_ROOT)/Headers/Public/RCTDeprecation/RCTDeprecation.modulemap')
            config.build_settings['OTHER_SWIFT_FLAGS'] += ' -Xcc -fmodule-map-file=$(PODS_ROOT)/Headers/Public/RCTDeprecation/RCTDeprecation.modulemap'
          end
          
          # Make sure module maps are enabled
          config.build_settings['CLANG_ENABLE_MODULES'] = 'YES'
          
          # Use modular headers
          config.build_settings['USE_HEADERMAP'] = 'YES'
          
          # Always generate modules
          config.build_settings['DEFINES_MODULE'] = 'YES'
          
          if target_name == 'RCTDeprecation'
            # Force modulemap generation for the RCTDeprecation target
            config.build_settings['MODULEMAP_FILE'] = '$(PODS_ROOT)/Headers/Public/RCTDeprecation/RCTDeprecation.modulemap'
          end
          
          # Make sure we use the New Architecture for our UDP modules
          if ['UDPModule', 'UDPDirectModule'].include?(target_name)
            config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= '$(inherited)'
            config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] += ' RCT_NEW_ARCH_ENABLED=1'
          end
        end
      end
    end`;
        
        // Check if there's already a post_install hook
        if (podfileContent.includes("post_install do |installer|")) {
          // Append our code just before the closing 'end' of the first post_install block
          const postInstallBlockRegex = /(post_install[\s\S]*?end)/m;
          podfileContent = podfileContent.replace(postInstallBlockRegex, (matchBlock) => {
            // Insert our fix code before the trailing 'end' (ensure newline separation)
            return matchBlock.replace(/end\s*$/, `${rctDeprecationFixCode}\nend`);
          });
        } else {
          // No existing post_install hook, create one
          const fixCode = `
# RCTDeprecation Module Fix
post_install do |installer|
${rctDeprecationFixCode}
end
`;
          
          // Insert the fix right before the target block
          const targetPattern = /target ['"].*['"] do/;
          let insertIndex = podfileContent.search(targetPattern);
          if (insertIndex !== -1) {
            podfileContent = podfileContent.slice(0, insertIndex) + fixCode + podfileContent.slice(insertIndex);
          } else {
            console.warn(`⚠️ Could not find target section in Podfile, fix not applied`);
            return config;
          }
        }
        
        // Add RCTDeprecation pod with modular_headers enabled
        if (!podfileContent.includes("pod 'RCTDeprecation', :modular_headers => true")) {
          const podMatch = podfileContent.match(/use_react_native\s*!\s*\(/);
          if (podMatch) {
            const podIndex = podMatch.index;
            const insertPodLine = "  pod 'RCTDeprecation', :path => '../node_modules/react-native/ReactApple/Libraries/RCTFoundation/RCTDeprecation', :modular_headers => true\n  ";
            podfileContent = podfileContent.slice(0, podIndex) + insertPodLine + podfileContent.slice(podIndex);
          }
        }
        
        // Save the updated Podfile
        fs.writeFileSync(podfilePath, podfileContent);
        console.log(`✅ Successfully updated Podfile with RCTDeprecation moduleMap fix`);
      } else {
        console.log(`✅ RCTDeprecation moduleMap fix already present in Podfile`);
      }
      
      return config;
    },
  ]);
};

module.exports = createRunOncePlugin(withRNDeprecationFix, PLUGIN_NAME, "1.0.0"); 