/**
 * Settings Screen Component
 * 
 * Displays and manages user settings including:
 * - Profile management
 * - Appearance settings (dark mode)
 * - Language selection
 * - Model management (local LLM)
 * - Data management
 * - Account actions (logout, reset)
 * 
 * @note The logout functionality triggers a system-level logout event.
 * This should only be used when explicitly requested by the user.
 * 
 * @note The reset functionality includes a two-step verification:
 * 1. Shows a random 4-letter PIN
 * 2. Requires user to enter the PIN to confirm
 * This prevents accidental data loss.
 * 
 * @warning Reset operation will:
 * - Log out the current user
 * - Close the current instance
 * - Delete all local data
 * - Redirect to login screen
 * 
 * Based on one.leute settings implementation.
 */

import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert, Platform, NativeModules } from 'react-native';
import { Text, IconButton, List, Switch, Portal, Dialog, TextInput, HelperText, Button, useTheme } from 'react-native-paper';
import { Stack, useRouter } from 'expo-router';
import { useInstance } from '@src/providers/app/useInstance';
import { useTranslation } from 'react-i18next';
import { useTheme as useAppTheme } from '@src/providers/app/AppTheme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createThemedStyles } from '@src/constants/ThemeStyles';
import { logout, deleteAllAppData } from '@src/initialization';

// Components
import { LanguageSelector } from '@src/components/settings/LanguageSelector';

// Hooks
import { useSettings } from '@src/providers/app/SettingsProvider';

/**
 * Settings screen component that manages all app settings and user preferences
 * 
 * @returns {JSX.Element} Settings screen component
 */
export default function SettingsScreen() {
  const { t } = useTranslation('settings');
  const tCommon = useTranslation('common').t;
  const router = useRouter();
  const { theme, styles: themedStyles, isDarkMode, toggleTheme } = useAppTheme();
  const { language, setLanguage, isLoading, error } = useSettings();

  // Debug output
  console.log('[Settings] Translation namespace:', 'settings');
  console.log('[Settings] Raw keys:', {
    title: t('settings.title'),
    languageTitle: t('settings.language.title'),
    appearanceTitle: t('settings.appearance.title'),
    aiTitle: t('settings.ai.title'),
    aiModelsTitle: t('settings.ai.models.title')
  });
  
  // Debug AIModelSettings section
  console.log('[Settings] Rendering AI Models section');


  // Reset PIN state
  const [pinDialogVisible, setPinDialogVisible] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [currentPin, setCurrentPin] = useState('');

  // Generate random 4-letter PIN
  const generatePin = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let pin = '';
    for (let i = 0; i < 4; i++) {
      pin += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pin;
  };

  /**
   * Handles the app reset process with PIN verification
   * 
   * @note This is a destructive operation that will delete all user data
   * @warning This operation cannot be undone
   */
  const handleReset = useCallback(() => {
    const pin = generatePin();
    setCurrentPin(pin);
    setPinInput('');
    setPinDialogVisible(true);
    Alert.alert(
      t('resetTitle'),
      t('resetMessage', { pin })
    );
  }, [t]);

  /**
   * Handles the logout process
   * 
   * @note This is a system-level operation that should be used with caution
   * @warning Does not clean up local data - use reset for full cleanup
   */
  const handleLogout = useCallback(async () => {
    try {
      // Don't navigate immediately - let logout complete first
      await logout();
      // The authenticator will handle navigation after cleanup
    } catch (error) {
      console.error('[Settings] Logout failed:', error);
      Alert.alert(
        t('settings.user.logout'),
        t('settings.user.logout')
      );
    }
  }, [t]);

  const handlePinConfirm = useCallback(async () => {
    if (pinInput === currentPin) {
      setPinDialogVisible(false);
      
      // Show progress alert
      Alert.alert(
        t('settings.user.reset', { defaultValue: 'Reset Account' }),
        t('resetInProgress', { defaultValue: 'Resetting app data...' }),
        [],
        { cancelable: false }
      );
      
      // Small delay to show the alert
      await new Promise(resolve => setTimeout(resolve, 500));
      
      try {
        // Use the comprehensive data deletion function
        await deleteAllAppData();
        
        // Reload the app after a brief delay
        setTimeout(() => {
          if (NativeModules.DevSettings) {
            NativeModules.DevSettings.reload();
          } else {
            // Fallback: show manual restart message
            Alert.alert(
              t('settings.user.reset', { defaultValue: 'Reset Complete' }),
              t('resetComplete', { defaultValue: 'Please close and restart the app to complete the reset.' })
            );
          }
        }, 100);
      } catch (error) {
        console.error('[Settings] Reset had errors:', error);
        Alert.alert(
          t('settings.user.reset', { defaultValue: 'Reset Account' }),
          t('resetFailed', { defaultValue: 'Reset failed. Please try again.' })
        );
      }
    } else {
      Alert.alert(
        t('settings.user.reset', { defaultValue: 'Reset Account' }),
        t('wrongPin', { defaultValue: 'Incorrect PIN' })
      );
    }
  }, [currentPin, pinInput, t]);

  if (!theme) {
    return null;
  }

  return (
    <SafeAreaView style={[themedStyles.screenContainer, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <ScrollView 
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {error && (
          <HelperText type="error" style={themedStyles.error}>
            {error}
          </HelperText>
        )}

        {/* Appearance Settings */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.appearance.title').toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <List.Item
            title={t('settings.appearance.darkMode.title')}
            description={t('settings.appearance.darkMode.description')}
            style={themedStyles.settingsItem}
            right={() => (
              <Switch
                value={isDarkMode}
                onValueChange={toggleTheme}
                disabled={isLoading}
                color={theme.colors.primary}
              />
            )}
          />
        </View>

        {/* Language Settings */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.language.title').toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <LanguageSelector
            selectedLanguage={language}
            onLanguageChange={setLanguage}
            isLoading={isLoading}
          />
        </View>

        {/* Contacts Settings */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('contacts:settings.title').toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <List.Item
            title={t('contacts:settings.syncContacts', { defaultValue: 'Device Contact Sync' })}
            description={t('contacts:settings.syncDescription', { defaultValue: 'Sync contacts from your device' })}
            onPress={() => {/* TODO: Implement contact sync settings */}}
            left={props => <List.Icon {...props} icon="sync" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
          />
        </View>

        {/* Health Settings */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.health.title', { defaultValue: 'HEALTH' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <List.Item
            title={t('settings.health.title', { defaultValue: 'Health Data' })}
            description={t('settings.health.description', { defaultValue: 'Apple Health and device integrations' })}
            onPress={() => router.push('/(screens)/health-settings')}
            left={props => <List.Icon {...props} icon="heart-pulse" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
          />
        </View>

        {/* Network Settings */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.network.title', { defaultValue: 'NETWORK' }).toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <List.Item
            title={t('settings.network.title', { defaultValue: 'Network' })}
            description={t('settings.network.description', { defaultValue: 'Connection and discovery settings' })}
            onPress={() => router.push('/(screens)/network')}
            left={props => <List.Icon {...props} icon="wifi" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
          />
        </View>

        {/* AI Settings */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.ai.title').toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <List.Item
            title={t('settings.ai.title')}
            description={t('settings.ai.description', { defaultValue: 'AI providers and models' })}
            onPress={() => router.push('/(screens)/ai-settings')}
            left={props => <List.Icon {...props} icon="robot" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
          />
        </View>

        {/* Data Management */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.dataManagement.title').toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <List.Item
            title={t('settings.dataManagement.export.title')}
            description={t('settings.dataManagement.export.description')}
            onPress={() => router.push('/(screens)/data-management')}
            left={props => <List.Icon {...props} icon="database-export" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
          />
        </View>

        {/* Debug Tools (DEV MODE ONLY) */}
        {__DEV__ && (
          <>
            <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
              DEBUG TOOLS (DEV ONLY)
            </Text>
            <View style={themedStyles.settingsSection}>
              <List.Item
                title="Debug Tools"
                description="Developer tools and diagnostics"
                onPress={() => router.push('/(screens)/debug-settings')}
                left={props => <List.Icon {...props} icon="bug" />}
                right={props => <List.Icon {...props} icon="chevron-right" />}
              />
            </View>
          </>
        )}

        {/* User Actions */}
        <Text variant="bodySmall" style={themedStyles.settingsSectionTitle}>
          {t('settings.user.title').toUpperCase()}
        </Text>
        <View style={themedStyles.settingsSection}>
          <List.Item
            title={t('settings.user.logout')}
            description={t('settings.user.logoutDescription', { defaultValue: 'Sign out of your account' })}
            onPress={handleLogout}
            left={props => <List.Icon {...props} icon="logout" />}
          />
          <List.Item
            title={t('settings.user.reset')}
            description={t('settings.user.resetDescription', { defaultValue: 'Delete all data and start fresh' })}
            onPress={handleReset}
            left={props => <List.Icon {...props} icon="delete" />}
          />
        </View>

        {/* Reset PIN Dialog */}
        <Portal>
          <Dialog visible={pinDialogVisible} onDismiss={() => setPinDialogVisible(false)}>
            <Dialog.Title>{t('resetPin.title', { defaultValue: 'Confirm Reset' })}</Dialog.Title>
            <Dialog.Content>
              <Text style={{ marginBottom: 16 }}>
                {t('resetPin.enterPinMessage', { defaultValue: 'Please enter the PIN shown above' })}
              </Text>
              <TextInput
                mode="outlined"
                label={t('resetPin.enterPin', { defaultValue: 'Enter PIN' })}
                value={pinInput}
                onChangeText={setPinInput}
                autoCapitalize="characters"
                maxLength={4}
                autoFocus
              />
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setPinDialogVisible(false)}>{tCommon('cancel', { defaultValue: 'Cancel' })}</Button>
              <Button onPress={handlePinConfirm}>{tCommon('confirm', { defaultValue: 'Confirm' })}</Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      </ScrollView>
    </SafeAreaView>
  );
} 