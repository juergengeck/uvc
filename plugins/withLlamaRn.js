const { withPlugins, withDangerousMod, withPodfileProperties } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

/**
 * Expo config plugin for Llama RN integration
 * Handles proper setup and configuration for the llama-rn package
 */

// Function to add dependencies to a specific pod target
const addPodDependencies = (podfileProperties, podName, dependencies) => {
  if (!podfileProperties['podDependencies.json']) {
    podfileProperties['podDependencies.json'] = {};
  }
  const currentDeps = podfileProperties['podDependencies.json'][podName] || [];
  const newDeps = [...currentDeps];
  dependencies.forEach(dep => {
    if (!newDeps.some(existingDep => existingDep.name === dep.name)) {
      newDeps.push(dep);
    }
  });
  podfileProperties['podDependencies.json'][podName] = newDeps;
  return podfileProperties;
};

const withLlamaRnDeps = (config) => {
  return withPodfileProperties(config, (config) => {
    console.log(`[llama-rn] Adding required dependencies for llama-rn...`);
    config.modResults = addPodDependencies(config.modResults, 'llama-rn', [
      { name: 'React-jsi' }, 
      { name: 'ReactCommon/turbomodule/core' },
      { name: 'React-jsiexecutor' },
      { name: 'React-Core' }
    ]);
    console.log(`[llama-rn] Dependencies added.`);
    return config;
  });
};

const withLlamaRnPlist = config => {
  // Add necessary permissions for llama.rn
  if (!config.ios) config.ios = {};
  if (!config.ios.infoPlist) config.ios.infoPlist = {};
  config.ios.infoPlist.UIFileSharingEnabled = true;
  console.log(`[llama-rn] Added UIFileSharingEnabled to Info.plist.`);
  return config;
};

// Create prefix header for llama-rn
const withLlamaRnPrefixHeader = config => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const prefixHeaderDir = path.join(config.modRequest.platformProjectRoot, 'prefix-headers');
      if (!fs.existsSync(prefixHeaderDir)) {
        fs.mkdirSync(prefixHeaderDir, { recursive: true });
      }
      
      // Create prefix header content
      const llamaPrefixHeader = path.join(prefixHeaderDir, 'RNLlama-prefix.pch');
      const prefixContent = `
// RNLlama-prefix.pch
// Prefix header to handle missing dependencies

#ifndef RNLlama_prefix_pch
#define RNLlama_prefix_pch

// Handle missing RCTDeprecation.h - define empty macros
#ifndef RCT_DEPRECATED
#define RCT_DEPRECATED(...)
#endif

#ifndef RCT_EXTERN_MODULE
#define RCT_EXTERN_MODULE(...)
#endif

// Standard C++ headers
#ifdef __cplusplus
#include <functional>
#include <cassert>
#include <memory>
#include <vector>
#include <string>
#endif

#endif /* RNLlama_prefix_pch */
`;
      fs.writeFileSync(llamaPrefixHeader, prefixContent);
      console.log(`[llama-rn] Created prefix header at ${llamaPrefixHeader}`);
      
      // Also update podspec settings via post_install hook in Podfile
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      
      if (fs.existsSync(podfilePath)) {
        let podfileContent = fs.readFileSync(podfilePath, 'utf8');
        
        // See if we need to add the prefix header configuration
        if (!podfileContent.includes('GCC_PREFIX_HEADER') || !podfileContent.includes('RNLlama-prefix.pch')) {
          // Look for post_install do |installer| section
          if (podfileContent.includes('post_install do |installer|')) {
            // Add our specific configuration inside the existing post_install hook
            podfileContent = podfileContent.replace(
              /post_install do \|installer\|([\s\S]*?)end/m,
              (match, content) => {
                if (content.includes("target.name == 'llama-rn'")) {
                  // Already contains specific target settings, update them
                  return match.replace(
                    /if target\.name == 'llama-rn'([\s\S]*?)end/m,
                    `if target.name == 'llama-rn'
            config.build_settings['GCC_PREFIX_HEADER'] = '${PODS_ROOT}/../../prefix-headers/RNLlama-prefix.pch'
            config.build_settings['GCC_PRECOMPILE_PREFIX_HEADER'] = 'YES'
            # Enable C++17
            config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
$1end`
                  );
                } else {
                  // Add new target.name condition
                  return `post_install do |installer|${content}
        
        # Add prefix header for llama-rn
        if target.name == 'llama-rn'
          config.build_settings['GCC_PREFIX_HEADER'] = '${PODS_ROOT}/../../prefix-headers/RNLlama-prefix.pch'
          config.build_settings['GCC_PRECOMPILE_PREFIX_HEADER'] = 'YES'
          # Enable C++17
          config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
        end
      end`;
                }
              }
            );
          } else {
            // No post_install hook, add one
            podfileContent += `

# Handle llama-rn build settings
post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      # Add prefix header for llama-rn
      if target.name == 'llama-rn'
        config.build_settings['GCC_PREFIX_HEADER'] = '${PODS_ROOT}/../../prefix-headers/RNLlama-prefix.pch'
        config.build_settings['GCC_PRECOMPILE_PREFIX_HEADER'] = 'YES'
        # Enable C++17
        config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
      end
    end
  end
end`;
          }
          
          fs.writeFileSync(podfilePath, podfileContent);
          console.log("[llama-rn] Updated Podfile with prefix header settings");
        }
      }
      
      return config;
    }
  ]);
};

// Add a dangerous mod to ensure proper implementation registration in AppDelegate
const withLlamaRnAppDelegate = config => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const { projectRoot } = config.modRequest;
      // Check for both AppDelegate.mm and AppDelegate.swift
      const appDelegateMMPath = path.join(projectRoot, 'ios', config.modRequest.projectName, 'AppDelegate.mm');
      const appDelegateSwiftPath = path.join(projectRoot, 'ios', config.modRequest.projectName, 'AppDelegate.swift');
      
      // Handle MM implementation (Objective-C)
      if (fs.existsSync(appDelegateMMPath)) {
        let appDelegateContent = fs.readFileSync(appDelegateMMPath, 'utf8');
        
        // Check if we've already added our import
        if (!appDelegateContent.includes('#import <llama-rn/RNLlama.h>')) {
          // Add RNLlama import near other imports
          appDelegateContent = appDelegateContent.replace(
            '#import "AppDelegate.h"',
            '#import "AppDelegate.h"\n#import <llama-rn/RNLlama.h>'
          );
          
          fs.writeFileSync(appDelegateMMPath, appDelegateContent);
          console.log(`[llama-rn] Added RNLlama import to AppDelegate.mm`);
        } else {
          console.log(`[llama-rn] RNLlama import already exists in AppDelegate.mm`);
        }
      } 
      // Skip Swift modifications - RNLlama module isn't available in Swift
      else if (fs.existsSync(appDelegateSwiftPath)) {
        console.log(`[llama-rn] Found AppDelegate.swift - skipping direct import as module isn't available in Swift`);
      } else {
        console.log(`[llama-rn] Warning: Neither AppDelegate.mm nor AppDelegate.swift found at expected paths`);
      }
      
      return config;
    }
  ]);
};

/**
 * Plugin that configures llama-rn package for use with the app
 */
const withLlamaRn = (config) => {
  // Chain the plugins
  return withPlugins(config, [
    withLlamaRnPlist,        // Add plist entries
    withLlamaRnDeps,         // Add pod dependencies
    withLlamaRnPrefixHeader, // Add prefix header
    withLlamaRnAppDelegate   // Add AppDelegate modifications
  ]);
};

module.exports = withLlamaRn; 