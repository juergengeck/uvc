import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

interface StageIndicatorProps {
  stage: number;
  max: number;
}

export default function StageIndicator({ stage, max }: StageIndicatorProps) {
  const theme = useTheme();
  const dots = Array.from({ length: max }, (_, i) => i + 1);

  const styles = StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 16,
    },
    dotContainer: {
      alignItems: 'center',
      marginHorizontal: 8,
    },
    dot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      marginBottom: 4,
    },
    inactiveDot: {
      backgroundColor: theme.colors.surfaceVariant,
    },
    activeDot: {
      backgroundColor: theme.colors.primary,
    },
    completedDot: {
      backgroundColor: theme.colors.primary,
    },
    stageText: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
    }
  });

  return (
    <View style={styles.container}>
      {dots.map((i) => (
        <View key={i} style={styles.dotContainer}>
          <View
            style={[
              styles.dot,
              i < stage ? styles.completedDot :
              i === stage ? styles.activeDot :
              styles.inactiveDot
            ]}
          />
          <Text style={styles.stageText}>{i}</Text>
        </View>
      ))}
    </View>
  );
} 