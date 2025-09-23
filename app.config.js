// Export a function that receives the config from Expo
module.exports = ({ config }) => {
  // Set up plugins array if it doesn't exist
  if (!config.plugins) {
    config.plugins = [];
  }

  // Add expo-secure-store plugin
  config.plugins.push('expo-secure-store');

  return config;
};