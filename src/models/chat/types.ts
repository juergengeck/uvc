import type { Recipe, OneObjectTypeNames } from '@refinio/one.core/lib/recipes.js';
import type { Topic, ChatMessage } from '@refinio/one.models/lib/recipes/ChatRecipes.js';
import type { SHA256IdHash, SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';

/**
 * Model configuration type for AIAssistant 
 */
export interface Model {
  id: string;
  name: string;
  description: string;
  isLocal: boolean;
}

/**
 * UI representation of a chat message with reference to the core message
 */
export interface ChatMessageCard {
  hash: SHA256Hash;  // Reference to the ChatMessage object (content hash)
  channelEntryHash?: SHA256Hash;  // Reference to the channel entry (unique per posting event)
  messageRef?: ChatMessage;  // Optional cached message data
  isUser?: boolean;
  isSystem?: boolean;
  isAI?: boolean;    // Is message from an AI assistant
  isError?: boolean; // Is this an error message
  creationTime?: Date;  // Message creation timestamp
  isExpanded?: boolean; // Control expansion state from parent
}

/**
 * Chat session in ONE's object model
 */
export interface ChatSession {
  id: string;
  model: Model;
  messages: ChatMessageCard[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Chat state for UI components
 */
export interface ChatState {
  messages: ChatMessageCard[];
  topic?: Topic;
  isProcessing: boolean;
  error: Error | null;
}

/**
 * Chat context for React components
 */
export interface ChatContextType {
  state: ChatState;
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
  setTopic: (topic: Topic) => void;
} 