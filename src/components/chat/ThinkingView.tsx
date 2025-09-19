import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Button, Card, Text, useTheme, Surface } from 'react-native-paper';
import { readClobAsText } from '@src/utils/storage/clobStorage';
import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';
import type { CLOB } from '@refinio/one.core/lib/recipes.js';

interface ThinkingSegment {
  $type$: 'ThinkingSegment';
  id: string;
  type: string;
  content: string;
  metadata: {
    $type$: 'ThinkingSegmentMetadata';
    partIndex: number;
    timestamp: number;
    visible: boolean;
    modelId?: string;
    responseLength?: number;
  };
}

interface ThinkingViewProps {
  /**
   * Array of attachment hashes that contain thinking segments
   */
  attachments: SHA256Hash[];
  
  /**
   * Optional callback when user closes the view
   */
  onClose?: () => void;

  /**
   * Optional raw thinking content extracted from message text
   */
  rawThinkingContent?: string;
}

/**
 * Component to display AI thinking process from CLOB attachments
 */
export function ThinkingView({ attachments, onClose, rawThinkingContent }: ThinkingViewProps) {
  const theme = useTheme();
  const [segments, setSegments] = useState<ThinkingSegment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    // Load attachments on mount
    const loadAttachments = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const loadedSegments: ThinkingSegment[] = [];

        // Add raw thinking content if available
        if (rawThinkingContent) {
          loadedSegments.push({
            $type$: 'ThinkingSegment',
            id: 'raw-thinking-content',
            type: 'thinking',
            content: rawThinkingContent,
            metadata: {
              $type$: 'ThinkingSegmentMetadata',
              partIndex: -1, // Place at the beginning
              timestamp: Date.now(),
              visible: true
            }
          });
        }
        
        // Process each attachment
        for (const attachmentHash of attachments) {
          try {
            // Read the CLOB as text
            const textContent = await readClobAsText(attachmentHash as unknown as SHA256Hash<CLOB>);
            
            try {
              // Parse the JSON content
              const segmentData = JSON.parse(textContent);
              
              // Validate the segment data has the required fields
              if (segmentData && segmentData.type && segmentData.content) {
                loadedSegments.push(segmentData as ThinkingSegment);
              }
            } catch (parseError) {
              console.error(`[ThinkingView] Error parsing JSON:`, parseError);
              
              // If it's not valid JSON, it might be raw thinking content
              // Create a simple thinking segment from it
              loadedSegments.push({
                $type$: 'ThinkingSegment',
                id: Math.random().toString(36).substring(2),
                type: 'thinking',
                content: textContent,
                metadata: {
                  $type$: 'ThinkingSegmentMetadata',
                  partIndex: 0,
                  timestamp: Date.now(),
                  visible: true
                }
              });
            }
          } catch (segmentError) {
            console.error(`[ThinkingView] Error loading segment:`, segmentError);
            // Add an error segment instead of just logging
            let errorMessage = 'Unknown error';
            if (segmentError instanceof Error) {
              errorMessage = segmentError.message;
            }
            loadedSegments.push({
              $type$: 'ThinkingSegment',
              id: `error-${attachmentHash.toString().substring(0, 8)}`,
              type: 'error',
              content: `Failed to load segment: ${attachmentHash.toString().substring(0, 8)}... (${errorMessage})`,
              metadata: {
                $type$: 'ThinkingSegmentMetadata',
                partIndex: attachments.indexOf(attachmentHash), // Use original index for ordering
                timestamp: Date.now(),
                visible: true
              }
            });
          }
        }
        
        // Sort segments by part index if available
        loadedSegments.sort((a, b) => 
          (a.metadata?.partIndex || 0) - (b.metadata?.partIndex || 0)
        );
        
        setSegments(loadedSegments);
      } catch (error) {
        console.error(`[ThinkingView] Error loading attachments:`, error);
        setError('Failed to load thinking process.');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadAttachments();
  }, [attachments, rawThinkingContent]);
  
  // Render each segment
  const renderSegment = (segment: ThinkingSegment, index: number) => {
    const isThinking = segment.type.includes('thinking');
    const isReasoning = segment.type.includes('reasoning');
    
    // Choose background color based on segment type
    const segmentColor = isThinking 
      ? theme.colors.tertiaryContainer 
      : isReasoning 
        ? theme.colors.secondaryContainer
        : theme.colors.surfaceVariant;
    
    // Choose text color based on segment type
    const textColor = isThinking
      ? theme.colors.onTertiaryContainer
      : isReasoning
        ? theme.colors.onSecondaryContainer
        : theme.colors.onSurfaceVariant;
    
    return (
      <Surface
        key={`segment-${index}`}
        style={[styles.segmentContainer, { backgroundColor: segmentColor }]}
        elevation={1}
      >
        <Text style={[styles.segmentType, { color: textColor }]}>
          {isThinking ? 'Thinking Process' : isReasoning ? 'Reasoning' : 'Additional Context'}
        </Text>
        <Text style={[styles.segmentContent, { color: textColor }]}>
          {segment.content}
        </Text>
      </Surface>
    );
  };
  
  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Card.Title title="AI Thinking Process" />
        <Card.Content style={styles.content}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.loadingText}>Loading thinking segments...</Text>
            </View>
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : segments.length === 0 ? (
            <Text style={styles.emptyText}>No thinking process available.</Text>
          ) : (
            <ScrollView style={styles.scrollView}>
              {segments.map(renderSegment)}
            </ScrollView>
          )}
        </Card.Content>
        <Card.Actions style={styles.actions}>
          <Button onPress={onClose}>Close</Button>
        </Card.Actions>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  card: {
    width: '100%',
  },
  content: {
    minHeight: 200,
    maxHeight: 400,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 10,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    padding: 20,
  },
  emptyText: {
    textAlign: 'center',
    padding: 20,
  },
  scrollView: {
    flex: 1,
  },
  segmentContainer: {
    padding: 12,
    marginBottom: 12,
    borderRadius: 8,
  },
  segmentType: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  segmentContent: {
    lineHeight: 20,
  },
  actions: {
    justifyContent: 'flex-end',
  },
}); 