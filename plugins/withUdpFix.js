const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * This plugin applies C++17 and other necessary build settings for UDPModule and UDPDirectModule.
 */
const withUdpFix = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      try {
        console.log('🔄 Setting up TurboModule fixes for UDPModule and UDPDirectModule');
        
        const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
        
        if (fs.existsSync(podfilePath)) {
          let podfileContent = fs.readFileSync(podfilePath, 'utf8');
          
          const udpTargets = ['UDPModule', 'UDPDirectModule'];
          const hookMarker = '# Fix TurboModule C++ settings for UDP Modules';

          if (!podfileContent.includes(hookMarker)) {
            console.log(`✏️ Adding C++ fixes to Podfile for UDP modules`);
            
            let newHookContent = `post_install do |installer|\n    ${hookMarker}\n`;
            udpTargets.forEach(targetName => {
              newHookContent += `    installer.pods_project.targets.each do |target|\n`;
              newHookContent += `      if target.name == '${targetName}'\n`;
              newHookContent += `        target.build_configurations.each do |config|\n`;
              newHookContent += `          config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'\n`;
              newHookContent += `          config.build_settings['CLANG_CXX_LIBRARY'] = 'libc++'\n`;
              newHookContent += `          
`;
              newHookContent += `          # Add C++17 compatibility flags\n`;
              newHookContent += `          cpp_flags_current = config.build_settings['OTHER_CPLUSPLUSFLAGS'] || []
`;
              newHookContent += `          cpp_flags_to_add = ['$(inherited)', '-D_LIBCPP_ENABLE_CXX17_REMOVED_FEATURES=1', '-D_LIBCPP_HAS_NO_INCOMPLETE_FORMAT', '-D_LIBCPP_AVAILABILITY_CUSTOM_VECTOR_BOOL_SPECIALIZATION']
`;
              newHookContent += `          if cpp_flags_current.is_a?(String)
`;
              newHookContent += `            existing_flags_array = cpp_flags_current.split(' ')
`;
              newHookContent += `            config.build_settings['OTHER_CPLUSPLUSFLAGS'] = existing_flags_array.uniq + cpp_flags_to_add.reject { |f| existing_flags_array.include?(f) }
`;
              newHookContent += `          elsif cpp_flags_current.is_a?(Array)
`;
              newHookContent += `            config.build_settings['OTHER_CPLUSPLUSFLAGS'] = cpp_flags_current.uniq + cpp_flags_to_add.reject { |f| cpp_flags_current.include?(f) }
`;
              newHookContent += `          else
`;
              newHookContent += `            config.build_settings['OTHER_CPLUSPLUSFLAGS'] = cpp_flags_to_add
`;
              newHookContent += `          end\n`;
              newHookContent += `          
`;
              newHookContent += `          # Enable TurboModule architecture flags\n`;
              newHookContent += `          gcc_defs_current = config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] || []
`;
              newHookContent += `          gcc_defs_to_add = ['$(inherited)', 'RCT_NEW_ARCH_ENABLED=1']
`;
              newHookContent += `          if gcc_defs_current.is_a?(String)
`;
              newHookContent += `            existing_defs_array = gcc_defs_current.split(' ')
`;
              newHookContent += `            config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = existing_defs_array.uniq + gcc_defs_to_add.reject { |f| existing_defs_array.include?(f) }
`;
              newHookContent += `          elsif gcc_defs_current.is_a?(Array)
`;
              newHookContent += `            config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = gcc_defs_current.uniq + gcc_defs_to_add.reject { |f| gcc_defs_current.include?(f) }
`;
              newHookContent += `          else
`;
              newHookContent += `            config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = gcc_defs_to_add
`;
              newHookContent += `          end\n`;
              newHookContent += `        end\n`;
              newHookContent += `      end\n`;
              newHookContent += `    end\n`;
            });

            // Ensure the new hook content is correctly injected or appended.
            if (podfileContent.includes("post_install do |installer|")) {
                 // If a post_install hook already exists, find the end of its first target.each loop to append our settings.
                 const postInstallMatch = podfileContent.match(/(post_install do \|installer\|.*?end\n)/ms);
                 if (postInstallMatch && postInstallMatch[1]) {
                    let existingHook = postInstallMatch[1];
                    // Add our target iteration code within the existing post_install hook
                    const insertionMarker = "installer.pods_project.targets.each do |target|";
                    if (existingHook.includes(insertionMarker)) {
                        // Find the first occurrence of the target loop and insert our code after it
                        const firstTargetLoopEnd = existingHook.indexOf(insertionMarker) + existingHook.substring(existingHook.indexOf(insertionMarker)).indexOf("end") + "end".length;
                        existingHook = existingHook.slice(0, firstTargetLoopEnd) + "\n" + newHookContent.substring(newHookContent.indexOf(hookMarker)) + existingHook.slice(firstTargetLoopEnd);
                        podfileContent = podfileContent.replace(postInstallMatch[1], existingHook);
                    } else {
                         // If no target.each loop, append to the start of post_install content
                        existingHook = existingHook.replace("post_install do |installer|", newHookContent.substring(0, newHookContent.lastIndexOf("end")) );
                        podfileContent = podfileContent.replace(postInstallMatch[1], existingHook);
                    }
                 } else {
                    // Fallback if regex fails or structure is unexpected: append new hook
                    podfileContent += `\n\n${newHookContent}end\n`;
                 }
            } else {
                podfileContent += `\n\n${newHookContent}end\n`;
            }
            
            fs.writeFileSync(podfilePath, podfileContent);
            console.log(`✅ Successfully added C++ fixes to Podfile for UDP modules`);
          } else {
            console.log(`✅ C++ fixes for UDP modules already present in Podfile`);
          }
        } else {
          console.warn('❌ Could not find Podfile to patch for UDP module fixes');
        }
        
      } catch (error) {
        console.error(`❌ Error applying UDP module C++ fixes: ${error}`);
      }
      
      return config;
    },
  ]);
};

module.exports = withUdpFix; 