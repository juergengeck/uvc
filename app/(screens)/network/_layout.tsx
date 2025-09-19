import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme, IconButton } from 'react-native-paper';

export default function NetworkLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  
  return (
    <Stack
      screenOptions={{
        headerBackTitle: t('settings.network.title', { defaultValue: 'Network' }),
        headerBackTitleVisible: true,
        headerStyle: {
          backgroundColor: theme.colors.background,
        },
        headerTintColor: theme.colors.onSurface,
        headerTitleAlign: 'center',
        headerTitleStyle: {
          fontWeight: '600',
        },
        headerShadowVisible: false,
        headerRight: () => (
          <IconButton
            icon="home"
            onPress={() => router.push('/(tabs)/home')}
            size={24}
            style={{ margin: 0, marginRight: -8 }}
            iconColor={theme.colors.onSurface}
          />
        ),
      }}
    >
      <Stack.Screen 
        name="index" 
        options={{
          title: t('settings.network.title', { defaultValue: 'Network Settings' }),
          headerShown: true,
          headerLeft: () => (
            <IconButton
              icon="arrow-left"
              onPress={() => router.back()}
              size={24}
              style={{ margin: 0, marginLeft: -8 }}
              iconColor={theme.colors.onSurface}
            />
          ),
        }}
      />
      <Stack.Screen 
        name="discovery" 
        options={{
          title: t('settings.network.discovery.deviceDiscovery', { defaultValue: 'Device Discovery' }),
          headerShown: true,
          presentation: 'card',
        }}
      />
      <Stack.Screen 
        name="connection" 
        options={{
          title: t('settings.network.connections.title', { defaultValue: 'Connections' }),
          headerShown: true,
          presentation: 'card',
        }}
      />
      <Stack.Screen 
        name="advanced" 
        options={{
          title: t('settings.network.advanced.settings', { defaultValue: 'Advanced Settings' }),
          headerShown: true,
          presentation: 'card',
        }}
      />
      <Stack.Screen 
        name="diagnostics" 
        options={{
          title: 'Network Diagnostics',
          headerShown: true,
          presentation: 'card',
        }}
      />
    </Stack>
  );
}