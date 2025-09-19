const { withDangerousMod } = require('@expo/config-plugins');
const { execSync } = require('child_process');
const path = require('path');

module.exports = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const scriptPath = path.join(projectRoot, 'scripts', 'setup-llama-rn.js');
      
      console.log('[withLlamaSetup] Running llama.rn setup...');
      
      try {
        // Run the setup script
        execSync(`node "${scriptPath}"`, {
          stdio: 'inherit',
          cwd: projectRoot
        });
        console.log('[withLlamaSetup] llama.rn setup completed');
      } catch (error) {
        console.error('[withLlamaSetup] Error running llama.rn setup:', error.message);
        // Don't throw - let the build continue
      }
      
      return config;
    },
  ]);
};