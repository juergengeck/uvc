// @ts-check

const { withPlugins } = require("expo/config-plugins");
const { 
  withPodfileFixForFrameworkIssues,
  withUdpHeaderPaths,
  withLlamaRnFabricBuildSettings,
  withRCTDeprecationPod
} = require('./plugins');

/**
 * Additional plugin configuration for specialized tasks
 * Most core plugins are applied directly in app.config.js
 * @type {import('expo/config-plugins').ConfigPlugin}
 */
const config = (expoConfig) => {
  return withPlugins(expoConfig, [
    // Fix iOS framework issues
    withPodfileFixForFrameworkIssues,
    
    // Add UDP header paths
    withUdpHeaderPaths,
    
    // Add Llama RN fabric build settings
    withLlamaRnFabricBuildSettings,
    
    // Add RCTDeprecation pod and modulemap
    withRCTDeprecationPod
  ]);
};

module.exports = config; 