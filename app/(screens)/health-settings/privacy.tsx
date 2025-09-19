/**
 * Health Privacy Settings Screen
 * 
 * Manages privacy settings for health data sharing and access control
 */

import React, { useState, useCallback } from 'react';
import { 
  View, 
  ScrollView, 
  Alert
} from 'react-native';
import { 
  Text, 
  List, 
  Switch, 
  Button, 
  Card,
  Chip,
  Portal,
  Dialog,
  RadioButton,
  Divider,
  IconButton,
  useTheme,
  Banner
} from 'react-native-paper';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme as useAppTheme } from '@src/providers/app/AppTheme';
import { createThemedStyles } from '@src/constants/ThemeStyles';

// Mock data sharing options
interface SharingOption {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  lastShared?: Date;
  dataTypes?: string[];
}

interface PrivacySettings {
  shareWithContacts: boolean;
  shareAnonymously: boolean;
  autoBackup: boolean;
  encryptBackups: boolean;
  dataRetention: 'forever' | '2years' | '1year' | '6months' | '3months';
  allowResearch: boolean;
}

export default function HealthPrivacyScreen() {
  const { t } = useTranslation('settings');
  const router = useRouter();
  const { theme, styles: themedStyles } = useAppTheme();
  const paperTheme = useTheme();
  
  // State
  const [loading, setLoading] = useState(false);
  const [sharingDialogVisible, setSharingDialogVisible] = useState(false);
  const [selectedSharing, setSelectedSharing] = useState<SharingOption | null>(null);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  
  const [settings, setSettings] = useState<PrivacySettings>({
    shareWithContacts: false,
    shareAnonymously: true,
    autoBackup: true,
    encryptBackups: true,
    dataRetention: '2years',
    allowResearch: false
  });

  const [sharingOptions, setSharingOptions] = useState<SharingOption[]>([
    {
      id: 'emergency',
      name: t('settings.health.privacy.emergency', { defaultValue: 'Emergency Contacts' }),
      description: t('settings.health.privacy.emergencyDesc', { 
        defaultValue: 'Share vital signs with emergency contacts' 
      }),
      enabled: false,
      dataTypes: ['heart-rate', 'blood-pressure', 'medications']
    },
    {
      id: 'doctor',
      name: t('settings.health.privacy.doctor', { defaultValue: 'Healthcare Provider' }),
      description: t('settings.health.privacy.doctorDesc', { 
        defaultValue: 'Share health data with your doctor' 
      }),
      enabled: true,
      lastShared: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      dataTypes: ['all']
    },
    {
      id: 'family',
      name: t('settings.health.privacy.family', { defaultValue: 'Family Members' }),
      description: t('settings.health.privacy.familyDesc', { 
        defaultValue: 'Share fitness and wellness data with family' 
      }),
      enabled: false,
      dataTypes: ['steps', 'activity', 'sleep']
    }
  ]);

  const dataRetentionOptions = [
    { value: 'forever', label: t('settings.health.privacy.forever', { defaultValue: 'Forever' }) },
    { value: '2years', label: t('settings.health.privacy.2years', { defaultValue: '2 Years' }) },
    { value: '1year', label: t('settings.health.privacy.1year', { defaultValue: '1 Year' }) },
    { value: '6months', label: t('settings.health.privacy.6months', { defaultValue: '6 Months' }) },
    { value: '3months', label: t('settings.health.privacy.3months', { defaultValue: '3 Months' }) }
  ];

  const handleSharingToggle = async (option: SharingOption) => {
    if (!option.enabled) {
      // Show configuration dialog when enabling
      setSelectedSharing(option);
      setSharingDialogVisible(true);
    } else {
      // Confirm before disabling
      Alert.alert(
        t('common:confirm'),
        t('settings.health.privacy.disableSharingConfirm', { 
          defaultValue: `Stop sharing health data with ${option.name}?` 
        }),
        [
          { text: t('common:cancel'), style: 'cancel' },
          {
            text: t('common:disable'),
            style: 'destructive',
            onPress: () => {
              setSharingOptions(prev => 
                prev.map(opt => opt.id === option.id ? { ...opt, enabled: false } : opt)
              );
            }
          }
        ]
      );
    }
  };

  const handleSharingConfirm = () => {
    if (!selectedSharing) return;
    
    setSharingOptions(prev => 
      prev.map(opt => opt.id === selectedSharing.id ? { ...opt, enabled: true, lastShared: new Date() } : opt)
    );
    setSharingDialogVisible(false);
    
    Alert.alert(
      t('common:success'),
      t('settings.health.privacy.sharingEnabled', { 
        defaultValue: `Health data sharing enabled for ${selectedSharing.name}` 
      })
    );
  };

  const handleDeleteAllData = async () => {
    setLoading(true);
    try {
      // TODO: Implement actual data deletion
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setDeleteDialogVisible(false);
      Alert.alert(
        t('common:success'),
        t('settings.health.privacy.dataDeleted', { 
          defaultValue: 'All health data has been permanently deleted' 
        })
      );
      
      // Navigate back to settings
      router.back();
    } catch (error) {
      Alert.alert(
        t('common:error'),
        t('settings.health.privacy.deleteFailed', { 
          defaultValue: 'Failed to delete health data' 
        })
      );
    } finally {
      setLoading(false);
    }
  };

  const handleExportPrivacyReport = async () => {
    setLoading(true);
    try {
      // TODO: Generate privacy report
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      Alert.alert(
        t('common:success'),
        t('settings.health.privacy.reportGenerated', { 
          defaultValue: 'Privacy report has been generated and saved' 
        })
      );
    } catch (error) {
      Alert.alert(
        t('common:error'),
        t('settings.health.privacy.reportFailed', { 
          defaultValue: 'Failed to generate privacy report' 
        })
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[themedStyles.screenContainer, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: t('settings.health.privacy', { defaultValue: 'Privacy Settings' }),
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.onSurface,
        }}
      />
      
      <ScrollView 
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <Banner
          visible={true}
          actions={[]}
          icon="shield-lock"
          style={{ marginBottom: 16 }}
        >
          {t('settings.health.privacy.banner', { 
            defaultValue: 'Your health data is encrypted and stored locally. You control who can access it.' 
          })}
        </Banner>

        {/* Data Sharing */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.health.privacy.dataSharing', { defaultValue: 'DATA SHARING' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          {sharingOptions.map((option, index) => (
            <React.Fragment key={option.id}>
              {index > 0 && <Divider />}
              <List.Item
                title={option.name}
                description={
                  <View>
                    <Text variant="bodySmall">{option.description}</Text>
                    {option.enabled && option.lastShared && (
                      <Text variant="bodySmall" style={{ opacity: 0.6, marginTop: 4 }}>
                        Last shared: {option.lastShared.toLocaleDateString()}
                      </Text>
                    )}
                  </View>
                }
                onPress={() => handleSharingToggle(option)}
                left={props => (
                  <List.Icon 
                    {...props} 
                    icon={option.id === 'emergency' ? 'hospital' : option.id === 'doctor' ? 'doctor' : 'account-group'}
                  />
                )}
                right={() => (
                  <Switch
                    value={option.enabled}
                    onValueChange={() => handleSharingToggle(option)}
                    color={paperTheme.colors.primary}
                  />
                )}
              />
            </React.Fragment>
          ))}
        </View>

        {/* Privacy Options */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.health.privacy.options', { defaultValue: 'PRIVACY OPTIONS' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <List.Item
            title={t('settings.health.privacy.shareContacts', { defaultValue: 'Share with Contacts' })}
            description={t('settings.health.privacy.shareContactsDesc', { 
              defaultValue: 'Allow approved contacts to view your health trends' 
            })}
            left={props => <List.Icon {...props} icon="account-check" />}
            right={() => (
              <Switch
                value={settings.shareWithContacts}
                onValueChange={value => setSettings(prev => ({ ...prev, shareWithContacts: value }))}
                color={paperTheme.colors.primary}
              />
            )}
          />
          <Divider />
          <List.Item
            title={t('settings.health.privacy.anonymous', { defaultValue: 'Anonymous Sharing' })}
            description={t('settings.health.privacy.anonymousDesc', { 
              defaultValue: 'Remove identifiers when sharing for research' 
            })}
            left={props => <List.Icon {...props} icon="incognito" />}
            right={() => (
              <Switch
                value={settings.shareAnonymously}
                onValueChange={value => setSettings(prev => ({ ...prev, shareAnonymously: value }))}
                color={paperTheme.colors.primary}
              />
            )}
          />
          <Divider />
          <List.Item
            title={t('settings.health.privacy.research', { defaultValue: 'Contribute to Research' })}
            description={t('settings.health.privacy.researchDesc', { 
              defaultValue: 'Share anonymous data for health research' 
            })}
            left={props => <List.Icon {...props} icon="flask" />}
            right={() => (
              <Switch
                value={settings.allowResearch}
                onValueChange={value => setSettings(prev => ({ ...prev, allowResearch: value }))}
                color={paperTheme.colors.primary}
              />
            )}
          />
        </View>

        {/* Data Storage */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.health.privacy.storage', { defaultValue: 'DATA STORAGE' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <List.Item
            title={t('settings.health.privacy.autoBackup', { defaultValue: 'Automatic Backup' })}
            description={t('settings.health.privacy.autoBackupDesc', { 
              defaultValue: 'Backup health data to secure storage' 
            })}
            left={props => <List.Icon {...props} icon="backup-restore" />}
            right={() => (
              <Switch
                value={settings.autoBackup}
                onValueChange={value => setSettings(prev => ({ ...prev, autoBackup: value }))}
                color={paperTheme.colors.primary}
              />
            )}
          />
          {settings.autoBackup && (
            <>
              <Divider />
              <List.Item
                title={t('settings.health.privacy.encrypt', { defaultValue: 'Encrypt Backups' })}
                description={t('settings.health.privacy.encryptDesc', { 
                  defaultValue: 'Use end-to-end encryption for backups' 
                })}
                left={props => <List.Icon {...props} icon="lock" />}
                right={() => (
                  <Switch
                    value={settings.encryptBackups}
                    onValueChange={value => setSettings(prev => ({ ...prev, encryptBackups: value }))}
                    color={paperTheme.colors.primary}
                  />
                )}
              />
            </>
          )}
          <Divider />
          <List.Item
            title={t('settings.health.privacy.retention', { defaultValue: 'Data Retention' })}
            description={
              dataRetentionOptions.find(opt => opt.value === settings.dataRetention)?.label || 
              settings.dataRetention
            }
            onPress={() => {
              Alert.alert(
                t('settings.health.privacy.retention'),
                t('settings.health.privacy.retentionMessage', { 
                  defaultValue: 'How long should we keep your health data?' 
                }),
                dataRetentionOptions.map(opt => ({
                  text: opt.label,
                  onPress: () => setSettings(prev => ({ ...prev, dataRetention: opt.value as any }))
                })).concat([{ text: t('common:cancel'), style: 'cancel' }])
              );
            }}
            left={props => <List.Icon {...props} icon="calendar-clock" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
          />
        </View>

        {/* Data Management Actions */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.health.privacy.management', { defaultValue: 'DATA MANAGEMENT' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <List.Item
            title={t('settings.health.privacy.exportReport', { defaultValue: 'Export Privacy Report' })}
            description={t('settings.health.privacy.exportReportDesc', { 
              defaultValue: 'Download a report of all data access' 
            })}
            onPress={handleExportPrivacyReport}
            disabled={loading}
            left={props => <List.Icon {...props} icon="file-document-outline" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
          />
          <Divider />
          <List.Item
            title={t('settings.health.privacy.revokeAccess', { defaultValue: 'Revoke All Access' })}
            description={t('settings.health.privacy.revokeAccessDesc', { 
              defaultValue: 'Remove all third-party access to health data' 
            })}
            onPress={() => {
              Alert.alert(
                t('common:confirm'),
                t('settings.health.privacy.revokeConfirm', { 
                  defaultValue: 'This will remove all data sharing permissions. Continue?' 
                }),
                [
                  { text: t('common:cancel'), style: 'cancel' },
                  {
                    text: t('common:revoke', { defaultValue: 'Revoke' }),
                    style: 'destructive',
                    onPress: () => {
                      setSharingOptions(prev => prev.map(opt => ({ ...opt, enabled: false })));
                      Alert.alert(
                        t('common:success'),
                        t('settings.health.privacy.accessRevoked', { 
                          defaultValue: 'All access has been revoked' 
                        })
                      );
                    }
                  }
                ]
              );
            }}
            left={props => <List.Icon {...props} icon="cancel" color={paperTheme.colors.error} />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
          />
          <Divider />
          <List.Item
            title={t('settings.health.privacy.deleteAll', { defaultValue: 'Delete All Health Data' })}
            description={t('settings.health.privacy.deleteAllDesc', { 
              defaultValue: 'Permanently delete all health records' 
            })}
            onPress={() => setDeleteDialogVisible(true)}
            titleStyle={{ color: paperTheme.colors.error }}
            left={props => <List.Icon {...props} icon="delete-forever" color={paperTheme.colors.error} />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
          />
        </View>

        {/* Sharing Configuration Dialog */}
        <Portal>
          <Dialog visible={sharingDialogVisible} onDismiss={() => setSharingDialogVisible(false)}>
            {selectedSharing && (
              <>
                <Dialog.Title>{selectedSharing.name}</Dialog.Title>
                <Dialog.Content>
                  <Text variant="bodyMedium" style={{ marginBottom: 16 }}>
                    {t('settings.health.privacy.selectDataTypes', { 
                      defaultValue: 'Select which data types to share:' 
                    })}
                  </Text>
                  
                  <Card mode="outlined">
                    <Card.Content>
                      {selectedSharing.dataTypes?.includes('all') ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <IconButton icon="check-circle" size={20} />
                          <Text variant="bodyMedium">
                            {t('settings.health.privacy.allData', { defaultValue: 'All health data' })}
                          </Text>
                        </View>
                      ) : (
                        <View>
                          {selectedSharing.dataTypes?.map(type => (
                            <View key={type} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                              <IconButton icon="check" size={16} />
                              <Text variant="bodyMedium">{type}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </Card.Content>
                  </Card>
                  
                  <Text variant="bodySmall" style={{ marginTop: 16, opacity: 0.6 }}>
                    {t('settings.health.privacy.sharingNote', { 
                      defaultValue: 'You can revoke access at any time from privacy settings' 
                    })}
                  </Text>
                </Dialog.Content>
                <Dialog.Actions>
                  <Button onPress={() => setSharingDialogVisible(false)}>
                    {t('common:cancel')}
                  </Button>
                  <Button onPress={handleSharingConfirm}>
                    {t('common:enable', { defaultValue: 'Enable' })}
                  </Button>
                </Dialog.Actions>
              </>
            )}
          </Dialog>
        </Portal>

        {/* Delete Confirmation Dialog */}
        <Portal>
          <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)}>
            <Dialog.Title>
              {t('settings.health.privacy.deleteConfirmTitle', { defaultValue: 'Delete All Health Data?' })}
            </Dialog.Title>
            <Dialog.Content>
              <Text variant="bodyMedium" style={{ color: paperTheme.colors.error, marginBottom: 16 }}>
                {t('settings.health.privacy.deleteWarning', { 
                  defaultValue: 'This action cannot be undone. All your health records will be permanently deleted.' 
                })}
              </Text>
              <Text variant="bodyMedium">
                {t('settings.health.privacy.deleteConfirmMessage', { 
                  defaultValue: 'Are you absolutely sure you want to proceed?' 
                })}
              </Text>
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setDeleteDialogVisible(false)}>
                {t('common:cancel')}
              </Button>
              <Button 
                onPress={handleDeleteAllData} 
                loading={loading}
                textColor={paperTheme.colors.error}
              >
                {t('common:deleteAll', { defaultValue: 'Delete All' })}
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      </ScrollView>
    </SafeAreaView>
  );
}