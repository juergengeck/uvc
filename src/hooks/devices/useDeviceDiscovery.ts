import { useState, useEffect, useCallback, useRef } from 'react';
import { DeviceDiscoveryModel } from '@src/models/network';
import { QuicModel } from '@src/models/network/QuicModel';
import { useDeviceSettings } from '@src/hooks/useDeviceSettings';
import { getInstanceOwnerIdHash } from '@refinio/one.core/lib/instance.js';
import { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';
import { Person } from '@refinio/one.core/lib/recipes.js';
import { Device } from '@src/components/devices/DeviceItem';
import { Buffer } from '@refinio/one.core/lib/system/expo/index.js';
import { DeviceType } from '@src/models/network/deviceTypes';
import { ESP32ConnectionManager } from '@src/models/network/esp32/ESP32ConnectionManager';
import { ModelService } from '@src/services/ModelService';
import profiler from '@src/utils/performanceProfiler';
import { debugLog } from '@src/utils/debugLogger';

const DEVICE_TIMEOUT_MS = 60000; // 60 seconds

export function useDeviceDiscovery() {
  const { deviceSettings, isLoading, error, toggleDiscovery, removeDevice } = useDeviceSettings();
  const [devices, setDevices] = useState<Device[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [isDiscoveryRunning, setIsDiscoveryRunning] = useState(false);
  const [hasReceivedDiscoveryEvent, setHasReceivedDiscoveryEvent] = useState(false);
  const [pendingLEDCommands, setPendingLEDCommands] = useState<Record<string, boolean>>({});
  const processingLEDCommands = useRef<Set<string>>(new Set());
  
  // Don't create instance during render - will be set after login
  const discoveryModelRef = useRef<DeviceDiscoveryModel | null>(null);
  const isUpdatingRef = useRef(false);
  const isMountedRef = useRef(true);
  const devicesRef = useRef<Device[]>([]);
  // Hash of last devices list to avoid redundant state updates
  const devicesHashRef = useRef<string>();
  const loadDevicesTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track component mount state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      debugLog.info('useDeviceDiscovery', 'Component unmounting');
      isMountedRef.current = false;
    };
  }, []);

  // Fast shallow comparison for device arrays
  const devicesHaveChanged = useCallback((prev: Device[], next: Device[]): boolean => {
    if (prev.length !== next.length) return true;

    for (let i = 0; i < prev.length; i++) {
      const p = prev[i];
      const n = next[i];

      // Compare key properties only (not all properties to avoid unnecessary re-renders)
      if (p.id !== n.id ||
          p.online !== n.online ||
          p.connected !== n.connected ||
          p.ownerId !== n.ownerId ||
          p.lastSeen !== n.lastSeen ||
          p.blueLedStatus !== n.blueLedStatus) {
        return true;
      }
    }

    return false;
  }, []);
  
  const loadDevicesImmediate = useCallback(async () => {
    if (isUpdatingRef.current) return;

    try {
      isUpdatingRef.current = true;

      // CRITICAL: Capture current device state BEFORE loading to preserve ownership info
      // DeviceModel may not have the latest ownerId if it was just set via event listener
      const currentDevices = devicesRef.current;

      // No longer use savedDevices from settings - devices are stored in DeviceModel
      const discoveryModel = discoveryModelRef.current;

      // Get devices from DeviceModel (which includes owned devices from storage)
      let allDevices: any[] = [];
      const deviceModel = ModelService.getDeviceModel();
      if (!deviceModel || !deviceModel.isInitialized()) {
        console.warn('[useDeviceDiscovery] DeviceModel not initialized yet - returning empty device list');
        return; // Return early, will retry on next call
      }

      // This will get both discovered devices and owned devices from storage
      allDevices = await deviceModel.getDevices();
      
      // Get ESP32 connection manager instance to check connection status
      let esp32ConnectionManager: ESP32ConnectionManager | undefined = undefined;
      try {
        // Get discovery model from AppModel if available (only after login)
        const appModel = ModelService.getAppModel();
        const discoveryModel = appModel?.deviceDiscoveryModel;
        if (discoveryModel) {
          esp32ConnectionManager = await discoveryModel.getESP32ConnectionManager();
        }
      } catch (error) {
        console.error('[useDeviceDiscovery] Error getting ESP32ConnectionManager:', error);
      }
      
      // Start with empty array - we'll rebuild from DeviceModel data
      const deviceList: Device[] = [];
      
      // Process all devices (from DeviceModel which includes both saved and discovered)
      const currentPersonId = getInstanceOwnerIdHash();
      
      allDevices.forEach((device, index) => {
        try {
          // DeviceModel returns devices with 'deviceId' property
          const deviceId = device.deviceId;
          if (!device || !deviceId) {
            debugLog.info('useDeviceDiscovery', 'Skipping device - no valid ID:', device);
            return;
          }
        
        const existingIndex = deviceList.findIndex(d => d.id === deviceId);
        
        // DeviceModel returns devices with 'deviceType' property
        const deviceType = device.deviceType || 'Unknown';
        
        // Determine online and connected status
        // For discovered devices (no explicit online status), they're online if recently seen
        let isOnline = false;
        
        if (device.online !== undefined) {
          // Trust explicit online status from device
          isOnline = device.online;
        } else if (device.lastSeen) {
          // For discovered devices, check if recently seen
          const timeSinceLastSeen = Date.now() - device.lastSeen;
          isOnline = timeSinceLastSeen < 60000; // Online if seen in last minute
        }
        
        // Special handling for ESP32 devices - they're online if we're receiving discovery messages
        if ((deviceType === DeviceType.ESP32 || deviceType === 'ESP32') && device.lastSeen) {
          const timeSinceLastSeen = Date.now() - device.lastSeen;
          if (timeSinceLastSeen < 60000) { // If seen in last minute, it's online
            isOnline = true;
          }
        }
        
        let isConnected = false; // Connected means authenticated
        
        // For ESP32 devices, check authentication status from ESP32ConnectionManager
        if (deviceType === DeviceType.ESP32 || deviceType === 'ESP32') {
          try {
            // First check if device has valid credential from discovery
            isConnected = device.hasValidCredential === true;
            
            // Also check ESP32ConnectionManager's view if device is owned by us
            if (!isConnected && device.ownerId === currentPersonId && esp32ConnectionManager) {
              const esp32Device = esp32ConnectionManager.getDevice(deviceId);
              if (esp32Device && esp32Device.isAuthenticated) {
                isConnected = true;
              }
            }
          } catch (error) {
            console.error('[useDeviceDiscovery] Error getting ESP32 device status:', error);
            isConnected = false;
          }
        } else {
          // For other app devices, check if they have authentication
          // TODO: Check app authentication status via VCManager
          isConnected = false; // For now, apps are not considered connected
        }
        
        if (existingIndex >= 0) {
          // Only update if something actually changed
          const existingDevice = deviceList[existingIndex];
          const hasChanges = 
            existingDevice.online !== isOnline ||
            existingDevice.connected !== isConnected ||
            existingDevice.address !== device.address ||
            existingDevice.port !== device.port ||
            existingDevice.ownerId !== device.ownerId ||
            (device.blueLedStatus && existingDevice.blueLedStatus !== device.blueLedStatus);
          
          if (hasChanges) {
            debugLog.info('useDeviceDiscovery', 'Updating existing device at index', existingIndex);

            // CRITICAL: Handle ownerId carefully to support both setting AND clearing
            // - DeviceModel has explicit ownerId (not null) -> use it (supports both defined and undefined)
            // - Otherwise preserve from current state (race: event set it but not persisted yet)
            const currentDevice = currentDevices.find(d => d.id === deviceId);
            const hasOwnerIdInModel = 'ownerId' in device && device.ownerId !== null;
            const ownerId = hasOwnerIdInModel ? device.ownerId : (currentDevice?.ownerId ?? existingDevice.ownerId);

            // Update existing device
            deviceList[existingIndex] = {
              ...existingDevice,
              name: device.name || existingDevice.name,
              type: deviceType || existingDevice.type,
              address: device.address || existingDevice.address,
              port: device.port || existingDevice.port,
              lastSeen: device.lastSeen || Date.now(),
              online: isOnline,
              connected: isConnected,
              blueLedStatus: device.blueLedStatus || existingDevice.blueLedStatus || (deviceType === DeviceType.ESP32 || deviceType === 'ESP32' ? 'off' : undefined),
              ownerId: ownerId,
              isSaved: existingDevice.isSaved // Preserve saved status
            };
          } else {
            // No changes, keep the existing device object to avoid re-renders
            deviceList[existingIndex].lastSeen = device.lastSeen || Date.now();
          }
        } else {
          // Add new device - map deviceId to id for UI compatibility
          // CRITICAL: Handle ownerId - support both setting and clearing
          const currentDevice = currentDevices.find(d => d.id === deviceId);
          const hasOwnerIdInModel = 'ownerId' in device && device.ownerId !== null;
          const ownerId = hasOwnerIdInModel ? device.ownerId : currentDevice?.ownerId;

          const newDevice = {
            id: deviceId, // UI expects 'id' not 'deviceId'
            name: device.name || deviceId,
            type: deviceType || 'Unknown',
            address: device.address || 'Unknown',
            port: device.port || 0,
            lastSeen: device.lastSeen || Date.now(),
            online: isOnline,
            connected: isConnected,
            enabled: true,
            blueLedStatus: device.blueLedStatus || (deviceType === DeviceType.ESP32 || deviceType === 'ESP32' ? 'off' : undefined),
            ownerId: ownerId,
            wifiStatus: device.wifiStatus || (device.port > 0 ? 'active' : 'inactive'), // Assume WiFi active if has port
            btleStatus: device.btleStatus || 'inactive' // Default to inactive unless explicitly set
          };

          deviceList.push(newDevice);
        }
        } catch (error) {
          console.error(`[useDeviceDiscovery] Error processing device ${index + 1}:`, error);
        }
      });
      
      
      // Check authentication status for saved devices
      const devicesWithAuth = deviceList.map(device => {
        if (device.type === DeviceType.ESP32 && !device.connected) {
          // For ESP32 devices not already marked as connected, check their auth status
          // Skip async ESP32ConnectionManager check here
          // Connection status will be updated by device events
        }
        return device;
      });
      
      // Apply timeout logic for online status (only for discovered devices, not saved)
      const currentTime = Date.now();
      const devicesWithTimeout = devicesWithAuth.map(device => {
        if (device.online && device.lastSeen) {
          const timeSinceLastSeen = currentTime - device.lastSeen;
          // Only apply timeout to discovered devices, not owned devices
          const isOwnedDevice = device.ownerId === currentPersonId;
          if (!isOwnedDevice && timeSinceLastSeen > DEVICE_TIMEOUT_MS) {
            // Device hasn't been seen recently, mark as offline
            return { ...device, online: false };
          }
        }
        return device;
      });
      
      // Sort devices - prioritize online, then connected
      devicesWithTimeout.sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        if (a.connected !== b.connected) return a.connected ? -1 : 1;
        if (a.lastSeen && b.lastSeen) return b.lastSeen - a.lastSeen;
        return a.name.localeCompare(b.name);
      });
      
      // Only update if devices actually changed
      setDevices(prev => {
        if (devicesHaveChanged(prev, devicesWithTimeout)) {
          devicesRef.current = devicesWithTimeout;
          return devicesWithTimeout;
        }
        return prev;
      });
      
      // LED status polling removed - should be handled by QUICVC connection layer
    } finally {
      isUpdatingRef.current = false;
    }
  }, [deviceSettings]);

  const debouncedLoadDevices = useCallback(() => {
    // Clear any pending loadDevices call
    if (loadDevicesTimeoutRef.current) {
      clearTimeout(loadDevicesTimeoutRef.current);
    }
    
    // Schedule a new loadDevices call after a short delay
    loadDevicesTimeoutRef.current = setTimeout(() => {
      loadDevicesTimeoutRef.current = null;
      loadDevicesImmediate();
    }, 300); // 300ms debounce
  }, [loadDevicesImmediate]);

  // Wrapper for loadDevices that can be called immediately or debounced
  const loadDevices = useCallback(async (immediate = false) => {
    if (immediate) {
      await loadDevicesImmediate();
    } else {
      debouncedLoadDevices();
    }
  }, [loadDevicesImmediate, debouncedLoadDevices]);
  
  // LED status requests removed - should be handled by QUICVC connection layer
  
  // Toggle the blue-LED on an ESP32.
  // All fast-failing validations are done up-front; the happy path is
  // therefore straight-line and side-effect free until we actually send.
  const toggleBlueLED = useCallback(async (device: Device) => {
    const operationId = `led_toggle_${device.id}_${Date.now()}`;
    profiler.startOperation(operationId, { deviceId: device.id, deviceType: device.type });
    
    // Check if already processing a command for this device
    if (processingLEDCommands.current.has(device.id)) {
      console.log('[toggleBlueLED] Already processing LED command for device:', device.id);
      profiler.endOperation(operationId, { skipped: true, reason: 'already_processing' });
      return;
    }

    profiler.checkpoint('Validation checks starting');

    // 1. Type guard – we only support ESP32
    if (device.type !== DeviceType.ESP32) {
      profiler.endOperation(operationId, { error: 'not_esp32' });
      console.warn('[toggleBlueLED] LED control is only available for ESP32 devices');
      return; // Fail silently - not a critical error
    }

    const discoveryModel = discoveryModelRef.current;
    if (!discoveryModel) {
      profiler.endOperation(operationId, { error: 'no_discovery_model' });
      console.warn('[toggleBlueLED] Discovery model not available yet');
      return; // Fail silently - initialization still in progress
    }
    const currentUserId = getInstanceOwnerIdHash();

    profiler.checkpoint('Got models and user ID');

    // 2. Ownership & authentication validations (fail fast)
    if (!device.ownerId) {
      profiler.endOperation(operationId, { error: 'not_owned' });
      console.warn(`[toggleBlueLED] Device ${device.id} is not owned - cannot control LED`);
      return; // Fail silently - user can see device isn't owned in UI
    }
    if (device.ownerId !== currentUserId) {
      console.warn(`[toggleBlueLED] Ownership mismatch - device owner: ${device.ownerId}, current user: ${currentUserId}`);
      profiler.endOperation(operationId, { error: 'not_owner' });
      return; // Fail silently - user can see they don't own it in UI
    }

    profiler.checkpoint('Ownership validated');

    // Prefer the authoritative ESP32ConnectionManager view for connection state
    profiler.startOperation('get_esp32_manager', { deviceId: device.id });
    const esp32ConnectionManager = await discoveryModel.getESP32ConnectionManager();
    profiler.endOperation('get_esp32_manager');

    if (!esp32ConnectionManager) {
      profiler.endOperation(operationId, { error: 'no_connection_manager' });
      console.warn('[toggleBlueLED] ESP32ConnectionManager not available yet');
      return; // Fail silently - initialization issue
    }

    const esp32Device = esp32ConnectionManager.getDevice(device.id);
    if (!esp32Device || !esp32Device.isAuthenticated) {
      console.warn(`[toggleBlueLED] Device ${device.id} is not authenticated yet`);
      profiler.endOperation(operationId, { error: 'not_authenticated' });
      return; // Fail silently - device not ready
    }

    // Mark as processing
    processingLEDCommands.current.add(device.id);

    // 3. Determine next LED status for UI and corresponding command for ESP32
    const originalStatus = device.blueLedStatus;
    const nextStatus: 'on' | 'off' = (originalStatus === 'on') ? 'off' : 'on';

    try {
      
      // Optimistic UI update - update immediately for better UX
      setDevices(prev => prev.map(d => 
        d.id === device.id ? { ...d, blueLedStatus: nextStatus } : d
      ));
      
      // Mark LED command as pending
      setPendingLEDCommands(prev => ({
        ...prev,
        [device.id]: true
      }));
      
      // ESP32ConnectionManager was already fetched above, no need to get it again
      
      const esp32Command = {
        type: 'led_control' as const,
        action: nextStatus,
        timestamp: Date.now()
      };

      // Send command through ESP32ConnectionManager which handles authentication
      profiler.startOperation('send_led_command', { deviceId: device.id, action: nextStatus });
      const response = await esp32ConnectionManager.sendCommand(device.id, esp32Command);
      profiler.endOperation('send_led_command', { status: response.status });

      // Handle command response
      if (response.status === 'success' || response.status === 'sent') {
        // State was optimistically updated above - device events may also update
        // Both updates are idempotent so no conflict
        
        // Clear pending state on success
        setPendingLEDCommands(prev => {
          const { [device.id]: _, ...rest } = prev;
          return rest;
        });
        profiler.endOperation(operationId, { success: true });
      } else {
        console.error('[toggleBlueLED] LED command failed:', response.error || response.message);
        // Revert optimistic update on failure - restore original status
        setDevices(prev => prev.map(d =>
          d.id === device.id ? { ...d, blueLedStatus: originalStatus } : d
        ));
        // Clear pending state on failure
        setPendingLEDCommands(prev => {
          const { [device.id]: _, ...rest } = prev;
          return rest;
        });
        profiler.endOperation(operationId, { success: false, error: response.error || response.message });
        // Don't throw - just log the error
        return;
      }
    } catch (err) {
      profiler.endOperation(operationId, { success: false, error: String(err) });
      console.error('[toggleBlueLED] LED command failed with error:', err);
      console.error('[toggleBlueLED] Error details:', {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined
      });
      // Revert optimistic update on error - restore original status
      setDevices(prev => prev.map(d =>
        d.id === device.id ? { ...d, blueLedStatus: originalStatus } : d
      ));
      // Clear pending state on error
      setPendingLEDCommands(prev => {
        const { [device.id]: _, ...rest } = prev;
        return rest;
      });
      // Don't throw - external device failure shouldn't crash the app
      return;
    } finally {
      // Always clear processing state
      processingLEDCommands.current.delete(device.id);
    }
  }, [discoveryModelRef, setDevices]);
  
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDevices(true); // Use immediate load for refresh
    setRefreshing(false);
  }, [loadDevices]);
  
  const removeDeviceWithCredentials = useCallback(async (device: Device) => {
    const discoveryModel = discoveryModelRef.current;
    if (!discoveryModel) {
      console.warn('[useDeviceDiscovery] Discovery model not available for credential removal');
      // Still proceed with local removal
      await removeDevice(device.id);
      await loadDevices();
      return;
    }

    // For ESP32 devices, always try to remove ownership
    // The ESP32 might be owned even if the app doesn't know about it
    // (e.g., after app restart when ESP32 is in silent mode)
    if (device.type === DeviceType.ESP32) {
      try {
        console.log(`[useDeviceDiscovery] Removing ownership of ESP32 device ${device.id}`);
        const success = await discoveryModel.removeDeviceOwnership(device.id);
        if (success) {
          console.log(`[useDeviceDiscovery] Successfully removed ownership of ${device.id}`);
        } else {
          console.warn(`[useDeviceDiscovery] Failed to remove ownership of ${device.id}`);
        }
      } catch (error) {
        console.error(`[useDeviceDiscovery] Error removing ownership:`, error);
      }
    } else if (device.ownerId) {
      // For other owned devices, use the removeDeviceOwnership method
      try {
        console.log(`[useDeviceDiscovery] Removing ownership of device ${device.id}`);
        const success = await discoveryModel.removeDeviceOwnership(device.id);
        if (success) {
          console.log(`[useDeviceDiscovery] Successfully removed ownership of ${device.id}`);
        } else {
          console.warn(`[useDeviceDiscovery] Failed to remove ownership of ${device.id}`);
        }
      } catch (error) {
        console.error(`[useDeviceDiscovery] Error removing ownership:`, error);
      }
    } else {
      // For unowned devices, just remove from local storage
      await removeDevice(device.id);
    }

    // Refresh the device list
    await loadDevices();
  }, [removeDevice, loadDevices]);
  
  // Listen for ESP32 authentication events to update connected status
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    const setupAuthListener = async () => {
      try {
        const discoveryModel = DeviceDiscoveryModel.getInstance();
        const esp32Manager = await discoveryModel.getESP32ConnectionManager();
        if (esp32Manager) {
          const listener = (device: any) => {
            console.log(`[useDeviceDiscovery] ESP32 device authenticated: ${device.id}, triggering refresh`);
            // CRITICAL: Defer async work to avoid blocking other event listeners
            // OEvent runs listeners sequentially with await by default, so returning a promise
            // blocks all subsequent listeners. Use setImmediate to defer.
            setImmediate(() => {
              loadDevices(false).catch(err => {
                console.error('[useDeviceDiscovery] Error loading devices after auth:', err);
              });
            });
          };
          unsubscribe = esp32Manager.onDeviceAuthenticated.listen(listener);
        }
      } catch (error) {
        console.error('[useDeviceDiscovery] Error setting up auth listener:', error);
      }
    };
    
    setupAuthListener();
    
    return () => {
      unsubscribe?.();
    };
  }, [loadDevices]);
  
  // Initialize and set up event listeners
  useEffect(() => {
    debugLog.info('useDeviceDiscovery', 'Main effect running - setting up event listeners');
    
    // Defer initial loadDevices to avoid potential race conditions
    const loadTimer = setTimeout(() => {
      debugLog.info('useDeviceDiscovery', 'Initial loadDevices call');
      loadDevices(true);
    }, 100);
    
    // Get discovery model from AppModel (only available after login)
    const appModel = ModelService.getAppModel();
    const discoveryModel = appModel?.deviceDiscoveryModel;
    
    // Update our ref with the model from AppModel
    if (discoveryModel) {
      discoveryModelRef.current = discoveryModel;
    }
    
    // Check actual discovery state from the model first - this handles cases where
    // discovery was started before this hook mounted (e.g., during app initialization)
    const actualDiscoveryState = discoveryModel?.isDiscovering() ?? !!deviceSettings?.discoveryEnabled;
    console.log(`[useDeviceDiscovery] Initial discovery state check: model.isDiscovering()=${discoveryModel?.isDiscovering()}, settingsEnabled=${!!deviceSettings?.discoveryEnabled}, final=${actualDiscoveryState}`);
    setIsDiscoveryRunning(actualDiscoveryState);
    
    // If discovery is already running, mark that we've received the "event"
    if (actualDiscoveryState) {
      console.log('[useDeviceDiscovery] Discovery already running - marking as received event');
      setHasReceivedDiscoveryEvent(true);
    }
    if (!discoveryModel) {
      console.log('[useDeviceDiscovery] No discovery model available yet - app may not be fully initialized');
      return () => clearTimeout(loadTimer);
    }

    // Start discovery if not already running - this triggers active discovery probes
    if (!actualDiscoveryState) {
      console.log('[useDeviceDiscovery] Starting discovery for immediate device detection');
      discoveryModel.startDiscovery().catch(error => {
        console.error('[useDeviceDiscovery] Failed to start discovery:', error);
      });
    }
    
    const unsubscribers: Array<() => void> = [];
    
    // Set up event listeners
    const events = [
      { 
        name: 'onDeviceDiscovered', 
        handler: (discoveredDevice: any) => {
          // console.log('[useDeviceDiscovery] *** onDeviceDiscovered event received for:', discoveredDevice?.deviceId);
          // console.log('[useDeviceDiscovery] Discovered device details:', discoveredDevice);
          if (!discoveredDevice || !discoveredDevice.deviceId) {
            console.log('[useDeviceDiscovery] Invalid device discovered - missing deviceId');
            return;
          }
          
          // Add the newly discovered device to the list or update existing one
          setDevices(prevDevices => {
            const existingIndex = prevDevices.findIndex(d => d.id === discoveredDevice.deviceId);
            
            if (existingIndex >= 0) {
              // Device exists - check if we need to update ownership or other properties
              const existingDevice = prevDevices[existingIndex];
              const hasOwnershipChange = existingDevice.ownerId !== discoveredDevice.ownerId;
              const hasConnectionChange = existingDevice.connected !== (discoveredDevice.hasValidCredential === true);
              
              if (hasOwnershipChange || hasConnectionChange || existingDevice.lastSeen !== discoveredDevice.lastSeen) {
                console.log('[useDeviceDiscovery] Updating existing device:', discoveredDevice.deviceId, 
                  hasOwnershipChange ? `ownership: ${existingDevice.ownerId} -> ${discoveredDevice.ownerId}` : '',
                  hasConnectionChange ? `connected: ${existingDevice.connected} -> ${discoveredDevice.hasValidCredential === true}` : '');
                
                // Update existing device
                const updatedDevices = [...prevDevices];
                updatedDevices[existingIndex] = {
                  ...existingDevice,
                  ownerId: discoveredDevice.ownerId,
                  connected: discoveredDevice.hasValidCredential === true,
                  lastSeen: discoveredDevice.lastSeen || Date.now(),
                  online: discoveredDevice.online !== false
                };
                return updatedDevices;
              } else {
                console.log('[useDeviceDiscovery] Device already in list with same state, skipping');
                return prevDevices;
              }
            }
            
            // console.log('[useDeviceDiscovery] Adding newly discovered device:', discoveredDevice.deviceId);
            const newDevice: Device = {
              id: discoveredDevice.deviceId,
              name: discoveredDevice.name || discoveredDevice.deviceId,
              type: discoveredDevice.deviceType || 'Unknown',
              address: discoveredDevice.address || 'Unknown',
              port: discoveredDevice.port || 0,
              lastSeen: discoveredDevice.lastSeen || Date.now(),
              online: discoveredDevice.online !== false, // Default to true if not explicitly false
              connected: discoveredDevice.hasValidCredential === true,
              enabled: true,
              blueLedStatus: discoveredDevice.blueLedStatus || (discoveredDevice.deviceType === 'ESP32' ? 'off' : undefined),
              ownerId: discoveredDevice.ownerId
            };
            
            return [...prevDevices, newDevice];
          });
        }
      },
      {
        name: 'onDeviceUpdated',
        handler: (deviceId: string) => {
          if (!deviceId) {
            console.log('[useDeviceDiscovery] Invalid device update received - missing deviceId');
            return;
          }

          // Fetch full authoritative state from DeviceDiscoveryModel
          const updatedDevice = discoveryModel.getDevice(deviceId);
          if (!updatedDevice) {
            console.log('[useDeviceDiscovery] Device not found in discovery model:', deviceId);
            return;
          }
          console.log('[useDeviceDiscovery] Device update for:', deviceId);
          
          // Update only the specific device that changed
          setDevices(prevDevices => {
            const existingIndex = prevDevices.findIndex(d => d.id === deviceId);
            if (existingIndex === -1) {
              // Device not in list - add it now (handles case where onDeviceDiscovered was missed)
              console.log('[useDeviceDiscovery] Device not found in list, adding from update event:', deviceId);
              const newDevice: Device = {
                id: updatedDevice.deviceId,
                name: updatedDevice.name || updatedDevice.deviceId,
                type: updatedDevice.deviceType || 'ESP32',
                address: updatedDevice.address || 'Unknown',
                port: updatedDevice.port || 0,
                lastSeen: updatedDevice.lastSeen || Date.now(),
                online: updatedDevice.online !== false,
                connected: updatedDevice.hasValidCredential === true,
                enabled: true,
                blueLedStatus: updatedDevice.blueLedStatus || (updatedDevice.deviceType === 'ESP32' ? 'off' : undefined),
                ownerId: updatedDevice.ownerId
              };
              return [...prevDevices, newDevice];
            }

            const existingDevice = prevDevices[existingIndex];

            // Create new device from authoritative state - no partial merging
            const updated: Device = {
              id: updatedDevice.deviceId,
              name: updatedDevice.name || existingDevice.name,
              type: updatedDevice.deviceType || existingDevice.type,
              address: updatedDevice.address || existingDevice.address,
              port: updatedDevice.port ?? existingDevice.port,
              lastSeen: updatedDevice.lastSeen || existingDevice.lastSeen,
              online: updatedDevice.online !== false,
              connected: updatedDevice.hasValidCredential === true,
              enabled: existingDevice.enabled,
              blueLedStatus: updatedDevice.blueLedStatus || existingDevice.blueLedStatus,
              ownerId: updatedDevice.ownerId
            };

            // Log significant changes
            if (existingDevice.ownerId !== updated.ownerId) {
              console.log(`[useDeviceDiscovery] Ownership changed for ${deviceId}: ${existingDevice.ownerId} -> ${updated.ownerId}`);
            }
            if (existingDevice.connected !== updated.connected) {
              console.log(`[useDeviceDiscovery] Connection status changed for ${deviceId}: ${existingDevice.connected} -> ${updated.connected}`);
            }
            if (existingDevice.online !== updated.online) {
              console.log(`[useDeviceDiscovery] Online status changed for ${deviceId}: ${existingDevice.online} -> ${updated.online}`);
            }

            // Replace the device in the array
            const newDevices = [...prevDevices];
            newDevices[existingIndex] = updated;
            return newDevices;
          });
        }
      },
      { 
        name: 'onDeviceLost', 
        handler: (lostDeviceId: string) => {
          console.log('[useDeviceDiscovery] onDeviceLost event received for:', lostDeviceId);
          // Remove the device directly from the list
          setDevices(prevDevices => {
            const filtered = prevDevices.filter(d => d.id !== lostDeviceId);
            if (filtered.length !== prevDevices.length) {
              console.log('[useDeviceDiscovery] Removed lost device:', lostDeviceId);
            }
            return filtered;
          });
        }
      },
      { 
        name: 'onDiscoveryStarted', 
        handler: () => {
          console.log('[useDeviceDiscovery] onDiscoveryStarted event received');
          if (!isMountedRef.current) {
            console.log('[useDeviceDiscovery] Component unmounted, ignoring event');
            return;
          }
          console.log('[useDeviceDiscovery] About to set isDiscoveryRunning to true');
          try {
            setHasReceivedDiscoveryEvent(true);
            setIsDiscoveryRunning(true);
            console.log('[useDeviceDiscovery] isDiscoveryRunning set to true successfully');
          } catch (error) {
            console.error('[useDeviceDiscovery] Error setting isDiscoveryRunning:', error);
          }
        }
      },
      { 
        name: 'onDiscoveryStopped', 
        handler: () => {
          console.log('[useDeviceDiscovery] onDiscoveryStopped event received');
          console.log('[useDeviceDiscovery] About to set isDiscoveryRunning to false');
          try {
            setHasReceivedDiscoveryEvent(true);
            setIsDiscoveryRunning(false);
            console.log('[useDeviceDiscovery] isDiscoveryRunning set to false successfully');
          } catch (error) {
            console.error('[useDeviceDiscovery] Error setting isDiscoveryRunning:', error);
          }
        }
      }
    ];
    
    events.forEach(({ name, handler }) => {
      try {
        console.log(`[useDeviceDiscovery] Setting up listener for ${name}`);
        const eventEmitter = discoveryModel[name];
        if (!eventEmitter) {
          console.error(`[useDeviceDiscovery] Event emitter ${name} is undefined on discovery model`);
          return;
        }
        if (typeof eventEmitter.listen !== 'function') {
          console.error(`[useDeviceDiscovery] Event emitter ${name} does not have listen method`);
          return;
        }
        const unsubscribe = eventEmitter.listen(handler);
        unsubscribers.push(unsubscribe);
        console.log(`[useDeviceDiscovery] Successfully registered listener for ${name}`);
      } catch (error) {
        console.error(`[useDeviceDiscovery] Error setting up ${name}:`, error);
      }
    });
    
    // Set up ESP32 authentication listener
    console.log('[useDeviceDiscovery] ESP32 authentication listeners will be set up when ESP32ConnectionManager is initialized');
    // Note: ESP32ConnectionManager will be initialized lazily when needed
    // We'll rely on device update events instead of direct authentication events
    
    // LED status listener removed - ESP32ConnectionManager handles all ESP32 messages on service type 3
    // This prevents conflicts with multiple handlers for the same service type
    // The ESP32ConnectionManager will emit events that we can listen to for LED status updates
    
    // Periodic timeout check - only for removing stale devices
    const interval = setInterval(() => {
      // Only update online status for devices that haven't been seen recently
      const currentTime = Date.now();
      setDevices(prevDevices => {
        let hasChanges = false;
        const updated = prevDevices.map(device => {
          if (device.online && device.lastSeen) {
            const timeSinceLastSeen = currentTime - device.lastSeen;
            if (timeSinceLastSeen > DEVICE_TIMEOUT_MS) {
              console.log(`[useDeviceDiscovery] Device ${device.id} heartbeat stopped - marking offline (last seen ${Math.round(timeSinceLastSeen/1000)}s ago)`);
              hasChanges = true;
              return { ...device, online: false };
            }
          }
          return device;
        });
        return hasChanges ? updated : prevDevices;
      });
    }, 30000);
    
    return () => {
      console.log('[useDeviceDiscovery] Cleaning up effect - removing listeners');
      clearTimeout(loadTimer);
      clearInterval(interval);
      unsubscribers.forEach(unsubscribe => {
        try { 
          unsubscribe(); 
        } catch (e) {
          console.error('[useDeviceDiscovery] Error unsubscribing:', e);
        }
      });
    };
  }, []);
  
  // Sync discovery state - only update from settings if we haven't received discovery events yet
  // This prevents settings from overriding the actual discovery state from model events
  useEffect(() => {
    if (hasReceivedDiscoveryEvent) {
      // Once we've received discovery events, ignore settings sync - events are authoritative
      console.log('[useDeviceDiscovery] Ignoring settings sync - using discovery events as source of truth');
      return;
    }
    
    const currentEnabled = !!deviceSettings?.discoveryEnabled;
    if (currentEnabled !== isDiscoveryRunning) {
      console.log(`[useDeviceDiscovery] Settings sync: discoveryEnabled=${currentEnabled}, isDiscoveryRunning=${isDiscoveryRunning}`);
      setIsDiscoveryRunning(currentEnabled);
    }
  }, [deviceSettings?.discoveryEnabled, hasReceivedDiscoveryEvent, isDiscoveryRunning]);
  
  return {
    devices,
    refreshing,
    isDiscoveryRunning,
    isLoading,
    error,
    loadDevices,
    handleRefresh,
    toggleDiscovery,
    toggleBlueLED,
    removeDevice,
    removeDeviceWithCredentials,
    currentUserPersonId: getInstanceOwnerIdHash() as SHA256IdHash<Person>,
    deviceSettings,
    pendingLEDCommands: Object.keys(pendingLEDCommands)
  };
}