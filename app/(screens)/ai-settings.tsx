/**
 * AI Settings Screen
 * 
 * Provides interface for configuring AI providers and settings.
 */

import React from 'react';
import { ScrollView, View } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AIModelSettings } from '@src/components/settings/AIModelSettings';
import { useTheme } from '@src/providers/app/AppTheme';

export default function AISettingsScreen() {
  const { t } = useTranslation('settings');
  const router = useRouter();
  const { theme, styles: themedStyles } = useTheme();
  return (
    <SafeAreaView style={[themedStyles.screenContainer, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <ScrollView 
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <AIModelSettings />
      </ScrollView>
    </SafeAreaView>
  );
}
