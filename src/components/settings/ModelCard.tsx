import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Surface, Text, Button, ActivityIndicator } from 'react-native-paper';
import { useTheme } from '@src/providers/app/AppTheme';
import { useTranslation } from 'react-i18next';

interface ModelInfo {
  hash?: string;
  name: string;
  description: string;
  size?: number;
}

interface ModelCardProps {
  model: ModelInfo;
  onDownload?: (model: ModelInfo) => Promise<void>;
  onDelete?: (hash: string) => Promise<void>;
  downloading?: boolean;
}

export function ModelCard({ model, onDownload, onDelete, downloading }: ModelCardProps) {
  const { theme } = useTheme();
  const { t } = useTranslation('settings');

  return (
    <Surface style={[styles.container, { backgroundColor: theme.colors.surfaceVariant }]} elevation={1}>
      <View style={styles.content}>
        <Text variant="titleMedium" style={[styles.title, { color: theme.colors.onSurfaceVariant }]}>
          {model.name}
        </Text>
        <Text variant="bodyMedium" style={[styles.description, { color: theme.colors.onSurfaceVariant }]}>
          {model.description}
        </Text>
        {model.hash && (
          <Text variant="bodySmall" style={[styles.hash, { color: theme.colors.onSurfaceVariant }]}>
            {t('ai.models.hash')}: {model.hash.substring(0, 8)}...
          </Text>
        )}
        {model.size && (
          <Text variant="bodySmall" style={[styles.size, { color: theme.colors.onSurfaceVariant }]}>
            {t('ai.models.size')}: {(model.size / (1024 * 1024)).toFixed(1)} MB
          </Text>
        )}
      </View>
      <View style={styles.actions}>
        {onDownload && (
          <Button
            mode="contained"
            onPress={() => onDownload(model)}
            disabled={downloading}
            loading={downloading}
            icon="download"
          >
            {t('ai.models.download.button')}
          </Button>
        )}
        {onDelete && model.hash && (
          <Button
            mode="outlined"
            onPress={() => onDelete(model.hash!)}
            icon="delete"
            textColor={theme.colors.error}
            style={{ borderColor: theme.colors.error }}
          >
            {t('ai.models.delete')}
          </Button>
        )}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  content: {
    marginBottom: 16,
  },
  title: {
    marginBottom: 8,
  },
  description: {
    marginBottom: 8,
  },
  hash: {
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
    }),
    fontSize: 12,
    marginBottom: 4,
  },
  size: {
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
}); 