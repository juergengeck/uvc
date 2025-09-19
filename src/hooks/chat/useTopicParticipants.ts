import { useEffect, useState } from 'react';
import { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';
import { Person } from '@refinio/one.core/lib/recipes/Person';
import { useAppModel } from '@src/hooks/useAppModel';
import { useLeuteModel } from '@src/hooks/useLeuteModel';
import { useTopicModel } from '@src/hooks/useTopicModel';
import { 
    TopicParticipantInfo, 
    getTopicParticipants 
} from '@src/utils/topicParticipants';

/**
 * React hook for accessing topic participant information
 * 
 * This hook provides reactive access to topic participants with automatic
 * updates when participants change.
 * 
 * @param topicId The topic identifier
 * @returns Participant information with loading and error states
 */
export function useTopicParticipants(topicId: string | null) {
    const appModel = useAppModel();
    const leuteModel = useLeuteModel();
    const topicModel = useTopicModel();
    
    const [participantInfo, setParticipantInfo] = useState<TopicParticipantInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    
    useEffect(() => {
        if (!topicId || !appModel || !leuteModel || !topicModel) {
            setParticipantInfo(null);
            setIsLoading(false);
            return;
        }
        
        let cancelled = false;
        
        const fetchParticipants = async () => {
            try {
                setIsLoading(true);
                setError(null);
                
                const currentUserId = leuteModel.me.idHash as SHA256IdHash<Person>;
                const info = await getTopicParticipants(
                    topicId,
                    topicModel,
                    leuteModel,
                    currentUserId
                );
                
                if (!cancelled) {
                    setParticipantInfo(info);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err : new Error('Failed to fetch participants'));
                    setParticipantInfo(null);
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };
        
        fetchParticipants();
        
        // Listen for topic updates
        const unsubscribeTopicUpdate = topicModel.onUpdated.listen(() => {
            if (!cancelled) {
                fetchParticipants();
            }
        });
        
        // Listen for contact updates (name changes)
        const unsubscribeContactUpdate = leuteModel.onUpdated.listen(() => {
            if (!cancelled) {
                fetchParticipants();
            }
        });
        
        return () => {
            cancelled = true;
            unsubscribeTopicUpdate();
            unsubscribeContactUpdate();
        };
    }, [topicId, appModel, leuteModel, topicModel]);
    
    return {
        participantInfo,
        isLoading,
        error,
        refetch: async () => {
            if (!topicId || !appModel || !leuteModel || !topicModel) return;
            
            try {
                setIsLoading(true);
                setError(null);
                
                const currentUserId = leuteModel.me.idHash as SHA256IdHash<Person>;
                const info = await getTopicParticipants(
                    topicId,
                    topicModel,
                    leuteModel,
                    currentUserId
                );
                
                setParticipantInfo(info);
            } catch (err) {
                setError(err instanceof Error ? err : new Error('Failed to fetch participants'));
                setParticipantInfo(null);
            } finally {
                setIsLoading(false);
            }
        }
    };
}

/**
 * Hook to check if current user is a participant in a topic
 * 
 * @param topicId The topic identifier
 * @returns boolean indicating if current user is a participant
 */
export function useIsCurrentUserInTopic(topicId: string | null): boolean {
    const { participantInfo } = useTopicParticipants(topicId);
    
    if (!participantInfo) return false;
    
    return participantInfo.participants.some(p => p.isCurrentUser);
}