import React, { useState, useEffect, useLayoutEffect } from 'react';
import { View, ScrollView, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Stack, useNavigation } from 'expo-router';
import { 
  Surface, 
  Text, 
  List, 
  Avatar, 
  IconButton,
  Button,
  Divider,
  ActivityIndicator
} from 'react-native-paper';
import { useInstance } from '@src/providers/app';
import { useTranslation } from 'react-i18next';
import type { Topic } from '@refinio/one.models/lib/recipes/ChatRecipes.js';
import { useTheme } from '@src/providers/app/AppTheme';
import { addPersonToGroup, removePersonFromGroup, getGroupIdByName } from '@src/utils/groupUtils';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person, Group } from '@refinio/one.core/lib/recipes.js';
import { UnifiedContactPicker } from '@src/components/contacts/UnifiedContactPicker';
import type { LLMSettings } from '@src/types/llm';

export default function ChatInfoScreen() {
  const { id } = useLocalSearchParams();
  const { instance, models } = useInstance();
  const { theme } = useTheme();
  const { t } = useTranslation('chat');
  const { t: tCommon } = useTranslation('common');
  const navigation = useNavigation();
  const router = useRouter();
  
  const [topic, setTopic] = useState<Topic | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [isGroupChat, setIsGroupChat] = useState(false);
  const [groupId, setGroupId] = useState<SHA256IdHash<Group> | null>(null);
  const [displayTitle, setDisplayTitle] = useState<string>('');
  
  const topicId = String(id);

  useEffect(() => {
    loadTopicInfo();
  }, [topicId]);

  const loadTopicInfo = async () => {
    if (!models?.topicModel || !models?.leuteModel) {
      console.error('[ChatInfo] Models not available');
      return;
    }

    try {
      setIsLoading(true);
      
      // Get topic details
      const topicData = await models.topicModel.topics.queryById(topicId);
      console.log('[ChatInfo] Topic data loaded:', {
        topicId,
        topicName: topicData?.name,
        participants: topicData?.participants,
        participantCount: topicData?.participants?.length || 0,
        allKeys: Object.keys(topicData || {}),
        topicData: topicData
      });
      setTopic(topicData);
      
      // Check if it's a group chat (more than 2 participants)
      const participantCount = topicData?.participants?.length || 0;
      const isSpecialTopic = topicId === 'EveryoneTopic' || topicId === 'GlueOneTopic';
      // Any chat can become a group chat by adding participants
      setIsGroupChat(participantCount > 2 || isSpecialTopic);
      
      // Try to find the associated group
      if (isGroupChat || isSpecialTopic) {
        try {
          // Check if there's a group with the same name as the topic
          let groupIdHash: SHA256IdHash<Group> | null = null;
          
          if (topicId === 'EveryoneTopic') {
            groupIdHash = await getGroupIdByName('everyone');
          } else if (topicId === 'GlueOneTopic') {
            groupIdHash = await getGroupIdByName('glue.one');
          } else if (topicData?.name) {
            // Try to find a group with the same name as the topic
            groupIdHash = await getGroupIdByName(topicData.name);
          }
          
          if (groupIdHash) {
            setGroupId(groupIdHash);
            console.log(`[ChatInfo] Found associated group: ${groupIdHash}`);
          }
        } catch (error) {
          console.log('[ChatInfo] No associated group found for topic');
        }
      }
      
      // Get participants for the topic
      let participantIds: any[] = [];
      
      // Check if it's a standard 1-1 chat (personId1<->personId2)
      if (models.topicModel.isOneToOneChat(topicId)) {
        participantIds = models.topicModel.getOneToOneChatParticipants(topicId);
        console.log('[ChatInfo] Got participants from one-to-one topic:', {
          topicId,
          participantIds,
          participantCount: participantIds.length
        });
      } else if (topicId.startsWith('chat-with-')) {
        // This is an AI chat - extract the AI model name from the topic ID
        console.log('[ChatInfo] Detected AI chat topic:', topicId);
        // The topic ID format is "chat-with-[model-name]"
        // We need to get participants from the topic room
        const topicRoom = await models.topicModel.enterTopicRoom(topicId);
        // Try to get participants using getParticipants method if available
        if (typeof (topicRoom as any).getParticipants === 'function') {
          participantIds = await (topicRoom as any).getParticipants() || [];
        } else {
          // Fallback to participants property
          participantIds = topicRoom.participants || [];
        }
        console.log('[ChatInfo] Got participants from AI topic room:', participantIds);
      } else {
        // For other topics (groups, AI chats), get participants from the topic room
        console.log('[ChatInfo] Getting participants from topic room:', topicId);
        const topicRoom = await models.topicModel.enterTopicRoom(topicId);
        // Try to get participants using getParticipants method if available
        if (typeof (topicRoom as any).getParticipants === 'function') {
          participantIds = await (topicRoom as any).getParticipants() || [];
        } else {
          // Fallback to participants property
          participantIds = topicRoom.participants || [];
        }
        console.log('[ChatInfo] Got participants from topic room:', participantIds);
      }
      
      // Load participant details
      const participantDetails: any[] = [];
      
      // If no participants found, try to infer from topic ID for AI chats
      if (participantIds.length === 0 && topicId.startsWith('chat-with-')) {
        console.log('[ChatInfo] No participants found for AI chat, inferring from topic ID');
        // For AI chats, we need at least the current user and the AI
        const myPersonId = await models.leuteModel.myMainIdentity();
        participantIds = [myPersonId]; // At least add current user
        
        // Try to find the AI participant from the topic ID
        const modelName = topicId.replace('chat-with-', '').replace(/-/g, ' ');
        console.log('[ChatInfo] Inferred AI model name from topic ID:', modelName);
        
        // Try to find the AI person ID through AIAssistantModel
        if (models.aiAssistantModel) {
          const llmManager = models.aiAssistantModel.getLLMManager();
          if (llmManager) {
            const knownModels = llmManager.getKnownModels();
            console.log('[ChatInfo] Known AI models:', knownModels.map(m => ({ name: m.name, displayName: m.displayName })));
            
            // Find matching model by checking various name formats
            const matchingModel = knownModels.find(model => {
              const modelIdentifier = topicId.replace('chat-with-', '');
              return model.name === modelIdentifier || 
                     model.displayName?.toLowerCase().replace(/\s+/g, '-') === modelIdentifier ||
                     model.name.toLowerCase().replace(/\s+/g, '-') === modelIdentifier;
            });
            
            if (matchingModel && (matchingModel as any).personId) {
              console.log('[ChatInfo] Found matching AI model:', matchingModel.displayName || matchingModel.name);
              participantIds.push((matchingModel as any).personId);
            }
          }
        }
      }
      
      if (participantIds.length > 0) {
        console.log('[ChatInfo] Loading details for participants:', participantIds);
        const myPersonId = await models.leuteModel.myMainIdentity();
        
        for (const participantId of participantIds) {
          try {
            console.log('[ChatInfo] Processing participant:', participantId);
            
            // Check if this is the current user
            if (participantId === myPersonId || participantId.toString() === myPersonId.toString()) {
              // Get current user's profile with proper name resolution
              let myName = 'Me';
              try {
                const myProfile = await models.leuteModel.me();
                if (myProfile) {
                  // Try to get the name from personDescriptions
                  const personDescriptions = myProfile.personDescriptions || [];
                  const nameDescriptor = personDescriptions.find((desc: any) => 
                    desc.$type$ === 'PersonName' && desc.name
                  );
                  
                  if (nameDescriptor?.name) {
                    myName = nameDescriptor.name;
                  } else if (myProfile.displayName) {
                    myName = myProfile.displayName;
                  } else if (personDescriptions.length > 0 && personDescriptions[0].name) {
                    myName = personDescriptions[0].name;
                  }
                  
                  participantDetails.push({
                    id: participantId,
                    name: myName,
                    profileId: myProfile.profileIdHash || myProfile.idHash,
                    isAI: false,
                    isMe: true
                  });
                  console.log(`[ChatInfo] Added current user to participants: ${myName}`);
                } else {
                  // Fallback if profile not found
                  participantDetails.push({
                    id: participantId,
                    name: 'Me',
                    profileId: participantId,
                    isAI: false,
                    isMe: true
                  });
                  console.log('[ChatInfo] Added current user with fallback name');
                }
              } catch (error) {
                console.error('[ChatInfo] Error getting current user profile:', error);
                // Add with fallback
                participantDetails.push({
                  id: participantId,
                  name: 'Me',
                  profileId: participantId,
                  isAI: false,
                  isMe: true
                });
              }
            } else {
              // Try to get participant details
              const someone = await models.leuteModel.getSomeone(participantId);
              
              // Check if this is an AI contact using the definitive LLM model mapping
              const isAI = await models.aiAssistantModel?.isAIContact(participantId) || false;
              console.log(`[ChatInfo] Checking if participant ${participantId} is AI: ${isAI}`);
              
              if (someone) {
                let participantName = 'Unknown';
                
                // Try to resolve the name from the someone's profile
                try {
                  const profile = await someone.mainProfile();
                  if (profile?.personDescriptions?.length > 0) {
                    const nameDesc = profile.personDescriptions.find((d: any) => 
                      d.$type$ === 'PersonName' && d.name
                    );
                    if (nameDesc?.name) {
                      participantName = nameDesc.name;
                    } else if (profile.personDescriptions[0]?.name) {
                      participantName = profile.personDescriptions[0].name;
                    }
                  } else if (someone.displayName) {
                    participantName = someone.displayName;
                  }
                } catch (error) {
                  console.error(`[ChatInfo] Error resolving participant name for ${participantId}:`, error);
                  // Fall back to displayName if available
                  if (someone.displayName) {
                    participantName = someone.displayName;
                  }
                }
                
                participantDetails.push({
                  id: participantId,
                  name: participantName,
                  profileId: someone.profileIdHash || someone.idHash,
                  isAI: isAI,
                  isMe: false
                });
                console.log(`[ChatInfo] Added participant: ${participantName} (AI: ${isAI})`);
              } else if (isAI) {
                // For AI contacts, try to get the model info
                let aiName = 'AI Assistant';
                const llmManager = models.aiAssistantModel?.getLLMManager();
                if (llmManager) {
                  try {
                    // Get all known models and find the one matching this person ID
                    const knownModels = llmManager.getKnownModels();
                    const matchingModel = knownModels.find(model => 
                      (model as any).personId && (model as any).personId.toString() === participantId.toString()
                    );
                    
                    if (matchingModel) {
                      aiName = matchingModel.displayName || matchingModel.name || 'AI Assistant';
                      console.log(`[ChatInfo] Found AI model for person ${participantId}: ${aiName}`);
                    } else {
                      console.log(`[ChatInfo] No model found for AI person ${participantId}`);
                    }
                  } catch (error) {
                    console.error('[ChatInfo] Error looking up AI model:', error);
                  }
                }
                
                participantDetails.push({
                  id: participantId,
                  name: aiName,
                  profileId: participantId,
                  isAI: true,
                  isMe: false
                });
                console.log(`[ChatInfo] Added AI participant: ${aiName}`);
              } else {
                // Unknown participant - shouldn't happen in properly configured system
                console.error(`[ChatInfo] Unknown participant ${participantId} - not in contacts and not AI`);
                participantDetails.push({
                  id: participantId,
                  name: `Unknown (${participantId.toString().substring(0, 8)})`,
                  profileId: participantId,
                  isAI: false,
                  isMe: false
                });
              }
            }
          } catch (error) {
            console.error(`[ChatInfo] Error loading participant ${participantId}:`, error);
          }
        }
        
        console.log('[ChatInfo] Final participant details:', participantDetails);
        setParticipants(participantDetails);
      }
      
      // Resolve display title for 1-1 chats
      let resolvedTitle = topic?.name || topicId;
      if (models.topicModel.isOneToOneChat(topicId)) {
        // For 1-1 chats, show the other party's name
        const otherParticipant = participantDetails.find(p => !p.isMe);
        if (otherParticipant) {
          // Use the participant's name (which includes proper AI names)
          resolvedTitle = otherParticipant.name;
        }
      }
      setDisplayTitle(resolvedTitle);
      
    } catch (error) {
      console.error('[ChatInfo] Error loading topic info:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddParticipant = async (contacts: any[]) => {
    if (contacts.length === 0) return;
    
    const someone = contacts[0]; // For now, we only support adding one at a time
    try {
      console.log('[ChatInfo] Add participant:', someone.displayName);
      
      // Get the person ID from the someone object
      const personId = someone.id || someone.personId || someone.personIdHash;
      if (!personId) {
        console.error('[ChatInfo] No person ID found for:', someone);
        Alert.alert('Error', 'Cannot identify the selected contact');
        return;
      }
      
      if (!groupId) {
        // No group exists yet - we need to create one
        // This happens when converting a 1-1 or AI chat to a group chat
        console.log('[ChatInfo] No group exists, need to create one');
        
        // Create a new group with the topic's name
        const groupName = topic?.name || `Group ${topicId}`;
        
        try {
          if (models?.leuteModel) {
            // Create the group with current participants + new person
            const currentParticipants = participants.map(p => p.id);
            const allParticipants = [...currentParticipants, personId];
            
            const newGroup = await models.leuteModel.createGroup(groupName);
            console.log('[ChatInfo] Created group:', newGroup);
            console.log('[ChatInfo] Group properties:', Object.keys(newGroup));
            
            if (newGroup && newGroup.groupIdHash) {
              // Add all participants to the new group
              for (const participantId of allParticipants) {
                await addPersonToGroup(newGroup.groupIdHash, participantId as SHA256IdHash<Person>);
              }
              
              console.log(`[ChatInfo] Created new group ${groupName} with ${allParticipants.length} participants`);
              setGroupId(newGroup.groupIdHash);
              
              // TODO: Link the topic to this new group
              Alert.alert('Success', `Created group "${groupName}" and added ${someone.displayName}`);
            }
          }
        } catch (error) {
          console.error('[ChatInfo] Error creating group:', error);
          Alert.alert('Error', 'Failed to create group');
          return;
        }
      } else {
        // Group exists, just add the person
        await addPersonToGroup(groupId, personId as SHA256IdHash<Person>);
        console.log(`[ChatInfo] Successfully added ${someone.displayName} to group`);
        Alert.alert('Success', `${someone.displayName} has been added to the group`);
      }
      
      // TODO: We may need to also update the topic's channel access rights
      // to ensure the new participant can see messages
      
      // Close the dialog
      setShowAddParticipant(false);
      
      // Reload participants
      await loadTopicInfo();
    } catch (error) {
      console.error('[ChatInfo] Error adding participant:', error);
      Alert.alert('Error', 'Failed to add participant');
    }
  };

  const handleRemoveParticipant = async (participantId: string) => {
    try {
      console.log('[ChatInfo] Remove participant:', participantId);
      
      if (!groupId) {
        Alert.alert(
          'Cannot Remove Participant',
          'This topic is not associated with a group. Only group-based topics support removing participants.'
        );
        return;
      }
      
      const participant = participants.find(p => p.id === participantId);
      if (!participant) {
        console.error('[ChatInfo] Participant not found:', participantId);
        return;
      }
      
      // Confirm removal
      Alert.alert(
        'Remove Participant',
        `Are you sure you want to remove ${participant.name} from this group?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              try {
                // Remove the person from the group
                await removePersonFromGroup(groupId, participantId as SHA256IdHash<Person>);
                console.log(`[ChatInfo] Successfully removed ${participant.name} from group`);
                
                Alert.alert('Success', `${participant.name} has been removed from the group`);
                
                // Reload participants
                await loadTopicInfo();
              } catch (error) {
                console.error('[ChatInfo] Error removing participant:', error);
                Alert.alert('Error', 'Failed to remove participant from the group');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('[ChatInfo] Error removing participant:', error);
      Alert.alert('Error', 'An error occurred while removing the participant');
    }
  };

  const handleLeaveGroup = async () => {
    try {
      console.log('[ChatInfo] Leave group:', topicId);
      
      Alert.alert(
        'Leave Group',
        'Are you sure you want to leave this group? You will no longer receive messages from this group.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Leave',
            style: 'destructive',
            onPress: async () => {
              try {
                if (groupId && models?.leuteModel) {
                  // Get current user's person ID
                  const myPersonId = await models.leuteModel.myMainIdentity();
                  
                  // Remove self from the group
                  await removePersonFromGroup(groupId, myPersonId);
                  console.log('[ChatInfo] Successfully left the group');
                  
                  // TODO: Also need to remove the topic from local storage
                  // and clean up any channel subscriptions
                }
                
                // Navigate back to chats list
                router.replace('/(tabs)/chats');
              } catch (error) {
                console.error('[ChatInfo] Error leaving group:', error);
                Alert.alert('Error', 'Failed to leave the group');
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('[ChatInfo] Error leaving group:', error);
    }
  };

  const getAvatarLabel = (name: string) => {
    const words = name.split(' ');
    if (words.length >= 2) {
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Set up navigation header
  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('conversationDetails'),
      headerShown: true,
    });
  }, [navigation, t]);

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <>
          {/* Header Section */}
          <Surface style={[styles.headerSection, { backgroundColor: theme.colors.background }]} elevation={0}>
            <View style={styles.avatarContainer}>
              {isGroupChat ? (
                <Avatar.Icon
                  icon="account-group"
                  size={80}
                  style={{ backgroundColor: theme.colors.primaryContainer }}
                />
              ) : (
                <Avatar.Text
                  label={getAvatarLabel(topic?.name || 'Chat')}
                  size={80}
                  style={{ backgroundColor: theme.colors.primaryContainer }}
                />
              )}
            </View>
            <Text variant="headlineSmall" style={styles.topicName}>
              {displayTitle || topicId}
            </Text>
            {isGroupChat && (
              <Text variant="bodyMedium" style={styles.participantCount}>
                {participants.length} {t('participants')}
              </Text>
            )}
          </Surface>

          {/* Actions Section */}
          <Surface style={[styles.section, { backgroundColor: theme.colors.surface }]} elevation={1}>
            <List.Item
              title={t('addParticipant')}
              left={(props) => <List.Icon {...props} icon="account-plus" />}
              onPress={() => setShowAddParticipant(true)}
            />
          </Surface>

          {/* Participants Section */}
          <Surface style={[styles.section, { backgroundColor: theme.colors.surface }]} elevation={1}>
            <List.Section style={{ marginTop: 0 }}>
              <List.Subheader style={{ backgroundColor: theme.colors.surface, paddingLeft: 16 }}>{t('participants')}</List.Subheader>
              {participants.map((participant) => (
                <List.Item
                  key={participant.id}
                  title={participant.isMe ? `${participant.name} (${t('you')})` : participant.name}
                  description={participant.isAI ? 'AI Assistant' : null}
                  style={{ paddingLeft: 16 }}
                  left={(props) => (
                    participant.isAI ? (
                      <Avatar.Icon
                        {...props}
                        icon="robot"
                        size={40}
                        style={{ 
                          backgroundColor: theme.colors.tertiary
                        }}
                      />
                    ) : (
                      <Avatar.Text
                        {...props}
                        label={getAvatarLabel(participant.name)}
                        size={40}
                        style={{ 
                          backgroundColor: participant.isMe 
                            ? theme.colors.primary 
                            : theme.colors.primaryContainer 
                        }}
                      />
                    )
                  )}
                  right={(props) => 
                    isGroupChat && participants.length > 2 && !participant.isMe ? (
                      <IconButton
                        {...props}
                        icon="close"
                        onPress={() => handleRemoveParticipant(participant.id)}
                      />
                    ) : null
                  }
                  onPress={() => {
                    // Navigate to participant's contact info
                    if (!participant.isAI && !participant.isMe) {
                      router.push(`/(screens)/contacts/${participant.id}`);
                    }
                  }}
                />
              ))}
            </List.Section>
          </Surface>

          {/* Media Section (placeholder) */}
          <Surface style={[styles.section, { backgroundColor: theme.colors.surface }]} elevation={1}>
            <List.Item
              title={t('mediaDocsLinks')}
              description="0 items"
              left={(props) => <List.Icon {...props} icon="image-multiple" />}
              right={(props) => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => {
                // TODO: Navigate to media screen
              }}
            />
          </Surface>

          {/* Settings Section */}
          <Surface style={[styles.section, { backgroundColor: theme.colors.surface }]} elevation={1}>
            <List.Item
              title={t('notifications')}
              description={t('notificationsOn')}
              left={(props) => <List.Icon {...props} icon="bell" />}
              onPress={() => {
                // TODO: Toggle notifications
              }}
            />
            <Divider />
            <List.Item
              title={t('encryption')}
              description={t('messagesEncrypted')}
              left={(props) => <List.Icon {...props} icon="lock" />}
            />
          </Surface>

          {/* Danger Zone */}
          {isGroupChat && (
            <Surface style={[styles.section, styles.dangerSection, { backgroundColor: theme.colors.surface }]} elevation={1}>
              <Button
                mode="text"
                textColor={theme.colors.error}
                icon="exit-to-app"
                onPress={handleLeaveGroup}
              >
                {t('leaveGroup')}
              </Button>
            </Surface>
          )}
        </>
      )}

      {/* Add Participant Contact Picker */}
      <UnifiedContactPicker
        visible={showAddParticipant}
        onDismiss={() => setShowAddParticipant(false)}
        onSelect={handleAddParticipant}
        multiSelect={false}
        excludeIds={participants.map(p => p.id.toString())}
        title={t('addParticipant')}
        includeAI={true}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  headerSection: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  topicName: {
    fontWeight: '600',
    marginBottom: 4,
    paddingHorizontal: 16,
    textAlign: 'center',
  },
  participantCount: {
    opacity: 0.7,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  dangerSection: {
    marginTop: 16,
    marginBottom: 24,
  },
});