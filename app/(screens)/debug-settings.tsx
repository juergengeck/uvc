/**
 * Debug Settings Screen
 * 
 * Provides interface for debug tools and developer options.
 * Only visible in development mode.
 */

import React from 'react';
import { ScrollView, View } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@src/providers/app/AppTheme';
import { DebugTools } from '@src/components/settings/DebugTools';
import { BTLETestSection } from '@src/components/settings/BTLETestSection';

export default function DebugSettingsScreen() {
  const { styles: themedStyles } = useTheme();
  const router = useRouter();
  const { t } = useTranslation('settings');

  if (!__DEV__) {
    // Redirect to settings if not in dev mode
    router.replace('/(screens)/settings');
    return null;
  }

  return (
    <SafeAreaView style={[themedStyles.screenContainer, { backgroundColor: 'transparent' }]} edges={['top']}>
      {/* Custom Header */}
      <View style={{ 
        flexDirection: 'row', 
        alignItems: 'center',
        paddingHorizontal: 16, 
        paddingVertical: 8,
        backgroundColor: 'transparent'
      }}>
        <IconButton
          icon="chevron-left"
          size={24}
          onPress={() => router.back()}
        />
        <Text 
          style={{ 
            flex: 1, 
            fontSize: 20, 
            fontWeight: '600', 
            textAlign: 'center' 
          }}
        >
          Debug Settings
        </Text>
        <View style={{ width: 40 }} />
      </View>
      
      <ScrollView 
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, backgroundColor: 'transparent' }}
        style={{ backgroundColor: 'transparent' }}
      >
        <View style={themedStyles.settingsSection}>
          <DebugTools />
        </View>
        
        {/* BTLE Module Tests */}
        <View style={{ marginTop: 16 }}>
          <BTLETestSection />
        </View>
        
        {/* New BTLE Module Test Screen */}
        <View style={{ marginTop: 16, paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
            New Architecture BTLE Module
          </Text>
          <IconButton
            icon="bluetooth"
            mode="contained"
            size={24}
            onPress={() => router.push('/(screens)/btle-test')}
            style={{ backgroundColor: '#007AFF', borderRadius: 8 }}
            iconColor="white"
          />
          <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
            Test the new one.btle native module
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}