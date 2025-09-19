const { withRNDeprecationFix, withPodfileFixForFrameworkIssues, withFollyCoroutinesFix } = require('./plugins');

// Export a function that receives the config from Expo
module.exports = ({ config }) => {
  // Set up plugins array if it doesn't exist
  if (!config.plugins) {
    config.plugins = [];
  }
  
  // Add Podfile fixes for framework issues
  config.plugins.push(withPodfileFixForFrameworkIssues);
  
  // Add the folly coroutine fix - critical for build to succeed
  config.plugins.push(withFollyCoroutinesFix);
  
  // Add expo-secure-store plugin
  config.plugins.push('expo-secure-store');
  
  return config;
}; 