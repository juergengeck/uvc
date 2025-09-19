/**
 * AI Detection Utilities
 * 
 * Centralizes logic for detecting and identifying AI senders and messages
 * across the application to ensure consistent behavior.
 */

import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person, Profile } from '@refinio/one.core/lib/recipes.js';
import type { LLMManager } from '../models/ai/LLMManager';
import type AIAssistantModel from '../models/ai/assistant/AIAssistantModel';

// Simple in-memory cache for faster lookups
const aiSenderCache = new Map<string, boolean>();

/**
 * Central function to check if a sender is an AI
 * 
 * @param senderId - The ID of the sender to check
 * @param llmManager - LLMManager instance for model lookup
 * @param aiAssistantModel - Optional AIAssistantModel for additional checks
 * @returns true if the sender is an AI model
 */
export function isAISender(
  senderId: SHA256IdHash<Person> | string, 
  llmManager: LLMManager,
  aiAssistantModel?: AIAssistantModel
): boolean {
  if (!senderId) {
    return false;
  }

  const senderIdStr = senderId.toString();
  
  // Check cache first for performance
  if (aiSenderCache.has(senderIdStr)) {
    return aiSenderCache.get(senderIdStr)!;
  }

  try {
    // First check: Use LLMManager direct model lookup (fastest)
    try {
      const models = Array.from(llmManager['models'].values());
      const matchingModel = models.find(model => 
        model.personId && model.personId.toString() === senderIdStr
      );
      
      if (matchingModel) {
        console.log(`[isAISender] Found matching LLM personId in LLMManager: ${matchingModel.name}`);
        aiSenderCache.set(senderIdStr, true);
        return true;
      }
    } catch (e) {
      console.error('[isAISender] Error checking LLM models in LLMManager:', e);
    }
    
    // Second check: Use AIAssistantModel if available
    if (aiAssistantModel) {
      const isAiContact = aiAssistantModel.isAIContact(senderIdStr);
      if (isAiContact) {
        console.log(`[isAISender] AIAssistantModel identified sender as AI`);
        aiSenderCache.set(senderIdStr, true);
        return true;
      }
    }
    
    // No match found, cache negative result for performance
    aiSenderCache.set(senderIdStr, false);
    return false;
  } catch (e) {
    console.error('[isAISender] Error checking if sender is AI:', e);
    return false;
  }
}

/**
 * Clear the AI sender cache
 * Call this when models are updated or when new models are added
 */
export function clearAISenderCache(): void {
  aiSenderCache.clear();
}

/**
 * Create a delegating isAISender function that can be passed to components
 * This maintains the same function signature while delegating to the central implementation
 * 
 * @param llmManager - LLMManager instance 
 * @param aiAssistantModel - Optional AIAssistantModel
 * @returns A function that can be passed to transformToUIMessage
 */
export function createAISenderDelegate(
  llmManager: LLMManager,
  aiAssistantModel?: AIAssistantModel
): (senderId: SHA256IdHash<Person>) => boolean {
  return (senderId: SHA256IdHash<Person>) => 
    isAISender(senderId, llmManager, aiAssistantModel);
} 