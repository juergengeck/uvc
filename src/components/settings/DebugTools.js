import React, { useState } from 'react';
import { View, Button, StyleSheet, Text, ScrollView } from 'react-native';
import { useAppModel } from '../../hooks/useAppModel';
import { showContacts } from '../../scripts/debugContacts';
import { diagnoseContactCreation } from '../../utils/contactUtils';

// ESP32 debugging tools
import { testESP32Discovery, quickESP32Test, safeESP32NetworkScan } from '../../commands/testESP32Discovery';
import { ESP32DebugHelper } from '../../debug/ESP32DebugHelper';

// ConnectionsModel testing component
import { ConnectionsModelTestComponent } from './ConnectionsModelTestComponent';

/**
 * A debug component that provides tools for developers
 */
export const DebugTools = () => {
  const { appModel } = useAppModel();
  const [diagnosticResult, setDiagnosticResult] = useState(null);
  const [personId, setPersonId] = useState('');

  const handleShowContacts = async () => {
    if (appModel) {
      await showContacts(appModel);
    } else {
      console.error('AppModel not available for debugging');
    }
  };

  // ESP32 debugging handlers
  const handleQuickESP32Test = async () => {
    console.log('[DebugTools] Running quick ESP32 test...');
    await quickESP32Test();
  };

  const handleSafeNetworkScan = async () => {
    console.log('[DebugTools] Running safe ESP32 network scan...');
    await safeESP32NetworkScan();
  };

  const handleFullESP32Diagnostics = async () => {
    console.log('[DebugTools] Running comprehensive ESP32 diagnostics...');
    await testESP32Discovery();
  };

  // NEW: UDP Reception Test
  const handleUDPReceptionTest = async () => {
    console.log('[DebugTools] Testing UDP data reception (the fix)...');
    try {
      const result = await ESP32DebugHelper.quickUDPReceptionTest();
      console.log('UDP Reception Test Results:\n' + result);
    } catch (error) {
      console.error('UDP Reception Test failed:', error);
    }
  };

  // NEW: ESP32 Discovery Reception Test
  const handleESP32DiscoveryReceptionTest = async () => {
    console.log('[DebugTools] Testing ESP32 discovery response reception...');
    try {
      const result = await ESP32DebugHelper.testESP32DiscoveryReception();
      console.log('ESP32 Discovery Reception Test Results:\n' + result);
    } catch (error) {
      console.error('ESP32 Discovery Reception Test failed:', error);
    }
  };

  const handleDiagnoseContact = async () => {
    if (appModel && appModel.leuteModel) {
      try {
        // For diagnostic purposes, either:
        // 1. Use the last created Person ID from logs (if available)
        // 2. Check the first contact in the list
        let targetId = personId;
        
        if (!targetId) {
          // Try to get all contacts
          let contacts = [];
          const leuteModel = appModel.leuteModel;
          
          if (typeof leuteModel.getContacts === 'function') {
            contacts = await leuteModel.getContacts();
          } else if (typeof leuteModel.others === 'function') {
            const others = await leuteModel.others();
            contacts = others.map(someone => someone.personId);
          } else if (leuteModel.contacts && Array.isArray(leuteModel.contacts)) {
            contacts = leuteModel.contacts;
          } else if (leuteModel._contacts && Array.isArray(leuteModel._contacts)) {
            contacts = leuteModel._contacts;
          }
          
          // Take the first contact if available
          if (contacts && contacts.length > 0) {
            targetId = contacts[0];
            console.log(`[DEBUG] Using first contact ID for diagnosis: ${targetId}`);
          } else {
            // Fallback to a hardcoded value from the logs
            targetId = 'f34bc332935cdffc932413f147fb64ff0deeca576597bfc499a1620796165441';
            console.log(`[DEBUG] Using hardcoded contact ID for diagnosis: ${targetId}`);
          }
        }
        
        setPersonId(targetId);
        
        // Run the diagnostic
        console.log(`[DEBUG] Running contact diagnosis for Person ID: ${targetId}`);
        const result = await diagnoseContactCreation(appModel.leuteModel, targetId);
        console.log('[DEBUG] Contact diagnosis result:', result);
        
        // Set the result for display
        setDiagnosticResult(result);
      } catch (error) {
        console.error('Error during contact diagnosis:', error);
        setDiagnosticResult({
          personExists: false,
          someoneExists: false,
          inContactsList: false,
          profileExists: false,
          diagnostics: [`Error: ${error.message || 'Unknown error'}`]
        });
      }
    } else {
      console.error('AppModel or LeuteModel not available for debugging');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Debug Tools</Text>
      <View style={styles.buttonContainer}>
        <Button 
          title="Show Contacts in Logs" 
          onPress={handleShowContacts} 
          color="#841584"
        />
      </View>
      
      <View style={styles.buttonContainer}>
        <Button 
          title="Diagnose Contact Relationships" 
          onPress={handleDiagnoseContact} 
          color="#008080"
        />
      </View>
      
      {/* ESP32 Debugging Section */}
      <Text style={styles.sectionTitle}>ESP32 Discovery Debugging</Text>
      
      <View style={styles.buttonContainer}>
        <Button 
          title="⚡ Quick Network Test" 
          onPress={handleQuickESP32Test} 
          color="#007AFF"
        />
      </View>
      
      <View style={styles.buttonContainer}>
        <Button 
          title="🔍 Safe Network Scan" 
          onPress={handleSafeNetworkScan} 
          color="#34C759"
        />
      </View>
      
      <View style={styles.buttonContainer}>
        <Button 
          title="🔬 Full ESP32 Diagnostics" 
          onPress={handleFullESP32Diagnostics} 
          color="#FF9500"
        />
      </View>
      
      <View style={styles.buttonContainer}>
        <Button 
          title="�� UDP Reception Test" 
          onPress={handleUDPReceptionTest} 
          color="#FF9500"
        />
      </View>
      
      <View style={styles.buttonContainer}>
        <Button 
          title="🔍 ESP32 Discovery Reception Test" 
          onPress={handleESP32DiscoveryReceptionTest} 
          color="#FF9500"
        />
      </View>
      
      <Text style={styles.debugHint}>
        ESP32 (192.168.178.57) is sending responses but mobile may not be receiving them.
        Check console output for detailed debugging information.
      </Text>
      
      {diagnosticResult && (
        <ScrollView style={styles.diagnosticResult}>
          <Text style={styles.sectionTitle}>Contact Diagnosis Result:</Text>
          <Text>Person exists: {diagnosticResult.personExists ? 'Yes' : 'No'}</Text>
          <Text>Someone exists: {diagnosticResult.someoneExists ? 'Yes' : 'No'}</Text>
          <Text>In contacts list: {diagnosticResult.inContactsList ? 'Yes' : 'No'}</Text>
          <Text>Profile exists: {diagnosticResult.profileExists ? 'Yes' : 'No'}</Text>
          
          <Text style={styles.sectionTitle}>Diagnostic Log:</Text>
          {diagnosticResult.diagnostics.map((message, index) => (
            <Text key={index} style={styles.logMessage}>{message}</Text>
          ))}
        </ScrollView>
      )}
      
      {/* Custom ConnectionsModel Architecture Tests */}
      <Text style={styles.sectionTitle}>Custom ConnectionsModel Architecture</Text>
      <ConnectionsModelTestComponent />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  buttonContainer: {
    marginVertical: 8,
  },
  diagnosticResult: {
    marginTop: 16,
    maxHeight: 300,
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 4,
  },
  logMessage: {
    fontFamily: 'monospace',
    fontSize: 12,
    marginBottom: 2,
  },
  debugHint: {
    fontSize: 12,
    marginTop: 8,
    marginBottom: 8,
    color: '#666',
  }
}); 