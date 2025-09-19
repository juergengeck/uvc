// Plugin to temporarily disable llama.rn module to avoid duplicate header files
module.exports = function withLlamaDisabled(config) {
  // Make sure we have a plugin array
  if (!config.plugins) {
    config.plugins = [];
  }

  // Remove llama.rn from autolinking
  if (!config.modResults) {
    config.modResults = {};
  }
  
  // We're just returning the unmodified config
  // This is a placeholder for future use if needed
  return config;
}; 