/**
 * LLM Import Test
 * 
 * This file contains a simple test to verify that LLM import works
 * properly after fixing the LLMSettingsRecipe to include the missing
 * 'active' and 'modelType' properties.
 */

import { getAppModelInstance } from '../models/AppModel';
import type { LLM } from '../@OneObjectInterfaces';

/**
 * Function to test the LLM import process.
 * This should be called from the appropriate place in the app.
 * 
 * @param modelPath - The file URI of the model to import
 * @returns A promise that resolves when the import is complete
 */
export async function testLLMImport(modelPath: string): Promise<void> {
  console.log('[LLM-TEST] Starting import test for model:', modelPath);
  
  try {
    // Get the AppModel instance
    const appModel = getAppModelInstance();
    if (!appModel) {
      throw new Error('AppModel instance not available');
    }
    
    // Get the LLMManager
    const llmManager = appModel.getModelManager();
    if (!llmManager) {
      throw new Error('LLMManager not available');
    }
    
    // Test model import
    console.log('[LLM-TEST] Attempting to import model from:', modelPath);
    
    // Import the model
    const importResult = await llmManager.importFromFile(modelPath, {
      name: 'Test Model Import',
      active: true,
      deleted: false
    });
    
    console.log('[LLM-TEST] Import successful! Model ID:', importResult);
    
    // List all models to verify
    const models = await llmManager.listModels();
    console.log('[LLM-TEST] Current models:', models.map((m: LLM) => m.name).join(', '));
    
    return Promise.resolve();
  } catch (error) {
    console.error('[LLM-TEST] Import failed with error:', error);
    return Promise.reject(error);
  }
} 