import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { AnimatedProgressPie } from '@src/components/common/AnimatedProgressPie';
import { useProgressValue } from '@src/providers/ProgressContext';

interface ThinkingIndicatorProps {
  isVisible: boolean;
}

/**
 * Thinking indicator with progress that subscribes to progress context
 * This component re-renders independently from the message list
 */
export const ThinkingIndicator = React.memo(({ isVisible }: ThinkingIndicatorProps) => {
  const theme = useTheme();
  const progress = useProgressValue();
  
  if (!isVisible) {
    return null;
  }
  
  return (
    <View style={styles.container}>
      <View style={[styles.bubble, { backgroundColor: theme.colors.primaryContainer }]}>
        <Text style={[styles.text, { color: theme.colors.onPrimaryContainer }]}>
          AI is thinking{progress > 0 && progress < 100 ? ` (${Math.round(progress)}%)` : ''}
        </Text>
        <AnimatedProgressPie
          size={20}
          strokeWidth={2.5}
          progress={progress}
          color={theme.colors.primary}
          backgroundColor={theme.colors.onPrimaryContainer}
          showPulse={progress === 0}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'flex-start',
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 8,
  },
  text: {
    fontSize: 14,
  },
});