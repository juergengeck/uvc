import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';

export default function BTLETestScreen() {
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const runModuleTest = async () => {
    setIsRunning(true);
    setLogs([]);
    
    try {
      addLog('Full test disabled - XPC connection causes crash on simulator');
      addLog('Use "Test Import" to verify module is loaded');
      
    } catch (error) {
      addLog(`Test failed: ${error}`);
    } finally {
      setIsRunning(false);
    }
  };

  const testImportOnly = async () => {
    try {
      const btleModule = await import('@refinio/one.btle');
      addLog('✅ Module import successful');
      addLog(`Available exports: ${Object.keys(btleModule).join(', ')}`);
      
      if (btleModule.GATT_SERVICES) {
        addLog(`✅ GATT_SERVICES available: ${Object.keys(btleModule.GATT_SERVICES).join(', ')}`);
      }
      
      if (btleModule.BTLE_EVENTS) {
        addLog(`✅ BTLE_EVENTS available: ${Object.keys(btleModule.BTLE_EVENTS).join(', ')}`);
      }
      
      if (btleModule.BTLEService) {
        addLog('✅ BTLEService class available');
      }
      
      if (btleModule.btleService) {
        addLog('✅ btleService instance available');
      }
      
      if (btleModule.default) {
        addLog('✅ Native module available');
      }
      
    } catch (error) {
      addLog(`❌ Import failed: ${error}`);
    }
  };

  return (
    <View style={{ flex: 1, padding: 20, backgroundColor: 'white' }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>
        BTLE Module Test
      </Text>
      
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
        <TouchableOpacity
          style={{
            backgroundColor: '#007AFF',
            padding: 10,
            borderRadius: 8,
            flex: 1,
          }}
          onPress={testImportOnly}
        >
          <Text style={{ color: 'white', textAlign: 'center' }}>
            Test Import
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={{
            backgroundColor: isRunning ? '#999' : '#34C759',
            padding: 10,
            borderRadius: 8,
            flex: 1,
          }}
          onPress={runModuleTest}
          disabled={isRunning}
        >
          <Text style={{ color: 'white', textAlign: 'center' }}>
            {isRunning ? 'Running...' : 'Run Full Test'}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={{
          backgroundColor: '#FF3B30',
          padding: 10,
          borderRadius: 8,
          marginBottom: 20,
        }}
        onPress={() => setLogs([])}
      >
        <Text style={{ color: 'white', textAlign: 'center' }}>
          Clear Logs
        </Text>
      </TouchableOpacity>

      <ScrollView
        style={{
          flex: 1,
          backgroundColor: '#f5f5f5',
          padding: 10,
          borderRadius: 8,
        }}
        showsVerticalScrollIndicator={true}
      >
        {logs.length === 0 ? (
          <Text style={{ color: '#666', fontStyle: 'italic' }}>
            No logs yet. Tap a button above to start testing.
          </Text>
        ) : (
          logs.map((log, index) => (
            <Text
              key={index}
              style={{
                fontSize: 12,
                fontFamily: 'monospace',
                marginBottom: 5,
                color: log.includes('ERROR') ? '#FF3B30' : 
                      log.includes('✅') ? '#34C759' : '#333',
              }}
            >
              {log}
            </Text>
          ))
        )}
      </ScrollView>
    </View>
  );
}