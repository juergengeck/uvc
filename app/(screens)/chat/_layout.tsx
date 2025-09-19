import React from 'react';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'react-native-paper';

/**
 * Layout component for chat routes
 * Handles common configuration and navigation structure
 */
export default function ChatLayout() {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false, // Hide all Stack headers by default
        headerStyle: {
          backgroundColor: theme.colors.background,
        },
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="new"
        options={{
          headerShown: false,
        }}
      />
      {/* Add a catch-all route as a fallback for any missing routes */}
      <Stack.Screen
        name="[...rest]"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
} 