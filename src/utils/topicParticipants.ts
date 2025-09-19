import { TopicModel } from '@refinio/one.models/lib/models/chat/TopicModel';
import { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';
import { Person } from '@refinio/one.core/lib/recipes/Person';
import { LeuteModel } from '@refinio/one.models/lib/models/contacts/LeuteModel';

/**
 * Topic Participant Helper
 * 
 * This module provides structured access to topic participants using the content-addressed
 * database without relying on topic titles or other unstructured data.
 */

export interface TopicParticipant {
    personId: SHA256IdHash<Person>;
    name?: string;
    isCurrentUser: boolean;
}

export interface TopicParticipantInfo {
    participants: TopicParticipant[];
    participantCount: number;
    isOneToOne: boolean;
    otherParticipant?: TopicParticipant; // Only for one-to-one chats
}

/**
 * Get comprehensive participant information for a topic
 * 
 * This function properly accesses participant data from the structured database:
 * - For one-to-one chats: Extracts from the topic ID structure
 * - For group/AI topics: Fetches from the TopicRoom database
 * 
 * @param topicId The topic identifier
 * @param topicModel The TopicModel instance
 * @param leuteModel The LeuteModel instance for name resolution
 * @param currentUserId The current user's person ID
 * @returns Structured participant information
 */
export async function getTopicParticipants(
    topicId: string,
    topicModel: TopicModel,
    leuteModel: LeuteModel,
    currentUserId: SHA256IdHash<Person>
): Promise<TopicParticipantInfo> {
    const isOneToOne = topicModel.isOneToOneChat(topicId);
    const participants: TopicParticipant[] = [];
    
    if (isOneToOne) {
        // For one-to-one chats, extract from topic ID structure
        const participantIds = topicModel.getOneToOneChatParticipants(topicId);
        
        for (const personId of participantIds) {
            const isCurrentUser = personId.toString() === currentUserId.toString();
            let name: string | undefined;
            
            // Resolve name from LeuteModel
            try {
                const someone = await leuteModel.getSomeone(personId);
                if (someone) {
                    const profile = someone.profiles.get('default');
                    name = profile?.name?.get();
                }
            } catch (error) {
                console.error(`[topicParticipants] Failed to resolve name for ${personId}:`, error);
            }
            
            participants.push({
                personId,
                name,
                isCurrentUser
            });
        }
    } else {
        // For group/AI topics, we currently only have the current user as a participant
        // Group chat participant management is handled through access control
        // For now, we'll just add the current user
        participants.push({
            personId: currentUserId,
            name: 'You',
            isCurrentUser: true
        });
        
        // TODO: Implement proper group participant tracking when group chat is fully implemented
        console.warn(`[topicParticipants] Group participant tracking not yet implemented for topic ${topicId}`);
    }
    
    // Find the other participant for one-to-one chats
    const otherParticipant = isOneToOne 
        ? participants.find(p => !p.isCurrentUser)
        : undefined;
    
    return {
        participants,
        participantCount: participants.length,
        isOneToOne,
        otherParticipant
    };
}

/**
 * Get participant IDs without name resolution (faster)
 * 
 * @param topicId The topic identifier
 * @param topicModel The TopicModel instance
 * @returns Array of participant person IDs
 */
export async function getTopicParticipantIds(
    topicId: string,
    topicModel: TopicModel
): Promise<SHA256IdHash<Person>[]> {
    if (topicModel.isOneToOneChat(topicId)) {
        return topicModel.getOneToOneChatParticipants(topicId);
    }
    
    // For group/AI topics, participant tracking is not yet implemented
    // Return empty array for now
    console.warn(`[topicParticipants] Group participant tracking not yet implemented for topic ${topicId}`);
    return [];
}

/**
 * Check if a specific person is a participant in a topic
 * 
 * @param topicId The topic identifier
 * @param personId The person ID to check
 * @param topicModel The TopicModel instance
 * @returns true if the person is a participant
 */
export async function isPersonInTopic(
    topicId: string,
    personId: SHA256IdHash<Person>,
    topicModel: TopicModel
): Promise<boolean> {
    const participantIds = await getTopicParticipantIds(topicId, topicModel);
    return participantIds.some(id => id.toString() === personId.toString());
}

/**
 * Get the display name for a topic based on participants
 * 
 * @param topicId The topic identifier
 * @param topicModel The TopicModel instance
 * @param leuteModel The LeuteModel instance
 * @param currentUserId The current user's person ID
 * @returns Display name for the topic
 */
export async function getTopicDisplayName(
    topicId: string,
    topicModel: TopicModel,
    leuteModel: LeuteModel,
    currentUserId: SHA256IdHash<Person>
): Promise<string> {
    const info = await getTopicParticipants(topicId, topicModel, leuteModel, currentUserId);
    
    if (info.isOneToOne && info.otherParticipant) {
        return info.otherParticipant.name || 'Unknown Contact';
    }
    
    // For group chats, return participant names (excluding current user)
    const otherParticipants = info.participants.filter(p => !p.isCurrentUser);
    if (otherParticipants.length === 0) {
        return 'Empty Topic';
    }
    
    const names = otherParticipants
        .map(p => p.name || 'Unknown')
        .slice(0, 3); // Show max 3 names
    
    if (otherParticipants.length > 3) {
        return `${names.join(', ')} and ${otherParticipants.length - 3} others`;
    }
    
    return names.join(', ');
}