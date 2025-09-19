import React, { useCallback } from 'react';
import { View } from 'react-native';
import { List, Switch, TextInput, HelperText, ActivityIndicator } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@src/providers/app/AppTheme';
import type { 
  AIProviderConfig, 
  LocalAISettings, 
  CloudAISettings,
  LocalAIProviderConfig,
  CloudAIProviderConfig
} from './types/llm';

interface AIProviderSettingsProps {
  config: AIProviderConfig;
  onUpdate: (update: Partial<AIProviderConfig>) => Promise<void>;
  loading?: boolean;
  error?: string;
}

export function AIProviderSettings({ 
  config, 
  onUpdate,
  loading = false,
  error
}: AIProviderSettingsProps) {
  const { t } = useTranslation('settings');
  const { theme, styles: baseStyles } = useTheme();

  const styles = React.useMemo(() => ({
    ...baseStyles,
    numberInput: {
      width: 80,
      textAlign: 'right' as const,
      backgroundColor: theme?.colors.background
    },
    loadingIndicator: {
      marginLeft: 8
    }
  }), [baseStyles, theme]);

  const handleUpdate = useCallback(async (update: Partial<AIProviderConfig>) => {
    console.log('[AIProviderSettings] Handling update:', { providerId: config.id, update });
    await onUpdate(update);
  }, [config.id, onUpdate]);

  if (!theme) {
    return null;
  }

  // Local AI Settings
  if (config.id === 'local') {
    const localConfig = config as LocalAIProviderConfig;
    const settings = localConfig.settings;
    console.log('[AIProviderSettings] Rendering Local AI settings:', { enabled: config.enabled, settings });
    
    const hasModelConfigured = settings.modelPath && settings.modelPath.length > 0;
    const switchDisabled = loading || (config.enabled === false && !hasModelConfigured);
    
    return (
      <>
        {error && (
          <HelperText type="error" style={styles.error}>
            {error}
          </HelperText>
        )}
        <List.Item
          title={t('settings.ai.providers.local.title')}
          description={error || (!hasModelConfigured ? t('settings.ai.providers.local.noModel') : t('settings.ai.providers.local.description'))}
          style={styles.settingsItem}
          right={() => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Switch
                value={config.enabled}
                onValueChange={enabled => {
                  console.log('[AIProviderSettings] Switch toggled:', { enabled });
                  handleUpdate({ enabled });
                }}
                disabled={switchDisabled}
                color={theme.colors.primary}
              />
              {loading && (
                <ActivityIndicator 
                  size="small" 
                  color={theme.colors.primary} 
                  style={styles.loadingIndicator}
                />
              )}
            </View>
          )}
        />
        
        {hasModelConfigured && (
          <List.Item
            title={t('settings.ai.providers.local.model')}
            description={settings.modelName || settings.modelPath}
            style={styles.settingsItem}
          />
        )}
        
        {config.enabled && (
          <>
            <List.Item
              title={t('settings.ai.providers.local.threads')}
              description={t('settings.ai.providers.local.threadsDescription')}
              style={styles.settingsItem}
              right={() => (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TextInput
                    value={settings.threads.toString()}
                    onChangeText={value => {
                      const threads = parseInt(value, 10);
                      if (!isNaN(threads) && threads > 0) {
                        const updatedConfig: Partial<LocalAIProviderConfig> = {
                          settings: {
                            ...settings,
                            threads
                          }
                        };
                        handleUpdate(updatedConfig);
                      }
                    }}
                    keyboardType="numeric"
                    style={styles.numberInput}
                    disabled={loading}
                  />
                  {loading && (
                    <ActivityIndicator 
                      size="small" 
                      color={theme.colors.primary} 
                      style={styles.loadingIndicator}
                    />
                  )}
                </View>
              )}
            />
            
            <List.Item
              title={t('settings.ai.providers.local.temperature')}
              description={t('settings.ai.providers.local.temperatureDescription')}
              style={styles.settingsItem}
              right={() => (
                <TextInput
                  value={settings.temperature.toString()}
                  onChangeText={value => {
                    const temperature = parseFloat(value);
                    if (!isNaN(temperature) && temperature >= 0 && temperature <= 1) {
                      const updatedConfig: Partial<LocalAIProviderConfig> = {
                        settings: {
                          ...settings,
                          temperature
                        }
                      };
                      handleUpdate(updatedConfig);
                    }
                  }}
                  keyboardType="numeric"
                  style={styles.numberInput}
                  disabled={loading}
                />
              )}
            />
          </>
        )}
      </>
    );
  }

  // Cloud AI Settings
  if (config.id === 'cloud') {
    const cloudConfig = config as CloudAIProviderConfig;
    const settings = cloudConfig.settings;
    
    return (
      <>
        {error && (
          <HelperText type="error" style={styles.error}>
            {error}
          </HelperText>
        )}
        <List.Item
          title={t('settings.ai.providers.cloud.title')}
          description={t('settings.ai.providers.cloud.description')}
          style={styles.settingsItem}
          right={() => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Switch
                value={config.enabled}
                onValueChange={enabled => handleUpdate({ enabled })}
                disabled={loading}
                color={theme.colors.primary}
              />
              {loading && (
                <ActivityIndicator 
                  size="small" 
                  color={theme.colors.primary} 
                  style={styles.loadingIndicator}
                />
              )}
            </View>
          )}
        />

        {config.enabled && (
          <>
            <List.Item
              title={t('settings.ai.providers.cloud.apiKey.title')}
              description={t('settings.ai.providers.cloud.apiKey.description')}
              style={styles.settingsItem}
              right={() => (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TextInput
                    mode="outlined"
                    value={settings.apiKey}
                    onChangeText={text => {
                      const updatedConfig: Partial<CloudAIProviderConfig> = {
                        settings: {
                          ...settings,
                          apiKey: text
                        }
                      };
                      handleUpdate(updatedConfig);
                    }}
                    style={{ width: 200 }}
                    secureTextEntry
                    disabled={loading}
                  />
                  {loading && (
                    <ActivityIndicator 
                      size="small" 
                      color={theme.colors.primary} 
                      style={styles.loadingIndicator}
                    />
                  )}
                </View>
              )}
            />
            <List.Item
              title={t('settings.ai.providers.cloud.maxTokens.title')}
              description={t('settings.ai.providers.cloud.maxTokens.description')}
              style={styles.settingsItem}
              right={() => (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TextInput
                    mode="outlined"
                    value={String(settings.maxTokens)}
                    onChangeText={text => {
                      const maxTokens = parseInt(text, 10);
                      if (!isNaN(maxTokens)) {
                        const updatedConfig: Partial<CloudAIProviderConfig> = {
                          settings: {
                            ...settings,
                            maxTokens
                          }
                        };
                        handleUpdate(updatedConfig);
                      }
                    }}
                    keyboardType="number-pad"
                    style={{ width: 80 }}
                    disabled={loading}
                  />
                  {loading && (
                    <ActivityIndicator 
                      size="small" 
                      color={theme.colors.primary} 
                      style={styles.loadingIndicator}
                    />
                  )}
                </View>
              )}
            />
          </>
        )}
      </>
    );
  }

  return null;
} 