/**
 * Expo config plugin for UDP module
 * 
 * This plugin handles the integration of the UDPModule with the React Native app.
 * It copies the UDPModule from ios-custom-modules/UDPModule to the iOS project
 * and sets it up as a local pod.
 */

const fs = require('fs');
const path = require('path');
const { withDangerousMod, withAppDelegate, withPodfile } = require('@expo/config-plugins');

// Module configuration
const MODULE_NAME = 'UDPModule';
const SOURCE_DIR_RELATIVE_TO_PROJECT_ROOT = path.join('ios-custom-modules', MODULE_NAME);
const DEST_DIR_RELATIVE_TO_IOS_DIR = MODULE_NAME; // Place it in ios/UDPModule

/**
 * Helper function to recursively copy a directory
 */
const copyDirRecursive = (srcDir, destDir) => {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log(`[UDPModule] Copied ${srcPath} to ${destPath}`);
    }
  }
};

/**
 * Copy the UDPModule source files to the iOS project
 */
const withUDPModuleIOSSources = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const sourceDir = path.join(projectRoot, SOURCE_DIR_RELATIVE_TO_PROJECT_ROOT);
      const destDir = path.join(projectRoot, 'ios', DEST_DIR_RELATIVE_TO_IOS_DIR);

      console.log(`[UDPModule] Source directory: ${sourceDir}`);
      console.log(`[UDPModule] Destination directory: ${destDir}`);

      if (!fs.existsSync(sourceDir)) {
        console.warn(`[UDPModule] Source directory ${sourceDir} not found. Skipping file copy.`);
        return config;
      }

      // Create destination directory if it doesn't exist
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      // Copy all module files including subdirectories
      const filesToCopy = fs.readdirSync(sourceDir, { withFileTypes: true });
      for (const entry of filesToCopy) {
        const srcFile = path.join(sourceDir, entry.name);
        
        if (entry.isDirectory()) {
          // Handle subdirectories recursively (especially Fix directory)
          const destSubDir = path.join(destDir, entry.name);
          copyDirRecursive(srcFile, destSubDir);
          console.log(`[UDPModule] Copied directory ${entry.name} recursively`);
        } else {
          const destFile = path.join(destDir, entry.name);
          fs.copyFileSync(srcFile, destFile);
          console.log(`[UDPModule] Copied ${entry.name} to ${destFile}`);
        }
      }

      // Also copy the global compat.h file which is needed by multiple modules
      const compatSrc = path.join(projectRoot, 'ios-custom-modules', 'compat.h');
      const compatDest = path.join(projectRoot, 'ios', 'compat.h');
      if (fs.existsSync(compatSrc)) {
        fs.copyFileSync(compatSrc, compatDest);
        console.log(`[UDPModule] Copied global compat.h to ${compatDest}`);
      }

      // Verify the Fix directory and its contents
      const fixDir = path.join(destDir, 'Fix');
      if (!fs.existsSync(fixDir)) {
        console.warn(`[UDPModule] Fix directory is missing in ${destDir}. Import errors may occur.`);
      } else {
        const fixFiles = ['UDPSocketManagerDelegate.h', 'UDPModule+Delegate.h'];
        for (const file of fixFiles) {
          if (!fs.existsSync(path.join(fixDir, file))) {
            console.warn(`[UDPModule] Fix/${file} is missing in ${fixDir}. Import errors may occur.`);
          }
        }
      }

      return config;
    }
  ]);
};

/**
 * Add UDPModule to the Podfile
 */
const withUDPModulePod = (config) => {
  return withPodfile(config, (podfileConfig) => {
    const podName = 'UDPModule';
    const podPath = `./${DEST_DIR_RELATIVE_TO_IOS_DIR}`; // Relative to Podfile (ios/)
    const podLine = `  pod '${podName}', :path => '${podPath}' # Added by UDPModule plugin`;

    // Add pod entry only if it doesn't already exist
    if (!podfileConfig.modResults.contents.includes(`pod '${podName}'`)) {
      // Find the target block (e.g., target 'lamaone' do)
      const targetRegex = new RegExp(`target '(${podfileConfig.modRequest.projectName}|lamaone)' do`, 'm');
      const match = podfileConfig.modResults.contents.match(targetRegex);
      
      if (match) {
        const targetBlockStart = match.index + match[0].length;
        podfileConfig.modResults.contents = 
          podfileConfig.modResults.contents.substring(0, targetBlockStart) +
          `\n${podLine}` +
          podfileConfig.modResults.contents.substring(targetBlockStart);
        console.log(`[UDPModule] Added pod to Podfile: ${podLine}`);
      } else {
        console.warn(`[UDPModule] Could not find main target in Podfile to add ${podName}.`);
      }
    } else {
      console.log(`[UDPModule] ${podName} pod already exists in Podfile.`);
    }

    return podfileConfig;
  });
};

/**
 * Update AppDelegate to register UDPModule
 */
const withUDPModuleRegistration = (config) => config; // No-op

/**
 * Update the bridging header if needed
 */
const withUDPBridgingHeader = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const bridgingHeaderPath = path.join(projectRoot, 'ios', 'lamaone', 'lamaone-Bridging-Header.h');
      
      if (fs.existsSync(bridgingHeaderPath)) {
        let content = fs.readFileSync(bridgingHeaderPath, 'utf8');
        
        // Add import for UDPModuleRegistry.h if not already present
        if (!content.includes('UDPModuleRegistry.h')) {
          content += '\n#import "UDPModuleRegistry.h"\n';
          fs.writeFileSync(bridgingHeaderPath, content);
          console.log(`[UDPModule] Added UDPModuleRegistry.h import to bridging header`);
        } else {
          console.log(`[UDPModule] Bridging header already imports UDPModuleRegistry.h`);
        }
      } else {
        console.warn(`[UDPModule] Bridging header not found at ${bridgingHeaderPath}`);
      }
      
      return config;
    }
  ]);
};

/**
 * Main plugin function that Expo will call
 */
module.exports = (config) => {
  console.log('[UDPModule] Configuring UDP module for iOS');
  config = withUDPModuleIOSSources(config);
  config = withUDPModulePod(config);
  config = withUDPModuleRegistration(config);
  config = withUDPBridgingHeader(config);
  return config;
}; 