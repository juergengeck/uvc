/**
 * Hook for managing chat messages
 */

import { useEffect, useState } from 'react';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import type { ObjectData } from '@refinio/one.models/lib/models/ChannelManager.js';
import type { ChatMessage } from '@refinio/one.models/lib/recipes/ChatRecipes.js';
import { Order } from '@refinio/one.models/lib/models/ChannelManager.js';
import type { ChatMessageCard } from '@src/models/chat/types';
import { createMessageCard } from '@src/models/chat/transformers';
import { isSystemMessage } from '@src/utils/messageUtils';
import type { ChatMessage as ExtendedChatMessage } from '@src/types/chat';

interface ChannelSelectionOptions {
  id?: string;
}

interface MessageEntry {
  message: ChatMessageCard;
  creationTime: Date;
}

/**
 * Hook for managing chat messages using leute.one's data types
 * @param channelId ID of the channel to load messages from
 * @param leuteModel LeuteModel instance
 * @param channelManager ChannelManager instance
 * @returns Array containing messages, loadNextBatch function, hasNewMessages flag, reloadMessages function, and channel owner
 */
export function useChatMessages(
  channelId: string | undefined,
  leuteModel: LeuteModel,
  channelManager: ChannelManager
): [ChatMessageCard[], () => Promise<void>, boolean, () => Promise<void>, SHA256IdHash<Person> | undefined] {
  const [messageEntries, setMessageEntries] = useState<MessageEntry[]>([]);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [channelOwner, setChannelOwner] = useState<SHA256IdHash<Person>>();
  
  // Get AIAssistantModel via AppModel instance if available
  const getAIAssistantModel = () => {
    try {
      if (typeof (window as any).getAppModelInstance === 'function') {
        const appModel = (window as any).getAppModelInstance();
        if (appModel && appModel.getAIAssistantModel) {
          return appModel.getAIAssistantModel();
        }
      }
    } catch (e) {
      console.warn('[useChatMessages] Could not get AIAssistantModel:', e);
    }
    return null;
  };
  
  // Function to check if a sender is an AI
  const isAISender = (senderId: SHA256IdHash<Person>): boolean => {
    try {
      const aiAssistantModel = getAIAssistantModel();
      if (aiAssistantModel && typeof aiAssistantModel.isAIContact === 'function') {
        return aiAssistantModel.isAIContact(senderId);
      }
    } catch (e) {
      console.warn('[useChatMessages] Error checking AI sender:', e);
    }
    return false;
  };

  useEffect(() => {
    if (!channelId) {
      return;
    }
    
    // Get channel
    const getChannel = async () => {
      const channels = await channelManager.channels({ id: channelId });
      const channel = channels[0];
      if (!channel) {
        return;
      }
      
      // Set channel owner
      setChannelOwner(channel.owner);
      
      // Load initial messages
      await loadMessages();
      
      // Subscribe to new messages
      const unsubscribe = channelManager.onUpdated(() => {
        setHasNewMessages(true);
      });
      
      return () => {
        unsubscribe();
      };
    };
    
    getChannel();
  }, [channelId, channelManager]);
  
  const loadMessages = async () => {
    if (!channelId) {
      return;
    }
    
    const channels = await channelManager.channels({ id: channelId });
    const channel = channels[0];
    if (!channel) {
      return;
    }
    
    const messageList = await channelManager.getObjectsWithType('ChatMessage', {
      channelId,
      orderBy: Order.Descending
    });

    const myId = await leuteModel.myMainIdentity();
    
    // Debug logging for myId
    if (!myId) {
      console.warn('[useChatMessages] myMainIdentity() returned null/undefined - user messages will not be properly identified');
    } else {
      console.log(`[useChatMessages] myId: ${myId.toString().substring(0, 15)}...`);
    }
    
    const transformedMessages = messageList.map(msg => {
      // Use type assertion for msg.data to access metadata
      const msgData = msg.data as any;
      
      // Skip messages with missing hash
      if (!msg.channelEntryHash) {
        console.error('[useChatMessages] Message missing channelEntryHash - skipping message', msgData);
        return null;
      }
      
      // Check for system message in data or metadata
      const isSystemMsg = isSystemMessage(msgData) || 
                         (msgData.isSystem === true);
                             
      // Check if sender matches current user
      // IMPORTANT: If myId is null, we can't determine if it's the user's message
      const isSenderCurrentUser = myId && 
                                 msgData.sender && 
                                 msgData.sender.toString() === myId.toString();
      
      // Check if the sender is an AI
      const isAI = isAISender(msgData.sender);
      
      // Debug logging for message classification
      if (!myId) {
        console.warn(`[useChatMessages] Cannot determine message sender (myId is null) for message: ${msgData.text?.substring(0, 30)}...`);
      }
      
      // Log detailed classification for debugging
      console.log(`[useChatMessages] Message classification:`, {
        text: msgData.text?.substring(0, 30) + '...',
        sender: msgData.sender?.toString().substring(0, 15) + '...',
        myId: myId?.toString().substring(0, 15) + '...',
        isSenderCurrentUser,
        isAISenderResult,
        hasAICert,
        isAI,
        isSystemMsg,
        willBeMarkedAsUser: isSenderCurrentUser && !isSystemMsg && !isAI
      });
                                
      // Create a ChatMessage from the channel data with proper typing
      const chatMessage = {
        $type$: 'ChatMessage',
        text: msgData.text || '',
        sender: msgData.sender,
        attachments: msgData.attachments || [],
        metadata: msgData.metadata,
        // Add the hash directly from the message
        idHash: msg.channelEntryHash
      };
      
      // Create a ChatMessageCard with the message and metadata
      return {
        message: createMessageCard(
          chatMessage as any, // Use 'any' casting for now to bypass type conflicts
          isSenderCurrentUser && !isSystemMsg && !isAI, // isUser - only true if we can confirm it's the current user AND not AI/system
          isAI, // isAI - use the explicit check
          isSystemMsg,
          msg.creationTime || new Date()
        ),
        creationTime: msg.creationTime || new Date()
      };
    }).filter(entry => entry !== null) as MessageEntry[]; // Filter out null entries
    
    setMessageEntries(transformedMessages);
    setHasNewMessages(false);
  };
  
  const loadNextBatch = async () => {
    if (!channelId || messageEntries.length === 0) {
      return;
    }
    
    const channels = await channelManager.channels({ id: channelId });
    const channel = channels[0];
    if (!channel) {
      return;
    }
    
    const oldestEntry = messageEntries[messageEntries.length - 1];
    const olderMessages = await channelManager.getObjectsWithType('ChatMessage', {
      channelId,
      orderBy: Order.Descending,
      to: oldestEntry.creationTime
    });

    const myId = await leuteModel.myMainIdentity();
    
    const transformedMessages = olderMessages.map(msg => {
      // Use type assertion for msg.data to access metadata
      const msgData = msg.data as any;
      
      // Skip messages with missing hash
      if (!msg.channelEntryHash) {
        console.error('[useChatMessages] Message missing channelEntryHash - skipping message', msgData);
        return null;
      }
      
      // Check for system message in data or metadata
      const isSystemMsg = isSystemMessage(msgData) || 
                         (msgData.isSystem === true);
                             
      // Check if sender matches current user
      // IMPORTANT: If myId is null, we can't determine if it's the user's message
      const isSenderCurrentUser = myId && 
                                 msgData.sender && 
                                 msgData.sender.toString() === myId.toString();
                                
      // Check if the sender is an AI
      const isAI = isAISender(msgData.sender);
                                
      // Create a ChatMessage from the channel data with proper typing
      const chatMessage = {
        $type$: 'ChatMessage',
        text: msgData.text || '',
        sender: msgData.sender,
        attachments: msgData.attachments || [],
        metadata: msgData.metadata,
        // Add the hash directly from the message
        idHash: msg.channelEntryHash
      };
      
      // Create a ChatMessageCard with the message and metadata
      return {
        message: createMessageCard(
          chatMessage as any, // Use 'any' casting for now to bypass type conflicts
          isSenderCurrentUser && !isSystemMsg && !isAI, // isUser - only true if we can confirm it's the current user AND not AI/system
          isAI, // isAI - use the explicit check
          isSystemMsg,
          msg.creationTime || new Date()
        ),
        creationTime: msg.creationTime || new Date()
      };
    }).filter(entry => entry !== null) as MessageEntry[]; // Filter out null entries
    
    setMessageEntries([...messageEntries, ...transformedMessages]);
  };
  
  return [messageEntries.map(entry => entry.message), loadNextBatch, hasNewMessages, loadMessages, channelOwner];
} 