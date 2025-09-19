/**
 * QUIC Test Screen
 * 
 * This screen hosts the QuicModelTest component which allows developers
 * to test and debug QUIC and UDP socket functionality directly from the app.
 */

import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '@src/providers/app/AppTheme';
import { SafeAreaView } from 'react-native-safe-area-context';
import QuicModelTest from '@src/components/QuicModelTest';

/**
 * Screen that provides access to the QuicModel test utilities
 */
export default function QuicTestScreen() {
  const { theme } = useTheme();
  
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <QuicModelTest />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
}); 