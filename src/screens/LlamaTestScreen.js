import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Button, ActivityIndicator } from 'react-native';
import * as LlamaJS from '../utils/llama';
import LlamaDiagnostics from '../components/LlamaDiagnostics';

/**
 * Screen for testing the llama.rn module
 */
const LlamaTestScreen = () => {
  const [moduleStatus, setModuleStatus] = useState('Checking...');
  const [moduleInfo, setModuleInfo] = useState(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkModuleStatus();
  }, []);

  const checkModuleStatus = async () => {
    setLoading(true);
    try {
      // Check if llama.rn is available
      const isAvailable = LlamaJS.isAvailable();
      setModuleStatus(isAvailable ? 'Available' : 'Not Available');
      
      // Get detailed module info
      const info = LlamaJS.getLlamaModuleInfo();
      setModuleInfo(info);
      
      console.log('[LlamaTestScreen] Module info:', info);
    } catch (error) {
      console.error('[LlamaTestScreen] Error checking module status:', error);
      setModuleStatus('Error: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.title}>Llama.rn Module Test</Text>
        </View>
        
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Module Status</Text>
          {loading ? (
            <ActivityIndicator size="small" />
          ) : (
            <>
              <Text style={styles.statusText}>
                Status: <Text style={moduleStatus === 'Available' ? styles.success : styles.error}>
                  {moduleStatus}
                </Text>
              </Text>
              <Text style={styles.statusText}>
                Platform supported: {LlamaJS.isPlatformSupported() ? 'Yes' : 'No'}
              </Text>
              <Text style={styles.statusText}>
                Version: {LlamaJS.getVersion()}
              </Text>
            </>
          )}
        </View>
        
        {moduleInfo && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Module Structure</Text>
            <Text style={styles.statusText}>
              Module imported: {moduleInfo.jsModule.imported ? 'Yes' : 'No'}
            </Text>
            <Text style={styles.statusText}>
              Module type: {moduleInfo.jsModule.moduleType}
            </Text>
            <Text style={styles.statusText}>
              initLlama type: {moduleInfo.jsModule.initLlamaType}
            </Text>
            <Text style={styles.statusText}>
              Available functions: {moduleInfo.jsModule.keys.join(', ')}
            </Text>
            <Text style={styles.sectionTitle}>Native Module</Text>
            <Text style={styles.statusText}>
              Native module found: {moduleInfo.nativeModule.hasLlamaModule ? 'Yes' : 'No'}
            </Text>
            {moduleInfo.error && (
              <Text style={styles.errorText}>
                Error: {moduleInfo.error.message}
              </Text>
            )}
          </View>
        )}
        
        <View style={styles.buttonContainer}>
          <Button 
            title="Refresh Status" 
            onPress={checkModuleStatus}
            disabled={loading}
          />
          <Button 
            title={showDiagnostics ? "Hide Diagnostics" : "Show Diagnostics"} 
            onPress={() => setShowDiagnostics(!showDiagnostics)} 
          />
        </View>
        
        {showDiagnostics && (
          <View style={styles.diagnosticsContainer}>
            <LlamaDiagnostics />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  header: {
    padding: 16,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginVertical: 16,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    marginTop: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    marginTop: 8,
  },
  statusText: {
    fontSize: 16,
    marginBottom: 8,
  },
  success: {
    color: 'green',
    fontWeight: 'bold',
  },
  error: {
    color: 'red',
    fontWeight: 'bold',
  },
  errorText: {
    color: 'red',
    fontSize: 14,
    marginTop: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 16,
  },
  diagnosticsContainer: {
    margin: 16,
    marginTop: 0,
  }
});

export default LlamaTestScreen; 