import React from 'react';
import { View, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@src/providers/app/AppTheme';
import { List, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Network Settings Main Screen
 * 
 * Provides navigation to all network-related settings
 */
export default function NetworkSettingsScreen() {
  const { t } = useTranslation();
  const { theme, styles: themedStyles } = useTheme();
  const router = useRouter();
  
  return (
    <SafeAreaView style={[themedStyles.screenContainer, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      
      <ScrollView 
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {/* Discovery Section */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.network.discovery.title', { defaultValue: 'DISCOVERY' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <List.Item
            title={t('settings.network.discovery.deviceDiscovery', { defaultValue: 'Device Discovery' })}
            description={t('settings.network.discovery.deviceDiscoveryDescription', { defaultValue: 'Configure device discovery and auto-connect' })}
            onPress={() => router.push('/(screens)/network/discovery')}
            style={themedStyles.settingsItem}
            left={props => <List.Icon {...props} icon="radar" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
          />
          <View style={themedStyles.settingsDivider} />
          <List.Item
            title={t('settings.network.devices.title', { defaultValue: 'Discovered Devices' })}
            description={t('settings.network.devices.description', { defaultValue: 'View and manage discovered devices' })}
            onPress={() => router.push('/(screens)/network/devices')}
            style={[themedStyles.settingsItem, themedStyles.settingsItemLast]}
            left={props => <List.Icon {...props} icon="devices" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
          />
        </View>
        
        {/* Connections Section */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.network.connections.title', { defaultValue: 'CONNECTIONS' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <List.Item
            title={t('settings.network.connections.management', { defaultValue: 'Connection Management' })}
            description={t('settings.network.connections.managementDescription', { defaultValue: 'Manage devices, invitations, and contacts' })}
            onPress={() => router.push('/(screens)/network/connection')}
            style={themedStyles.settingsItem}
            left={props => <List.Icon {...props} icon="link" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
          />
        </View>
        
        {/* Advanced Section */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.network.advanced.title', { defaultValue: 'ADVANCED' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <List.Item
            title={t('settings.network.advanced.settings', { defaultValue: 'Advanced Settings' })}
            description={t('settings.network.advanced.settingsDescription', { defaultValue: 'CommServer URL and advanced network options' })}
            onPress={() => router.push('/(screens)/network/advanced')}
            style={[themedStyles.settingsItem, themedStyles.settingsItemLast]}
            left={props => <List.Icon {...props} icon="cog" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}