import { useModel } from './OneProvider';
import type { AppModel } from '@src/models/AppModel';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import type TopicModel from '@refinio/one.models/lib/models/Chat/TopicModel.js';
import type { LLMManager } from '@src/models/ai/LLMManager';
import type AIAssistantModel from '@src/models/ai/assistant/AIAssistantModel';
import { getAuthenticator } from '@src/initialization';

/**
 * Hook to access instance state and model properties safely
 * Provides typed access to the most commonly used models
 */
export function useInstance() {
  // Use the new useModel hook to get the model
  const { model } = useModel();
  
  // Get authenticator directly instead of from OneProvider
  const authenticator = getAuthenticator();
  const authState = authenticator?.authState?.currentState || 'logged_out';
  const isAuthenticated = authState === 'logged_in';
  
  console.log(`[useInstance] model defined: ${!!model}, authState: ${authState}, modelState: ${model?.currentState}`);
  
  // Debug what we actually have
  if (model) {
    console.log('[useInstance] Model type:', model.constructor.name);
    console.log('[useInstance] Has organisationModel?', !!model.organisationModel);
  }
  
  // Explicitly type returned models for better type checking
  return {
    instance: model,
    authState,
    isAuthenticated,
    // Safely expose common models with proper types - model IS AppModel
    models: model ? {
      appModel: model,  // The model IS the AppModel
      topicModel: model.topicModel,
      channelManager: model.channelManager,
      leuteModel: model.leuteModel,
      llmManager: model.llmManager,
      aiAssistantModel: model.aiAssistantModel
    } : null
  };
} 