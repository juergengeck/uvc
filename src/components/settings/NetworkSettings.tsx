import React from 'react';
import { View, StyleSheet } from 'react-native';
import { List, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { routes } from '../../config/routes';

/**
 * NetworkSettings component
 * Displays network-related settings with links to dedicated views
 */
export function NetworkSettings() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  
  return (
    <View>
      {/* Device Discovery Link */}
      <List.Item
        title="Device Discovery"
        description="Configure device discovery settings"
        left={props => <List.Icon {...props} icon="access-point" />}
        right={props => <List.Icon {...props} icon="chevron-right" />}
        onPress={() => router.push(routes.screens.networkDiscovery)}
      />
      
      {/* Connections Link */}
      <List.Item
        title="Connections"
        description="Manage devices and contacts"
        left={props => <List.Icon {...props} icon="account-network" />}
        right={props => <List.Icon {...props} icon="chevron-right" />}
        onPress={() => router.push(routes.screens.networkConnection)}
      />
      
      {/* Advanced Settings Link */}
      <List.Item
        title="Advanced Settings"
        description="Configure CommServer and advanced options"
        left={props => <List.Icon {...props} icon="cog-outline" />}
        right={props => <List.Icon {...props} icon="chevron-right" />}
        onPress={() => router.push(routes.screens.networkAdvanced)}
      />
      
      {/* Diagnostics Link */}
      <List.Item
        title="Network Diagnostics"
        description="Test network protocols and connectivity"
        left={props => <List.Icon {...props} icon="stethoscope" />}
        right={props => <List.Icon {...props} icon="chevron-right" />}
        onPress={() => router.push(routes.screens.networkDiagnostics)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loader: {
    marginRight: 8
  }
});

export default NetworkSettings; 