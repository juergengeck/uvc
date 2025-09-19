import React, { useState, useCallback, useRef } from 'react';
import { View, ScrollView, StyleSheet, Platform } from 'react-native';
import { Button, Text, Card, Divider, ProgressBar } from 'react-native-paper';
import { useTheme } from '@src/providers/app/AppTheme';
import { QuicModel } from '@src/models/network/QuicModel';
import { DeviceDiscoveryModel } from '@src/models/network';
import { ESP32ConnectionManager } from '@src/models/network/esp32/ESP32ConnectionManager';
import { Buffer } from '@refinio/one.core/lib/system/expo/index.js';
import { NetworkServiceType } from '@src/models/network/interfaces';

interface TestResult {
  test: string;
  status: 'running' | 'pass' | 'fail';
  message: string;
  timing?: number;
  details?: any;
}

interface ESP32Device {
  id: string;
  name: string;
  address: string;
  port: number;
  ownerId?: string;
}

/**
 * ESP32 Practical Tests
 * Real-world tests that measure actual device behavior
 */
export default function ESP32PracticalTests() {
  const { theme, styles: themedStyles } = useTheme();
  const [selectedDevice, setSelectedDevice] = useState<ESP32Device | null>(null);
  const [devices, setDevices] = useState<ESP32Device[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [currentTest, setCurrentTest] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const abortController = useRef<AbortController | null>(null);

  // Scan for devices
  const scanForDevices = useCallback(async () => {
    setIsScanning(true);
    try {
      const discoveryModel = DeviceDiscoveryModel.getInstance();
      const allDevices = discoveryModel.getDevices();
      const esp32Devices = allDevices
        .filter(d => d.type === 'ESP32' && d.port > 0)
        .map(d => ({ 
          id: d.id, 
          name: d.name, 
          address: d.address, 
          port: d.port,
          ownerId: d.ownerId 
        }));
      
      setDevices(esp32Devices);
      if (esp32Devices.length > 0 && !selectedDevice) {
        setSelectedDevice(esp32Devices[0]);
      }
    } catch (error) {
      console.error('[ESP32PracticalTests] Error scanning:', error);
    } finally {
      setIsScanning(false);
    }
  }, [selectedDevice]);

  // Update test result
  const updateResult = (test: string, status: TestResult['status'], message: string, timing?: number, details?: any) => {
    setTestResults(prev => {
      const existing = prev.find(r => r.test === test);
      if (existing) {
        return prev.map(r => r.test === test ? { ...r, status, message, timing, details } : r);
      }
      return [...prev, { test, status, message, timing, details }];
    });
  };

  // Test 1: Ownership Cycle Timing
  const testOwnershipCycle = async () => {
    if (!selectedDevice) return;
    
    const testName = 'Ownership Cycle (5x)';
    setCurrentTest(testName);
    updateResult(testName, 'running', 'Starting ownership cycle test...');
    
    const discoveryModel = DeviceDiscoveryModel.getInstance();
    const timings: number[] = [];
    
    try {
      for (let i = 0; i < 5; i++) {
        const cycleStart = Date.now();
        
        // Take ownership
        const claimStart = Date.now();
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Claim timeout')), 5000);
          
          const unsubscribe = discoveryModel.onDeviceUpdated.listen((deviceId) => {
            if (deviceId === selectedDevice.id) {
              const device = discoveryModel.getDevice(deviceId);
              if (device?.ownerId) {
                clearTimeout(timeout);
                unsubscribe();
                resolve();
              }
            }
          });
          
          discoveryModel.claimDevice(selectedDevice.id).catch(reject);
        });
        const claimTime = Date.now() - claimStart;
        
        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Release ownership
        const releaseStart = Date.now();
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Release timeout')), 5000);
          
          const unsubscribe = discoveryModel.onDeviceUpdated.listen((deviceId) => {
            if (deviceId === selectedDevice.id) {
              const device = discoveryModel.getDevice(deviceId);
              if (!device?.ownerId) {
                clearTimeout(timeout);
                unsubscribe();
                resolve();
              }
            }
          });
          
          // Send release command
          const quicModel = QuicModel.getInstance();
          const releaseCommand = {
            action: 'remove_ownership',
            deviceId: selectedDevice.id
          };
          const packet = Buffer.concat([
            Buffer.from([NetworkServiceType.CREDENTIAL_SERVICE]),
            Buffer.from(JSON.stringify(releaseCommand))
          ]);
          quicModel.send(packet, selectedDevice.address, selectedDevice.port);
        });
        const releaseTime = Date.now() - releaseStart;
        
        const cycleTime = Date.now() - cycleStart;
        timings.push(cycleTime);
        
        updateResult(testName, 'running', `Cycle ${i + 1}/5: Claim ${claimTime}ms, Release ${releaseTime}ms`);
        
        // Wait before next cycle
        if (i < 4) await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
      updateResult(testName, 'pass', `Average cycle time: ${avgTime.toFixed(0)}ms`, avgTime, { timings });
    } catch (error: any) {
      updateResult(testName, 'fail', error.message);
    }
  };

  // Test 2: LED Cycle with Timing
  const testLEDCycle = async () => {
    if (!selectedDevice) return;
    
    const testName = 'LED Toggle Cycle (10x)';
    setCurrentTest(testName);
    updateResult(testName, 'running', 'Ensuring device ownership...');
    
    const discoveryModel = DeviceDiscoveryModel.getInstance();
    const quicModel = await QuicModel.ensureInitialized();
    
    try {
      // Ensure we own the device
      const device = discoveryModel.getDevice(selectedDevice.id);
      if (!device?.ownerId) {
        await discoveryModel.claimDevice(selectedDevice.id);
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for claim to settle
      }
      
      updateResult(testName, 'running', 'Starting LED toggle cycles...');
      const timings: number[] = [];
      
      for (let i = 0; i < 10; i++) {
        const toggleStart = Date.now();
        
        // Use proper ESP32ConnectionManager instead of raw UDP packets
        const esp32ConnectionManager = ESP32ConnectionManager.getInstance();
        
        const esp32Command = {
          type: 'led_control' as const,
          action: i % 2 === 0 ? 'on' : 'off',
          timestamp: Date.now()
        };
        
        // Send command through ESP32ConnectionManager which uses QUIC-VC
        const responded = await new Promise<boolean>((resolve) => {
          esp32ConnectionManager.sendCommand(selectedDevice.id, esp32Command)
            .then(response => {
              console.log(`[ESP32Tests] LED command response:`, response);
              resolve(response.status === 'success' || response.status === 'sent');
            })
            .catch(error => {
              console.error(`[ESP32Tests] LED command failed:`, error);
              resolve(false);
            });
        });
        
        if (!responded) throw new Error('LED command timeout');
        
        const toggleTime = Date.now() - toggleStart;
        timings.push(toggleTime);
        
        updateResult(testName, 'running', `Toggle ${i + 1}/10: ${toggleTime}ms`);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
      updateResult(testName, 'pass', `Average toggle time: ${avgTime.toFixed(0)}ms`, avgTime, { timings });
    } catch (error: any) {
      updateResult(testName, 'fail', error.message);
    }
  };

  // Test 3: Discovery without credentials
  const testDiscoveryWithoutCreds = async () => {
    if (!selectedDevice) return;
    
    const testName = 'Discovery (No Credentials)';
    setCurrentTest(testName);
    updateResult(testName, 'running', 'Removing any existing credentials...');
    
    const discoveryModel = DeviceDiscoveryModel.getInstance();
    const quicModel = await QuicModel.ensureInitialized();
    
    try {
      // Ensure device has no credentials
      const device = discoveryModel.getDevice(selectedDevice.id);
      if (device?.ownerId) {
        const releaseCommand = {
          action: 'remove_ownership',
          deviceId: selectedDevice.id
        };
        const packet = Buffer.concat([
          Buffer.from([NetworkServiceType.CREDENTIAL_SERVICE]),
          Buffer.from(JSON.stringify(releaseCommand))
        ]);
        await quicModel.send(packet, selectedDevice.address, selectedDevice.port);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      updateResult(testName, 'running', 'Listening for discovery broadcasts...');
      
      const broadcasts: any[] = [];
      const startTime = Date.now();
      
      await new Promise<void>((resolve) => {
        const handler = (data: Uint8Array, rinfo: any) => {
          if (rinfo.address === selectedDevice.address) {
            // Discovery packets might be raw bytes
            broadcasts.push({
              time: Date.now() - startTime,
              size: data.length,
              raw: Buffer.from(data).toString('hex').substring(0, 32) + '...'
            });
            
            if (broadcasts.length >= 3) {
              quicModel.removeService(NetworkServiceType.DISCOVERY_SERVICE);
              resolve();
            }
          }
        };
        
        quicModel.addService(NetworkServiceType.DISCOVERY_SERVICE, handler);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          quicModel.removeService(NetworkServiceType.DISCOVERY_SERVICE);
          resolve();
        }, 10000);
      });
      
      if (broadcasts.length > 0) {
        const intervals = broadcasts.slice(1).map((b, i) => b.time - broadcasts[i].time);
        const avgInterval = intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0;
        updateResult(testName, 'pass', 
          `Received ${broadcasts.length} broadcasts, avg interval: ${avgInterval.toFixed(0)}ms`,
          avgInterval,
          { broadcasts }
        );
      } else {
        updateResult(testName, 'fail', 'No discovery broadcasts received');
      }
    } catch (error: any) {
      updateResult(testName, 'fail', error.message);
    }
  };

  // Test 4: Heartbeat with credentials
  const testHeartbeatWithCreds = async () => {
    if (!selectedDevice) return;
    
    const testName = 'Heartbeat (With Credentials)';
    setCurrentTest(testName);
    updateResult(testName, 'running', 'Ensuring device ownership...');
    
    const discoveryModel = DeviceDiscoveryModel.getInstance();
    const quicModel = await QuicModel.ensureInitialized();
    
    try {
      // Ensure we own the device
      const device = discoveryModel.getDevice(selectedDevice.id);
      if (!device?.ownerId) {
        await discoveryModel.claimDevice(selectedDevice.id);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      updateResult(testName, 'running', 'Listening for heartbeats...');
      
      const heartbeats: any[] = [];
      const startTime = Date.now();
      
      await new Promise<void>((resolve) => {
        const handler = (data: Uint8Array, rinfo: any) => {
          if (rinfo.address === selectedDevice.address) {
            heartbeats.push({
              time: Date.now() - startTime,
              size: data.length
            });
            
            if (heartbeats.length >= 5) {
              quicModel.removeService(NetworkServiceType.HEARTBEAT_SERVICE);
              resolve();
            }
          }
        };
        
        quicModel.addService(NetworkServiceType.HEARTBEAT_SERVICE, handler);
        
        // Timeout after 20 seconds
        setTimeout(() => {
          quicModel.removeService(NetworkServiceType.HEARTBEAT_SERVICE);
          resolve();
        }, 20000);
      });
      
      if (heartbeats.length > 0) {
        const intervals = heartbeats.slice(1).map((h, i) => h.time - heartbeats[i].time);
        const avgInterval = intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0;
        updateResult(testName, 'pass', 
          `Received ${heartbeats.length} heartbeats, avg interval: ${avgInterval.toFixed(0)}ms`,
          avgInterval,
          { heartbeats }
        );
      } else {
        updateResult(testName, 'fail', 'No heartbeats received');
      }
    } catch (error: any) {
      updateResult(testName, 'fail', error.message);
    }
  };

  // Run all tests
  const runAllTests = async () => {
    if (!selectedDevice) {
      await scanForDevices();
      return;
    }
    
    setTestResults([]);
    abortController.current = new AbortController();
    
    await testOwnershipCycle();
    if (abortController.current.signal.aborted) return;
    
    await testLEDCycle();
    if (abortController.current.signal.aborted) return;
    
    await testDiscoveryWithoutCreds();
    if (abortController.current.signal.aborted) return;
    
    await testHeartbeatWithCreds();
    
    setCurrentTest(null);
  };

  // Stop tests
  const stopTests = () => {
    abortController.current?.abort();
    setCurrentTest(null);
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: 16,
    },
    deviceSelector: {
      marginBottom: 16,
    },
    buttonRow: {
      flexDirection: 'row',
      marginVertical: 16,
      gap: 8,
    },
    testCard: {
      marginBottom: 8,
    },
    testHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    statusBadge: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '600',
    },
    timingText: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
      marginTop: 4,
    },
    detailsText: {
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 11,
      color: theme.colors.onSurfaceVariant,
      marginTop: 8,
    },
  });

  const getStatusColor = (status: TestResult['status']) => {
    switch (status) {
      case 'running': return theme.colors.primary;
      case 'pass': return theme.colors.primary;
      case 'fail': return theme.colors.error;
    }
  };

  return (
    <View style={styles.container}>
      {/* Device Selection */}
      <Card style={styles.deviceSelector}>
        <Card.Title 
          title="ESP32 Device"
          subtitle={selectedDevice ? `${selectedDevice.name} (${selectedDevice.ownerId ? 'Owned' : 'Not owned'})` : 'No device selected'}
          right={(props) => (
            <Button 
              {...props} 
              mode="text" 
              onPress={scanForDevices}
              loading={isScanning}
              disabled={isScanning || currentTest !== null}
            >
              Scan
            </Button>
          )}
        />
      </Card>

      {/* Control Buttons */}
      <View style={styles.buttonRow}>
        <Button
          mode="contained"
          onPress={runAllTests}
          disabled={currentTest !== null || !selectedDevice}
          style={{ flex: 1 }}
        >
          Run All Tests
        </Button>
        <Button
          mode="outlined"
          onPress={stopTests}
          disabled={currentTest === null}
          style={{ flex: 1 }}
        >
          Stop
        </Button>
      </View>

      {/* Test Results */}
      <ScrollView showsVerticalScrollIndicator={false}>
        {testResults.map((result, index) => (
          <Card key={index} style={styles.testCard}>
            <Card.Content>
              <View style={styles.testHeader}>
                <Text variant="titleMedium">{result.test}</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(result.status) + '20' }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(result.status) }]}>
                    {result.status.toUpperCase()}
                  </Text>
                </View>
              </View>
              
              {result.status === 'running' && (
                <ProgressBar indeterminate color={theme.colors.primary} />
              )}
              
              <Text variant="bodyMedium">{result.message}</Text>
              
              {result.timing && (
                <Text style={styles.timingText}>
                  Timing: {result.timing.toFixed(0)}ms
                </Text>
              )}
              
              {result.details && (
                <Text style={styles.detailsText}>
                  {JSON.stringify(result.details, null, 2)}
                </Text>
              )}
            </Card.Content>
          </Card>
        ))}
        
        {testResults.length === 0 && !currentTest && (
          <Text style={{ textAlign: 'center', color: theme.colors.onSurfaceVariant, marginTop: 32 }}>
            Select a device and run tests to measure real-world ESP32 performance
          </Text>
        )}
      </ScrollView>
    </View>
  );
}