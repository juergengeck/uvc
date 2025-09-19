import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';

interface LoadingSpinnerProps {
  /**
   * Main message to display
   */
  message: string;
  
  /**
   * Optional secondary message/subtitle
   */
  subtitle?: string;
  
  /**
   * Size of the spinner
   * @default 'large'
   */
  size?: 'small' | 'large';
  
  /**
   * Whether to show the spinner in a fullscreen overlay
   * @default false
   */
  fullscreen?: boolean;
}

/**
 * A reusable loading spinner component with text
 */
export function LoadingSpinner({
  message,
  subtitle,
  size = 'large',
  fullscreen = false,
}: LoadingSpinnerProps) {
  const theme = useTheme();
  
  return (
    <View style={[
      styles.container,
      fullscreen && styles.fullscreen,
      { backgroundColor: fullscreen ? theme.colors.backdrop : 'transparent' }
    ]}>
      <View style={[
        styles.content,
        { backgroundColor: fullscreen ? theme.colors.surface : 'transparent' }
      ]}>
        <ActivityIndicator
          size={size}
          color={theme.colors.primary}
          style={styles.spinner}
        />
        <Text style={[styles.message, { color: theme.colors.onSurface }]}>
          {message}
        </Text>
        {subtitle && (
          <Text style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
            {subtitle}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullscreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  content: {
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    marginBottom: 16,
  },
  message: {
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.7,
  },
}); 