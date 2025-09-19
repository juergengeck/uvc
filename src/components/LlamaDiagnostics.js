import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Button } from 'react-native';
import { runDiagnostics } from '../utils/llamaDiagnostics';
import * as LlamaJS from '../utils/llama';

export default function LlamaDiagnostics() {
  const [results, setResults] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  
  useEffect(() => {
    // Run diagnostics on component mount
    const diagnose = async () => {
      console.log('[LlamaDiagnostics] Running diagnostics...');
      try {
        const diagnosticResults = await runDiagnostics();
        setResults(diagnosticResults);
      } catch (error) {
        console.error('[LlamaDiagnostics] Error running diagnostics:', error);
      }
    };
    
    diagnose();
  }, []);
  
  // Try to directly use the Llama module
  const testModuleDirectly = async () => {
    console.log('[LlamaDiagnostics] Testing module directly...');
    
    try {
      // Check raw module
      console.log('[LlamaDiagnostics] Raw module:', LlamaJS._rawModule ? 'exists' : 'missing');
      
      // Check if isAvailable function works
      const isAvailable = LlamaJS.isAvailable;
      console.log('[LlamaDiagnostics] isAvailable:', isAvailable);
      
      // Try calling a simple function
      if (isAvailable) {
        try {
          await LlamaJS.toggleNativeLog(true);
          console.log('[LlamaDiagnostics] Successfully called toggleNativeLog');
          
          // Try to get dummy model info
          try {
            const info = await LlamaJS.modelInfo('/dummy/path');
            console.log('[LlamaDiagnostics] Model info call succeeded:', info);
          } catch (modelError) {
            console.log('[LlamaDiagnostics] Model info call failed:', modelError);
          }
        } catch (callError) {
          console.error('[LlamaDiagnostics] Error calling module function:', callError);
        }
      }
    } catch (error) {
      console.error('[LlamaDiagnostics] Error in direct module test:', error);
    }
  };
  
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Llama.rn Diagnostics</Text>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Module Status</Text>
        <Text>Module Available: {LlamaJS.isAvailable ? 'Yes' : 'No'}</Text>
        <Button title="Test Module Directly" onPress={testModuleDirectly} />
      </View>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Diagnostic Results</Text>
        {results ? (
          <>
            <Text>Platform: {results.platform?.os} {results.platform?.version}</Text>
            <Button 
              title={showDetails ? "Hide Details" : "Show Details"} 
              onPress={() => setShowDetails(!showDetails)} 
            />
            
            {showDetails && (
              <View style={styles.details}>
                <Text style={styles.codeText}>
                  {JSON.stringify(results, null, 2)}
                </Text>
              </View>
            )}
          </>
        ) : (
          <Text>Running diagnostics...</Text>
        )}
      </View>
    </ScrollView>
  );
}

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
  },
  section: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  details: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
}); 