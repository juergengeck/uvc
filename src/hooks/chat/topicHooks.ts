/**
 * Hooks for chat topic management
 */

import { useCallback, useEffect, useState } from 'react';
import type TopicModel from '@refinio/one.models/lib/models/Chat/TopicModel.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import type TopicRoom from '@refinio/one.models/lib/models/Chat/TopicRoom.js';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import { Order } from '@refinio/one.models/lib/models/ChannelManager.js';
import { useModelState } from '../useModelState';
import { useModel } from '../model';
import type { TopicListItem } from '@/types/chat';

export interface Topic {
  id: string;
  name: string;
}

/**
 * Hook to get the topic ID for a chat between two users
 */
export function useTopicId(
  topicModel: TopicModel,
  myPersonId?: SHA256IdHash<Person>,
  otherPersonId?: SHA256IdHash<Person>
): string | undefined {
  const [topicId, setTopicId] = useState<string>();

  useEffect(() => {
    if (!myPersonId || !otherPersonId) return;

    async function createTopic() {
      try {
        console.log(`[useTopicId] Creating topic between ${myPersonId} and ${otherPersonId}`);
        
        // Get the ChannelManager from the TopicModel
        const channelManager = (topicModel as any).channelManager;
        if (!channelManager) {
          console.error('ChannelManager not available from TopicModel');
          return;
        }

        // Try to create the topic safely, which will return existing topic if it exists
        // This is the reliable way to get a topic - createOneToOneTopic is idempotent
        // and will return existing topic if found
        
        // TopicModel.createOneToOneTopic already handles ID sorting internally
        console.log(`[useTopicId] Creating topic between ${myPersonId.toString().substring(0, 8)}... and ${otherPersonId.toString().substring(0, 8)}...`);
        
        // Use createOneToOneTopic directly - it handles sorting and deduplication internally
        const topic = await topicModel.createOneToOneTopic(
          myPersonId,
          otherPersonId
        );
        console.log(`[useTopicId] Topic created/found: ${topic.id}`);
        
        // CRITICAL FIX: Ensure both participants have access to the topic and channel
        // This should happen automatically via addTopicToRegistry -> applyAccessRightsIfOneToOneChat
        // but let's verify and fix manually if needed
        try {
          console.log(`[useTopicId] Checking if access rights setup is needed for topic ${topic.id}`);
          
          // Check if this is a one-to-one topic pattern
          if (topicModel.isOneToOneChat && topicModel.isOneToOneChat(topic.id)) {
            console.log(`[useTopicId] This is a one-to-one topic, ensuring access rights are set up`);
            
            // Get participants (should be [myPersonId, otherPersonId])
            const participants = topicModel.getOneToOneChatParticipants 
              ? topicModel.getOneToOneChatParticipants(topic.id)
              : [myPersonId, otherPersonId];
              
            console.log(`[useTopicId] Topic participants: ${participants.join(', ')}`);
            
            // Ensure access rights using the TopicModel method if available
            if (topicModel.addPersonsToTopic) {
              console.log(`[useTopicId] Manually ensuring access rights for participants`);
              await topicModel.addPersonsToTopic(participants, topic);
              console.log(`[useTopicId] Access rights setup completed`);
            } else {
              console.warn(`[useTopicId] addPersonsToTopic method not available on TopicModel`);
            }
          } else {
            console.log(`[useTopicId] Not a one-to-one topic pattern: ${topic.id}`);
          }
        } catch (accessError) {
          console.error(`[useTopicId] Error setting up access rights:`, accessError);
          // Continue anyway - the automatic hook might have worked
        }
        
        setTopicId(topic.id);
        console.log(`[useTopicId] Topic setup completed: ${topic.id}`);
      } catch (error) {
        console.error('Error creating one-to-one topic:', error);
      }
    }

    createTopic();
  }, [topicModel, myPersonId, otherPersonId]);

  return topicId;
}

/**
 * Hook to get a topic room by channel ID using content-addressed storage pattern
 */
export function useTopicRoomByChannelId(
  topicModel: TopicModel,
  channelId?: string
): TopicRoom | undefined {
  const [topicRoom, setTopicRoom] = useState<TopicRoom>();

  useEffect(() => {
    if (!channelId) return;
    const id = channelId; // Create a stable reference to the non-undefined value

    let disconnect: (() => void) | undefined;
    let isSubscribed = true;

    async function enterRoom() {
      try {
        console.log(`[useTopicRoomByChannelId] Starting to enter room for topic ID: ${id}`);
        
        // Get the topic hash first
        console.log(`[useTopicRoomByChannelId] Getting topic hash for ID: ${id}`);
        const topicHash = await topicModel.topics.queryHashById(id);
        if (!topicHash) {
          console.error('[useTopicRoomByChannelId] Topic not found:', id);
          return;
        }
        console.log(`[useTopicRoomByChannelId] Found topic hash: ${topicHash}`);

        // Get the topic object
        console.log(`[useTopicRoomByChannelId] Getting topic object for ID: ${id}`);
        const topic = await topicModel.topics.queryById(id);
        if (!topic) {
          console.error('[useTopicRoomByChannelId] Topic data not found:', id);
          return;
        }
        console.log(`[useTopicRoomByChannelId] Found topic: ${JSON.stringify({
          id: topic.id,
          name: topic.name,
          channel: topic.channel
        })}`);

        // Enter the room with verified topic
        console.log(`[useTopicRoomByChannelId] Entering topic room for ID: ${id}`);
        const room = await topicModel.enterTopicRoom(id);
        console.log(`[useTopicRoomByChannelId] Successfully entered room for topic: ${id}`);
        
        if (isSubscribed) {
          setTopicRoom(room);
          console.log(`[useTopicRoomByChannelId] Set topic room state for ID: ${id}`);

          // Subscribe to new messages using a stable callback
          const onNewMessage = () => {
            console.log(`[useTopicRoomByChannelId] New message received in topic: ${id}`);
          };
          disconnect = room.onNewMessageReceived(onNewMessage);
          console.log(`[useTopicRoomByChannelId] Subscribed to new messages for topic: ${id}`);
        }
      } catch (error) {
        console.error(`[useTopicRoomByChannelId] Error entering topic room for ID ${id}:`, error);
        // Additional details for debugging
        if (error instanceof Error) {
          console.error(`[useTopicRoomByChannelId] Error type: ${error.name}`);
          console.error(`[useTopicRoomByChannelId] Error message: ${error.message}`);
          console.error(`[useTopicRoomByChannelId] Error stack: ${error.stack}`);
        }
      }
    }

    enterRoom();

    // Cleanup when unmounting or channelId changes
    return () => {
      isSubscribed = false;
      if (disconnect) {
        disconnect();
      }
    };
  }, [channelId, topicModel]);

  return topicRoom;
}

/**
 * Hook to fetch and filter topics
 * This version includes better error handling and initialization checks
 * @param topicModel TopicModel instance 
 * @param channelManager ChannelManager instance
 * @param limit Maximum number of topics to return
 * @param includeSystemTopics Whether to ensure system topics are included (default: true)
 * @returns Array of TopicListItem objects
 */
export function useTopics(
  topicModel?: TopicModel,
  channelManager?: ChannelManager,
  limit: number = 10,
  includeSystemTopics: boolean = true
): TopicListItem[] {
  const [topics, setTopics] = useState<TopicListItem[]>([]);
  const oneContext = useModel();
  const model = oneContext?.model;
  const { isReady } = useModelState(model, 'AppModel');

  useEffect(() => {
    // Skip if dependencies aren't ready
    if (!topicModel || !channelManager) {
      console.log('[useTopics] Missing required dependencies:', {
        hasTopicModel: !!topicModel,
        hasChannelManager: !!channelManager,
        isReady
      });
      return;
    }

    // Check if model is in Initialised state 
    const isModelInitialized = model?.state?.currentState === 'Initialised';
    if (!isModelInitialized) {
      console.log('[useTopics] Model not initialized yet, skipping topic loading');
      return;
    }

    console.log('[useTopics] Loading topics with model and dependencies available');

    // Helper function to safely call queryById with proper parameters
    const safeQueryById = async (id: string): Promise<any> => {
      try {
        const queryById = (topicModel.topics as any).queryById;
        
        // Function.length won't work reliably for bound methods, so just try with additional parameters
        try {
          // Try with two parameters (common implementation in some versions)
          return await queryById(id, {});
        } catch (error) {
          // If that fails, try with just one parameter
          return await queryById(id);
        }
      } catch (error) {
        console.warn(`[useTopics] Error in safeQueryById(${id}):`, error);
        return null;
      }
    };

    const loadTopics = async () => {
      try {
        const topicItems: TopicListItem[] = [];
        const systemTopics: any[] = [];
        
        // Get topics from the topic registry
        console.log('[useTopics] Getting topics from registry');
        try {
          // Use registry query instead of getAllTopicRooms to be compatible with all TopicModel implementations
          if (topicModel.topics) {
            console.log('[useTopics] Topics registry available');
            
            // First check for system topics specifically
            if (includeSystemTopics) {
              console.log('[useTopics] Checking for system topics');
              
              // Check for EveryoneTopic
              try {
                const everyoneTopic = await safeQueryById('EveryoneTopic');
                if (everyoneTopic) {
                  console.log('[useTopics] Found EveryoneTopic:', everyoneTopic.id);
                  systemTopics.push(everyoneTopic);
                }
              } catch (err) {
                console.warn('[useTopics] Error querying EveryoneTopic:', err);
              }
              
              // Check for GlueTopic and GlueOneTopic
              try {
                // First try with "GlueTopic" ID
                let glueTopic = await safeQueryById('GlueTopic');
                
                // If not found, try with "GlueOneTopic" ID (as defined in TopicModel.GLUE_TOPIC_ID)
                if (!glueTopic) {
                  console.log('[useTopics] GlueTopic not found, trying GlueOneTopic');
                  glueTopic = await safeQueryById('GlueOneTopic');
                }
                
                if (glueTopic) {
                  console.log('[useTopics] Found Glue topic with ID:', glueTopic.id);
                  systemTopics.push(glueTopic);
                } else {
                  console.warn('[useTopics] No Glue topic found with either ID');
                }
              } catch (err) {
                console.warn('[useTopics] Error querying Glue topic:', err);
              }
            }
            
            // Get all topics from registry
            try {
              console.log('[useTopics] Getting all topics from registry');
              const allTopics = await topicModel.topics.all();
              console.log('[useTopics] Found', allTopics.length, 'topics in registry');
              
              // Transform topics to TopicListItems and add to the list
              for (const topic of allTopics) {
                if (!topic || !topic.id) continue;
                
                // Create a topic list item with required fields
                const topicItem: TopicListItem = {
                  id: topic.id,
                  name: topic.name || topic.id,
                  lastMessage: '',
                  participants: [],
                  participantCount: 2  // Default to 2 for LLM chats (user + LLM)
                };
                
                // Add unique topic to the list (no duplicates)
                if (!topicItems.some(item => item.id === topic.id)) {
                  topicItems.push(topicItem);
                }
              }
            } catch (err) {
              console.error('[useTopics] Error getting all topics:', err);
            }
          }
        } catch (error) {
          console.error('[useTopics] Error accessing topics registry:', error);
        }

        // Get participant counts for each topic
        for (let i = 0; i < topicItems.length; i++) {
          const topic = topicItems[i];
          try {
            const room = await topicModel.enterTopicRoom(topic.id);
            if (room) {
              // Update participant count if possible
              try {
                // Use any type to bypass TS errors since different TopicModel implementations 
                // may have different methods
                const participants = await (room as any).getParticipants?.();
                if (participants && Array.isArray(participants)) {
                  // For 1-to-1 chats (including AI chats), ensure we count at least 2 participants
                  const is1to1Chat = topic.id.includes('<->');
                                      
                  topicItems[i].participantCount = is1to1Chat 
                    ? Math.max(participants.length, 2)  // At least 2 for 1-to-1 chats
                    : Math.max(participants.length, 1); // At least 1 for other chats
                    
                  topicItems[i].participants = participants;
                }
              } catch (err) {
                console.warn(`[useTopics] Error getting participants for topic ${topic.id}:`, err);
              }
              
              // Try to get last message
              try {
                // Use any type to bypass TS errors since different TopicModel implementations
                // may have different methods
                const messages = await (room as any).getLatestMessages?.(1);
                if (messages && messages.length > 0) {
                  topicItems[i].lastMessage = messages[0].content || '';
                }
              } catch (err) {
                console.warn(`[useTopics] Error getting last message for topic ${topic.id}:`, err);
              }
            }
          } catch (err) {
            console.warn(`[useTopics] Error getting room for topic ${topic.id}:`, err);
          }
        }
        
        console.log('[useTopics] Final topics count:', topicItems.length);
        setTopics(topicItems.slice(0, limit));
      } catch (error) {
        console.error('[useTopics] Error loading topics:', error);
      }
    };

    loadTopics();
  }, [topicModel, channelManager, model, includeSystemTopics, limit]);

  return topics;
}

/**
 * Hook to track topic loading states for AI topics
 * @param topicId The topic ID to check loading state for
 * @returns true if the topic is loading, false if it's ready
 */
export function useTopicLoadingState(topicId?: string): boolean {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const oneContext = useModel();
  const model = oneContext?.model;
  
  useEffect(() => {
    if (!topicId || !model || !model.aiAssistantModel) {
      return;
    }
    
    const aiModel = model.aiAssistantModel;
    
    // Use public API method if available, otherwise default to false
    // isTopicReady is a public method that returns the opposite of loading state
    if (typeof aiModel.isTopicReady === 'function') {
      const isReady = aiModel.isTopicReady(topicId);
      setIsLoading(!isReady); // If ready, then not loading
    } else {
      // Assume not loading if we can't determine state
      setIsLoading(false);
    }
    
    // We can't reliably subscribe to topic state changes since the API is not well-defined
    // So instead, we'll poll periodically to check for changes
    const checkInterval = setInterval(() => {
      if (typeof aiModel.isTopicReady === 'function') {
        const isReady = aiModel.isTopicReady(topicId);
        setIsLoading(!isReady);
      }
    }, 2000); // Check every 2 seconds
    
    return () => {
      clearInterval(checkInterval);
    };
  }, [topicId, model]);
  
  return isLoading;
} 