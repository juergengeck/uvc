import { useState, useEffect, useCallback } from 'react';
import { useSettings } from '@src/providers/app/SettingsProvider';
import { DeviceSettingsService } from '@src/services/DeviceSettingsService';
import { DeviceDiscoveryModel } from '@src/models/network/DeviceDiscoveryModel';
import type { DeviceSettingsGroup, ESP32DeviceSettings, DeviceConfig } from '@src/types/device';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';

/**
 * Hook to use the DeviceSettingsService
 * @returns DeviceSettingsService methods and state
 */
export function useDeviceSettings() {
  const { 
    deviceSettings, 
    deviceConfig,
    updateDeviceSettings,
    updateDeviceConfig,
    isLoading,
    error
  } = useSettings();
  
  const [service, setService] = useState<DeviceSettingsService | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  
  // Initialize the service - now using the global service if available
  useEffect(() => {
    console.log('[useDeviceSettings] ===== SERVICE INITIALIZATION START =====');
    
    if (!deviceSettings) {
      console.log('[useDeviceSettings] No device settings available, skipping service initialization');
      console.log('[useDeviceSettings] ===== SERVICE INITIALIZATION END (SKIPPED) =====');
      return;
    }
    
    // Try to get the existing service from the global app model
    const globalContext = window as any;
    let deviceService: DeviceSettingsService | null = null;
    
    // First check if we can access the existing service from the app model
    if (globalContext.appModel?.getService) {
      try {
        deviceService = globalContext.appModel.getService('deviceSettings');
        if (deviceService) {
          console.log('[useDeviceSettings] Reusing existing DeviceSettingsService from AppModel');
        }
      } catch (error) {
        console.error('[useDeviceSettings] Error accessing service from AppModel:', error);
      }
    }
    
    // Fallback to creating a new service if needed
    if (!deviceService) {
      console.log('[useDeviceSettings] Creating new DeviceSettingsService with settings:', JSON.stringify(deviceSettings));
      deviceService = new DeviceSettingsService(
        deviceSettings,
        updateDeviceSettings
      );
      console.log('[useDeviceSettings] DeviceSettingsService created successfully');
    }
    
    setService(deviceService);
    
    // Register the service with the global context for debugging
    try {
      if (!globalContext.debugServices) {
        globalContext.debugServices = {};
      }
      globalContext.debugServices.deviceSettingsService = deviceService;
      console.log('[useDeviceSettings] Registered service with global context for debugging');
    } catch (error) {
      console.error('[useDeviceSettings] Failed to register service with global context:', error);
    }
    
    console.log('[useDeviceSettings] ===== SERVICE INITIALIZATION END =====');
    
    return () => {
      console.log('[useDeviceSettings] ===== SERVICE CLEANUP START =====');
      
      try {
        // Stop discovery if it's running, but don't shutdown the entire model
        try {
          const globalCtx: any = window as any;
          const discoveryModel = globalCtx?.appModel?.deviceDiscoveryModel;
          if (discoveryModel && discoveryModel.discovery && discoveryModel.discovery.isDiscovering && typeof discoveryModel.stopDiscovery === 'function') {
            console.log('[useDeviceSettings] Stopping discovery during service cleanup');
            // Fire and forget – cleanup function can't be async. Any errors are logged.
            discoveryModel.stopDiscovery().catch((err: any) => {
              console.error('[useDeviceSettings] Error while stopping discovery:', err);
            });
          }
        } catch (err) {
          console.error('[useDeviceSettings] Failed to stop discovery during cleanup:', err);
        }

        // More defensive cleanup - check if the service and methods still exist
        if (deviceService && typeof deviceService === 'object') {
          console.log('[useDeviceSettings] Cleaning up event listeners');
          
          // Safely clean up event listeners
          try {
            if (deviceService.onSettingsChanged && typeof deviceService.onSettingsChanged.emit === 'function') {
              deviceService.onSettingsChanged.emit = () => {};
            }
          } catch (error) {
            console.error('[useDeviceSettings] Error cleaning up onSettingsChanged:', error);
          }
          
          try {
            if (deviceService.onDeviceAdded && typeof deviceService.onDeviceAdded.emit === 'function') {
              deviceService.onDeviceAdded.emit = () => {};
            }
          } catch (error) {
            console.error('[useDeviceSettings] Error cleaning up onDeviceAdded:', error);
          }
          
          try {
            if (deviceService.onDeviceUpdated && typeof deviceService.onDeviceUpdated.emit === 'function') {
              deviceService.onDeviceUpdated.emit = () => {};
            }
          } catch (error) {
            console.error('[useDeviceSettings] Error cleaning up onDeviceUpdated:', error);
          }
          
          try {
            if (deviceService.onDeviceRemoved && typeof deviceService.onDeviceRemoved.emit === 'function') {
              deviceService.onDeviceRemoved.emit = () => {};
            }
          } catch (error) {
            console.error('[useDeviceSettings] Error cleaning up onDeviceRemoved:', error);
          }
        } else {
          console.log('[useDeviceSettings] No valid service to clean up');
        }
        
        // Remove from global context safely
        try {
          if (globalContext?.debugServices?.deviceSettingsService === deviceService) {
            delete globalContext.debugServices.deviceSettingsService;
            console.log('[useDeviceSettings] Removed service from global context');
          }
        } catch (error) {
          console.error('[useDeviceSettings] Failed to remove service from global context:', error);
        }
      } catch (error) {
        console.error('[useDeviceSettings] Error during cleanup:', error);
      }
      
      console.log('[useDeviceSettings] ===== SERVICE CLEANUP END =====');
    };
  }, [deviceSettings]); // Removed updateDeviceSettings to prevent circular updates
  
  // Toggle discovery
  const toggleDiscovery = useCallback(async () => {
    if (!service || !deviceSettings) return;
    
    try {
      setLocalLoading(true);
      const newDiscoveryState = !deviceSettings.discoveryEnabled;
      
      // If turning OFF, stop discovery first
      if (!newDiscoveryState) {
        try {
          // Get discovery model from AppModel (only available after login)
          const globalCtx: any = window as any;
          const discoveryModel = globalCtx?.appModel?.deviceDiscoveryModel;
          
          if (discoveryModel?.forceStopDiscovery) {
            await discoveryModel.forceStopDiscovery();
          }
        } catch (error) {
          console.warn('[useDeviceSettings] Could not stop discovery model:', error);
          // Continue with settings update even if stop fails
        }
      }
      
      // If turning ON, ensure VCManager is initialized first
      if (newDiscoveryState) {
        try {
          const globalCtx: any = window as any;
          const discoveryModel = globalCtx?.appModel?.deviceDiscoveryModel;
          if (discoveryModel) {
            console.log('[useDeviceSettings] Ensuring VCManager is initialized before enabling discovery');
            // This will initialize VCManager if needed
            await discoveryModel.getESP32ConnectionManager();
          }
        } catch (error) {
          console.warn('[useDeviceSettings] Could not initialize ESP32ConnectionManager:', error);
          // Continue anyway - discovery can work without it
        }
      }
      
      // Update settings
      await service.setDiscoveryEnabled(newDiscoveryState);
      await updateDeviceConfig({
        discoveryEnabled: newDiscoveryState
      });
      
    } catch (error) {
      console.error('[useDeviceSettings] Failed to toggle discovery:', error);
      throw error;
    } finally {
      setLocalLoading(false);
    }
  }, [deviceSettings, service, updateDeviceConfig]);
  
  // Toggle auto-connect
  const toggleAutoConnect = useCallback(async () => {
    if (!service || !deviceSettings) return;
    
    try {
      setLocalLoading(true);
      
      // Update both device settings and device config
      await service.setAutoConnect(!deviceSettings.autoConnect);
      
      await updateDeviceConfig({
        autoConnect: !deviceSettings.autoConnect
      });
    } catch (error) {
      console.error('[useDeviceSettings] Failed to toggle auto-connect:', error);
      throw error;
    } finally {
      setLocalLoading(false);
    }
  }, [service, deviceSettings, updateDeviceConfig]);
  
  // Toggle add only connected devices
  const toggleAddOnlyConnectedDevices = useCallback(async () => {
    if (!service || !deviceSettings) return;
    
    try {
      setLocalLoading(true);
      
      // Update both device settings and device config
      await service.setAddOnlyConnectedDevices(!deviceSettings.addOnlyConnectedDevices);
      
      await updateDeviceConfig({
        addOnlyConnectedDevices: !deviceSettings.addOnlyConnectedDevices
      });
    } catch (error) {
      console.error('[useDeviceSettings] Failed to toggle add only connected devices:', error);
      throw error;
    } finally {
      setLocalLoading(false);
    }
  }, [service, deviceSettings, updateDeviceConfig]);
  
  // Update discovery port
  const setDiscoveryPort = useCallback(async (port: number) => {
    if (!service || !deviceSettings) return;
    
    try {
      setLocalLoading(true);
      
      // Update both device settings and device config
      await service.setDiscoveryPort(port);
      
      await updateDeviceConfig({
        discoveryPort: port
      });
    } catch (error) {
      console.error('[useDeviceSettings] Failed to update discovery port:', error);
      throw error;
    } finally {
      setLocalLoading(false);
    }
  }, [service, deviceSettings, updateDeviceConfig]);
  
  // Add device
  const addDevice = useCallback(async (device: ESP32DeviceSettings) => {
    if (!service) return;
    
    try {
      setLocalLoading(true);
      await service.addDevice(device);
    } catch (error) {
      console.error('[useDeviceSettings] Failed to add device:', error);
      throw error;
    } finally {
      setLocalLoading(false);
    }
  }, [service]);
  
  // Update device
  const updateDevice = useCallback(async (deviceId: string, device: Partial<ESP32DeviceSettings>) => {
    if (!service) return;
    
    try {
      setLocalLoading(true);
      await service.updateDevice(deviceId, device);
    } catch (error) {
      console.error('[useDeviceSettings] Failed to update device:', error);
      throw error;
    } finally {
      setLocalLoading(false);
    }
  }, [service]);
  
  // Remove device
  const removeDevice = useCallback(async (deviceId: string) => {
    if (!service) return;
    
    try {
      setLocalLoading(true);
      await service.removeDevice(deviceId);
    } catch (error) {
      console.error('[useDeviceSettings] Failed to remove device:', error);
      throw error;
    } finally {
      setLocalLoading(false);
    }
  }, [service]);
  
  // Associate device with person
  const associateDeviceWithPerson = useCallback(async (deviceId: string, personId: SHA256IdHash<Person>) => {
    if (!service) return;
    
    try {
      setLocalLoading(true);
      await service.associateDeviceWithPerson(deviceId, personId);
    } catch (error) {
      console.error('[useDeviceSettings] Failed to associate device with person:', error);
      throw error;
    } finally {
      setLocalLoading(false);
    }
  }, [service]);
  
  // Disassociate device from person
  const disassociateDeviceFromPerson = useCallback(async (deviceId: string) => {
    if (!service) return;
    
    try {
      setLocalLoading(true);
      await service.disassociateDeviceFromPerson(deviceId);
    } catch (error) {
      console.error('[useDeviceSettings] Failed to disassociate device from person:', error);
      throw error;
    } finally {
      setLocalLoading(false);
    }
  }, [service]);
  
  return {
    // State
    deviceSettings,
    deviceConfig,
    isLoading: isLoading || localLoading,
    error,
    
    // Methods
    toggleDiscovery,
    toggleAutoConnect,
    toggleAddOnlyConnectedDevices,
    setDiscoveryPort,
    addDevice,
    updateDevice,
    removeDevice,
    associateDeviceWithPerson,
    disassociateDeviceFromPerson,
    
    // Service methods
    getDevices: service?.getDevices.bind(service),
    getDevice: service?.getDevice.bind(service),
    getDevicesForPerson: service?.getDevicesForPerson.bind(service)
  };
} 