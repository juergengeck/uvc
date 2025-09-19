/**
 * Message Recipes Module
 * 
 * Defines the recipes and interfaces for message-related objects in the system.
 * This includes:
 * - Message objects for chat functionality
 * - Typing status indicators
 * 
 * @module MessageRecipes
 */

import type { Recipe } from '@refinio/one.core/lib/recipes';
import type { Message } from '@src/types/models';

/**
 * Recipe for Message objects.
 * Defines the structure and validation rules for chat messages.
 * - content: The content of the message
 * - timestamp: When the message was sent (Unix timestamp)
 * - read: Whether the message has been read
 */
export const MessageRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Message',
    rule: [
        {
            itemprop: 'type',
            itemtype: { type: 'string' },
            optional: false
        },
        {
            itemprop: 'content',
            itemtype: { type: 'string' },
            optional: false
        },
        {
            itemprop: 'read',
            itemtype: { type: 'boolean' },
            optional: false
        },
        {
            itemprop: 'status',
            itemtype: { type: 'string' },
            optional: false
        },
        {
            itemprop: 'timestamp',
            itemtype: { type: 'number' },
            optional: false
        }
    ]
};

/**
 * Recipe for TypingStatus objects.
 * Used to indicate when a user is typing in a chat.
 * - type: The type of status update
 * - userId: ID of the user who is typing
 * - isTyping: Whether the user is currently typing
 * - timestamp: When the status was updated
 */
export const TypingStatusRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'TypingStatus',
    rule: [
        { 
            itemprop: 'type',
            itemtype: { type: 'string' }
        },
        { 
            itemprop: 'userId',
            itemtype: { type: 'string' }
        },
        { 
            itemprop: 'isTyping',
            itemtype: { type: 'boolean' }
        },
        { 
            itemprop: 'timestamp',
            itemtype: { type: 'number' }
        }
    ]
};

declare module '@OneObjectInterfaces' {
    interface OneUnversionedObjectInterfaces {
        Message: Message;
        TypingStatus: TypingStatus;
    }
}

/**
 * Interface representing a typing status update.
 */
export interface TypingStatus {
    $type$: 'TypingStatus';
    type: string;
    userId: string;
    isTyping: boolean;
    timestamp: number;
}

export default {
    MessageRecipe,
    TypingStatusRecipe
};