import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useTheme as useAppTheme } from '@src/providers/app/AppTheme';

interface ActionButtonProps {
  title: string;
  onPress: () => void;
  style?: any;
}

/**
 * Standardized action button component used throughout the app
 * Provides consistent Apple-style button styling
 */
export function ActionButton({ title, onPress, style }: ActionButtonProps) {
  const { styles: themedStyles } = useAppTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[themedStyles.actionButton, style]}
    >
      <Text style={themedStyles.actionButtonText}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Additional custom styles can be added here if needed
}); 