/**
 * Message Listener for AI Assistant
 * 
 * This module sets up channel listeners to detect new messages in AI topics
 * and trigger AI response generation.
 */

import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import type AIAssistantModel from './AIAssistantModel';

export class AIMessageListener {
  private channelManager: ChannelManager;
  private aiAssistant: AIAssistantModel;
  private unsubscribe?: () => void;
  // Debounce timers keyed by channelId
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  // Default debounce delay (ms)
  private static readonly DEBOUNCE_MS = 200;
  
  constructor(channelManager: ChannelManager, aiAssistant: AIAssistantModel) {
    this.channelManager = channelManager;
    this.aiAssistant = aiAssistant;
  }
  
  /**
   * Start listening for messages in AI topics
   */
  public start(): void {
    // Silently start listener - no need to log this
    
    if (!this.channelManager) {
      console.error('[AIMessageListener] Cannot start - channelManager is undefined');
      return;
    }
    
    if (!this.channelManager.onUpdated) {
      console.error('[AIMessageListener] Cannot start - channelManager.onUpdated is undefined');
      return;
    }
    
    // Set up channel update listener
    this.unsubscribe = this.channelManager.onUpdated.listen((
      channelInfoIdHash,
      channelId,
      channelOwner,
      timeOfEarliestChange,
      data
    ) => {
      // Debounce frequent updates coming in bursts (one entry per object)
      const existingTimer = this.debounceTimers.get(channelId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      const timerId = setTimeout(async () => {
        this.debounceTimers.delete(channelId);
        
        // Check if this is an AI topic first to avoid unnecessary logging
        const isAI = this.isAITopic(channelId);
        if (!isAI) {
          return; // Skip non-AI topics entirely
        }
        
        // Only log for AI topics
        console.log(`[AIMessageListener] 📢 AI topic update: ${channelId}`);
        console.log(`[AIMessageListener] Data entries: ${data ? data.length : 0}`);
        
        console.log(`[AIMessageListener] Channel update detected for AI topic: ${channelId}`);
        console.log(`[AIMessageListener] Data received:`, data ? `${data.length} entries` : 'no data');
        
        // When we get a channel update for an AI topic, just process it
        // The AI will figure out if it needs to respond
        console.log(`[AIMessageListener] New activity in AI topic ${channelId}, checking if response needed`);
        
        try {
          // Pass a simple notification to the AI - it will check if a response is needed
          await this.aiAssistant.handleTopicMessage(channelId, {
            channelId,
            isChannelUpdate: true,
            timeOfEarliestChange
          });
          console.log(`[AIMessageListener] Successfully notified AI about topic activity`);
        } catch (error) {
          console.error(`[AIMessageListener] Error notifying AI:`, error);
        }
      }, AIMessageListener.DEBOUNCE_MS);
      this.debounceTimers.set(channelId, timerId);
    });
    
    console.log('[AIMessageListener] Message listener started successfully');
  }
  
  /**
   * Stop listening for messages
   */
  public stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
      console.log('[AIMessageListener] Message listener stopped');
    }
  }
  
  /**
   * Check if a topic is an AI topic
   */
  private isAITopic(topicId: string): boolean {
    // Check if topic is mapped to an AI model
    return this.aiAssistant.isAITopic(topicId);
  }
  
  /**
   * Clear all internal state
   */
  public clear(): void {
    // No internal state to clear anymore
    console.log('[AIMessageListener] Cleared internal state');
  }
  
}