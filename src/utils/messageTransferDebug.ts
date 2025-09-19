/**
 * Message Transfer Debug Utility
 * 
 * This utility helps diagnose asymmetric messaging issues by tracing the complete
 * message transmission flow from ChatModel.sendMessage through ChannelManager events
 * to access grant creation and CHUM sync.
 */

import { getLogger } from './logger';

const log = getLogger('MessageTransferDebug');

interface MessageTransferTrace {
  messageId: string;
  timestamp: Date;
  content: string;
  channelId: string;
  steps: {
    chatModelSend?: Date;
    topicRoomSend?: Date;
    channelManagerPost?: Date;
    channelManagerUpdated?: Date;
    accessGrantsCreated?: Date;
    chumSyncTriggered?: Date;
  };
  errors: string[];
}

class MessageTransferDebugger {
  private activeTraces: Map<string, MessageTransferTrace> = new Map();
  private channelManagerInstance: any = null;
  private originalPostToChannel: any = null;

  /**
   * Initialize the debugger by hooking into ChannelManager methods
   */
  public init(channelManager: any): void {
    console.log('[MessageTransferDebug] 🔧 Initializing message transfer debugger...');
    
    if (!channelManager) {
      console.error('[MessageTransferDebug] ❌ No ChannelManager provided');
      return;
    }

    this.channelManagerInstance = channelManager;
    console.log('[MessageTransferDebug] ✅ ChannelManager instance stored');

    // Hook into postToChannel to trace message posting
    this.hookPostToChannel();
    
    // Hook into onUpdated events to trace event firing
    this.hookOnUpdatedEvents();
    
    console.log('[MessageTransferDebug] 🎯 Message transfer debugger initialized successfully');
  }

  /**
   * Start tracing a new message
   */
  public startTrace(messageId: string, content: string, channelId: string): void {
    const trace: MessageTransferTrace = {
      messageId,
      timestamp: new Date(),
      content,
      channelId,
      steps: {},
      errors: []
    };

    this.activeTraces.set(messageId, trace);
    console.log(`[MessageTransferDebug] 🚀 Started tracing message: ${messageId}`);
    console.log(`[MessageTransferDebug] 📝 Content: "${content}"`);
    console.log(`[MessageTransferDebug] 📍 Channel: ${channelId}`);
  }

  /**
   * Record a step in the message transfer process
   */
  public recordStep(messageId: string, step: keyof MessageTransferTrace['steps']): void {
    const trace = this.activeTraces.get(messageId);
    if (!trace) {
      console.warn(`[MessageTransferDebug] ⚠️ No trace found for message: ${messageId}`);
      return;
    }

    trace.steps[step] = new Date();
    console.log(`[MessageTransferDebug] ✅ Step recorded for ${messageId}: ${step}`);
  }

  /**
   * Record an error in the message transfer process
   */
  public recordError(messageId: string, error: string): void {
    const trace = this.activeTraces.get(messageId);
    if (!trace) {
      console.warn(`[MessageTransferDebug] ⚠️ No trace found for message: ${messageId}`);
      return;
    }

    trace.errors.push(error);
    console.error(`[MessageTransferDebug] ❌ Error recorded for ${messageId}: ${error}`);
  }

  /**
   * Get the current trace for a message
   */
  public getTrace(messageId: string): MessageTransferTrace | undefined {
    return this.activeTraces.get(messageId);
  }

  /**
   * Complete a trace and generate a report
   */
  public completeTrace(messageId: string): void {
    const trace = this.activeTraces.get(messageId);
    if (!trace) {
      console.warn(`[MessageTransferDebug] ⚠️ No trace found for message: ${messageId}`);
      return;
    }

    console.log(`[MessageTransferDebug] 📊 TRACE REPORT for message: ${messageId}`);
    console.log(`[MessageTransferDebug] �� Content: "${trace.content}"`);
    console.log(`[MessageTransferDebug] 📍 Channel: ${trace.channelId}`);
    console.log(`[MessageTransferDebug] ⏱️ Started: ${trace.timestamp.toISOString()}`);
    
    // Check completion of each step
    const steps = trace.steps;
    console.log(`[MessageTransferDebug] 🔍 Step Analysis:`);
    console.log(`  - ChatModel.sendMessage: ${steps.chatModelSend ? '✅ ' + steps.chatModelSend.toISOString() : '❌ NOT COMPLETED'}`);
    console.log(`  - TopicRoom.sendMessage: ${steps.topicRoomSend ? '✅ ' + steps.topicRoomSend.toISOString() : '❌ NOT COMPLETED'}`);
    console.log(`  - ChannelManager.postToChannel: ${steps.channelManagerPost ? '✅ ' + steps.channelManagerPost.toISOString() : '❌ NOT COMPLETED'}`);
    console.log(`  - ChannelManager.onUpdated: ${steps.channelManagerUpdated ? '✅ ' + steps.channelManagerUpdated.toISOString() : '❌ NOT COMPLETED'}`);
    console.log(`  - Access grants created: ${steps.accessGrantsCreated ? '✅ ' + steps.accessGrantsCreated.toISOString() : '❌ NOT COMPLETED'}`);
    console.log(`  - CHUM sync triggered: ${steps.chumSyncTriggered ? '✅ ' + steps.chumSyncTriggered.toISOString() : '❌ NOT COMPLETED'}`);

    // Show errors
    if (trace.errors.length > 0) {
      console.log(`[MessageTransferDebug] 🚨 Errors encountered:`);
      trace.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }

    // Calculate timing
    if (steps.chatModelSend && steps.channelManagerUpdated) {
      const duration = steps.channelManagerUpdated.getTime() - steps.chatModelSend.getTime();
      console.log(`[MessageTransferDebug] ⏱️ Total time from send to ChannelManager event: ${duration}ms`);
    }

    // Identify the failure point
    if (!steps.channelManagerUpdated) {
      console.log(`[MessageTransferDebug] 🎯 FAILURE POINT: ChannelManager.onUpdated event never fired`);
      if (steps.channelManagerPost) {
        console.log(`[MessageTransferDebug] 🔍 postToChannel was called but onUpdated didn't fire - storage event chain issue`);
      } else {
        console.log(`[MessageTransferDebug] 🔍 postToChannel was never called - TopicRoom.sendMessage issue`);
      }
    }

    // Clean up
    this.activeTraces.delete(messageId);
  }

  /**
   * Hook into ChannelManager.postToChannel to trace message posting
   */
  private hookPostToChannel(): void {
    if (!this.channelManagerInstance || !this.channelManagerInstance.postToChannel) {
      console.error('[MessageTransferDebug] ❌ Cannot hook postToChannel - method not found');
      return;
    }

    // Store original method
    this.originalPostToChannel = this.channelManagerInstance.postToChannel.bind(this.channelManagerInstance);

    // Replace with instrumented version
    this.channelManagerInstance.postToChannel = async (channelId: string, obj: any, channelOwner?: any) => {
      // In ONE, postToChannel always receives a hash of a previously stored object
      let logMessage = '[MessageTransferDebug] 🔄 postToChannel: ';
      if (typeof obj === 'string') {
        // This should always be the case - it's a hash
        logMessage += `hash ${obj.substring(0, 8)}... → ${channelId.substring(0, 16)}...`;
      } else {
        // This shouldn't happen in ONE architecture, but log it for debugging
        log.warn('Unexpected non-hash passed to postToChannel:', typeof obj);
        logMessage += `${typeof obj} → ${channelId.substring(0, 16)}...`;
      }
      log.debug(logMessage);
      
      // In ONE architecture, we can't match by content since we only have hashes
      // We can only match by channel ID and timing
      const matchingTrace = Array.from(this.activeTraces.values()).find(trace => 
        trace.channelId === channelId && 
        !trace.steps.channelManagerPost // Not yet recorded
      );

      if (matchingTrace) {
        this.recordStep(matchingTrace.messageId, 'channelManagerPost');
      }

      // Call original method
      try {
        const result = await this.originalPostToChannel(channelId, obj, channelOwner);
        log.debug(`postToChannel completed`);
        return result;
      } catch (error) {
        log.error(`postToChannel failed: ${error}`);
        if (matchingTrace) {
          this.recordError(matchingTrace.messageId, `postToChannel failed: ${error}`);
        }
        throw error;
      }
    };

    console.log('[MessageTransferDebug] 🪝 postToChannel hook installed');
  }

  /**
   * Hook into ChannelManager.onUpdated events to trace event firing
   */
  private hookOnUpdatedEvents(): void {
    if (!this.channelManagerInstance || !this.channelManagerInstance.onUpdated) {
      console.error('[MessageTransferDebug] ❌ Cannot hook onUpdated - event not found');
      return;
    }

    // Add our own listener to trace events
    this.channelManagerInstance.onUpdated.listen((
                channelInfoIdHash: any,
                channelId: string,
                channelOwner: any,
                timeOfEarliestChange: Date,
                data: any[]
            ) => {
      log.debug(`ChannelManager.onUpdated FIRED!`);
      log.debug(`Channel: ${channelId}`);
      log.debug(`New entries: ${data?.length || 0}`);

      // Try to match this to an active trace
      const matchingTrace = Array.from(this.activeTraces.values()).find(trace => 
        trace.channelId === channelId
      );

      if (matchingTrace) {
        this.recordStep(matchingTrace.messageId, 'channelManagerUpdated');
        log.debug(`Matched onUpdated event to trace: ${matchingTrace.messageId}`);
      } else {
        log.debug(`onUpdated event for channel ${channelId} has no matching trace`);
      }
    });

    console.log('[MessageTransferDebug] 🪝 onUpdated event hook installed');
  }

  /**
   * Get a summary of all active traces
   */
  public getActiveTraces(): MessageTransferTrace[] {
    return Array.from(this.activeTraces.values());
  }

  /**
   * Clear all traces
   */
  public clearTraces(): void {
    this.activeTraces.clear();
    console.log('[MessageTransferDebug] 🧹 All traces cleared');
  }
}

// Export singleton instance
export const messageTransferDebugger = new MessageTransferDebugger();

// Export helper functions for easy use
export function startMessageTrace(messageId: string, content: string, channelId: string): void {
  messageTransferDebugger.startTrace(messageId, content, channelId);
}

export function recordMessageStep(messageId: string, step: keyof MessageTransferTrace['steps']): void {
  messageTransferDebugger.recordStep(messageId, step);
}

export function recordMessageError(messageId: string, error: string): void {
  messageTransferDebugger.recordError(messageId, error);
}

export function completeMessageTrace(messageId: string): void {
  messageTransferDebugger.completeTrace(messageId);
}

export function initMessageTransferDebugger(channelManager: any): void {
  messageTransferDebugger.init(channelManager);
}

// Helper functions for ChatModel integration
export async function logMessageSendAttempt(content: string, channelId: string): Promise<string> {
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  startMessageTrace(messageId, content, channelId);
  recordMessageStep(messageId, 'chatModelSend');
  return messageId;
}

export function logMessageSendSuccess(messageId: string): void {
  recordMessageStep(messageId, 'topicRoomSend');
  // Complete the trace after a short delay to allow ChannelManager events to fire
  setTimeout(() => {
    completeMessageTrace(messageId);
  }, 1000);
}

export function logMessageSendError(messageId: string, error: Error): void {
  recordMessageError(messageId, error.message);
  completeMessageTrace(messageId);
}

/**
 * Initialize message transfer debugging by getting the ChannelManager from the global AppModel
 * This function is called during AppModel initialization
 */
export function debugMessageTransfer(): void {
  console.log('[MessageTransferDebug] 🚀 Setting up message transfer debugging...');
  
  // Get the AppModel instance from global scope
  let appModel: any = null;
  
  if (typeof window !== 'undefined') {
    appModel = (window as any).appModel;
  } else if (typeof global !== 'undefined') {
    appModel = (global as any).appModel;
  }
  
  if (!appModel) {
    console.error('[MessageTransferDebug] ❌ AppModel not found in global scope');
    return;
  }
  
  if (!appModel.channelManager) {
    console.error('[MessageTransferDebug] ❌ ChannelManager not found in AppModel');
    return;
  }
  
  console.log('[MessageTransferDebug] ✅ Found ChannelManager, initializing debugger...');
  
  // Initialize the debugger with the ChannelManager
  messageTransferDebugger.init(appModel.channelManager);
  
  console.log('[MessageTransferDebug] 🎯 Message transfer debugging fully initialized');
} 