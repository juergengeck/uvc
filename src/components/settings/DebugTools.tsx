/**
 * Debug Tools Component
 * 
 * Provides a list of debug and testing tools for developers.
 * Only shown in development mode.
 */

import React from 'react';
import { View } from 'react-native';
import { List } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useTheme } from '@src/providers/app/AppTheme';

export function DebugTools() {
  const router = useRouter();
  const { theme } = useTheme();

  const debugItems = [
    // Network Testing
    {
      title: 'Network Diagnostics',
      description: 'Test connections and monitor network activity',
      icon: 'network-strength-4',
      route: '/(screens)/network/diagnostics',
    },
    {
      title: 'QUICVC Test',
      description: 'Test QUIC with Verifiable Credentials',
      icon: 'rocket',
      route: '/(screens)/network/quicvc-test',
    },
    {
      title: 'QUIC Model Test',
      description: 'Test QUIC transport and UDP sockets',
      icon: 'flash',
      route: '/(screens)/quic-test',
    },
    // Device Management
    {
      title: 'Device Discovery',
      description: 'Manage ESP32 devices and credentials',
      icon: 'devices',
      route: '/(screens)/device-list',
    },
    {
      title: 'UDP Diagnostics',
      description: 'Low-level UDP socket testing',
      icon: 'lan',
      route: '/(screens)/udp-diagnostic',
    },
    // System Tests
    {
      title: 'ESP32 System Tests',
      description: 'Run comprehensive ESP32 tests',
      icon: 'test-tube',
      route: '/(screens)/test-runner',
    },
  ];
  
  return (
    <View>
      {debugItems.map((item, index) => (
        <List.Item
          key={item.route}
          title={item.title}
          description={item.description}
          onPress={() => router.push(item.route as any)}
          left={props => <List.Icon {...props} icon={item.icon} />}
          right={props => <List.Icon {...props} icon="chevron-right" />}
          style={index > 0 ? { borderTopWidth: 1, borderTopColor: theme.colors.outline } : undefined}
        />
      ))}
    </View>
  );
}