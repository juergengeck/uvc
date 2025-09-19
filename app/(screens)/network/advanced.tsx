import React, { useState, useEffect } from 'react';
import { 
  View, 
  ScrollView, 
  StyleSheet, 
  TextInput, 
  Alert,
  Platform
} from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@src/providers/app/AppTheme';
import { Button, Text, List } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNetworkSettings } from '@src/hooks/useNetworkSettings';
import { testEddaProcessingLogic } from '@src/utils/eddaProcessingTest';

/**
 * Network Advanced Settings Screen
 * 
 * Dedicated view for advanced network configuration
 */
export default function NetworkAdvancedScreen() {
  const { t } = useTranslation();
  const { theme, styles: themedStyles } = useTheme();
  
  const [editingCommServerUrl, setEditingCommServerUrl] = useState(false);
  const [tempCommServerUrl, setTempCommServerUrl] = useState('');
  const [diagnosticsResult, setDiagnosticsResult] = useState<any>(null);
  const [isTestingEddaProcessing, setIsTestingEddaProcessing] = useState(false);
  
  // Use network settings hook
  const {
    commServerUrl,
    updateCommServerUrl,
    resetCommServerUrl,
  } = useNetworkSettings();
  
  // Sync temp URL when actual URL changes
  useEffect(() => {
    setTempCommServerUrl(commServerUrl);
  }, [commServerUrl]);
  
  // Local network diagnostics function  
  const runNetworkDiagnostics = () => {
    const networkSettingsService = require('@src/services/NetworkSettingsService').getNetworkSettingsService();
    return networkSettingsService.runNetworkDiagnostics?.() || { status: 'not available' };
  };
  
  const styles = StyleSheet.create({
    sectionContent: {
      padding: 16,
    },
    advancedDescription: {
      ...themedStyles.itemDescription,
      marginBottom: 16,
      lineHeight: 20,
    },
    urlEditContainer: {
      padding: 16,
    },
    urlInput: {
      backgroundColor: 'transparent',
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 17,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      color: theme.colors.onSurface,
      borderWidth: 0,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: Platform.select({
        ios: theme.dark ? 'rgba(60, 60, 67, 0.3)' : 'rgba(60, 60, 67, 0.3)',
        default: theme.colors.outline,
      }),
      marginBottom: 16,
    },
    urlButtonContainer: {
      flexDirection: 'row',
      gap: 12,
    },
    urlDisplayContainer: {
      padding: 16,
    },
    urlDisplay: {
      ...themedStyles.itemTitle,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      marginBottom: 16,
    },
    diagnosticItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.outline,
    },
    diagnosticKey: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.onSurface,
      flex: 1,
    },
    diagnosticValue: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      flex: 2,
      textAlign: 'right',
    },
  });
  
  return (
    <SafeAreaView style={[themedStyles.screenContainer, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      
      <ScrollView 
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* CommServer Configuration */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.network.advanced.commServer.title', { defaultValue: 'COMMSERVER CONFIGURATION' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <View style={styles.sectionContent}>
            <Text style={styles.advancedDescription}>
              {t('settings.network.advanced.commServer.description', { defaultValue: 'Configure the CommServer URL for peer-to-peer connections.' })}
            </Text>
          
            {editingCommServerUrl ? (
              <View style={styles.urlEditContainer}>
                <TextInput
                  style={styles.urlInput}
                  value={tempCommServerUrl}
                  onChangeText={setTempCommServerUrl}
                  placeholder="wss://comm10.dev.refinio.one"
                  placeholderTextColor={theme.colors.onSurfaceVariant}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <View style={styles.urlButtonContainer}>
                  <Button
                    mode="contained"
                    onPress={async () => {
                      try {
                        await updateCommServerUrl(tempCommServerUrl);
                        setEditingCommServerUrl(false);
                      } catch (error) {
                        Alert.alert(
                          t('common.error', { defaultValue: 'Error' }), 
                          t('settings.network.advanced.commServer.updateError', { defaultValue: 'Failed to update CommServer URL' })
                        );
                      }
                    }}
                    style={[themedStyles.buttonPrimary, { flex: 1, marginRight: 8 }]}
                    labelStyle={themedStyles.buttonPrimaryText}
                  >
                    {t('common.save', { defaultValue: 'Save' })}
                  </Button>
                  <Button
                    mode="outlined"
                    onPress={() => {
                      setTempCommServerUrl(commServerUrl);
                      setEditingCommServerUrl(false);
                    }}
                    style={{ flex: 1, marginLeft: 8 }}
                  >
                    {t('common.cancel', { defaultValue: 'Cancel' })}
                  </Button>
                </View>
              </View>
            ) : (
              <View style={styles.urlDisplayContainer}>
                <Text style={styles.urlDisplay}>{commServerUrl}</Text>
                <View style={styles.urlButtonContainer}>
                  <Button
                    mode="contained"
                    onPress={() => setEditingCommServerUrl(true)}
                    style={[themedStyles.buttonPrimary, { flex: 1, marginRight: 8 }]}
                    labelStyle={themedStyles.buttonPrimaryText}
                  >
                    {t('common.edit', { defaultValue: 'Edit' })}
                  </Button>
                  <Button
                    mode="outlined"
                    onPress={async () => {
                      Alert.alert(
                        t('settings.network.advanced.commServer.resetTitle', { defaultValue: 'Reset CommServer URL' }),
                        t('settings.network.advanced.commServer.resetMessage', { defaultValue: 'Reset to default URL (wss://comm10.dev.refinio.one)?' }),
                        [
                          { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
                          { 
                            text: t('common.reset', { defaultValue: 'Reset' }), 
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                await resetCommServerUrl();
                              } catch (error) {
                                Alert.alert(
                                  t('common.error', { defaultValue: 'Error' }), 
                                  t('settings.network.advanced.commServer.resetError', { defaultValue: 'Failed to reset CommServer URL' })
                                );
                              }
                            }
                          }
                        ]
                      );
                    }}
                    style={{ flex: 1, marginLeft: 8 }}
                  >
                    {t('common.reset', { defaultValue: 'Reset' })}
                  </Button>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Advanced Network Settings */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.network.advanced.network.title', { defaultValue: 'ADVANCED NETWORK SETTINGS' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <View style={styles.sectionContent}>
            <Text style={styles.advancedDescription}>
              {t('settings.network.advanced.network.description', { defaultValue: 'These settings are for advanced users and may affect application stability.' })}
            </Text>
            
            <Button 
              mode="contained"
              style={[themedStyles.buttonPrimary, { marginBottom: 12 }]}
              labelStyle={themedStyles.buttonPrimaryText}
              onPress={() => {
                const result = runNetworkDiagnostics();
                setDiagnosticsResult(result);
              }}
            >
              {t('settings.network.advanced.runDiagnostics', { defaultValue: 'Run Network Diagnostics' })}
            </Button>

            <Button
              mode="contained"
              onPress={async () => {
                try {
                  setIsTestingEddaProcessing(true);
                  await testEddaProcessingLogic();
                } catch (error) {
                  console.error('[NetworkAdvanced] Edda processing test error:', error);
                } finally {
                  setIsTestingEddaProcessing(false);
                }
              }}
              disabled={isTestingEddaProcessing}
              icon={isTestingEddaProcessing ? undefined : "flask-outline"}
              loading={isTestingEddaProcessing}
              style={themedStyles.buttonPrimary}
              labelStyle={themedStyles.buttonPrimaryText}
            >
              {isTestingEddaProcessing 
                ? t('common.testing', { defaultValue: 'Testing...' }) 
                : t('settings.network.advanced.testEdda', { defaultValue: 'Test edda.one Processing' })}
            </Button>
          </View>
        </View>
        
        {diagnosticsResult && (
          <>
            <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
              {t('settings.network.advanced.diagnosticsResult', { defaultValue: 'DIAGNOSTICS RESULT' }).toUpperCase()}
            </Text>
            <View style={themedStyles.settingsSection}>
              {Object.entries(diagnosticsResult).map(([key, value], index) => (
                <React.Fragment key={key}>
                  {index > 0 && <View style={themedStyles.settingsDivider} />}
                  <List.Item
                    title={key}
                    description={value?.toString()}
                    style={themedStyles.settingsItem}
                    titleStyle={themedStyles.itemTitle}
                    descriptionStyle={[themedStyles.itemDescription, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}
                  />
                </React.Fragment>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}