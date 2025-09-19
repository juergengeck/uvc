/**
 * CommServer Protocol Test Component
 * 
 * This component provides a UI to run CommServer protocol tests from within the app.
 * It validates that our implementation follows one.models/one.leute patterns correctly.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import CommServerProtocolTest from '../../tests/CommServerProtocolTest';

interface TestResult {
  step: string;
  success: boolean;
  details: string;
  timestamp: Date;
}

interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  results: TestResult[];
}

export const CommServerProtocolTestComponent: React.FC = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<TestSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTests = async () => {
    setIsRunning(true);
    setError(null);
    setTestResults(null);

    try {
      console.log('[CommServerProtocolTestComponent] Starting tests...');
      
      const testSuite = new CommServerProtocolTest();
      const results = await testSuite.runFullTest();
      const summary = testSuite.getResultsSummary();
      
      setTestResults(summary);
      
      console.log('[CommServerProtocolTestComponent] Tests completed:', summary);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      console.error('[CommServerProtocolTestComponent] Test failed:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const renderTestResult = (result: TestResult, index: number) => {
    const statusIcon = result.success ? '✅' : '❌';
    const statusColor = result.success ? '#4CAF50' : '#F44336';
    
    return (
      <View key={index} style={styles.testResultItem}>
        <View style={styles.testResultHeader}>
          <Text style={[styles.testResultStatus, { color: statusColor }]}>
            {statusIcon}
          </Text>
          <Text style={styles.testResultTitle}>{result.step}</Text>
        </View>
        <Text style={styles.testResultDetails}>{result.details}</Text>
        <Text style={styles.testResultTime}>
          {result.timestamp.toLocaleTimeString()}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CommServer Protocol Test</Text>
      <Text style={styles.subtitle}>
        Validates identity consistency and key derivation patterns
      </Text>

      <TouchableOpacity
        style={[styles.runButton, isRunning && styles.runButtonDisabled]}
        onPress={runTests}
        disabled={isRunning}
      >
        <Text style={styles.runButtonText}>
          {isRunning ? 'Running Tests...' : 'Run Protocol Tests'}
        </Text>
      </TouchableOpacity>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>❌ Test Error</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {testResults && (
        <View style={styles.resultsContainer}>
          <View style={styles.summaryContainer}>
            <Text style={styles.summaryTitle}>📊 Test Summary</Text>
            <View style={styles.summaryStats}>
              <Text style={styles.summaryText}>Total: {testResults.total}</Text>
              <Text style={[styles.summaryText, { color: '#4CAF50' }]}>
                Passed: {testResults.passed}
              </Text>
              <Text style={[styles.summaryText, { color: '#F44336' }]}>
                Failed: {testResults.failed}
              </Text>
              <Text style={styles.summaryText}>
                Success: {((testResults.passed / testResults.total) * 100).toFixed(1)}%
              </Text>
            </View>
          </View>

          <ScrollView style={styles.resultsScroll}>
            <Text style={styles.resultsTitle}>📋 Detailed Results</Text>
            {testResults.results.map((result, index) => 
              renderTestResult(result, index)
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  runButton: {
    backgroundColor: '#2196F3',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  runButtonDisabled: {
    backgroundColor: '#ccc',
  },
  runButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#F44336',
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F44336',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#d32f2f',
  },
  resultsContainer: {
    flex: 1,
  },
  summaryContainer: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  summaryStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  summaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  resultsScroll: {
    flex: 1,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  testResultItem: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  testResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  testResultStatus: {
    fontSize: 18,
    marginRight: 8,
  },
  testResultTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  testResultDetails: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  testResultTime: {
    fontSize: 12,
    color: '#999',
  },
});

export default CommServerProtocolTestComponent; 