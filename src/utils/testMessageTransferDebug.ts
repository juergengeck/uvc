/**
 * Test script for message transfer debugger
 * 
 * This script verifies that the message transfer debugger can be imported
 * and used correctly by the ChatModel.
 */

import { 
  logMessageSendAttempt, 
  logMessageSendSuccess, 
  logMessageSendError,
  initMessageTransferDebugger,
  startMessageTrace,
  recordMessageStep,
  completeMessageTrace
} from './messageTransferDebug';

export async function testMessageTransferDebugger(): Promise<void> {
  console.log('[TestMessageTransferDebug] 🧪 Starting message transfer debugger test...');
  
  try {
    // Test 1: Basic function imports
    console.log('[TestMessageTransferDebug] ✅ All functions imported successfully');
    
    // Test 2: Create a mock ChannelManager
    const mockChannelManager = {
      postToChannel: async (channelId: string, obj: any, channelOwner?: any) => {
        console.log(`[MockChannelManager] postToChannel called: ${channelId}`);
        return Promise.resolve();
      },
      onUpdated: {
        listen: (callback: Function) => {
          console.log('[MockChannelManager] onUpdated listener registered');
          return () => console.log('[MockChannelManager] onUpdated listener removed');
        }
      }
    };
    
    // Test 3: Initialize debugger
    initMessageTransferDebugger(mockChannelManager);
    console.log('[TestMessageTransferDebug] ✅ Debugger initialized with mock ChannelManager');
    
    // Test 4: Test message tracing workflow
    const messageId = await logMessageSendAttempt('Test message content', 'test-channel-id');
    console.log(`[TestMessageTransferDebug] ✅ Message trace started: ${messageId}`);
    
    // Simulate successful send
    logMessageSendSuccess(messageId);
    console.log('[TestMessageTransferDebug] ✅ Message send success logged');
    
    // Test 5: Test error handling (skip during normal initialization to avoid console noise)
    if (process.env.NODE_ENV === 'test') {
      const errorMessageId = await logMessageSendAttempt('Error test message', 'error-channel-id');
      logMessageSendError(errorMessageId, new Error('Test error'));
      console.log('[TestMessageTransferDebug] ✅ Message send error logged');
    } else {
      console.log('[TestMessageTransferDebug] ⏭️ Skipping error test during normal initialization');
    }
    
    console.log('[TestMessageTransferDebug] 🎉 All tests passed successfully!');
    
  } catch (error) {
    console.error('[TestMessageTransferDebug] ❌ Test failed:', error);
    throw error;
  }
}

// Export for use in other modules
export { testMessageTransferDebugger as default }; 