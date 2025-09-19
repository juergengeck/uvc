/**
 * ContactSettings Component
 * 
 * Provides settings related to contact management, including:
 * - Syncing contacts from device address book
 * - Managing contact permissions
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { List, HelperText, Switch, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useInstance } from '@src/providers/app';
import { ContactsManager } from '@src/models/contacts/ContactsManager';
import { AppModel } from '@src/models/AppModel';

export function ContactSettings() {
  const [isLoading, setIsLoading] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const { instance } = useInstance();
  const { t } = useTranslation();
  const theme = useTheme();

  // Load the current sync setting
  useEffect(() => {
    const loadSetting = async () => {
      try {
        if (instance?.propertyTree && typeof instance.propertyTree.getValue === 'function') {
          // This is the standard way settings are accessed in this app
          const value = await instance.propertyTree.getValue('contactsSync');
          if (value) {
            setSyncEnabled(value === 'true');
          }
        }
      } catch (err) {
        console.error('Error loading contacts sync setting:', err);
      }
    };
    
    loadSetting();
  }, [instance]);

  const toggleContactSync = useCallback(async () => {
    if (!instance?.leuteModel || !instance?.propertyTree) {
      setError(t('contacts:settings.noLeuteModel'));
      return;
    }

    setIsLoading(true);
    setError(null);
    setLastSyncResult(null);

    try {
      // Toggle the sync setting
      const newValue = !syncEnabled;
      setSyncEnabled(newValue);
      
      // Save using setValue which is consistently used throughout the app
      await instance.propertyTree.setValue('contactsSync', newValue.toString());
      
      if (newValue) {
        // If enabling sync, perform initial sync
        const contactsManager = new ContactsManager(instance.leuteModel, instance as unknown as AppModel);
        
        // Check permission first
        const hasPermission = await contactsManager.checkPermission();
        if (!hasPermission) {
          const gotPermission = await contactsManager.requestPermission();
          if (!gotPermission) {
            console.warn('[ContactSettings] Failed to get contacts permission');
            // Update the UI to show permission was denied
            setError('Permission to access contacts was denied');
            await instance.propertyTree.setValue('contactsSync', 'false');
            setSyncEnabled(false);
            return;
          }
        }
        
        // Import contacts
        const importCount = await contactsManager.importDeviceContacts();
        
        // Show result
        setLastSyncResult(t('contacts:settings.syncSuccess', { count: importCount }));
      }
    } catch (err) {
      console.error('Error managing contacts sync:', err);
      setError(t('contacts:settings.syncError'));
      
      // Revert the UI state on error
      setSyncEnabled(!syncEnabled);
    } finally {
      setIsLoading(false);
    }
  }, [instance, t, syncEnabled]);

  return (
    <View>
      <List.Item
        title={t('contacts:settings.syncDeviceContacts')}
        description={t('contacts:settings.syncDescription')}
        onPress={() => !isLoading && toggleContactSync()}
        right={props => (
          <Switch
            {...props}
            value={syncEnabled}
            onValueChange={toggleContactSync}
            disabled={isLoading || !instance?.leuteModel}
            color={theme.colors.primary}
          />
        )}
      />
      
      {error && (
        <HelperText type="error" style={styles.message}>
          {error}
        </HelperText>
      )}
      
      {lastSyncResult && (
        <HelperText type="info" style={[styles.message, { color: theme.colors.primary }]}>
          {lastSyncResult}
        </HelperText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  message: {
    paddingHorizontal: 16,
    marginTop: 4,
  },
}); 