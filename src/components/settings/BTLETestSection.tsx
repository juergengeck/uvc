import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { List, Button, Text, Divider, Chip, ActivityIndicator, Surface } from 'react-native-paper';
import { NativeModules, Platform } from 'react-native';

interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'success' | 'failure' | 'skipped';
  message?: string;
  error?: string;
}

export const BTLETestSection: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<TestResult[]>([]);

  const runBTLETests = useCallback(async () => {
    setIsRunning(true);
    const results: TestResult[] = [];

    // Test 1: Check Platform
    results.push({
      name: 'Platform Check',
      status: 'running',
      message: `Platform: ${Platform.OS} v${Platform.Version}`
    });
    setTestResults([...results]);
    await new Promise(resolve => setTimeout(resolve, 100));
    results[0].status = Platform.OS === 'web' ? 'failure' : 'success';
    results[0].message = Platform.OS === 'web' 
      ? 'BLE not supported on web' 
      : `Platform: ${Platform.OS} v${Platform.Version} ✓`;
    setTestResults([...results]);

    if (Platform.OS === 'web') {
      setIsRunning(false);
      return;
    }

    // Test 2: Check Native Modules
    results.push({
      name: 'Native Modules Check',
      status: 'running'
    });
    setTestResults([...results]);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const hasBlePlx = NativeModules.BlePlx !== undefined;
    results[1].status = hasBlePlx ? 'success' : 'failure';
    results[1].message = hasBlePlx 
      ? 'BlePlx module found ✓' 
      : 'BlePlx module NOT found';
    if (!hasBlePlx) {
      results[1].error = 'Run: npx expo prebuild --clean && cd ios && pod install';
    }
    setTestResults([...results]);

    // Test 3: Try to import react-native-ble-plx
    results.push({
      name: 'Import BLE Library',
      status: 'running'
    });
    setTestResults([...results]);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      const blePlx = require('react-native-ble-plx');
      results[2].status = blePlx.BleManager ? 'success' : 'failure';
      results[2].message = blePlx.BleManager 
        ? 'react-native-ble-plx loaded ✓' 
        : 'BleManager not found';
    } catch (error: any) {
      results[2].status = 'failure';
      results[2].error = error.message;
    }
    setTestResults([...results]);

    // Test 4: Try to get/create BleManager singleton
    results.push({
      name: 'Create BleManager Singleton',
      status: 'running'
    });
    setTestResults([...results]);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      const { BleManager } = require('react-native-ble-plx');
      // Get or create the singleton - this is what everyone should do
      const manager = BleManager.sharedInstance || new BleManager();
      results[3].status = 'success';
      results[3].message = BleManager.sharedInstance 
        ? 'BleManager singleton reused ✓' 
        : 'BleManager singleton created ✓';
      // Don't destroy - let the singleton live
    } catch (error: any) {
      results[3].status = 'failure';
      results[3].error = error.message;
      if (error.message?.includes('NativeEventEmitter')) {
        results[3].error += '\n\nThis is the error preventing BLE from working!';
      }
    }
    setTestResults([...results]);

    // Test 5: Check UnifiedBLEManager
    results.push({
      name: 'UnifiedBLEManager',
      status: 'running'
    });
    setTestResults([...results]);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      const { UnifiedBLEManager } = await import('@refinio/one.btle');
      const unifiedManager = new UnifiedBLEManager({
        enableLogging: false
        // Remove restoreStateIdentifier - it causes undefined device errors
      });
      
      if (unifiedManager.initialize) {
        const initialized = await unifiedManager.initialize();
        results[4].status = initialized ? 'success' : 'failure';
        results[4].message = initialized 
          ? 'UnifiedBLEManager initialized ✓' 
          : 'UnifiedBLEManager failed to initialize';
      } else {
        results[4].status = 'failure';
        results[4].message = 'No initialize method';
      }
    } catch (error: any) {
      results[4].status = 'failure';
      results[4].error = error.message;
    }
    setTestResults([...results]);

    // Test 6: Check UniversalBTLEService
    results.push({
      name: 'UniversalBTLEService',
      status: 'running'
    });
    setTestResults([...results]);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      const { UniversalBTLEService } = await import('@src/services/ESP32BTLEService');
      const service = new UniversalBTLEService();
      const initialized = await service.initialize();
      
      results[5].status = initialized ? 'success' : 'failure';
      results[5].message = initialized 
        ? 'UniversalBTLEService initialized ✓' 
        : 'UniversalBTLEService failed to initialize';
    } catch (error: any) {
      results[5].status = 'failure';
      results[5].error = error.message;
    }
    setTestResults([...results]);

    setIsRunning(false);
  }, []);

  const getStatusColor = (status: TestResult['status']) => {
    switch (status) {
      case 'success': return '#4CAF50';
      case 'failure': return '#F44336';
      case 'running': return '#2196F3';
      case 'skipped': return '#9E9E9E';
      default: return '#757575';
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'success': return 'check-circle';
      case 'failure': return 'alert-circle';
      case 'running': return 'progress-clock';
      case 'skipped': return 'skip-next';
      default: return 'circle-outline';
    }
  };

  return (
    <List.Accordion
      title="BTLE Module Tests"
      description="Test Bluetooth Low Energy module status"
      left={props => <List.Icon {...props} icon="bluetooth" />}
      expanded={isExpanded}
      onPress={() => setIsExpanded(!isExpanded)}
    >
      <Surface style={styles.container}>
        <View style={styles.header}>
          <Text variant="bodyMedium" style={styles.description}>
            These tests check if the BLE native module is properly installed and working.
          </Text>
          <Button
            mode="contained"
            onPress={runBTLETests}
            disabled={isRunning}
            style={styles.runButton}
          >
            {isRunning ? 'Running Tests...' : 'Run BTLE Tests'}
          </Button>
        </View>

        {testResults.length > 0 && (
          <>
            <Divider style={styles.divider} />
            <ScrollView style={styles.results}>
              {testResults.map((result, index) => (
                <View key={index} style={styles.testResult}>
                  <View style={styles.testHeader}>
                    <List.Icon 
                      icon={getStatusIcon(result.status)} 
                      color={getStatusColor(result.status)}
                    />
                    <View style={styles.testInfo}>
                      <Text 
                        variant="bodyLarge" 
                        style={[styles.testName, { color: getStatusColor(result.status) }]}
                      >
                        {result.name}
                      </Text>
                      {result.status === 'running' && (
                        <ActivityIndicator size="small" style={styles.spinner} />
                      )}
                    </View>
                  </View>
                  {result.message && (
                    <Text variant="bodySmall" style={styles.message}>
                      {result.message}
                    </Text>
                  )}
                  {result.error && (
                    <View style={styles.errorContainer}>
                      <Text variant="bodySmall" style={styles.error}>
                        ❌ {result.error}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          </>
        )}

        {testResults.length > 0 && (
          <View style={styles.summary}>
            <Divider style={styles.divider} />
            <View style={styles.summaryRow}>
              <Chip 
                icon="check" 
                style={[styles.chip, { backgroundColor: '#E8F5E9' }]}
              >
                {testResults.filter(r => r.status === 'success').length} Passed
              </Chip>
              <Chip 
                icon="alert" 
                style={[styles.chip, { backgroundColor: '#FFEBEE' }]}
              >
                {testResults.filter(r => r.status === 'failure').length} Failed
              </Chip>
              {testResults.some(r => r.status === 'skipped') && (
                <Chip 
                  icon="skip-next" 
                  style={[styles.chip, { backgroundColor: '#F5F5F5' }]}
                >
                  {testResults.filter(r => r.status === 'skipped').length} Skipped
                </Chip>
              )}
            </View>
          </View>
        )}
      </Surface>
    </List.Accordion>
  );
};

const styles = StyleSheet.create({
  container: {
    margin: 16,
    padding: 16,
    borderRadius: 8,
    elevation: 2,
  },
  header: {
    marginBottom: 8,
  },
  description: {
    marginBottom: 12,
    opacity: 0.7,
  },
  runButton: {
    marginTop: 8,
  },
  divider: {
    marginVertical: 12,
  },
  results: {
    maxHeight: 400,
  },
  testResult: {
    marginBottom: 16,
  },
  testHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  testInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  testName: {
    fontWeight: '500',
  },
  spinner: {
    marginLeft: 8,
  },
  message: {
    marginLeft: 56,
    marginTop: 4,
    opacity: 0.8,
  },
  errorContainer: {
    marginLeft: 56,
    marginTop: 8,
    padding: 8,
    backgroundColor: '#FFEBEE',
    borderRadius: 4,
  },
  error: {
    color: '#C62828',
    fontSize: 12,
  },
  summary: {
    marginTop: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    height: 28,
  },
});