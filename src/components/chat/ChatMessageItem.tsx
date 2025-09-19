import React, { memo, useState, useRef, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Modal, Platform } from 'react-native';
import { Text, Menu, useTheme, IconButton, TouchableRipple, Chip, Badge, Surface } from 'react-native-paper';
import Markdown from 'react-native-markdown-display';
import { ThinkingView } from './ThinkingView';
import { cleanMessageText, extractThinkingContent } from '@src/utils/ai/parseThinking';
import type { ChatMessageCard } from '@src/models/chat/types';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMessageAttachments } from '@src/hooks/chat/useMessageAttachments';
import { createAttachmentViews } from './attachments/AttachmentViewFactory';

interface MessageItemProps {
  item: ChatMessageCard;
  myPersonId?: SHA256IdHash<Person>;
  index: number;
  onLongPress: (messageHash: string, event: any) => void;
  onLinkPress: (url: string) => boolean;
  menuVisible: string | null;
  handleShowSignatures: (messageHash: string) => void;
  handleCopyText: (text: string) => void;
  markdownStyles: any;
  setMenuVisible: (hash: string | null) => void;
  menuPosition: { x: number; y: number };
  previousMessage?: ChatMessageCard;
  getSenderName: (personId: SHA256IdHash<Person>) => string;
  isGroupChat?: boolean;
}

/**
 * A separate component for rendering chat message items with fixed height constraints
 * to help with measurement and scrolling.
 */
export const ChatMessageItem = memo(({ 
  item, 
  myPersonId,
  index, 
  onLongPress, 
  onLinkPress, 
  menuVisible, 
  handleShowSignatures,
  handleCopyText,
  markdownStyles,
  setMenuVisible,
  menuPosition,
  previousMessage,
  getSenderName,
  isGroupChat
}: MessageItemProps) => {
  const [showThinking, setShowThinking] = useState(false);
  const [showHashInfo, setShowHashInfo] = useState(false);
  const [thinkingContent, setThinkingContent] = useState<string>('');
  const messageRef = useRef<View>(null);
  const theme = useTheme();
  
  // Auto-expand new AI messages, controlled by parent
  const [isExpanded, setIsExpanded] = useState(item.isExpanded ?? false);
  
  // Load attachments
  const { attachments, loading: attachmentsLoading } = useMessageAttachments(item.messageRef?.attachments);
  
  // Update expansion state when prop changes
  useEffect(() => {
    if (item.isExpanded !== undefined) {
      setIsExpanded(item.isExpanded);
    }
  }, [item.isExpanded]);
  
  // Define styles inside the component to access theme
  const styles = StyleSheet.create({
    messageContainer: {
      marginVertical: 1,
      flexDirection: 'row',
      width: '100%', 
      paddingHorizontal: 8, 
    },
    userMessage: {
      alignItems: 'flex-end',
    },
    aiMessage: {
      alignItems: 'flex-start',
    },
    systemMessage: {
      alignItems: 'center', 
      width: '100%',
      alignSelf: 'center',
      paddingVertical: 4,
    },
    messageBubble: {
      borderRadius: 12,
      overflow: 'hidden',
      flexDirection: 'column',
      paddingVertical: 0,
      paddingHorizontal: 0,
      marginVertical: 1,
    },
    messageContentContainer: {
      paddingHorizontal: 8,
      paddingBottom: 2,
      paddingTop: 4,
    },
    systemMessageContent: { 
      alignItems: 'center', 
      justifyContent: 'center',
      padding: 10,
      width: '100%',
      maxWidth: '80%', // Limit width to make it more centered
    },
    systemMessageText: { 
      fontStyle: 'italic',
      textAlign: 'center',
      color: theme.colors.onSurfaceVariant,
      fontSize: 14,
      lineHeight: 20,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingTop: 4,
      paddingBottom: 2,
      minHeight: 20, 
    },
    messageTypeChip: {
      marginRight: 4,
      height: 18,
    },
    hashBadge: {
      marginLeft: 'auto', 
      height: 18,
    },
    hashInfoContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 4,
    },
    hashInfoText: {
      marginRight: 4,
    },
    timestamp: {
      textAlign: 'right',
      marginTop: 1,
      fontSize: 12,
    },
    actionButtons: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      marginTop: 0,
    },
    messageFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 2, 
    },
    modalContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      paddingHorizontal: 16,
    },
    menuContent: {
      width: 200,
    },
    segmentContainer: {
      padding: 8,
      borderRadius: 8,
      marginBottom: 8,
    },
    segmentType: {
      fontSize: 12,
      fontWeight: 'bold',
      marginBottom: 4,
    },
    segmentContent: {
      fontSize: 14,
    },
    thinkingContainer: {
      marginTop: 1,
      padding: 6,
      paddingTop: 3,
      borderRadius: 8,
      backgroundColor: theme.colors.tertiaryContainer,
      borderLeftWidth: 2,
      borderLeftColor: theme.colors.tertiary,
    },
    thinkingHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
    },
    thinkingTitle: {
      fontWeight: 'bold',
      color: theme.colors.onTertiaryContainer,
      fontSize: 13,
      marginLeft: 4,
    },
    thinkingContent: {
      color: theme.colors.onTertiaryContainer,
      fontSize: 14,
      lineHeight: 20,
    },
    timestampContainer: {
      marginTop: 2,
      paddingHorizontal: 8,
      width: '100%', // Span full width of the message container
      flexDirection: 'row', // Allow alignment of timestamp text
    },
    timestampBelow: {
      fontSize: 12,
    },
    fullMessageContainer: {
      marginVertical: 1,
      flexDirection: 'column',
      width: '100%',
      paddingHorizontal: 8,
    },
    attachmentsContainer: {
      marginTop: 8,
      marginBottom: 4,
    },
  });
  
  
  // Check if this message has attachments
  const hasAttachments = item.messageRef?.attachments && item.messageRef.attachments.length > 0;
  
  // Only show thinking button for AI messages with attachments
  const showThinkingButton = item.isAI && hasAttachments;
  
  // For AI messages, truncate the text when collapsed
  const shouldTruncate = item.isAI && !isExpanded;
  
  // Get text content for display, possibly truncated
  const getDisplayText = () => {
    if (!item.messageRef?.text) {
      console.warn(`[ChatMessageItem] Message ${item.hash?.toString().substring(0, 8)} has no text content`);
      return '[Empty message]';
    }
    
    if (!shouldTruncate) {
      return cleanMessageText(item.messageRef.text, item.isAI);
    }
    
    // Get a concise version (first paragraph or first 150 chars)
    const text = cleanMessageText(item.messageRef.text, item.isAI);

    // For AI messages, strip out "User:" and "Assistant:" prefixes
    let cleanedText = text;
    
    // If we're left with no content after cleaning, return the original text
    if (!cleanedText && text) {
      return text;
    }
    
    // Use the cleaned text for further processing
    const firstParagraphMatch = cleanedText.match(/^(.+?)(\n\n|$)/);
    if (firstParagraphMatch) {
      const firstParagraph = firstParagraphMatch[1].trim();
      // If the first paragraph is under 200 chars, just show it
      if (firstParagraph.length < 200) {
        return firstParagraph;
      }
    }
    
    // Otherwise truncate to first 150 chars with ellipsis
    return cleanedText.substring(0, 150).trim() + '...';
  };
  
  // Improve the getMessageWidth function to better handle short messages
  const getMessageWidth = () => {
    const text = item.messageRef?.text || '';
    
    // For all messages, use a larger width to prevent excessive line wrapping
    // Very short messages should be at least 150px wide
    if (text.length < 20) {
      return '45%'; // Very short messages
    } else if (text.length < 60) {
      return '60%'; // Short messages
    } else if (text.length < 120) {
      return '70%'; // Medium messages
    } else {
      return '80%'; // Long messages
    }
  };
  
  // Get message style based on type
  const getMessageStyle = (isSystem: boolean, isUserButNotMe: boolean, isAI: boolean) => {
    if (isUserButNotMe) {
      return {
        backgroundColor: theme.colors.primaryContainer,
        borderColor: theme.colors.primary,
      };
    } else if (isAI) {
      return {
        backgroundColor: theme.colors.secondaryContainer,
        borderColor: theme.colors.secondary,
      };
    } else if (isSystem) {
      return {
        backgroundColor: theme.colors.surfaceVariant,
        borderColor: theme.colors.outline,
        borderStyle: 'dashed' as 'dashed',
      };
    } else {
      // Other participant messages
      return {
        backgroundColor: theme.colors.tertiaryContainer,
        borderColor: theme.colors.tertiary,
      };
    }
  };
  
  // Handler for long press to show context menu at the right place
  const handleMessageLongPress = (e: any) => {
    // Measure component position relative to screen for accurate menu placement
    if (messageRef.current) {
      messageRef.current.measure((x, y, width, height, pageX, pageY) => {
        // Get press coordinates from the event
        const { locationX, locationY } = e.nativeEvent;
        
        // Calculate absolute position on screen
        const menuX = pageX + locationX;
        const menuY = pageY + locationY;
        
        console.log(`[MessageItem] Menu position: ${menuX}, ${menuY}`);
        
        // Call parent's onLongPress with the item hash and calculated position
        onLongPress(item.hash, { nativeEvent: { pageX: menuX, pageY: menuY } });
      });
    } else {
      // Fallback to original behavior if ref is not available
      onLongPress(item.hash, e);
    }
  };
  
  // Shortened hash for display
  const shortHash = item.hash.toString().substring(0, 8);
  
  // Check if this message is linked to the previous one
  const isLinkedToPrevious = previousMessage && previousMessage.hash;
  
  // ---- Define message type flags ----
  const isSystem = item.isSystem === true;
  const isUser = item.isUser === true; // Trust the item.isUser flag directly
  const isAI = item.isAI === true; // Trust the item.isAI flag directly
  const isOtherParticipant = !isUser && !isAI && !isSystem; // Flag for other participants
  
  // Determine alignment based on message type
  const alignmentStyle = isUser
    ? styles.userMessage         // User messages right-aligned
    : isSystem
      ? styles.systemMessage     // System messages centered
      : styles.aiMessage;        // AI and other messages left-aligned

  // Determine bubble style based on message type
  const bubbleStyle = isUser
    ? { backgroundColor: theme.colors.primaryContainer, borderColor: theme.colors.primary }
    : isSystem
      ? { 
          backgroundColor: theme.colors.surfaceVariant + '80', // Add 50% transparency 
          borderColor: theme.colors.outline,
          borderStyle: 'dashed' as 'dashed',
          borderWidth: 1,
          borderRadius: 16,
          marginVertical: 8,
        }
      : isAI
        ? { backgroundColor: theme.colors.secondaryContainer, borderColor: theme.colors.secondary }
        : { backgroundColor: theme.colors.tertiaryContainer, borderColor: theme.colors.tertiary }; // Other participants

  // For system messages, adjust the width to be appropriate for centered display
  const messageWidth = isSystem 
    ? '80%'  // System messages get a fixed, narrower width
    : getMessageWidth();

  // Determine header chip label and background
  const headerChipLabel = isUser ? 'You' : isAI ? 'AI' : isSystem ? 'System' : 'OTHER';
  const headerChipBackground = isUser ? theme.colors.primary : isAI ? theme.colors.secondary : isSystem ? theme.colors.outline : theme.colors.tertiary;

  // --- Get Sender Name for Other Participants ---
  const senderName = isOtherParticipant && item.messageRef?.sender 
    ? getSenderName(item.messageRef.sender) 
    : headerChipLabel; // Fallback to original label if needed

  // --- Navigation Handler ---
  const handleSenderPress = () => {
    if (isOtherParticipant && item.messageRef?.sender) {
      // Navigate to the contact view for this person
      // Assuming the route is something like '/contact/[personId]'
      router.push(`/contact/${item.messageRef.sender.toString()}`); 
    }
  };

  // Load thinking content when showThinking changes
  useEffect(() => {
    if (showThinking && item.messageRef?.text) {
      const content = extractThinkingContent(item.messageRef.text);
      setThinkingContent(content);
    }
  }, [showThinking, item.messageRef?.text]);

  return (
    <React.Fragment>
      {/* Full message container - includes bubble AND timestamp in a column */}
      <View style={[
        styles.fullMessageContainer,
        alignmentStyle // Apply calculated alignment (left/right/center)
      ]}>
        {/* Message bubble */}
        <View style={[
          styles.messageBubble, 
          bubbleStyle, // Apply calculated bubble style
          { 
            width: messageWidth, 
            maxWidth: messageWidth,
          }
        ]}>
          {/* Message content */}
          <TouchableRipple onLongPress={handleMessageLongPress}>
            <View 
              style={[
                isSystem ? styles.systemMessageContent : styles.messageContentContainer
              ]}
              ref={messageRef}
            >
              {/* Sender name for group chats */}
              {!isUser && !isSystem && isGroupChat && (
                <TouchableOpacity 
                  onPress={isOtherParticipant ? handleSenderPress : undefined} 
                  disabled={!isOtherParticipant}
                  style={{ marginBottom: 2 }}
                >
                  <Text 
                    style={{ 
                      fontWeight: 'bold', 
                      fontSize: 12, 
                      color: isAI ? theme.colors.secondary : theme.colors.tertiary,
                      opacity: 0.8
                    }}
                    allowFontScaling={true}
                  >
                    {senderName}
                  </Text>
                </TouchableOpacity>
              )}
              
              {(item.messageRef?.text || item.isError) && (
                <Markdown
                  style={{
                    ...markdownStyles,
                    ...(isSystem ? { body: styles.systemMessageText } : {}),
                    body: {
                      ...markdownStyles.body,
                      marginBottom: 0, // Remove default Markdown bottom margin
                      ...(isSystem ? styles.systemMessageText : {})
                    }
                  }}
                  onLinkPress={onLinkPress}
                >
                  {shouldTruncate ? getDisplayText() : cleanMessageText(item.messageRef?.text || '[Empty message]', item.isAI)}
                </Markdown>
              )}
              
              {/* Render attachments inline */}
              {attachments.length > 0 && (
                <View style={styles.attachmentsContainer}>
                  {createAttachmentViews(attachments, {
                    onPress: (attachment) => {
                      // Handle attachment tap
                      console.log(`[ChatMessageItem] Attachment tapped: ${attachment.hash}`);
                    }
                  })}
                </View>
              )}
              
              {/* Inline thinking content */}
              {showThinking && thinkingContent && (
                <View style={styles.thinkingContainer}>
                  <View style={styles.thinkingHeader}>
                    <MaterialCommunityIcons name="thought-bubble" size={14} color={theme.colors.onTertiaryContainer} />
                    <Text style={styles.thinkingTitle} allowFontScaling={true}>Thinking Process</Text>
                  </View>
                  <Text style={styles.thinkingContent} allowFontScaling={true}>{thinkingContent}</Text>
                </View>
              )}
              
              {/* Action buttons row - temporarily removed to test padding */}

              {/* Chevron menu positioned absolutely to avoid layout impact */}
              {!isSystem && (
                <View style={{ position: 'absolute', top: 2, right: 2 }}>
                  <Menu
                    visible={menuVisible === item.hash}
                    onDismiss={() => setMenuVisible(null)}
                    anchor={
                      <IconButton
                        icon="chevron-down"
                        size={16}
                        onPress={() => setMenuVisible(menuVisible === item.hash ? null : item.hash)}
                        iconColor={isUser ? theme.colors.onPrimaryContainer : isAI ? theme.colors.onSecondaryContainer : theme.colors.onSurfaceVariant}
                        style={{ margin: 0 }}
                      />
                    }
                    contentStyle={styles.menuContent}
      >
        <Menu.Item
                      onPress={() => {
                        setShowHashInfo(!showHashInfo);
                        setMenuVisible(null);
                      }}
                      title={`Hash: ${shortHash}...`}
                      leadingIcon="pound"
        />
        <Menu.Item
                      onPress={() => {
                        handleShowSignatures(item.hash);
                        setMenuVisible(null);
                      }}
          title="View Signatures"
          leadingIcon="certificate"
        />
                    <Menu.Item
                      onPress={() => {
                        handleCopyText(item.messageRef?.text || '');
                        setMenuVisible(null);
                      }}
                      title="Copy Message"
                      leadingIcon="content-copy"
                    />
        {item.isAI && item.messageRef?.text && extractThinkingContent(item.messageRef.text) && (
          <Menu.Item
            onPress={() => {
              setMenuVisible(null);
              setShowThinking(!showThinking);
            }}
            title={showThinking ? "Hide Thinking" : "Show Thinking"}
            leadingIcon="thought-bubble"
          />
        )}
        {item.isAI && item.messageRef?.text && item.messageRef.text.length > 150 && (
          <Menu.Item
            onPress={() => {
              setMenuVisible(null);
              setIsExpanded(!isExpanded);
            }}
            title={isExpanded ? "Collapse" : "Expand"}
            leadingIcon={isExpanded ? "chevron-up" : "chevron-down"}
          />
        )}
      </Menu>
                </View>
              )}

              {/* Hash info panel */}
              {showHashInfo && (
                <View style={[styles.hashInfoContainer, { backgroundColor: theme.colors.surfaceVariant }]}>
                  <Text style={[styles.hashInfoText, { color: theme.colors.onSurface }]} allowFontScaling={true}>
                    Hash: {shortHash}...
                  </Text>
                  <TouchableOpacity onPress={() => handleShowSignatures(item.hash)}>
                    <MaterialCommunityIcons 
                      name="certificate" 
                      size={14} 
                      color={theme.colors.primary} 
                      style={{ marginLeft: 4 }}
                    />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </TouchableRipple>
        </View>
        
        {/* Timestamp directly below the bubble */}
        {!isSystem && (
          <Text 
            variant="labelSmall" 
            style={[
              styles.timestampBelow,
              { 
                color: theme.colors.onSurfaceVariant,
                textAlign: isUser ? 'right' : 'left',
                marginTop: 4,
                paddingHorizontal: 8
              }
            ]}
            allowFontScaling={true}
          >
            {new Date(item.creationTime?.getTime() || Date.now()).toLocaleString([], { 
              month: 'short', 
              day: 'numeric', 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </Text>
        )}
      </View>
    </React.Fragment>
  );
}, (prevProps, nextProps) => {
  // Update memo check to include myPersonId if it changes
  // Add getSenderName to dependency check if needed, assuming it's stable for now
  return (
    prevProps.item.hash.toString() === nextProps.item.hash.toString() &&
    prevProps.menuVisible === nextProps.menuVisible &&
    prevProps.myPersonId?.toString() === nextProps.myPersonId?.toString()
  );
}); 