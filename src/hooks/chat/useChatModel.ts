import { useCallback, useEffect, useState } from 'react';
import { useModel } from '@src/hooks/model';
import type { ChatMessage } from '@src/models/chat/types';
import type { ChatModel } from '@src/models/chat/ChatModel';
import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';

export interface ChatState {
  messages: ChatMessage[];
  isGenerating: boolean;
  connectionStatus: 'connected' | 'connecting' | 'disconnected';
}

export interface ChatActions {
  sendMessage: (content: string) => Promise<void>;
  sendMessageWithAttachments: (content: string, attachmentHashes: SHA256Hash[]) => Promise<void>;
  enterTopicRoom: (topicId: string) => Promise<void>;
}

/**
 * Hook to manage chat state using ChatModel
 */
export function useChatModel(chatModel: ChatModel | null): [ChatState, ChatActions] {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isGenerating: false,
    connectionStatus: 'disconnected',
  });

  // Subscribe to message updates
  useEffect(() => {
    if (!chatModel) return;
    
    const unsubscribe = chatModel.onMessagesUpdate.onListen(() => {
      setState(prev => ({
        ...prev,
        messages: chatModel.getMessages(),
        connectionStatus: 'connected'
      }));
    });

    return () => {
      unsubscribe();
    };
  }, [chatModel]);

  const sendMessage = useCallback(async (content: string) => {
    if (!chatModel) {
      console.error('[useChatModel] Cannot send message - chatModel is null');
      throw new Error('Chat system not properly initialized');
    }
    
    setState(prev => ({ ...prev, isGenerating: true }));
    try {
      await chatModel.sendMessage(content);
    } finally {
      setState(prev => ({ ...prev, isGenerating: false }));
    }
  }, [chatModel]);

  const sendMessageWithAttachments = useCallback(async (content: string, attachmentHashes: SHA256Hash[]) => {
    if (!chatModel) {
      console.error('[useChatModel] Cannot send message with attachments - chatModel is null');
      throw new Error('Chat system not properly initialized');
    }
    
    setState(prev => ({ ...prev, isGenerating: true }));
    try {
      await chatModel.sendMessageWithAttachments(content, attachmentHashes);
    } finally {
      setState(prev => ({ ...prev, isGenerating: false }));
    }
  }, [chatModel]);

  const enterTopicRoom = useCallback(async (topicId: string) => {
    if (!chatModel) {
      console.error('[useChatModel] Cannot enter topic room - chatModel is null');
      throw new Error('Chat system not properly initialized');
    }
    
    setState(prev => ({ ...prev, connectionStatus: 'connecting' }));
    try {
      console.log(`[useChatModel] Starting to enter topic room: ${topicId}`);
      await chatModel.enterTopicRoom(topicId);
      console.log(`[useChatModel] Successfully entered topic room: ${topicId}`);
      
      // Get initial messages immediately after entering the room
      const messages = chatModel.getMessages();
      console.log(`[useChatModel] Retrieved ${messages.length} initial messages`);
      
      setState(prev => ({ 
        ...prev, 
        connectionStatus: 'connected',
        messages 
      }));
    } catch (error) {
      console.error(`[useChatModel] Failed to enter topic room: ${topicId}`, error);
      setState(prev => ({ ...prev, connectionStatus: 'disconnected' }));
      throw error;
    }
  }, [chatModel]);

  return [
    state,
    {
      sendMessage,
      sendMessageWithAttachments,
      enterTopicRoom
    }
  ];
} 