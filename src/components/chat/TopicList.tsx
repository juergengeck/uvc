/**
 * TopicList Component
 * 
 * Displays a searchable and sortable list of chat topics.
 * Supports LRU (Least Recently Used) ordering and filtering.
 * Shows participant names and avatars for one-to-one chats.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, StyleSheet, FlatList, ScrollView } from 'react-native';
import { Searchbar, List, Text, useTheme, ActivityIndicator, Avatar } from 'react-native-paper';
import type TopicModel from '@refinio/one.models/lib/models/Chat/TopicModel.js';
import type TopicRoom from '@refinio/one.models/lib/models/Chat/TopicRoom.js';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import { Order } from '@refinio/one.models/lib/models/ChannelManager.js';
import type { ChatMessage } from '@refinio/one.models/lib/recipes/ChatRecipes.js';
import type { Topic } from '@refinio/one.models/lib/recipes/ChatRecipes.js';
import type { ObjectData } from '@refinio/one.models/lib/models/ChannelManager.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import { useModel } from '@/hooks/model';

interface TopicListProps {
  topicModel: TopicModel;
  channelManager: ChannelManager;
  onTopicSelect: (topicId: string) => void;
}

interface TopicListItem {
  id: string;
  name: string;
  displayName: string; // Resolved name for display
  lastMessage?: string;
  lastMessageTimestamp?: number;
  participantCount: number;
  isAITopic?: boolean;
  otherParticipantId?: SHA256IdHash<Person>; // For one-to-one chats
  hasUnreadMessages?: boolean; // For notification badges
}

/**
 * Get initials from a name for avatar display
 */
const getInitials = (name: string): string => {
  if (!name || name.trim() === '') return '?';
  
  // Remove any parentheses content first
  const cleanName = name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  
  // If the name looks like a topic ID (contains hyphens), try to extract a meaningful part
  if (cleanName.includes('-') && !cleanName.includes(' ')) {
    // For IDs like "Qwen3-Embedded-7B", extract "QE"
    const parts = cleanName.split('-').filter(p => p.length > 0);
    if (parts.length >= 2) {
      // Take first letter of first two parts
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
  }
  
  // Split by spaces, hyphens, or underscores
  const words = cleanName.split(/[\s\-_]+/).filter(w => w.length > 0);
  
  if (words.length >= 2) {
    // Use first letter of first and last word
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  } else if (words.length === 1) {
    // For single word, use first two letters
    const word = words[0];
    if (word.length >= 2) {
      return word.substring(0, 2).toUpperCase();
    }
    return word[0].toUpperCase();
  }
  
  // Fallback to first two characters
  return cleanName.substring(0, 2).toUpperCase();
};

export function TopicList({ topicModel, channelManager, onTopicSelect }: TopicListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [topics, setTopics] = useState<TopicListItem[]>([]);
  const [loadingTopics, setLoadingTopics] = useState<Set<string>>(new Set());
  const theme = useTheme();
  const oneContext = useModel();
  const appModel = oneContext?.model;
  
  // Cache for resolved names to avoid repeated lookups
  const nameCache = useRef<Map<string, string>>(new Map());

  // Get LeuteModel directly from appModel - no state, no fallbacks, no staleness
  const getLeuteModel = useCallback((): LeuteModel | undefined => {
    return appModel?.leuteModel;
  }, [appModel]);

  /**
   * Resolve the other participant's name for one-to-one chats
   */
  const resolveOtherParticipantName = useCallback(async (topicId: string): Promise<{displayName: string, otherParticipantId?: SHA256IdHash<Person>}> => {
    try {
      // Check cache first
      const cachedName = nameCache.current.get(topicId);
      if (cachedName) {
        return { displayName: cachedName };
      }

      // Get LeuteModel directly - no stale state
      const leuteModel = getLeuteModel();
      if (!leuteModel) {
        console.warn('[TopicList] LeuteModel not available for name resolution');
        return { displayName: topicId };
      }

      // Check if this is an AI topic first
      if (topicId.startsWith('chat-with-')) {
        // Extract model name from topic ID and format it nicely
        const modelName = topicId
          .replace('chat-with-', '')
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        console.log(`[TopicList] AI topic detected: ${topicId}, formatted as: ${modelName}`);
        nameCache.current.set(topicId, modelName);
        return { displayName: modelName };
      }
      
      // Check if this is a one-to-one chat
      if (!topicModel.isOneToOneChat || !topicModel.isOneToOneChat(topicId)) {
        console.log(`[TopicList] Not a one-to-one chat: ${topicId}, using topic ID as title`);
        return { displayName: topicId };
      }

      // Get participants from the topic ID  
      if (!topicModel.getOneToOneChatParticipants) {
        console.warn('[TopicList] getOneToOneChatParticipants method not available');
        return { displayName: topicId };
      }

      const participants = topicModel.getOneToOneChatParticipants(topicId);
      if (!participants || participants.length !== 2) {
        console.warn(`[TopicList] Invalid participants for one-to-one chat: ${participants?.length || 0}`);
        return { displayName: topicId };
      }

      // Get current user ID
      const myPersonId = await leuteModel.myMainIdentity();
      if (!myPersonId) {
        console.warn('[TopicList] Could not get current user ID');
        return { displayName: topicId };
      }

      // Find the other participant (not me)
      const otherParticipant = participants.find(p => p.toString() !== myPersonId.toString());
      if (!otherParticipant) {
        console.warn('[TopicList] Could not find other participant');
        return { displayName: topicId };
      }

      // Try to get the other participant's name
      try {
        const someone = await leuteModel.getSomeone(otherParticipant);
        if (someone) {
          const profile = await someone.mainProfile();
          if (profile?.personDescriptions?.length > 0) {
            // Look for a PersonName description
            const nameDesc = profile.personDescriptions.find(
              (desc: any) => desc.$type$ === 'PersonName' && desc.name
            );
            if (nameDesc) {
              console.log(`[TopicList] Resolved other participant name: ${nameDesc.name}`);
              const displayName = nameDesc.name;
              nameCache.current.set(topicId, displayName);
              return { displayName, otherParticipantId: otherParticipant };
            }
            
            // Fall back to first description with a name
            const firstWithName = profile.personDescriptions.find((desc: any) => desc.name);
            if (firstWithName) {
              console.log(`[TopicList] Using first description name: ${firstWithName.name}`);
              const displayName = firstWithName.name;
              nameCache.current.set(topicId, displayName);
              return { displayName, otherParticipantId: otherParticipant };
            }
          }
        }
      } catch (nameError) {
        console.warn('[TopicList] Error getting participant name:', nameError);
      }

      // Fallback: show a truncated Person ID
      const truncatedId = otherParticipant.toString().substring(0, 8);
      const displayName = `Contact ${truncatedId}`;
      console.log(`[TopicList] Using truncated ID as fallback: ${displayName}`);
      nameCache.current.set(topicId, displayName);
      return { displayName, otherParticipantId: otherParticipant };

    } catch (error) {
      console.error('[TopicList] Error resolving participant name:', error);
      return { displayName: topicId }; // Final fallback
    }
  }, [getLeuteModel, topicModel]);

  // Set up listeners for topic loading states
  useEffect(() => {
    if (!appModel?.aiAssistantModel) return;
    
    const aiModel = appModel.aiAssistantModel;
    
    // Listen for loading state changes - check if the method exists first
    if (typeof (aiModel as any).onTopicLoadingStateChanged?.listen === 'function') {
      const unsubscribe = (aiModel as any).onTopicLoadingStateChanged.listen((topicId: string, isLoading: boolean) => {
      if (isLoading) {
        setLoadingTopics(prev => {
          const newSet = new Set(prev);
          newSet.add(topicId);
          return newSet;
        });
      } else {
        setLoadingTopics(prev => {
          const newSet = new Set(prev);
          newSet.delete(topicId);
          return newSet;
        });
      }
    });
    
    return () => {
      if (unsubscribe && typeof unsubscribe.remove === 'function') {
        unsubscribe.remove();
      }
    };
    }
  }, [appModel]);

  // Define loadTopics function outside useEffect so it can be reused
  const loadTopics = useCallback(async () => {
      try {
        console.log('[TopicList] Loading topics...');
        
        // Get all topics through the topic model's content-addressed storage
        const allTopics = await topicModel.topics.all();
        console.log(`[TopicList] Found ${allTopics.length} topics from topicModel.topics.all()`);
        
        // Debug log all topic IDs and names
        console.log('[TopicList] Topic IDs:');
        allTopics.forEach(topic => {
          console.log(`  - ${topic.id}: ${topic.name || 'Unnamed'}`);
        });
        
        // Check for system topics
        console.log('[TopicList] Checking for system topics...');
        try {
          const allTopicIds = allTopics.map(topic => topic.id);
          const hasEveryone = allTopicIds.includes('EveryoneTopic');
          const hasGlue = allTopicIds.includes('GlueTopic') || allTopicIds.includes('GlueOneTopic');
          
          console.log(`[TopicList] EveryoneTopic: ${hasEveryone ? 'Found' : 'Not found'}`);
          console.log(`[TopicList] GlueTopic/GlueOneTopic: ${hasGlue ? 'Found' : 'Not found'}`);
          
          // Log system topic information
          const systemTopics = allTopics.filter(t => 
            t.id === 'EveryoneTopic' || 
            t.id === 'GlueTopic' || 
            t.id === 'GlueOneTopic' ||
            t.id === 'AISubjectsChannel'
          );
          
          console.log(`[TopicList] System topics: ${systemTopics.length}`);
          systemTopics.forEach(topic => {
            console.log(`[TopicList] System topic: ${topic.name} (ID: ${topic.id})`);
          });
        } catch (error) {
          console.warn('[TopicList] Error checking for system topics:', error);
        }
        
        // Get topic details and messages in parallel
        const topicItems = await Promise.all(
          allTopics.map(async (topic) => {
            try {
              // Enter the room to get the latest topic state
              console.log(`[TopicList] Entering topic room for ${topic.id}`);
              const room = await topicModel.enterTopicRoom(topic.id);
              if (!room) {
                console.log(`[TopicList] Could not enter room for ${topic.id}`);
                return null;
              }

              // Get last message
              const messages = await channelManager.getObjectsWithType(
                'ChatMessage',
                { channelId: topic.id, orderBy: Order.Descending }
              );
              
              // Get channel info to get participant count
              // CRITICAL FIX: Use getMatchingChannelInfos for ID objects, not getObjectsWithType
              const channelInfos = await channelManager.getMatchingChannelInfos({
                channelId: topic.id
              });
              const channelInfo = channelInfos[0];

              // Calculate correct participant count based on topic type
              let participantCount = 1; // Default: at least the owner
              
              if (topic.id === 'EveryoneTopic') {
                // Everyone topic always has the owner as participant
                participantCount = 1;
              } else if (topic.id === 'GlueOneTopic') {
                // Glue topic has owner + glue replicant
                participantCount = 1; // Messages come via channel settings, not direct participation
                console.log(`[TopicList] GlueOneTopic shows 1 participant (normal - replicant messages via channel settings)`);
              } else if (topic.id.includes('<->')) {
                // 1-to-1 chats always have exactly 2 participants (extracted from topic ID)
                participantCount = 2;
                console.log(`[TopicList] 1-to-1 chat ${topic.id} has 2 participants`);
              } else if (topic.id.startsWith('chat-with-')) {
                // LLM topics have 2 participants (user + AI)
                participantCount = 2;
                console.log(`[TopicList] LLM topic ${topic.id} has 2 participants (owner + LLM)`);
              } else {
                // For group chats, get participants from the associated Group object
                try {
                  const leuteModel = getLeuteModel();
                  if (leuteModel) {
                    const groups = await leuteModel.groups();
                    const associatedGroup = groups.find(group => 
                      group.name === topic.name || 
                      group.name === topic.id ||
                      // Try to match by some other criteria if needed
                      false
                    );
                    
                    if (associatedGroup && associatedGroup.persons) {
                      participantCount = associatedGroup.persons.length;
                      console.log(`[TopicList] Group topic ${topic.id} has ${participantCount} participants from group: ${associatedGroup.name}`);
                    } else {
                      // Fallback: count channel instances as participants
                      participantCount = Math.max(channelInfos.length, 1);
                      console.log(`[TopicList] Topic ${topic.id} fallback: ${participantCount} participants (channel instances)`);
                    }
                  }
                } catch (error) {
                  console.warn(`[TopicList] Error getting group participants for topic ${topic.id}:`, error);
                  participantCount = Math.max(channelInfos.length, 1);
                }
              }

              // Resolve display name for one-to-one chats
              const { displayName, otherParticipantId } = await resolveOtherParticipantName(topic.id);

              // Simple heuristic for unread messages: 
              // Consider messages from the last 24 hours as potentially unread
              // This is a placeholder - in a real app you'd track actual read timestamps
              const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
              const hasUnreadMessages = (messages[0]?.creationTime?.getTime() || 0) > dayAgo && messages.length > 0;

              // Clean the last message text if it's from an AI topic
              // Messages from channelManager.getObjectsWithType return ObjectData<ChatMessage>
              const messageData = messages[0]?.data as ChatMessage | undefined;
              const rawLastMessage = messageData?.text || '';
              const lastMessage = topic.id.startsWith('chat-with-') 
                ? cleanAIMessageText(rawLastMessage)
                : rawLastMessage;
              
              const item: TopicListItem = {
                id: topic.id,
                name: topic.name || 'Untitled Topic',
                displayName,
                lastMessage,
                lastMessageTimestamp: messages[0]?.creationTime?.getTime() || 0,
                participantCount,
                isAITopic: topic.id.startsWith('chat-with-'),
                otherParticipantId,
                hasUnreadMessages
              };
              
              console.log(`[TopicList] Processed topic: ${item.displayName} (${item.id})`);
              return item;
            } catch (error) {
              console.error(`[TopicList] Error processing topic ${topic.id}:`, error);
              return null;
            }
          })
        );

        // Filter out nulls and sort by timestamp
        const validTopics = topicItems
          .filter((item): item is TopicListItem => item !== null)
          .sort((a, b) => (b.lastMessageTimestamp || 0) - (a.lastMessageTimestamp || 0));

        console.log(`[TopicList] Loaded ${validTopics.length} valid topics out of ${topicItems.length} total`);
        
        // Log topic details for debugging
        validTopics.forEach(topic => {
          console.log(`[TopicList] Topic: ${topic.displayName} (${topic.id}), Participants: ${topic.participantCount}`);
        });
        
        setTopics(validTopics);
      } catch (error) {
        console.error('[TopicList] Error loading topics:', error);
      }
    }, [topicModel, channelManager, appModel, resolveOtherParticipantName]);

  // Listen for LeuteModel updates to refresh topics when contacts are added/removed
  useEffect(() => {
    const leuteModel = getLeuteModel();
    if (!leuteModel?.onUpdated) return;

    console.log('[TopicList] Setting up LeuteModel.onUpdated listener for topic refresh');
    const listener = leuteModel.onUpdated.listen((timeOfEarliestChange: Date) => {
              // Reduced logging: console.log('[TopicList] 🔔 LeuteModel.onUpdated fired - refreshing topics!', timeOfEarliestChange);
      // Clear name cache since contact names might have changed
      nameCache.current.clear();
      // Trigger topic reload
      loadTopics();
    });

    return () => {
      console.log('[TopicList] Cleaning up LeuteModel.onUpdated listener');
      if (listener && typeof listener.remove === 'function') {
        listener.remove();
      }
    };
  }, [getLeuteModel, loadTopics]);

  // Load topics and set up subscriptions
  useEffect(() => {
    loadTopics();
    
    // Subscribe to multiple sources of updates
    const unsubscribers: Array<(() => void) | { remove: () => void }> = [];
    
    // 1. Subscribe to topic updates from the TopicModel
    const topicUpdateUnsubscriber = topicModel.onUpdated(() => {
      console.log('[TopicList] Topic model updated, refreshing topics');
      // Clear cache when topics are updated
      nameCache.current.clear();
      loadTopics();
    });
    unsubscribers.push(topicUpdateUnsubscriber);

    // 2. Subscribe to channel manager updates - but avoid reloading topics for every message
    // Topic creation/deletion should be handled through dedicated events, not channel message updates
    // Commenting out this overly broad listener that causes performance issues
    /*
    if (channelManager && channelManager.onUpdated) {
      const channelUpdateUnsubscriber = channelManager.onUpdated.listen((channelInfoIdHash, channelId, channelOwner, timeOfEarliestChange) => {
        console.log(`[TopicList] Channel updated: ${channelId}, refreshing topics`);
        // Clear cache when channels are updated
        nameCache.current.clear();
        loadTopics();
      });
      unsubscribers.push(channelUpdateUnsubscriber);
    }
    */

    // 3. If available, subscribe to model updates from LLM manager
    if (appModel?.llmManager?.onModelsUpdated) {
      const modelUpdateUnsubscriber = appModel.llmManager.onModelsUpdated.listen(() => {
        console.log('[TopicList] LLM models updated, refreshing topics');
        loadTopics();
      });
      unsubscribers.push(modelUpdateUnsubscriber);
    }

    // 4. If available, subscribe to AI Assistant model topic changes
    if (appModel?.aiAssistantModel && (appModel.aiAssistantModel as any).onAITopicsChanged) {
      const aiTopicsUnsubscriber = (appModel.aiAssistantModel as any).onAITopicsChanged.listen(() => {
        console.log('[TopicList] AI topics changed, refreshing topics');
        loadTopics();
      });
      unsubscribers.push(aiTopicsUnsubscriber);
    }

    return () => {
      // Clean up all subscriptions
      unsubscribers.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
          unsubscribe();
        } else if (unsubscribe && typeof unsubscribe.remove === 'function') {
          unsubscribe.remove();
        }
      });
    };
  }, [topicModel, channelManager, appModel, resolveOtherParticipantName]);

  // Filter topics based on search query
  const filteredTopics = topics.filter(topic => 
    topic.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    topic.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort topics based on last message timestamp
  const sortedTopics = [...filteredTopics].sort((a, b) => {
    const timeA = a.lastMessageTimestamp || 0;
    const timeB = b.lastMessageTimestamp || 0;
    return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
  });

  // Check if a topic is currently loading
  const isTopicLoading = (topicId: string): boolean => {
    return loadingTopics.has(topicId);
  };
  
  /**
   * Clean AI-generated text by removing thinking tags and other artifacts
   */
  const cleanAIMessageText = (text: string): string => {
    if (!text) return '';
    
    // More aggressive cleaning for think tags
    // First, remove complete think tag pairs and their content
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    
    // Remove any think tag that starts but doesn't close (greedy match to end)
    cleaned = cleaned.replace(/<think>[\s\S]*/i, '');
    
    // Remove any closing think tags that don't have opening tags
    cleaned = cleaned.replace(/<\/think>/gi, '');
    
    // Remove any remaining think tags (just in case)
    cleaned = cleaned.replace(/<\/?think>/gi, '');
    
    // Also clean up any partial tags like "</thi" or "</think"
    cleaned = cleaned.replace(/<\/thi[^>]*$/i, '');
    cleaned = cleaned.replace(/<\/thin[^>]*$/i, '');
    cleaned = cleaned.replace(/<\/think[^>]*$/i, '');
    
    // Trim whitespace and return
    return cleaned.trim();
  };

  const handleTopicSelect = async (topicId: string) => {
    // If this is an AI topic that's not ready yet, try to create it first
    if (topicId.startsWith('chat-with-') && appModel?.aiAssistantModel) {
      const topic = topics.find(t => t.id === topicId);
      if (topic && isTopicLoading(topicId)) {
        console.log(`[TopicList] Topic ${topicId} is still loading, waiting before selection`);
        // We'll still allow selection but log a warning
      }
      
      // Try to ensure the topic exists (will create it if needed)
      if (topic && (appModel.aiAssistantModel as any).ensureTopicExists) {
        const modelName = topic.displayName;
        try {
          await (appModel.aiAssistantModel as any).ensureTopicExists(modelName);
        } catch (error) {
          console.error(`[TopicList] Error creating topic for model ${modelName}:`, error);
          // Continue with selection even if creation failed - the parent will handle errors
        }
      }
    }
    
    // Call the parent's selection handler
    onTopicSelect(topicId);
  };

  /**
   * Render avatar for a topic with optional notification badge
   */
  const renderAvatar = (topic: TopicListItem) => {
    let avatarComponent;
    
    if (topic.isAITopic) {
      // AI topics get a robot icon
      avatarComponent = (
        <Avatar.Icon 
          size={48} 
          icon="robot" 
          style={[styles.avatar, { backgroundColor: theme.colors.primary }]}
        />
      );
    } else if (topic.id === 'EveryoneTopic') {
      // Everyone topic gets a group icon
      avatarComponent = (
        <Avatar.Icon 
          size={48} 
          icon="account-group" 
          style={[styles.avatar, { backgroundColor: theme.colors.secondary }]}
        />
      );
    } else if (topic.id === 'GlueOneTopic' || topic.id === 'GlueTopic') {
      // Glue topic gets a link icon
      avatarComponent = (
        <Avatar.Icon 
          size={48} 
          icon="link" 
          style={[styles.avatar, { backgroundColor: theme.colors.tertiary }]}
        />
      );
    } else if (topic.id === 'AISubjectsChannel') {
      // AI Subjects channel gets a brain icon
      avatarComponent = (
        <Avatar.Icon 
          size={48} 
          icon="brain" 
          style={[styles.avatar, { backgroundColor: theme.colors.primary }]}
        />
      );
    } else {
      // One-to-one chats get initials
      const initials = getInitials(topic.displayName);
      avatarComponent = (
        <Avatar.Text 
          size={48} 
          label={initials}
          style={[styles.avatar, { backgroundColor: theme.colors.primaryContainer }]}
          labelStyle={{ color: theme.colors.onPrimaryContainer }}
        />
      );
    }

    // Wrap avatar with notification badge if there are unread messages
    return (
      <View style={styles.avatarContainer}>
        {avatarComponent}
        {topic.hasUnreadMessages && (
          <View style={[styles.notificationBadge, { backgroundColor: theme.colors.error }]} />
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Searchbar
        placeholder="Search conversations"
        onChangeText={setSearchQuery}
        value={searchQuery}
        style={styles.searchBar}
      />
      <ScrollView style={styles.scrollContainer}>
        {sortedTopics.map((item) => (
    <List.Item
            key={item.id}
            title={item.displayName}
      description={
        item.isAITopic && isTopicLoading(item.id)
          ? "Preparing model..."
          : item.lastMessage || "No messages yet"
      }
      onPress={() => handleTopicSelect(item.id)}
            left={() => renderAvatar(item)}
      right={props => (
        <View style={styles.rightContent}>
          {item.isAITopic && isTopicLoading(item.id) && (
            <ActivityIndicator 
              animating={true} 
              size="small" 
              color={theme.colors.primary}
              style={styles.loadingIndicator} 
            />
          )}
          <Text style={styles.participantCount}>
            {item.participantCount} {item.participantCount === 1 ? 'participant' : 'participants'}
          </Text>
        </View>
      )}
    />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchBar: {
    marginHorizontal: 16,
    marginVertical: 8,
  },
  participantCount: {
    fontSize: 12,
    opacity: 0.6,
    alignSelf: 'center',
    marginRight: 8,
  },
  rightContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingIndicator: {
    marginLeft: 4
  },
  avatar: {
    marginLeft: 16,
  },
  scrollContainer: {
    flex: 1,
    paddingHorizontal: 8,
    minHeight: 200, // Ensure minimum height for scrolling
  },
  avatarContainer: {
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'white',
  },
}); 
