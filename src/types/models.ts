/**
 * Type definitions for models used in the application
 */

// Import base types from one.core
import { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import { Person, BLOB } from '@refinio/one.core/lib/recipes.js';
import { LLM } from './llm';

// Define Topic interface
export interface Topic {
  $type$: 'Topic';
  id: string;
  name?: string;
  description?: string;
  created: number;
  modified: number;
  messages?: any[];
  participants?: string[];
}

// Register Topic with @OneObjectInterfaces
declare module '@OneObjectInterfaces' {
  interface OneVersionedObjectInterfaces {
    Topic: Topic;
  }
}

// Define TopicModel interface
export interface TopicModel {
  idHash: string;
  topic: Topic;
  saveAndLoad(): Promise<void>;
  getMessages(): Promise<any[]>;
  addMessage(message: any): Promise<void>;
  updateMessage(message: any): Promise<void>;
  deleteMessage(messageId: string): Promise<void>;
}

// Define ChannelManager interface
export interface ChannelManager {
  createChannel(name: string): Promise<string>;
  getChannel(channelId: string): Promise<any>;
  joinChannel(channelId: string): Promise<void>;
  leaveChannel(channelId: string): Promise<void>;
  sendMessage(channelId: string, message: any): Promise<void>;
  onMessage(channelId: string, callback: (message: any) => void): () => void;
}

// Define TopicRoom interface
export interface TopicRoom {
  id: string;
  topic: Topic;
  messages: any[];
  participants: string[];
  addMessage(message: any): Promise<void>;
  updateMessage(message: any): Promise<void>;
  deleteMessage(messageId: string): Promise<void>;
  onMessage(callback: (message: any) => void): () => void;
  leave(): Promise<void>;
} 