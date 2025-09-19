import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView } from 'react-native';
import UDPDiagnosticButton from '../../src/components/UDPDiagnosticButton';

/**
 * UDP Test Screen for direct UDP diagnostics
 */
export default function UdpTestScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>UDP Testing</Text>
        <Text style={styles.description}>
          This screen provides tools to test UDP functionality directly without going through QUIC transport.
          Follow the steps in sequence to test UDP broadcast functionality.
        </Text>
        
        <View style={styles.divider} />
        
        <UDPDiagnosticButton />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    color: '#555',
    marginBottom: 16,
    lineHeight: 22,
  },
  divider: {
    height: 1,
    backgroundColor: '#ddd',
    marginVertical: 16,
  },
}); 