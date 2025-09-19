import React, { forwardRef, useImperativeHandle, useEffect, memo, useState, useRef, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, Linking, Platform, Modal, ScrollView, Dimensions, Animated, TouchableOpacity, Text, ActivityIndicator, StyleProp, ViewStyle } from 'react-native';
import { Text as PaperText, Surface, useTheme, TouchableRipple, Menu, Button, IconButton } from 'react-native-paper';
import Markdown from 'react-native-markdown-display';
import type { ChatMessageCard } from '@src/models/chat/types';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import { ThinkingView } from './ThinkingView';
import { ChatMessageItem } from './ChatMessageItem';
import { useTranslation } from 'react-i18next';
import { Namespaces } from '@src/i18n/namespaces';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Clipboard from '@react-native-clipboard/clipboard';
import { ThinkingIndicator } from './ThinkingIndicator';

// Define simpler methods interface
export interface MessageListMethods {
  /**
   * Scroll to the bottom of the message list
   * @param animated Whether to animate the scroll
   */
  scrollToBottom: (animated?: boolean) => void;
}

export interface MessageListProps {
  messages: ChatMessageCard[];
  isAIChat?: boolean;
  showSenderNames?: boolean;
  keyboardHeight?: number;
  contentContainerStyle?: StyleProp<ViewStyle>;
  onResendMessage?: (messageId: string) => void;
  onCopyMessage?: (message: string) => void;
  emptyMessage?: string;
  onInputLayoutChange?: (measurements: { height: number }) => void;
  inputHeight?: number;
  onLoadMore?: () => void | Promise<void>;
  isAtBottom?: boolean;
  setIsAtBottom?: (isAtBottom: boolean) => void;
  autoScrollToBottom?: boolean;
  loadingMessage?: string;
  isLoading?: boolean;
  isGenerating?: boolean;
  myPersonId?: SHA256IdHash<Person>;
  onShowSignatures?: (messageHash: string) => void;
  onScrollPositionChange?: (isAtBottom: boolean) => void;
  getSenderName?: (personId: SHA256IdHash<Person>) => string;
  isGroupChat?: boolean;
}

export const MessageList = forwardRef<MessageListMethods, MessageListProps>(({ 
  messages, 
  myPersonId,
  onLoadMore,
  contentContainerStyle, 
  isGenerating = false,
  emptyMessage = "No messages yet",
  loadingMessage = "Loading messages...",
  onShowSignatures,
  onScrollPositionChange,
  autoScrollToBottom = false,
  inputHeight = 60,
  getSenderName = (personId) => `User ${personId.toString().substring(0, 8)}`,
  isGroupChat
}, ref) => {
  const theme = useTheme();
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [menuVisible, setMenuVisible] = React.useState<string | null>(null);
  const [menuPosition, setMenuPosition] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const flatListRef = React.useRef<FlatList>(null);
  const userScrolledRef = useRef(false);
  
  // Animation values for typing indicator dots
  const dot1Opacity = useRef(new Animated.Value(0.4)).current;
  const dot2Opacity = useRef(new Animated.Value(0.6)).current;
  const dot3Opacity = useRef(new Animated.Value(0.8)).current;
  
  const dot1Scale = useRef(new Animated.Value(0.9)).current;
  const dot2Scale = useRef(new Animated.Value(0.9)).current;
  const dot3Scale = useRef(new Animated.Value(0.9)).current;
  
  // Start animations when component mounts
  useEffect(() => {
    if (isGenerating) {
      // Function to animate one dot
      const animateDot = (opacity: Animated.Value, scale: Animated.Value) => {
        // Reset values
        opacity.setValue(0.4);
        scale.setValue(0.9);
        
        Animated.sequence([
          // Animate to full opacity and scale
          Animated.parallel([
            Animated.timing(opacity, {
              toValue: 1,
              duration: 400,
              useNativeDriver: true,
            }),
            Animated.timing(scale, {
              toValue: 1.2,
              duration: 400,
              useNativeDriver: true,
            }),
          ]),
          // Animate back to original values
          Animated.parallel([
            Animated.timing(opacity, {
              toValue: 0.4,
              duration: 400,
              useNativeDriver: true,
            }),
            Animated.timing(scale, {
              toValue: 0.9,
              duration: 400,
              useNativeDriver: true,
            }),
          ]),
        ]).start();
      };
      
      // Animate dots with sequenced delays
      const animationLoop = () => {
        Animated.stagger(200, [
          Animated.loop(
            Animated.sequence([
              Animated.parallel([
                Animated.timing(dot1Opacity, {
                  toValue: 1,
                  duration: 400,
                  useNativeDriver: true,
                }),
                Animated.timing(dot1Scale, {
                  toValue: 1.2,
                  duration: 400,
                  useNativeDriver: true,
                }),
              ]),
              Animated.parallel([
                Animated.timing(dot1Opacity, {
                  toValue: 0.4,
                  duration: 400,
                  useNativeDriver: true,
                }),
                Animated.timing(dot1Scale, {
                  toValue: 0.9,
                  duration: 400,
                  useNativeDriver: true,
                }),
              ]),
            ]),
            { iterations: -1 }
          ),
          Animated.loop(
            Animated.sequence([
              Animated.parallel([
                Animated.timing(dot2Opacity, {
                  toValue: 1,
                  duration: 400,
                  useNativeDriver: true,
                }),
                Animated.timing(dot2Scale, {
                  toValue: 1.2,
                  duration: 400,
                  useNativeDriver: true,
                }),
              ]),
              Animated.parallel([
                Animated.timing(dot2Opacity, {
                  toValue: 0.4,
                  duration: 400,
                  useNativeDriver: true,
                }),
                Animated.timing(dot2Scale, {
                  toValue: 0.9,
                  duration: 400,
                  useNativeDriver: true,
                }),
              ]),
            ]),
            { iterations: -1 }
          ),
          Animated.loop(
            Animated.sequence([
              Animated.parallel([
                Animated.timing(dot3Opacity, {
                  toValue: 1,
                  duration: 400,
                  useNativeDriver: true,
                }),
                Animated.timing(dot3Scale, {
                  toValue: 1.2,
                  duration: 400,
                  useNativeDriver: true,
                }),
              ]),
              Animated.parallel([
                Animated.timing(dot3Opacity, {
                  toValue: 0.4,
                  duration: 400,
                  useNativeDriver: true,
                }),
                Animated.timing(dot3Scale, {
                  toValue: 0.9,
                  duration: 400,
                  useNativeDriver: true,
                }),
              ]),
            ]),
            { iterations: -1 }
          ),
        ]).start();
      };
      
      animationLoop();
    }
  }, [isGenerating, dot1Opacity, dot1Scale, dot2Opacity, dot2Scale, dot3Opacity, dot3Scale]);

  // Debug logging for messages
  useEffect(() => {
    console.log(`[MessageList] Rendering with ${messages.length} messages`);
    if (messages.length > 0) {
      console.log(`[MessageList] First message:`, {
        hash: messages[0]?.hash?.toString().substring(0, 8),
        text: messages[0]?.messageRef?.text?.substring(0, 30),
        isUser: messages[0]?.isUser,
        isAI: messages[0]?.isAI
      });
    } else {
      console.log('[MessageList] No messages to display');
    }
  }, [messages]);
  

  // Consolidated scroll to bottom function
  const scrollToBottom = useCallback((animated = true) => {
    if (flatListRef.current) {
      console.log(`[MessageList] Scrolling to bottom`);
      flatListRef.current.scrollToEnd({ animated });
    }
  }, []);
  
  // Auto-scroll to bottom when instructed by parent
  useEffect(() => {
    if (autoScrollToBottom && messages.length > 0) {
      console.log(`[MessageList] Auto-scrolling due to parent instruction, messages: ${messages.length}`);
      userScrolledRef.current = false; // Reset manual scroll flag
      // Add a small delay to ensure layout is complete
      setTimeout(() => {
        scrollToBottom(true);
      }, 100);
    }
  }, [autoScrollToBottom, messages.length, scrollToBottom]);
  
  // Expose scrollToBottom method
  useImperativeHandle(ref, () => ({
    scrollToBottom
  }));

  // Handle refresh pull (for loading older messages)
  const handleRefresh = React.useCallback(async () => {
    if (!onLoadMore) return;
    setIsRefreshing(true);
    try {
      console.log('[MessageList] Triggered refresh to load older messages');
      await onLoadMore();
    } finally {
      setIsRefreshing(false);
    }
  }, [onLoadMore]);

  const handleLinkPress = React.useCallback((url: string) => {
    Linking.canOpenURL(url).then(supported => {
      if (supported) {
        Linking.openURL(url);
      }
    }).catch(error => {
      console.error('Failed to open URL:', error);
    });
    return false; // Let markdown component handle the link
  }, []);

  const handleLongPress = React.useCallback((messageHash: string, event: any) => {
    const { pageX, pageY } = event.nativeEvent;
    setMenuPosition({ x: pageX, y: pageY });
    setMenuVisible(messageHash);
  }, []);

  const handleShowSignatures = React.useCallback((messageHash: string) => {
    setMenuVisible(null);
    onShowSignatures?.(messageHash);
  }, [onShowSignatures]);

  const handleCopyText = React.useCallback(async (text: string) => {
    setMenuVisible(null);
    if (text) {
      Clipboard.setString(text);
    }
  }, []);

  const markdownStyles = React.useMemo(() => ({
    body: {
      color: theme.colors.onSurface,
    },
    code_inline: {
      backgroundColor: theme.colors.surfaceVariant,
      color: theme.colors.onSurfaceVariant,
      borderRadius: 4,
      paddingHorizontal: 4,
      paddingVertical: 2,
      fontFamily: Platform.select({
        ios: 'Menlo',
        android: 'monospace',
      }),
    },
    code_block: {
      backgroundColor: theme.colors.surfaceVariant,
      color: theme.colors.onSurfaceVariant,
      borderRadius: 8,
      padding: 8,
      marginVertical: 4,
      fontFamily: Platform.select({
        ios: 'Menlo',
        android: 'monospace',
      }),
    },
    link: {
      color: theme.colors.primary,
    },
  }), [theme.colors]);

  // Create audit-consistent keys using channel entry hash when available
  const keyExtractor = React.useCallback((item: ChatMessageCard, index: number) => {
    // Prefer the lowest-level, immutable identifiers first.
    // ChannelEntryHash (version node hash) is globally unique **per stored entry** –
    // but the same entry can legitimately appear twice in the UI (e.g. when
    // reversing order or optimistic updates).  Combine it with creationTime to
    // give every list row its own React key while still being deterministic.

    const timePart = item.creationTime
      ? (item.creationTime instanceof Date
          ? item.creationTime.getTime()
          : new Date(item.creationTime).getTime())
      : 'na';

    if (item.channelEntryHash) {
      return `entry-${item.channelEntryHash.toString()}-${timePart}`;
    }

    // Fallback to content hash + timestamp
    return `message-${item.hash.toString()}-${timePart}`;
  }, []);

  // Use memoized render item function with our new optimized component
  const renderItem = React.useCallback(({ item, index }: { item: ChatMessageCard, index: number }) => {
    // Get previous message for a non-inverted list
    const previousMessage = index > 0 ? messages[index - 1] : undefined;

    // Check if this is an error message
    if (item.isError) {
      return (
        <Surface 
          style={[
            styles.messageItem, 
            styles.errorMessage,
            { backgroundColor: theme.colors.errorContainer }
          ]}
          elevation={1}
        >
          <PaperText style={{ color: theme.colors.onErrorContainer, fontWeight: 'bold' }}>
            {item.messageRef?.text || 'An error occurred'}
          </PaperText>
        </Surface>
      );
    }
    
    // Regular message rendering
    return (
      <ChatMessageItem
        item={item}
        myPersonId={myPersonId}
        index={index}
        onLongPress={handleLongPress}
        onLinkPress={handleLinkPress}
        menuVisible={menuVisible}
        handleShowSignatures={handleShowSignatures}
        handleCopyText={handleCopyText}
        markdownStyles={markdownStyles}
        setMenuVisible={setMenuVisible}
        menuPosition={menuPosition}
        previousMessage={previousMessage}
        getSenderName={getSenderName}
        isGroupChat={isGroupChat}
      />
    );
  }, [
    handleLongPress, 
    handleLinkPress, 
    menuVisible, 
    handleShowSignatures, 
    handleCopyText, 
    markdownStyles,
    setMenuVisible,
    menuPosition,
    myPersonId,
    theme.colors,
    messages,
    getSenderName,
    isGroupChat
  ]);

  // Improved handleScroll that detects user scrolling and tracks position
  const handleScroll = useCallback((event: any) => {
    // Mark that user has scrolled manually, so auto-scroll doesn't override
    userScrolledRef.current = true;
    
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    
    // For a non-inverted list, we're at the bottom when we've scrolled most of the way down
    // We use a more generous threshold (100px from the max scroll position) to consider "at bottom"
    // This makes it easier for users to trigger the "at bottom" state
    const maxScroll = contentSize.height - layoutMeasurement.height;
    const currentScroll = contentOffset.y;
    const isAtBottom = maxScroll - currentScroll < 100;
    
    // Always notify parent about position
    if (onScrollPositionChange) {
      onScrollPositionChange(isAtBottom);
    }
  }, [onScrollPositionChange]);

  // Add a TypingIndicator component at the end of the list
  const TypingIndicator = () => {
    return <ThinkingIndicator isVisible={true} />;
  };

  // Show empty state if no messages
  if (messages.length === 0 && !isGenerating) {
    return (
      <View style={[styles.container, styles.emptyContainer]}>
        <PaperText style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
          {emptyMessage}
        </PaperText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={[
            styles.messageList,
            contentContainerStyle
          ]}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.1}
          ListFooterComponent={
            <View>
              {isGenerating && <TypingIndicator />}
              {/* Spacer to ensure last message is visible above input */}
              <View style={{ height: inputHeight + 20 }} />
            </View>
          }
          ListHeaderComponent={
            <View style={styles.headerContainer}>
              {/* Removed duplicate loading indicator - using footer typing indicator instead */}
            </View>
          }
          refreshControl={
            onLoadMore ? (
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                colors={[theme.colors.primary]}
                tintColor={theme.colors.primary}
              />
            ) : undefined
          }
          inverted={false}
          initialNumToRender={Math.max(10, messages.length)} // Ensure at least 10 items render initially
          windowSize={10} // Reduced window size for better performance
          maxToRenderPerBatch={10} // Reasonable batch size
          removeClippedSubviews={false}
          getItemLayout={undefined} // Remove fixed height layout to support dynamic message heights
          maintainVisibleContentPosition={{
            minIndexForVisible: 0,
            autoscrollToTopThreshold: 100
          }}
          onContentSizeChange={() => {
            // Only handle scroll on content size change if auto-scroll is enabled
            if (autoScrollToBottom && !userScrolledRef.current) {
              scrollToBottom(false);
            }
          }}
        />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  list: {
    flexGrow: 1,
    padding: 10, 
    paddingBottom: 120,
    backgroundColor: 'transparent',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'transparent',
  },
  typingIndicator: {
    marginTop: 8,
    marginBottom: 8,
    marginLeft: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  typingDots: {
    flexDirection: 'row',
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 2,
  },
  typingText: {
    fontSize: 14,
    opacity: 0.7,
  },
  messageItem: {
    padding: 12,
    borderRadius: 8,
    marginVertical: 4,
    maxWidth: '90%',
    backgroundColor: 'transparent',
  },
  errorMessage: {
    backgroundColor: '#ffdddd',
    alignSelf: 'center',
    margin: 8,
    width: '90%',
    borderWidth: 1,
    borderColor: '#ff0000',
  },
  thinkingView: {
    marginTop: 10,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  headerContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 6,
  },
  typingIndicatorContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'flex-start',
  },
  typingIndicatorBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 18,
    marginBottom: 8,
    maxWidth: '80%',
  },
  typingIndicatorText: {
    fontSize: 14,
    marginRight: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'transparent',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  messageList: {
    flexGrow: 1,
    padding: 10, 
    backgroundColor: 'transparent',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  loadingText: {
    marginLeft: 10,
  },
  loadMoreButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 'auto',
  },
}); 