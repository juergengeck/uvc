/**
 * AIModelSettings Component
 * 
 * Manages AI model storage and settings:
 * - Lists installed models
 * - Shows model details (size, parameters, etc)
 * - Allows deleting models
 * - Shows model usage stats
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Alert, ActivityIndicator, Platform, FlatList, AppState, TextInput as RNTextInput } from 'react-native';
import { Text, List, IconButton, useTheme as usePaperTheme, Surface, TextInput, Appbar, HelperText, Switch, Divider, Dialog, Portal, Button, ProgressBar } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useModel } from '@src/providers/app/OneProvider';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { AppModel } from '@refinio/one.models/lib/models/App.js';
import { useTheme } from '@src/providers/app/AppTheme';
import { Asset } from 'expo-asset';
import { storeArrayBufferAsBlob } from '@refinio/one.core/lib/storage-blob';
import { getStorageDir } from '@refinio/one.core/lib/system/storage-base';
import { STORAGE } from '@refinio/one.core/lib/storage-base-common.js';
import { storeVersionedObject } from '@refinio/one.core/lib/storage-versioned-objects';
import { LLMManager } from '@src/models/ai/LLMManager';
import type { LLM } from '@refinio/one.models/lib/models/LLM.js';
import { useInstance } from '@src/providers/app/useInstance';
import type { AIMetadata } from '@OneObjectInterfaces';
import AIAssistantModel from '@src/models/ai/assistant/AIAssistantModel';
import { LLMRecipe } from '@src/recipes/llm';
import Slider from '@react-native-community/slider';
import { useLLMSettings } from '@src/hooks/ai/useLLMSettings';
import type { Model as CoreModel } from '@refinio/one.models/lib/models/Model.js';
import { MdAdd, MdDelete, MdError } from 'react-icons/md';
import type { ComponentType } from 'react';
import { normalizeEmailOrModelName, createContact } from '@src/utils/contactUtils';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import { useFocusEffect } from 'expo-router';
// @ts-ignore
const Card = require('../Card').default as ComponentType<any>;
// @ts-ignore
const AddModelModal = require('./AddModelModal').default as ComponentType<any>;
// @ts-ignore
const { useAppContext } = require('../../contexts/AppContext');
// Define our own getErrorMessage utility function
function getErrorMessage(error: any): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return String(error || 'Unknown error');
}
// Make sure type definitions are imported
import '../../types/app.d.ts';
import '../../types/app-models.d.ts';

// Define BaseModel interface that our Model interface extends
interface BaseModel {
  llmManager: LLMManager;
  getModelManager: () => LLMManager;
  aiAssistantModel: any;
  getAIAssistantModel: () => any;
  onModelManagerReady?: { listen: (callback: () => void) => () => void };
}

interface AIModelSettingsProps {
  loading?: boolean;
  error?: string;
}

// Utility functions
/**
 * Format a file size in bytes to a human-readable format
 */
function formatSize(bytes: number): string {
  if (bytes === 0 || bytes === undefined || bytes === null) return '0 B';
  
  // Log for debugging
  console.log(`[AIModelSettings] Formatting size: ${bytes} bytes`);
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  // Make sure i doesn't exceed the units array bounds
  const unitIndex = Math.min(i, units.length - 1);
  
  // Convert to the appropriate unit and round to 1 decimal place if greater than B
  const sizeInUnit = bytes / Math.pow(1024, unitIndex);
  const formattedSize = unitIndex === 0 ? 
    Math.round(sizeInUnit).toString() : 
    sizeInUnit.toFixed(1);
  
  console.log(`[AIModelSettings] Formatted size: ${formattedSize} ${units[unitIndex]}`);
  return `${formattedSize} ${units[unitIndex]}`;
}

function formatNumber(num: number): string {
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toString();
}

// Define extended model interface with AI assistant model
interface Model extends BaseModel {
  getModelManager: () => LLMManager;
  aiModel?: {
    getAvailableModels?: () => Promise<Array<LLM & { contactId?: string; hasContact?: boolean }>>;
  };
}

// Define additional utility functions
/**
 * Get the name part of a filename without extension
 * 
 * @param filename The filename to extract the name from
 * @returns The name without extension
 */
function getNameWithoutExtension(filename: string): string {
  if (!filename) return '';
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex === -1 ? filename : filename.substring(0, dotIndex);
}

// Add this new component to handle the prompt editor
function PromptEditor({ 
  prompt, 
  onSave, 
  loading 
}: { 
  prompt: string; 
  onSave: (prompt: string) => Promise<void>; 
  loading: boolean 
}) {
  const { t } = useTranslation('settings');
  const { theme } = useTheme();
  const [editedPrompt, setEditedPrompt] = useState(prompt);
  const [isEditing, setIsEditing] = useState(false);
  
  const handleSave = async () => {
    try {
      await onSave(editedPrompt);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving prompt:', error);
    }
  };
  
  if (isEditing) {
    return (
      <View style={{ padding: 16 }}>
        <Text variant="bodyMedium" style={{ marginBottom: 8 }}>
          {t('settings.ai.defaultPrompt.description')}
        </Text>
        <TextInput
          mode="outlined"
          value={editedPrompt}
          onChangeText={setEditedPrompt}
          multiline
          numberOfLines={6}
          style={{ marginBottom: 16 }}
          disabled={loading}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Button 
            mode="outlined" 
            onPress={() => setIsEditing(false)} 
            style={{ marginRight: 8 }}
            disabled={loading}
          >
            {t('common.cancel')}
          </Button>
          <Button 
            mode="contained" 
            onPress={handleSave}
            disabled={loading || editedPrompt === prompt}
            loading={loading}
          >
            {t('common.save')}
          </Button>
        </View>
      </View>
    );
  }
  
  return (
    <List.Item
      title={t('settings.ai.defaultPrompt.title')}
      description={
        <View>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {t('settings.ai.defaultPrompt.description')}
          </Text>
          <Text 
            variant="bodySmall" 
            style={{ 
              marginTop: 8, 
              color: theme.colors.onSurfaceVariant,
              fontStyle: 'italic' 
            }}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            "{prompt}"
          </Text>
        </View>
      }
      right={() => (
        <Button 
          mode="text" 
          onPress={() => setIsEditing(true)}
          disabled={loading}
        >
          {t('common.edit')}
        </Button>
      )}
    />
  );
}

export function AIModelSettings({ loading: parentLoading = false, error: parentError }: AIModelSettingsProps) {
  const { t } = useTranslation('settings');
  const { t: tButtons } = useTranslation('buttons');
  const { theme, isLoading: themeLoading } = useTheme();
  const paperTheme = usePaperTheme();
  const { model, isInitializing } = useModel();
  const appModel = model as unknown as AppModel;
  const { styles: themedStyles } = useTheme();
  
  // Add the LLM settings hook
  const { 
    globalSettings, 
    models: settingsModels,
    loading: settingsLoading, 
    error: settingsError,
    updateGlobalSettings,
    updateModelSettings,
    applyGlobalSettingsToAllModels
  } = useLLMSettings();

  // Component state declarations
  const [models, setModels] = useState<LLM[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [importing, setImporting] = useState({
    active: false,
    file: null as string | null,
    progress: 0,
    status: null as string | null
  });
  const [urlDialog, setUrlDialog] = useState({
    visible: false,
    url: ''
  });
  
  // Track if we're waiting for models to load after an import
  const [pendingImportCompletion, setPendingImportCompletion] = useState(false);
  const importedModelRef = useRef<string | null>(null);

  // Create a ref to track the loading state between renders
  const loadingStateRef = useRef({
    lastLoadTime: 0,
    isLoading: false
  });
  
  // Track if we've already attempted to recover models
  const hasAttemptedRecoveryRef = useRef(false);

  // Add state for settings
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [enableAutoSummary, setEnableAutoSummary] = useState(false);
  const [enableAutoResponse, setEnableAutoResponse] = useState(false);
  
  // Update local state from globalSettings when they load
  useEffect(() => {
    if (globalSettings) {
      setTemperature(globalSettings.temperature);
      setMaxTokens(globalSettings.maxTokens);
      setEnableAutoSummary(globalSettings.enableAutoSummary);
      setEnableAutoResponse(globalSettings.enableAutoResponse);
    }
  }, [globalSettings]);
  
  // Effect to handle completion of model imports
  useEffect(() => {
    if (pendingImportCompletion && !loading) {
      console.log('[AIModelSettings] Models list updated after import, pending completion detected, hiding spinner');
      // The models list has been updated and we were waiting for import completion
      setPendingImportCompletion(false);
      importedModelRef.current = null;
      
      // Only hide spinner after models are loaded and the UI is updated
      console.log('[AIModelSettings] Hiding spinner now that models are loaded');
      setImporting(current => ({
        ...current,
        active: false,
        file: null,
        progress: 0,
        status: null
      }));
      console.log('[AIModelSettings] Import process successfully completed, spinner hidden');
    }
  }, [models, loading, pendingImportCompletion]);
  
  // Save settings when they change
  const saveSettings = useCallback(async () => {
    try {
      if (!globalSettings) return;
      
      await updateGlobalSettings({
        temperature,
        maxTokens,
        enableAutoSummary,
        enableAutoResponse
      });
      
      console.log('[AIModelSettings] Settings saved successfully');
    } catch (err) {
      console.error('[AIModelSettings] Error saving settings:', err);
    }
  }, [globalSettings, updateGlobalSettings, temperature, maxTokens, enableAutoSummary, enableAutoResponse]);
  
  // Save model-specific settings
  const saveModelSettings = useCallback(async (modelId: string, settings: {
    temperature?: number;
    maxTokens?: number;
    threads?: number;
    batchSize?: number;
    contextSize?: number;
  }) => {
    try {
      await updateModelSettings(modelId, settings);
      console.log(`[AIModelSettings] Model settings saved for ${modelId}`);
    } catch (err) {
      console.error(`[AIModelSettings] Error saving model settings for ${modelId}:`, err);
    }
  }, [updateModelSettings]);

  // Load models on mount and when they change
  const loadModels = useCallback(async () => {
    console.log('[AIModelSettings] Loading AI models');
    setLoading(true);
    loadingStateRef.current.isLoading = true;
    setError(undefined);
    
    try {
      // First try to load models from LLM Manager
      let models: Array<LLM & { contactId?: string; hasContact?: boolean }> = [];
      
      try {
        console.log('[AIModelSettings] Fetching models from LLMManager');
        // Use getModelManager() consistently, just like we do in the import function
        if (appModel) {
          const manager = appModel.getModelManager();
          if (!manager) {
            console.error('[AIModelSettings] LLMManager not available');
            throw new Error('LLM Manager not available');
          }
          
          console.log('[AIModelSettings] LLMManager retrieved, calling listModels()');
          const llmModels = await manager.listModels();
          console.log(`[AIModelSettings] Found ${llmModels.length} models from LLMManager:`, 
            llmModels.map((m: LLM) => ({ name: m.name, personId: m.personId })));
          
          // Replace missing repairModelIdentities with existing diagnoseAndRepairContacts
          if (llmModels.length > 0) {
            const missingIdentities = llmModels.filter(m => !m.personId);
            if (missingIdentities.length > 0) {
              console.log(`[AIModelSettings] Found ${missingIdentities.length} models without personId, repairing identities`);
              
              // Use existing AIAssistantModel repair instead of the missing function
              if (appModel.aiAssistantModel && typeof appModel.aiAssistantModel.diagnoseAndRepairContacts === 'function') {
                console.log(`[AIModelSettings] Using AIAssistantModel.diagnoseAndRepairContacts to repair identities`);
                const repaired = await appModel.aiAssistantModel.diagnoseAndRepairContacts();
                console.log(`[AIModelSettings] Repaired ${repaired} model identities/contacts`);
              } else {
                console.warn(`[AIModelSettings] Cannot repair model identities - AIAssistantModel not available or missing diagnoseAndRepairContacts method`);
              }
            }
          }
          
          // Diagnostic logging for debugging LLM-Person-Someone relationships
          console.log("======= LLM DIAGNOSTIC LOG =======");
          for (const llm of llmModels) {
            console.log(`LLM: ${llm.name}`);
            console.log(`  - LLM ID: ${llm.$versionHash$ || '<unknown>'}`);
            console.log(`  - Person ID: ${llm.personId || '<none>'}`);
            
            // Check for Someone references
            if (llm.personId && appModel.getModelManager()) {
              try {
                // Get the leuteModel instance safely through the instance property
                const instance = (appModel as any).instance;
                const leuteModel = instance?.leuteModel;
                
                if (!leuteModel) {
                  console.log(`  - No leuteModel available for Someone lookup`);
                  continue;
                }
                
                const someone = await leuteModel.getSomeone(llm.personId);
                console.log(`  - Someone reference: ${someone ? 'EXISTS' : 'MISSING'}`);
                if (someone) {
                  console.log(`    - Someone ID: ${someone.idHash}`);
                  
                  // Check contacts list for this Someone
                  const contacts = await leuteModel.others();
                  console.log(`    - Checking ${contacts.length} contacts for this Person ID...`);
                  
                  // Find all Someones with this Person ID
                  const matchingSomeones = [];
                  for (const contact of contacts) {
                    try {
                      const contactPersonId = typeof contact.mainIdentity === 'function' 
                        ? await contact.mainIdentity() 
                        : contact.personId;
                      
                      if (contactPersonId && contactPersonId.toString() === llm.personId.toString()) {
                        matchingSomeones.push({
                          id: contact.idHash,
                          isMainIdentity: contact.idHash === someone.idHash
                        });
                      }
                    } catch (e) {
                      // Ignore errors in identity lookup
                    }
                  }
                  
                  console.log(`    - Found ${matchingSomeones.length} Someone objects with this Person ID`);
                  for (const match of matchingSomeones) {
                    console.log(`      - ${match.id} ${match.isMainIdentity ? '(Primary)' : '(Duplicate)'}`);
                  }
                }
              } catch (e) {
                console.log(`  - Error checking Someone: ${e}`);
              }
            }
          }
          console.log("======= END LLM DIAGNOSTIC LOG =======");
          
          if (llmModels.length > 0) {
            // Convert LLM models to extended format
            models = llmModels.map((model: LLM) => ({
              ...model,
              hasContact: false
            }));
          }
        } else {
          console.warn('[AIModelSettings] AppModel is not available, cannot load models');
          throw new Error('App model not available');
        }
      } catch (llmError) {
        console.error('[AIModelSettings] Error loading LLM models:', llmError);
      }
      
      // AIAssistantModel doesn't have getAvailableModels method, skip this section
      
      // Sort models by name
      models.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      
      // Set models
      console.log(`[AIModelSettings] Setting ${models.length} models in state`);
      setModels(models);
      
      if (models.length === 0 && !hasAttemptedRecoveryRef.current) {
        // If we still don't have models, attempt one more approach - look for models in storage directly
        console.log('[AIModelSettings] No models found, attempting model recovery');
        try {
          if (appModel) {
            const manager = appModel.getModelManager();
            if (manager && typeof manager.recoverModelsFromStorage === 'function') {
              console.log('[AIModelSettings] Calling recoverModelsFromStorage()');
              
              // Mark that we've attempted recovery to avoid duplicate attempts
              hasAttemptedRecoveryRef.current = true;
              
              // recoverModelsFromStorage now returns a boolean indicating if models were found
              const modelsRecovered = await manager.recoverModelsFromStorage();
              
              // Only reload the model list if actual models were recovered
              if (modelsRecovered) {
                console.log('[AIModelSettings] Models were recovered, reloading model list');
                
                // Try listing models again
                const recoveredModels = await manager.listModels();
                console.log(`[AIModelSettings] Recovery found ${recoveredModels.length} models`);
                
                if (recoveredModels.length > 0) {
                  // Set models in state
                  setModels(recoveredModels.map((model: LLM) => ({
                    ...model,
                    hasContact: false
                  })));
                }
              } else {
                console.log('[AIModelSettings] No models were recovered, not reloading model list');
              }
            }
          }
        } catch (recoveryError) {
          console.error('[AIModelSettings] Model recovery attempt failed:', recoveryError);
        }
      }
      
      // Clear error
      setError(undefined);
      
      // Record last load time
      loadingStateRef.current.lastLoadTime = Date.now();
      
      // Return models
      return models;
    } catch (err) {
      console.error('[AIModelSettings] Error loading models:', err);
      setError(getErrorMessage(err));
      
      return [];
    } finally {
      // Always clear loading state
      console.log('[AIModelSettings] Finished loading models, clearing loading state');
      setLoading(false);
      loadingStateRef.current.isLoading = false;
    }
  }, [appModel]);

  // Listen for model updates and imports
  useEffect(() => {
    console.log('[AIModelSettings] Setting up model update listeners');
    
    // Track processed imports to prevent duplicate handling
    const processedImports = new Set<string>();
    
    try {
      const manager = appModel?.getModelManager();
      if (manager) {
        console.log('[AIModelSettings] Got model manager, setting up listeners');
        
        // Set up a single listener for the main model updates
        const modelUpdateUnsubscribe = manager.onModelsUpdated.listen(() => {
          console.log('[AIModelSettings] Received model update event, reloading models');
          loadModels();
        });
        console.log('[AIModelSettings] Set up model update listener');

        // Keep separate listener for imports to handle UI state specific to imports
        const modelImportUnsubscribe = manager.onModelImported.listen((model: LLM) => {
          // Generate a unique import ID based on model name and timestamp
          const importId = `${model.name}-${Date.now()}`;
          
          // Skip if we've already processed this import event in this session
          if (processedImports.has(model.name)) {
            console.log(`[AIModelSettings] Skipping duplicate import event for model: ${model.name}`);
            return;
          }
          
          console.log('[AIModelSettings] Received model import event for model:', model.name);
          processedImports.add(model.name);
          
          // Check if this is the model we're waiting for
          if (importing.active && importedModelRef.current === model.name) {
            console.log('[AIModelSettings] Imported model matches pending import, clearing importing state');
            
            // Clear the importing state
            setImporting(current => ({
              ...current,
              active: false,
              file: null,
              progress: 0,
              status: null
            }));
            
            // Clear the pending completion flag
            setPendingImportCompletion(false);
            
            // Clear the imported model reference
            importedModelRef.current = null;
            
            console.log('[AIModelSettings] Import spinner cleared based on direct model import notification');
          }
          
          // Force a complete refresh from storage 
          console.log('[AIModelSettings] Forcing refresh after import completed');
          loadModels().then(() => {
            console.log('[AIModelSettings] Models refreshed after import');
          }).catch(error => {
            console.error('[AIModelSettings] Error refreshing models after import:', error);
          });
        });
        console.log('[AIModelSettings] Set up model import listener');
        
        // Also listen to channel manager updates for model changes
        if (appModel?.channelManager?.onUpdated) {
          const channelUpdateUnsubscribe = appModel.channelManager.onUpdated.listen((channelInfoIdHash, channelId) => {
            // Only refresh on LLM channel updates
            if (channelId === 'llm') {
              console.log('[AIModelSettings] Received channel update for LLM channel, reloading models');
              loadModels();
            }
          });
          
          // Clean up listeners on unmount
          return () => {
            modelUpdateUnsubscribe();
            modelImportUnsubscribe();
            channelUpdateUnsubscribe();
            processedImports.clear();
          };
        } else {
          // Clean up listeners on unmount if no channel manager
          return () => {
            modelUpdateUnsubscribe();
            modelImportUnsubscribe();
            processedImports.clear();
          };
        }
      } else {
        console.warn('[AIModelSettings] Model manager not available');
      }
    } catch (err) {
      console.error('[AIModelSettings] Error setting up model update listeners:', err);
    }
    
    // Return empty cleanup function if we couldn't set up listeners
    return () => {};
  }, [appModel, importing.active, loadModels]);

  // Handle import timeout
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    
    if (importing.active) {
      console.log('[AIModelSettings] Import is active but not setting a timeout');
      // No timeout - removed as requested
      // Previously had a 15-second timeout that would force-clear the spinner
    }
    
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [importing.active, loadModels]);

  // Add focus effect to reload models when screen gains focus
  useFocusEffect(
    useCallback(() => {
      console.log('[AIModelSettings] Screen focused, refreshing models');
      
      // Always refresh models when the screen comes into focus
      // This ensures we have the latest data from storage
      const refreshModels = async () => {
        try {
          if (loadingStateRef.current.isLoading) {
            console.log('[AIModelSettings] Already loading, skipping additional refresh');
            return;
          }
          
          // Force a complete refresh from storage
          console.log('[AIModelSettings] Forcing model refresh from storage');
          await loadModels();
        } catch (error) {
          console.error('[AIModelSettings] Error refreshing models on focus:', error);
        }
      };
      
      refreshModels();
      
      return () => {
        // Clean up any pending operations when screen loses focus
        console.log('[AIModelSettings] Screen unfocused');
      };
    }, [loadModels])
  );

  const handleDelete = async (modelId: string) => {
    try {
      setLoading(true);
      setError(undefined);
      
      console.log(`[AIModelSettings] Deleting model with ID: ${modelId}`);
      
      // Use the consistent approach to get the model manager
      if (!appModel) {
        throw new Error('App model not available');
      }
      
      const manager = appModel.getModelManager();
      if (!manager) {
        throw new Error('LLM Manager not available');
      }
      
      // Delete the model
      await manager.deleteModel(modelId);
      console.log(`[AIModelSettings] Model ${modelId} deleted successfully`);
      
      // Reload models after deletion
      await loadModels();
      
    } catch (err) {
      console.error('[AIModelSettings] Delete failed:', err);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setConfirmDelete(null);
    }
  };

  /**
   * Handle file import process
   * Imports a model file from DocumentPicker
   */
  const handleFileImport = useCallback(async () => {
    try {
      console.log('[AIModelSettings] Starting file import process');
      
      // Set importing state to true to show spinner
      setImporting(current => ({
        ...current,
        active: true,
        progress: 0,
        status: 'Selecting file...'
      }));
      console.log('[AIModelSettings] Set importing active=true for file selection');
      
      // Pick file
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true
      });
      
      if (!result.canceled) {
        const file = result.assets[0];
        console.log(`[AIModelSettings] Selected file: ${file.name}, URI: ${file.uri}`);
        
        // Update importing state
        setImporting(current => ({
          ...current, 
          progress: 0.3,
          status: 'Importing model...'
        }));
        console.log('[AIModelSettings] Updated importing state: Importing model... (0.3)');
        
        // Get model manager
        const manager = appModel?.getModelManager();
        if (!manager) {
          throw new Error('Model manager not available');
        }
        console.log('[AIModelSettings] Got model manager, starting import');
        
        // Create timestamp for naming if needed
        const now = Date.now();
        
        // Create import options with the original filename
        const importOptions = {
          name: file.name ? getNameWithoutExtension(file.name) : undefined,
          filename: file.name,
          active: false,  // Start as inactive
          creator: 'user',
          deleted: false,
          size: file.size || 0
        };
        
        // Log the import options
        console.log('[AIModelSettings] Import options:', importOptions);
        
        // Remember what model we're importing so we can match it in the import callback
        importedModelRef.current = importOptions.name;
        
        // Initiate import
        const llmObject = await manager.importFromFile(file.uri, importOptions);
        
        console.log('[AIModelSettings] Created LLM object:', {
          filename: llmObject.filename,
          name: llmObject.name,
          modelType: llmObject.modelType,
          size: llmObject.size
        });
        
        // Set flag to wait for import completion event
        setPendingImportCompletion(true);
        
      } else {
        // User cancelled
        console.log('[AIModelSettings] File selection cancelled');
        setImporting(current => ({
          ...current,
          active: false,
          file: null,
          progress: 0,
          status: null
        }));
      }
    } catch (error) {
      console.error('[AIModelSettings] Error importing file:', error);
      // Extract user-friendly error message
      let errorMessage = 'Failed to import model';
      if (error instanceof Error) {
        errorMessage = error.message;
        // Clean up technical error messages
        if (errorMessage.includes('SB-COPY-FAIL')) {
          errorMessage = 'Unable to import model file. This may be due to iOS security restrictions. Please try selecting the file again.';
        }
      }
      setImporting(current => ({
        ...current,
        active: false,
        error: errorMessage
      }));
    }
  }, [appModel, setImporting, importedModelRef]);

  const handleUrlImport = async (url: string) => {
    if (!url) return;
    
    setUrlDialog({
      ...urlDialog,
      visible: false
    });
    
    console.log(`[AIModelSettings] Starting URL import from: ${url}`);
    
    setImporting(current => ({
      ...current,
      active: true,
      file: null,
      status: 'Downloading model...',
      progress: 0.05
    }));
    console.log('[AIModelSettings] Set importing active=true for URL download');
    
    try {
      const manager = appModel.getModelManager();
      console.log('[AIModelSettings] Got model manager, starting URL import');
      
      console.log('[AIModelSettings] Calling manager.importFromUrl...');
      const importedModelDef = await manager.importFromUrl(url);
      
      console.log('[AIModelSettings] Model definition imported:', importedModelDef);
      
      // Store the imported model name right after successful import
      importedModelRef.current = importedModelDef.name;
      console.log(`[AIModelSettings] Set importedModelRef.current to: ${importedModelDef.name}`);
      
      setImporting(current => ({
        ...current,
        status: 'Setting up AI assistant...',
        progress: 0.7
      }));
      console.log('[AIModelSettings] Updated importing state: Setting up AI assistant... (0.7)');
      
      // Get AI assistant model to access owner personId
      const aiAssistantModel = appModel.getAIAssistantModel();
      console.log('[AIModelSettings] Got AI assistant model');
      
      // Get the model manager to create the LLM properly with hashes
      const modelManager = appModel.getModelManager();
      
      // Create a complete LLM object instead of a partial one
      const now = Date.now();
      const llmObject: LLM = {
        $type$: 'LLM',
        name: importedModelDef?.name || 'model.gguf',
        filename: importedModelDef?.metadata?.filename || 'model.gguf',
        modelType: 'local',
        deleted: false,
        active: false,
        creator: 'user',
        created: now,
        modified: now,
        createdAt: new Date(now).toISOString(),
        lastUsed: new Date(now).toISOString(),
        usageCount: 0,
        lastInitialized: 0,
        size: importedModelDef?.size || 0,
        capabilities: importedModelDef?.capabilities || ['chat', 'inference'],
        personId: aiAssistantModel?.ownerPersonId,
        architecture: importedModelDef?.architecture || 'unknown',
        contextLength: importedModelDef?.metadata?.contextLength || 2048,
        temperature: 0.7,
        maxTokens: 2048,
        threads: importedModelDef?.metadata?.threads || 4,
        quantization: importedModelDef?.metadata?.quantization || 'unknown'
      };
      
      // Store the model directly
      await modelManager.storeModel(llmObject);
      console.log('[AIModelSettings] Stored LLM object:', {
        name: llmObject.name,
        filename: llmObject.filename,
        modelType: llmObject.modelType,
        size: llmObject.size
      });
      
      try {
        // Log the imported model details
        console.log(`[AIModelSettings] Imported model details:`, {
          name: importedModelDef.name,
          filename: importedModelDef.metadata?.filename || 'model.gguf',
          provider: importedModelDef.provider || 'lama',
          modelType: importedModelDef.modelType || 'local'
        });
        
        // Ensure aiAssistantModel exists before using it
        if (!aiAssistantModel) {
          throw new Error('AIAssistantModel not available');
        }
        
        // Contact creation is now handled automatically by AIAssistantModel's event listener
        // No need to manually create the contact here
        console.log(`[AIModelSettings] Contact will be created automatically via AIAssistantModel event listener`);
        const aiSetupStart = Date.now();
        
        // Let's wait a moment to ensure the event has been processed
        await new Promise(resolve => setTimeout(resolve, 500));
        
        console.log(`[AIModelSettings] AI setup completed in ${Date.now() - aiSetupStart}ms`);

        // Run deduplication to clean up any duplicates that might have been created
        try {
          console.log('[AIModelSettings] Running contact duplication check');
          // Set fixDuplicates to false to make it throw an error when duplicates are found
          // This helps us identify the source of duplicate contacts
          const duplicatesFound = await aiAssistantModel.deduplicateContacts({
            logResults: true,
            fixDuplicates: false
          });
          console.log(`[AIModelSettings] Duplicate check completed`);
        } catch (dedupError) {
          console.error('[AIModelSettings] CRITICAL: Duplicate contacts detected after import:', dedupError);
          // Continue despite duplication error, but make it visible in logs for debugging
          
          // Show an alert about the duplicate contacts
          Alert.alert(
            'Duplicate Contacts Detected',
            'Duplicate contacts were found after importing the model. This indicates an issue with the contact creation process. Please check the logs for details.',
            [{ text: 'OK' }]
          );
        }

        // Activate the model to ensure contacts and topics are created
        try {
          console.log(`[AIModelSettings] Activating imported model: ${importedModelDef.name}`);
          const modelManager = appModel.getModelManager();
          if (modelManager && typeof modelManager.activateModel === 'function') {
            await modelManager.activateModel(importedModelDef.name);
            console.log(`[AIModelSettings] Model activated successfully: ${importedModelDef.name}`);
          } else {
            console.warn(`[AIModelSettings] Cannot activate model - activateModel method not available`);
          }
        } catch (error) {
          console.error(`[AIModelSettings] Error activating model:`, error);
        }

        // About to update importing state for loading models
        console.log(`[AIModelSettings] About to update importing state for loading models`);
        setImporting(current => ({
          ...current,
          status: 'Updating models list...',
          progress: 0.9
        }));
        console.log('[AIModelSettings] Updated importing state: Updating models list... (0.9)');
        
        // Mark that we're waiting for the models list to update
        importedModelRef.current = importedModelDef.name;
        setPendingImportCompletion(true);
        
        // Load models - this will now work correctly using the proper manager getter
        console.log('[AIModelSettings] About to call loadModels() with spinner still showing');
        const loadStart = Date.now();
        
        try {
          await loadModels();
          const loadTime = Date.now() - loadStart;
          console.log(`[AIModelSettings] loadModels() completed in ${loadTime}ms, waiting for UI update`);
          
          // If loading takes too long, log a warning as it might indicate a problem
          if (loadTime > 5000) {
            console.warn(`[AIModelSettings] WARNING: loadModels() took ${loadTime}ms, which is unusually long`);
          }
          
        } catch (loadError) {
          console.error(`[AIModelSettings] loadModels() failed after ${Date.now() - loadStart}ms with error:`, loadError);
          throw loadError; // Re-throw to be caught by outer catch block
        }

        // The spinner will be hidden by the useEffect when models are loaded
      } catch (aiError) {
        console.error('[AIModelSettings] Failed to setup AI assistant:', aiError);
        console.error('[AIModelSettings] Error details:', JSON.stringify(aiError, null, 2));
        
        // Show specific error to user
        Alert.alert(
          t('ai.importError'),
          t('ai.setupError', { defaultValue: 'Model was imported but failed to set up AI assistant: ' }) + 
            getErrorMessage(aiError)
        );
        
        // Reset pending state
        setPendingImportCompletion(false);
        
        // Don't clear importedModelRef since model was successfully imported
        // This allows the onModelImported listener to still clear the spinner if triggered
        
        // Hide spinner on error
        console.log('[AIModelSettings] Hiding spinner due to AI setup error');
        setImporting(current => ({
          ...current,
          active: false,
          file: null,
          progress: 0,
          status: null
        }));
        
        // Still attempt to load models to show what was imported
        console.log('[AIModelSettings] Attempting to load models after AI setup error');
        try {
          await loadModels();
          console.log('[AIModelSettings] Models loaded after AI setup error');
        } catch (loadError) {
          console.error('[AIModelSettings] Failed to load models after AI setup error:', loadError);
        }
      }
    } catch (err) {
      console.error('[AIModelSettings] URL import error:', err);
      console.error('[AIModelSettings] Error details:', JSON.stringify(err, null, 2));
      setError(getErrorMessage(err));
      console.log('[AIModelSettings] Hiding spinner due to import error');
      setImporting(current => ({
        ...current,
        active: false,
        file: null,
        progress: 0,
        status: null
      }));
      
      // Reset pending state
      setPendingImportCompletion(false);
      importedModelRef.current = null;
      
      // Keep error popup for error conditions
      Alert.alert(
        t('ai.importError', { defaultValue: 'Import Error' }),
        t('ai.importErrorMessage', { defaultValue: 'Failed to import model: ' }) + 
          getErrorMessage(err)
      );
    }
  };

  // Add state to track which models are expanded
  const [expandedModels, setExpandedModels] = useState<Record<string, boolean>>({});
  
  // Function to render a model item
  const renderModelItem = useCallback(({ item }: { item: LLM & { contactId?: string; hasContact?: boolean } }) => {
    console.log(`[AIModelSettings] Rendering model item:`, {
      name: item.name,
      size: item.size,
      formattedSize: formatSize(item.size || 0),
      modelType: item.modelType
    });
    
    const isExpanded = expandedModels[item.name] || false;
    
    // Function to toggle expanded state of this model
    const toggleExpanded = () => {
      setExpandedModels(current => ({
        ...current,
        [item.name]: !current[item.name]
      }));
    };
    
    return (
      <View style={{ marginBottom: 8 }}>
        <List.Item
          title={item.name}
          description={`${item.modelType || 'unknown'} - ${formatSize(item.size || 0)}`}
          left={props => <List.Icon {...props} icon="brain" />}
          right={props => (
            <IconButton
              {...props}
              icon={isExpanded ? 'chevron-up' : 'chevron-down'}
              onPress={toggleExpanded}
            />
          )}
          onPress={toggleExpanded}
          style={{ paddingVertical: 8 }}
        />
        
        {isExpanded && (
          <Surface style={{ padding: 16, marginTop: -8, borderTopWidth: 0 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontWeight: 'bold' }}>{t('settings.ai.models.size', { defaultValue: 'Size' })}</Text>
              <Text>{formatSize(item.size || 0)}</Text>
            </View>
            
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ fontWeight: 'bold' }}>{t('settings.ai.models.type', { defaultValue: 'Type' })}</Text>
              <Text>{item.modelType || 'unknown'}</Text>
            </View>
            
            {item.architecture && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontWeight: 'bold' }}>{t('settings.ai.models.architecture', { defaultValue: 'Architecture' })}</Text>
                <Text>{item.architecture}</Text>
              </View>
            )}
            
            {item.contextLength && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontWeight: 'bold' }}>{t('settings.ai.models.contextLength', { defaultValue: 'Context Length' })}</Text>
                <Text>{item.contextLength}</Text>
              </View>
            )}
            
            {item.quantization && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ fontWeight: 'bold' }}>{t('settings.ai.models.quantization', { defaultValue: 'Quantization' })}</Text>
                <Text>{item.quantization}</Text>
              </View>
            )}
            
            <Divider style={{ marginVertical: 8 }} />
            
            <Button
              mode="contained"
              color={paperTheme.colors.error}
              onPress={() => handleDelete(item.name)}
              style={{ marginTop: 8 }}
            >
              {t('buttons.delete', { defaultValue: 'Delete' })}
            </Button>
          </Surface>
        )}
      </View>
    );
  }, [expandedModels, handleDelete, t, paperTheme.colors.error]);

  // Create styles with the paperTheme
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: 16,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
    },
    section: {
      marginBottom: 16,
      marginHorizontal: 16,
      padding: 0,
      borderRadius: 10,
      elevation: 0,
      backgroundColor: paperTheme.colors.surfaceVariant,
      overflow: 'hidden',
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 20,
      color: paperTheme.colors.primary,
    },
    settingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 16,
    },
    sliderContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '60%',
    },
    slider: {
      flex: 1,
    },
    sliderValue: {
      width: 50,
      textAlign: 'right',
    },
    modelSettings: {
      padding: 16,
      backgroundColor: paperTheme.colors.surfaceVariant,
      borderRadius: 8,
      marginTop: 12,
      marginBottom: 12,
    },
    settingTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      marginBottom: 16,
      color: paperTheme.colors.primary,
    },
    modelItem: {
      marginBottom: 8,
      backgroundColor: paperTheme.colors.surface,
      borderRadius: 8,
      overflow: 'hidden',
    },
    modelDetails: {
      flexDirection: 'column',
      paddingHorizontal: 16,
      paddingBottom: 16,
    },
    modelDetailText: {
      marginBottom: 8,
    },
    modelActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: 8,
    },
    actionButton: {
      marginLeft: 8,
    },
    sectionHeader: {
      fontSize: 13,
      fontWeight: '600',
      color: paperTheme.colors.onSurfaceVariant,
      marginTop: 24,
      marginBottom: 8,
      paddingHorizontal: 16,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    divider: {
      marginVertical: 16,
    },
    emptyStateContainer: {
      padding: 16,
      alignItems: 'center',
      backgroundColor: paperTheme.colors.surface,
      borderRadius: 8,
      marginHorizontal: 16,
      marginBottom: 16,
    },
    emptyStateText: {
      textAlign: 'center',
      color: paperTheme.colors.onSurface,
    }
  });

  // In the AIModelSettings component, add a helper function to create a topic for a model

  /**
   * Create or find a topic for an AI model
   * This function defers to AIAssistantModel for topic creation
   * to ensure a single code path for topic creation
   * 
   * @param modelName The name of the model to create a topic for
   */
  const createTopicForModel = async (modelName: string): Promise<string | undefined> => {
    console.log(`[AIModelSettings] Getting topic for model: ${modelName}`);
    try {
      if (!appModel || !appModel.aiAssistantModel) {
        console.warn('[AIModelSettings] Cannot get topic - AIAssistantModel not available');
        return undefined;
      }
      
      // Instead of checking and creating the topic ourselves,
      // delegate to AIAssistantModel's ensureTopicExists method
      // which centralizes topic creation and handles all event synchronization
      console.log(`[AIModelSettings] Delegating topic creation to AIAssistantModel for model: ${modelName}`);
      
      const topicId = await appModel.aiAssistantModel.ensureTopicExists(modelName);
      
      if (topicId) {
        console.log(`[AIModelSettings] AIAssistantModel created topic: ${topicId}`);
        return topicId;
      } else {
        console.log(`[AIModelSettings] AIAssistantModel could not create topic for model: ${modelName}`);
        return undefined;
      }
    } catch (error) {
      console.error(`[AIModelSettings] Error getting topic:`, error);
      return undefined;
    }
  };

  return (
    <>
      {/* Global AI Settings */}
      <Surface style={[styles.section, { padding: 16 }]}>
        <Text style={styles.sectionTitle}>{t('settings.ai.globalSettings', { defaultValue: 'Global Settings' })}</Text>
        
        {/* Add prompt editor here */}
        {globalSettings && (
          <PromptEditor
            prompt={globalSettings.defaultPrompt}
            onSave={async (prompt) => {
              if (!appModel) return;
              
              try {
                // Get creator ID
                const leuteModel = appModel.leuteModel;
                const creatorId = await leuteModel.myMainIdentity();
                if (!creatorId) throw new Error('No creator ID available');
                
                // Update global settings with new prompt
                await updateGlobalSettings({
                  defaultPrompt: prompt
                });
                
                // Force refresh of state
                await loadModels();
              } catch (error) {
                console.error('Failed to update prompt:', error);
                throw error;
              }
            }}
            loading={settingsLoading}
          />
        )}
        
        <View style={styles.settingRow}>
          <Text>{t('settings.ai.temperatureTitle', { defaultValue: 'Temperature' })}</Text>
          <View style={styles.sliderContainer}>
            <Slider
              value={temperature}
              minimumValue={0}
              maximumValue={1}
              step={0.1}
              onValueChange={setTemperature}
              onSlidingComplete={() => saveSettings()}
              style={styles.slider}
            />
            <Text style={styles.sliderValue}>{temperature.toFixed(1)}</Text>
          </View>
        </View>
        
        <View style={styles.settingRow}>
          <Text>{t('settings.ai.maxTokensTitle', { defaultValue: 'Max Tokens' })}</Text>
          <View style={styles.sliderContainer}>
            <Slider
              value={maxTokens}
              minimumValue={256}
              maximumValue={4096}
              step={256}
              onValueChange={setMaxTokens}
              onSlidingComplete={() => saveSettings()}
              style={styles.slider}
            />
            <Text style={styles.sliderValue}>{maxTokens}</Text>
          </View>
        </View>
        
        <View style={styles.settingRow}>
          <Text>{t('settings.ai.autoSummary', { defaultValue: 'Auto Summary' })}</Text>
          <Switch
            value={enableAutoSummary}
            onValueChange={(value) => {
              setEnableAutoSummary(value);
              saveSettings();
            }}
          />
        </View>
        
        <View style={[styles.settingRow, { marginBottom: 0 }]}>
          <Text>{t('settings.ai.autoResponse', { defaultValue: 'Auto Response' })}</Text>
          <Switch
            value={enableAutoResponse}
            onValueChange={(value) => {
              setEnableAutoResponse(value);
              saveSettings();
            }}
          />
        </View>
      </Surface>
      
      <Divider style={styles.divider} />
      
      {/* Import Options Section */}
      <Text style={styles.sectionHeader}>{t('settings.ai.models.import.title', { defaultValue: 'Import Model' })}</Text>
      
      <Surface style={[styles.section, { marginBottom: 16, padding: 0 }]}>
        <List.Item
          title={t('settings.ai.models.importFromFile', { defaultValue: 'Import from File' })}
          description={importing.active ? importing.status || t('common.importing', { defaultValue: 'Importing...' }) : t('settings.ai.models.importFromFileDescription', { defaultValue: 'Select a model file' })}
          style={{ paddingVertical: 8 }}
          right={props => importing.active ? 
            <ActivityIndicator {...props} size="small" /> : 
            <List.Icon {...props} icon="file" />
          }
          onPress={handleFileImport}
          disabled={loading || importing.active}
        />
        
        <Divider />
        
        <List.Item
          title={t('settings.ai.models.importFromUrl', { defaultValue: 'Import from URL' })}
          description={t('settings.ai.models.importFromUrlDescription', { defaultValue: 'Import from Hugging Face or direct URL' })}
          style={{ paddingVertical: 8 }}
          right={props => <List.Icon {...props} icon="link" />}
          onPress={() => setUrlDialog({ ...urlDialog, visible: true })}
          disabled={loading || importing.active}
        />
      </Surface>
      
      <Divider style={styles.divider} />
      
      {/* Installed Models Section */}
      <Text style={styles.sectionHeader}>{t('settings.ai.models.installed', { defaultValue: 'Installed Models' })}</Text>
      
      {/* Show loading indicator only when actively loading, not on init */}
      {loading && (
        <Surface style={[styles.section, { alignItems: 'center' }]}>
          <ActivityIndicator size="small" />
          <Text style={{ marginTop: 8 }}>{t('common.loading', { defaultValue: 'Loading...' })}</Text>
        </Surface>
      )}
      
      {!loading && (error || parentError) && (
        <Surface style={[styles.section, { backgroundColor: '#ffeeee' }]}>
          <Text style={{ color: paperTheme.colors.error }}>{error || parentError || t('common.error', { defaultValue: 'An error occurred' })}</Text>
          <Text style={{ marginTop: 8, fontSize: 12, color: paperTheme.colors.error }}>
            {t('settings.ai.models.errorDescription', { defaultValue: 'Could not load models. Please try again.' })}
          </Text>
        </Surface>
      )}
      
      {!loading && !error && !parentError && models.length === 0 && (
        <Surface style={styles.section}>
          <View style={styles.emptyStateContainer}>
            <Text style={styles.emptyStateText}>{t('settings.ai.models.noModelsTitle', { defaultValue: 'No Models' })}</Text>
            <Text style={[styles.emptyStateText, { marginTop: 8, opacity: 0.7 }]}>
              {t('settings.ai.models.noModelsDescription', { defaultValue: 'Import a model to get started.' })}
            </Text>
          </View>
        </Surface>
      )}
      
      {!loading && !error && !parentError && models.length > 0 && (
        <Surface style={styles.section}>
          {models.map((item, index) => (
            <View key={`${item.name}-${index}`} style={{ marginBottom: 8 }}>
              {renderModelItem({ item })}
            </View>
          ))}
        </Surface>
      )}

      {/* URL Import Dialog */}
      <Portal>
        <Dialog 
          visible={urlDialog.visible} 
          onDismiss={() => setUrlDialog({ ...urlDialog, visible: false })}
          style={{ borderRadius: 14 }} // iOS alert standard corner radius
        >
          <Dialog.Title>{t('settings.ai.models.importFromUrl', { defaultValue: 'Import from URL' })}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label={t('settings.ai.models.modelUrl', { defaultValue: 'Model URL' })}
              value={urlDialog.url}
              onChangeText={(text) => setUrlDialog({ ...urlDialog, url: text })}
              autoCapitalize="none"
              autoCorrect={false}
              disabled={importing.active}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setUrlDialog({ ...urlDialog, visible: false })}>
              {tButtons('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button 
              onPress={() => handleUrlImport(urlDialog.url)}
              loading={importing.active}
              disabled={!urlDialog.url || importing.active}
            >
              {tButtons('common.import', { defaultValue: 'Import' })}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Delete Confirmation */}
      <Portal>
        <Dialog 
          visible={!!confirmDelete} 
          onDismiss={() => setConfirmDelete(null)}
          style={{ borderRadius: 14 }} // iOS alert standard corner radius
        >
          <Dialog.Title>{t('settings.ai.models.deleteConfirmTitle', { defaultValue: 'Delete Model' })}</Dialog.Title>
          <Dialog.Content>
            <Text>{t('settings.ai.models.deleteConfirmMessage', { defaultValue: 'Are you sure you want to delete this model?' })}</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmDelete(null)}>
              {tButtons('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <Button 
              onPress={() => confirmDelete && handleDelete(confirmDelete)}
              loading={loading}
              disabled={loading}
              textColor={paperTheme.colors.error}
            >
              {tButtons('common.delete', { defaultValue: 'Delete' })}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
} 
