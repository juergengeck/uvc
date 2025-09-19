import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Button } from 'react-native';
import * as llamaDiagnostics from '../utils/llamaDiagnostics';
import * as LlamaJS from '../utils/llama';

/**
 * Diagnostics component for the llama.rn module
 * Shows detailed information about module loading and availability
 */
const LlamaDiagnostics: React.FC = () => {
  const [diagnosticReport, setDiagnosticReport] = useState<any>(null);
  const [moduleInfo, setModuleInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Run diagnostics on mount
  useEffect(() => {
    runDiagnostics();
  }, []);

  // Run full diagnostics
  const runDiagnostics = async () => {
    setLoading(true);
    try {
      const report = await llamaDiagnostics.runDiagnostics();
      setDiagnosticReport(report);
      
      // Get detailed module info
      const info = LlamaJS.getLlamaModuleInfo();
      setModuleInfo(info);
    } catch (error) {
      console.error('Error running diagnostics:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>llama.rn Diagnostics</Text>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Module Status</Text>
        <Text style={styles.statusText}>
          {LlamaJS.isAvailable() 
            ? '✅ Module is available'
            : '❌ Module is NOT available'}
        </Text>
        <Text style={styles.statusText}>
          {LlamaJS.isPlatformSupported() 
            ? '✅ Platform is supported'
            : '❌ Platform is NOT supported'}
        </Text>
        <Text style={styles.statusText}>
          Version: {LlamaJS.getVersion()}
      </Text>
      </View>
      
      {moduleInfo && (
          <View style={styles.section}>
          <Text style={styles.sectionTitle}>Module Linkage Details</Text>
          
          <Text style={styles.subheader}>JavaScript Module</Text>
          <Text style={styles.statusText}>
            Imported: {moduleInfo.jsModule.imported ? '✅ Yes' : '❌ No'}
          </Text>
          <Text style={styles.statusText}>
            Module Type: {moduleInfo.jsModule.moduleType}
          </Text>
          <Text style={styles.statusText}>
            initLlama Type: {moduleInfo.jsModule.initLlamaType}
          </Text>
          <Text style={styles.statusText}>
            Available Methods: {moduleInfo.jsModule.keys.join(', ')}
          </Text>
          
          <Text style={styles.subheader}>Native Module</Text>
          <Text style={styles.statusText}>
            Native Llama Module: {moduleInfo.nativeModule.hasLlamaModule ? '✅ Found' : '❌ Not Found'}
          </Text>
          {moduleInfo.nativeModule.hasLlamaModule && (
            <Text style={styles.statusText}>
              Available Native Methods: {moduleInfo.nativeModule.llamaModuleKeys.join(', ')}
              </Text>
          )}
          
          {moduleInfo.error && (
            <>
              <Text style={styles.subheader}>Import Error</Text>
              <Text style={styles.errorText}>{moduleInfo.error.message}</Text>
            </>
          )}
          </View>
      )}
          
      {diagnosticReport && (
            <View style={styles.section}>
          <Text style={styles.sectionTitle}>Environment</Text>
          <Text style={styles.statusText}>OS: {diagnosticReport.platform}</Text>
          <Text style={styles.statusText}>Version: {diagnosticReport.version}</Text>
          <Text style={styles.statusText}>
            Simulator: {diagnosticReport.isSimulator ? 'Yes' : 'No'}
          </Text>
          
          <Text style={styles.subheader}>Storage</Text>
          <Text style={styles.statusText}>
            Model Directory: {diagnosticReport.modelDirectory || 'Not available'}
          </Text>
          <Text style={styles.statusText}>
            Can Create Models Dir: {diagnosticReport.canCreateModelsDir ? 'Yes' : 'No'}
          </Text>
          {diagnosticReport.modelDirectoryError && (
            <Text style={styles.errorText}>{diagnosticReport.modelDirectoryError}</Text>
            )}

          <Text style={styles.subheader}>Native Modules</Text>
          <Text style={styles.statusText}>
            Available: {diagnosticReport.nativeModules.join(', ')}
          </Text>
        </View>
      )}
      
      <Button 
        title={loading ? "Running diagnostics..." : "Refresh Diagnostics"} 
        onPress={runDiagnostics}
        disabled={loading}
      />
      
      <View style={styles.spacer} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  section: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  subheader: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 14,
    marginBottom: 6,
  },
  errorText: {
    fontSize: 14,
    color: 'red',
    marginBottom: 8,
  },
  spacer: {
    height: 60,
  }
});

export default LlamaDiagnostics; 