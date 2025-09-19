/**
 * Component for rendering audio attachments
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { AttachmentViewProps } from '@src/types/attachments';

export const AudioAttachmentView: React.FC<AttachmentViewProps> = ({
  attachment,
  onPress,
  style
}) => {
  const theme = useTheme();
  
  // TODO: Implement actual audio playback controls
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surfaceVariant }, style]}>
      <Icon name="music" size={24} color={theme.colors.onSurfaceVariant} />
      <Text style={[styles.text, { color: theme.colors.onSurfaceVariant }]}>
        Audio attachment
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