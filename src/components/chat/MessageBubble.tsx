import React from 'react';
import { View, Text, StyleSheet, Platform, TextStyle } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useTheme } from 'react-native-paper';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'seen' | 'error';

export interface MessageBubbleProps {
  /**
   * The message text
   */
  text: string;
  
  /**
   * Whether this is a user message (right) or LLM message (left)
   */
  isUser: boolean;
  
  /**
   * Timestamp of the message
   */
  timestamp: Date;
  
  /**
   * Current status of the message
   */
  status?: MessageStatus;
  
  /**
   * Whether the message contains code/markdown
   */
  isMarkdown?: boolean;
}

export function MessageBubble({ 
  text, 
  isUser, 
  timestamp, 
  status = 'sent',
  isMarkdown = false 
}: MessageBubbleProps) {
  const theme = useTheme();
  
  const bubbleStyle = [
    styles.bubble,
    isUser ? styles.userBubble : styles.llmBubble,
    {
      backgroundColor: isUser ? theme.colors.primary : theme.colors.surfaceVariant,
    }
  ];
  
  const textStyle = [
    styles.text,
    {
      color: isUser ? theme.colors.onPrimary : theme.colors.onSurfaceVariant,
    }
  ];
  
  const timeString = timestamp.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  const markdownStyles = {
    body: {
      color: isUser ? theme.colors.onPrimary : theme.colors.onSurfaceVariant,
      fontSize: 16,
      lineHeight: 20,
    } as TextStyle,
    code_inline: {
      backgroundColor: isUser ? theme.colors.primaryContainer : theme.colors.surface,
      color: isUser ? theme.colors.onPrimaryContainer : theme.colors.onSurface,
      borderRadius: 4,
      paddingHorizontal: 4,
      paddingVertical: 2,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    } as TextStyle,
    code_block: {
      backgroundColor: isUser ? theme.colors.primaryContainer : theme.colors.surface,
      color: isUser ? theme.colors.onPrimaryContainer : theme.colors.onSurface,
      borderRadius: 8,
      padding: 8,
      marginVertical: 4,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    } as TextStyle,
    fence: {
      color: isUser ? theme.colors.onPrimary : theme.colors.onSurfaceVariant,
      backgroundColor: isUser ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
      fontSize: 14,
      padding: 8,
      borderRadius: 4,
      marginVertical: 4,
    } as TextStyle,
    link: {
      color: isUser ? theme.colors.onPrimary : theme.colors.primary,
      textDecorationLine: 'underline' as const,
    } as TextStyle,
    list_item: {
      marginTop: 4,
      marginBottom: 4,
    } as TextStyle,
    bullet_list: {
      marginTop: 8,
      marginBottom: 8,
    } as TextStyle,
    ordered_list: {
      marginTop: 8,
      marginBottom: 8,
    } as TextStyle,
  };

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.llmContainer]}>
      <View style={bubbleStyle}>
        {isMarkdown ? (
          <Markdown style={markdownStyles}>
            {text}
          </Markdown>
        ) : (
          <Text style={[styles.text, textStyle]}>{text}</Text>
        )}
        <View style={styles.metadata}>
          <Text style={[styles.timestamp, textStyle]}>
            {timeString}
          </Text>
          {isUser && status !== 'error' && (
            <Text style={[styles.status, textStyle]}>
              {status === 'sending' ? '○' : status === 'sent' ? '●' : status === 'delivered' ? '●●' : '●●'}
            </Text>
          )}
          {status === 'error' && (
            <Text style={[styles.error, textStyle]}>!</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    flexDirection: 'row',
  },
  userContainer: {
    justifyContent: 'flex-end',
  },
  llmContainer: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '80%',
    padding: 8,
    borderRadius: 12,
    elevation: 1,
  },
  userBubble: {
    borderTopRightRadius: 4,
  },
  llmBubble: {
    borderTopLeftRadius: 4,
  },
  text: {
    fontSize: 16,
    lineHeight: 20,
  },
  metadata: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 2,
  },
  timestamp: {
    fontSize: 12,
    marginRight: 4,
    opacity: 0.7,
  },
  status: {
    fontSize: 12,
    letterSpacing: -1,
  },
  error: {
    fontSize: 16,
    fontWeight: 'bold',
  },
}); 