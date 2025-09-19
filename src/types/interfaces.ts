/**
 * This file contains interface definitions that help bridge type compatibility issues
 * between different import paths that point to the same underlying code.
 */

import type { Topic } from '@refinio/one.models/lib/recipes/ChatRecipes.js';

/**
 * Interface for TopicModel's createGroupTopic method.
 * This ensures type compatibility regardless of the import path.
 */
export interface TopicModelAPI {
  /**
   * Creates a new group topic with the given name.
   * 
   * @param topicName - The name of the group topic to create
   * @returns Promise resolving to the created Topic object
   */
  createGroupTopic(topicName: string): Promise<Topic>;
}

/**
 * Interface for ChannelManager's methods.
 * This ensures type compatibility regardless of the import path.
 */
export interface ChannelManagerAPI {
  init(): Promise<void>;
  shutdown(): Promise<void>;
  createChannel(channelId: string, owner?: any): Promise<any>;
  channels(options?: any): Promise<any[]>;
  objectIterator(options: any): AsyncIterable<any>;
} 