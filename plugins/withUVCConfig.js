// @ts-check
const { withPlugins, withDangerousMod, withInfoPlist, withAndroidManifest } = require('@expo/config-plugins');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Consolidated UVC configuration plugin
 * Combines all custom plugins into a single, well-organized plugin
 */

// Setup llama.rn module
function withLlamaRnSetup(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const scriptPath = path.join(projectRoot, 'scripts', 'setup-llama-rn.js');
      
      // Only run if script exists and hasn't been run
      if (fs.existsSync(scriptPath)) {
        const markerFile = path.join(projectRoot, '.llama-setup-done');
        
        if (!fs.existsSync(markerFile)) {
          console.log('[withUVCConfig] Setting up llama.rn...');
          try {
            execSync(`node "${scriptPath}"`, {
              stdio: 'inherit',
              cwd: projectRoot
            });
            // Create marker file to prevent re-running
            fs.writeFileSync(markerFile, Date.now().toString());
            console.log('[withUVCConfig] llama.rn setup completed');
          } catch (error) {
            console.error('[withUVCConfig] Error setting up llama.rn:', error.message);
          }
        } else {
          console.log('[withUVCConfig] llama.rn already set up, skipping');
        }
      }
      
      return config;
    },
  ]);
}

// Add BLE permissions and configuration
function withBLEConfiguration(config) {
  // iOS BLE permissions
  config = withInfoPlist(config, (config) => {
    config.modResults.NSBluetoothAlwaysUsageDescription = 
      config.modResults.NSBluetoothAlwaysUsageDescription ||
      'This app uses Bluetooth to discover and connect to nearby devices for local data exchange.';
    
    config.modResults.NSBluetoothPeripheralUsageDescription = 
      config.modResults.NSBluetoothPeripheralUsageDescription ||
      'This app uses Bluetooth to discover and connect to nearby devices for local data exchange.';

    // Add background modes for BLE
    const backgroundModes = config.modResults.UIBackgroundModes || [];
    const bleModes = ['bluetooth-central', 'bluetooth-peripheral'];
    
    bleModes.forEach(mode => {
      if (!backgroundModes.includes(mode)) {
        backgroundModes.push(mode);
      }
    });
    
    config.modResults.UIBackgroundModes = backgroundModes;
    
    return config;
  });

  // Android BLE permissions
  config = withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;
    const permissions = androidManifest.manifest['uses-permission'] || [];
    
    const requiredPermissions = [
      'android.permission.BLUETOOTH',
      'android.permission.BLUETOOTH_ADMIN',
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.BLUETOOTH_ADVERTISE',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
    ];

    requiredPermissions.forEach((permission) => {
      const hasPermission = permissions.find(
        (perm) => perm.$['android:name'] === permission
      );
      
      if (!hasPermission) {
        permissions.push({
          $: {
            'android:name': permission,
          },
        });
      }
    });

    // Add BLE feature
    const features = androidManifest.manifest['uses-feature'] || [];
    const hasBLEFeature = features.find(
      (feature) => feature.$['android:name'] === 'android.hardware.bluetooth_le'
    );
    
    if (!hasBLEFeature) {
      features.push({
        $: {
          'android:name': 'android.hardware.bluetooth_le',
          'android:required': 'true',
        },
      });
    }

    androidManifest.manifest['uses-permission'] = permissions;
    androidManifest.manifest['uses-feature'] = features;

    return config;
  });

  return config;
}

// Removed iOS build fixes - let React Native handle Folly

// Main plugin export
module.exports = function withUVCConfig(config) {
  return withPlugins(config, [
    // Setup modules
    withLlamaRnSetup,
    
    // Add BLE support
    withBLEConfiguration,
  ]);
};