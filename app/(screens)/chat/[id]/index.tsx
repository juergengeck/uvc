import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Text, ActivityIndicator, useTheme } from 'react-native-paper';
import { Chat } from '@src/components/chat/Chat';
import { useInstance } from '@src/providers/app';
import { Stack, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StatusBar } from 'expo-status-bar';
import { ChatModel } from '@src/models/chat/ChatModel';
import { LlamaModel } from '@src/models/ai/LlamaModel';

/**
 * Dynamic chat route component that handles individual chat rooms
 * Accepts a topic ID parameter and renders the chat interface
 */
export default function ChatRoom() {
  const { id } = useLocalSearchParams();
  const { instance, isAuthenticated, authState, models } = useInstance();
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { t } = useTranslation();
  const [chatModel, setChatModel] = React.useState<ChatModel | null>(null);
  const [generatingProgress, setGeneratingProgress] = React.useState(0);
  const navigation = useNavigation();
  const router = useRouter();
  const theme = useTheme();
  const progressListenerRef = React.useRef<any>(null);

  // Enhanced debug logging for diagnosis
  React.useEffect(() => {
    console.log(`[ChatRoom] Component mounted, auth state: ${authState}, authenticated: ${isAuthenticated}`);
    console.log(`[ChatRoom] Topic ID: ${String(id)}`);
    
    if (instance) {
      console.log(`[ChatRoom] Instance state: ${instance.currentState}`);
      console.log('[ChatRoom] Available instance properties:', Object.keys(instance));
      
      // Check if models are available from the enhanced hook
      console.log('[ChatRoom] Models from hook available:', !!models);
      if (models) {
        const modelStatus = {
          topicModel: !!models.topicModel,
          channelManager: !!models.channelManager,
          leuteModel: !!models.leuteModel,
          llmManager: !!models.llmManager,
          aiAssistantModel: !!models.aiAssistantModel
        };
        console.log('[ChatRoom] Models availability from hook:', modelStatus);
      }
    } else {
      console.warn('[ChatRoom] Instance not available');
    }
  }, [instance, isAuthenticated, authState, models, id]);

  // Add a proper back handler
  const handleBackPress = React.useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // Add message handler to send messages to the AI assistant
  const handleSendMessage = React.useCallback(async (content: string) => {
    console.log('[ChatRoom] handleSendMessage called with:', content);
    console.log('[ChatRoom] chatModel available:', !!chatModel);
    console.log('[ChatRoom] models available:', !!models);
    console.log('[ChatRoom] aiAssistantModel available:', !!models?.aiAssistantModel);
    
    if (!chatModel) {
      console.error('[ChatRoom] Cannot send message - chat model not available');
      throw new Error('Chat model not available');
    }
    
    if (!models?.aiAssistantModel) {
      console.warn('[ChatRoom] AI assistant model not available - messages will be sent but AI won\'t respond');
    }
    
    try {
      console.log(`[ChatRoom] Sending message to topic ${chatModel.currentTopic}: ${content}`);
      
      // Just send the message through the chat model
      // The AIAssistantModel will automatically detect and handle it via channel listeners
      await chatModel.sendMessage(content);
      
      // Remove manual AI handling - let the channel listener handle it automatically
      console.log('[ChatRoom] Message sent, AI will respond automatically via channel listener');
    } catch (error) {
      console.error('[ChatRoom] Error handling message:', error);
      throw error;
    }
  }, [chatModel, models?.aiAssistantModel]);

  // Add handler for navigating to topic info
  const handleTopicInfoPress = React.useCallback(() => {
    if (id) {
      router.push(`/(screens)/chat/${String(id)}/info`);
    }
  }, [id, router]);

  React.useEffect(() => {
    async function initChat() {
      try {
        console.log('[ChatRoom] Starting chat initialization...');
        
        // Skip if we already have a ChatModel for this topic ID
        if (chatModel && chatModel.currentTopic === String(id)) {
          console.log(`[ChatRoom] ChatModel already exists for topic ${String(id)}, skipping initialization`);
          setIsLoading(false);
          return;
        }
        
        if (!instance) {
          console.error('[ChatRoom] Instance not available');
          throw new Error('Instance not available');
        }
        
        // Check if models are ready instead of initializing
        console.log(`[ChatRoom] Checking instance state: ${instance.currentState}`);
        if (instance.currentState !== 'Initialised') {
          console.error(`[ChatRoom] Instance not initialized: ${instance.currentState}`);
          throw new Error('Instance not initialized');
        }

        // Use the properly typed models from the hook if available
        if (!models) {
          console.error('[ChatRoom] Models not available from hook');
          throw new Error('Models not available');
        }
        
        const { topicModel, channelManager, leuteModel, llmManager, aiAssistantModel } = models;
        
        console.log('[ChatRoom] Required models availability:', {
          topicModel: !!topicModel,
          channelManager: !!channelManager,
          leuteModel: !!leuteModel,
          llmManager: !!llmManager
        });
        
        if (!topicModel || !channelManager || !leuteModel || !llmManager) {
          console.error('[ChatRoom] Required models not available:', {
            topicModel: !!topicModel,
            channelManager: !!channelManager,
            leuteModel: !!leuteModel,
            llmManager: !!llmManager
          });
          
          // Additional logging for missing models
          if (!topicModel) console.error('[ChatRoom] TopicModel is missing from instance');
          if (!channelManager) console.error('[ChatRoom] ChannelManager is missing from instance');
          if (!leuteModel) console.error('[ChatRoom] LeuteModel is missing from instance');
          if (!llmManager) console.error('[ChatRoom] LLMManager is missing from instance');
          
          throw new Error('Required models not available');
        }
        
        // CRITICAL: Ensure all topics have welcome messages to prevent the initialization loop
        // This must be called before creating the ChatModel
        // Note: AIAssistantModel is only needed for chats with LLM participants
        if (aiAssistantModel) {
          try {
            console.log('[ChatRoom] Ensuring all topics have welcome messages...');
            await aiAssistantModel.ensureTopicsForModels();
            console.log('[ChatRoom] Topic welcome messages verified');
            
            // Subscribe to progress events
            const progressListener = aiAssistantModel.onGenerationProgress.listen((topicId, progress) => {
              if (topicId === String(id)) {
                console.log(`[ChatRoom] Progress update for current topic: ${progress}%`);
                setGeneratingProgress(progress);
                
                // If we hit 100%, reset after a delay
                if (progress >= 100) {
                  setTimeout(() => setGeneratingProgress(0), 1000);
                }
              }
            });
            
            // Store listener for cleanup
            progressListenerRef.current = progressListener;
            
            // CRITICAL: For AI chat topics, preload the model to avoid lazy loading
            if (id) {
              console.log('[ChatRoom] Checking if topic has AI participants...');
              try {
                const hasAI = await aiAssistantModel.checkTopicHasAIParticipant(String(id));
                if (hasAI) {
                  console.log('[ChatRoom] Topic has AI participants, preloading model...');
                  await aiAssistantModel.preloadModelForTopic(String(id));
                  console.log('[ChatRoom] Model preloaded successfully');
                } else {
                  console.log('[ChatRoom] Topic has no AI participants, skipping model preload');
                }
              } catch (preloadError) {
                console.error(`[ChatRoom] Failed during AI participant check or model preload:`, preloadError);
                // Continue anyway - model will be loaded on demand when first message is sent
              }
            }
          } catch (ensureError) {
            console.error('[ChatRoom] Error ensuring topics have welcome messages:', ensureError);
            // Continue anyway - better to attempt chat creation than fail
          }
        } else {
          console.debug('[ChatRoom] AIAssistantModel not available (normal for regular person-to-person chats)');
        }
        
        // Create the ChatModel instance
        // Note: AI services connect externally as endpoints, like chums
        // CRITICAL: Use channelManager from AppModel to ensure same instance as LeuteAccessRightsManager
        const model = new ChatModel(
          topicModel,
          instance.channelManager, // Use AppModel's channelManager for consistency
          leuteModel,
          {
            llmManager: llmManager,
            appModel: instance // CRITICAL: Pass AppModel for access rights
          }
        );
        
        console.log('[ChatRoom] ChatModel created successfully');
        
        // Set topic ID
        if (id) {
          console.log(`[ChatRoom] Setting topic: ${String(id)}`);
          await model.setTopic(String(id));
          console.log(`[ChatRoom] Topic set successfully: ${String(id)}`);
        }
        
        setChatModel(model);
        setIsLoading(false);
        console.log('[ChatRoom] Initialization complete');
      } catch (err) {
        console.error('[ChatRoom] Error initializing chat:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize chat');
        setIsLoading(false);
      }
    }

    if (isAuthenticated) {
      console.log('[ChatRoom] User authenticated, initializing chat...');
      initChat();
    } else {
      console.log('[ChatRoom] User not authenticated, skipping initialization');
    }
  }, [instance, models, isAuthenticated, id, chatModel]);

  // Handle back button
  React.useEffect(() => {
    // Listen for navigation events
    return navigation.addListener('beforeRemove', () => {
      console.log('[ChatRoom] Navigating away from chat screen');
    });
  }, [navigation]);

  // Listen to LlamaModel progress events
  React.useEffect(() => {
    const llamaModel = LlamaModel.getInstance();
    
    // Subscribe to model loading progress events
    const unsubscribeLoadProgress = llamaModel.onLoadProgress.listen((event) => {
      console.log(`[ChatRoom] Model loading progress: ${event.progress}%`);
      setGeneratingProgress(event.progress);
    });
    
    // Subscribe to token generation progress events
    const unsubscribeTokenProgress = llamaModel.onTokenGenerated.listen((event) => {
      console.log(`[ChatRoom] Token generation progress: ${event.progress}%`);
      setGeneratingProgress(event.progress);
    });
    
    // Subscribe to state changes to properly reset progress
    const unsubscribeState = llamaModel.onStateChanged.listen((event) => {
      if (event.state === 'generating') {
        console.log('[ChatRoom] LlamaModel started generating');
        setGeneratingProgress(0); // Reset to 0% when generation starts
      } else if (event.state === 'ready' && event.previous === 'generating') {
        console.log('[ChatRoom] LlamaModel finished generating');
        // Just reset to 0, don't show 100%
        setGeneratingProgress(0);
      }
    });
    
    return () => {
      unsubscribeLoadProgress();
      unsubscribeTokenProgress();
      unsubscribeState();
      // Cleanup progress listener
      if (progressListenerRef.current) {
        progressListenerRef.current();
        progressListenerRef.current = null;
      }
      // Reset progress when unmounting
      setGeneratingProgress(0);
    };
  }, []);


  // Define styles with theme
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    loadingText: {
      marginTop: 16,
      textAlign: 'center',
    },
    errorText: {
      color: '#d32f2f',
      textAlign: 'center',
      marginTop: 24,
      fontSize: 16,
    },
    errorDescription: {
      color: '#666',
      textAlign: 'center',
      marginTop: 8,
      fontSize: 14,
      paddingHorizontal: 24,
    },
  });

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <Text>{t('common.errors.unauthorized')}</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>{t('common.status.loading')}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        <Text style={styles.errorDescription}>
          {instance?.currentState !== 'Initialised'
            ? `App model state: ${instance?.currentState}`
            : 'Model initialization failed'}
        </Text>
      </View>
    );
  }

  if (!chatModel) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{t('common.errors.modelsNotAvailable')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Configure native header to be completely hidden */}
      <Stack.Screen
        options={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { 
            backgroundColor: 'transparent',
          }
        }}
      />
      {/* Our Chat component will handle its own header through ChatHeader */}
      <StatusBar style="auto" />
      <Chat 
        chatModel={chatModel}
        onBackPress={handleBackPress}
        onSendMessage={handleSendMessage}
        onTopicInfoPress={handleTopicInfoPress}
        generatingProgress={generatingProgress}
      />
    </View>
  );
}