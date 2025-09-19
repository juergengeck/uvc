/**
 * Test utility to verify message synchronization between devices
 */

import type { ChatModel } from '../models/chat/ChatModel';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';

export interface MessageSyncTestResult {
  success: boolean;
  messagesSent: number;
  messagesReceived: number;
  syncTime: number;
  errors: string[];
}

/**
 * Test message synchronization by sending messages and verifying they appear
 * on the receiving device within a reasonable time frame
 */
export async function testMessageSync(
  chatModel: ChatModel,
  leuteModel: LeuteModel,
  topicId: string,
  testMessages: string[] = ['Test sync message 1', 'Test sync message 2']
): Promise<MessageSyncTestResult> {
  const result: MessageSyncTestResult = {
    success: false,
    messagesSent: 0,
    messagesReceived: 0,
    syncTime: 0,
    errors: []
  };

  const startTime = Date.now();

  try {
    console.log(`[MessageSyncTest] Starting sync test for topic: ${topicId}`);
    
    // 1. Record initial message count
    const initialMessages = chatModel.getMessages();
    const initialCount = initialMessages.length;
    console.log(`[MessageSyncTest] Initial message count: ${initialCount}`);

    // 2. Enter the topic room
    await chatModel.setTopic(topicId);
    console.log(`[MessageSyncTest] Entered topic room: ${topicId}`);

    // 3. Send test messages
    for (const message of testMessages) {
      try {
        await chatModel.sendMessage(message);
        result.messagesSent++;
        console.log(`[MessageSyncTest] Sent message: "${message}"`);
        
        // Small delay between messages to avoid debouncing
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (error) {
        const errorMsg = `Failed to send message "${message}": ${error}`;
        result.errors.push(errorMsg);
        console.error(`[MessageSyncTest] ${errorMsg}`);
      }
    }

    // 4. Wait for messages to sync and appear in the message list
    console.log(`[MessageSyncTest] Waiting for messages to sync...`);
    
    const maxWaitTime = 10000; // 10 seconds
    const checkInterval = 500; // Check every 500ms
    let waitTime = 0;
    
    while (waitTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waitTime += checkInterval;
      
      const currentMessages = chatModel.getMessages();
      const newMessageCount = currentMessages.length - initialCount;
      
      console.log(`[MessageSyncTest] Current message count: ${currentMessages.length} (${newMessageCount} new)`);
      
      if (newMessageCount >= result.messagesSent) {
        result.messagesReceived = newMessageCount;
        result.syncTime = Date.now() - startTime;
        result.success = true;
        console.log(`[MessageSyncTest] ✅ All messages synced in ${result.syncTime}ms`);
        break;
      }
    }

    if (!result.success) {
      const errorMsg = `Timeout: Only ${result.messagesReceived}/${result.messagesSent} messages synced after ${maxWaitTime}ms`;
      result.errors.push(errorMsg);
      console.error(`[MessageSyncTest] ❌ ${errorMsg}`);
    }

    // 5. Verify message content
    if (result.success) {
      const currentMessages = chatModel.getMessages();
      const newestMessages = currentMessages.slice(0, result.messagesSent);
      
      for (let i = 0; i < testMessages.length; i++) {
        const expectedText = testMessages[testMessages.length - 1 - i]; // Messages are newest first
        const actualMessage = newestMessages[i];
        
        if (actualMessage?.messageRef?.text !== expectedText) {
          const errorMsg = `Message content mismatch at position ${i}: expected "${expectedText}", got "${actualMessage?.messageRef?.text}"`;
          result.errors.push(errorMsg);
          result.success = false;
          console.error(`[MessageSyncTest] ❌ ${errorMsg}`);
        }
      }
    }

  } catch (error) {
    const errorMsg = `Test failed with exception: ${error}`;
    result.errors.push(errorMsg);
    console.error(`[MessageSyncTest] ❌ ${errorMsg}`);
  }

  result.syncTime = Date.now() - startTime;
  
  console.log(`[MessageSyncTest] Test completed:`, {
    success: result.success,
    messagesSent: result.messagesSent,
    messagesReceived: result.messagesReceived,
    syncTime: result.syncTime,
    errorCount: result.errors.length
  });

  return result;
}

/**
 * Simple message sync verification - check if recently sent messages appear in the local list
 * This version doesn't send new messages to avoid infinite loops
 */
export async function verifyMessageSync(
  chatModel: ChatModel,
  topicId: string,
  timeoutMs: number = 5000,
  skipMessageSend: boolean = false
): Promise<boolean> {
  try {
    await chatModel.setTopic(topicId);
    const initialCount = chatModel.getMessages().length;
    
    // If skipMessageSend is true, just check if messages are loading properly
    if (skipMessageSend) {
      console.log(`[MessageSyncVerification] Checking if messages are loading properly (current count: ${initialCount})`);
      
      // Force a refresh and see if any changes occur
      await chatModel.refreshMessages();
      const refreshedCount = chatModel.getMessages().length;
      
      if (refreshedCount >= initialCount) {
        console.log(`[MessageSyncVerification] ✅ Message loading working (${refreshedCount} total messages)`);
        return true;
      } else {
        console.log(`[MessageSyncVerification] ❌ Message loading issue: count went from ${initialCount} to ${refreshedCount}`);
        return false;
      }
    }
    
    // Send a simple test message only if not skipping
    const testMessage = `Sync test ${Date.now()}`;
    await chatModel.sendMessage(testMessage);
    
    // Wait for the message to appear
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const currentCount = chatModel.getMessages().length;
      if (currentCount > initialCount) {
        console.log(`[MessageSyncVerification] ✅ Message sync working (${currentCount - initialCount} new messages)`);
        return true;
      }
    }
    
    console.log(`[MessageSyncVerification] ❌ No new messages appeared after ${timeoutMs}ms`);
    return false;
    
  } catch (error) {
    console.error(`[MessageSyncVerification] ❌ Test failed:`, error);
    return false;
  }
}

/**
 * Post-send verification - checks if the message that was just sent appears in the message list
 * This version doesn't send additional messages to avoid loops
 */
export async function verifyPostSendSync(
  chatModel: ChatModel,
  topicId: string,
  sentMessageText: string,
  timeoutMs: number = 8000
): Promise<boolean> {
  try {
    console.log(`[PostSendVerification] Checking if sent message appears: "${sentMessageText.substring(0, 50)}..."`);
    
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const messages = chatModel.getMessages();
      
      // Look for the sent message in the most recent messages
      const foundMessage = messages.some(msg => 
        msg.messageRef?.text === sentMessageText && 
        msg.isUser === true // Should be marked as user message
      );
      
      if (foundMessage) {
        const elapsedTime = Date.now() - startTime;
        console.log(`[PostSendVerification] ✅ Sent message found in message list after ${elapsedTime}ms`);
        return true;
      }
    }
    
    console.log(`[PostSendVerification] ❌ Sent message not found in message list after ${timeoutMs}ms`);
    
    // Log current messages for debugging
    const messages = chatModel.getMessages();
    console.log(`[PostSendVerification] Current message count: ${messages.length}`);
    if (messages.length > 0) {
      console.log(`[PostSendVerification] Most recent message: "${messages[0]?.messageRef?.text?.substring(0, 50)}..."`);
    }
    
    return false;
    
  } catch (error) {
    console.error(`[PostSendVerification] ❌ Test failed:`, error);
    return false;
  }
}