/**
 * Expo config plugin to ensure the Expo pod is properly included
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Add the Expo pod to the Podfile
 */
const withExpoPod = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      console.log('Ensuring Expo pod is included...');
      
      const projectRoot = config.modRequest.projectRoot;
      const iosDir = path.join(projectRoot, 'ios');
      const podfilePath = path.join(iosDir, 'Podfile');
      
      if (!fs.existsSync(podfilePath)) {
        console.warn('Podfile not found');
        return config;
      }
      
      let podfileContent = fs.readFileSync(podfilePath, 'utf8');
      
      // Check if Expo pod is already included
      if (podfileContent.includes("pod 'Expo',")) {
        console.log('Expo pod already included in Podfile');
        return config;
      }
      
      // Find the target line
      const targetMatch = podfileContent.match(/target\s+['"]\w+['"]\s+do/);
      if (!targetMatch) {
        console.warn('Could not find target line in Podfile');
        return config;
      }
      
      const insertPos = podfileContent.indexOf('\n', targetMatch.index) + 1;
      
      // Add the Expo pod - make sure it's before any use_expo_modules! call
      const expoPodEntry = "  pod 'Expo', :path => '../node_modules/expo'\n\n";
      
      // Insert at the beginning of the target block
      podfileContent = 
        podfileContent.slice(0, insertPos) + 
        expoPodEntry +
        podfileContent.slice(insertPos);
      
      // Write updated Podfile
      fs.writeFileSync(podfilePath, podfileContent);
      console.log('Added Expo pod to Podfile');
      
      return config;
    },
  ]);
};

module.exports = withExpoPod; 