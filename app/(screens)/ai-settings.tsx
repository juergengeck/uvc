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
import { useSettings } from '@src/providers/app/SettingsProvider';
import { AISettings } from '@src/components/settings/AISettings';
import { AIModelSettings } from '@src/components/settings/AIModelSettings';
import { useTheme } from '@src/providers/app/AppTheme';

export default function AISettingsScreen() {
  const { t } = useTranslation('settings');
  const router = useRouter();
  const { theme, styles: themedStyles } = useTheme();
  const { 
    providerConfigs,
    summaryConfig,
    updateProvider,
    updateSummary,
    importSettings,
    isLoading,
    error
  } = useSettings();

  return (
    <SafeAreaView style={[themedStyles.screenContainer, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <ScrollView 
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        <AISettings
          providerConfigs={providerConfigs}
          summaryConfig={summaryConfig}
          onUpdateProvider={updateProvider}
          onUpdateSummary={updateSummary}
          onImportSettings={importSettings}
          loading={isLoading}
          error={error || undefined}
        />
        
        {/* AI Models Section */}
        <AIModelSettings />
      </ScrollView>
    </SafeAreaView>
  );
} 