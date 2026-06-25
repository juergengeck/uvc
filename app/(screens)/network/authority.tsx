import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Button,
  Chip,
  List,
  Surface,
  Text,
  TextInput,
} from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@src/providers/app/AppTheme';
import { useHeadlessAuthority } from '@src/hooks/useHeadlessAuthority';
import type {
  HeadlessAuthorityDevice,
  HeadlessAuthorityStatus,
} from '@src/types/headlessAuthority';

function formatTimestamp(value?: string): string {
  if (!value) {
    return 'n/a';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatCapabilities(capabilities?: string[]): string {
  if (!Array.isArray(capabilities) || capabilities.length === 0) {
    return 'none';
  }

  return capabilities.join(', ');
}

function getTrustButtonLabel(device: HeadlessAuthorityDevice): string {
  const trustState = device.trustState ?? 'unknown';
  return trustState === 'trusted' ? 'Untrust' : 'Trust';
}

function flattenStatus(status?: HeadlessAuthorityStatus): Array<[string, string]> {
  if (!status) {
    return [];
  }

  return [
    ['Service', status.service ?? status.name ?? 'unknown'],
    ['Role', status.role ?? 'unknown'],
    ['Status', status.status ?? (status.healthy ? 'healthy' : 'unknown')],
    ['Owner', status.ownerId ?? status.personId ?? 'n/a'],
    ['Instance', status.instanceId ?? 'n/a'],
    ['Version', status.version ?? 'n/a'],
    ['Updated', formatTimestamp(status.updatedAt)],
    ['mDNS', status.mdns?.serviceName ?? status.mdns?.host ?? 'n/a'],
  ];
}

export default function NetworkAuthorityScreen() {
  const { t } = useTranslation();
  const { theme, styles: themedStyles } = useTheme();
  const {
    baseUrl,
    state,
    isLoading,
    isRefreshing,
    error,
    refresh,
    updateBaseUrl,
    resetBaseUrl,
    refreshDiscovery,
    setDeviceTrust,
    updateConfig,
  } = useHeadlessAuthority();

  const [editingBaseUrl, setEditingBaseUrl] = useState(false);
  const [draftBaseUrl, setDraftBaseUrl] = useState(baseUrl);
  const [editingConfig, setEditingConfig] = useState(false);
  const [configDraft, setConfigDraft] = useState('{}');

  useEffect(() => {
    setDraftBaseUrl(baseUrl);
  }, [baseUrl]);

  useEffect(() => {
    if (!editingConfig) {
      setConfigDraft(JSON.stringify(state?.config ?? {}, null, 2));
    }
  }, [editingConfig, state?.config]);

  const statusItems = useMemo(() => flattenStatus(state?.status), [state?.status]);
  const devices = state?.devices ?? [];

  const styles = StyleSheet.create({
    sectionContent: {
      padding: 16,
    },
    monospace: {
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    description: {
      ...themedStyles.itemDescription,
      marginBottom: 16,
      lineHeight: 20,
    },
    input: {
      marginBottom: 12,
      backgroundColor: 'transparent',
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 12,
    },
    button: {
      flex: 1,
    },
    deviceCard: {
      marginHorizontal: 16,
      marginBottom: 12,
      padding: 16,
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
    },
    deviceHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      gap: 12,
    },
    deviceMeta: {
      flex: 1,
      gap: 4,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12,
    },
    sensorsBlock: {
      marginTop: 8,
      gap: 4,
    },
    configEditor: {
      minHeight: 220,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 12,
    },
    errorText: {
      color: theme.colors.error,
    },
    emptyText: {
      color: theme.colors.onSurfaceVariant,
      padding: 16,
    },
  });

  const handleSaveBaseUrl = async () => {
    try {
      await updateBaseUrl(draftBaseUrl);
      setEditingBaseUrl(false);
    } catch (saveError) {
      Alert.alert(
        t('common.error', { defaultValue: 'Error' }),
        saveError instanceof Error ? saveError.message : String(saveError),
      );
    }
  };

  const handleResetBaseUrl = async () => {
    try {
      await resetBaseUrl();
      setEditingBaseUrl(false);
    } catch (resetError) {
      Alert.alert(
        t('common.error', { defaultValue: 'Error' }),
        resetError instanceof Error ? resetError.message : String(resetError),
      );
    }
  };

  const handleApplyConfig = async () => {
    try {
      const parsed = JSON.parse(configDraft);
      await updateConfig(parsed);
      setEditingConfig(false);
    } catch (configError) {
      Alert.alert(
        t('common.error', { defaultValue: 'Error' }),
        configError instanceof Error ? configError.message : String(configError),
      );
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: t('settings.network.authority.title', { defaultValue: 'Pi Trust Authority' }),
          headerBackTitle: t('common:back', { defaultValue: 'Back' }),
        }}
      />
      <SafeAreaView
        style={[themedStyles.screenContainer, { backgroundColor: theme.colors.background }]}
        edges={['bottom']}
      >
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 32 }}>
          <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
            {t('settings.network.authority.endpoint', { defaultValue: 'HEADLESS ENDPOINT' }).toUpperCase()}
          </Text>
          <View style={themedStyles.settingsSection}>
            <View style={styles.sectionContent}>
              <Text style={styles.description}>
                {t('settings.network.authority.endpointDescription', {
                  defaultValue: 'Configure the Raspberry Pi headless URL. Both the native app and expo web route use this same authority endpoint.',
                })}
              </Text>

              {editingBaseUrl ? (
                <>
                  <TextInput
                    mode="outlined"
                    label={t('settings.network.authority.url', { defaultValue: 'Authority URL' })}
                    value={draftBaseUrl}
                    onChangeText={setDraftBaseUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.input}
                  />
                  <View style={styles.buttonRow}>
                    <Button mode="contained" onPress={handleSaveBaseUrl} style={styles.button}>
                      {t('common.save', { defaultValue: 'Save' })}
                    </Button>
                    <Button
                      mode="outlined"
                      onPress={() => {
                        setDraftBaseUrl(baseUrl);
                        setEditingBaseUrl(false);
                      }}
                      style={styles.button}
                    >
                      {t('common.cancel', { defaultValue: 'Cancel' })}
                    </Button>
                  </View>
                </>
              ) : (
                <>
                  <Text style={[styles.monospace, themedStyles.itemTitle]}>{baseUrl}</Text>
                  <View style={styles.actionsRow}>
                    <Button mode="contained" onPress={() => setEditingBaseUrl(true)} style={styles.button}>
                      {t('common.edit', { defaultValue: 'Edit' })}
                    </Button>
                    <Button mode="outlined" onPress={handleResetBaseUrl} style={styles.button}>
                      {t('common.reset', { defaultValue: 'Reset' })}
                    </Button>
                  </View>
                </>
              )}
            </View>
          </View>

          <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
            {t('settings.network.authority.runtime', { defaultValue: 'RUNTIME STATUS' }).toUpperCase()}
          </Text>
          <View style={themedStyles.settingsSection}>
            <View style={styles.sectionContent}>
              <View style={styles.actionsRow}>
                <Button mode="contained" onPress={() => void refresh()} loading={isLoading || isRefreshing} style={styles.button}>
                  {t('common.refresh', { defaultValue: 'Refresh' })}
                </Button>
                <Button mode="outlined" onPress={() => void refreshDiscovery()} style={styles.button}>
                  {t('settings.network.authority.refreshDiscovery', { defaultValue: 'Refresh Discovery' })}
                </Button>
              </View>
            </View>

            {statusItems.length === 0 ? (
              <Text style={styles.emptyText}>
                {isLoading
                  ? t('common.loading', { defaultValue: 'Loading...' })
                  : t('settings.network.authority.noStatus', { defaultValue: 'No headless status received yet.' })}
              </Text>
            ) : (
              statusItems.map(([label, value], index) => (
                <React.Fragment key={label}>
                  {index > 0 && <View style={themedStyles.settingsDivider} />}
                  <List.Item
                    title={label}
                    description={value}
                    descriptionStyle={styles.monospace}
                    style={themedStyles.settingsItem}
                  />
                </React.Fragment>
              ))
            )}

            {error ? (
              <>
                <View style={themedStyles.settingsDivider} />
                <List.Item
                  title={t('common.error', { defaultValue: 'Error' })}
                  description={error}
                  descriptionStyle={styles.errorText}
                  style={themedStyles.settingsItem}
                />
              </>
            ) : null}
          </View>

          <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
            {t('settings.network.authority.devices', { defaultValue: 'DISCOVERED DEVICES' }).toUpperCase()}
          </Text>
          <View style={{ gap: 0 }}>
            {devices.length === 0 ? (
              <View style={themedStyles.settingsSection}>
                <Text style={styles.emptyText}>
                  {t('settings.network.authority.noDevices', {
                    defaultValue: 'No devices reported by the Pi authority yet.',
                  })}
                </Text>
              </View>
            ) : (
              devices.map((device) => (
                <Surface key={device.id} style={styles.deviceCard} elevation={1}>
                  <View style={styles.deviceHeader}>
                    <View style={styles.deviceMeta}>
                      <Text variant="titleMedium">{device.name ?? device.id}</Text>
                      <Text variant="bodySmall" style={styles.monospace}>
                        {device.role ?? device.type ?? 'unknown'} • {device.address ?? 'n/a'}{device.port ? `:${device.port}` : ''}
                      </Text>
                      <Text variant="bodySmall">
                        {t('settings.network.authority.trustState', { defaultValue: 'Trust state' })}: {device.trustState ?? 'unknown'}
                      </Text>
                    </View>
                    <Button
                      mode={device.trustState === 'trusted' ? 'outlined' : 'contained'}
                      onPress={() => void setDeviceTrust({
                        deviceId: device.id,
                        trusted: device.trustState !== 'trusted',
                      })}
                    >
                      {getTrustButtonLabel(device)}
                    </Button>
                  </View>

                  <View style={styles.chipsRow}>
                    <Chip compact>{device.online ? 'online' : 'offline'}</Chip>
                    <Chip compact>{device.mdnsName ?? 'no-mdns'}</Chip>
                    <Chip compact>{device.ownerId ? 'owned' : 'unowned'}</Chip>
                  </View>

                  <Text variant="bodySmall">
                    {t('settings.network.authority.capabilities', { defaultValue: 'Capabilities' })}: {formatCapabilities(device.capabilities)}
                  </Text>
                  <Text variant="bodySmall">
                    {t('settings.network.authority.lastSeen', { defaultValue: 'Last seen' })}: {formatTimestamp(device.lastSeenAt)}
                  </Text>

                  {device.sensorReadings && device.sensorReadings.length > 0 ? (
                    <View style={styles.sensorsBlock}>
                      <Text variant="labelLarge">
                        {t('settings.network.authority.sensors', { defaultValue: 'Sensor Readings' })}
                      </Text>
                      {device.sensorReadings.map((reading) => (
                        <Text key={`${device.id}-${reading.key}`} variant="bodySmall" style={styles.monospace}>
                          {reading.label ?? reading.key}: {String(reading.value)}{reading.unit ? ` ${reading.unit}` : ''}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </Surface>
              ))
            )}
          </View>

          <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
            {t('settings.network.authority.config', { defaultValue: 'AUTHORITY CONFIG' }).toUpperCase()}
          </Text>
          <View style={themedStyles.settingsSection}>
            <View style={styles.sectionContent}>
              <Text style={styles.description}>
                {t('settings.network.authority.configDescription', {
                  defaultValue: 'Edit the demonstrator control config as JSON. The expected shape is documented in the repo and is intentionally tolerant while the Pi surface is stabilizing.',
                })}
              </Text>
              <TextInput
                mode="outlined"
                multiline
                value={configDraft}
                onFocus={() => setEditingConfig(true)}
                onChangeText={setConfigDraft}
                style={[styles.input, styles.configEditor]}
                contentStyle={[styles.monospace, { minHeight: 220 }]}
              />
              <View style={styles.actionsRow}>
                <Button mode="contained" onPress={handleApplyConfig} style={styles.button}>
                  {t('common.apply', { defaultValue: 'Apply' })}
                </Button>
                <Button
                  mode="outlined"
                  onPress={() => {
                    setConfigDraft(JSON.stringify(state?.config ?? {}, null, 2));
                    setEditingConfig(false);
                  }}
                  style={styles.button}
                >
                  {t('common.reset', { defaultValue: 'Reset' })}
                </Button>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}
