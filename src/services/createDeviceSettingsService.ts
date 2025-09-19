import { DeviceSettingsService } from './DeviceSettingsService';
import type { DeviceSettingsGroup } from '@src/types/device';
import type { Model as BaseModel } from '@refinio/one.models/lib/models/Model.js';
import { SettingsManager } from '@src/settings/SettingsManager';
import { ModelService } from './ModelService';

interface Model extends BaseModel {
  propertyTree: {
    getValue: (key: string) => Promise<string | null>;
    setValue: (key: string, value: string) => Promise<void>;
  };
}

/**
 * Create a device settings service with default settings
 * Use this when no model is available yet
 * 
 * @returns A DeviceSettingsService initialized with default settings
 */
export function createDefaultDeviceSettingsService(): DeviceSettingsService {
  console.log('[createDefaultDeviceSettingsService] Creating device settings service with defaults');
  
  // Get default device settings
  const defaultDeviceSettings = SettingsManager.getDefaultDeviceSettings();
  
  // Create a dummy save callback that logs but doesn't actually save
  // This will be replaced when the service is properly initialized later
  const dummySaveCallback = async (settings: DeviceSettingsGroup): Promise<void> => {
    console.log('[createDefaultDeviceSettingsService] Warning: Save attempted before service properly initialized');
    // No-op save callback
  };
  
  // Create and return service
  return new DeviceSettingsService(defaultDeviceSettings, dummySaveCallback);
}

/**
 * Create a device settings service with a model instance
 * @param instance The model instance to use for storage
 * @returns Device settings service
 */
export async function createDeviceSettingsService(instance: Model): Promise<DeviceSettingsService> {
  console.log('[createDeviceSettingsService] Creating device settings service');
  
  // Try to load saved device settings
  console.log('[createDeviceSettingsService] Attempting to load saved device settings');
  const savedDeviceSettings = await instance.propertyTree.getValue('deviceSettings');
  console.log('[createDeviceSettingsService] Loaded saved device settings:', savedDeviceSettings);
  
  // Get default device settings from SettingsManager - single source of truth
  const defaultDeviceSettings = SettingsManager.getDefaultDeviceSettings();
  
  // Parse saved settings or use defaults
  let deviceSettings: DeviceSettingsGroup;
  
  try {
    if (savedDeviceSettings) {
      console.log('[createDeviceSettingsService] Parsing saved device settings');
      deviceSettings = JSON.parse(savedDeviceSettings) as DeviceSettingsGroup;
      console.log('[createDeviceSettingsService] Successfully parsed saved settings:', JSON.stringify(deviceSettings));
      
      // Clear any residual device data - devices are now stored in DeviceModel
      if (deviceSettings.devices && Object.keys(deviceSettings.devices).length > 0) {
        console.log('[createDeviceSettingsService] Clearing residual device data from settings (devices now stored in DeviceModel)');
        deviceSettings.devices = {};
      }
    } else {
      console.log('[createDeviceSettingsService] No saved settings found, using defaults');
      deviceSettings = defaultDeviceSettings;
    }
  } catch (error) {
    console.error('[createDeviceSettingsService] Error parsing saved settings, using defaults:', error);
    deviceSettings = defaultDeviceSettings;
  }
  
  // Create save callback
  const saveCallback = async (settings: DeviceSettingsGroup): Promise<void> => {
    console.log('[createDeviceSettingsService] Save callback called with settings:', JSON.stringify(settings));
    
    try {
      // Critical: make sure we're not overriding a recent setting with an old one
      // This is especially important for discoveryEnabled which can be toggled via UI
      const currentSettings = await instance.propertyTree.getValue('deviceSettings');
      
      // If we have existing settings, check if we need to merge values
      if (currentSettings) {
        try {
          const parsedCurrentSettings = JSON.parse(currentSettings) as DeviceSettingsGroup;
          
          // Check if anything significant has actually changed
          let hasSignificantChanges = false;
          
          // Check for changes to important settings
          if (parsedCurrentSettings.discoveryEnabled !== settings.discoveryEnabled ||
              parsedCurrentSettings.discoveryPort !== settings.discoveryPort ||
              parsedCurrentSettings.autoConnect !== settings.autoConnect ||
              parsedCurrentSettings.addOnlyConnectedDevices !== settings.addOnlyConnectedDevices) {
            hasSignificantChanges = true;
            console.log('[createDeviceSettingsService] Detected significant settings changes');
          }
          
          // Check for device additions or removals
          const currentDeviceIds = Object.keys(parsedCurrentSettings.devices || {});
          const newDeviceIds = Object.keys(settings.devices || {});
          
          if (currentDeviceIds.length !== newDeviceIds.length) {
            hasSignificantChanges = true;
            console.log('[createDeviceSettingsService] Device count changed, saving settings');
          } else {
            // Check if any new devices were added or removed
            for (const deviceId of newDeviceIds) {
              if (!parsedCurrentSettings.devices[deviceId]) {
                hasSignificantChanges = true;
                console.log(`[createDeviceSettingsService] New device added: ${deviceId}`);
                break;
              }
            }
          }
          
          // Log the values we're comparing
          console.log(`[createDeviceSettingsService] Discovery enabled in current: ${parsedCurrentSettings.discoveryEnabled}, in new: ${settings.discoveryEnabled}`);
          
          // If there's a discrepancy, favor the UI setting (current) over automatic updates
          // This handles the case where a device update with lastConnected overwrites the user choice
          // BUT: Skip preservation if this is an explicit user change
          const isExplicitChange = (settings as any).__explicitChange;
          if (parsedCurrentSettings.discoveryEnabled !== settings.discoveryEnabled && !isExplicitChange) {
            // Keep user's explicit choice about discovery state (only for automatic updates)
            console.log(`[createDeviceSettingsService] IMPORTANT: preserving discovery setting from current (${parsedCurrentSettings.discoveryEnabled}) - ignoring automatic update (${settings.discoveryEnabled})`);
            
            // Update the incoming settings to match what's in the property tree
            settings.discoveryEnabled = parsedCurrentSettings.discoveryEnabled;
          } else if (isExplicitChange) {
            console.log(`[createDeviceSettingsService] Explicit change detected - allowing discovery setting change from ${parsedCurrentSettings.discoveryEnabled} to ${settings.discoveryEnabled}`);
          }
          
          // Clean up the flag before saving
          delete (settings as any).__explicitChange;
          
          // If only lastConnected timestamps changed but nothing significant,
          // skip the save operation to reduce writes
          if (!hasSignificantChanges) {
            // Count how many devices have only lastConnected changes
            let onlyLastConnectedChanges = true;
            let lastConnectedUpdateCount = 0;
            
            for (const deviceId of newDeviceIds) {
              if (parsedCurrentSettings.devices[deviceId]) {
                const currentDevice = parsedCurrentSettings.devices[deviceId];
                const newDevice = settings.devices[deviceId];
                
                // Check if anything other than lastConnected changed
                if (currentDevice.name !== newDevice.name ||
                    currentDevice.enabled !== newDevice.enabled ||
                    currentDevice.autoConnect !== newDevice.autoConnect ||
                    JSON.stringify(currentDevice.dataPresentation) !== JSON.stringify(newDevice.dataPresentation)) {
                  onlyLastConnectedChanges = false;
                  break;
                }
                
                // Count lastConnected changes
                if (currentDevice.lastConnected !== newDevice.lastConnected) {
                  lastConnectedUpdateCount++;
                }
              }
            }
            
            if (onlyLastConnectedChanges) {
              console.log(`[createDeviceSettingsService] Skipping save: Only ${lastConnectedUpdateCount} lastConnected timestamps changed`);
              return; // Skip saving to reduce writes
            }
          }
        } catch (parseError) {
          console.error('[createDeviceSettingsService] Error parsing current settings:', parseError);
        }
      }
      
      await instance.propertyTree.setValue('deviceSettings', JSON.stringify(settings));
      console.log('[createDeviceSettingsService] Successfully saved settings to property tree');
    } catch (error) {
      console.error('[createDeviceSettingsService] Error saving settings:', error);
      throw error;
    }
  };
  
  // Create and return service
  console.log('[createDeviceSettingsService] Creating DeviceSettingsService instance');
  const service = new DeviceSettingsService(deviceSettings, saveCallback);
  console.log('[createDeviceSettingsService] DeviceSettingsService created successfully');
  return service;
} 