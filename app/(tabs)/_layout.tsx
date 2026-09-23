import React from 'react';
import { Tabs, useRouter, Redirect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, IconButton } from 'react-native-paper';
import { Namespaces } from '@src/i18n/namespaces';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { UvcLogo } from '@src/components/brand/UvcLogo';
import { getAuthenticator } from '@src/initialization';

function HeaderBrand() {
  const theme = useTheme();
  return <UvcLogo dark={theme.dark} width={80} />;
}

export default function TabsLayout() {
  const { t } = useTranslation(Namespaces.NAVIGATION);
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const authenticator = getAuthenticator();
  
  // Direct web links can enter a tab before login. Guard the navigator before
  // mounting screens whose model hooks require unlocked user storage.
  if (authenticator?.authState.currentState !== 'logged_in') {
    return <Redirect href="/(auth)/login" />;
  }
  
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Tabs
        initialRouteName="journal"
        screenOptions={{ 
          headerStyle: {
            backgroundColor: theme.colors.background,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 0,
            height: 56 + insets.top,
          },
          headerTitle: HeaderBrand,
          headerTitleAlign: 'left',
          headerShadowVisible: false,
          headerTitleContainerStyle: {
            left: 16,
            right: 64,
          },
          headerRight: () => (
            <IconButton
              icon="cog-outline"
              accessibilityLabel={t('settings', { defaultValue: 'Settings' })}
              size={24}
              onPress={() => router.push('/(screens)/settings')}
              iconColor={theme.colors.primary}
              style={{ height: 48, margin: 0, marginRight: 4, width: 48 }}
            />
          ),
          tabBarStyle: {
            backgroundColor: theme.colors.background,
            borderTopColor: theme.colors.outlineVariant,
            height: 64 + insets.bottom,
            paddingBottom: insets.bottom,
            paddingTop: 6,
          },
          tabBarActiveTintColor: theme.colors.primary,
          tabBarActiveBackgroundColor: theme.colors.primaryContainer,
          tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
          tabBarLabelPosition: 'below-icon',
          tabBarItemStyle: {
            borderRadius: 8,
            marginHorizontal: 4,
            minHeight: 56,
            overflow: 'hidden',
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
          },
        }}
      >
        <Tabs.Screen 
          name="home" 
          options={{
            href: null,
            title: t('navigation:home.title', { defaultValue: 'Home' }),
            tabBarLabel: 'Home',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="home" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen 
          name="messages" 
          options={{
            href: null,
            tabBarLabel: 'Messages',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="message" size={size} color={color} />
            ),
            title: t('navigation:messages.title', { defaultValue: 'Messages' }),
          }}
        />
        <Tabs.Screen 
          name="journal" 
          options={{
            title: t('navigation:journal.title', { defaultValue: 'UVC cycle journal' }),
            tabBarLabel: 'Journal',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="notebook-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: t('calendar', { defaultValue: 'Calendar' }),
            tabBarLabel: t('calendar', { defaultValue: 'Calendar' }),
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="calendar-month-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen 
          name="contacts" 
          options={{
            title: t('navigation:devices.title', { defaultValue: 'Devices' }),
            tabBarLabel: 'Devices',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="access-point" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
} 
