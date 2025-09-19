import type { ChatMessage } from '@refinio/one.models/lib/recipes/ChatRecipes.js';
import type { ChatMessageCard } from './types';
import type { SHA256IdHash, SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import type { AIMessagePart } from '@src/types/chat';
import { v4 as uuidv4 } from 'uuid';

// Define a simplified UIMessage interface that matches our usage
interface UIMessage {
  authorIdHash: SHA256IdHash<Person>;
  timestamp: number;
  lastEdited?: number;
  text: string;
  isUser: boolean;
  isAI: boolean;
  isSystem: boolean;
  attachments: SHA256Hash[];
  messageId: string;
  aiParts?: AIMessagePart[]; // Added to store AI message parts
}

/**
 * Transform a message from the ONE channel format to the UI format
 * This function accepts classification parameters rather than determining them internally
 * 
 * @param messageCard - The message card to transform
 * @param myPersonId - The current user's person ID
 * @param isAISender - Optional function to check if a sender is an AI (from LLMManager)
 * @returns The UI message
 */
export function transformToUIMessage(
  messageCard: ChatMessageCard, 
  myPersonId?: SHA256IdHash<Person>,
  isAISender?: (senderId: SHA256IdHash<Person>) => boolean
): UIMessage {
  if (!messageCard.messageRef) {
    throw new Error('Cannot transform message card without messageRef');
  }
  
  const message = messageCard.messageRef;
  
  // Get message text
  const messageText = message.text || "";
  
  // Log the sender ID for debugging
  const senderIdStr = message.sender ? message.sender.toString() : 'undefined';
  const senderMatchesUser = myPersonId ? message.sender.toString() === myPersonId.toString() : false;
  
  // Use the already determined properties from the messageCard
  // This ensures classification happens at the data layer, not the transformation layer
  const isUser = messageCard.isUser === true;
  const isAI = messageCard.isAI === true;
  const isSystem = messageCard.isSystem === true;
  
  // IMPORTANT: Log detailed information for AI messages to debug display issues
  if (isAI) {
    console.log(`[transformToUIMessage] AI message detected: ${messageText.substring(0, 30)}...`);
    console.log(`[transformToUIMessage] AI message hash: ${messageCard.hash.toString().substring(0, 10)}...`);
    console.log(`[transformToUIMessage] AI message classification markers:`, { 
      isAI,
      isUser,
      isSystem, 
      sender: senderIdStr.substring(0, 15) + '...'
    });
  }
  
  // Log message classification for debugging
  console.log(`[transformToUIMessage] Message ${messageCard.hash.toString().substring(0, 10)}...: 
    isAI: ${isAI === true}, 
    isUser: ${isUser === true},
    isSystem: ${isSystem === true},
    senderIdStr: ${senderIdStr.substring(0, 10) + '...'},
    myPersonId: ${myPersonId ? myPersonId.toString().substring(0, 10) + '...' : 'undefined'}
  `);
  
  // Create the base UI message
  const uiMessage: UIMessage = {
    authorIdHash: message.sender,
    timestamp: messageCard.creationTime?.getTime() || Date.now(),
    text: messageText,
    isUser,
    isAI,
    isSystem,
    attachments: message.attachments || [],
    messageId: messageCard.hash.toString()
  };
  
  // Add presentation metadata for AI messages
  // This is added only to the UI representation, not stored in the message
  if (isAI) {
    uiMessage.aiParts = [{
      id: uuidv4(),
      type: 'response',
      content: messageText,
      metadata: {
        timestamp: uiMessage.timestamp,
        visible: true,
        isAIMessage: true
      }
    }];
  }
  
  return uiMessage;
}

// Helper function to escape regex special characters
function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Create a ChatMessageCard from a ONE ChatMessage
 */
export function createMessageCard(
  message: ChatMessage & { idHash?: SHA256Hash, metadata?: any },
  isUser: boolean,
  isAI: boolean,
  isSystem: boolean,
  creationTime: Date,
  channelEntryHash?: SHA256Hash
): ChatMessageCard {
  // Fail explicitly if we don't have a valid hash
  if (!message.idHash) {
    console.error('[transformers] Missing required idHash in message', message);
    throw new Error('Cannot create ChatMessageCard: message is missing required idHash');
  }
  
  return {
    messageRef: message,
    hash: message.idHash,
    channelEntryHash,
    isUser,
    isAI,
    isSystem,
    creationTime
  };
}

export type { UIMessage }; 