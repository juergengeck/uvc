import React, { useState, useCallback, useMemo } from 'react';
import { View, FlatList, RefreshControl, Alert, Platform } from 'react-native';
import {
  Text, Button, Switch, Searchbar, FAB, Chip, Divider,
  ActivityIndicator, useTheme, IconButton
} from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme as useAppTheme } from '@src/providers/app/AppTheme';
import { useDeviceDiscovery } from '@src/hooks/devices/useDeviceDiscovery';
import { useDeviceDiscoveryDebug } from '@src/hooks/devices/useDeviceDiscoveryDebug';
import { DeviceItem, Device } from '@src/components/devices/DeviceItem';
import { DeviceDiscoveryModel } from '@src/models/network';
import { ModelService } from '@src/services/ModelService';
import VerifiableCredentialModel from '@src/models/credentials/VerifiableCredentialModel';
import { DeviceType } from '@src/types/device';
import { QuicModel } from '@src/models/network/QuicModel';
import profiler from '@src/utils/performanceProfiler';
import { useAppModel } from '@src/hooks/useAppModel';
import { useModelState } from '@src/hooks/useModelState';

/**
 * Send ownership credential to ESP32 device via Type 7 VC exchange
 */
// NOTE: sendESP32CredentialViaVCExchange() removed - ownership now happens via QUIC-VC claimDevice()

export function DeviceListScreen() {
  // Removed verbose logging for performance
  
  const { t } = useTranslation('devices');
  const theme = useTheme();
  const { styles: themedStyles } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const appModel = useAppModel();
  const organisationModel = appModel?.organisationModel;
  const { isReady: isOrgModelReady } = useModelState(organisationModel, 'OrganisationModel');
  
  // Hooks initialized
  
  // Enable discovery debugging
  useDeviceDiscoveryDebug();
  
  // Debug state changes
  React.useEffect(() => {
    console.log('[DeviceListScreen] isBTLEAvailable state changed to:', isBTLEAvailable);
  }, [isBTLEAvailable]);

  React.useEffect(() => {
    console.log('[DeviceListScreen] isBTLEDiscovering state changed to:', isBTLEDiscovering);
  }, [isBTLEDiscovering]);
  
  // Fetch organisation paths for owned devices
  // DISABLED: This was causing 5s UI delays because it runs on every device update
  // and getDeviceOrganisationPath() is slow
  // React.useEffect(() => {
  //   const fetchOrgPaths = async () => {
  //     if (!isOrgModelReady || !organisationModel || !devices.length) return;
  //
  //     const newPaths = new Map<string, string>();
  //     const ownedDevices = devices.filter(d => d.ownerId === currentUserPersonId);
  //
  //     for (const device of ownedDevices) {
  //       try {
  //         const pathInfo = await organisationModel.getDeviceOrganisationPath(device.id);
  //         if (pathInfo) {
  //           newPaths.set(device.id, pathInfo.path);
  //         }
  //       } catch (error) {
  //         console.warn(`[DeviceListScreen] Failed to get org path for device ${device.id}:`, error);
  //       }
  //     }
  //
  //     setDeviceOrgPaths(newPaths);
  //   };
  //
  //   fetchOrgPaths();
  // }, [devices, currentUserPersonId, isOrgModelReady, organisationModel]);

  // Initialize on mount and track discovery state
  React.useEffect(() => {
    checkBTLEAvailability();
    
    // Cleanup on unmount
    return () => {
      if (btleServiceRef.current) {
        try {
          if (typeof btleServiceRef.current.removeAllListeners === 'function') {
            btleServiceRef.current.removeAllListeners('deviceDiscovered');
            btleServiceRef.current.removeAllListeners('scanStarted');
            btleServiceRef.current.removeAllListeners('scanStopped');
          }
          // Check if stopScan exists before calling it
          if (typeof btleServiceRef.current.stopScan === 'function') {
            btleServiceRef.current.stopScan().catch(() => {
              // Ignore errors on cleanup
            });
          }
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    };
  }, []);
  
  const checkBTLEAvailability = async () => {
    try {
      console.log('[DeviceListScreen] Checking BTLE availability...');
      const { btleService } = await import('@src/services/BLETurboModule');
      btleServiceRef.current = btleService;
      
      // Store globally for DeviceDiscoveryModel to use
      (global as any).__btleService = btleService;
      
      console.log('[DeviceListScreen] Initializing BTLE service from one.btle...');
      const initialized = await btleService.initialize();
      console.log('[DeviceListScreen] BTLE initialized:', initialized);
      
      const state = await btleService.getState();
      console.log('[DeviceListScreen] BLE state:', state);

      
      if (initialized) {
        // Check if state is PoweredOn instead of calling isBTLEAvailable
        // to avoid timing issues
        const available = state === 'PoweredOn';
        console.log('[DeviceListScreen] BTLE available (based on state):', available);
        setIsBTLEAvailable(available);
        btleAvailableRef.current = available; // Update ref immediately
        
        // Set up state change listener to keep UI in sync
        btleService.on('stateChanged', (newState: string) => {
          console.log('[DeviceListScreen] BLE state changed to:', newState);
          const isAvailable = newState === 'PoweredOn';
          console.log('[DeviceListScreen] Updating isBTLEAvailable to:', isAvailable);
          setIsBTLEAvailable(isAvailable);
          btleAvailableRef.current = isAvailable;
        });
        
        if (available) {
          // Set up event listeners for BTLE discovery
          btleService.on('deviceDiscovered', (device: any) => {
            console.log('[DeviceListScreen] BTLE device discovered:', device.name, device.id);
            setBTLEDevices(prev => {
              const existingIndex = prev.findIndex(d => d.id === device.id);
              if (existingIndex >= 0) {
                const updated = [...prev];
                updated[existingIndex] = {
                  id: device.id,
                  name: device.name || `Device ${device.id.slice(0, 6)}`,
                  lastSeen: new Date(),
                  status: 'disconnected' as const,
                  rssi: device.rssi,
                  discoveryMethod: 'BTLE'
                };
                return updated;
              }
              return [...prev, {
                id: device.id,
                name: device.name || `Device ${device.id.slice(0, 6)}`,
                lastSeen: new Date(),
                status: 'disconnected' as const,
                rssi: device.rssi,
                discoveryMethod: 'BTLE'
              }];
            });
          });
          
          btleService.on('scanStarted', () => {
            console.log('[DeviceListScreen] BTLE scan started');
            setIsBTLEDiscovering(true);
          });
          
          btleService.on('scanStopped', () => {
            console.log('[DeviceListScreen] BTLE scan stopped');
            setIsBTLEDiscovering(false);
          });
        }
      } else {
        console.log('[DeviceListScreen] BTLE initialization failed, state:', state);
        // Try to determine if BLE might still work despite init failure
        if (state !== 'Unknown' && state !== 'Unsupported') {
          console.log('[DeviceListScreen] BLE state indicates it might still work, setting available based on state and setting up listeners');
          const fallbackAvailable = state === 'PoweredOn';
          setIsBTLEAvailable(fallbackAvailable);
          btleAvailableRef.current = fallbackAvailable;
          
          // Set up state change listener to keep UI in sync
          btleService.on('stateChanged', (newState: string) => {
            console.log('[DeviceListScreen] BLE state changed to (fallback path):', newState);
            const isAvailable = newState === 'PoweredOn';
            console.log('[DeviceListScreen] Updating isBTLEAvailable to (fallback):', isAvailable);
            setIsBTLEAvailable(isAvailable);
            btleAvailableRef.current = isAvailable;
          });
          
          // Set up event listeners even if initialization failed
          btleService.on('deviceDiscovered', (device: any) => {
            console.log('[DeviceListScreen] BTLE device discovered:', device.name, device.id);
            setBTLEDevices(prev => {
              const existingIndex = prev.findIndex(d => d.id === device.id);
              if (existingIndex >= 0) {
                const updated = [...prev];
                updated[existingIndex] = {
                  id: device.id,
                  name: device.name || `Device ${device.id.slice(0, 6)}`,
                  lastSeen: new Date(),
                  status: 'disconnected' as const,
                  rssi: device.rssi,
                  discoveryMethod: 'BTLE'
                };
                return updated;
              }
              return [...prev, {
                id: device.id,
                name: device.name || `Device ${device.id.slice(0, 6)}`,
                lastSeen: new Date(),
                status: 'disconnected' as const,
                rssi: device.rssi,
                discoveryMethod: 'BTLE'
              }];
            });
          });
          
          btleService.on('scanStarted', () => {
            console.log('[DeviceListScreen] BTLE scan started');
            setIsBTLEDiscovering(true);
          });
          
          btleService.on('scanStopped', () => {
            console.log('[DeviceListScreen] BTLE scan stopped');
            setIsBTLEDiscovering(false);
          });
        } else {
          setIsBTLEAvailable(false);
        }
      }
    } catch (error) {
      console.error('[DeviceListScreen] Error checking BTLE availability:', error);
      setIsBTLEAvailable(false);
    }
  };
  
  let deviceDiscoveryHook;
  try {
    deviceDiscoveryHook = useDeviceDiscovery();
  } catch (hookError) {
    console.error('[DeviceListScreen] Error in useDeviceDiscovery hook:', hookError);
    console.error('[DeviceListScreen] Hook error stack:', hookError instanceof Error ? hookError.stack : 'No stack');
    throw hookError; // Re-throw to see the full error
  }
  
  const {
    devices,
    refreshing,
    isDiscoveryRunning,
    isLoading,
    error,
    handleRefresh,
    toggleDiscovery,
    toggleBlueLED,
    removeDevice,
    removeDeviceWithCredentials,
    currentUserPersonId,
    deviceSettings,
    pendingLEDCommands
  } = deviceDiscoveryHook;
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string | null>(null);
  const [isTogglingDiscovery, setIsTogglingDiscovery] = useState(false);
  const [claimingDevices, setClaimingDevices] = useState<Set<string>>(new Set());
  const [removingDevices, setRemovingDevices] = useState<Set<string>>(new Set());
  
  // Track organisation paths for devices
  const [deviceOrgPaths, setDeviceOrgPaths] = useState<Map<string, string>>(new Map());
  
  // BTLE state
  const [isBTLEDiscovering, setIsBTLEDiscovering] = useState(false);
  const [isTogglingBTLE, setIsTogglingBTLE] = useState(false);
  const [isBTLEAvailable, setIsBTLEAvailable] = useState(false);
  const [btleDevices, setBTLEDevices] = useState<Map<string, Device>>(new Map());
  const btleServiceRef = React.useRef<any>(null);
  const btleAvailableRef = React.useRef<boolean>(false);
  
  // SINGLE CONTROL FLOW: This is the ONLY place that removes devices from claimingDevices
  // Monitors claiming devices and removes them when operation is complete
  // We need to track what operation was started to know when it's complete
  const [claimingOperations, setClaimingOperations] = useState<Map<string, 'claim' | 'revoke'>>(new Map());
  
  React.useEffect(() => {
    // Only process if there are claiming devices
    if (claimingDevices.size === 0) return;
    
    const discoveryModel = DeviceDiscoveryModel.getInstance();
    const esp32Manager = discoveryModel['_esp32ConnectionManager'];
    
    // Check each claiming device to see if operation is complete
    const toRemove: string[] = [];
    claimingDevices.forEach(deviceId => {
      const device = devices.find(d => d.id === deviceId);
      const operation = claimingOperations.get(deviceId);
      
      // If device is no longer in the list, remove from claiming
      if (!device) {
        console.log(`[DeviceListScreen] Device ${deviceId} no longer in list, removing from claiming set`);
        toRemove.push(deviceId);
        return;
      }
      
      // Check if operation is complete based on what we were trying to do
      if (operation === 'claim') {
        // For claiming, wait until device is owned by current user
        if (device.ownerId === currentUserPersonId) {
          // Ownership is enough - authentication can happen in background
          console.log(`[DeviceListScreen] Device ${deviceId} is owned by current user, removing from claiming set`);
          toRemove.push(deviceId);
        }
      } else if (operation === 'revoke') {
        // For revocation, wait until device has no owner
        if (!device.ownerId) {
          console.log(`[DeviceListScreen] Device ${deviceId} revocation complete (no owner), removing from claiming set`);
          toRemove.push(deviceId);
        }
      } else {
        // No operation tracked, use old logic as fallback
        if (device.ownerId === currentUserPersonId) {
          if (device.type === 'ESP32' && esp32Manager) {
            const esp32Device = esp32Manager.getDevice(deviceId);
            if (esp32Device && esp32Device.isAuthenticated) {
              console.log(`[DeviceListScreen] ESP32 device ${deviceId} is authenticated and owned, removing from claiming set`);
              toRemove.push(deviceId);
            }
          } else {
            console.log(`[DeviceListScreen] Device ${deviceId} is owned, removing from claiming set`);
            toRemove.push(deviceId);
          }
        }
      }
      // Otherwise keep in claiming state (operation in progress)
    });
    
    // Remove all completed devices at once
    if (toRemove.length > 0) {
      setClaimingDevices(prev => {
        const next = new Set(prev);
        toRemove.forEach(id => next.delete(id));
        console.log(`[DeviceListScreen] Removed ${toRemove.length} devices from claiming set, ${next.size} remaining`);
        return next;
      });
      
      // Also clean up operations map
      setClaimingOperations(prev => {
        const next = new Map(prev);
        toRemove.forEach(id => next.delete(id));
        return next;
      });
    }
  }, [devices, currentUserPersonId, claimingDevices, claimingOperations]);
  
  // No timeout - keep device in claiming state until it's fully ready
  // The user can always refresh the screen if something goes wrong
  
  // Combine UDP and BTLE devices
  const allDevices = useMemo(() => {
    // Start with UDP discovered devices
    const combinedDevices = [...devices];
    
    // Add BTLE devices that aren't already in the list
    btleDevices.forEach((btleDevice) => {
      const exists = combinedDevices.some(d => d.id === btleDevice.id);
      if (!exists) {
        combinedDevices.push(btleDevice);
      }
    });
    
    return combinedDevices;
  }, [devices, btleDevices]);
  
  // Filter and sort devices
  const filteredDevices = useMemo(() => {
    const filtered = allDevices.filter(device => {
      const matchesSearch = !searchQuery || 
        device.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        device.address.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesType = !filterType || device.type === filterType;
      
      return matchesSearch && matchesType;
    });
    
    // Sort devices: prioritize devices with proper discovery (ESP32 with credentials, QUICVC protocol)
    filtered.sort((a, b) => {
      // Priority 1: Owned devices (have ownerId)
      const aOwned = !!a.ownerId;
      const bOwned = !!b.ownerId;
      if (aOwned !== bOwned) return aOwned ? -1 : 1;
      
      // Priority 2: ESP32 devices with valid credentials/discovery
      const aIsProperESP32 = a.type === 'ESP32' && (a.connected || a.ownerId);
      const bIsProperESP32 = b.type === 'ESP32' && (b.connected || b.ownerId);
      if (aIsProperESP32 !== bIsProperESP32) return aIsProperESP32 ? -1 : 1;
      
      // Priority 3: Any ESP32 device
      const aIsESP32 = a.type === 'ESP32';
      const bIsESP32 = b.type === 'ESP32';
      if (aIsESP32 !== bIsESP32) return aIsESP32 ? -1 : 1;
      
      // Priority 4: Online devices
      if (a.online !== b.online) return a.online ? -1 : 1;
      
      // Priority 5: Connected devices
      if (a.connected !== b.connected) return a.connected ? -1 : 1;
      
      // Priority 6: Sort by name
      return a.name.localeCompare(b.name);
    });
    
    return filtered;
  }, [allDevices, searchQuery, filterType]);
  
  // Get unique device types
  const deviceTypes = useMemo(() => {
    return [...new Set(allDevices.map(device => device.type))];
  }, [allDevices]);
  
  const handleToggleWiFiDiscovery = useCallback(async () => {
    console.log('[DeviceListScreen] handleToggleWiFiDiscovery called');
    console.log('[DeviceListScreen] Current WiFi discovery state:', isDiscoveryRunning);
    
    setIsTogglingDiscovery(true);
    try {
      // Get the DeviceDiscoveryModel directly
      const globalCtx: any = window as any;
      const discoveryModel = globalCtx?.appModel?.deviceDiscoveryModel || DeviceDiscoveryModel.getInstance();
      
      if (!discoveryModel) {
        console.error('[DeviceListScreen] DeviceDiscoveryModel not available');
        Alert.alert(t('error.title'), 'Discovery service not available');
        return;
      }
      
      if (isDiscoveryRunning) {
        console.log('[DeviceListScreen] Stopping WiFi/UDP discovery...');
        await discoveryModel.stopDiscovery();
      } else {
        console.log('[DeviceListScreen] Starting WiFi/UDP discovery...');
        // Enable discovery in model first
        discoveryModel.setForciblyDisabled(false);
        await discoveryModel.startDiscovery();
      }
      
      console.log('[DeviceListScreen] WiFi discovery toggle completed');
    } catch (error) {
      console.error('[DeviceListScreen] Error toggling WiFi discovery:', error);
      Alert.alert(t('error.title'), t('error.toggleDiscovery'));
    } finally {
      setIsTogglingDiscovery(false);
    }
  }, [isDiscoveryRunning, t]);
  
  const handleToggleBTLE = useCallback(async () => {
    console.log('[DeviceListScreen] handleToggleBTLE called');
    
    // Check availability directly from service instead of stale state
    if (!btleServiceRef.current) {
      console.log('[DeviceListScreen] BTLE service not initialized');
      Alert.alert(
        t('error.title'),
        'Bluetooth service not initialized. Please try again.'
      );
      return;
    }
    
    // Get current state from service
    const currentState = await btleServiceRef.current.getState();
    const available = currentState === 'PoweredOn';
    
    console.log('[DeviceListScreen] Current BTLE state from service:', currentState);
    console.log('[DeviceListScreen] BTLE available:', available);
    
    if (!available) {
      console.log('[DeviceListScreen] BTLE not available, cannot toggle');
      Alert.alert(
        t('error.title'),
        'Bluetooth is not available. Please enable Bluetooth in your device settings.'
      );
      return;
    }
    
    setIsTogglingBTLE(true);
    
    try {
      if (!btleServiceRef.current) {
        console.error('[DeviceListScreen] BTLE service not initialized, trying to reinitialize...');
        await checkBTLEAvailability();
        
        if (!btleServiceRef.current) {
          throw new Error('BTLE service could not be initialized');
        }
      }
      
      const btleService = btleServiceRef.current;
      
      if (isBTLEDiscovering) {
        console.log('[DeviceListScreen] Stopping BTLE scan...');
        btleService.removeAllListeners('deviceDiscovered');
        await btleService.stopScan();
        setIsBTLEDiscovering(false);
        // Clear BTLE devices when stopping discovery
        setBTLEDevices(new Map());
      } else {
        console.log('[DeviceListScreen] Starting BTLE scan...');
        
        // Clear previous listeners
        btleService.removeAllListeners('deviceDiscovered');
        
        // Set up device discovery listener
        btleService.on('deviceDiscovered', (bleDevice: any) => {
          console.log('[DeviceListScreen] BTLE device discovered:', bleDevice);
          
          // Convert BLE device to our Device format
          const device: Device = {
            id: bleDevice.id,
            name: bleDevice.name || `${bleDevice.type}_${bleDevice.id.slice(0, 6)}`,
            address: 'BLE', // BLE devices don't have IP addresses
            port: 0, // No port for BLE
            type: bleDevice.type === 'ESP32' ? 'ESP32' : bleDevice.type,
            connected: bleDevice.isConnected || false,
            lastSeen: bleDevice.lastSeen || Date.now(),
            isAuthenticated: false,
            hasValidCredential: false,
            ownerId: undefined,
            publicKey: undefined,
            rssi: bleDevice.rssi,
            discoveryMethod: 'BTLE'
          };
          
          // Add to BTLE devices map
          setBTLEDevices(prev => {
            const newMap = new Map(prev);
            newMap.set(device.id, device);
            console.log(`[DeviceListScreen] BTLE devices count: ${newMap.size}`);
            return newMap;
          });
        });
        
        await btleService.startScan();
        setIsBTLEDiscovering(true);
      }
    } catch (error) {
      console.error('[DeviceListScreen] Error toggling BTLE discovery:', error);
      Alert.alert(
        t('error.title'),
        t('error.btleToggleFailed')
      );
    } finally {
      setIsTogglingBTLE(false);
    }
  }, [isBTLEDiscovering, t]);
  
  const handleToggleOwnership = useCallback(async (device: Device) => {
    console.log(`[DeviceListScreen] handleToggleOwnership called for device: ${device.id}, type: ${device.type}`);
    const isOwnedByCurrentUser = device.ownerId === currentUserPersonId;
    console.log(`[DeviceListScreen] Device ownership check: isOwnedByCurrentUser=${isOwnedByCurrentUser}, device.ownerId=${device.ownerId}, currentUserPersonId=${currentUserPersonId}`);
    
    const operationId = isOwnedByCurrentUser ? `release_ownership_${device.id}` : `take_ownership_${device.id}`;
    profiler.startOperation(operationId, { deviceId: device.id, deviceType: device.type, isOwned: isOwnedByCurrentUser });
    
    // Check if device is already in claiming state
    if (claimingDevices.has(device.id)) {
      console.log(`[DeviceListScreen] Device ${device.id} is already being claimed/unclaimed, ignoring toggle`);
      profiler.endOperation(operationId, { skipped: true, reason: 'already_in_progress' });
      return;
    }
    
    profiler.checkpoint('Pre-checks complete');
    
    // Add device to claiming set to show loading state
    const operationType = isOwnedByCurrentUser ? 'revoke' : 'claim';
    console.log(`[DeviceListScreen] Adding ${device.id} to claimingDevices for ${operationType} operation`);
    setClaimingDevices(prev => {
      const next = new Set(prev);
      next.add(device.id);
      console.log(`[DeviceListScreen] claimingDevices updated: ${Array.from(next).join(', ')}`);
      return next;
    });
    
    // Track what operation we're doing
    setClaimingOperations(prev => {
      const next = new Map(prev);
      next.set(device.id, operationType);
      return next;
    });
    
    profiler.checkpoint('UI state updated');
    
    try {
      if (!isOwnedByCurrentUser) {
        // Use VC exchange for ESP32 devices, old credential system for others
        if (device.type === 'ESP32') {
          console.log(`[DeviceListScreen] ESP32 device detected, starting VC exchange`);
          
          profiler.checkpoint('Getting discovery model');
          const discoveryModel = DeviceDiscoveryModel.getInstance();
          console.log(`[DeviceListScreen] Got discovery model: ${!!discoveryModel}`);
          profiler.checkpoint('Getting ESP32 connection manager');
          const esp32ConnectionManager = await discoveryModel.getESP32ConnectionManager();
          console.log(`[DeviceListScreen] Got ESP32 connection manager: ${!!esp32ConnectionManager}`);
          profiler.checkpoint('Managers acquired');
          
          if (!esp32ConnectionManager) {
            throw new Error('ESP32 connection manager not available');
          }
          
          console.log(`[DeviceListScreen] Calling authenticateDevice for ${device.id} at ${device.address}:${device.port}`);
          
          // Check if device is actually owned after initial state
          // The device object might have stale ownership info
          const currentDevice = discoveryModel.getDevice(device.id);
          if (currentDevice?.ownerId === currentUserPersonId) {
            console.log(`[DeviceListScreen] Device ${device.id} is already owned by current user after authentication check`);
            // Don't remove from claiming set here - let the effect handle it
            console.log(`[DeviceListScreen] Device ${device.id} is already owned, effect will handle claiming state`);
            profiler.endOperation(operationId, { success: true, reason: 'already_owned' });
            return;
          }

          // NOTE: Legacy unclaimed listener flow removed - ownership now happens via QUIC-VC claimDevice()

          // Use claimDeviceOwnership method which establishes QUIC-VC connection and claims ownership
          console.log(`[DeviceListScreen] About to call claimDeviceOwnership...`);
          profiler.startOperation('claim_device', { deviceId: device.id });
          let success = await discoveryModel.claimDeviceOwnership(device.id);
          profiler.endOperation('claim_device', { success });
          console.log(`[DeviceListScreen] claimDevice returned: ${success}`);

          // Retry once on failure (ESP32 might have missed the packet)
          if (!success) {
            console.log(`[DeviceListScreen] First claim attempt failed, retrying after 500ms...`);
            await new Promise(resolve => setTimeout(resolve, 500));
            profiler.startOperation('claim_device_retry', { deviceId: device.id });
            success = await discoveryModel.claimDeviceOwnership(device.id);
            profiler.endOperation('claim_device_retry', { success });
            console.log(`[DeviceListScreen] claimDevice retry returned: ${success}`);
          }

          if (!success) {
            // Don't clean up listeners yet - the ESP32 might still respond
            console.log(`[DeviceListScreen] Device ${device.id} claim timed out after retry, but keeping listeners active`);
            
            // Don't remove from claiming set - let the ownership confirmation remove it
            // This prevents the toggle from appearing in wrong state
            
            profiler.endOperation(operationId, { success: false, reason: 'timeout' });
            // Don't return - let the ownership update event handle cleanup
          } else {
            // Success! claimDevice() completed
            // DON'T remove from claiming set yet!
            // Keep the device in claiming state (toggle hidden) until the ownership update arrives
            // This prevents the empty toggle from showing
            // The useDeviceDiscovery hook will remove it from claiming when ownership is confirmed

            console.log(`[DeviceListScreen] Device ${device.id} successfully claimed, keeping in claiming state until ownership confirmed`);
          }
        } else {
          // For non-ESP32 devices, use the old credential system
          const discoveryModel = DeviceDiscoveryModel.getInstance();
          const leuteModel = ModelService.getLeuteModel();
          
          if (!leuteModel) {
            throw new Error('LeuteModel not available');
          }
          
          const credentialModel = await VerifiableCredentialModel.ensureInitialized(leuteModel);
          const credential = await credentialModel.createDeviceOwnershipCredential(
            currentUserPersonId,
            device.id,
            device.type || 'ESP32'
          );
          
          // No fallbacks - only send if we have a valid port
          if (!device.port || device.port <= 0) {
            throw new Error(`Device ${device.name} has no valid port. Cannot send credential.`);
          }
          
          const success = await credentialModel.sendCredentialToDevice(
            credential,
            device.address,
            device.port
          );
          
          if (!success) {
            throw new Error('Device did not confirm ownership');
          }
          
          // Device acknowledged - update ownership will happen automatically
          // via the VerifiableCredentialModel's acknowledgment handler
          
          // Don't remove from claiming set here - let the effect handle it
          console.log(`[DeviceListScreen] Non-ESP32 device ${device.id} claimed, effect will handle claiming state`);
        }
      } else {
        // Remove ownership
        console.log(`[DeviceListScreen] Removing ownership from device ${device.id}`);
        
        // Already added to claiming set above (line 597) - it will be removed when revocation completes
        
        const discoveryModel = DeviceDiscoveryModel.getInstance();
        
        if (device.type === 'ESP32') {
          // For ESP32 devices, use the centralized removeDeviceOwnership method
          // This handles both ESP32 communication AND local state cleanup
          console.log(`[DeviceListScreen] Removing ESP32 ownership via centralized method`);
          await discoveryModel.removeDeviceOwnership(device.id);
        } else {
          // For non-ESP32 devices, use the old credential removal method
          const credentialModel = await VerifiableCredentialModel.ensureInitialized(ModelService.getLeuteModel()!);

          const removalCommand = {
            type: 'credential_remove' as const,
            senderPersonId: currentUserPersonId,
            deviceId: device.id,
            timestamp: Date.now()
          };

          console.log(`[DeviceListScreen] Sending credential removal command to ${device.address}:${device.port}`);

          const success = await credentialModel.sendCredentialRemovalToDevice(
            removalCommand,
            device.address,
            device.port
          );

          console.log(`[DeviceListScreen] Credential removal ${success ? 'succeeded' : 'failed'}`);

          // Remove from local device list
          await discoveryModel.removeDeviceOwnership(device.id);
        }

        // Ownership removed - remove from claiming set immediately
        console.log(`[DeviceListScreen] Device ${device.id} ownership removed, removing from claiming set`);
        setClaimingDevices(prev => {
          const next = new Set(prev);
          next.delete(device.id);
          return next;
        });
        setClaimingOperations(prev => {
          const next = new Map(prev);
          next.delete(device.id);
          return next;
        });
        
        profiler.endOperation(operationId, { success: true });
        console.log(`[DeviceListScreen] Ownership removal initiated, device will update its broadcast`);
      }
    } catch (error: any) {
      console.error(`[DeviceListScreen] Error in handleToggleOwnership:`, error);
      Alert.alert(
        t('error.title'), 
        error?.message || t('error.ownershipChange')
      );
      
      // Don't remove from claiming set on error - let user retry or refresh
      console.log(`[DeviceListScreen] Error claiming ${device.id}, keeping in claiming state for retry`);
      profiler.endOperation(operationId, { success: false, error: error.message });
    }
  }, [currentUserPersonId, t, handleRefresh, claimingDevices]);
  
  
  const handleRemoveDevice = useCallback((device: Device) => {
    Alert.alert(
      t('remove.title'),
      t('remove.confirm', { name: device.name }),
      [
        { text: t('common:cancel'), style: 'cancel' },
        {
          text: t('common:remove'),
          style: 'destructive',
          onPress: async () => {
            try {
              // Mark device as being removed
              setRemovingDevices(prev => new Set([...prev, device.id]));
              
              await removeDeviceWithCredentials(device);
              // Don't refresh immediately - let the device removal events update the list
              // This prevents double loading spinners
              
              // Device should be removed from list by events, but clear the removing state
              setRemovingDevices(prev => {
                const next = new Set(prev);
                next.delete(device.id);
                return next;
              });
            } catch (error) {
              // Clear removing state on error
              setRemovingDevices(prev => {
                const next = new Set(prev);
                next.delete(device.id);
                return next;
              });
              
              Alert.alert(
                t('error.title'),
                t('error.remove')
              );
            }
          }
        }
      ]
    );
  }, [removeDeviceWithCredentials, handleRefresh, t]);
  
  const handleViewDetails = useCallback((device: Device) => {
    const lastSeen = device.lastSeen 
      ? new Date(device.lastSeen).toLocaleString() 
      : 'Never';
      
    Alert.alert(
      device.name,
      `ID: ${device.id}
Type: ${device.type}
Address: ${device.address}:${device.port}
Status: ${device.connected ? 'Online' : 'Offline'}
Last seen: ${lastSeen}
${device.ownerId ? `Owner: ${device.ownerId.substring(0, 10)}...` : ''}`,
      [{ text: t('common:ok') }]
    );
  }, [t]);
  
  const handleAddToRoom = useCallback((device: Device) => {
    // Navigate to room selection or open a modal
    router.push({
      pathname: '/(screens)/devices/room-assignment',
      params: { 
        deviceId: device.id,
        deviceName: device.name,
        deviceType: device.type
      }
    });
  }, [router]);
  
  const handleRetryAuthentication = useCallback(async (device: Device) => {
    if (device.type !== DeviceType.ESP32) return;
    
    try {
      console.log(`[DeviceListScreen] Manually retrying authentication for device ${device.id}`);
      const discoveryModel = DeviceDiscoveryModel.getInstance();
      
      // Force re-authentication by re-adding the device
      if (discoveryModel['_esp32ConnectionManager']) {
        await discoveryModel['_esp32ConnectionManager'].authenticateDevice(
          device.id,
          device.address,
          device.port
        );
        
        Alert.alert(
          t('authentication.title'),
          t('authentication.retrying'),
          [{ text: t('common:ok') }]
        );
        
        // No refresh needed - authentication updates come through events
      }
    } catch (error: any) {
      Alert.alert(
        t('error.title'),
        error.message || t('error.authRetryFailed')
      );
    }
  }, [t, handleRefresh]);
  
  const renderDeviceItem = useCallback(({ item }: { item: Device }) => {
    // Find the latest device state in case of race conditions
    const currentDevice = devices.find(d => d.id === item.id) || item;
    const isOwnedByCurrentUser = currentDevice.ownerId === currentUserPersonId;
    const isClaiming = claimingDevices.has(item.id);
    const isRemoving = removingDevices.has(item.id);
    // Don't show "owned by someone else" if we're in the process of claiming the device
    const isOwnedBySomeoneElse = !!currentDevice.ownerId && !isOwnedByCurrentUser && !isClaiming;
    const isItemLoading = isClaiming || isRemoving;  // Show loading for devices being claimed or removed
    const isLEDPending = pendingLEDCommands && pendingLEDCommands.includes(item.id);

    // Add organisation path if available
    const deviceWithOrgPath = {
      ...currentDevice,
      organisationPath: deviceOrgPaths.get(item.id)
    }
    
    return (
      <DeviceItem
        device={deviceWithOrgPath}
        isOwnedByCurrentUser={isOwnedByCurrentUser}
        isOwnedBySomeoneElse={isOwnedBySomeoneElse}
        isLoading={isItemLoading}
        isLEDPending={isLEDPending}
        onToggleOwnership={handleToggleOwnership}
        onRemove={handleRemoveDevice}
        onViewDetails={handleViewDetails}
        onToggleLED={toggleBlueLED}
        onRetryAuth={handleRetryAuthentication}
        onAddToRoom={handleAddToRoom}
      />
    );
  }, [devices, currentUserPersonId, isLoading, claimingDevices, removingDevices, pendingLEDCommands, deviceOrgPaths, handleToggleOwnership, handleRemoveDevice, handleViewDetails, toggleBlueLED, handleRetryAuthentication, handleAddToRoom]);
  
  // Only show loading screen if settings are loading AND we haven't discovered any devices yet
  // This prevents the loading screen from appearing when we already have discovered devices
  if (isLoading && devices.length === 0 && !deviceSettings) {
    return (
      <View style={[themedStyles.screenContainer, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ marginTop: 16, fontSize: 16, color: theme.colors.onBackground }}>
          {t('common.loading')}
        </Text>
      </View>
    );
  }
  
  if (error) {
    return (
      <View style={themedStyles.screenContainer}>
        <Text style={themedStyles.error}>{error}</Text>
        <Button mode="contained" onPress={handleRefresh} style={{ marginTop: 16 }}>
          {t('common.retry')}
        </Button>
      </View>
    );
  }
  
  return (
    <View style={[themedStyles.screenContainer, { paddingHorizontal: 16 }]}>
      {/* Discovery Status with Protocol Icons */}
      <View style={[
        themedStyles.card,
        { 
          backgroundColor: (isDiscoveryRunning || isBTLEDiscovering)
            ? theme.colors.primaryContainer 
            : theme.colors.surfaceVariant 
        }
      ]}>
        <View style={themedStyles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={{
              color: (isDiscoveryRunning || isBTLEDiscovering)
                ? theme.colors.onPrimaryContainer
                : theme.colors.onSurfaceVariant,
              fontWeight: '600'
            }}>
              {t('devices.discoveryProtocols')}
            </Text>
            <Text style={{
              color: (isDiscoveryRunning || isBTLEDiscovering)
                ? theme.colors.onPrimaryContainer
                : theme.colors.onSurfaceVariant,
              fontSize: 12,
              marginTop: 2,
              opacity: 0.8
            }}>
              {(() => {
                const statuses = [];
                if (isDiscoveryRunning) statuses.push('UDP: Port 49497');
                if (isBTLEDiscovering) statuses.push('BT: Scanning');
                if (!isBTLEAvailable && !isDiscoveryRunning) statuses.push('BT: Unavailable');
                return statuses.length > 0 ? statuses.join(' • ') : 'All Protocols Inactive';
              })()}
            </Text>
          </View>
          
          {/* Protocol Toggle Icons */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* WiFi/UDP Toggle */}
            <View style={{ width: 48, height: 48, marginRight: 16 }}>
              <IconButton
                icon={isDiscoveryRunning ? "wifi" : "wifi-off"}
                size={24}
                iconColor={isDiscoveryRunning 
                  ? theme.colors.primary 
                  : theme.colors.onSurfaceVariant}
                onPress={handleToggleWiFiDiscovery}
                disabled={isTogglingDiscovery}
                style={{
                  backgroundColor: isDiscoveryRunning 
                    ? theme.colors.primaryContainer
                    : theme.colors.surface,
                  margin: 0,
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: 48,
                  height: 48
                }}
                animated={false}
              />
            </View>
            
            {/* Bluetooth Toggle */}
            <View style={{ width: 48, height: 48, marginRight: 16 }}>
              <IconButton
                icon={isBTLEDiscovering ? "bluetooth" : "bluetooth-off"}
                size={24}
                iconColor={isBTLEDiscovering 
                  ? theme.colors.primary 
                  : theme.colors.onSurfaceVariant}
                onPress={() => {
                  console.log('[DeviceListScreen] BT toggle pressed, isBTLEAvailable:', isBTLEAvailable, 'isBTLEDiscovering:', isBTLEDiscovering);
                  handleToggleBTLE();
                }}
                disabled={isTogglingBTLE || !isBTLEAvailable}
                style={{
                  backgroundColor: isBTLEDiscovering 
                    ? theme.colors.primaryContainer
                    : isBTLEAvailable 
                      ? theme.colors.surface
                      : theme.colors.errorContainer,
                  margin: 0,
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: 48,
                  height: 48,
                  opacity: isBTLEAvailable ? 1 : 0.5
                }}
                animated={false}
              />
            </View>
            
            {(isTogglingDiscovery || isTogglingBTLE) && (
              <View style={{ width: 24, height: 48, justifyContent: 'center' }}>
                <ActivityIndicator 
                  size="small" 
                  color={theme.colors.primary}
                />
              </View>
            )}
          </View>
        </View>
      </View>
      
      {/* Search Bar */}
      <View style={{ marginVertical: 8, marginHorizontal: 16 }}>
        <Searchbar
          placeholder={t('devices.searchPlaceholder')}
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={themedStyles.searchBar}
        />
      </View>
      
      {/* Type Filters */}
      {deviceTypes.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 }}>
          <Chip
            selected={!filterType}
            onPress={() => setFilterType(null)}
            style={{ marginRight: 8, marginBottom: 8 }}
          >
            {t('allDevices')}
          </Chip>
          {deviceTypes.map(type => (
            <Chip
              key={type}
              selected={filterType === type}
              onPress={() => setFilterType(type)}
              style={{ marginRight: 8, marginBottom: 8 }}
            >
              {type}
            </Chip>
          ))}
        </View>
      )}
      
      {/* Device List */}
      <FlatList<Device>
        data={filteredDevices}
        renderItem={renderDeviceItem}
        keyExtractor={(item: Device) => item.id}
        extraData={pendingLEDCommands}
        ItemSeparatorComponent={() => <Divider style={{ marginVertical: 4 }} />}
        contentContainerStyle={{ flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[theme.colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={themedStyles.emptyContainer}>
            <Text style={themedStyles.emptyText}>
              {searchQuery || filterType
                ? t('noMatchingDevices')
                : isDiscoveryRunning
                  ? t('discoveringDevices')
                  : t('noDevicesFound')}
            </Text>
            {!isDiscoveryRunning && !searchQuery && !filterType && !isTogglingDiscovery && (
              <Button 
                mode="contained" 
                onPress={handleToggleWiFiDiscovery}
                style={{ marginTop: 16 }}
              >
                {t('enableDiscovery')}
              </Button>
            )}
          </View>
        }
      />
      
      {/* Refresh FAB */}
      <FAB
        icon="refresh"
        onPress={handleRefresh}
        disabled={refreshing}
        loading={refreshing}
        style={[themedStyles.fab, { bottom: insets.bottom + 16 }]}
      />
      
      {/* Performance Report FAB - DEV ONLY */}
      {__DEV__ && (
        <FAB
          icon="chart-line"
          onPress={() => {
            console.log('\n\n=====================================');
            console.log('PERFORMANCE PROFILING REPORT');
            console.log('=====================================');
            profiler.flush();
            console.log('=====================================\n\n');
          }}
          style={[themedStyles.fab, { bottom: insets.bottom + 80, backgroundColor: theme.colors.error }]}
          small
        />
      )}
    </View>
  );
}

export default DeviceListScreen;