/**
 * Component for rendering unknown attachment types
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { AttachmentViewProps } from '@src/types/attachments';

export const UnknownAttachmentView: React.FC<AttachmentViewProps> = ({
  attachment,
  onPress,
  style
}) => {
  const theme = useTheme();
  
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surfaceVariant }, style]}>
      <Icon name="file-question" size={24} color={theme.colors.onSurfaceVariant} />
      <Text style={[styles.text, { color: theme.colors.onSurfaceVariant }]}>
        Unknown attachment
      </Text>
      <Text style={[styles.hash, { color: theme.colors.onSurfaceVariant }]}>
        {attachment.hash.substring(0, 8)}...
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
  hash: {
    marginTop: 4,
    fontSize: 10,
    fontFamily: 'monospace',
  },
});