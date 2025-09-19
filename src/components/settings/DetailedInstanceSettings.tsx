/**
 * DetailedInstanceSettings Component
 * 
 * Handles instance-level settings and actions
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { List } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

export interface DetailedInstanceSettingsProps {
  onLogout: () => void;
  onReset: () => void;
  disabled?: boolean;
}

export function DetailedInstanceSettings({ 
  onLogout,
  onReset,
  disabled
}: DetailedInstanceSettingsProps) {
  const { t } = useTranslation('settings');

  return (
    <View style={styles.container}>
      <List.Item
        title={t('logout')}
        onPress={onLogout}
        disabled={disabled}
        left={props => <List.Icon {...props} icon="logout" />}
      />
      <List.Item
        title={t('reset')}
        onPress={onReset}
        disabled={disabled}
        left={props => <List.Icon {...props} icon="refresh" />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
}); 