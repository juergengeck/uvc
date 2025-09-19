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
    {
      title: 'ESP32 System Tests',
      description: 'Run comprehensive tests for ESP32 and networking',
      icon: 'test-tube',
      route: '/(screens)/test-runner',
    },
    {
      title: 'UDP Diagnostics',
      description: 'Test UDP socket functionality',
      icon: 'lan',
      route: '/(screens)/udp-diagnostic',
    },
    {
      title: 'Network Diagnostics',
      description: 'Network connection and discovery diagnostics',
      icon: 'network-strength-4',
      route: '/(screens)/network/diagnostics',
    },
    {
      title: 'Device Discovery',
      description: 'Manage ESP32 devices and credentials',
      icon: 'devices',
      route: '/(screens)/device-list',
    },
    {
      title: 'QUIC Test',
      description: 'Test QUIC transport functionality',
      icon: 'flash',
      route: '/(screens)/quic-test',
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