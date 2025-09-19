import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, IconButton } from 'react-native-paper';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useInstance } from '@src/providers/app';
import { useTranslation } from 'react-i18next';
import { Namespaces } from '@src/i18n/namespaces';
import { ChatModel } from '@src/models/chat/ChatModel';
import { Chat } from '@src/components/chat/Chat';
import { getAppModelInstance } from '../../../src/models/AppModel';
import { LoadingSpinner } from '@src/components/LoadingSpinner';
import { ProgressProvider, useProgress } from '@src/providers/ProgressContext';
// Remove the isTopicEntryPending import
// Import ONE core types for proper typing
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
// Fix LLM import to use local type
import type { LLM } from '@src/types/llm';

// Import proper types to avoid type errors
import type TopicModel from '@refinio/one.models/lib/models/Chat/TopicModel.js';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';

// Define a proper interface for the instance to avoid type errors
interface AppInstance {
  topicModel: InstanceType<typeof TopicModel>;
  channelManager: InstanceType<typeof ChannelManager>;
  leuteModel: InstanceType<typeof LeuteModel>;
}

function TopicScreenContent() {
  // Router for navigation
  const router = useRouter();
  
  // Unique ID to track component instances for debugging
  const instanceId = React.useRef(`topic-screen-${Math.random().toString(36).substring(2, 10)}`);
  
  // Log component creation only once on mount
  React.useEffect(() => {
    console.log(`[TopicScreen] Component instance ${instanceId.current} mounted`);
    return () => {
      console.log(`[TopicScreen] Component instance ${instanceId.current} unmounted`);
    };
  }, []);
  
  const { id } = useLocalSearchParams();
  const { instance } = useInstance();
  const { t } = useTranslation(Namespaces.CHAT);
  
  // State for UI and error handling
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadingPhase, setLoadingPhase] = React.useState<string>('entering');
  const [loadingMessage, setLoadingMessage] = React.useState<string>(() => {
    // Initialize with properly translated message
    const key = 'topics.loadingPhases.entering';
    const translated = t(key);
    return translated && translated !== key ? translated : t('topics.loading');
  });
  const [isAITopicLoading, setIsAITopicLoading] = React.useState(false);
  const [topicLoadAttempted, setTopicLoadAttempted] = React.useState(false);
  // Initialize with a proper default for AI topics
  const [chatTitle, setChatTitle] = React.useState<string>(() => {
    const topicId = Array.isArray(id) ? id[0] : id;
    console.log(`[TopicScreen] Initializing chatTitle with id: ${topicId}`);
    if (topicId && typeof topicId === 'string' && topicId.startsWith('chat-with-')) {
      // Extract model name from topic ID
      const modelSlug = topicId.substring('chat-with-'.length);
      // Convert to readable format
      const title = modelSlug
        .replace(/[-_]/g, ' ')
        .replace(/\b(\w)/g, (char) => char.toUpperCase())
        .replace(/Smollm/gi, 'SmolLM')
        .replace(/Q4 K M/g, 'Q4-K-M')
        .replace(/Q8 0/g, 'Q8-0')
        .replace(/Q4 0/g, 'Q4-0');
      console.log(`[TopicScreen] Derived initial title from topic ID: ${title}`);
      return title;
    }
    console.log(`[TopicScreen] No AI topic ID found for initial title`);
    return '';
  });
  const [room, setRoom] = React.useState<any>(null);
  const { setGeneratingProgress } = useProgress();

  // Check if this is an AI chat topic
  const isAITopic = id && typeof id === 'string' && id.startsWith('chat-with-');
  console.log(`[TopicScreen] Topic ID: ${id}, isAITopic: ${isAITopic}`);
  
  // Update loading phase with logging
  const updateLoadingPhase = (phase: string) => {
    console.log(`[TopicScreen] Loading phase: ${phase}`);
    setLoadingPhase(phase);
    
    // Map of technical phase names to user-friendly descriptions
    const phaseDescriptions: Record<string, string> = {
      'entering': 'Preparing to load chat...',
      'checkingConnection': 'Checking connection...',
      'loadingUser': 'Loading your profile...',
      'initializingChat': 'Setting up the chat environment...',
      'loadingTopic': 'Retrieving chat history...',
      'calculatingHash': 'Processing secure identifiers...',
      'ensuringLoaded': 'Verifying data integrity...',
      'initializingAI': 'Preparing AI assistant...',
      'connecting': 'Connecting to chat service...',
      'loadingMessages': 'Retrieving your messages...',
      'configuring': 'Finalizing setup...',
    };
    
    // The translation key should match the structure in the JSON file
    const translationKey = `topics.loadingPhases.${phase}`;
    const translatedMessage = t(translationKey);
    
    console.log(`[TopicScreen] Translation key: ${translationKey}, result: ${translatedMessage}`);
    
    // Priority order: 1. Translations, 2. Custom descriptions, 3. Formatted phase names
    if (translatedMessage && translatedMessage !== translationKey) {
      // Use translation if available
      setLoadingMessage(translatedMessage);
    } else if (phaseDescriptions[phase]) {
      // Use our custom description if available
      setLoadingMessage(phaseDescriptions[phase]);
    } else {
      // Fall back to formatted technical name
      const readablePhase = phase.charAt(0).toUpperCase() + phase.slice(1)
        .replace(/([A-Z])/g, ' $1')
        .replace(/([A-Z])([A-Z])/g, '$1 $2');
      
      setLoadingMessage(`${readablePhase}...`);
    }
  };

  // Initialize chat model
  const [chatModel] = React.useState(() => {
    // Type-cast instance to our known interface to avoid type errors
    const typedInstance = instance as unknown as AppInstance;
    
    if (!typedInstance?.topicModel || !typedInstance?.channelManager || !typedInstance?.leuteModel) {
      console.error("[TopicScreen] Missing required models for chat initialization");
      return null;
    }
    console.log("[TopicScreen] Creating ChatModel instance");
    
    // Get the AppModel instance first to access LLMManager
    const appModelInstance = getAppModelInstance ? getAppModelInstance() : null;
    
    if (!appModelInstance) {
      console.error("[TopicScreen] AppModelInstance not available, cannot initialize ChatModel properly");
      return null;
    }
    
    // Get LLMManager from AppModel
    const llmManager = appModelInstance.getModelManager();
    
    if (!llmManager) {
      console.error("[TopicScreen] LLMManager not available from AppModel, cannot initialize ChatModel properly");
      return null;
    }

    // Get AIAssistantModel if available
    const aiAssistantModel = appModelInstance.getAIAssistantModel?.();
    
    // Create ChatModel with all required dependencies including LLMManager and AIAssistantModel
    // CRITICAL: Use channelManager from AppModel to ensure same instance as LeuteAccessRightsManager
    const newChatModel = new ChatModel(
      typedInstance.topicModel,
      appModelInstance.channelManager, // Use AppModel's channelManager for consistency
      typedInstance.leuteModel,
      { 
        llmManager,
        appModel: appModelInstance // CRITICAL: Pass AppModel for access rights
      }
    );
    
    // Connect chat model with AI assistant if available
    console.log("[TopicScreen] **DIAGNOSTIC** AppModelInstance methods:", 
      Object.getOwnPropertyNames(appModelInstance)
        .filter(prop => typeof (appModelInstance as any)[prop] === 'function')
        .join(', ')
    );
    console.log("[TopicScreen] **DIAGNOSTIC** connectChatWithAI method available:", 
      typeof appModelInstance.connectChatWithAI === 'function'
    );
    console.log("[TopicScreen] **DIAGNOSTIC** aiAssistantModel available:", 
      !!appModelInstance.aiAssistantModel
    );
    
    if (appModelInstance?.connectChatWithAI) {
      console.log("[TopicScreen] Connecting ChatModel with AIAssistantModel");
      try {
        appModelInstance.connectChatWithAI(newChatModel);
        console.log("[TopicScreen] **DIAGNOSTIC** ChatModel successfully connected with AIAssistantModel");
      } catch (error) {
        console.error("[TopicScreen] Error connecting ChatModel with AI:", error);
      }
    } else {
      console.warn("[TopicScreen] Cannot connect ChatModel with AI: AppModel instance not available");
    }
    
    return newChatModel;
  });

  // Load the topic when component mounts or ID changes
  React.useEffect(() => {
    const loadTopic = async () => {
      const topicId = Array.isArray(id) ? id[0] : id;
      
      if (!topicId || topicLoadAttempted) {
        return; // Prevent duplicate loads
      }

      setTopicLoadAttempted(true);
      console.log('[TopicScreen] Starting to load topic:', topicId);
      setIsLoading(true);
      setError(null);

      try {
        if (!chatModel) {
          console.error('[TopicScreen] ChatModel not available');
          setError('Chat system not available');
          return;
        }
        
        // Enter the topic room
        console.log('[TopicScreen] Entering topic room...');
        const room = await chatModel.enterTopicRoom(topicId);
        setRoom(room);
        console.log('[TopicScreen] ✅ Successfully entered topic room');
        
        // CRITICAL: Preload AI model if this is an AI chat topic
        const appModelInstance = getAppModelInstance ? getAppModelInstance() : null;
        const aiAssistantModel = appModelInstance?.getAIAssistantModel?.();
        
        if (aiAssistantModel && topicId) {
          console.log('[TopicScreen] Checking if topic has AI participants...');
          try {
            const hasAI = await aiAssistantModel.checkTopicHasAIParticipant(topicId);
            if (hasAI) {
              console.log('[TopicScreen] Topic has AI participants, preloading model...');
              await aiAssistantModel.preloadModelForTopic(topicId);
              console.log('[TopicScreen] Model preloaded successfully');
            } else {
              console.log('[TopicScreen] Topic has no AI participants, skipping model preload');
            }
          } catch (preloadError) {
            console.error('[TopicScreen] Failed during AI participant check or model preload:', preloadError);
            // Continue anyway - model will be loaded on demand when first message is sent
          }
        }
        
        // Resolve the chat title for AI topics
        if (isAITopic && aiAssistantModel) {
          console.log(`[TopicScreen] Attempting to get display name for AI topic: ${topicId}`);
          const displayName = aiAssistantModel.getTopicDisplayName(topicId);
          console.log(`[TopicScreen] getTopicDisplayName returned: ${displayName}`);
          if (displayName && displayName !== chatTitle) {
            setChatTitle(displayName);
            console.log(`[TopicScreen] ✅ Chat title updated to: ${displayName}`);
          }
        }

      } catch (error) {
        console.error('[TopicScreen] Failed to load topic:', error);
        setError(`Failed to load chat: ${error}`);
        // Reset the attempt flag so user can retry
        setTopicLoadAttempted(false);
      } finally {
        setIsLoading(false);
      }
    };

    loadTopic();
  }, [id, chatModel, topicLoadAttempted]);
  
  // Reset load attempt when ID changes
  React.useEffect(() => {
      setTopicLoadAttempted(false);
    setChatTitle(''); // Reset title
  }, [id]);

  // Handle message sending
  const handleSendMessage = async (content: string) => {
    console.log(`[TopicScreen] handleSendMessage called on instance ${instanceId.current}`);
    console.log('Content:', content);
    
    if (!chatModel) {
      console.error('[TopicScreen] Chat model not available for sending message');
      return;
    }
    
    try {
      console.log('[TopicScreen] Sending message through ChatModel');
      await chatModel.sendMessage(content);
      console.log('[TopicScreen] Message sent successfully');
    } catch (error) {
      console.error('[TopicScreen] Error sending message:', error);
    }
  };

  // Effect to check and track AI topic loading state
  // This hook MUST always be called in the same order, even if isAITopic is false
  React.useEffect(() => {
    // Only execute the effect logic if this is an AI topic
    if (!isAITopic || !id || typeof id !== 'string' || !getAppModelInstance) {
      return; // Early return without doing anything if conditions aren't met
    }
    
    const appModelInstance = getAppModelInstance();
    if (!appModelInstance || !appModelInstance.aiAssistantModel) {
      return; // Early return if model instance isn't available
    }
    
    const aiModel = appModelInstance.getAIAssistantModel();
    if (!aiModel) {
      return; // Early return if AI model isn't available
    }
    
    // Check if AIModel has the needed methods
    if (typeof (aiModel as any).isTopicLoading !== 'function' || 
        !(aiModel as any).onTopicLoadingStateChanged) {
      console.warn('[TopicScreen] AIModel does not have required methods for loading state tracking');
      return;
    }
    
    // Check initial loading state
    const initialLoading = (aiModel as any).isTopicLoading(id);
    setIsAITopicLoading(initialLoading);
    
    // Listen for loading state changes
    const unsubscribe = (aiModel as any).onTopicLoadingStateChanged.listen((topicId: string, isLoading: boolean) => {
      if (topicId === id) {
        setIsAITopicLoading(isLoading);
      }
    });
    
    return () => {
      if (unsubscribe && typeof unsubscribe.remove === 'function') {
        unsubscribe.remove();
      }
    };
  }, [id, isAITopic, getAppModelInstance]);
  
  // Subscribe to LlamaModel generation progress events
  React.useEffect(() => {
    // Only subscribe if this is an AI topic
    if (!isAITopic) {
      return;
    }
    
    console.log('[TopicScreen] Setting up generation progress listener for AI topic');
    
    // Subscribe to generation progress events from AIAssistantModel
    const aiAssistant = appModel?.aiaModel;
    if (aiAssistant && aiAssistant.onGenerationProgress) {
      const unsubscribeProgress = aiAssistant.onGenerationProgress.listen((topicId, progress) => {
        // Only update progress for this topic
        if (topicId === id) {
          console.log(`[TopicScreen] Generation progress: ${progress}%`);
          setGeneratingProgress(progress);
          
          // Reset progress after completion
          if (progress === 100) {
            setTimeout(() => setGeneratingProgress(0), 1000);
          }
        }
      });
      
      // Cleanup
      return () => {
        unsubscribeProgress();
      };
    } else {
      console.warn('[TopicScreen] AIAssistantModel or onGenerationProgress not available');
    }
  }, [isAITopic]);

  /**
   * Resolve the other participant's name for one-to-one chats
   */
  // Resolve the other party's name for 1-1 chats
  // Falls back gracefully to truncated IDs when names are unavailable.
  const resolveOtherParticipantName = async (topicId: string): Promise<string> => {
    try {
      if (!chatModel) {
        console.warn('[TopicScreen] ChatModel not available for name resolution');
        return topicId; // Fallback to topic ID
      }

      const topicModel = chatModel.getTopicModel();
      const leuteModel = chatModel.getLeuteModel();

      // Check if this is a one-to-one chat
      if (!topicModel.isOneToOneChat || !topicModel.isOneToOneChat(topicId)) {
        console.log('[TopicScreen] Not a one-to-one chat, using topic ID as title');
        return topicId;
      }

      // Get participants from the topic ID  
      if (!topicModel.getOneToOneChatParticipants) {
        console.warn('[TopicScreen] getOneToOneChatParticipants method not available');
        return topicId;
      }

      const participants = topicModel.getOneToOneChatParticipants(topicId);
      if (!participants || participants.length !== 2) {
        console.warn('[TopicScreen] Invalid participants for one-to-one chat');
        return topicId;
      }

      // Get current user ID
      const myPersonId = await leuteModel.myMainIdentity();
      if (!myPersonId) {
        console.warn('[TopicScreen] Could not get current user ID');
        return topicId;
      }

      // Helper to resolve a person's display name (own or other)
      const resolveName = async (personId: any): Promise<string> => {
        // Try to resolve from Someone → mainProfile → PersonName descriptor
        const someone = await leuteModel.getSomeone(personId);
        if (someone) {
          const profile = await someone.mainProfile();
          if (profile?.personDescriptions?.length > 0) {
            const nameDesc = profile.personDescriptions.find((d: any) => d.$type$ === 'PersonName' && d.name);
            if (nameDesc) return nameDesc.name;
            const firstWithName = profile.personDescriptions.find((d: any) => d.name);
            if (firstWithName) return firstWithName.name;
          }
        }
        // Fallback – use truncated technical id
        return personId.toString().substring(0, 8);
      };

      // Find the other participant (not me)
      const otherParticipant = participants.find(p => p.toString() !== myPersonId.toString());
      if (!otherParticipant) {
        console.warn('[TopicScreen] Could not find other participant');
        return topicId;
      }

      // Resolve the other participant's name
      const otherName = await resolveName(otherParticipant);

      // For 1-1 chats, just show the other party's name
      console.log('[TopicScreen] Resolved chat title:', otherName);
      return otherName;

    } catch (error) {
      console.error('[TopicScreen] Error resolving participant name:', error);
      return topicId; // Final fallback
    }
  };

  // Handle back button press
  const handleBackPress = () => {
    router.back();
  };

  // Show loading state
  if (isLoading) {
    return (
      <View style={styles.container}>
        <Stack.Screen 
          options={{
            headerShown: false // Hide the Stack header completely
          }}
        />
        <View style={styles.centerContent}>
          <LoadingSpinner
            message="Loading Chat"
            subtitle={loadingMessage}
          />
        </View>
      </View>
    );
  }

  // Show error state
  if (error) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  // Show error if chat model is not available
  if (!chatModel) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>Chat model unavailable. Please restart the app.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{
          headerShown: false // Hide the Stack header completely
        }}
      />
      <Chat
        chatModel={chatModel}
        loading={isAITopicLoading}
        onSendMessage={handleSendMessage}
        onBackPress={handleBackPress}
        topicTitle={chatTitle}
        isAIChat={isAITopic}
      />
    </View>
  );
}

export default function TopicScreen() {
  return (
    <ProgressProvider>
      <TopicScreenContent />
    </ProgressProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  loadingPhase: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
    opacity: 0.8,
    fontStyle: 'italic',
  },
  errorText: {
    color: '#d32f2f',
    textAlign: 'center',
  },
}); 