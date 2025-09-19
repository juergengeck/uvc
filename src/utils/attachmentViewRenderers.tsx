/**
 * Default attachment view renderers
 */

import React from 'react';
import { Image, StyleSheet, Linking, View } from 'react-native';
import { Button, Text, Card, Chip, Surface, useTheme } from 'react-native-paper';
import type { AttachmentViewFactoryEntry } from '../types/chat';
import type { AIMessagePart } from '../types/chat';
import Markdown from 'react-native-markdown-display';

/**
 * Default attachment view factories
 */
export const defaultAttachmentViewFactoryEntries: AttachmentViewFactoryEntry[] = [
  // Image attachments
  {
    type: 'image',
    createView: (attachment: { url: string; hash: string }) => {
      if (!attachment.url) return null;
      
      return React.createElement(Image, {
        key: attachment.hash,
        source: { uri: attachment.url },
        style: styles.image,
        resizeMode: "contain"
      });
    }
  },
  
  // File attachments
  {
    type: 'file',
    createView: (attachment: { url: string; name: string; hash: string }) => {
      if (!attachment.url || !attachment.name) return null;
      
      return React.createElement(Button, {
        key: attachment.hash,
        mode: "outlined",
        icon: "file",
        onPress: () => Linking.openURL(attachment.url),
        style: styles.file,
        children: attachment.name
      });
    }
  },
  
  // Text attachments
  {
    type: 'text',
    createView: (attachment: { content: string; hash: string }) => {
      if (!attachment.content) return null;
      
      return React.createElement(Text, {
        key: attachment.hash,
        style: styles.text,
        children: attachment.content
      });
    }
  },
  
  // AI message part attachments (for thinking, reasoning, etc.)
  {
    type: 'ai-message-part',
    createView: (attachment: AIMessagePart) => {
      const theme = useTheme();
      
      if (!attachment || !attachment.content) return null;
      
      // Only display if explicitly set to visible or unspecified
      const isVisible = attachment.metadata?.visible !== false;
      if (!isVisible) return null;
      
      // Specific styling based on the part type
      let title: string;
      let iconName: string;
      let surfaceColor: string;
      
      switch (attachment.type) {
        case 'thinking':
          title = "AI Thinking";
          iconName = "thought-bubble";
          surfaceColor = theme.colors.surfaceVariant;
          break;
        case 'reasoning':
          title = "AI Reasoning";
          iconName = "brain";
          surfaceColor = theme.colors.secondaryContainer;
          break;
        case 'raw':
          title = "Raw Output";
          iconName = "code-json";
          surfaceColor = theme.colors.errorContainer;
          break;
        default:
          title = "AI Response";
          iconName = "message-text";
          surfaceColor = theme.colors.primaryContainer;
      }
      
      return (
        <Surface
          key={attachment.id}
          style={[styles.aiPartContainer, { backgroundColor: surfaceColor }]}
          elevation={1}
        >
          <View style={styles.aiPartHeader}>
            <Chip icon={iconName} style={styles.aiPartChip}>{title}</Chip>
          </View>
          <Markdown style={markdownStyles}>
            {attachment.content}
          </Markdown>
        </Surface>
      );
    }
  }
];

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginVertical: 8,
  },
  file: {
    marginVertical: 8,
  },
  text: {
    marginVertical: 8,
  },
  aiPartContainer: {
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  aiPartHeader: {
    marginBottom: 8,
  },
  aiPartChip: {
    alignSelf: 'flex-start',
  }
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
  heading1: {
    fontSize: 24,
    marginVertical: 8,
    fontWeight: 'bold',
  },
  heading2: {
    fontSize: 20,
    marginVertical: 6,
    fontWeight: 'bold',
  },
  heading3: {
    fontSize: 18,
    marginVertical: 4,
    fontWeight: 'bold',
  },
  paragraph: {
    marginVertical: 4,
  }
}; 