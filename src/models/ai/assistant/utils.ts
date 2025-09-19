import type { Profile } from '@refinio/one.models/lib/recipes/Leute/Profile.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';

/**
 * Shared utilities for AI Assistant components
 */

/**
 * Interface for the TopicModel with required methods
 */
export interface TopicModelWithCreateGroupTopic {
  createGroupTopic(topicName: string, topicId?: string, channelOwner?: string): Promise<any>;
  topics: {
    queryById: (id: string) => Promise<any>;
  };
  enterTopicRoom(topicId: string): Promise<any>;
  openTopicRoom?(topicId: string): Promise<any>;
  findTopicById?(id: string): Promise<any>;
} 