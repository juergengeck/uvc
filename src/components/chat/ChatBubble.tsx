/**
 * ChatBubble Component
 * 
 * Mobile version of one.leute's ChatBubble component.
 * Uses react-native-paper components instead of MUI.
 */

import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { Text, Button, useTheme, Portal, Dialog } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import Markdown from 'react-native-markdown-display';

/**
 * Helper function for format hh:mm DD.MM.YYYY
 */
function getCustomDateString(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${hours}:${minutes} ${day}.${month}.${year}`;
}

interface ChatBubbleProps {
  /**
   * Message timestamp
   */
  date: Date;
  
  /**
   * Whether this is an outgoing message (sent by the user)
   */
  isOutgoing: boolean;
  
  /**
   * Sender name (optional for outgoing messages)
   */
  sender?: string;
  
  /**
   * Message content
   */
  message?: string;
  
  /**
   * Attachment views (optional)
   */
  attachmentsViews?: React.ReactElement[];
  
  /**
   * Callback when message details button is clicked
   */
  onMessageDetailsClicked?: () => void;
}

/**
 * Message content component with expandable view
 */
function Message({ children }: { children?: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const theme = useTheme();

  if (!children) return null;

  return (
    <>
      <TouchableOpacity onPress={() => setIsExpanded(true)}>
        <Markdown style={markdownStyles}>
          {children}
        </Markdown>
      </TouchableOpacity>

      <Portal>
        <Dialog
          visible={isExpanded}
          onDismiss={() => setIsExpanded(false)}
          style={[styles.expandedDialog, { backgroundColor: theme.colors.background }]}
        >
          <Dialog.ScrollArea>
            <Markdown style={markdownStyles}>
              {children}
            </Markdown>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setIsExpanded(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

export function ChatBubble({
  date,
  isOutgoing,
  sender,
  message,
  attachmentsViews,
  onMessageDetailsClicked
}: ChatBubbleProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <View style={[
      styles.container,
      isOutgoing ? styles.outgoing : styles.incoming,
    ]}>
      <View style={[
        styles.bubble,
        {
          backgroundColor: isOutgoing ? theme.colors.primary : theme.colors.surfaceVariant
        }
      ]}>
        <View style={styles.header}>
          {sender ? (
            <View style={styles.senderContainer}>
              <Text 
                variant="labelLarge"
                style={[
                  styles.sender,
                  { color: isOutgoing ? theme.colors.onPrimary : theme.colors.onSurfaceVariant }
                ]}
              >
                {sender}
              </Text>
              <Text 
                variant="labelSmall"
                style={[
                  styles.timestamp,
                  { color: isOutgoing ? theme.colors.onPrimary : theme.colors.onSurfaceVariant }
                ]}
              >
                {getCustomDateString(date)}
              </Text>
            </View>
          ) : (
            <Text 
              variant="labelSmall"
              style={[
                styles.timestamp,
                { color: isOutgoing ? theme.colors.onPrimary : theme.colors.onSurfaceVariant }
              ]}
            >
              {getCustomDateString(date)}
            </Text>
          )}
        </View>

        {message && (
          <View style={styles.messageContent}>
            <Message>{message}</Message>
          </View>
        )}

        {(!attachmentsViews || attachmentsViews.length === 0) && onMessageDetailsClicked && (
          <Button
            mode="text"
            onPress={onMessageDetailsClicked}
            textColor={isOutgoing ? theme.colors.onPrimary : theme.colors.onSurfaceVariant}
          >
            {t('chat.viewCertificates')}
          </Button>
        )}

        {attachmentsViews && attachmentsViews.length > 0 && (
          <View style={styles.attachments}>
            {attachmentsViews}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 8,
    maxWidth: '80%',
  },
  outgoing: {
    alignSelf: 'flex-end',
  },
  incoming: {
    alignSelf: 'flex-start',
  },
  bubble: {
    borderRadius: 16,
    padding: 12,
    minWidth: 100,
  },
  header: {
    marginBottom: 4,
  },
  senderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sender: {
    marginRight: 8,
  },
  timestamp: {
    opacity: 0.7,
  },
  messageContent: {
    marginVertical: 4,
  },
  attachments: {
    marginTop: 8,
  },
  expandedDialog: {
    maxHeight: '80%',
  },
});

const markdownStyles = {
  body: {
    color: 'inherit',
  },
  code_inline: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    padding: 2,
    borderRadius: 4,
  },
  code_block: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    padding: 8,
    borderRadius: 4,
  },
  fence: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    padding: 8,
    borderRadius: 4,
  },
  link: {
    color: 'inherit',
    textDecorationLine: 'underline' as const,
  },
  list_item: {
    marginVertical: 2,
  },
  bullet_list: {
    marginVertical: 4,
  },
  ordered_list: {
    marginVertical: 4,
  },
} as const; 