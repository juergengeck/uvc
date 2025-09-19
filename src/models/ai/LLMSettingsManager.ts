import { storeVersionedObject, getObjectByIdHash } from '@refinio/one.core/lib/storage-versioned-objects';
import type { SHA256IdHash, SHA256Hash } from '@refinio/one.core/lib/util/type-checks';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import type { LLM } from '../../types/llm';
import { LLMManager } from './LLMManager';
import { getKnownTypes, getRecipe, hasRecipe } from '@refinio/one.core/lib/object-recipes';
import type { Recipe } from '@refinio/one.core/lib/recipes.js';

/**
 * Default settings for LLMs
 */
export const DEFAULT_LLM_SETTINGS = {
  temperature: 0.5,  // Lowered from 0.7 to reduce hallucinations
  maxTokens: 2048,  // Use full capacity of the model
  threads: 4,  // Optimal for mobile processors
  batchSize: 512,
  contextSize: 2048,
  enableAutoSummary: false,
  enableAutoResponse: false,
  defaultPrompt: "You are a helpful and friendly AI assistant. You provide thoughtful, concise, and accurate responses. You acknowledge when you don't know something instead of making up information. You're conversational but focused on being genuinely helpful.\n\nWhen responding, you may use <think> tags for your internal reasoning process, but you MUST always provide an actual response after the closing </think> tag. Never send only thinking content without a response."
};

/**
 * Global settings type
 * This must match EXACTLY the recipe definition in GlobalLLMSettingsRecipe.ts
 */
export interface GlobalLLMSettings {
  $type$: 'GlobalLLMSettings';
  creator: SHA256IdHash<Person>;  // Must be a hash, not just a string
  created: number;
  modified: number;
  defaultModelId?: string;
  temperature: number;
  maxTokens: number;
  enableAutoSummary: boolean;
  enableAutoResponse: boolean;
  defaultPrompt: string; // Default system prompt to use for conversations
}

/**
 * Type guard for GlobalLLMSettings
 */
function isGlobalLLMSettings(obj: any): obj is GlobalLLMSettings {
  return (
    obj &&
    obj.$type$ === 'GlobalLLMSettings' &&
    typeof obj.creator === 'string' && obj.creator.length === 64 &&  // SHA256 hash is 64 chars
    typeof obj.created === 'number' &&
    typeof obj.modified === 'number' &&
    typeof obj.temperature === 'number' &&
    typeof obj.maxTokens === 'number' &&
    typeof obj.enableAutoSummary === 'boolean' &&
    typeof obj.enableAutoResponse === 'boolean' &&
    typeof obj.defaultPrompt === 'string' &&
    (obj.defaultModelId === undefined || typeof obj.defaultModelId === 'string')
  );
}

/**
 * LLMSettingsManager
 * 
 * A simplified approach to managing LLM settings:
 * 1. Model-specific settings are stored directly in the LLM objects
 * 2. Global defaults are stored in a simple GlobalLLMSettings object
 * 
 * This avoids the complexity of the previous AIModelSettings approach.
 */
export class LLMSettingsManager {
  private static instance: LLMSettingsManager;
  private globalSettingsIdHash: string | null = null;
  
  /**
   * Get the singleton instance of LLMSettingsManager
   */
  public static getInstance(): LLMSettingsManager {
    if (!LLMSettingsManager.instance) {
      LLMSettingsManager.instance = new LLMSettingsManager();
    }
    return LLMSettingsManager.instance;
  }
  
  /**
   * Create default global settings
   */
  private createDefaultGlobalSettings(creatorId: SHA256IdHash<Person>): GlobalLLMSettings {
    const now = Date.now();
    
    return {
      $type$: 'GlobalLLMSettings',
      creator: creatorId,
      created: now,
      modified: now,
      temperature: DEFAULT_LLM_SETTINGS.temperature,
      maxTokens: DEFAULT_LLM_SETTINGS.maxTokens,
      enableAutoSummary: DEFAULT_LLM_SETTINGS.enableAutoSummary,
      enableAutoResponse: DEFAULT_LLM_SETTINGS.enableAutoResponse,
      defaultPrompt: DEFAULT_LLM_SETTINGS.defaultPrompt
    };
  }
  
  /**
   * Get global settings
   */
  public async getGlobalSettings(creatorId: SHA256IdHash<Person>): Promise<GlobalLLMSettings> {
    try {
      // If we have a cached idHash, use it to retrieve the settings
      if (this.globalSettingsIdHash) {
        try {
          // Cast the string to SHA256IdHash for the function call
          const result = await getObjectByIdHash(this.globalSettingsIdHash as SHA256IdHash<unknown>);
          
          // Validate the retrieved object has all required properties
          if (isGlobalLLMSettings(result.obj)) {
            return result.obj;
          } else {
            console.warn('[LLMSettingsManager] Retrieved settings object is invalid, creating new settings');
            this.globalSettingsIdHash = null; // Clear invalid cached idHash
          }
        } catch (error) {
          console.warn('[LLMSettingsManager] Failed to get global settings with cached idHash, creating new settings');
        }
      }
      
      // Create default settings
      const defaultSettings = this.createDefaultGlobalSettings(creatorId);
      
      // Verify the recipe exists before storing
      if (!hasRecipe('GlobalLLMSettings')) {
        console.error('[LLMSettingsManager] Recipe for GlobalLLMSettings not found, cannot store settings');
        return defaultSettings; // Return without storing
      }
      
      // Store the settings (one.core will validate)
      const result = await storeVersionedObject(defaultSettings);
      
      // Cache the idHash - it's a string in our class but passed as SHA256IdHash to functions
      this.globalSettingsIdHash = result.idHash as string;
      
      // Validate the stored object has all required properties
      if (isGlobalLLMSettings(result.obj)) {
        return result.obj;
      } else {
        console.error('[LLMSettingsManager] Stored settings object is invalid, returning default settings');
        return defaultSettings;
      }
    } catch (error) {
      console.error('[LLMSettingsManager] Error getting global settings:', error);
      
      // Add diagnostic logging to inspect the runtime recipe definition
      try {
        // Check if the recipe exists
        if (hasRecipe('GlobalLLMSettings')) {
          // Get the recipe definition
          const recipe = getRecipe('GlobalLLMSettings');
          console.log('[LLMSettingsManager] FOUND GlobalLLMSettings Recipe:', 
            JSON.stringify(recipe, null, 2));
        } else {
          console.error('[LLMSettingsManager] GlobalLLMSettings Recipe NOT FOUND in runtime registry!');
          
          // List all known types to help diagnose the issue
          const knownTypes = getKnownTypes();
          console.log('[LLMSettingsManager] All registered recipe types:', 
            knownTypes.sort().join(', '));
        }
      } catch (recipeError) {
        console.error('[LLMSettingsManager] Error inspecting recipes:', recipeError);
      }
      
      // Return default settings without storing them
      return this.createDefaultGlobalSettings(creatorId);
    }
  }
  
  /**
   * Update global settings
   */
  public async updateGlobalSettings(
    creatorId: SHA256IdHash<Person>,
    updates: Partial<Omit<GlobalLLMSettings, '$type$' | 'creator' | 'created' | 'modified'>>
  ): Promise<GlobalLLMSettings> {
    try {
      // Get current settings
      const currentSettings = await this.getGlobalSettings(creatorId);
      
      // Create updated settings
      const updatedSettings: GlobalLLMSettings = {
        ...currentSettings,
        ...updates,
        modified: Date.now()
      };
      
      // Store the updated settings (one.core will validate)
      const result = await storeVersionedObject(updatedSettings);
      
      // Cache the idHash - it's a string in our class but passed as SHA256IdHash to functions
      this.globalSettingsIdHash = result.idHash as string;
      
      return result.obj as GlobalLLMSettings;
    } catch (error) {
      console.error('[LLMSettingsManager] Error updating global settings:', error);
      throw error;
    }
  }
  
  /**
   * Update model-specific settings
   * This directly updates the LLM object with the new settings
   */
  public async updateModelSettings(
    llmManager: LLMManager,
    modelId: string,
    settings: Partial<{
      temperature: number;
      maxTokens: number;
      threads: number;
      topK: number;
      topP: number;
    }>
  ): Promise<LLM> {
    try {
      // Get all models
      const models = await llmManager.listModels();
      
      // Find the model to update
      const model = models.find(m => m.name === modelId);
      if (!model) {
        throw new Error(`Model not found: ${modelId}`);
      }
      
      // Create updated model by copying the original and adding new settings
      const updatedModel = { ...model } as LLM;
      
      // Apply each setting individually
      if (settings.temperature !== undefined) updatedModel.temperature = settings.temperature;
      if (settings.maxTokens !== undefined) updatedModel.maxTokens = settings.maxTokens;
      if (settings.threads !== undefined) updatedModel.threads = settings.threads;
      if (settings.topK !== undefined) updatedModel.topK = settings.topK;
      if (settings.topP !== undefined) updatedModel.topP = settings.topP;
      
      // Update modification time
      updatedModel.modified = Date.now();
      
      // Store the updated model
      const result = await storeVersionedObject(updatedModel);
      
      return result.obj as LLM;
    } catch (error) {
      console.error(`[LLMSettingsManager] Error updating model settings for ${modelId}:`, error);
      throw error;
    }
  }
  
  /**
   * Apply global settings to a model
   * This is useful when creating a new model or when global settings change
   */
  public async applyGlobalSettingsToModel(
    llmManager: LLMManager,
    modelId: string,
    creatorId: SHA256IdHash<Person>
  ): Promise<LLM> {
    try {
      // Get global settings
      const globalSettings = await this.getGlobalSettings(creatorId);
      
      // Get all models
      const models = await llmManager.listModels();
      
      // Find the model to update
      const model = models.find(m => m.name === modelId);
      if (!model) {
        throw new Error(`Model not found: ${modelId}`);
      }
      
      // Create updated model by copying the original
      const updatedModel = { ...model } as LLM;
      
      // Apply global settings individually
      updatedModel.temperature = globalSettings.temperature;
      updatedModel.maxTokens = globalSettings.maxTokens;
      updatedModel.modified = Date.now();
      
      // Store the updated model
      const result = await storeVersionedObject(updatedModel);
      
      return result.obj as LLM;
    } catch (error) {
      console.error(`[LLMSettingsManager] Error applying global settings to model ${modelId}:`, error);
      throw error;
    }
  }
}

// Export a singleton instance
export const llmSettingsManager = LLMSettingsManager.getInstance(); 