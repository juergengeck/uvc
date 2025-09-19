// @ts-check

/**
 * Central export file for all Lama module plugins
 * This allows importing all plugins from a single location
 */

// Core plugins that handle basic functionality
const withLlamaFix = require('./withLlamaFix');
const withAppDelegateModification = require('./withAppDelegateModification');
const withModuleCompat = require('./withModuleCompat');
const withExpoPod = require('./withExpoPod');

// iOS native module plugins
const withRNDeprecationFix = require('./withRNDeprecationFix');
const withRCTDeprecationPod = require('./withRCTDeprecationPod');

// React Native integration plugins
const withLlamaRn = require('./withLlamaRn'); 
const withLlamaRnFabricBuildSettings = require('./withLlamaRnFabricBuildSettings');
const withPodfileFixForFrameworkIssues = require('./withPodfileFixForFrameworkIssues');
const withFollyCoroutinesFix = require('./withFollyCoroutinesFix');

// Import external plugins that haven't been moved yet
const withLlamaModuleDisable = require('../llama-module-disable-plugin');

// Export all plugins
module.exports = {
  // Core plugins
  withModuleCompat,
  withLlamaFix,
  withAppDelegateModification,
  withExpoPod,
  
  // iOS native module plugins
  withRNDeprecationFix,
  withRCTDeprecationPod,
  
  // React Native integration plugins  
  withLlamaRn,
  withLlamaRnFabricBuildSettings,
  withPodfileFixForFrameworkIssues,
  withFollyCoroutinesFix,
  
  // Legacy plugins (still need to be moved)
  withLlamaModuleDisable,
}; 