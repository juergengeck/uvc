import { useState, useEffect, useCallback } from 'react';
import { useModel } from '@src/providers/app/OneProvider';
import { llmSettingsManager, GlobalLLMSettings, DEFAULT_LLM_SETTINGS } from '@src/models/ai/LLMSettingsManager';
import type { LLM } from '@OneObjectInterfaces';
import type { AppModel } from '@src/models/AppModel';
import { hasRecipe } from '@refinio/one.core/lib/object-recipes';

/**
 * Hook for accessing and updating LLM settings
 * 
 * This is a simplified approach that:
 * 1. Stores model-specific settings directly in the LLM objects
 * 2. Uses a simple GlobalLLMSettings object for global defaults
 * 
 * This avoids the complexity of the previous AIModelSettings approach.
 */
export function useLLMSettings() {
  const { model } = useModel();
  const [globalSettings, setGlobalSettings] = useState<GlobalLLMSettings | null>(null);
  const [models, setModels] = useState<LLM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Load settings on mount
  useEffect(() => {
    let isMounted = true;
    
    const loadSettings = async () => {
      try {
        setLoading(true);
        
        if (!model) {
          console.warn('[useLLMSettings] Model not available, cannot load settings');
          if (isMounted) {
            // Do not create default settings in React component
            // Instead, when settings are needed, we always defer to llmSettingsManager
            setGlobalSettings(null);
            setModels([]);
            setError(null);
            setLoading(false);
          }
          return;
        }
        
        // Get the owner's person ID to use as creator ID
        const appModel = model as unknown as AppModel;
        const personId = await appModel.leuteModel.myMainIdentity();
        
        // Verify the recipe exists in the runtime registry
        // This will help diagnose any issues with recipe registration
        const hasGlobalLLMSettingsRecipe = hasRecipe('GlobalLLMSettings');
        if (!hasGlobalLLMSettingsRecipe) {
          console.error('[useLLMSettings] GlobalLLMSettings recipe not found in registry!');
          if (isMounted) {
            setError('Configuration error: GlobalLLMSettings recipe not registered');
            setLoading(false);
          }
          return;
        }
        
        // Load global settings through the manager to ensure proper type handling
        const loadedGlobalSettings = await llmSettingsManager.getGlobalSettings(personId);
        
        // Try to get LLM manager - with safety around initialization
        let llmManager;
        try {
          llmManager = appModel.getModelManager();
        } catch (e) {
          console.warn('[useLLMSettings] Model manager not ready yet:', e);
          
          // If the app model has an onModelManagerReady event, wait for it
          if (appModel.onModelManagerReady) {
            try {
              console.log('[useLLMSettings] Waiting for model manager to be ready...');
              
              // Wait for model manager to be ready (with timeout)
              await new Promise<void>((resolve) => {
                const timeout = setTimeout(() => {
                  console.warn('[useLLMSettings] Timeout waiting for model manager');
                  // Resolve anyway to not block the UI
                  resolve();
                }, 3000);
                
                let shouldResolve = true;
                try {
                  appModel.onModelManagerReady.listen(() => {
                    if (shouldResolve) {
                      clearTimeout(timeout);
                      shouldResolve = false;
                      resolve();
                    }
                  });
                } catch (eventError) {
                  console.error('[useLLMSettings] Error setting up event listener:', eventError);
                  clearTimeout(timeout);
                  // Resolve anyway to not block the UI
                  resolve();
                }
              });
              
              // Try again to get the manager after waiting
              try {
                llmManager = appModel.getModelManager();
                console.log('[useLLMSettings] Model manager is now ready');
              } catch (retryError) {
                console.warn('[useLLMSettings] Still failed to get model manager after waiting:', retryError);
                // Set settings but no models
                if (isMounted) {
                  setGlobalSettings(loadedGlobalSettings);
                  setModels([]);
                  setLoading(false);
                }
                return;
              }
            } catch (waitError) {
              console.error('[useLLMSettings] Error waiting for model manager:', waitError);
              // Set settings but no models
              if (isMounted) {
                setGlobalSettings(loadedGlobalSettings);
                setModels([]);
                setLoading(false);
              }
              return;
            }
          } else {
            // If there's no event to wait for, just proceed with what we have
            console.warn('[useLLMSettings] No onModelManagerReady event available');
            if (isMounted) {
              setGlobalSettings(loadedGlobalSettings);
              setModels([]);
              setLoading(false);
            }
            return;
          }
        }
        
        // If we successfully got a model manager, load the models
        let loadedModels: LLM[] = [];
        if (llmManager && typeof llmManager.listModels === 'function') {
          try {
            loadedModels = await llmManager.listModels();
          } catch (modelsError) {
            console.error('[useLLMSettings] Error loading models:', modelsError);
            // Continue with empty models list
          }
        } else if (llmManager) {
          console.warn('[useLLMSettings] LLMManager exists but does not have listModels method. This indicates the manager is not properly initialized.');
          console.warn('[useLLMSettings] LLMManager type:', typeof llmManager);
          console.warn('[useLLMSettings] LLMManager constructor:', llmManager.constructor?.name);
          console.warn('[useLLMSettings] LLMManager available methods:', Object.getOwnPropertyNames(llmManager));
          if (llmManager.then && typeof llmManager.then === 'function') {
            console.warn('[useLLMSettings] LLMManager appears to be a Promise - this suggests getInstance() was not awaited');
          }
        }
        
        if (isMounted) {
          setGlobalSettings(loadedGlobalSettings);
          setModels(loadedModels);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        console.error('[useLLMSettings] Error loading settings:', err);
        if (isMounted) {
          setError('Failed to load LLM settings');
          setLoading(false);
        }
      }
    };
    
    loadSettings();
    
    // Set up listeners for model updates
    const unsubscribers: Array<() => void> = [];
    
    // Handle LLM manager model updates
    if (model) {
      try {
        const appModel = model as unknown as AppModel;
        let llmManager;
        
        try {
          llmManager = appModel.getModelManager();
          
          if (llmManager && llmManager.onModelsUpdated) {
            console.log('[useLLMSettings] Setting up model update listener');
            const unsubscribe = llmManager.onModelsUpdated.listen(() => {
              console.log('[useLLMSettings] Models updated, reloading');
              loadSettings();
            });
            unsubscribers.push(() => unsubscribe());
          }
        } catch (e) {
          console.warn('[useLLMSettings] LLM manager not available for setting up listeners:', e);
        }
        
        // Listen to channel manager for LLM changes
        if (appModel.channelManager && appModel.channelManager.onUpdated) {
          console.log('[useLLMSettings] Setting up channel update listener');
          const unsubscribe = appModel.channelManager.onUpdated.listen((channelInfoIdHash: string, channelId: string) => {
            // Only refresh on LLM channel updates
            if (channelId === 'llm') {
              console.log('[useLLMSettings] LLM channel updated, reloading models');
              loadSettings();
            }
          });
          unsubscribers.push(() => unsubscribe());
        }
      } catch (error) {
        console.warn('[useLLMSettings] Error setting up model update listeners:', error);
      }
    }
    
    return () => {
      isMounted = false;
      // Clean up all listeners
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [model]);
  
  /**
   * Update global settings
   */
  const updateGlobalSettings = useCallback(async (
    updates: Partial<Omit<GlobalLLMSettings, '$type$' | 'creator' | 'created' | 'modified'>>
  ) => {
    try {
      if (!model) {
        throw new Error('Model not available');
      }
      
      // Get the owner's person ID to use as creator ID
      const appModel = model as unknown as AppModel;
      const personId = await appModel.leuteModel.myMainIdentity();
      
      // Update global settings through the manager
      // This ensures proper ONE type handling and validation
      const updatedSettings = await llmSettingsManager.updateGlobalSettings(personId, updates);
      
      // Update local state with the properly validated object returned from manager
      setGlobalSettings(updatedSettings);
      setError(null);
      
      return updatedSettings;
    } catch (err) {
      console.error('[useLLMSettings] Error updating global settings:', err);
      setError('Failed to update global LLM settings');
      throw err;
    }
  }, [model]);
  
  /**
   * Update model-specific settings
   */
  const updateModelSettings = useCallback(async (
    modelId: string,
    settings: Partial<Pick<LLM, 'temperature' | 'maxTokens' | 'threads' | 'topK' | 'topP'>>
  ) => {
    try {
      if (!model) {
        throw new Error('Model not available');
      }
      
      // Get the LLM manager
      const appModel = model as unknown as AppModel;
      
      // Safely get the model manager
      let llmManager;
      try {
        llmManager = appModel.getModelManager();
      } catch (e) {
        console.error('[useLLMSettings] Error accessing model manager for updateModelSettings:', e);
        throw new Error('Model manager not initialized. Please try again later.');
      }
      
      if (!llmManager) {
        throw new Error('Model manager is undefined');
      }
      
      // Update model settings through the manager
      // This ensures proper ONE type handling and validation
      const updatedModel = await llmSettingsManager.updateModelSettings(
        llmManager,
        modelId,
        settings
      );
      
      // Update local state with the validated object returned from manager
      setModels(prevModels => {
        const index = prevModels.findIndex(m => m.name === modelId);
        if (index === -1) {
          return [...prevModels, updatedModel];
        }
        
        const newModels = [...prevModels];
        newModels[index] = updatedModel;
        return newModels;
      });
      
      setError(null);
      
      return updatedModel;
    } catch (err) {
      console.error(`[useLLMSettings] Error updating model settings for ${modelId}:`, err);
      setError(`Failed to update settings for model ${modelId}`);
      throw err;
    }
  }, [model]);
  
  /**
   * Apply global settings to all models
   */
  const applyGlobalSettingsToAllModels = useCallback(async () => {
    try {
      if (!model) {
        throw new Error('Model not available');
      }
      
      // Get the owner's person ID and LLM manager
      const appModel = model as unknown as AppModel;
      const personId = await appModel.leuteModel.myMainIdentity();
      
      // Safely get the model manager
      let llmManager;
      try {
        llmManager = appModel.getModelManager();
      } catch (e) {
        console.error('[useLLMSettings] Error accessing model manager for applyGlobalSettings:', e);
        throw new Error('Model manager not initialized. Please try again later.');
      }
      
      if (!llmManager) {
        throw new Error('Model manager is undefined');
      }
      
      // Get all models
      const allModels = await llmManager.listModels();
      
      // Apply global settings to each model through the manager
      // This ensures proper ONE type handling and validation
      const updatedModels = await Promise.all(
        allModels.map(async m => 
          llmSettingsManager.applyGlobalSettingsToModel(llmManager, m.name, personId)
        )
      );
      
      // Update local state with validated objects returned from manager
      setModels(updatedModels);
      setError(null);
      
      return updatedModels;
    } catch (err) {
      console.error('[useLLMSettings] Error applying global settings to all models:', err);
      setError('Failed to apply global settings to all models');
      throw err;
    }
  }, [model]);
  
  return {
    globalSettings,
    models,
    loading,
    error,
    updateGlobalSettings,
    updateModelSettings,
    applyGlobalSettingsToAllModels
  };
} 