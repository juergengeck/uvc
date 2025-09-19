import React, { useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@src/providers/app/AppTheme';
import { Button, Text, List, Switch, TextInput, HelperText } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDeviceSettings } from '@src/hooks/useDeviceSettings';
import { useNetworkSettings } from '@src/hooks/useNetworkSettings';

/**
 * Network Discovery Settings Screen
 * 
 * Dedicated view for device discovery configuration
 */
export default function NetworkDiscoveryScreen() {
  const { t } = useTranslation();
  const { theme, styles: themedStyles } = useTheme();
  
  // Use network settings hook
  const {
    discoveryEnabled,
    autoConnectEnabled,
    toggleDiscovery,
    toggleAutoConnect,
  } = useNetworkSettings();
  
  // Use device settings for additional device-specific settings
  const { 
    deviceSettings,
    updateDeviceSettings,
    setDiscoveryPort,
    toggleAddOnlyConnectedDevices
  } = useDeviceSettings();
  
  // Local state for broadcast interval input
  const [broadcastInterval, setBroadcastInterval] = useState(
    (deviceSettings.discoveryBroadcastInterval || 5000).toString()
  );
  const [intervalError, setIntervalError] = useState('');
  
  // Handle broadcast interval change
  const handleIntervalChange = (text: string) => {
    setBroadcastInterval(text);
    setIntervalError('');
    
    // Validate input
    const interval = parseInt(text, 10);
    if (isNaN(interval)) {
      setIntervalError(t('settings.network.discovery.interval.error', { defaultValue: 'Please enter a valid number' }));
      return;
    }
    
    if (interval < 1000) {
      setIntervalError(t('settings.network.discovery.interval.tooSmall', { defaultValue: 'Minimum interval is 1000ms (1 second)' }));
      return;
    }
    
    if (interval > 60000) {
      setIntervalError(t('settings.network.discovery.interval.tooLarge', { defaultValue: 'Maximum interval is 60000ms (1 minute)' }));
      return;
    }
    
    // Update settings
    updateDeviceSettings({
      ...deviceSettings,
      discoveryBroadcastInterval: interval
    });
  };
  
  const styles = StyleSheet.create({
    portInfo: {
      padding: 16,
    },
    portText: {
      fontSize: 14,
      color: theme.colors.onSurfaceVariant,
      marginBottom: 16,
    },
    intervalInput: {
      marginBottom: 8,
    },
    intervalHelper: {
      marginBottom: 16,
    },
  });
  
  return (
    <SafeAreaView style={[themedStyles.screenContainer, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      
      <ScrollView 
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Device Discovery Settings */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.network.discovery.title', { defaultValue: 'DEVICE DISCOVERY' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <List.Item
            title={t('settings.network.discovery.enable', { defaultValue: 'Enable Device Discovery' })}
            description={t('settings.network.discovery.enableDescription', { defaultValue: 'Allow discovery of devices on your local network' })}
            style={themedStyles.settingsItem}
            right={() => (
              <Switch
                value={discoveryEnabled}
                onValueChange={toggleDiscovery}
                color={theme.colors.primary}
              />
            )}
          />
          <View style={themedStyles.settingsDivider} />
          <List.Item
            title={t('settings.network.discovery.autoConnect', { defaultValue: 'Auto-Connect Devices' })}
            description={t('settings.network.discovery.autoConnectDescription', { defaultValue: 'Automatically connect to discovered devices' })}
            style={themedStyles.settingsItem}
            right={() => (
              <Switch
                value={autoConnectEnabled}
                onValueChange={toggleAutoConnect}
                color={theme.colors.primary}
              />
            )}
          />
          <View style={themedStyles.settingsDivider} />
          <List.Item
            title={t('settings.network.discovery.addOnlyConnected', { defaultValue: 'Add Only Connected Devices' })}
            description={t('settings.network.discovery.addOnlyConnectedDescription', { defaultValue: 'Only add devices that are currently connected' })}
            style={[themedStyles.settingsItem, themedStyles.settingsItemLast]}
            right={() => (
              <Switch
                value={deviceSettings.addOnlyConnectedDevices}
                onValueChange={toggleAddOnlyConnectedDevices}
                color={theme.colors.primary}
              />
            )}
          />
        </View>
        
        {/* Discovery Broadcast Interval Settings */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.network.discovery.broadcast.title', { defaultValue: 'BROADCAST SETTINGS' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <View style={styles.portInfo}>
            <Text style={styles.portText}>
              {t('settings.network.discovery.interval.title', { defaultValue: 'Discovery Broadcast Interval (milliseconds)' })}
            </Text>
            <TextInput
              value={broadcastInterval}
              onChangeText={handleIntervalChange}
              keyboardType="numeric"
              mode="outlined"
              placeholder="5000"
              style={styles.intervalInput}
              error={!!intervalError}
            />
            {intervalError ? (
              <HelperText type="error" visible={true} style={styles.intervalHelper}>
                {intervalError}
              </HelperText>
            ) : (
              <HelperText type="info" visible={true} style={styles.intervalHelper}>
                {t('settings.network.discovery.interval.help', { 
                  defaultValue: 'How often the app broadcasts its presence (1000-60000ms)' 
                })}
              </HelperText>
            )}
            <Button
              mode="contained"
              onPress={() => handleIntervalChange('5000')}
              style={themedStyles.buttonPrimary}
              labelStyle={themedStyles.buttonPrimaryText}
            >
              {t('settings.network.discovery.interval.reset', { defaultValue: 'Reset to Default (5000ms)' })}
            </Button>
          </View>
        </View>
        
        {/* Discovery Port Settings */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.network.discovery.port.title', { defaultValue: 'DISCOVERY PORT' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <View style={styles.portInfo}>
            <Text style={styles.portText}>
              {t('settings.network.discovery.port.current', { defaultValue: 'Current port' })}: {deviceSettings.discoveryPort}
            </Text>
            <Button
              mode="contained"
              onPress={() => setDiscoveryPort(49497)}
              style={themedStyles.buttonPrimary}
              labelStyle={themedStyles.buttonPrimaryText}
            >
              {t('settings.network.discovery.port.reset', { defaultValue: 'Reset to Default (49497)' })}
            </Button>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}