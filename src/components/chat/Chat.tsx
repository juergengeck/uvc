/**
 * Chat Component
 * 
 * Mobile version of one.leute's Chat component.
 * Uses react-native-paper components instead of MUI.
 * Supports both local AI chat and leute.one chat.
 * Follows ONE platform's local-first and data sovereignty principles.
 */

import React, { useEffect, useState, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { View, StyleSheet, ImageBackground, KeyboardAvoidingView, Platform, TouchableOpacity, Text, Keyboard, Animated, findNodeHandle, UIManager, ActivityIndicator, LayoutChangeEvent, AppState } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useTheme, Surface } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import { getObjectByIdHash } from '@refinio/one.core/lib/storage-versioned-objects.js';
import type { Profile } from '@refinio/one.models/lib/recipes/Leute/Profile';
import { storeArrayBufferAsBlob } from '@refinio/one.core/lib/storage-blob.js';
import { useTranslation } from 'react-i18next';
import { MessageList, MessageListMethods } from './MessageList';
import { InputToolbar } from './InputToolbar';
import { ChatHeader } from './ChatHeader';
import ChatFileSelector from './ChatFileSelector';
import { ProgressIndicator } from './ProgressIndicator';
import { Ionicons } from '@expo/vector-icons';
import type { ChatModel } from '@src/models/chat/ChatModel';
import type TopicRoom from '@refinio/one.models/lib/models/Chat/TopicRoom';
import type { LLM } from '@src/types/llm';
import { Namespaces } from '@src/i18n/namespaces';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel';
import { getAppModelInstance } from '@src/models/AppModel';
import { useProgress } from '@src/providers/ProgressContext';

// Import the background image
const darkBackgroundImage = require('@src/assets/images/new_organic_pattern_dark.png');
const lightBackgroundImage = require('@src/assets/images/new_organic_pattern.png');

interface ChatProps {
  /**
   * The ChatModel instance
   */
  chatModel: ChatModel;

  /**
   * Loading state
   */
  loading?: boolean;


  /**
   * Optional callback for handling message sending
   * If provided, this will be called instead of the default send behavior
   */
  onSendMessage?: (content: string) => Promise<void>;

  /**
   * Optional LLM model to use for generating responses
   */
  llmModel?: {
    generate: (params: {
      input: string;
      maxTokens?: number;
      temperature?: number;
      topP?: number;
      stopTokens?: string[];
    }) => Promise<{
      text: string;
      tokens?: number;
      timeToGenerate?: number;
    }>;
  };
  
  /**
   * Optional back button handler
   * If provided, this will be called when the back button is pressed
   */
  onBackPress?: () => void;
  
  /**
   * Optional handler for topic info press
   */
  onTopicInfoPress?: () => void;
}

/**
 * Cleans LLM response text from control tokens and other artifacts
 */
const cleanResponse = (text: string): string => {
  // Remove thinking tags and their content
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  
  // Also remove unclosed thinking tags
  cleaned = cleaned.replace(/<think>[\s\S]*$/i, '');
  
  // Remove any remaining single think tags
  cleaned = cleaned.replace(/<\/?think>/gi, '');
  
  // Remove common LLM control tokens and artifacts
  return cleaned
    .replace(/\s?[<|]\s?end_?of_?sentence\s?[|>]/gi, '')
    .replace(/\s?[<|]\s?end\s?[|>]/gi, '')
    .replace(/\s?[<|]\s?EOS\s?[|>]/gi, '')
    .replace(/\s?<\s?\|\s?.*?\s?\|\s?>\s?/g, '')
    .trim();
};

// Add a helper function to process messages before displaying
const processMessageText = (message: any) => {
  if (!message || !message.messageRef || !message.messageRef.text) {
    return "";
  }
  
  const text = message.messageRef.text;
  
  // Clean AI-generated responses
  if (message.isAI || message.fromAI) {
    return cleanResponse(text);
  }
  
  return text;
};


export const Chat: React.FC<ChatProps> = ({
  chatModel,
  loading = false,
  onSendMessage,
  llmModel,
  onBackPress,
  onTopicInfoPress,
}) => {
  // Component instance ID for tracking
  const instanceId = React.useRef(`chat-${Math.random().toString(36).substring(2, 10)}`);
  
  const theme = useTheme();
  
  // Derive all topic-related properties from chatModel in one place
  const { topicId, topicTitle, isAIChat } = React.useMemo(() => {
    const id = chatModel?.currentTopic || '';
    const name = chatModel?.getCurrentTopicName?.() || 'Chat';
    const isAI = id.startsWith('chat-with-');
    
    return {
      topicId: id,
      topicTitle: name,
      isAIChat: isAI
    };
  }, [chatModel]);
  const { t } = useTranslation(Namespaces.CHAT);
  const { t: tMessages } = useTranslation(Namespaces.MESSAGES);
  
  // Log component creation only once
  React.useEffect(() => {
    console.log(`[Chat] Component instance ${instanceId.current} mounted`);
    return () => {
      console.log(`[Chat] Component instance ${instanceId.current} unmounted`);
    };
  }, []);
  
  const { id } = useLocalSearchParams<{ id: string }>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<TopicRoom | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isInitialLoadComplete, setIsInitialLoadComplete] = useState(false);
  
  
  const [initialLoadAttempted, setInitialLoadAttempted] = useState(false);
  const messageListRef = useRef<MessageListMethods>(null);
  const messagesRef = React.useRef<any[]>([]);
  const insets = useSafeAreaInsets();
  const [showTopicName, setShowTopicName] = useState(true);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(false);
  const inputContainerRef = useRef(null);
  const inputMeasurements = useRef({ y: 0, height: 0 });
  const [emojiPickerVisible, setEmojiPickerVisible] = useState(false);
  // Progress of the current AI generation (0-100).  null means idle.
  const [generationProgress, setGenerationProgress] = useState<number | null>(null);

  // Get progress context
  const { setGeneratingProgress } = useProgress();

  /* ------------------------------------------------------------------
   * 🔄 Listen for progress events emitted by the AIAssistantModel so we can
   *     show a live progress-bar while the LLM is thinking.
   * ------------------------------------------------------------------ */
  useEffect(() => {
    const appModel = getAppModelInstance();
    const aiAssistant = appModel?.getAIAssistantModel?.();
    if (!aiAssistant) return;

    const off = aiAssistant.onGenerationProgress.listen((tid: string, pct: number) => {
      if (tid === topicId) {
        setGenerationProgress(pct >= 100 ? null : pct);
        
        // Update the ProgressContext so ProgressIndicator can show it
        setGeneratingProgress(pct >= 100 ? 0 : pct);
        
        // When generation completes (100%), clear the generating state
        if (pct >= 100 && pendingRequestIdRef.current) {
          console.log(`[Chat] Generation completed (100%) for topic ${topicId}, clearing isGenerating state`);
          setIsGenerating(false);
          setGeneratingProgress(0);
          
          // Clear the failsafe timeout if it exists
          const requestId = pendingRequestIdRef.current;
          const timeoutId = (window as any)[`timeout_${requestId}`];
          if (timeoutId) {
            clearTimeout(timeoutId);
            delete (window as any)[`timeout_${requestId}`];
            console.log(`[Chat] Cleared timeout for requestId: ${requestId}`);
          }
          
          pendingRequestIdRef.current = null;
        }
      }
    });
    return () => { if (off?.remove) off.remove(); };
  }, [topicId, setGeneratingProgress]);

  /* Pre-load model on topic open (unchanged from previous logic) */
  useEffect(() => {
    if (!isAIChat || !topicId) return;

    const aiAssistant = getAppModelInstance()?.getAIAssistantModel?.();
    if (!aiAssistant) return;

    let cancelled = false;
    (async () => {
      try {
        console.log(`[Chat] 🔄 Preloading model for topic ${topicId}`);
        await aiAssistant.preloadModelForTopic(topicId);
        if (!cancelled) console.log(`[Chat] ✅ Model preloaded for topic ${topicId}`);
      } catch (err) {
        if (!cancelled) console.error('[Chat] ⚠️ Model preload failed:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [isAIChat, topicId]);
  
  // Define animation values for loading indicators
  // Removed loading animation values - using typing indicator in MessageList instead
  
  const [myPersonId, setMyPersonId] = useState<SHA256IdHash<Person> | undefined>();
  const [leuteModel, setLeuteModel] = useState<LeuteModel | undefined>();
  const nameCache = useRef<Map<string, string>>(new Map());
  const [nameCacheVersion, setNameCacheVersion] = useState(0); // Force re-renders when names are resolved
  
  // Memoize the ChatModel reference to prevent unnecessary re-renders
  const chatModelRef = useRef(chatModel);
  
  // Keep track of pending LLM request IDs
  const pendingRequestIdRef = useRef<string | null>(null);
  const previousMessageCountRef = useRef(0);
  
  // Simple scrollToBottom function that uses MessageList's native implementation
  const scrollToBottom = useCallback(() => {
    if (messageListRef.current) {
      console.log(`[Chat] Manual scroll to bottom triggered for ${messages.length} messages`);
      // Pass the animated parameter as true for smooth scrolling
      messageListRef.current.scrollToBottom(true);
      
      // Update state after scrolling
      setIsAtBottom(true);
    }
  }, [messages.length]);
  
  // Update the ref if the chat model changes
  useEffect(() => {
    chatModelRef.current = chatModel;
  }, [chatModel]);
  
  // Fetch myPersonId - needed for message ownership
  useEffect(() => {
    let isMounted = true;
    const fetchMyPersonId = async () => {
      try {
        // Access LeuteModel through ChatModel (assuming it's available)
        const lm = chatModel.getLeuteModel?.();
        if (lm) {
          if (isMounted) setLeuteModel(lm);
          const me = await lm.me();
          if (me) {
            const personId = await me.mainIdentity();
            if (isMounted) {
              setMyPersonId(personId as SHA256IdHash<Person>);
              console.log(`[Chat] Fetched myPersonId: ${personId}`);
            }
          } else {
            console.warn('[Chat] Could not get self (me) from LeuteModel.');
          }
        } else {
          console.warn('[Chat] LeuteModel not available via ChatModel.');
        }
      } catch (error) {
        console.error('[Chat] Error fetching myPersonId:', error);
      }
    };

    fetchMyPersonId();
    return () => { isMounted = false; };
  }, [chatModel]);
  
  // Get messages from the model and ensure they're in the correct order for display
  // Reverse the order to show newest messages at the bottom
  const getOrderedMessages = useCallback(() => {
    if (!chatModelRef.current) return [];
    
    // Get messages from the ChatModel
    const modelMessages = chatModelRef.current.getMessages();
    
    // Debug logging for message ordering
    if (modelMessages.length > 0) {
      console.log(`[Chat.getOrderedMessages] Got ${modelMessages.length} messages from model`);
      console.log(`[Chat.getOrderedMessages] First message (newest): ${modelMessages[0]?.hash?.toString().substring(0, 8)}, text="${modelMessages[0]?.messageRef?.text?.substring(0, 30)}..."`);
      console.log(`[Chat.getOrderedMessages] Last message (oldest): ${modelMessages[modelMessages.length-1]?.hash?.toString().substring(0, 8)}, text="${modelMessages[modelMessages.length-1]?.messageRef?.text?.substring(0, 30)}..."`);
    }
    
    // The messages from ChatModel are sorted newest first (index 0 is newest)
    // For display in the UI, we need oldest first (index 0 is oldest)
    // So we reverse the array
    const displayMessages = [...modelMessages].reverse();
    
    if (displayMessages.length > 0) {
      console.log(`[Chat.getOrderedMessages] After reverse - First message (oldest): ${displayMessages[0]?.hash?.toString().substring(0, 8)}, text="${displayMessages[0]?.messageRef?.text?.substring(0, 30)}..."`);
    }
    
    return displayMessages;
  }, []);
  
  // Replace the relevant useEffect with the new ordering logic
  useEffect(() => {
    console.log(`[Chat] Setting up message subscription for instance ${instanceId.current}`);
    
    // Clear messages first to avoid duplicates during re-render
    setMessages([]);
    setIsInitialLoadComplete(false);
    setInitialLoadAttempted(false); // Reset the attempt flag on topic change
    
    // Verify the ChatModel reference
    console.log(`[Chat] ChatModel available: ${!!chatModelRef.current}, has getMessages: ${!!chatModelRef.current?.getMessages}`);
    if (chatModelRef.current) {
      console.log(`[Chat] ChatModel currentTopic: ${chatModelRef.current.currentTopic}, has currentTopicRoom: ${!!chatModelRef.current["currentTopicRoom"]}`);
    }
    
    // Get initial messages - ChatModel's refreshMessages (called during setTopic) handles loading
    const initialMessages = getOrderedMessages();
    console.log(`[Chat] Loaded ${initialMessages.length} initial messages from ChatModel`);
    
    // CRITICAL: Log details about the first message if present
    if (initialMessages.length > 0) {
      const firstMsg = initialMessages[0];
      console.log(`[Chat] First message details:`, {
        hash: firstMsg?.hash?.toString().substring(0, 8),
        text: firstMsg?.messageRef?.text?.substring(0, 50),
        isUser: firstMsg?.isUser,
        isAI: firstMsg?.isAI,
        isSystem: firstMsg?.isSystem,
        creationTime: firstMsg?.creationTime
      });
    }
    
    // Set messages directly regardless of count
    // Auto-expand the last AI message on initial load
    const messagesWithExpansion = initialMessages.map((msg, index) => ({
      ...msg,
      isExpanded: msg.isAI && index === initialMessages.length - 1
    }));
    setMessages(messagesWithExpansion);
    console.log(`[Chat] Messages state updated with ${initialMessages.length} messages`);
    
    // Store in ref for comparison
    messagesRef.current = initialMessages;
    
    // Always mark initial load as complete, even if there are no messages
    // This prevents loading indicators from showing indefinitely
    setIsInitialLoadComplete(true);
    setInitialLoadAttempted(true);
    
    // Mark messages as read when entering the chat
    const topicId = chatModelRef.current?.currentTopic;
    if (topicId) {
      console.log(`[Chat] Marking messages as read for topic: ${topicId}`);
      try {
        const appModel = getAppModelInstance();
        if (appModel?.notifications) {
          appModel.notifications.resetNotificatioinCountForTopic(topicId);
          console.log(`[Chat] ✅ Reset notification count for topic: ${topicId}`);
        } else {
          console.warn('[Chat] AppModel or notifications not available - cannot mark messages as read');
        }
      } catch (error) {
        console.error('[Chat] Error marking messages as read:', error);
      }
    }
    
    // Signal to scroll to bottom on initial load if we have messages
    if (initialMessages.length > 0 && !initialLoadAttempted) {
      console.log(`[Chat] Setting initial scroll state for ${initialMessages.length} messages`);
      setShouldAutoScroll(true);
      setIsAtBottom(true);
      
      // Scroll will happen via autoScrollToBottom prop
    }
    
    // Subscribe to updates using the ref to prevent dependency changes
    const listener = () => {
      console.log('[Chat] Messages updated event received, loading new messages');
      
      // Get fresh messages in the correct order
      const updatedMessages = getOrderedMessages();
      console.log(`[Chat] Setting ${updatedMessages.length} messages (was ${messagesRef.current.length})`);
      
      // Debug log added messages
      if (updatedMessages.length > messagesRef.current.length) {
        const newMessages = updatedMessages.slice(-(updatedMessages.length - messagesRef.current.length));
        console.log(`[Chat] ${newMessages.length} new messages received`);
        
        // Mark messages as read when new messages arrive (user is actively viewing)
        const currentTopicId = chatModelRef.current?.currentTopic;
        if (currentTopicId) {
          console.log(`[Chat] Marking new messages as read for topic: ${currentTopicId}`);
          try {
            const appModel = getAppModelInstance();
            if (appModel?.notifications) {
              appModel.notifications.resetNotificatioinCountForTopic(currentTopicId);
              console.log(`[Chat] ✅ Reset notification count for new messages in topic: ${currentTopicId}`);
            }
          } catch (error) {
            console.error('[Chat] Error marking new messages as read:', error);
          }
        }
      } else if (updatedMessages.length < messagesRef.current.length) {
        console.log(`[Chat] Message count decreased from ${messagesRef.current.length} to ${updatedMessages.length}!`);
      }
      
      // Check if any new messages were added since last update
      const hadNewMessages = updatedMessages.length > messagesRef.current.length;
      
      // Update the messages while preserving expansion state
      setMessages(prevMessages => {
        // Create a map of current expansion states
        const expansionMap = new Map();
        prevMessages.forEach(msg => {
          if (msg.hash) {
            expansionMap.set(msg.hash.toString(), msg.isExpanded);
          }
        });
        
        // Apply expansion state to updated messages
        return updatedMessages.map((msg, index) => ({
          ...msg,
          // Preserve existing expansion state, or expand if it's a new AI message at the end
          isExpanded: expansionMap.has(msg.hash.toString()) 
            ? expansionMap.get(msg.hash.toString()) 
            : (msg.isAI && index === updatedMessages.length - 1 && updatedMessages.length > prevMessages.length)
        }));
      });
      messagesRef.current = updatedMessages;
      
      // Auto-scroll if we receive new messages while already at the bottom
      if (hadNewMessages && isAtBottom) {
        console.log(`[Chat] New messages while at bottom (${updatedMessages.length} total) - triggering auto-scroll`);
        setShouldAutoScroll(true);
      }
    };
    
    let subscription: any;
    if (chatModelRef.current) {
      subscription = chatModelRef.current.onMessagesUpdate.listen(listener);
    }

    // Return cleanup function
    return () => {
      if (typeof subscription === 'function') {
        subscription();
      } else if (subscription?.remove) {
        subscription.remove();
      }
    };
  }, [chatModel, getOrderedMessages]);

  // Handle keyboard showing - only auto-scroll if at bottom
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      () => {
        setKeyboardVisible(true);
        // Only auto-scroll if already at bottom
        if (isAtBottom) {
          setShouldAutoScroll(true);
        }
      }
    );
    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      () => setKeyboardVisible(false)
    );

    // Clean up listeners
    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, [isAtBottom]);

  // Handle scroll position changes
  const handleScrollPositionChange = useCallback((atBottom: boolean) => {
    if (atBottom !== isAtBottom) {
      console.log(`[Chat] Scroll position changed to ${atBottom ? 'bottom' : 'not bottom'}, messages: ${messages.length}`);
      setIsAtBottom(atBottom);
    }
  }, [isAtBottom, messages.length]);

  // Handle stopping AI generation
  const handleStopGeneration = useCallback(async () => {
    console.log('[Chat] Stop generation requested');
    try {
      const appModel = getAppModelInstance();
      if (appModel?.llmManager) {
        await appModel.llmManager.stopGeneration();
        setIsGenerating(false);
        setGenerationProgress(null);
        setGeneratingProgress(0);
        console.log('[Chat] Generation stopped successfully');
      }
    } catch (error) {
      console.error('[Chat] Error stopping generation:', error);
    }
  }, [setGeneratingProgress]);
  
  // Handle emoji picker toggle
  const handleEmojiPickerToggle = useCallback((isVisible: boolean) => {
    setEmojiPickerVisible(isVisible);
  }, []);

  // Reset auto-scroll flag after a short delay to prevent continuous scrolling
  useEffect(() => {
    if (shouldAutoScroll) {
      const timer = setTimeout(() => {
        console.log(`[Chat] Resetting shouldAutoScroll flag, messages: ${messages.length}`);
        setShouldAutoScroll(false);
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [shouldAutoScroll, messages.length]);

  // Handle sending a message
  const handleSendMessage = useCallback((content: string) => {
    console.log(`[Chat] handleSendMessage called`);
    
    // Validate the content
    if (!content || content.trim() === '') {
      console.log('[Chat] Empty message, not sending');
      return;
    }
    
    console.log('[Chat] onSendMessage available:', !!onSendMessage);
    
    if (onSendMessage) {
      
      // Generate a request ID to track this specific LLM request
      const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      pendingRequestIdRef.current = requestId;
      console.log(`[Chat] Generated tracking requestId: ${requestId}`);
      
      // Immediately add user message to the UI
      const userMessage = {
        hash: `temp-${Date.now()}`,
        isUser: true,
        creationTime: new Date(),
        messageRef: {
          text: content,
          sender: 'user'
        }
      };
      
      // Update UI with the temporary message and collapse all AI messages
      setMessages(prevMessages => [
        ...prevMessages.map(msg => ({
          ...msg,
          isExpanded: false // Collapse all existing messages when sending new one
        })),
        userMessage
      ]);
      
      // Set processing state (but not generating yet - only set that for AI chats)
      setIsProcessing(true);
      
      // Always scroll to show new user message
      setShouldAutoScroll(true);
      
      // Call the callback - fail fast on errors
      console.log(`[Chat] Calling provided onSendMessage handler with requestId: ${requestId}`);
      onSendMessage(content)
        .then(() => {
          console.log(`[Chat] onSendMessage handler completed successfully for requestId: ${requestId}`);
          
          // Clear processing state
          setIsProcessing(false);
          
          // Only set generating state if this is an AI chat
          if (isAIChat) {
            setIsGenerating(true);
            console.log(`[Chat] ✅ Message sent, waiting for AI response for requestId: ${requestId}`);
            
            // Set a failsafe timeout to prevent UI from getting stuck
            const timeoutId = setTimeout(() => {
              if (pendingRequestIdRef.current === requestId) {
                console.warn(`[Chat] Generation timeout for requestId: ${requestId}, clearing generating state`);
                setIsGenerating(false);
                setGeneratingProgress(0);
                pendingRequestIdRef.current = null;
                
                // Add timeout error message
                const timeoutMessage = {
                  hash: `timeout-${Date.now()}`,
                  isError: true,
                  creationTime: new Date(),
                  messageRef: {
                    text: `Response generation timed out. The AI assistant may be processing a complex request or experiencing issues. Please try again.`,
                    sender: 'system'
                  }
                };
                setMessages(prevMessages => [...prevMessages, timeoutMessage]);
                setShouldAutoScroll(true);
              }
            }, 90000); // 90 second timeout
            
            // Store timeout ID for cleanup
            (window as any)[`timeout_${requestId}`] = timeoutId;
          } else {
            console.log(`[Chat] Message sent in non-AI chat for requestId: ${requestId}`);
          }
        })
        .catch(error => {
          // Log the error but don't hide it
          console.error(`[Chat] Error in onSendMessage handler for requestId: ${requestId}:`, error);
          
          // Reset processing states to indicate the error
          setIsProcessing(false);
          setIsGenerating(false);
          setGeneratingProgress(0);
          pendingRequestIdRef.current = null;
          
          // Add error message to the chat - make the error visible
          const errorMessage = {
            hash: `error-${Date.now()}`,
            isError: true,
            creationTime: new Date(),
            messageRef: {
              text: `Error: ${error.message || 'Failed to generate response'}`,
              sender: 'system'
            }
          };
          
          // Show the error in the UI
          setMessages(prevMessages => [...prevMessages, errorMessage]);
          
          // Scroll to show the error
          setShouldAutoScroll(true);
        });
    } else {
      console.warn('[Chat] No onSendMessage handler provided');
    }
  }, [onSendMessage]);

  const answerWithLLM = async (userMessage: string) => {
    if (!llmModel) return;
    
    try {
      setIsGenerating(true);
      
      // Generate response from LLM
      const result = await llmModel.generate({
        input: userMessage,
        maxTokens: 2048,
        temperature: 0.7,
        topP: 0.9,
        stopTokens: ['</s>', '\nuser:', '\nassistant:']
      });
      
      // Send AI response as a new message
      await chatModel.sendMessage(result.text);
      
      // No need for manual scroll - messages change will trigger scroll via useEffect
    } catch (error) {
      console.error('Error generating AI response:', error);
      setError('Failed to generate AI response');
    } finally {
      setIsGenerating(false);
      setGeneratingProgress(0);
    }
  };

  const handleFileSelected = async (files: { uri: string, type: string, name: string }[]) => {
    setIsProcessing(true);
    setError(null);
    try {
      const hashes = await Promise.all(files.map(async file => {
        const response = await fetch(file.uri);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const result = await storeArrayBufferAsBlob(arrayBuffer);
        return result.hash;
      }));

      await chatModel.sendMessageWithAttachments('', hashes as SHA256Hash[]);
      
      // No need for manual scroll - messages change will trigger scroll via useEffect
    } catch (error) {
      console.error('Error sending file:', error);
      setError('Failed to send file');
    } finally {
      setIsProcessing(false);
    }
  };

  // Function to load more messages for pagination
  const loadNextBatch = async () => {
    console.log('[Chat] Loading next batch of messages');
    
    if (!chatModelRef.current) {
      console.warn('[Chat] Cannot load more messages: No chat model available');
      return;
    }
    
    try {
      // Get the first (oldest) message timestamp to use as the "before" parameter
      const oldestMessage = messages[0];
      const timestamp = oldestMessage?.creationTime instanceof Date 
        ? oldestMessage.creationTime.getTime() 
        : undefined;
      
      console.log(`[Chat] Loading messages before timestamp: ${timestamp}`);
      
      // Call loadMoreMessages on the ChatModel
      // This assumes ChatModel will implement loadNextBatch or similar
      await chatModelRef.current.loadNextBatch?.(timestamp);
      
      console.log('[Chat] Successfully loaded next batch of messages');
    } catch (error) {
      console.error('[Chat] Error loading next batch of messages:', error);
    }
  };

  // Handle showing signatures
  const handleShowSignatures = (messageHash: string) => {
    router.push(`/(screens)/messages/signatures/${messageHash}`);
  };

  // When messages change, we don't need special handling
  useEffect(() => {
    // Just update the reference
    messagesRef.current = messages;
    
    // Check for AI response and clear isGenerating flag if needed
    if (pendingRequestIdRef.current && messages && messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      
      // Only clear generating flag if this is a NEW AI message (not from initial load)
      // Check if message count increased and the new message is from AI
      if (latestMessage && latestMessage.isAI && messages.length > previousMessageCountRef.current) {
        console.log(`[Chat] NEW AI response detected (count: ${previousMessageCountRef.current} -> ${messages.length}), clearing isGenerating flag`);
        setIsGenerating(false);
        setGeneratingProgress(0);
        pendingRequestIdRef.current = null;
        
        // Auto-expand new AI message and collapse others
        setMessages(prevMessages => {
          return prevMessages.map((msg, index) => ({
            ...msg,
            // Expand only the new AI message (last one), collapse all other AI messages
            isExpanded: msg.isAI && index === prevMessages.length - 1
          }));
        });
      }
    }
    
    // Always update the previous count
    previousMessageCountRef.current = messages.length;
    
    // Check if the latest message is an error message and make it visible to the user
    if (messages && messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      if (latestMessage && latestMessage.messageRef) {
        const text = latestMessage.messageRef.text || '';
        // Check if it's an error or timeout message
        if (text.includes("couldn't generate") || 
            text.includes("timeout") || 
            text.includes("sorry") && text.includes("error")) {
          // Ensure error messages are always visible by auto-scrolling
          setShouldAutoScroll(true);
          console.log('[Chat] Error message detected, ensuring visibility');
        }
      }
    }
  }, [messages]);

  // Add a function to calculate proper scroll button position
  const getScrollButtonPosition = () => {
    // Get proper bottom position based on input container and safe area
    const inputHeight = inputMeasurements.current.height || 60; // Default if not measured yet
    const buttonMargin = 20; // Space between button and input field
    
    return inputHeight + buttonMargin + (Platform.OS === 'ios' ? insets.bottom : 0);
  };

  // Start animation when loading state changes
  // Removed loading animation effects - using typing indicator in MessageList instead

  // Detect AI message arrivals with smarter tracking
  useEffect(() => {
    // Only run this effect if we're waiting for an LLM response
    if (!pendingRequestIdRef.current || !isGenerating) {
      return;
    }
    
    // Check if we have messages and if there's a new message
    if (messages && messages.length > 0) {
      // Get the last message - our focus is on the newest message
      const latestMessage = messages[messages.length - 1];
      
      // Skip if not a valid message or hash
      if (!latestMessage || !latestMessage.hash) {
        return;
      }
      
      // Check if this is an AI-generated message (not from the user)
      const isAI = isAIMessage(latestMessage);
      
      // Only process AI messages
      if (isAI) {
        console.log(`[Chat] Detected AI message: ${latestMessage.hash.substring(0, 8)} while waiting for LLM response`);
        
        // Get the timestamp of the latest message
        const messageTime = latestMessage.creationTime || new Date();
        
        // Extract the timestamp part from the pending request ID (format: req-timestamp-random)
        const pendingRequestParts = pendingRequestIdRef.current.split('-');
        if (pendingRequestParts.length >= 2) {
          const requestTimestamp = parseInt(pendingRequestParts[1], 10);
          
          // Only consider this a response to our request if:
          // 1. It's from an AI source (not the user)
          // 2. It came after our request was sent
          if (isAI && messageTime.getTime() > requestTimestamp) {
            console.log(`[Chat] AI response detected for request ${pendingRequestIdRef.current}`);
            
            // Check if the message contains actual content (not just "thinking...")
            const messageText = latestMessage.messageRef?.text || '';
            const isThinkingMessage = messageText.toLowerCase().includes('thinking') || 
                                     messageText.includes('...') && messageText.length < 20;
            
            if (!isThinkingMessage && messageText.length > 10) {
              // This is a real AI response, not just a placeholder
              console.log(`[Chat] Real AI content detected, setting failsafe timer to clear generating state`);
              
              // Set a short timer to clear the generating state if progress doesn't reach 100%
              setTimeout(() => {
                if (isGenerating && pendingRequestIdRef.current === pendingRequestParts.join('-')) {
                  console.warn(`[Chat] Progress didn't reach 100% after AI response, forcing state clear`);
                  setIsGenerating(false);
                  setGenerationProgress(null);
                  setGeneratingProgress(0);
                  
                  // Clear the failsafe timeout if it exists
                  const timeoutId = (window as any)[`timeout_${pendingRequestIdRef.current}`];
                  if (timeoutId) {
                    clearTimeout(timeoutId);
                    delete (window as any)[`timeout_${pendingRequestIdRef.current}`];
                  }
                  
                  pendingRequestIdRef.current = null;
                }
              }, 2000); // Wait 2 seconds for progress to complete normally
            }
          }
        }
      }
    }
  }, [messages, isGenerating]);
  
  // Helper to check if a message is from the AI
  const isAIMessage = (message: any) => {
    if (!message) return false;
    
    // AI messages can be identified by:
    // 1. Having isAI flag set to true
    // 2. Having a sender that is not the current user (and myPersonId is defined)
    return (
      message.isAI === true ||
      (myPersonId && message.messageRef?.sender && message.messageRef.sender !== myPersonId) ||
      (myPersonId && message.sender && message.sender !== myPersonId)
    );
  };

  // --- Function to resolve Person ID to Name ---
  const getSenderName = useCallback((personId: SHA256IdHash<Person>): string => {
    // Check cache first
    const cachedName = nameCache.current.get(personId.toString());
    if (cachedName) {
      return cachedName;
    }

    // If not in cache, fetch asynchronously (don't block render)
    // Use an IIFE for the async operation inside useCallback
    (async () => {
      if (!leuteModel) {
        console.warn('[Chat] getSenderName (async fetch) called before LeuteModel is ready.');
        return; // Can't fetch yet
      }
      
      try {
        // Await the promise to get the SomeoneModel
        const someone = await leuteModel.getSomeone(personId);
        
        let resolvedName = `Contact ${personId.toString().substring(0, 8)}`; // Consistent fallback length
        
        if (someone) {
          // Get the main profile
          const profile = await someone.mainProfile();
          if (profile?.personDescriptions?.length > 0) {
            // Look for a PersonName description (same logic as TopicScreen)
            const nameDesc = profile.personDescriptions.find(
              (desc: any) => desc.$type$ === 'PersonName' && (desc as any).name
            );
            if (nameDesc) {
              resolvedName = (nameDesc as any).name;
              console.log(`[Chat] Resolved sender name from PersonName: ${resolvedName}`);
            } else {
              // Fall back to first description with a name
              const firstWithName = profile.personDescriptions.find((desc: any) => (desc as any).name);
              if (firstWithName) {
                resolvedName = (firstWithName as any).name;
                console.log(`[Chat] Resolved sender name from first description: ${resolvedName}`);
              }
            }
          } else {
            console.warn(`[Chat] Someone ${personId.toString().substring(0, 8)} found, but no person descriptions available.`);
          }
        } else {
          console.warn(`[Chat] Could not find Someone with ID: ${personId.toString().substring(0, 8)} during async fetch.`);
        }
        
        // Update cache and trigger potential re-render if name changed
        if (nameCache.current.get(personId.toString()) !== resolvedName) {
          nameCache.current.set(personId.toString(), resolvedName);
          console.log(`[Chat] Cached sender name for ${personId.toString().substring(0,8)}: ${resolvedName}`);
          setNameCacheVersion(prevVersion => prevVersion + 1);
        }
      } catch (error) {
        console.error(`[Chat] Error fetching name async for ID ${personId.toString().substring(0,8)}:`, error);
        // Cache an error state with consistent length
        nameCache.current.set(personId.toString(), `Contact ${personId.toString().substring(0, 8)}`);
      }
    })();
    
    // Return consistent length placeholder while fetching - no more "Loading..."
    return `Contact ${personId.toString().substring(0, 8)}`;
  }, [leuteModel, nameCacheVersion]); // Dependency on leuteModel state and cache version

  // Removed loading indicator - using typing indicator in MessageList instead
  const renderLoadingIndicator = () => {
    if (generationProgress === null) return null;

    // Show progress bar above input
    return (
      <View style={{ position: 'absolute', bottom: 8 + insets.bottom, left: 16, right: 16, alignItems: 'center', zIndex: 200, elevation: 10, pointerEvents: 'none' }}>
        <View style={{ width: '100%', height: 6, backgroundColor: theme.colors.backdrop, borderRadius: 3 }}>
          <View style={{ width: `${generationProgress}%`, height: 6, backgroundColor: theme.colors.primary, borderRadius: 3 }} />
        </View>
      </View>
    );
  };

  // Define constants for UI
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      flex: 1,
    },
    // Removed loading indicator styles - using typing indicator in MessageList instead
    loadingText: {
      fontSize: 14,
    },
    listContainer: {
      flex: 1,
    },
    emptyMessage: {
      textAlign: 'center',
      marginTop: 40,
      color: theme.colors.onSurfaceVariant,
    },
    centeredContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    inputContainer: {
      borderTopWidth: 1,
      borderTopColor: theme.colors.surfaceVariant,
    },
    fullFlex: {
      flex: 1,
    },
    keyboardAvoidingView: {
      flex: 1,
    },
    backButton: {
      position: 'absolute',
      left: 10,
      zIndex: 10,
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    scrollButton: {
      position: 'absolute',
      right: 16,
      zIndex: 100,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 5,
      borderWidth: 1,
      borderColor: theme.dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    inputWrapper: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: 'transparent',
      paddingBottom: Platform.OS === 'ios' ? 0 : 0,
    },
  });

  // Determine if this is a group chat based on participant count
  const isGroupChat = useMemo(() => {
    const count = room?.topic ? Math.max((room.topic as any).participants?.length || 0, 2) : 2;
    return count >= 3;
  }, [room?.topic]);

  // Get contact name for avatar (use topicTitle if available, otherwise try to extract from topic name)
  const contactName = useMemo(() => {
    console.log(`[Chat] contactName calculation: topicTitle="${topicTitle}", room?.topic?.name="${room?.topic?.name}", id="${id}"`);
    return topicTitle || room?.topic?.name || '';
  }, [topicTitle, room?.topic?.name, id]);

  // TODO: Implement proper unread count - for now return 0
  // This would need to access all other topics and count unread messages
  const unreadCount = useMemo(() => {
    // Placeholder for unread count implementation
    // This would typically query the ChatModel or TopicModel for other topics
    // and count messages that haven't been read
    return 0;
  }, []);

  return (
    <View style={styles.container}>
      <ChatHeader
        topicName={(() => {
          const name = topicTitle || room?.topic?.name || '';
          console.log(`[Chat] ChatHeader topicName: "${name}" (topicTitle="${topicTitle}")`);
          return name;
        })()}
        participantCount={room?.topic ? Math.max((room.topic as any).participants?.length || 0, 2) : 2}
        status={loading || isGenerating ? 'connecting' : 'connected'}
        onBack={onBackPress}
        contactName={contactName}
        isGroupChat={isGroupChat}
        unreadCount={unreadCount}
        onTopicInfoPress={onTopicInfoPress || (() => {
          if (id) {
            router.push(`/(screens)/chat/${String(id)}/info`);
          }
        })}
        // avatarSource={undefined} // TODO: Implement avatar source from contact profile
      />
      
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ImageBackground 
          source={theme.dark ? darkBackgroundImage : lightBackgroundImage}
          resizeMode="cover"
          style={styles.fullFlex}
        >
          {/* Main message area */}
            <MessageList
              ref={messageListRef}
              messages={messages.map(msg => ({
                ...msg,
                messageRef: msg.messageRef ? {
                  ...msg.messageRef,
                  // Clean AI message text
                  text: processMessageText(msg)
                } : msg.messageRef
              }))}
              myPersonId={myPersonId}
              onLoadMore={loadNextBatch}
              isGenerating={(loading && !isInitialLoadComplete) || isProcessing || isGenerating}
              emptyMessage={error || tMessages('empty')}
              loadingMessage={isGenerating ? tMessages('generating') : tMessages('loading')}
              contentContainerStyle={{ 
                paddingTop: showTopicName ? 10 : 5,
                paddingBottom: 80,
              }}
              onShowSignatures={handleShowSignatures}
              onScrollPositionChange={handleScrollPositionChange}
              autoScrollToBottom={shouldAutoScroll}
              inputHeight={inputMeasurements.current.height || 60}
              getSenderName={getSenderName}
              isGroupChat={isGroupChat}
            />
          
          {/* Scroll to bottom button - only shows when not at bottom */}
          {!isAtBottom && (
            <TouchableOpacity 
              style={[
                styles.scrollButton,
                {
                  bottom: emojiPickerVisible ? 400 : 80, // Much higher to be well above emoji picker
                }
              ]}
              onPress={scrollToBottom}
              activeOpacity={0.7}
            >
              <View style={{
                backgroundColor: theme.colors.primary,
                width: 36,
                height: 36,
                borderRadius: 18,
                justifyContent: 'center',
                alignItems: 'center',
              }}>
                <MaterialCommunityIcons name="chevron-down" size={28} color={theme.colors.onPrimary} />
              </View>
            </TouchableOpacity>
          )}
          
          {/* Loading indicator container */}
          {renderLoadingIndicator()}
          
          {/* Input toolbar */}
          <View 
            ref={inputContainerRef}
            style={styles.inputWrapper}
            onLayout={(event) => {
              const { height } = event.nativeEvent.layout;
              inputMeasurements.current = { 
                ...inputMeasurements.current, 
                height,
                y: event.nativeEvent.layout.y
              };
            }}
          >
            <InputToolbar
              isProcessing={(loading && !isInitialLoadComplete) || isProcessing || isGenerating}
              onSend={handleSendMessage}
              onFileChange={handleFileSelected}
              onEmojiPickerToggle={handleEmojiPickerToggle}
            />
          </View>
          
          {/* Progress indicator for AI generation */}
          <ProgressIndicator isGenerating={isGenerating} onStop={handleStopGeneration} />
        </ImageBackground>
      </KeyboardAvoidingView>
    </View>
  );
} 