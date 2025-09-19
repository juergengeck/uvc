/**
 * UDP Module Test Button
 * 
 * A self-contained button component that tests the UDP module functionality
 * and displays the results. This test verifies:
 * - Socket creation
 * - Port binding
 * - Broadcast capabilities
 * - Message sending/receiving
 * - Event handling
 */

import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Button } from 'react-native-paper';
import { testUDPModule } from '../models/network';

interface UDPModuleTestButtonProps {
  onTestComplete?: (success: boolean, results: any) => void;
}

const UDPModuleTestButton: React.FC<UDPModuleTestButtonProps> = ({ onTestComplete }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Capture console logs
  const setupLogCapture = () => {
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    
    console.log = (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      
      // Only capture UDP Module Test logs
      if (message.includes('[UDPModule Test]')) {
        setLogs(prev => [...prev, message]);
      }
      
      originalConsoleLog(...args);
    };
    
    console.error = (...args) => {
      const message = `ERROR: ${args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ')}`;
      
      // Only capture UDP Module Test logs
      if (message.includes('[UDPModule Test]')) {
        setLogs(prev => [...prev, message]);
      }
      
      originalConsoleError(...args);
    };
    
    return () => {
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
    };
  };
  
  // Run the UDP module test
  const runTest = async () => {
    try {
      setIsRunning(true);
      setLogs([]);
      setResults(null);
      
      // Set up log capture
      const restoreConsole = setupLogCapture();
      
      // Run the test
      const testResults = await testUDPModule();
      
      // Update state with results
      setResults(testResults);
      
      // Restore console functions
      restoreConsole();
      
      // Call the callback if provided
      if (onTestComplete) {
        onTestComplete(testResults.success, testResults);
      }
    } catch (error) {
      setLogs(prev => [...prev, `Test failed with error: ${String(error)}`]);
      
      // Update results with failure
      setResults({
        success: false,
        error: String(error)
      });
      
      // Call the callback if provided
      if (onTestComplete) {
        onTestComplete(false, { success: false, error: String(error) });
      }
    } finally {
      setIsRunning(false);
    }
  };
  
  // Auto-scroll to bottom when logs update
  React.useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [logs]);
  
  // Determine the button color based on test results
  const getButtonColor = () => {
    if (isRunning) return '#9c9c9c';
    if (!results) return '#2196F3';
    return results.success ? '#4CAF50' : '#F44336';
  };
  
  // Get the button text based on state
  const getButtonText = () => {
    if (isRunning) return 'Running UDP Module Test...';
    if (!results) return 'Test UDP Module';
    return results.success ? '✅ UDP Test Passed' : '❌ UDP Test Failed';
  };
  
  return (
    <View style={styles.container}>
      <Button
        mode="contained"
        onPress={runTest}
        disabled={isRunning}
        style={[styles.button, { backgroundColor: getButtonColor() }]}
        labelStyle={styles.buttonLabel}
      >
        {getButtonText()}
      </Button>
      
      {logs.length > 0 && (
        <View style={styles.logsContainer}>
          <Text style={styles.logsTitle}>Test Logs:</Text>
          <ScrollView 
            style={styles.logs}
            ref={scrollViewRef}
          >
            {logs.map((log, index) => (
              <Text key={index} style={styles.logLine}>
                {log}
              </Text>
            ))}
          </ScrollView>
        </View>
      )}
      
      {results && (
        <View style={styles.resultsContainer}>
          <Text style={[
            styles.resultsTitle,
            { color: results.success ? '#4CAF50' : '#F44336' }
          ]}>
            Test {results.success ? 'Passed' : 'Failed'}
          </Text>
          
          {results.results && (
            <View style={styles.resultDetails}>
              <Text style={styles.resultItem}>
                Socket Creation: {results.results.socketCreation ? '✅' : '❌'}
              </Text>
              <Text style={styles.resultItem}>
                Port Binding: {results.results.binding ? '✅' : '❌'}
              </Text>
              <Text style={styles.resultItem}>
                Broadcasting: {results.results.broadcasting ? '✅' : '❌'}
              </Text>
              <Text style={styles.resultItem}>
                Sending: {results.results.sending ? '✅' : '❌'}
              </Text>
              <Text style={styles.resultItem}>
                Receiving: {results.results.receiving ? '✅' : '❌'}
              </Text>
              
              {results.results.performance && (
                <Text style={styles.resultItem}>
                  Test Duration: {results.results.performance.duration}ms
                </Text>
              )}
            </View>
          )}
          
          {results.error && (
            <Text style={styles.errorText}>{results.error}</Text>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginVertical: 12,
  },
  button: {
    paddingVertical: 8,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  logsContainer: {
    marginTop: 16,
    backgroundColor: '#2c2c2c',
    borderRadius: 8,
    overflow: 'hidden',
  },
  logsTitle: {
    backgroundColor: '#444',
    color: 'white',
    padding: 8,
    fontWeight: 'bold',
  },
  logs: {
    maxHeight: 200,
    padding: 8,
  },
  logLine: {
    color: '#ddd',
    fontFamily: 'monospace',
    fontSize: 12,
    marginBottom: 2,
  },
  resultsContainer: {
    marginTop: 16,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  resultDetails: {
    marginTop: 8,
  },
  resultItem: {
    fontSize: 14,
    marginBottom: 4,
  },
  errorText: {
    color: '#F44336',
    marginTop: 8,
    fontFamily: 'monospace',
  },
});

export default UDPModuleTestButton; 