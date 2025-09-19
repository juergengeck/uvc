import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Appbar, Surface, Text, useTheme, Avatar, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Namespaces } from '@src/i18n/namespaces';

interface MessagesHeaderProps {
  onSettingsPress?: () => void;
  onNewMessage?: () => void;
}

export const MessagesHeader = ({ 
  onSettingsPress, 
  onNewMessage 
}: MessagesHeaderProps) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation(Namespaces.MESSAGES);

  return (
    <Surface 
      style={[
        styles.header, 
        { 
          paddingTop: insets.top,
          backgroundColor: 'transparent',
        }
      ]} 
      elevation={0}
    >
      <Appbar.Header 
        style={[styles.appbar, { backgroundColor: 'transparent' }]} 
        mode="center-aligned"
      >
        <View style={styles.titleContainer}>
          <Text variant="headlineSmall" style={styles.title}>
            {t('title', { defaultValue: 'Messages' })}
          </Text>
        </View>
        
        <View style={styles.actions}>
          {onNewMessage && (
            <IconButton
              icon="plus"
              size={24}
              onPress={onNewMessage}
              style={styles.iconButton}
            />
          )}
          
          {onSettingsPress && (
            <IconButton
              icon="cog"
              size={24}
              onPress={onSettingsPress}
              style={styles.iconButton}
            />
          )}
        </View>
      </Appbar.Header>
    </Surface>
  );
};

const styles = StyleSheet.create({
  header: {
    width: '100%',
    borderBottomWidth: 0,
  },
  appbar: {
    backgroundColor: 'transparent',
    height: 56,
    elevation: 0,
  },
  titleContainer: {
    flex: 1,
    marginLeft: 16,
  },
  title: {
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    margin: 0,
  }
}); 