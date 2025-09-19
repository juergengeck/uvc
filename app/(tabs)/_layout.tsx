import React from 'react';
import { Tabs, useRouter, Redirect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, IconButton } from 'react-native-paper';
import { Namespaces } from '@src/i18n/namespaces';
import { View } from 'react-native';
import { getAuthenticator } from '@src/initialization';

console.log('=== LOADING TABS LAYOUT ===');

export default function TabsLayout() {
  const { t } = useTranslation(Namespaces.NAVIGATION);
  const theme = useTheme();
  const router = useRouter();
  
  // Get authenticator - it should already exist and be logged in
  // since index.tsx only redirects here when logged_in
  const authenticator = getAuthenticator();
  
  // This should never happen if routing is working correctly
  if (!authenticator) {
    console.error('[TabsLayout] No authenticator found - this should not happen');
    return <Redirect href="/(auth)" />;
  }
  
  // Once ready, render tabs without OneProvider (already wrapped in _layout.tsx)
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Tabs 
        screenOptions={{ 
          headerStyle: {
            backgroundColor: theme.colors.background,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 0,
            height: 120, // Increase header height to accommodate larger title and padding
          },
          headerTitleStyle: {
            fontWeight: 'bold',
            fontSize: 34, // Large Apple-style title
            color: theme.colors.onBackground,
            textAlign: 'left', // Apple-style left alignment
            marginLeft: 16, // Standard padding from theme
            alignSelf: 'flex-start', // Force left alignment
            marginTop: 8, // Add some top margin
            paddingBottom: 16, // Add 16px padding below the title
          },
          headerTitleAlign: 'left', // Expo Router specific left alignment
          headerShadowVisible: false,
          headerTitleContainerStyle: {
            left: 0, // Align title container to the left
            right: 60, // Leave space for the header buttons
          },
          headerRight: () => (
            <IconButton
              icon="cog"
              size={24}
              onPress={() => router.push('/(screens)/settings')}
              iconColor={theme.colors.primary}
              style={{ marginRight: 8 }}
            />
          ),
          tabBarStyle: {
            backgroundColor: theme.colors.background,
            borderTopColor: theme.colors.outline,
          },
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.onSurface,
        }}
      >
        <Tabs.Screen 
          name="home" 
          options={{
            title: t('navigation:home.title', { defaultValue: 'Home' }),
            tabBarLabel: 'Home',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="home" size={size} color={theme.colors.primary} />
            ),
            headerTitleContainerStyle: {
              left: 0, // Align title container to the left
              right: 100, // Leave space for both QR code and settings buttons
            },
            headerRight: () => (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <IconButton
                  icon="qrcode"
                  size={24}
                  onPress={() => router.push('/(screens)/network/connection')}
                  iconColor={theme.colors.primary}
                  style={{ marginRight: 4 }}
                />
                <IconButton
                  icon="cog"
                  size={24}
                  onPress={() => router.push('/(screens)/settings')}
                  iconColor={theme.colors.primary}
                  style={{ marginRight: 8 }}
                />
              </View>
            ),
          }}
        />
        <Tabs.Screen 
          name="messages" 
          options={{
            tabBarLabel: 'Messages',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="message" size={size} color={theme.colors.primary} />
            ),
            title: t('navigation:messages.title', { defaultValue: 'Messages' }),
            headerRight: () => (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <IconButton
                  icon="account-plus"
                  size={24}
                  onPress={() => router.push('/(screens)/contacts/invite')}
                  iconColor={theme.colors.primary}
                />
                <IconButton
                  icon="cog"
                  size={24}
                  onPress={() => router.push('/(screens)/settings')}
                  iconColor={theme.colors.primary}
                  style={{ marginLeft: 8, marginRight: 8 }}
                />
              </View>
            ),
          }}
        />
        <Tabs.Screen 
          name="journal" 
          options={{
            title: t('navigation:journal.title', { defaultValue: 'Journal' }),
            tabBarLabel: 'Journal',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="notebook" size={size} color={theme.colors.primary} />
            ),
            headerRight: () => (
              <View style={{ flexDirection: 'row', marginRight: 8 }}>
                <IconButton
                  icon="home"
                  size={24}
                  iconColor={theme.colors.primary}
                  onPress={() => router.push('/(tabs)/')}
                  style={{ margin: 0, marginRight: 8 }}
                />
                <IconButton
                  icon="calendar"
                  size={24}
                  iconColor={theme.colors.primary}
                  onPress={() => router.push('/(screens)/calendar')}
                  style={{ margin: 0 }}
                />
              </View>
            ),
          }}
        />
        <Tabs.Screen 
          name="contacts" 
          options={{
            title: t('navigation:devices.title', { defaultValue: 'Devices' }),
            tabBarLabel: 'Devices',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="devices" size={size} color={theme.colors.primary} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
} 