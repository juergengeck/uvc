/**
 * BackupSection Component
 * 
 * Handles import/export of settings
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@src/providers/app/AppTheme';

export interface BackupSectionProps {
  onExport: () => Promise<string>;
  onImport: (settings: any) => Promise<void>;
  disabled?: boolean;
}

export function BackupSection({ 
  onExport,
  onImport,
  disabled
}: BackupSectionProps) {
  const { t } = useTranslation('settings');
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <Button 
        mode="contained"
        onPress={onExport}
        disabled={disabled}
        style={styles.button}
        icon="download"
      >
        {t('dataManagement.export.title')}
      </Button>

      <Button 
        mode="outlined"
        onPress={() => onImport({})}
        disabled={disabled}
        style={styles.button}
        icon="upload"
      >
        {t('dataManagement.import.title')}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  button: {
    marginVertical: 8,
  },
}); 