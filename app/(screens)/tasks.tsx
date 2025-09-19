import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Surface } from 'react-native-paper';
import { useInstance } from '@src/providers/app';
import { useTheme } from '@src/providers/app/AppTheme';
import { useTranslation } from 'react-i18next';

export default function TasksPage() {
  const { instance, authState, isAuthenticated } = useInstance();
  const { theme } = useTheme();
  const { t } = useTranslation();
  
  console.log('[TasksPage] Instance state:', { instance: !!instance, authState, isAuthenticated });

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Surface style={[styles.section, { backgroundColor: theme.colors.surfaceVariant }]}>
        <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurfaceVariant }]}>
          Tasks
        </Text>
        <Text style={{ 
          textAlign: 'center',
          color: theme.colors.onSurfaceVariant,
          padding: 16
        }}>
          Your tasks will appear here
        </Text>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionTitle: {
    padding: 16,
    paddingBottom: 8,
  },
}); 