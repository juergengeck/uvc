/**
 * Default attachment view renderers
 */

import React from 'react';
import { Image, StyleSheet, Linking } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { AttachmentViewFactoryEntry } from '../types/chat';

interface Attachment {
  url?: string;
  name?: string;
  content?: string;
}

/**
 * Default attachment view factories
 */
export const defaultAttachmentViewFactoryEntries: AttachmentViewFactoryEntry[] = [
  // Image attachments
  {
    type: 'image',
    createView: (attachment: Attachment) => {
      if (!attachment?.url) {
        return null;
      }
      
      return React.createElement(Image, {
        key: attachment.url,
        source: { uri: attachment.url },
        style: styles.image,
        resizeMode: 'contain'
      });
    }
  },
  
  // File attachments
  {
    type: 'file',
    createView: (attachment: Attachment) => {
      if (!attachment?.url || !attachment?.name) {
        return null;
      }
      
      return React.createElement(Button, {
        key: attachment.url,
        mode: 'outlined',
        icon: 'file-download',
        onPress: () => Linking.openURL(attachment.url!),
        style: styles.file,
        children: attachment.name
      });
    }
  },
  
  // Text attachments
  {
    type: 'text',
    createView: (attachment: Attachment) => {
      if (!attachment?.content) {
        return null;
      }
      
      return React.createElement(Text, {
        key: attachment.content,
        style: styles.text,
        children: attachment.content
      });
    }
  }
];

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: 200,
    borderRadius: 8,
  },
  file: {
    marginVertical: 8,
  },
  text: {
    marginVertical: 8,
  },
}); 