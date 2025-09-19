/**
 * Add Device Screen
 * 
 * Handles BLE device discovery and pairing for health devices
 * Supports smart rings, fitness trackers, and other health monitors
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  ScrollView, 
  Platform, 
  Alert,
  ActivityIndicator,
  RefreshControl
} from 'react-native';
import { 
  Text, 
  List, 
  Button, 
  Card,
  Chip,
  Portal,
  Dialog,
  IconButton,
  useTheme,
  Searchbar,
  Banner,
  ProgressBar
} from 'react-native-paper';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme as useAppTheme } from '@src/providers/app/AppTheme';
import { useAppModel } from '@src/hooks/useAppModel';
import { btleService } from '@src/services/BLETurboModule';

// Define BLE device type to match what's used in btleService
interface BLEDevice {
  id: string;
  name: string;
  type: string;
  rssi: number;
  isConnected: boolean;
  lastSeen: number;
  isConnectable?: boolean;
  metadata?: {
    manufacturer?: string;
    services?: string[];
  };
}

export default function AddDeviceScreen() {
  const { t } = useTranslation('settings');
  const router = useRouter();
  const { theme, styles: themedStyles } = useAppTheme();
  const paperTheme = useTheme();
  const appModel = useAppModel();
  const btleServiceRef = React.useRef<typeof btleService>(btleService);
  
  // State
  const [scanning, setScanning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [devices, setDevices] = useState<Map<string, BLEDevice>>(new Map());
  const [selectedDevice, setSelectedDevice] = useState<BLEDevice | null>(null);
  const [pairingDialogVisible, setPairingDialogVisible] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [bleEnabled, setBleEnabled] = useState(false);
  const [bleState, setBleState] = useState<string>('Unknown');

  // Initialize BLE on mount
  useEffect(() => {
    initializeBLE();
    
    return () => {
      // Clean up
      if (btleServiceRef.current) {
        btleServiceRef.current.removeAllListeners('deviceDiscovered');
        btleServiceRef.current.removeAllListeners('scanStarted');
        btleServiceRef.current.removeAllListeners('scanStopped');
        btleServiceRef.current.removeAllListeners('stateChanged');
        if (scanning) {
          btleServiceRef.current.stopScan().catch(() => {});
        }
      }
    };
  }, []);
  
  const initializeBLE = async () => {
    try {
      console.log('[AddDevice] Initializing BLE service...');
      
      // Set up event listeners FIRST before initialization
      btleServiceRef.current.on('deviceDiscovered', handleDeviceDiscovered);
      
      btleServiceRef.current.on('scanStarted', () => {
        console.log('[AddDevice] BLE scan started');
        setScanning(true);
      });
      
      btleServiceRef.current.on('scanStopped', () => {
        console.log('[AddDevice] BLE scan stopped');
        setScanning(false);
      });
      
      btleServiceRef.current.on('stateChanged', (newState: string) => {
        console.log('[AddDevice] BLE state changed:', newState);
        setBleState(newState);
        setBleEnabled(newState === 'PoweredOn');
      });
      
      const initialized = await btleServiceRef.current.initialize();
      console.log('[AddDevice] BLE initialized:', initialized);
      
      // Get state after initialization and event listeners are set up
      const state = await btleServiceRef.current.getState();
      console.log('[AddDevice] BLE final state:', state);
      setBleState(state);
      
      const available = state === 'PoweredOn';
      setBleEnabled(available);
      console.log('[AddDevice] BLE available:', available);
      
    } catch (error) {
      console.error('[AddDevice] Error initializing BLE:', error);
      setBleEnabled(false);
    }
  };
  
  const handleDeviceDiscovered = (device: BLEDevice) => {
    console.log('[AddDevice] Device discovered:', device);
    
    // Handle devices with no name
    const deviceName = device.name || `Unknown ${device.id.slice(0, 6)}`;
    
    // Convert device type for health categorization
    let deviceType = 'sensor'; // default
    const nameLower = deviceName.toLowerCase();
    
    if (nameLower.includes('ring') || nameLower.includes('r02')) {
      deviceType = 'ring';
    } else if (nameLower.includes('watch')) {
      deviceType = 'watch';
    } else if (nameLower.includes('band') || nameLower.includes('fit')) {
      deviceType = 'band';
    } else if (nameLower.includes('heart') || nameLower.includes('hrm')) {
      deviceType = 'sensor';
    }
    
    // Filter by selected type if any
    if (selectedType && deviceType !== selectedType) {
      return;
    }
    
    // Add metadata
    const enrichedDevice = {
      ...device,
      name: deviceName,
      type: deviceType,
      isConnectable: true,
      metadata: {
        manufacturer: deviceName.split(' ')[0] || 'Unknown',
        services: [] // Would need to connect to get services
      }
    };
    
    setDevices(prev => {
      const newMap = new Map(prev);
      newMap.set(device.id, enrichedDevice);
      return newMap;
    });
  };
  
  const checkBTLEStatus = async () => {
    try {
      const state = await btleServiceRef.current.getState();
      setBleState(state);
      setBleEnabled(state === 'PoweredOn');
    } catch (error) {
      console.error('[AddDevice] Error checking BLE status:', error);
      setBleEnabled(false);
    }
  };

  const startScan = useCallback(async () => {
    if (!bleEnabled) {
      Alert.alert(
        t('settings.health.bleDisabled', { defaultValue: 'Bluetooth Disabled' }),
        t('settings.health.enableBle', { defaultValue: 'Please enable Bluetooth to scan for devices' })
      );
      return;
    }

    // Clear previous devices
    setDevices(new Map());
    
    try {
      console.log('[AddDevice] Starting BLE scan...');
      
      // Clear previous listeners to avoid duplicates
      btleServiceRef.current.removeAllListeners('deviceDiscovered');
      
      // Set up new listener
      btleServiceRef.current.on('deviceDiscovered', handleDeviceDiscovered);
      
      // Start scan
      await btleServiceRef.current.startScan();
      
      // Auto-stop after 30 seconds
      setTimeout(() => {
        if (scanning) {
          stopScan();
        }
      }, 30000);
    } catch (error) {
      console.error('[AddDevice] Failed to start scan:', error);
      Alert.alert(
        t('common:error'),
        t('settings.health.scanFailed', { defaultValue: 'Failed to start device scan' })
      );
      setScanning(false);
    }
  }, [selectedType, bleEnabled, t, scanning]);

  const stopScan = useCallback(async () => {
    try {
      await btleServiceRef.current.stopScan();
    } catch (error) {
      console.error('[AddDevice] Failed to stop scan:', error);
    }
    setScanning(false);
  }, []);

  const handleDeviceSelect = (device: BLEDevice) => {
    if (!device.isConnectable) {
      Alert.alert(
        t('common:error'),
        t('settings.health.deviceNotConnectable', { defaultValue: 'This device cannot be connected' })
      );
      return;
    }
    
    setSelectedDevice(device);
    setPairingDialogVisible(true);
  };

  const handlePair = async () => {
    if (!selectedDevice) return;
    
    setPairing(true);
    
    try {
      // Connect to the device using btleService
      const device = await btleServiceRef.current.connectToDevice(selectedDevice.id);
      
      // Save paired device to storage
      const pairedDevice = {
        id: selectedDevice.id,
        name: selectedDevice.name,
        type: selectedDevice.type,
        isConnected: true,
        pairedAt: new Date().toISOString(),
        lastSync: null,
        batteryLevel: null
      };
      
      // Get existing paired devices
      const PAIRED_DEVICES_KEY = 'health_paired_devices';
      let pairedDevices = [];
      
      try {
        const stored = await appModel?.settingsModel?.getItem?.(PAIRED_DEVICES_KEY);
        if (stored) {
          pairedDevices = JSON.parse(stored);
        }
      } catch (e) {
        console.error('[AddDevice] Error loading existing devices:', e);
      }
      
      // Add new device if not already paired
      if (!pairedDevices.find((d: any) => d.id === selectedDevice.id)) {
        pairedDevices.push(pairedDevice);
        
        // Save to storage
        try {
          await appModel?.settingsModel?.setItem?.(
            PAIRED_DEVICES_KEY,
            JSON.stringify(pairedDevices)
          );
        } catch (e) {
          console.error('[AddDevice] Error saving paired device:', e);
        }
      }
      
      // Disconnect after pairing (will reconnect when viewing data)
      try {
        await device.cancelConnection();
      } catch (e) {
        // Ignore disconnect errors
      }
      
      // Navigate back with success
      setPairingDialogVisible(false);
      Alert.alert(
        t('common:success.title', { defaultValue: 'Success' }),
        t('settings.health.devicePaired', { 
          defaultValue: `${selectedDevice.name} has been paired successfully` 
        }),
        [
          {
            text: t('common:common.ok', { defaultValue: 'OK' }),
            onPress: () => router.back()
          }
        ]
      );
    } catch (error) {
      Alert.alert(
        t('common:error'),
        t('settings.health.pairingFailed', { defaultValue: 'Failed to pair device' })
      );
    } finally {
      setPairing(false);
    }
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'ring': return 'ring';
      case 'watch': return 'watch';
      case 'band': return 'watch-variant';
      case 'sensor': return 'access-point';
      default: return 'bluetooth';
    }
  };

  const getSignalIcon = (rssi: number) => {
    if (rssi > -50) return 'wifi-strength-4';
    if (rssi > -60) return 'wifi-strength-3';
    if (rssi > -70) return 'wifi-strength-2';
    if (rssi > -80) return 'wifi-strength-1';
    return 'wifi-strength-outline';
  };

  // Convert Map to array for filtering
  const devicesArray = Array.from(devices.values());
  
  const filteredDevices = devicesArray.filter(device => 
    (device.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const deviceTypes = [
    { value: null, label: t('common:all') },
    { value: 'ring', label: t('settings.health.deviceTypes.ring', { defaultValue: 'Smart Rings' }) },
    { value: 'watch', label: t('settings.health.deviceTypes.watch', { defaultValue: 'Smart Watches' }) },
    { value: 'band', label: t('settings.health.deviceTypes.band', { defaultValue: 'Fitness Bands' }) },
    { value: 'sensor', label: t('settings.health.deviceTypes.sensor', { defaultValue: 'Health Sensors' }) }
  ];

  return (
    <SafeAreaView style={[themedStyles.screenContainer, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: t('settings.health.addDevice', { defaultValue: 'Add Health Device' }),
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.onSurface,
        }}
      />
      
      {!bleEnabled && (
        <Banner
          visible={true}
          actions={[]}
          icon="bluetooth-off"
        >
          {bleState === 'PoweredOff' 
            ? t('settings.health.bluetoothOff', { 
                defaultValue: 'Please turn on Bluetooth in your device settings' 
              })
            : t('settings.health.bleRequired', { 
                defaultValue: 'Bluetooth is required to connect health devices' 
              })
          }
        </Banner>
      )}

      <View style={{ padding: 16 }}>
        {/* Search bar */}
        <Searchbar
          placeholder={t('settings.health.searchDevices', { defaultValue: 'Search devices...' })}
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={{ marginBottom: 16 }}
        />

        {/* Device type filter */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 16 }}
        >
          {deviceTypes.map(type => (
            <Chip
              key={type.value || 'all'}
              mode={selectedType === type.value ? 'flat' : 'outlined'}
              selected={selectedType === type.value}
              onPress={() => setSelectedType(type.value)}
              style={{ marginRight: 8 }}
            >
              {type.label}
            </Chip>
          ))}
        </ScrollView>

        {/* Scan controls */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <Button
            mode="contained"
            onPress={scanning ? stopScan : startScan}
            disabled={!bleEnabled}
            icon={scanning ? 'stop' : 'magnify'}
            style={{ flex: 1 }}
          >
            {scanning 
              ? t('settings.health.stopScan', { defaultValue: 'Stop Scanning' })
              : t('settings.health.startScan', { defaultValue: 'Start Scan' })
            }
          </Button>
        </View>

        {scanning && (
          <View style={{ marginBottom: 16 }}>
            <ProgressBar indeterminate color={paperTheme.colors.primary} />
            <Text 
              variant="bodySmall" 
              style={{ textAlign: 'center', marginTop: 8, opacity: 0.6 }}
            >
              {t('settings.health.scanning', { defaultValue: 'Scanning for devices...' })}
            </Text>
          </View>
        )}
      </View>

      {/* Device list */}
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              checkBTLEStatus().then(() => {
                if (bleEnabled) {
                  startScan();
                }
              }).finally(() => setRefreshing(false));
            }}
          />
        }
      >
        {filteredDevices.length === 0 && !scanning ? (
          <View style={{ padding: 32, alignItems: 'center' }}>
            <IconButton icon="bluetooth-connect" size={48} />
            <Text variant="bodyLarge" style={{ textAlign: 'center', marginTop: 16 }}>
              {t('settings.health.noDevices', { defaultValue: 'No devices found' })}
            </Text>
            <Text variant="bodyMedium" style={{ textAlign: 'center', marginTop: 8, opacity: 0.6 }}>
              {t('settings.health.noDevicesHint', { 
                defaultValue: 'Make sure your device is in pairing mode' 
              })}
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            {filteredDevices.map((device, index) => (
              <Card
                key={device.id}
                mode="outlined"
                style={{ marginBottom: 12 }}
                onPress={() => handleDeviceSelect(device)}
              >
                <Card.Content>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <IconButton 
                      icon={getDeviceIcon(device.type)} 
                      size={32}
                      style={{ margin: 0 }}
                    />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text variant="titleMedium">{device.name || `Unknown Device ${device.id.slice(0, 6)}`}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <Text variant="bodySmall" style={{ opacity: 0.6 }}>
                          {device.metadata?.manufacturer || device.type}
                        </Text>
                        {device.metadata?.services && device.metadata.services.length > 0 && (
                          <Text variant="bodySmall" style={{ opacity: 0.6, marginLeft: 8 }}>
                            • {device.metadata.services.length} services
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <IconButton 
                        icon={getSignalIcon(device.rssi)} 
                        size={20}
                        style={{ margin: 0 }}
                      />
                      <Text variant="bodySmall" style={{ opacity: 0.6 }}>
                        {device.rssi || -100} dBm
                      </Text>
                    </View>
                  </View>
                  
                  {device.metadata?.services && device.metadata.services.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                      {device.metadata.services.map((service: string) => (
                        <Chip 
                          key={service} 
                          compact 
                          mode="flat"
                          style={{ marginRight: 4, marginBottom: 4 }}
                        >
                          {service}
                        </Chip>
                      ))}
                    </View>
                  )}
                </Card.Content>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Pairing Dialog */}
      <Portal>
        <Dialog visible={pairingDialogVisible} onDismiss={() => setPairingDialogVisible(false)}>
          {selectedDevice && (
            <>
              <Dialog.Title>
                {t('settings.health.pairDevice', { defaultValue: 'Pair Device' })}
              </Dialog.Title>
              <Dialog.Content>
                <View style={{ alignItems: 'center', marginBottom: 16 }}>
                  <IconButton 
                    icon={getDeviceIcon(selectedDevice.type)} 
                    size={48}
                  />
                  <Text variant="titleMedium">{selectedDevice.name}</Text>
                  {selectedDevice.metadata?.manufacturer && (
                    <Text variant="bodyMedium" style={{ opacity: 0.6 }}>
                      {selectedDevice.metadata.manufacturer}
                    </Text>
                  )}
                </View>
                
                {selectedDevice.metadata?.services && selectedDevice.metadata.services.length > 0 && (
                  <View>
                    <Text variant="bodyMedium" style={{ marginBottom: 8 }}>
                      {t('settings.health.availableData', { defaultValue: 'Available Data:' })}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                      {selectedDevice.metadata.services.map((service: string) => (
                        <Chip 
                          key={service} 
                          mode="outlined"
                          style={{ marginRight: 4, marginBottom: 4 }}
                        >
                          {service}
                        </Chip>
                      ))}
                    </View>
                  </View>
                )}
                
                <Text variant="bodySmall" style={{ marginTop: 16, opacity: 0.6 }}>
                  {t('settings.health.pairingNote', { 
                    defaultValue: 'Make sure the device is in pairing mode and close to your phone' 
                  })}
                </Text>
              </Dialog.Content>
              <Dialog.Actions>
                <Button onPress={() => setPairingDialogVisible(false)} disabled={pairing}>
                  {t('common:cancel')}
                </Button>
                <Button onPress={handlePair} loading={pairing}>
                  {t('common:pair', { defaultValue: 'Pair' })}
                </Button>
              </Dialog.Actions>
            </>
          )}
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
}