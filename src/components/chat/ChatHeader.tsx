/**
 * ChatHeader Component
 * 
 * Header component for the chat screen showing model selection and status.
 * Includes avatar, unread count, and proper participant handling.
 */

import React from 'react';
import { View, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { Appbar, Text, Menu, Surface, useTheme, Avatar, IconButton, Badge } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { LLMUIModel } from '@src/types/llm';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

interface ChatHeaderProps {
  /**
   * Topic name/title
   */
  topicName: string;

  /**
   * Topic description or last message preview
   */
  topicDescription?: string;

  /**
   * Number of participants
   */
  participantCount?: number;

  /**
   * Currently selected model
   */
  selectedModel?: LLMUIModel | null;
  
  /**
   * Available models
   */
  availableModels?: LLMUIModel[];
  
  /**
   * Called when a model is selected
   */
  onModelSelect?: (model: LLMUIModel) => void;
  
  /**
   * Connection status
   */
  status: ConnectionStatus;
  
  /**
   * Called when back button is pressed
   */
  onBack?: () => void;
  
  /**
   * Called when settings button is pressed
   */
  onSettings?: () => void;

  /**
   * Called when topic info is pressed
   */
  onTopicInfoPress?: () => void;

  /**
   * Avatar source for contact/group
   */
  avatarSource?: string | null;

  /**
   * Contact name for avatar fallback
   */
  contactName?: string;

  /**
   * Whether this is a group chat
   */
  isGroupChat?: boolean;

  /**
   * Number of unread messages in other chats
   */
  unreadCount?: number;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  topicName,
  topicDescription,
  participantCount,
  selectedModel,
  availableModels,
  onModelSelect,
  status,
  onBack,
  onSettings,
  onTopicInfoPress,
  avatarSource,
  contactName,
  isGroupChat,
  unreadCount = 0,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [menuVisible, setMenuVisible] = React.useState(false);
  const { t } = useTranslation('settings');
  const tChat = useTranslation('chat').t;
  
  const getStatusIcon = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected':
        return 'antenna';
      case 'connecting':
        return 'antenna-off';
      case 'disconnected':
        return 'antenna-off';
    }
  };

  // Only show participant count for group chats (3+ participants)
  const shouldShowParticipantCount = isGroupChat && participantCount && participantCount >= 3;

  // Get avatar initials from contact name
  const getAvatarLabel = (name?: string) => {
    if (!name || name.trim() === '') return '?';
    
    // Remove any parentheses content first
    const cleanName = name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
    
    // If the name looks like a topic ID (contains hyphens), try to extract a meaningful part
    if (cleanName.includes('-') && !cleanName.includes(' ')) {
      // For IDs like "Qwen3-Embedded-7B", extract "QE"
      const parts = cleanName.split('-').filter(p => p.length > 0);
      if (parts.length >= 2) {
        // Take first letter of first two parts
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
    }
    
    // Split by spaces, hyphens, or underscores
    const words = cleanName.split(/[\s\-_]+/).filter(w => w.length > 0);
    
    if (words.length >= 2) {
      // Use first letter of first and last word
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    } else if (words.length === 1) {
      // For single word, use first two letters
      const word = words[0];
      if (word.length >= 2) {
        return word.substring(0, 2).toUpperCase();
      }
      return word[0].toUpperCase();
    }
    
    // Fallback to first two characters
    return cleanName.substring(0, 2).toUpperCase();
  };

  return (
    <Surface style={[styles.header, { paddingTop: insets.top * 0.1 }]} elevation={0}>
      <Appbar.Header style={styles.appbar} mode="center-aligned">
        {/* Back button */}
        {onBack && (
          <IconButton
            icon="arrow-left"
            size={22}
            onPress={onBack}
            style={styles.backButton}
          />
        )}
        
        {/* Unread count badge */}
        {unreadCount > 0 && (
          <View style={styles.unreadContainer}>
            <Badge
              style={[styles.unreadBadge, { backgroundColor: theme.colors.error }]}
              size={20}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          </View>
        )}
        
        {/* Contact/Group Avatar */}
        <View style={styles.avatarContainer}>
          {avatarSource ? (
            <Avatar.Image 
              source={{ uri: avatarSource }} 
              size={32}
              style={styles.avatar}
            />
          ) : isGroupChat ? (
            <Avatar.Icon 
              icon="account-group" 
              size={32}
              style={[styles.avatar, { backgroundColor: theme.colors.primaryContainer }]}
            />
          ) : (
            <Avatar.Text 
              label={getAvatarLabel(contactName || topicName)} 
              size={32}
              style={[styles.avatar, { backgroundColor: theme.colors.primaryContainer }]}
            />
          )}
        </View>
        
        {/* Topic info */}
        <TouchableOpacity 
          style={styles.topicInfo}
          onPress={onTopicInfoPress}
          disabled={!onTopicInfoPress}
        >
          <View style={styles.topicContainer}>
            <Text variant="titleMedium" numberOfLines={1} ellipsizeMode="tail" style={styles.topicName}>
              {topicName || tChat('title')}
            </Text>
            {topicDescription && (
              <Text variant="bodySmall" numberOfLines={1} style={styles.topicDescription}>
                {topicDescription}
              </Text>
            )}
            {shouldShowParticipantCount && (
              <Text variant="labelSmall" style={styles.participants}>
                {participantCount === 1 
                  ? tChat('participantCount_one', { count: 1, defaultValue: '1 participant' }) 
                  : tChat('participantCount_other', { count: participantCount, defaultValue: `${participantCount} participants` })}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Actions menu */}
        <View style={styles.actions}>
          <Menu
            visible={menuVisible}
            onDismiss={() => setMenuVisible(false)}
            anchor={
              <TouchableOpacity onPress={() => setMenuVisible(true)}>
                <View style={styles.modelStatus}>
                  <Text variant="bodySmall" style={styles.modelName}>
                    {selectedModel?.displayName}
                  </Text>
                  <IconButton
                    icon={getStatusIcon(status)}
                    size={16}
                    style={styles.statusIcon}
                    iconColor={status === 'connected' ? theme.colors.primary : theme.colors.error}
                  />
                </View>
              </TouchableOpacity>
            }
          >
            {availableModels?.map((model) => (
              <Menu.Item
                key={model.id}
                onPress={() => {
                  onModelSelect?.(model);
                  setMenuVisible(false);
                }}
                title={t(model.description)}
                leadingIcon={model.isLocal ? 'laptop' : 'cloud'}
              />
            ))}
          </Menu>
          
          {onSettings && (
            <Appbar.Action icon="cog" onPress={onSettings} />
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
    height: 40,
  },
  backButton: {
    margin: 0,
    padding: 0,
  },
  unreadContainer: {
    marginLeft: 4,
    marginRight: 8,
  },
  unreadBadge: {
    fontSize: 11,
    fontWeight: '600',
  },
  avatarContainer: {
    marginHorizontal: 8,
  },
  avatar: {
    // Avatar styling handled by react-native-paper
  },
  topicInfo: {
    flex: 1,
    marginHorizontal: 8,
    minWidth: 120,
  },
  topicContainer: {
    justifyContent: 'center',
    height: 40,
    paddingVertical: 0,
  },
  topicName: {
    fontWeight: '600',
    fontSize: 16,
    marginTop: -3,
    minHeight: 20,
  },
  topicDescription: {
    fontSize: 12,
  },
  participants: {
    fontSize: 10,
    marginTop: -1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  modelStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
  },
  modelName: {
    fontWeight: '600',
    fontSize: 12,
    marginRight: 4,
  },
  statusIcon: {
    margin: 0,
    padding: 0,
  },
});