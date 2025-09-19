/**
 * Component for rendering thinking attachments
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { AttachmentViewProps, ThinkingAttachment } from '@src/types/attachments';
import { readClobAsText } from '@src/utils/storage/clobStorage';
import type { ThinkingSegment } from '@src/utils/storage/clobStorage';

interface ThinkingAttachmentViewProps extends AttachmentViewProps {
  attachment: ThinkingAttachment;
}

export const ThinkingAttachmentView: React.FC<ThinkingAttachmentViewProps> = ({
  attachment,
  onPress,
  style
}) => {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [segment, setSegment] = useState<ThinkingSegment | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadThinkingContent();
  }, [attachment.hash]);

  const loadThinkingContent = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const content = await readClobAsText(attachment.hash);
      const parsed = JSON.parse(content) as ThinkingSegment;
      setSegment(parsed);
    } catch (err) {
      console.error('[ThinkingAttachmentView] Failed to load thinking:', err);
      setError('Failed to load thinking content');
    } finally {
      setLoading(false);
    }
  };

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      setExpanded(!expanded);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, style]}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
      </View>
    );
  }

  if (error || !segment) {
    return (
      <View style={[styles.container, styles.error, style]}>
        <Icon name="alert-circle" size={16} color={theme.colors.error} />
        <Text style={[styles.errorText, { color: theme.colors.error }]}>
          {error || 'Invalid thinking content'}
        </Text>
      </View>
    );
  }

  const isVisible = segment.metadata?.visible ?? true;
  const truncated = segment.content.length > 150 && !expanded;
  const displayContent = truncated 
    ? segment.content.substring(0, 150) + '...' 
    : segment.content;

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { 
          backgroundColor: theme.colors.surfaceVariant,
          borderColor: theme.colors.outlineVariant,
          opacity: isVisible ? 1 : 0.7
        },
        style
      ]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <View style={styles.header}>
        <Icon 
          name="head-cog" 
          size={16} 
          color={theme.colors.primary} 
          style={styles.icon}
        />
        <Text style={[styles.title, { color: theme.colors.primary }]}>
          AI Thinking
        </Text>
        {segment.metadata?.modelId && (
          <Text style={[styles.modelId, { color: theme.colors.onSurfaceVariant }]}>
            {segment.metadata.modelId}
          </Text>
        )}
        <View style={styles.spacer} />
        <Icon 
          name={expanded ? 'chevron-up' : 'chevron-down'} 
          size={20} 
          color={theme.colors.onSurfaceVariant} 
        />
      </View>

      <Text 
        style={[
          styles.content,
          { color: theme.colors.onSurface }
        ]}
        numberOfLines={expanded ? undefined : 4}
      >
        {displayContent}
      </Text>

      {truncated && !expanded && (
        <Text style={[styles.showMore, { color: theme.colors.primary }]}>
          Show more
        </Text>
      )}

      {segment.metadata?.timestamp && (
        <Text style={[styles.timestamp, { color: theme.colors.onSurfaceVariant }]}>
          {new Date(segment.metadata.timestamp).toLocaleTimeString()}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  icon: {
    marginRight: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
  },
  modelId: {
    fontSize: 12,
    marginLeft: 8,
  },
  spacer: {
    flex: 1,
  },
  content: {
    fontSize: 14,
    lineHeight: 20,
  },
  showMore: {
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  timestamp: {
    fontSize: 11,
    marginTop: 8,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  errorText: {
    fontSize: 12,
    marginLeft: 8,
  },
});