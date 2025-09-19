import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { List, Switch, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage key for the chain info visibility setting
const CHAIN_INFO_VISIBLE_KEY = 'chat_chain_info_visible';

/**
 * Chat settings component
 * Allows users to configure chat-related settings such as:
 * - Secure message chain info visibility
 */
export function ChatSettings() {
  const { t } = useTranslation('settings');
  const theme = useTheme();
  
  // State for managing the chain info visibility setting
  const [chainInfoVisible, setChainInfoVisible] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  
  // Load chain info visibility setting on mount
  useEffect(() => {
    const loadChainInfoSetting = async () => {
      try {
        const savedValue = await AsyncStorage.getItem(CHAIN_INFO_VISIBLE_KEY);
        // Only set to false if explicitly saved as 'false'
        if (savedValue === 'false') {
          setChainInfoVisible(false);
        }
        setIsLoading(false);
      } catch (error) {
        console.error('[ChatSettings] Error loading chain info setting:', error);
        setIsLoading(false);
      }
    };
    
    loadChainInfoSetting();
  }, []);
  
  // Toggle chain info visibility and save the setting
  const toggleChainInfoVisible = async (value: boolean) => {
    try {
      setChainInfoVisible(value);
      await AsyncStorage.setItem(CHAIN_INFO_VISIBLE_KEY, value.toString());
    } catch (error) {
      console.error('[ChatSettings] Error saving chain info setting:', error);
    }
  };
  
  return (
    <View>
      <List.Item
        title={t('settings.chat.secureChain.title', { defaultValue: 'Show Secure Message Chain Info' })}
        description={t('settings.chat.secureChain.description', { defaultValue: 'Display information about the cryptographically signed message chain' })}
        right={() => (
          <Switch
            value={chainInfoVisible}
            onValueChange={toggleChainInfoVisible}
            disabled={isLoading}
            color={theme.colors.primary}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
}); 