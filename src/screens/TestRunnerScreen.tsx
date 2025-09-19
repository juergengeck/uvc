import React, { useState, useCallback } from 'react';
import {
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  SectionList
} from 'react-native';
import { useTheme } from '@src/providers/app/AppTheme';
import { getTestSuites } from '@src/tests/TestRegistry';
import '@src/tests'; // This will import and register all test suites

interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  error?: string;
  duration?: number;
  category: string;
}

export function TestRunnerScreen() {
  const { theme, styles: themedStyles } = useTheme();
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const runTest = async (
    testCase: { name: string; category: string; run: () => Promise<void> }
  ): Promise<TestResult> => {
    const startTime = Date.now();
    try {
      await testCase.run();
      return {
        name: testCase.name,
        status: 'passed',
        duration: Date.now() - startTime,
        category: testCase.category
      };
    } catch (error: any) {
      return {
        name: testCase.name,
        status: 'failed',
        error: error.message || String(error),
        duration: Date.now() - startTime,
        category: testCase.category
      };
    }
  };

  const runAllTests = useCallback(async () => {
    setIsRunning(true);
    setTestResults([]);

    const testSuites = getTestSuites();
    const allTestCases = testSuites.flatMap(suite => suite.getTestCases());
    const results: TestResult[] = [];

    // Show tests as running
    setTestResults(allTestCases.map(tc => ({
      name: tc.name,
      status: 'pending' as const,
      category: tc.category
    })));

    // Run tests one by one and update results
    for (let i = 0; i < allTestCases.length; i++) {
      const testCase = allTestCases[i];

      // Mark as running
      setTestResults(prev => {
        const updated = [...prev];
        updated[i] = { ...updated[i], status: 'running' as const };
        return updated;
      });

      // Run the test
      const result = await runTest(testCase);
      results.push(result);

      // Update with result
      setTestResults(prev => {
        const updated = [...prev];
        updated[i] = result;
        return updated;
      });

      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    setIsRunning(false);
  }, []);

  const getStatusColor = (status: TestResult['status']) => {
    switch (status) {
      case 'passed': return '#4CAF50';
      case 'failed': return '#F44336';
      case 'running': return '#2196F3';
      default: return '#9E9E9E';
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'passed': return '✓';
      case 'failed': return '✗';
      case 'running': return '⟳';
      default: return '○';
    }
  };

  const passedCount = testResults.filter(r => r.status === 'passed').length;
  const failedCount = testResults.filter(r => r.status === 'failed').length;

  // Group results by category
  const groupedResults = testResults.reduce((acc, result) => {
    if (!acc[result.category]) {
      acc[result.category] = [];
    }
    acc[result.category].push(result);
    return acc;
  }, {} as Record<string, TestResult[]>);

  const sections = Object.entries(groupedResults).map(([category, tests]) => ({
    title: category.charAt(0).toUpperCase() + category.slice(1),
    data: tests
  }));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: theme.colors.onBackground }]}>
          In-App Test Runner
        </Text>

        <TouchableOpacity
          style={[
            styles.runButton,
            { backgroundColor: theme.colors.primary },
            isRunning && styles.runButtonDisabled
          ]}
          onPress={runAllTests}
          disabled={isRunning}
        >
          {isRunning ? (
            <ActivityIndicator color={theme.colors.onPrimary} />
          ) : (
            <Text style={[styles.runButtonText, { color: theme.colors.onPrimary }]}>
              Run All Tests
            </Text>
          )}
        </TouchableOpacity>

        {testResults.length > 0 && (
          <>
            <View style={styles.summary}>
              <Text style={[styles.summaryText, { color: theme.colors.onBackground }]}>
                Total: {testResults.length} | Passed: {passedCount} | Failed: {failedCount}
              </Text>
            </View>

            {sections.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.colors.onBackground }]}>
                  {section.title} Tests
                </Text>
                {section.data.map((result, index) => (
                  <View
                    key={`${section.title}-${index}`}
                    style={[
                      styles.resultItem,
                      { backgroundColor: theme.colors.surface }
                    ]}
                  >
                    <View style={styles.resultHeader}>
                      <Text
                        style={[
                          styles.statusIcon,
                          { color: getStatusColor(result.status) }
                        ]}
                      >
                        {getStatusIcon(result.status)}
                      </Text>
                      <Text style={[styles.testName, { color: theme.colors.onSurface }]}>
                        {result.name}
                      </Text>
                      {result.duration !== undefined && (
                        <Text style={[styles.duration, { color: theme.colors.onSurfaceVariant }]}>
                          {result.duration}ms
                        </Text>
                      )}
                    </View>
                    {result.error && (
                      <Text style={[styles.errorText, { color: theme.colors.error }]}>
                        {result.error}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  runButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  runButtonDisabled: {
    opacity: 0.7,
  },
  runButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  summary: {
    marginBottom: 16,
    alignItems: 'center',
  },
  summaryText: {
    fontSize: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    marginTop: 10,
  },
  results: {
    gap: 8,
  },
  resultItem: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    fontSize: 18,
    marginRight: 8,
    fontWeight: 'bold',
  },
  testName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  duration: {
    fontSize: 12,
  },
  errorText: {
    fontSize: 12,
    marginTop: 4,
    marginLeft: 26,
  },
});

export default TestRunnerScreen;