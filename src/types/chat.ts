/**
 * Chat type definitions
 */

import { ReactElement } from 'react';
import type { Recipe, RecipeRule, StringValue, OneObjectTypeNames } from '@refinio/one.core/lib/recipes.js';
import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import type { JournalEntry } from '@OneObjectInterfaces';
// DEFAULT_AI_MODELS will be defined below

/**
 * Interface for a chat model
 */
export interface Model {
  id: string;
  name: string;
  description?: string;
  isLocal: boolean;
}

/**
 * Default AI model options available in the system
 * These are NOT recipes, just configuration objects used as fallbacks
 * when no actual models are loaded from the system
 */
const DEFAULT_AI_MODELS: Model[] = [
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    description: 'Fast and efficient',
    isLocal: false,
  },
  {
    id: 'gpt-4',
    name: 'GPT-4',
    description: 'Most capable',
    isLocal: false,
  },
  {
    id: 'local',
    name: 'Local Model',
    description: 'Runs on device',
    isLocal: true,
  },
];

/**
 * Default available models
 */
export { DEFAULT_AI_MODELS as DEFAULT_MODELS };

/**
 * Interface for attachment view factory entries.
 * Each entry defines how to render a specific type of attachment.
 */
export interface AttachmentViewFactoryEntry {
  /** The type of attachment this factory handles */
  type: string;
  
  /** Function to create a view for the attachment */
  createView: (attachment: any) => ReactElement | null;
}

/**
 * Interface for AI processing results
 */
export interface AiResult {
  files: string[];
  text?: string;
}

/**
 * Array of default attachment view factory entries
 */
export const defaultAttachmentViewFactoryEntries: AttachmentViewFactoryEntry[] = [];

/**
 * Chat message and related types used by the AIAssistantModel
 */

/**
 * Basic chat message structure
 */
export interface ChatMessage {
  $type$: 'ChatMessage';
  id?: string;
  text: string;
  sender: SHA256IdHash<Person>;
  timestamp?: number;
  attachments?: SHA256Hash[];
  reactions?: MessageReaction[];
  edited?: boolean;
  editTimestamp?: number;
  replyTo?: string;
  isSystem?: boolean;
}

/**
 * Message reaction structure
 */
export interface MessageReaction {
  emoji: string;
  count: number;
  users: SHA256IdHash<Person>[];
}

/**
 * AI status notification for processing messages
 */
export interface AIProcessingStatus {
  $type$: 'AIProcessingStatus';
  messageId: SHA256Hash;
  provider: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * AI response to a message
 */
export interface AIResponse {
  $type$: 'AIResponse';
  messageId: SHA256Hash;
  provider: string;
  text: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

// JournalEntry is imported from recipes

/**
 * Message data format for UI rendering
 */
export interface UIMessage {
  id: string;
  text: string;
  sender: SHA256IdHash<Person>;
  timestamp: number;
  isMe: boolean;
  displayName: string;
  status?: 'sending' | 'sent' | 'error';
  attachments?: SHA256Hash[];
  reactions?: MessageReaction[];
  isAI?: boolean;
}

/**
 * Represents parts of an AI message that can be displayed as attachments
 * Enables handling AI thinking, reasoning, and responses as separate components
 */
export interface AIMessagePart {
  /** Unique identifier for the part */
  id: string;
  
  /** Type of message part (thinking, reasoning, response, etc.) */
  type: 'thinking' | 'reasoning' | 'response' | 'raw';
  
  /** The content of this part */
  content: string;
  
  /** Optional metadata about this part */
  metadata?: {
    /** Timestamp when this part was created */
    timestamp?: number;
    /** Whether this part should be visible by default */
    visible?: boolean;
    /** Any additional metadata */
    [key: string]: any;
  };
}

export interface TopicListItem {
  id: string;
  name: string;
  lastMessage?: string;
  lastMessageTimestamp?: number;
  participants: string[];
  participantCount: number;
  isAITopic?: boolean;
  isLoading?: boolean;
  isSystemTopic?: boolean;
} 