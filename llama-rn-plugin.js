const { withPlugins, withDangerousMod, withPodfileProperties } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

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
    console.log(`[llama-rn-plugin] Adding required dependencies for llama-rn...`);
    config.modResults = addPodDependencies(config.modResults, 'llama-rn', [
      { name: 'React-jsi' }, 
      { name: 'ReactCommon/turbomodule/core' },
      { name: 'React-jsiexecutor' },
      { name: 'React-Core' }
    ]);
    console.log(`[llama-rn-plugin] Dependencies added.`);
    return config;
  });
};

const withLlamaRnPlist = config => {
  // Add necessary permissions for llama.rn
  if (!config.ios) config.ios = {};
  if (!config.ios.infoPlist) config.ios.infoPlist = {};
  config.ios.infoPlist.UIFileSharingEnabled = true;
  console.log(`[llama-rn-plugin] Added UIFileSharingEnabled to Info.plist.`);
  return config;
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
          console.log(`[llama-rn-plugin] Added RNLlama import to AppDelegate.mm`);
        } else {
          console.log(`[llama-rn-plugin] RNLlama import already exists in AppDelegate.mm`);
        }
      } 
      // Skip Swift modifications - RNLlama module isn't available in Swift
      else if (fs.existsSync(appDelegateSwiftPath)) {
        console.log(`[llama-rn-plugin] Found AppDelegate.swift - skipping direct import as module isn't available in Swift`);
      } else {
        console.log(`[llama-rn-plugin] Warning: Neither AppDelegate.mm nor AppDelegate.swift found at expected paths`);
      }
      
      return config;
    }
  ]);
};

const withLlamaRnPlugin = (config) => {
  // Chain the plugins
  return withPlugins(config, [
    withLlamaRnPlist,     // Add plist entries
    withLlamaRnDeps,      // Add pod dependencies
    withLlamaRnAppDelegate // Add AppDelegate modifications
  ]);
};

module.exports = withLlamaRnPlugin; 