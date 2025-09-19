/**
 * Example: Migrating to the new Topic Participants Helper
 * 
 * This file demonstrates how to properly access topic participants
 * using the structured database approach.
 */

// ❌ WRONG: Don't parse topic titles or use unstructured data
// function getParticipantsFromTitle(title: string): string[] {
//     // This is desperate and wrong!
//     return title.split(',').map(s => s.trim());
// }

// ❌ WRONG: Don't make assumptions about topic structure
// function guessParticipants(topicId: string): string[] {
//     if (topicId.includes('<->')) {
//         return topicId.split('<->');
//     }
//     return [];
// }

// ✅ CORRECT: Use the structured participant helper
import { getTopicParticipants, useTopicParticipants } from '@src/utils/topicParticipants';

// Example 1: In a React component
export function ChatHeader({ topicId }: { topicId: string }) {
    const { participantInfo, isLoading } = useTopicParticipants(topicId);
    
    if (isLoading) return <LoadingSpinner />;
    
    if (participantInfo?.isOneToOne) {
        return <div>Chat with {participantInfo.otherParticipant?.name || 'Unknown'}</div>;
    }
    
    return <div>{participantInfo?.participants.length || 0} participants</div>;
}

// Example 2: In a service or utility function
export async function checkTopicAccess(
    topicId: string,
    personId: SHA256IdHash<Person>,
    topicModel: TopicModel
): Promise<boolean> {
    // Use the helper to check participation
    const participantIds = await getTopicParticipantIds(topicId, topicModel);
    return participantIds.some(id => id.toString() === personId.toString());
}

// Example 3: Getting display names
export async function getTopicDisplayInfo(
    topicId: string,
    appModel: AppModel
): Promise<{ name: string; participantCount: number }> {
    const currentUserId = appModel.leuteModel.me.idHash;
    const info = await getTopicParticipants(
        topicId,
        appModel.topicModel,
        appModel.leuteModel,
        currentUserId
    );
    
    const name = await getTopicDisplayName(
        topicId,
        appModel.topicModel,
        appModel.leuteModel,
        currentUserId
    );
    
    return {
        name,
        participantCount: info.participantCount
    };
}

// Example 4: Migrating existing code
// Before:
// const title = await topicModel.getTitle(topicId);
// const participants = parseParticipantsFromTitle(title); // WRONG!

// After:
const participantInfo = await getTopicParticipants(
    topicId,
    topicModel,
    leuteModel,
    currentUserId
);
const participants = participantInfo.participants;