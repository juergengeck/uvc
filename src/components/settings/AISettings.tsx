import React, { useState, useCallback, useRef } from 'react';
import { View, Share } from 'react-native';
import { List, Switch, TextInput, Portal, Dialog, ActivityIndicator, HelperText, IconButton, Divider, Text } from 'react-native-paper';
import type { AIProviderConfig, AISummaryConfig } from '../../types/ai';
import { AIProviderSettings } from './AIProviderSettings';
import { exportSettings, importSettings } from '../../utils/validation';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@src/providers/app/AppTheme';
import type { OneObjectTypeNames } from '@refinio/one.core/lib/recipes.js';

interface AISettingsProps {
  providerConfigs?: Record<string, AIProviderConfig>;
  summaryConfig?: AISummaryConfig;
  onUpdateProvider: (providerId: string, config: Partial<AIProviderConfig>) => Promise<void>;
  onUpdateSummary: (config: Partial<AISummaryConfig>) => Promise<void>;
  onImportSettings?: (settings: { 
    providerConfigs: Record<string, AIProviderConfig>;
    summaryConfig: AISummaryConfig;
  }) => Promise<void>;
  loading?: boolean;
  error?: string;
}

// Default configurations
const defaultProviderConfigs: Record<string, AIProviderConfig> = {
  local: {
    $type$: 'AIProviderConfig',
    id: 'local',
    model: 'llama2',
    capabilities: ['chat', 'code', 'summarize'],
    enabled: false,
    settings: {
      modelPath: '',
      modelName: '',
      architecture: '',
      threads: 4,
      batchSize: 512,
      temperature: 0.7,
      nGpuLayers: 0
    },
    lastUpdated: Date.now()
  },
  cloud: {
    $type$: 'AIProviderConfig',
    id: 'cloud',
    model: 'gpt-4',
    capabilities: ['chat', 'code', 'summarize'],
    enabled: false,
    settings: {
      endpoint: '',
      apiKey: '',
      maxTokens: 2048,
      temperature: 0.7
    },
    lastUpdated: Date.now()
  }
};

const defaultSummaryConfig: AISummaryConfig = {
  enabled: false,
  maxTokens: 100,
  temperature: 0.7,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0
};

export function AISettings({ 
  providerConfigs, 
  summaryConfig = defaultSummaryConfig, 
  onUpdateProvider, 
  onUpdateSummary,
  onImportSettings,
  loading: parentLoading = false,
  error: parentError
}: AISettingsProps) {
  const { t } = useTranslation('settings');
  const { theme, styles, isLoading: themeLoading } = useTheme();
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [localError, setLocalError] = useState<string>();
  const [importDialogVisible, setImportDialogVisible] = useState(false);
  const [importText, setImportText] = useState('');
  
  // Use a ref to track ongoing updates
  const pendingUpdates = useRef(new Set<string>());

  // Combine error states
  const error = parentError || localError;

  const handleUpdate = useCallback(async (
    action: () => Promise<void>,
    key: string
  ) => {
    if (pendingUpdates.current.has(key)) {
      console.log(`[AISettings] Update already in progress for ${key}`);
      return;
    }

    try {
      pendingUpdates.current.add(key);
      setLoadingStates(prev => ({ ...prev, [key]: true }));
      setLocalError(undefined);
      await action();
    } catch (err) {
      console.error(`[AISettings] Update failed for ${key}:`, err);
      setLocalError(err instanceof Error ? err.message : t('settings.ai.providers.error.updateFailed'));
    } finally {
      pendingUpdates.current.delete(key);
      setLoadingStates(prev => ({ ...prev, [key]: false }));
    }
  }, [t]);

  const handleUpdateProvider = useCallback(async (providerId: string, config: Partial<AIProviderConfig>) => {
    await handleUpdate(
      () => onUpdateProvider(providerId, config),
      `provider-${providerId}`
    );
  }, [handleUpdate, onUpdateProvider]);

  const handleUpdateSummary = useCallback(async (config: Partial<AISummaryConfig>) => {
    await handleUpdate(
      () => onUpdateSummary(config),
      'summary'
    );
  }, [handleUpdate, onUpdateSummary]);

  const handleExport = useCallback(async () => {
    await handleUpdate(async () => {
      if (!providerConfigs) {
        throw new Error(t('settings.dataManagement.export.noData'));
      }
      const json = exportSettings(providerConfigs, summaryConfig);
      await Share.share({
        message: json,
        title: t('settings.dataManagement.export.title')
      });
    }, 'export');
  }, [handleUpdate, providerConfigs, summaryConfig, t]);

  const handleImport = useCallback(async () => {
    if (!onImportSettings) return;

    await handleUpdate(async () => {
      const settings = importSettings(importText);
      await onImportSettings(settings);
      setImportDialogVisible(false);
      setImportText('');
    }, 'import');
  }, [handleUpdate, importText, onImportSettings]);

  if (!theme) {
    return null;
  }

  return (
    <>
      {error && (
        <HelperText type="error" style={styles.error}>
          {error}
        </HelperText>
      )}

      {/* AI Providers */}
      {providerConfigs?.local && (
        <View style={styles.settingsSection}>
          <AIProviderSettings
            config={providerConfigs.local}
            onUpdate={config => handleUpdateProvider('local', config)}
            loading={loadingStates['provider-local'] || false}
            error={error}
          />
        </View>
      )}

      {providerConfigs?.cloud && (
        <View style={styles.settingsSection}>
          <AIProviderSettings
            config={providerConfigs.cloud}
            onUpdate={config => handleUpdateProvider('cloud', config)}
            loading={loadingStates['provider-cloud'] || false}
            error={error}
          />
        </View>
      )}

      {/* Summary Settings */}
      {summaryConfig && (
        <>
          <Text variant="bodySmall" style={styles.settingsSectionTitle}>
            {t('settings.summarySettings.title')}
          </Text>
          <View style={styles.settingsSection}>
            <List.Item
              title={t('settings.summarySettings.title')}
              description={t('settings.summarySettings.description')}
              style={styles.settingsItem}
              right={() => (
                <Switch
                  value={summaryConfig.enabled}
                  onValueChange={enabled => handleUpdateSummary({ enabled })}
                  disabled={loadingStates['summary'] || false}
                  color={theme.colors.primary}
                />
              )}
            />
            {summaryConfig.enabled && (
              <>
                <Divider style={styles.settingsDivider} />
                <List.Item
                  title={t('settings.summarySettings.maxTokens.title')}
                  description={t('settings.summarySettings.maxTokens.description')}
                  style={styles.settingsItem}
                  right={() => (
                    <TextInput
                      mode="outlined"
                      value={String(summaryConfig.maxTokens)}
                      onChangeText={text => {
                        const maxTokens = parseInt(text, 10);
                        if (!isNaN(maxTokens)) {
                          handleUpdateSummary({ maxTokens });
                        }
                      }}
                      keyboardType="number-pad"
                      style={{ width: 80 }}
                      disabled={loadingStates['summary'] || false}
                    />
                  )}
                />
                <Divider style={styles.settingsDivider} />
                <List.Item
                  title={t('settings.summarySettings.temperature.title')}
                  description={t('settings.summarySettings.temperature.description')}
                  style={styles.settingsItem}
                  right={() => (
                    <TextInput
                      mode="outlined"
                      value={String(summaryConfig.temperature)}
                      onChangeText={text => {
                        const temperature = parseFloat(text);
                        if (!isNaN(temperature)) {
                          handleUpdateSummary({ temperature });
                        }
                      }}
                      keyboardType="decimal-pad"
                      style={{ width: 80 }}
                      disabled={loadingStates['summary'] || false}
                    />
                  )}
                />
              </>
            )}
          </View>
        </>
      )}

      {/* Data Management */}
      <Text variant="bodySmall" style={styles.settingsSectionTitle}>
        {t('settings.dataManagement.title')}
      </Text>
      <View style={styles.settingsSection}>
        <List.Item
          title={t('settings.dataManagement.export.title')}
          description={t('settings.dataManagement.export.description')}
          style={styles.settingsItem}
          right={() => (
            <IconButton
              icon="share"
              iconColor={theme.colors.primary}
              onPress={handleExport}
              disabled={loadingStates['export'] || false}
            />
          )}
        />
        {onImportSettings && (
          <>
            <Divider style={styles.settingsDivider} />
            <List.Item
              title={t('settings.dataManagement.import.title')}
              description={t('settings.dataManagement.import.description')}
              style={[styles.settingsItem, styles.settingsItemLast]}
              right={() => (
                <IconButton
                  icon="download"
                  iconColor={theme.colors.primary}
                  onPress={() => setImportDialogVisible(true)}
                  disabled={loadingStates['import'] || false}
                />
              )}
            />
          </>
        )}
      </View>

      {/* Import Dialog */}
      <Portal>
        <Dialog visible={importDialogVisible} onDismiss={() => setImportDialogVisible(false)}>
          <Dialog.Title>{t('settings.dataManagement.import.title')}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              value={importText}
              onChangeText={setImportText}
              multiline
              numberOfLines={4}
              placeholder={t('settings.dataManagement.import.placeholder')}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <IconButton
              icon="close"
              iconColor={theme.colors.error}
              onPress={() => setImportDialogVisible(false)}
            />
            <IconButton
              icon="check"
              iconColor={theme.colors.primary}
              onPress={handleImport}
              disabled={!importText.trim() || loadingStates['import'] || false}
            />
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
} 