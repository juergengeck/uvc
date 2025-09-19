import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Checkbox, Text } from 'react-native-paper';

interface ConsentProps {
  checked: boolean;
  label: React.ReactNode;
  onChange: (checked: boolean) => void;
}

/**
 * A component for handling consent checkboxes.
 * Follows one.baypass pattern for consent handling.
 */
export default function Consent({ checked, label, onChange }: ConsentProps) {
  return (
    <View style={styles.container}>
      <Checkbox.Android
        status={checked ? 'checked' : 'unchecked'}
        onPress={() => onChange(!checked)}
      />
      <View style={styles.labelContainer}>
        {typeof label === 'string' ? (
          <Text style={styles.label}>{label}</Text>
        ) : (
          label
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 8,
  },
  labelContainer: {
    flex: 1,
    marginLeft: 8,
  },
  label: {
    fontSize: 16,
  },
}); 