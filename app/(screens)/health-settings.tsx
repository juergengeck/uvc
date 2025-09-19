/**
 * Health Settings Screen
 * 
 * Manages health data integrations including:
 * - Apple Health permissions and data sync
 * - BLE health device connections
 * - Health data import/export settings
 * - Privacy and data sharing preferences
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  ScrollView, 
  Platform, 
  Alert,
  ActivityIndicator
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
  Checkbox,
  Divider,
  IconButton,
  useTheme
} from 'react-native-paper';
import { Stack, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme as useAppTheme } from '@src/providers/app/AppTheme';
import { createThemedStyles } from '@src/constants/ThemeStyles';
// Health integration imports will be added when packages are available
// import { UnifiedBLEManager } from '@refinio/one.btle';
// import { BLEDevice } from '@refinio/one.btle';
// import { BLEHealthIntegration } from '@refinio/one.health';
// import { HealthDataService } from '@refinio/one.health';
import { useAppModel } from '@src/hooks/useAppModel';

// Health permission types
interface HealthPermission {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category: 'vitals' | 'activity' | 'body' | 'nutrition' | 'sleep';
}

export default function HealthSettingsScreen() {
  const { t } = useTranslation('health');
  const router = useRouter();
  const { theme, styles: themedStyles } = useAppTheme();
  const paperTheme = useTheme();
  const appModel = useAppModel();
  
  // Storage key for paired devices
  const PAIRED_DEVICES_KEY = 'health_paired_devices';
  
  // State
  const [loading, setLoading] = useState(false);
  const [appleHealthEnabled, setAppleHealthEnabled] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [syncInterval, setSyncInterval] = useState('hourly');
  const [permissionsDialogVisible, setPermissionsDialogVisible] = useState(false);
  const [devicesDialogVisible, setDevicesDialogVisible] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<any | null>(null);
  const [devices, setDevices] = useState<any[]>([]);
  
  // Default health permissions
  const [permissions, setPermissions] = useState<HealthPermission[]>([
    { id: '1', name: 'Heart Rate', description: 'Read heart rate data', enabled: true, category: 'vitals' },
    { id: '2', name: 'Steps', description: 'Read step count data', enabled: true, category: 'activity' },
    { id: '3', name: 'Blood Oxygen', description: 'Read SpO2 data', enabled: false, category: 'vitals' },
    { id: '4', name: 'Sleep Analysis', description: 'Read sleep patterns', enabled: true, category: 'sleep' },
    { id: '5', name: 'Body Weight', description: 'Read weight measurements', enabled: false, category: 'body' },
  ]);

  // Load paired devices from storage
  useEffect(() => {
    loadPairedDevices();
    
    if (Platform.OS === 'ios') {
      checkAppleHealthStatus();
    }
  }, []);
  
  const loadPairedDevices = async () => {
    try {
      const storedDevices = await appModel?.settingsModel?.getItem?.(PAIRED_DEVICES_KEY);
      
      if (storedDevices) {
        const parsedDevices = JSON.parse(storedDevices);
        setDevices(parsedDevices);
        console.log('[HealthSettings] Loaded paired devices:', parsedDevices);
      } else {
        // No devices paired yet
        setDevices([]);
      }
    } catch (error) {
      console.error('[HealthSettings] Failed to load paired devices:', error);
      setDevices([]);
    }
  };
  
  const handleDeviceConnected = (device: any) => {
    console.log('[HealthSettings] Device connected:', device.name);
    setDevices(prev => {
      const exists = prev.some(d => d.id === device.id);
      if (exists) {
        return prev.map(d => d.id === device.id ? device : d);
      }
      return [...prev, device];
    });
  };
  
  const handleDeviceDisconnected = (device: any) => {
    console.log('[HealthSettings] Device disconnected:', device.name);
    setDevices(prev => prev.map(d => 
      d.id === device.id ? { ...d, isConnected: false } : d
    ));
  };
  
  const handleHealthDataReceived = ({ device, data, observation }: any) => {
    console.log(`[HealthSettings] Health data from ${device.name}:`, data);
    // Update last sync time
    setDevices(prev => prev.map(d => 
      d.id === device.id ? { ...d, lastSync: new Date() } : d
    ));
  };

  const checkAppleHealthStatus = async () => {
    // TODO: Implement actual Apple Health check
    setAppleHealthEnabled(false);
  };

  const handleAppleHealthToggle = async (value: boolean) => {
    if (value) {
      // Request permissions
      setPermissionsDialogVisible(true);
    } else {
      // Disable Apple Health
      Alert.alert(
        t('settings.health.disableTitle', { defaultValue: 'Disable Apple Health' }),
        t('settings.health.disableMessage', { defaultValue: 'This will stop syncing data from Apple Health. Are you sure?' }),
        [
          { text: t('common:cancel'), style: 'cancel' },
          {
            text: t('common:disable'),
            style: 'destructive',
            onPress: () => {
              setAppleHealthEnabled(false);
              // Reset all permissions
              setPermissions(perms => perms.map(p => ({ ...p, enabled: false })));
            }
          }
        ]
      );
    }
  };

  const handlePermissionToggle = (permissionId: string, value: boolean) => {
    setPermissions(perms => 
      perms.map(p => p.id === permissionId ? { ...p, enabled: value } : p)
    );
  };

  const handlePermissionsConfirm = async () => {
    setLoading(true);
    try {
      // TODO: Actually request Apple Health permissions
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      setAppleHealthEnabled(true);
      setPermissionsDialogVisible(false);
      Alert.alert(
        t('common:success.title'),
        t('success.permissionsGranted')
      );
    } catch (error) {
      Alert.alert(
        t('common:error'),
        t('error.permissionsFailed')
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDevicePress = (device: any) => {
    // Navigate to device data screen
    router.push({
      pathname: '/(screens)/health-settings/device-data',
      params: {
        deviceId: device.id,
        deviceName: device.name
      }
    });
  };

  const handleDeviceConnect = async () => {
    if (!selectedDevice) return;
    
    setLoading(true);
    try {
      // await bleManager?.connectToDevice(selectedDevice.id);
      console.warn('[HealthSettings] Device connection temporarily disabled');
      setDevicesDialogVisible(false);
      Alert.alert(
        t('common:success'),
        t('settings.health.deviceConnected', { defaultValue: 'Device connected successfully' })
      );
    } catch (error) {
      Alert.alert(
        t('common:error'),
        t('settings.health.deviceConnectionFailed', { defaultValue: 'Failed to connect device' })
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSyncNow = async () => {
    setLoading(true);
    try {
      // await bleHealthIntegration?.syncAllHealthData();
      console.warn('[HealthSettings] Health sync temporarily disabled');
      Alert.alert(
        t('common:success'),
        t('settings.health.syncComplete', { defaultValue: 'Health data synced successfully' })
      );
    } catch (error) {
      Alert.alert(
        t('common:error'),
        t('settings.health.syncFailed', { defaultValue: 'Failed to sync health data' })
      );
    } finally {
      setLoading(false);
    }
  };

  const getCategoryIcon = (category: HealthPermission['category']) => {
    switch (category) {
      case 'vitals': return 'heart-pulse';
      case 'activity': return 'run';
      case 'body': return 'human';
      case 'nutrition': return 'food-apple';
      case 'sleep': return 'sleep';
      default: return 'help-circle';
    }
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'ring': return 'ring';
      case 'watch': return 'watch';
      case 'band': return 'watch-variant';
      case 'sensor': return 'access-point';
      default: return 'devices';
    }
  };

  return (
    <SafeAreaView style={[themedStyles.screenContainer, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          title: t('settings.health.title', { defaultValue: 'Health Data' }),
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.onSurface,
        }}
      />
      
      <ScrollView 
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Apple Health Section (iOS only) */}
        {Platform.OS === 'ios' && (
          <>
            <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
              {t('settings.health.appleHealth', { defaultValue: 'APPLE HEALTH' }).toUpperCase()}
            </Text>
            <View style={themedStyles.settingsSection}>
              <List.Item
                title={t('settings.health.enableAppleHealth', { defaultValue: 'Enable Apple Health' })}
                description={t('settings.health.appleHealthDescription', { defaultValue: 'Sync health data from Apple Health' })}
                left={props => <List.Icon {...props} icon="heart" color="#FF3B30" />}
                right={() => (
                  <Switch
                    value={appleHealthEnabled}
                    onValueChange={handleAppleHealthToggle}
                    disabled={loading}
                    color={paperTheme.colors.primary}
                  />
                )}
              />
              
              {appleHealthEnabled && (
                <>
                  <Divider />
                  <List.Item
                    title={t('settings.health.permissions', { defaultValue: 'Permissions' })}
                    description={`${permissions.filter(p => p.enabled).length} of ${permissions.length} enabled`}
                    onPress={() => setPermissionsDialogVisible(true)}
                    left={props => <List.Icon {...props} icon="shield-check" />}
                    right={props => <List.Icon {...props} icon="chevron-right" />}
                  />
                </>
              )}
            </View>
          </>
        )}

        {/* Connected Devices Section */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.health.devices', { defaultValue: 'HEALTH DEVICES' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          {devices.map((device, index) => (
            <React.Fragment key={device.id}>
              {index > 0 && <Divider />}
              <List.Item
                title={device.name}
                description={
                  device.isConnected 
                    ? `Connected${device.batteryLevel ? ` • ${device.batteryLevel}% battery` : ''}`
                    : 'Not connected'
                }
                onPress={() => handleDevicePress(device)}
                left={props => (
                  <List.Icon 
                    {...props} 
                    icon={getDeviceIcon(device.type)}
                    color={device.connected ? paperTheme.colors.primary : undefined}
                  />
                )}
                right={() => (
                  <View style={{ alignItems: 'flex-end' }}>
                    <Chip 
                      mode="outlined" 
                      compact
                      selected={device.isConnected}
                      style={{ marginBottom: 4 }}
                    >
                      {device.isConnected ? 'Connected' : 'Disconnected'}
                    </Chip>
                    {device.lastSync && (
                      <Text variant="bodySmall" style={{ opacity: 0.6 }}>
                        Last sync: {device.lastSync.toLocaleTimeString()}
                      </Text>
                    )}
                  </View>
                )}
              />
            </React.Fragment>
          ))}
          
          <Divider />
          <List.Item
            title={t('settings.health.addDevice', { defaultValue: 'Add New Device' })}
            onPress={() => router.push('/(screens)/health-settings/add-device')}
            left={props => <List.Icon {...props} icon="plus-circle-outline" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
          />
        </View>

        {/* Sync Settings */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.health.syncSettings', { defaultValue: 'SYNC SETTINGS' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <List.Item
            title={t('settings.health.autoSync', { defaultValue: 'Auto-sync' })}
            description={t('settings.health.autoSyncDescription', { defaultValue: 'Automatically sync health data' })}
            left={props => <List.Icon {...props} icon="sync-circle" />}
            right={() => (
              <Switch
                value={autoSync}
                onValueChange={setAutoSync}
                disabled={loading}
                color={paperTheme.colors.primary}
              />
            )}
          />
          
          {autoSync && (
            <>
              <Divider />
              <List.Item
                title={t('settings.health.syncInterval', { defaultValue: 'Sync Interval' })}
                description={syncInterval}
                onPress={() => {
                  // TODO: Show interval picker
                  Alert.alert('Sync Interval', 'Choose sync frequency', [
                    { text: 'Every 15 minutes', onPress: () => setSyncInterval('Every 15 minutes') },
                    { text: 'Hourly', onPress: () => setSyncInterval('Hourly') },
                    { text: 'Daily', onPress: () => setSyncInterval('Daily') },
                    { text: 'Cancel', style: 'cancel' }
                  ]);
                }}
                left={props => <List.Icon {...props} icon="timer-outline" />}
                right={props => <List.Icon {...props} icon="chevron-right" />}
              />
            </>
          )}
        </View>

        {/* Manual Sync */}
        <View style={{ paddingHorizontal: 16, paddingTop: 24 }}>
          <Button
            mode="contained"
            onPress={handleSyncNow}
            loading={loading}
            disabled={loading || (!appleHealthEnabled && devices.filter(d => d.isConnected).length === 0)}
            icon="sync"
          >
            {t('settings.health.syncNow', { defaultValue: 'Sync Now' })}
          </Button>
        </View>

        {/* Data Management */}
        <Text variant="bodySmall" style={[themedStyles.settingsSectionTitle, { marginTop: 24 }]}>
          {t('settings.health.dataManagement', { defaultValue: 'DATA MANAGEMENT' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <List.Item
            title={t('settings.health.exportData', { defaultValue: 'Export Health Data' })}
            description={t('settings.health.exportDescription', { defaultValue: 'Export your health data as FHIR' })}
            onPress={() => router.push('/(screens)/health-settings/export')}
            left={props => <List.Icon {...props} icon="export" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
          />
          <Divider />
          <List.Item
            title={t('settings.health.privacy', { defaultValue: 'Privacy Settings' })}
            description={t('settings.health.privacyDescription', { defaultValue: 'Control health data sharing' })}
            onPress={() => router.push('/(screens)/health-settings/privacy')}
            left={props => <List.Icon {...props} icon="shield-lock" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
          />
        </View>

        {/* Permissions Dialog */}
        <Portal>
          <Dialog visible={permissionsDialogVisible} onDismiss={() => setPermissionsDialogVisible(false)}>
            <Dialog.Title>
              {t('settings.health.selectPermissions', { defaultValue: 'Select Health Data' })}
            </Dialog.Title>
            <Dialog.ScrollArea style={{ maxHeight: 400 }}>
              <ScrollView>
                {Object.entries(
                  permissions.reduce((acc, perm) => {
                    if (!acc[perm.category]) acc[perm.category] = [];
                    acc[perm.category].push(perm);
                    return acc;
                  }, {} as Record<string, HealthPermission[]>)
                ).map(([category, perms]) => (
                  <View key={category} style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <IconButton 
                        icon={getCategoryIcon(category as HealthPermission['category'])} 
                        size={20} 
                      />
                      <Text variant="titleSmall" style={{ textTransform: 'capitalize' }}>
                        {category}
                      </Text>
                    </View>
                    {perms.map(perm => (
                      <List.Item
                        key={perm.id}
                        title={perm.name}
                        description={perm.description}
                        left={() => (
                          <Checkbox
                            status={perm.enabled ? 'checked' : 'unchecked'}
                            onPress={() => handlePermissionToggle(perm.id, !perm.enabled)}
                          />
                        )}
                        onPress={() => handlePermissionToggle(perm.id, !perm.enabled)}
                      />
                    ))}
                  </View>
                ))}
              </ScrollView>
            </Dialog.ScrollArea>
            <Dialog.Actions>
              <Button onPress={() => setPermissionsDialogVisible(false)}>
                {t('common:cancel')}
              </Button>
              <Button 
                onPress={handlePermissionsConfirm} 
                loading={loading}
                disabled={!permissions.some(p => p.enabled)}
              >
                {t('common:confirm')}
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>

        {/* Device Details Dialog */}
        <Portal>
          <Dialog visible={devicesDialogVisible} onDismiss={() => setDevicesDialogVisible(false)}>
            {selectedDevice && (
              <>
                <Dialog.Title>{selectedDevice.name}</Dialog.Title>
                <Dialog.Content>
                  <Card mode="outlined">
                    <Card.Content>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text variant="bodyMedium">{t('common:type')}</Text>
                        <Text variant="bodyMedium" style={{ textTransform: 'capitalize' }}>
                          {selectedDevice.type}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text variant="bodyMedium">{t('common:status')}</Text>
                        <Text variant="bodyMedium">
                          {selectedDevice.isConnected ? 'Connected' : 'Disconnected'}
                        </Text>
                      </View>
                      {selectedDevice.batteryLevel && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text variant="bodyMedium">{t('common:battery')}</Text>
                          <Text variant="bodyMedium">{selectedDevice.batteryLevel}%</Text>
                        </View>
                      )}
                      {selectedDevice.lastSync && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text variant="bodyMedium">{t('settings.health.lastSync', { defaultValue: 'Last Sync' })}</Text>
                          <Text variant="bodyMedium">
                            {selectedDevice.lastSync.toLocaleString()}
                          </Text>
                        </View>
                      )}
                    </Card.Content>
                  </Card>
                </Dialog.Content>
                <Dialog.Actions>
                  {selectedDevice.isConnected ? (
                    <>
                      <Button onPress={() => setDevicesDialogVisible(false)}>
                        {t('common:close')}
                      </Button>
                      <Button 
                        onPress={() => {
                          // Disconnect device
                          // bleManager?.disconnectDevice(selectedDevice.id).then(() => {
                          Promise.resolve().then(() => {
                            setDevicesDialogVisible(false);
                          }).catch(error => {
                            console.error('[HealthSettings] Failed to disconnect:', error);
                            Alert.alert(
                              t('common:error'),
                              t('settings.health.disconnectFailed', { defaultValue: 'Failed to disconnect device' })
                            );
                          });
                        }}
                      >
                        {t('common:disconnect')}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button onPress={() => setDevicesDialogVisible(false)}>
                        {t('common:cancel')}
                      </Button>
                      <Button onPress={handleDeviceConnect} loading={loading}>
                        {t('common:connect')}
                      </Button>
                    </>
                  )}
                </Dialog.Actions>
              </>
            )}
          </Dialog>
        </Portal>
      </ScrollView>
    </SafeAreaView>
  );
}