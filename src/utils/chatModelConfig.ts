/**
 * Configuration utilities for ChatModel
 */

import type { ChatModelOptions } from '../models/chat/ChatModel';
import type { LLMManager } from '../models/ai/LLMManager';
import type { AppModel } from '../models/AppModel';

/**
 * Create ChatModel options with sync testing enabled (for debugging)
 */
export function createChatModelOptionsWithSyncTesting(
  llmManager: LLMManager,
  appModel?: AppModel
): ChatModelOptions {
  return {
    llmManager,
    appModel,
    enableSyncTesting: true // Enable automatic sync verification after each message send
  };
}

/**
 * Create ChatModel options with sync testing disabled (for production)
 */
export function createChatModelOptionsWithoutSyncTesting(
  llmManager: LLMManager,
  appModel?: AppModel
): ChatModelOptions {
  return {
    llmManager,
    appModel,
    enableSyncTesting: false // Disable automatic sync verification
  };
}

/**
 * Create default ChatModel options (sync testing enabled by default)
 */
export function createDefaultChatModelOptions(
  llmManager: LLMManager,
  appModel?: AppModel
): ChatModelOptions {
  return {
    llmManager,
    appModel,
    enableSyncTesting: true // Default to enabled for debugging
  };
}