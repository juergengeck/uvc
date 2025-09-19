/**
 * Component for rendering document attachments
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { AttachmentViewProps } from '@src/types/attachments';

export const DocumentAttachmentView: React.FC<AttachmentViewProps> = ({
  attachment,
  onPress,
  style
}) => {
  const theme = useTheme();
  
  const getDocumentIcon = () => {
    const mimeType = attachment.metadata?.mimeType || '';
    if (mimeType.includes('pdf')) return 'file-pdf-box';
    if (mimeType.includes('word')) return 'file-word';
    if (mimeType.includes('excel')) return 'file-excel';
    return 'file-document';
  };
  
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surfaceVariant }, style]}>
      <Icon name={getDocumentIcon()} size={24} color={theme.colors.onSurfaceVariant} />
      <Text style={[styles.text, { color: theme.colors.onSurfaceVariant }]}>
        {attachment.metadata?.fileName || 'Document attachment'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginVertical: 4,
  },
  text: {
    marginTop: 8,
    fontSize: 12,
  },
});