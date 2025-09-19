import { useState, useEffect, useCallback } from 'react';
import { useModel } from '../model';

export interface AITopic {
  id: string;
  name: string;
  isLoading: boolean;
}


/**
 * Hook to get AI topics that are available from loaded models
 * @returns Array of AI topic information objects
 */
export function useAITopics() {
  const oneContext = useModel();
  const model = oneContext?.model;
  const [aiTopics, setAITopics] = useState<AITopic[]>([]);
  
  // Update the list of AI topics
  const refreshTopics = useCallback(() => {
    if (!model?.aiAssistantModel) return;
    
    const aiAssistantModel = model.aiAssistantModel;
    
    try {
      // Use getAllAITopicIds which we know exists
      const aiTopicIds = typeof aiAssistantModel.getAllAITopicIds === 'function' ? 
        aiAssistantModel.getAllAITopicIds() : [];
        
      console.log(`[useAITopics] Refreshing AI topics: found ${aiTopicIds.length} topic IDs`);
      
      // Process topics with loading states
      const topics: AITopic[] = aiTopicIds.map((topicId: string) => {
        // Check loading state
        const isLoading = typeof aiAssistantModel.isTopicLoading === 'function' ? 
          aiAssistantModel.isTopicLoading(topicId) : false;
        
        // Get display name from AITopicManager or use topicId as fallback
        const topicName = typeof aiAssistantModel.getTopicDisplayName === 'function' ?
          aiAssistantModel.getTopicDisplayName(topicId) || topicId : topicId;
        
        return {
          id: topicId,
          name: topicName,
          isLoading: isLoading
        };
      });
      
      console.log(`[useAITopics] Processed ${topics.length} AI topics, ${topics.filter(t => t.isLoading).length} in loading state`);
      setAITopics(topics);
    } catch (error) {
      console.error('[useAITopics] Error refreshing topics:', error);
    }
  }, [model]);
  
  // Set up all listeners and initial state
  useEffect(() => {
    if (!model?.aiAssistantModel) return;
    
    const aiAssistantModel = model.aiAssistantModel;
    
    // Get initial topics
    refreshTopics();
    
    // Set up listeners properly with error handling
    const listeners: Array<{ remove: () => void }> = [];
    
    try {
      // Listen for topic loading state changes
      if (aiAssistantModel.onTopicLoadingStateChanged) {
        const unsubscribe = aiAssistantModel.onTopicLoadingStateChanged.listen((topicId: string, isLoading: boolean) => {
          console.log(`[useAITopics] Topic loading state changed: ${topicId}, isLoading: ${isLoading}`);
          
          setAITopics(prev => {
            // If topicId is empty string, this is a global refresh signal
            if (topicId === '') {
              refreshTopics();
              return prev;
            }
            
            // Look for existing topic to update
            const existingIndex = prev.findIndex(t => t.id === topicId);
            
            if (existingIndex >= 0) {
              // Update existing topic
              const updated = [...prev];
              updated[existingIndex] = {
                ...updated[existingIndex],
                isLoading
              };
              return updated;
            } else if (isLoading) {
              // Add new loading topic
              const name = typeof aiAssistantModel.getTopicDisplayName === 'function' ?
                aiAssistantModel.getTopicDisplayName(topicId) || topicId : topicId;
              return [...prev, {
                id: topicId,
                name,
                isLoading: true
              }];
            }
            
            return prev;
          });
        });
        
        listeners.push(unsubscribe);
      }
    } catch (error) {
      console.warn('[useAITopics] Error setting up listeners:', error);
    }
    
    // Clean up all listeners on unmount
    return () => {
      listeners.forEach(listener => {
        try {
          if (listener && typeof listener.remove === 'function') {
            listener.remove();
          }
        } catch (error) {
          console.warn('[useAITopics] Error removing listener:', error);
        }
      });
    };
  }, [model, refreshTopics]);
  
  return aiTopics;
} 