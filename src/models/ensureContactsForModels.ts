/**
 * Contact Creation Utilities for Models
 * 
 * This file provides centralized utilities for creating and managing contacts
 * for LLM models, ensuring consistent contact creation across all components.
 */

import { getOrCreateSomeoneForLLM, createContact, getOrCreateTopicForLLM, normalizeModelNameToEmail } from '../utils/contactUtils';
import type { LLM } from '../types/llm';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';

// Using a more generic type for Someone since the actual structure varies at runtime
type SomeoneType = {
  idHash: string;
  [key: string]: any;
};

/**
 * Ensures contacts exist for a list of LLM models
 * This is the primary function for batch-ensuring contacts for multiple models
 * 
 * @param models Array of LLM models to create contacts for
 * @param leuteModel The LeuteModel instance to use for contact operations
 * @returns Number of contacts created or verified
 */
export async function ensureContactsForModels(
  models: LLM[],
  leuteModel: LeuteModel
): Promise<number> {
  console.log(`[ensureContactsForModels] Creating/verifying contacts for ${models.length} models`);
  console.log(`[ensureContactsForModels] Models:`, models.map(m => ({ name: m.name, personId: m.personId })));
  
  // Strict validation - throw errors for missing dependencies
  if (!leuteModel) {
    throw new Error(`[ensureContactsForModels] LeuteModel is required`);
  }
  
  if (!models) {
    throw new Error(`[ensureContactsForModels] Models array is required`);
  }
  
  // Validate LeuteModel state
  if (!leuteModel.state || leuteModel.state.currentState !== 'Initialised') {
    throw new Error(`[ensureContactsForModels] LeuteModel not initialized`);
  }
  
  // Having 0 models is normal for fresh instances - no warning needed
  if (models.length === 0) {
    console.log(`[ensureContactsForModels] No models to process - this is normal for fresh instances`);
    return 0;
  }
  
  // Validate all models first to catch issues early
  for (const model of models) {
    if (!model?.name || typeof model.name !== 'string' || model.name.trim() === '') {
      throw new Error(`[ensureContactsForModels] Invalid model found - all models must have valid names`);
    }
  }
  
  // Check for duplicate model names to prevent creating duplicate contacts
  const modelNames = models.map(m => m.name);
  const uniqueNames = new Set(modelNames);
  if (modelNames.length !== uniqueNames.size) {
    const duplicates = modelNames.filter((name, index) => modelNames.indexOf(name) !== index);
    throw new Error(`[ensureContactsForModels] Duplicate model names found: ${duplicates.join(', ')}. Each model must have a unique name.`);
  }
  
  // First, log all existing contacts to understand the state
  try {
    const existingContacts = await leuteModel.others();
    console.log(`[ensureContactsForModels] Existing contacts before processing: ${existingContacts.length}`);
    for (const contact of existingContacts) {
      const personId = await contact.mainIdentity();
      console.log(`  - Someone ${contact.idHash?.slice(0, 16)}... -> Person ${personId?.toString().slice(0, 16)}...`);
    }
  } catch (e) {
    console.warn(`[ensureContactsForModels] Could not list existing contacts:`, e);
  }
  
  let contactCount = 0;
  const errors: string[] = [];
  
  // Process each model - collect all errors instead of failing fast
  for (const model of models) {
    try {
      console.log(`[ensureContactsForModels] Processing model ${model.name}...`);
      
      // Create contact with strict error handling
      const someone = await createContactForModel(model, leuteModel);
      
      if (!someone?.idHash) {
        throw new Error(`Contact creation returned invalid Someone object`);
      }
      
      contactCount++;
      console.log(`[ensureContactsForModels] Successfully processed contact for model ${model.name}: ${someone.idHash}`);
    } catch (error) {
      const errorMsg = `Model ${model.name}: ${error instanceof Error ? error.message : error}`;
      errors.push(errorMsg);
      console.error(`[ensureContactsForModels] Error processing contact for model ${model.name}:`, error);
    }
  }
  
  // If any errors occurred, throw with details
  if (errors.length > 0) {
    throw new Error(`[ensureContactsForModels] Failed to create contacts for ${errors.length} models:\n${errors.join('\n')}`);
  }
  
  console.log(`[ensureContactsForModels] Successfully processed ${contactCount} of ${models.length} models`);
  return contactCount;
}

/**
 * Creates or retrieves a contact for a specific LLM model
 * This is the singular function that should be used by all components
 * 
 * @param model The LLM model to create a contact for
 * @param leuteModel The LeuteModel instance
 * @returns The Someone object for the contact
 */
export async function createContactForModel(
  model: LLM,
  leuteModel: LeuteModel
): Promise<SomeoneType> {
  console.log(`[createContactForModel] Processing model ${model.name}`);
  
  if (!model?.name || !leuteModel) {
    throw new Error(`[createContactForModel] Missing model name or leuteModel`);
  }
  
  // Validate LeuteModel state to ensure it's ready
  if (!leuteModel.state || leuteModel.state.currentState !== 'Initialised') {
    throw new Error(`[createContactForModel] LeuteModel not initialized for model ${model.name}`);
  }
  
  // Use direct contact creation to avoid multiple layers of "ensure" functions
  // This is more efficient and consistent than calling getOrCreateSomeoneForLLM
  try {
    // CRITICAL FIX: Use canonical email normalization function instead of inline logic
    // This ensures consistency with other code paths that create Person IDs
    const normalizedEmail = normalizeModelNameToEmail(model.name);
    const contactResult = await createContact(normalizedEmail, leuteModel, {
      displayName: `${model.name} (AI)`,
      isAI: true,
      llmData: { 
        name: model.name,
        type: 'llm'
      }
    });
    
    // Get the Someone object using the personId from the result
    const someone = await leuteModel.getSomeone(contactResult.personId);
    
    if (!someone?.idHash) {
      throw new Error(`[createContactForModel] Failed to retrieve Someone for model ${model.name} after creation`);
    }
    
    return someone;
  } catch (error) {
    // Provide clear error context for debugging
    const errorMsg = `[createContactForModel] Contact creation failed for model ${model.name}: ${error instanceof Error ? error.message : error}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Creates a new contact directly for an AI model name
 * This method should be used when you only have the model name, not the LLM object
 * 
 * @param modelName The name of the model to create a contact for
 * @param leuteModel The LeuteModel instance
 * @returns The Someone object for the contact
 */
export async function createContactForModelName(
  modelName: string,
  leuteModel: LeuteModel
): Promise<SomeoneType> {
  console.log(`[createContactForModelName] Creating contact for model ${modelName}`);
  
  if (!modelName || typeof modelName !== 'string' || modelName.trim() === '') {
    throw new Error(`[createContactForModelName] Valid model name is required`);
  }
  
  if (!leuteModel) {
    throw new Error(`[createContactForModelName] LeuteModel is required`);
  }
  
  // Validate LeuteModel state
  if (!leuteModel.state || leuteModel.state.currentState !== 'Initialised') {
    throw new Error(`[createContactForModelName] LeuteModel not initialized for model ${modelName}`);
  }
  
  try {
    // CRITICAL FIX: Use canonical email normalization function instead of inline logic
    // This ensures consistency with other code paths that create Person IDs
    const normalizedEmail = normalizeModelNameToEmail(modelName);
    const result = await createContact(normalizedEmail, leuteModel, {
      displayName: `${modelName} (AI)`,
      isAI: true,
      llmData: { 
        name: modelName,
        type: 'llm'
      }
    });
    
    // Get the Someone object using the personId from the result
    const someone = await leuteModel.getSomeone(result.personId);
    
    if (!someone?.idHash) {
      throw new Error(`[createContactForModelName] Failed to retrieve Someone after creation for model ${modelName}`);
    }
    
    return someone;
  } catch (error) {
    const errorMsg = `[createContactForModelName] Contact creation failed for model ${modelName}: ${error instanceof Error ? error.message : error}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Ensures topics exist for a list of LLM models
 * This creates chat topics for each model so users can chat with them
 * 
 * @param models Array of LLM models to create topics for
 * @param modelContainer Object containing required models (leuteModel, topicModel, channelManager, aiAssistantModel)
 * @param llmManager The LLMManager instance
 * @returns Number of topics created or verified
 */
export async function ensureTopicsForModels(
  models: LLM[],
  modelContainer: { leuteModel: typeof LeuteModel, topicModel: any, channelManager: any, aiAssistantModel?: any },
  llmManager: any
): Promise<number> {
  console.log(`[ensureTopicsForModels] Creating/verifying topics for ${models.length} models`);
  
  // Check for missing dependencies
  if (!modelContainer.leuteModel || !modelContainer.topicModel || !modelContainer.channelManager || !llmManager) {
    console.warn(`[ensureTopicsForModels] Missing required dependencies, aborting`);
    return 0;
  }
  
  // Having 0 models is normal for fresh instances - no warning needed
  if (models.length === 0) {
    console.log(`[ensureTopicsForModels] No models to process - this is normal for fresh instances`);
    return 0;
  }
  
  let topicCount = 0;
  
  // Process each model
  for (const model of models) {
    try {
      if (!model?.name) {
        console.warn(`[ensureTopicsForModels] Skipping model with no name`);
        continue;
      }
      
      console.log(`[ensureTopicsForModels] Creating topic for model ${model.name}`);
      
      // Create or get the topic for this model  
      // Add aiAssistantModel to the container - this is needed for topic model map initialization
      const extendedContainer = {
        ...modelContainer,
        aiAssistantModel: modelContainer.aiAssistantModel
      };
      
      if (!extendedContainer.aiAssistantModel) {
        console.warn(`[ensureTopicsForModels] aiAssistantModel not provided - topic model map will not be initialized for ${model.name}`);
      }
      const topic = await getOrCreateTopicForLLM(model, extendedContainer, llmManager);
      
      if (topic) {
        topicCount++;
        console.log(`[ensureTopicsForModels] Successfully processed topic for model ${model.name}`);
      } else {
        console.warn(`[ensureTopicsForModels] Failed to create topic for model ${model.name}`);
      }
    } catch (error) {
      console.error(`[ensureTopicsForModels] Error processing topic for model ${model?.name}:`, error);
      // Continue with next model rather than failing entire batch
    }
  }
  
  console.log(`[ensureTopicsForModels] Successfully processed ${topicCount} of ${models.length} model topics`);
  return topicCount;
} 