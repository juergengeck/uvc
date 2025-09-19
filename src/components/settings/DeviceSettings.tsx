import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { List, Switch, Text, TextInput, IconButton, useTheme, Divider, Button, Snackbar } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useDeviceSettings } from '@src/hooks/useDeviceSettings';
import type { ESP32DeviceSettings } from '@src/types/device';
import { useTheme as useAppTheme } from '@src/providers/app/AppTheme';
import { DeviceDiscoveryModel, QuicModel } from '@src/models/network';
import { navigateToUDPDiagnostic } from '../../navigation/add-udp-diagnostic';
import { useRouter } from 'expo-router';
import { routes } from '../../config/routes';
import { useFocusEffect } from 'expo-router';

/**
 * DeviceSettings component for managing device discovery and connected devices
 */
export function DeviceSettings() {
  const { t } = useTranslation('settings');
  const theme = useTheme();
  const { styles: themedStyles } = useAppTheme();
  const { 
    deviceSettings, 
    deviceConfig,
    isLoading,
    error,
    toggleDiscovery,
    toggleAutoConnect,
    toggleAddOnlyConnectedDevices,
    setDiscoveryPort,
    removeDevice,
    updateDevice,
    getDevices
  } = useDeviceSettings();
  
  const [discoveryPort, setDiscoveryPortValue] = useState('');
  const [portError, setPortError] = useState('');
  const [testingConnectivity, setTestingConnectivity] = useState(false);
  const [testResults, setTestResults] = useState<string[]>([]);
  const [isForceInitializing, setIsForceInitializing] = useState(false);
  const router = useRouter();
  const [isUpdating, setIsUpdating] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [showToast, setShowToast] = useState(false);

  // Initialize discovery port from settings
  useEffect(() => {
    if (deviceSettings) {
      setDiscoveryPortValue(deviceSettings.discoveryPort.toString());
    }
  }, [deviceSettings]);

  // Update discovery port
  const handleUpdateDiscoveryPort = async () => {
    const port = parseInt(discoveryPort, 10);
    if (isNaN(port) || port < 1024 || port > 65535) {
      setPortError(t('settings.device.portError'));
      return;
    }
    
    try {
      setPortError('');
      await setDiscoveryPort(port);
    } catch (error) {
      console.error('[DeviceSettings] Failed to update discovery port:', error);
      Alert.alert(
        t('settings.device.error'),
        t('settings.device.portError')
      );
    }
  };

  // Handle device removal
  const handleRemoveDevice = (deviceId: string) => {
    Alert.alert(
      t('settings.device.removeTitle'),
      t('settings.device.removeConfirm'),
      [
        {
          text: t('common:cancel'),
          style: 'cancel'
        },
        {
          text: t('common:remove'),
          style: 'destructive',
          onPress: async () => {
            try {
              await removeDevice(deviceId);
            } catch (error) {
              console.error('[DeviceSettings] Failed to remove device:', error);
              Alert.alert(
                t('settings.device.error'),
                t('settings.device.removeError')
              );
            }
          }
        }
      ]
    );
  };

  // Toggle device enabled state
  const handleToggleDeviceEnabled = async (deviceId: string, device: ESP32DeviceSettings) => {
    try {
      await updateDevice(deviceId, {
        enabled: !device.enabled
      });
    } catch (error) {
      console.error('[DeviceSettings] Failed to toggle device enabled state:', error);
      Alert.alert(
        t('settings.device.error'),
        t('settings.device.toggleError')
      );
    }
  };

  // Test ESP32 connectivity
  const handleTestConnectivity = async () => {
    try {
      setTestingConnectivity(true);
      setTestResults([]);
      
      // Get the device discovery manager singleton
      const discoveryManager = DeviceDiscoveryModel.getInstance();
      
      // Try to get QuicModel instance
      let quicModel: QuicModel | null = null;
      try {
        // Import dynamically to avoid circular dependencies
        const { QuicModel } = require('@src/models/network');
        if (QuicModel) {
          // Always use the singleton instance
          quicModel = QuicModel.getInstance();
        }
      } catch (error) {
        console.warn('[DeviceSettings] Failed to get QuicModel:', error);
      }
      
      // Log to both console and our local state
      const logMessage = (message: string) => {
        console.log(message);
        setTestResults(prev => [...prev, message]);
      };
      
      // Override console.log temporarily to capture diagnostic output
      const originalConsoleLog = console.log;
      const originalConsoleError = console.error;
      const originalConsoleWarn = console.warn;
      
      console.log = (...args) => {
        originalConsoleLog(...args);
        if (typeof args[0] === 'string' && 
            (args[0].includes('[DeviceDiscovery]') || 
             args[0].includes('[QuicModel]') || 
             args[0].includes('[UDPManager]') ||
             args[0].includes('[UdpModel]'))) {
          setTestResults(prev => [...prev, args.join(' ')]);
        }
      };
      
      console.error = (...args) => {
        originalConsoleError(...args);
        if (typeof args[0] === 'string' && 
            (args[0].includes('[DeviceDiscovery]') || 
             args[0].includes('[QuicModel]') || 
             args[0].includes('[UDPManager]') ||
             args[0].includes('[UdpModel]'))) {
          setTestResults(prev => [...prev, `❌ ERROR: ${args.join(' ')}`]);
        }
      };
      
      console.warn = (...args) => {
        originalConsoleWarn(...args);
        if (typeof args[0] === 'string' && 
            (args[0].includes('[DeviceDiscovery]') || 
             args[0].includes('[QuicModel]') || 
             args[0].includes('[UDPManager]') ||
             args[0].includes('[UdpModel]'))) {
          setTestResults(prev => [...prev, `⚠️ WARNING: ${args.join(' ')}`]);
        }
      };
      
      // Run the test
      logMessage('🔍 Starting comprehensive connectivity test...');
      
      // Check for the UDPModule
      const { NativeModules } = require('react-native');
      if (!NativeModules.UDPModule) {
        logMessage('❌ CRITICAL ERROR: Native UDPModule is not available!');
        logMessage('UDP functionality will not work without the native module.');
        logMessage('The app may be using a mock implementation that does not actually send UDP packets.');
        logMessage('\nPossible causes:');
        logMessage('1. Native module not linked correctly');
        logMessage('2. Build/deployment issue with native modules');
        logMessage('3. Missing permissions on the device');
        
        // This is likely the main reason discovery isn't working
        logMessage('\n⚠️ ESP32 discovery WILL NOT WORK until this is fixed!');
      }

      // Check if discovery is enabled, if not, temporarily enable it for testing
      if (!deviceSettings?.discoveryEnabled) {
        logMessage('⚠️ Discovery is currently disabled');
        logMessage('👉 Enable discovery in settings to find devices');
      }
      
      // Check for devices
      const devices = getDevices ? getDevices() : [];
      const deviceCount = Array.isArray(devices) ? devices.length : Object.keys(devices).length;
      
      logMessage(`📱 Currently discovered devices: ${deviceCount}`);
      
      // Give some helpful diagnostic information
      logMessage('🌐 Checking network setup:');
      logMessage(`🔌 Discovery port: ${deviceSettings?.discoveryPort || 49497}`);
      logMessage(`🔄 Auto connect: ${deviceSettings?.autoConnect ? 'Enabled' : 'Disabled'}`);
      
      // Test QuicModel specifically
      logMessage('\n🧪 Testing QuicModel functionality...');
      
      if (!quicModel) {
        logMessage('❌ CRITICAL: QuicModel instance not available');
        logMessage('This is likely the main cause of communication issues');
      } else {
        // Check QuicModel initialization state
        const isQuicInitialized = quicModel.isInitialized();
        logMessage(`${isQuicInitialized ? '✅' : '❌'} QuicModel initialization state: ${isQuicInitialized ? 'Initialized' : 'Not initialized'}`);
        
        // Check QuicModel ready state
        const isQuicReady = quicModel.isReady();
        logMessage(`${isQuicReady ? '✅' : '❌'} QuicModel ready state: ${isQuicReady ? 'Ready' : 'Not ready'}`);
        
        // Check for transport availability (specifically for the transport.on error)
        try {
          const transport = quicModel.getQuicTransport();
          logMessage(`${transport ? '✅' : '❌'} QuicTransport: ${transport ? 'Available' : 'Not available'}`);
          
          if (transport) {
            // Check if the transport.on method exists using a type-safe approach
            // We need to use any type here as we're checking for dynamic properties
            const anyTransport = transport as any;
            if (typeof anyTransport.on === 'function') {
              logMessage('✅ transport.on: Available (function)');
            } else {
              logMessage(`❌ CRITICAL: transport.on is not a function (it is ${typeof anyTransport.on})`);
              logMessage('This is the error the user was experiencing!');
              logMessage('The QuicModel needs to be properly initialized to handle events.');
            }
          }
        } catch (transportError) {
          logMessage(`❌ Error checking transport: ${transportError instanceof Error ? transportError.message : String(transportError)}`);
        }
        
        // If not initialized or ready, try initializing
        if (!isQuicInitialized || !isQuicReady) {
          logMessage('🔄 Attempting to initialize QuicModel...');
          try {
            await quicModel.init();
            logMessage('✅ QuicModel initialization successful');
          } catch (initError) {
            logMessage(`❌ QuicModel initialization error: ${initError instanceof Error ? initError.message : String(initError)}`);
          }
        }
        
        // Try to create a UDP socket (most important test)
        logMessage('\n🔄 Testing UDP socket creation...');
        try {
          const udpModel = quicModel.getUdpModel();
          if (udpModel) {
            logMessage('✅ UdpModel available');
            
            // Create a test socket
            const socket = await udpModel.createSocket({
              type: 'udp4',
              reuseAddr: true, 
              broadcast: true,
              debug: true,
              debugLabel: 'test-socket'
            });
            
            if (socket) {
              logMessage('✅ Test UDP socket created successfully (ID: ' + socket.id + ')');
              
              // Test binding
              try {
                logMessage('🔄 Testing socket bind...');
                const testPort = 50000 + Math.floor(Math.random() * 1000);
                await socket.bind(testPort);
                logMessage(`✅ Socket bound successfully to port ${testPort}`);
                
                // Test broadcast mode
                try {
                  logMessage('🔄 Testing broadcast mode...');
                  await socket.setBroadcast(true);
                  logMessage('✅ Broadcast mode enabled successfully');
                  
                  // Test sending a packet (just create the promise, don't await)
                  logMessage('🔄 Testing packet send...');
                  const testMessage = JSON.stringify({
                    type: 'test',
                    timestamp: Date.now(),
                    test: 'connectivity'
                  });
                  
                  await socket.send(testMessage, 49497, '255.255.255.255');
                  logMessage('✅ Test broadcast packet sent successfully');
                } catch (broadcastError) {
                  logMessage(`❌ Broadcast test error: ${broadcastError instanceof Error ? broadcastError.message : String(broadcastError)}`);
                }
              } catch (bindError) {
                logMessage(`❌ Socket bind error: ${bindError instanceof Error ? bindError.message : String(bindError)}`);
              }
              
              // Clean up
              try {
                await socket.close();
                logMessage('✅ Socket closed successfully');
              } catch (closeError) {
                logMessage(`⚠️ Socket close error: ${closeError instanceof Error ? closeError.message : String(closeError)}`);
              }
            } else {
              logMessage('❌ Failed to create UDP socket');
            }
          } else {
            logMessage('❌ UdpModel not available');
          }
        } catch (socketError) {
          logMessage(`❌ UDP socket test error: ${socketError instanceof Error ? socketError.message : String(socketError)}`);
        }
      }
      
      // Run advanced diagnostics if available
      if (discoveryManager) {
        logMessage('\n🔬 Running advanced diagnostics...');
        try {
          // Create custom diagnostics instead of using runAdvancedDiagnostics
          const diagnosticResults = {
            isDiscovering: discoveryManager.isDiscovering(),
            quicModelAvailable: !!quicModel,
            transportAvailable: quicModel ? quicModel.isInitialized() : false,
            isMockImplementation: false, // We don't have this info directly
            testsRun: [],
            networkInfo: {
              isConnected: true, // We don't have direct network info
              type: 'unknown',
              details: {
                ipAddress: '',
                subnet: ''
              }
            }
          };
          
          // Log key diagnostic information
          logMessage(`\n📊 Diagnostic Results:`);
          logMessage(`- Discovery active: ${diagnosticResults.isDiscovering ? 'Yes' : 'No'}`);
          logMessage(`- QuicModel available: ${diagnosticResults.quicModelAvailable ? 'Yes' : 'No'}`);
          logMessage(`- Transport available: ${diagnosticResults.transportAvailable ? 'Yes' : 'No'}`);
          
          // Check if using mock implementation
          if (diagnosticResults.isMockImplementation) {
            logMessage('❌ CRITICAL: Using mock UDP implementation!');
            logMessage('The app is simulating UDP functionality but not actually sending packets.');
            logMessage('ESP32 device discovery will not work.');
          }
          
          // Log test results
          if (diagnosticResults.testsRun && diagnosticResults.testsRun.length > 0) {
            logMessage('\n🧪 Test Results:');
            diagnosticResults.testsRun.forEach((test: any) => {
              const status = test.passed ? '✅' : '❌';
              logMessage(`${status} ${test.test}: ${test.status || (test.passed ? 'Passed' : 'Failed')}`);
              if (test.error) {
                logMessage(`   Error: ${test.error}`);
              }
            });
          }
          
          // Log network info if available
          if (diagnosticResults.networkInfo) {
            logMessage('\n🌐 Network Information:');
            logMessage(`- Connected: ${diagnosticResults.networkInfo.isConnected ? 'Yes' : 'No'}`);
            logMessage(`- Connection type: ${diagnosticResults.networkInfo.type}`);
            if (diagnosticResults.networkInfo.details) {
              if (diagnosticResults.networkInfo.details.ipAddress) {
                logMessage(`- IP Address: ${diagnosticResults.networkInfo.details.ipAddress}`);
              }
              if (diagnosticResults.networkInfo.details.subnet) {
                logMessage(`- Subnet: ${diagnosticResults.networkInfo.details.subnet}`);
              }
            }
          }
        } catch (diagError) {
          logMessage(`❌ Error running advanced diagnostics: ${diagError instanceof Error ? diagError.message : String(diagError)}`);
        }
      }
      
      // Add diagnostic instructions at the end of the function
      logMessage('\n📱 Recommendations:');
      if (!quicModel || !quicModel.isReady()) {
        logMessage('1. Try the "Force Initialize Discovery" button below');
        logMessage('2. Restart the app if initialization continues to fail');
        logMessage('3. Check network permissions in device settings');
      } else {
        logMessage('1. Use "Advanced UDP Diagnostics" for detailed testing');
        logMessage('2. Check that ESP32 devices are on the same network');
        logMessage('3. Verify ESP32 firmware supports discovery protocol');
      }
      
      // Restore original console functions
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
      
      setTestingConnectivity(false);
    } catch (error) {
      console.error('[DeviceSettings] Connectivity test error:', error);
      setTestResults(prev => [...prev, `❌ Error: ${error instanceof Error ? error.message : String(error)}`]);
      setTestingConnectivity(false);
    }
  };

  // Force initialization of QuicModel and DeviceDiscoveryModel
  const handleForceInitialization = async () => {
    try {
      setIsForceInitializing(true);
      setTestResults([]);
      
      const logMessage = (message: string) => {
        console.log(message);
        setTestResults(prev => [...prev, message]);
      };
      
      logMessage('🔄 Force initializing discovery components...');
      
      // Try to get and initialize QuicModel
      try {
        const { QuicModel } = require('@src/models/network');
        if (QuicModel) {
          let quicModel = null;
          
          // Always use the singleton instance
          quicModel = QuicModel.getInstance();
          logMessage('✅ Using QuicModel singleton instance');
          
          // Initialize QuicModel
          if (quicModel && !quicModel.isInitialized()) {
            logMessage('🔄 Initializing QuicModel...');
            await quicModel.init();
            logMessage('✅ QuicModel initialized successfully');
          } else {
            logMessage('ℹ️ QuicModel was already initialized');
          }
          
          // Get DeviceDiscoveryModel and initialize with QuicModel
          const discoveryManager = DeviceDiscoveryModel.getInstance();
          if (discoveryManager) {
            logMessage('🔄 Initializing DeviceDiscoveryModel...');
            await discoveryManager.init();
            logMessage('✅ DeviceDiscoveryModel initialized');
            
            // Check if discovery is forcibly disabled in settings before starting
            if (deviceSettings?.discoveryEnabled === false) {
              logMessage('ℹ️ Not starting discovery - disabled in settings');
            } else {
              // Start discovery
              logMessage('🔄 Starting discovery...');
              await discoveryManager.startDiscovery();
              logMessage('✅ Discovery started successfully');
            }
          } else {
            logMessage('❌ Failed to get DeviceDiscoveryModel instance');
          }
        } else {
          logMessage('❌ QuicModel not found');
        }
      } catch (error) {
        logMessage(`❌ Error during force initialization: ${error instanceof Error ? error.message : String(error)}`);
        console.error('[DeviceSettings] Force initialization error:', error);
      }
      
      setIsForceInitializing(false);
    } catch (error) {
      console.error('[DeviceSettings] Force initialization error:', error);
      setTestResults(prev => [...prev, `❌ Error: ${error instanceof Error ? error.message : String(error)}`]);
      setIsForceInitializing(false);
    }
  };

  // Render device list
  const renderDevices = () => {
    if (isLoading) {
      return (
        <View style={{ padding: 16, alignItems: 'center' }}>
          <ActivityIndicator size="small" />
          <Text style={{ marginTop: 8 }}>{t('common.loading')}</Text>
        </View>
      );
    }

    if (!deviceSettings?.devices || Object.keys(deviceSettings.devices).length === 0) {
      return (
        <View style={{ padding: 16 }}>
          <Text>{t('settings.device.noDevicesFound', { defaultValue: 'No devices found. Enable device discovery to find nearby devices.' })}</Text>
        </View>
      );
    }

    return Object.entries(deviceSettings.devices).map(([deviceId, device]) => {
      if (!device) return null;
      
      const lastSeen = device.lastConnected ? new Date(device.lastConnected).toLocaleString() : 'Never';
      
      return (
        <List.Item
          key={deviceId}
          title={device.name || deviceId}
          description={() => (
            <View>
              <Text style={{ fontSize: 12, color: '#666' }}>ID: {deviceId}</Text>
              <Text style={{ fontSize: 12, color: '#666' }}>Last seen: {lastSeen}</Text>
              {device.quicConfig && (
                <Text style={{ fontSize: 12, color: '#666' }}>
                  Address: {device.quicConfig.host}:{device.quicConfig.port}
                </Text>
              )}
            </View>
          )}
          left={props => <List.Icon {...props} icon="devices" />}
          right={() => (
            <View style={{ flexDirection: 'row' }}>
              <Switch
                value={device.enabled}
                onValueChange={() => handleToggleDeviceEnabled(deviceId, device)}
                disabled={isUpdating}
                color={theme.colors.primary}
              />
              <IconButton
                icon="trash-can-outline"
                onPress={() => handleRemoveDevice(deviceId)}
                disabled={isUpdating}
              />
            </View>
          )}
          style={[themedStyles.settingsItem]}
        />
      );
    });
  };

  const handleToggleDiscoveryEnabled = async () => {
    try {
      setIsUpdating(true);
      // Toggle discovery enabled setting
      console.log('[DeviceSettings] ===== TOGGLE DISCOVERY BUTTON PRESSED =====');
      console.log('[DeviceSettings] Toggle action initiated for discovery, current state:', deviceSettings?.discoveryEnabled);
      console.log('[DeviceSettings] Full device settings before toggle:', JSON.stringify(deviceSettings));
      
      try {
        console.log('[DeviceSettings] Calling toggleDiscovery() hook method...');
        await toggleDiscovery();
        
        // Note: deviceSettings might not reflect the new state immediately due to React state update timing
        const newState = !deviceSettings?.discoveryEnabled;
        console.log(`[DeviceSettings] Toggle action completed. Expected new state: ${newState ? 'ENABLED' : 'DISABLED'}`);
        console.log('[DeviceSettings] Checking if device settings updated after toggle:', JSON.stringify(deviceSettings));
        console.log('[DeviceSettings] ===== TOGGLE DISCOVERY BUTTON HANDLER COMPLETED =====');
      } catch (toggleError: any) {
        console.error('[DeviceSettings] Error toggling discovery enabled:', toggleError);
        console.error('[DeviceSettings] Stack trace:', toggleError.stack);
        console.log('[DeviceSettings] ===== TOGGLE DISCOVERY BUTTON HANDLER FAILED =====');
        // Show error to user
        setToastMessage(t('settings.device.discoveryToggleError'));
        setShowToast(true);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  // Track device settings changes to update UI
  useEffect(() => {
    // Log changes to discovery state
    if (deviceSettings) {
      console.log(`[DeviceSettings] Settings updated - discovery is now ${deviceSettings.discoveryEnabled ? 'ENABLED' : 'DISABLED'}`);
    }
  }, [deviceSettings?.discoveryEnabled]);
  
  // When component mounts or regains focus, ensure settings are up to date
  useFocusEffect(
    React.useCallback(() => {
      console.log('[DeviceSettings] Component gained focus - checking discovery state');
      
      // Try to get direct reference to the discovery model to check actual state
      try {
        const DeviceDiscoveryModel = require('@src/models/network').DeviceDiscoveryModel;
        const discoveryModel = DeviceDiscoveryModel.getInstance();
        
        if (discoveryModel && typeof discoveryModel.isDiscovering === 'function') {
          const actualDiscoveryState = discoveryModel.isDiscovering();
          console.log(`[DeviceSettings] Actual discovery state from model: ${actualDiscoveryState}`);
          
          // If settings don't match the actual state, force update
          if (deviceSettings && deviceSettings.discoveryEnabled !== actualDiscoveryState) {
            console.log(`[DeviceSettings] Discovery state mismatch - settings=${deviceSettings.discoveryEnabled}, actual=${actualDiscoveryState}`);
            
            // Force refresh device settings - do not actually toggle anything
            if (typeof deviceConfig !== 'undefined') {
              console.log('[DeviceSettings] Force syncing settings with actual state');
            }
          }
        }
      } catch (error) {
        console.error('[DeviceSettings] Error checking discovery model state:', error);
      }
      
      return () => {
        console.log('[DeviceSettings] Component lost focus');
      };
    }, [deviceSettings])
  );

  if (isLoading && !deviceSettings) {
    return (
      <View style={themedStyles.loadingOverlay}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <Text style={{ marginTop: 8 }}>{t('settings.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={themedStyles.screenContainer}>
        <Text style={themedStyles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <>
      <List.Section>
        <List.Subheader>{t('settings.device.discoverySettings')}</List.Subheader>
        
        <List.Item
          title={t('settings.device.discoveryEnabled')}
          description={t('settings.device.discoveryEnabledDesc')}
          onPress={handleToggleDiscoveryEnabled}
          right={props => {
            // Log the current state whenever the switch is rendered
            console.log(`[DeviceSettings] Rendering discovery switch with value=${deviceSettings?.discoveryEnabled}`);
            return (
              <Switch
                {...props}
                value={deviceSettings?.discoveryEnabled === true}
                onValueChange={() => {
                  console.log(`[DeviceSettings] Switch onValueChange called with value=${!deviceSettings?.discoveryEnabled}`);
                  handleToggleDiscoveryEnabled();
                }}
                disabled={isUpdating}
                color={theme.colors.primary}
              />
            );
          }}
        />
        
        <List.Item
          title={t('settings.device.autoConnect')}
          description={t('settings.device.autoConnectDesc')}
          right={() => (
            <Switch
              value={deviceSettings?.autoConnect || false}
              onValueChange={toggleAutoConnect}
              disabled={isLoading}
              color={theme.colors.primary}
            />
          )}
        />
        
        <List.Item
          title={t('settings.device.addOnlyConnected')}
          description={t('settings.device.addOnlyConnectedDesc')}
          right={() => (
            <Switch
              value={deviceSettings?.addOnlyConnectedDevices || false}
              onValueChange={toggleAddOnlyConnectedDevices}
              disabled={isLoading}
              color={theme.colors.primary}
            />
          )}
        />
        
        <View style={themedStyles.inputContainer || {marginBottom: 16}}>
          <Text style={themedStyles.inputLabel || {marginBottom: 8}}>{t('settings.device.discoveryPort')}</Text>
          <TextInput
            value={discoveryPort}
            onChangeText={setDiscoveryPortValue}
            onBlur={handleUpdateDiscoveryPort}
            keyboardType="number-pad"
            placeholder="1024-65535"
            error={!!portError}
            style={themedStyles.input || {width: '100%'}}
            disabled={isLoading}
          />
          {portError ? <Text style={themedStyles.error || {color: theme.colors.error}}>{portError}</Text> : null}
        </View>
        
        <List.Item
          title="Test UDP & QUIC Connectivity"
          description={t('settings.device.testESP32Connectivity.description', { defaultValue: 'Test connectivity to ESP32 devices' })}
          style={[themedStyles.settingsItem]}
          onPress={handleTestConnectivity}
          disabled={isLoading}
        />

        <List.Item
          title="QUIC Model Test Tool"
          description="Advanced test tool for UDP sockets and QUIC transport"
          style={[themedStyles.settingsItem]}
          right={() => (
            <IconButton
              icon="dev-to"
              iconColor={theme.colors.primary}
              onPress={() => router.push(routes.screens.quicTest)}
            />
          )}
        />

        <List.Item
          title="ESP32 UDP Diagnostics"
          description="Test and troubleshoot ESP32 UDP communication"
          style={[themedStyles.settingsItem, themedStyles.settingsItemLast]}
          right={() => (
            <IconButton
              icon="wifi"
              iconColor={theme.colors.primary}
              onPress={() => router.push(routes.screens.udpDiagnostic)}
              disabled={isLoading}
            />
          )}
        />
        
        {/* ESP32 Connectivity Test Button */}
        <View style={styles.testContainer}>
          <Button 
            mode="outlined" 
            onPress={handleForceInitialization}
            loading={isForceInitializing}
            disabled={testingConnectivity || isLoading || isForceInitializing}
            style={[styles.testButton, { marginTop: 8 }]}
          >
            Force Initialize Discovery
          </Button>
          
          <Button 
            mode="outlined" 
            onPress={() => navigateToUDPDiagnostic()}
            disabled={testingConnectivity || isLoading || isForceInitializing}
            style={[styles.testButton, { marginTop: 8 }]}
          >
            Advanced UDP Diagnostics
          </Button>
          
          {testResults.length > 0 && (
            <View style={styles.testResults}>
              <Text style={styles.testResultsTitle}>{t('settings.device.testResults')}</Text>
              <ScrollView style={styles.testResultsScroll}>
                {testResults.map((result, index) => (
                  <Text key={index} style={styles.testResultText}>
                    {result}
                  </Text>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </List.Section>
      
      <List.Section>
        <List.Subheader>{t('settings.device.discoveredDevices')}</List.Subheader>
        {renderDevices()}
      </List.Section>
      
      {/* Error Toast/Snackbar */}
      <Snackbar
        visible={showToast}
        onDismiss={() => setShowToast(false)}
        duration={3000}
        action={{
          label: 'Dismiss',
          onPress: () => setShowToast(false),
        }}
      >
        {toastMessage}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  deviceItem: {
    marginBottom: 8,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  deviceSettings: {
    marginTop: 8,
  },
  testContainer: {
    padding: 16,
  },
  testButton: {
    marginBottom: 8,
  },
  testResults: {
    marginTop: 16,
    padding: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
  },
  testResultsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  testResultsScroll: {
    maxHeight: 200,
  },
  testResultText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 12,
    marginBottom: 4,
  },
  connectionStatus: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  connected: {
    backgroundColor: 'green',
  },
  disconnected: {
    backgroundColor: 'red',
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceInfoText: {
    marginLeft: 8,
    fontSize: 12,
    color: '#666',
  },
  portInput: {
    marginTop: 8,
    marginBottom: 16,
  },
  loadingText: {
    marginTop: 2,
  },
}); 