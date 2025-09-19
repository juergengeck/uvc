/**
 * Expo config plugin to modify AppDelegate.swift to use Expo instead of ExpoModulesCore
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Modifies the AppDelegate.swift file to use Expo instead of 'ExpoModulesCore' import
 */
const withAppDelegateModification = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const appName = config.modRequest.projectName || 'lamaone';
      const appDelegatePath = path.join(projectRoot, 'ios', appName, 'AppDelegate.swift');

      console.log(`Directly modifying AppDelegate at ${appDelegatePath}`);

      if (!fs.existsSync(appDelegatePath)) {
        console.warn(`AppDelegate.swift not found at ${appDelegatePath}`);
        return config;
      }

      // Read the AppDelegate file
      let appDelegateContents = fs.readFileSync(appDelegatePath, 'utf8');

      // Replace import statement
      const modifiedContents = appDelegateContents.replace(
        'import ExpoModulesCore',
        'import Expo'
      );

      // Write the modified AppDelegate back
      fs.writeFileSync(appDelegatePath, modifiedContents);
      console.log('Modified AppDelegate.swift to use Expo');

      return config;
    },
  ]);
};

module.exports = withAppDelegateModification; 