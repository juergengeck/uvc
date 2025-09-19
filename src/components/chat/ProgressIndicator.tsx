import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme, IconButton } from 'react-native-paper';
import { AnimatedProgressPie } from '@src/components/common/AnimatedProgressPie';
import { useProgressValue } from '@src/providers/ProgressContext';

interface ProgressIndicatorProps {
  isGenerating?: boolean;
  onStop?: () => void;
}

/**
 * Isolated progress indicator component that subscribes to progress updates
 * This component will re-render on progress changes without affecting parent components
 */
export const ProgressIndicator = React.memo(({ isGenerating, onStop }: ProgressIndicatorProps) => {
  const theme = useTheme();
  const progress = useProgressValue();
  
  if (!isGenerating || progress <= 0) {
    return null;
  }
  
  return (
    <View style={styles.container}>
      <TouchableOpacity 
        onPress={onStop}
        style={[styles.stopButton, { backgroundColor: theme.colors.surface }]}
        activeOpacity={0.7}
      >
        <AnimatedProgressPie
          size={40}
          strokeWidth={3}
          progress={progress}
          color={theme.colors.primary}
          showPulse={progress === 0}
        />
        <View style={[styles.stopIconContainer, { backgroundColor: theme.colors.error }]}>
          <View style={styles.stopSquare} />
        </View>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 16,
    bottom: 80,
    zIndex: 1000,
  },
  stopButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  stopIconContainer: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: {
    width: 10,
    height: 10,
    backgroundColor: 'white',
  },
});