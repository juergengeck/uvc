// @ts-check
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Plugin to fix C++ header conflicts and namespace issues in iOS builds.
 * This addresses common problems with JSI and C++ standard library headers.
 */
const withModuleCompat = (config) => {
  // First create the compatibility headers
  const withCompatHeaders = withDangerousMod(config, [
    'ios',
    async (config) => {
      try {
        console.log('🔄 Applying C++ header compatibility fixes...');
        
        const iosDir = path.join(config.modRequest.platformProjectRoot);
        const modulesDir = path.join(iosDir, 'ModuleHeaders');
        
        // Create a directory for our compatibility headers if it doesn't exist
        if (!fs.existsSync(modulesDir)) {
          fs.mkdirSync(modulesDir, { recursive: true });
        }
        
        // Create a compatibility header file that prevents C++ namespace conflicts
        const compatHeaderPath = path.join(modulesDir, 'CppCompat.h');
        const compatHeader = `#pragma once

// This header resolves C++ namespace conflicts in iOS builds

#ifdef __cplusplus

// Ensure we have the right feature flags for libc++
#ifndef _LIBCPP_ENABLE_CXX17_REMOVED_FEATURES
#define _LIBCPP_ENABLE_CXX17_REMOVED_FEATURES 1
#endif

#ifndef _LIBCPP_HAS_NO_INCOMPLETE_FORMAT
#define _LIBCPP_HAS_NO_INCOMPLETE_FORMAT 1
#endif

#ifndef _LIBCPP_AVAILABILITY_CUSTOM_VECTOR_BOOL_SPECIALIZATION
#define _LIBCPP_AVAILABILITY_CUSTOM_VECTOR_BOOL_SPECIALIZATION 1
#endif

// Prevent the conflict with std:: namespace by using a comprehensive approach
// Rather than trying to redefine individual symbols, we'll use proper namespace qualifications

// First, ensure JSI_EXPORT is properly defined
#ifndef JSI_EXPORT
#define JSI_EXPORT __attribute__((visibility("default")))
#endif

// Force fully qualified std namespace for problematic symbols
namespace facebook {
namespace jsi {
    // Import necessary std:: symbols directly
    using ::std::hash;
    using ::std::equal_to;
    using ::std::allocator;
    using ::std::is_same;
    namespace std {
        // Properly redirect std:: within facebook::jsi::std to ::std
        namespace chrono = ::std::chrono;
        using ::std::strong_ordering;
        using ::std::__type_identity_t;
        using ::std::__check_valid_allocator;
    }
}
}

// Add clear namespace isolation for std
namespace std {
    // Prevent conflicts by explicitly defining that we're in the global std namespace
    inline namespace _LIBCPP_ABI_NAMESPACE {
        // No implementations needed, just declarations to prevent ambiguity
    }
}

#endif // __cplusplus
`;
        
        fs.writeFileSync(compatHeaderPath, compatHeader);
        console.log(`✅ Created C++ compatibility header at ${compatHeaderPath}`);
        
        // Update Podfile to use the compatibility header
        const podfilePath = path.join(iosDir, 'Podfile');
        if (fs.existsSync(podfilePath)) {
          let podfileContent = fs.readFileSync(podfilePath, 'utf8');
          
          // Only add the fix if it's not already there
          if (!podfileContent.includes('# C++ compatibility header fix')) {
            console.log('✏️ Adding C++ compatibility fixes to Podfile');
            
            // Create a precompiled header for React targets
            const pchPath = path.join(modulesDir, 'ReactCppCompat.pch');
            const pchContent = `// Precompiled header for React modules
#ifdef __cplusplus
#include "${modulesDir}/CppCompat.h"
#include <jsi/jsi.h>
#endif
`;
            fs.writeFileSync(pchPath, pchContent);
            
            // Add our fix to the post_install block
            podfileContent = podfileContent.replace(
              /post_install do \|installer\|/,
              `post_install do |installer|
    # C++ compatibility header fix
    installer.pods_project.targets.each do |target|
      # Apply to any C++ code that might include JSI or STD headers
      cpp_targets = ['React-jsi', 'React-jsinspector', 'React-hermes', 'hermes-engine', 
                    'React-cxxreact', 'React-runtimescheduler', 'React-graphics', 
                    'React-rendererdebug', 'React-callinvoker', 'React-bridging']
                    
      if cpp_targets.include?(target.name) || target.name.start_with?('React')
        target.build_configurations.each do |config|
          # Add C++17 compatibility flags
          config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
          
          # Add our compatibility header as a prefix header - this ensures it's included first
          config.build_settings['GCC_PREFIX_HEADER'] = "\${PODS_ROOT}/../../ios/ModuleHeaders/ReactCppCompat.pch"
          
          # Add C++ preprocessor flags for better compatibility
          cpp_flags = [
            '-D_LIBCPP_ENABLE_CXX17_REMOVED_FEATURES=1',
            '-D_LIBCPP_HAS_NO_INCOMPLETE_FORMAT=1', 
            '-D_LIBCPP_AVAILABILITY_CUSTOM_VECTOR_BOOL_SPECIALIZATION=1',
            '-DFOLLY_NO_CONFIG',
            '-DFOLLY_MOBILE=1',
            '-DFOLLY_USE_LIBCPP=1',
            '-DFOLLY_CFG_NO_COROUTINES=1'
          ]
          
          # Join the flags and add to both C and C++ flags
          cpp_flags_str = cpp_flags.join(' ')
          
          # Add to C++ flags
          if config.build_settings['OTHER_CPLUSPLUSFLAGS']
            config.build_settings['OTHER_CPLUSPLUSFLAGS'] += ' ' + cpp_flags_str
          else
            config.build_settings['OTHER_CPLUSPLUSFLAGS'] = '$(inherited) ' + cpp_flags_str
          end
          
          # Add to C flags too for mixed source files
          if config.build_settings['OTHER_CFLAGS']
            config.build_settings['OTHER_CFLAGS'] += ' ' + cpp_flags_str
          else
            config.build_settings['OTHER_CFLAGS'] = '$(inherited) ' + cpp_flags_str
          end
        end
      end
    end`
            );
            
            fs.writeFileSync(podfilePath, podfileContent);
            console.log('✅ Successfully added C++ compatibility fixes to Podfile');
          } else {
            console.log('✅ C++ compatibility fixes already present in Podfile');
          }
        }
        
        return config;
      } catch (error) {
        console.error('❌ Error applying C++ compatibility fixes:', error);
        return config;
      }
    },
  ]);
  
  // Then apply plugin to copy headers to React-Core
  return copyCompatToReactCore(withCompatHeaders);
};

// Copy our compatibility header to React-Core headers directory
// This ensures it can be directly included by React Native source
const copyCompatToReactCore = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const compatHeaderPath = path.join(projectRoot, 'ios', 'ModuleHeaders', 'CppCompat.h');
      
      if (fs.existsSync(compatHeaderPath)) {
        const reactCorePath = path.join(projectRoot, 'node_modules', 'react-native', 'ReactCommon');
        
        if (fs.existsSync(reactCorePath)) {
          const jsiPath = path.join(reactCorePath, 'jsi');
          
          if (fs.existsSync(jsiPath)) {
            const destPath = path.join(jsiPath, 'CppCompat.h');
            fs.copyFileSync(compatHeaderPath, destPath);
            console.log(`✅ Copied compatibility header to ${destPath}`);
            
            // Also modify jsi.h to include our compatibility header
            const jsiHeaderPath = path.join(jsiPath, 'jsi.h');
            if (fs.existsSync(jsiHeaderPath)) {
              let jsiContent = fs.readFileSync(jsiHeaderPath, 'utf8');
              
              // Only add if not already included
              if (!jsiContent.includes('#include "CppCompat.h"')) {
                // Add our header before any other includes
                jsiContent = jsiContent.replace(
                  '#pragma once', 
                  '#pragma once\n\n#ifdef __cplusplus\n#include "CppCompat.h"\n#endif\n'
                );
                
                fs.writeFileSync(jsiHeaderPath, jsiContent);
                console.log(`✅ Updated ${jsiHeaderPath} to include compatibility header`);
              }
            }
          }
        }
      }
      
      return config;
    }
  ]);
};

module.exports = withModuleCompat; 