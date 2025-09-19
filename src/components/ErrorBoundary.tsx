/**
 * Error Boundary Component
 * 
 * Catches and handles React errors in the component tree.
 */

console.log('[ErrorBoundary] Starting to load ErrorBoundary.tsx');

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

console.log('[ErrorBoundary] Imports loaded');

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  text: {
    fontSize: 16,
    textAlign: 'center'
  }
});

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    console.log('[ErrorBoundary] Constructor called');
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    console.log('[ErrorBoundary] Error caught:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.log('[ErrorBoundary] componentDidCatch:', error, errorInfo);
  }

  render() {
    console.log('[ErrorBoundary] Rendering');
    if (this.state.hasError) {
      return (
        <SafeAreaProvider>
          <View style={styles.container}>
            <Text style={styles.text}>Something went wrong!</Text>
            <Text style={styles.text}>{this.state.error?.message}</Text>
          </View>
        </SafeAreaProvider>
      );
    }

    return this.props.children;
  }
} 