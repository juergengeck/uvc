import React from 'react';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { IconButton } from 'react-native-paper';
import { useTheme } from '@src/providers/app/AppTheme';

export default function ChatIdLayout() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const router = useRouter();

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.colors.background,
        },
        headerTitleStyle: {
          fontWeight: '600',
          color: theme.colors.onBackground,
        },
        headerTintColor: theme.colors.onBackground,
        headerShadowVisible: false,
        headerBackVisible: false,
        contentStyle: {
          backgroundColor: theme.colors.background,
        },
        headerLeft: () => (
          <IconButton
            icon="arrow-left"
            onPress={() => router.back()}
            size={24}
            iconColor={theme.colors.onBackground}
            style={{ margin: 0 }}
          />
        ),
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="info"
        options={{
          headerShown: true,
          presentation: 'card',
        }}
      />
    </Stack>
  );
}