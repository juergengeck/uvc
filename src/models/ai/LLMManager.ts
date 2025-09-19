// Core imports - using proper package resolution
/**
 * @fileoverview LLMManager - Manages the lifecycle of Large Language Models
 * 
 * IMPORTANT ARCHITECTURAL NOTE:
 * This implementation follows the ONE core architecture principles:
 * 
 * 1. LLM vs LLMSettings separation:
 *    - LLM objects are versioned ONE objects defined by a recipe
 *    - They should only contain stable, persistent properties defined in the recipe
 *    - Runtime state like 'isLoaded' should NEVER be stored in LLM objects
 *    - Runtime state belongs in LLMSettings objects
 * 
 * 2. Object Identity Preservation:
 *    - ONE objects should have stable identity based on their id properties
 *    - Properties defining object identity must not change
 *    - Runtime properties must be stored separately from identity-defining objects
 * 
 * 3. Versioning:
 *    - Versioned ONE objects (like LLM) are addressed by idHash
 *    - Each version has its own fullHash
 *    - Changing a versioned object creates a new version with the same idHash
 * 
 * For more details, see:
 * - one.core/src/recipes.js
 * - one.core/src/instance.js
 * - one.core/src/util/object.js
 * - one.core/src/object-recipes.js
 */
import { STORAGE } from '@refinio/one.core/lib/storage-base-common';
import { getStorageDir, exists, fileSize, deleteFile, makeDirectory, copyFile } from '@refinio/one.core/lib/system/expo/storage-base';
import { StorageStreams } from '@refinio/one.core/lib/system/expo/storage-streams-impl';
import * as FileSystem from 'expo-file-system';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import { Order } from '@refinio/one.models/lib/models/ChannelManager.js';
import type { QueryOptions } from '@refinio/one.models/lib/models/ChannelManager.js';
import type { ChannelInfo } from '@refinio/one.models/lib/recipes/ChannelRecipes.js';
import type { Person, OneObjectTypes, OneObjectTypeNames } from '@refinio/one.core/lib/recipes.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';
import { ensureIdHash } from '@refinio/one.core/lib/util/type-checks';
import { createMessageBus, type MessageBusObj } from '@refinio/one.core/lib/message-bus';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import type { ObjectData } from '@refinio/one.models/lib/models/ChannelManager.js';
import { getPersonIdForLLM, normalizeModelNameToEmail, getOrCreateSomeoneForLLM, createPersonObject } from '../../utils/contactUtils';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type { LLM } from '../../types/llm';
import type { LLMSettings } from '../../types/ai';
import { ModelService } from '../../services/ModelService';
// Import getNameWithoutExtension from textUtils
import { getNameWithoutExtension } from '../../utils/textUtils';
import type { CLOB } from '@refinio/one.core/lib/recipes.js';
import { storeThinkingAsClob } from '../../utils/storage/clobStorage';

// Import LlamaModel here instead of dynamically
import { LlamaModel } from './LlamaModel';
// Remove the problematic import
// import type { toggleNativeLog, addNativeLogListener } from 'llama.rn';
import { Platform } from 'react-native';

// Debug imports
import { startLogger } from '@refinio/one.core/lib/logger.js';
import Debug from 'debug';

// Core functionality
import { storeVersionedObject, getObjectByIdHash, getCurrentVersion } from '@refinio/one.core/lib/storage-versioned-objects.js';
import { calculateIdHashOfObj, calculateHashOfObj } from '@refinio/one.core/lib/util/object.js';
import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';
import SomeoneModel from '@refinio/one.models/lib/models/Leute/SomeoneModel.js';
import ProfileModel from '@refinio/one.models/lib/models/Leute/ProfileModel.js';
// Import keychain and crypto functions statically
import { hasDefaultKeys, createDefaultKeys } from '@refinio/one.core/lib/keychain/keychain.js';
import { createKeyPair } from '@refinio/one.core/lib/crypto/encryption.js';
import { createSignKeyPair } from '@refinio/one.core/lib/crypto/sign.js';
// Import normalizeFilename
import { normalizeFilename } from '@refinio/one.core/lib/system/expo/storage-base.js';
// Note on ONE content addressing: normalizeFilename is crucial for maintaining ONE's content-addressing system.
// Using normalized filenames ensures that object identity is preserved across the system,
// which is essential for proper hash calculation and content addressing in the ONE framework.

import { LLMSettingsManager, DEFAULT_LLM_SETTINGS } from './LLMSettingsManager';

// Initialize debug but don't enable it - controlled by message bus
const debugFn = Debug('one:llm:manager');

// Use the normal function as a simple log function
const debug = debugFn;

// Define minimal Channel interface for what we need
interface Channel {
  id: string;
  owner?: string;
}

// Define interface for channel objects
interface ChannelObject<T = any> {
  data: T & {
    $type$: string;
  };
}

// Define test object type
interface TestObject {
  $type$: 'TestObject';
  id: string;
  name: string;
  timestamp: number;
}

interface LLMImportOptions {
  name?: string;
  deleted?: boolean;
  active?: boolean;
  creator?: string;
}

/**
 * Default models that can be downloaded and initialized
 */
const knownModels: LLMSettings[] = [
  {
    $type$: 'LLMSettings',
      name: 'DeepSeek-R1-Distill-Qwen-1.5B',
      creator: 'system',
      created: Date.now(),
      modified: Date.now(),
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
        isLoaded: false,
    loadProgress: 0,
    llm: 'default-hash-replaced-at-runtime', // Will be replaced with actual hash
    modelPath: '', // Will be set during initialization
    downloadUrl: 'https://huggingface.co/TheBloke/DeepSeek-R1-Distill-Qwen-1.5B-GGUF/resolve/main/DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf'
    }
];

/**
 * Model capabilities that can be provided by an LLM
 */
export interface LLMCapabilities {
  chat: boolean;         // Basic chat capabilities
  inference: boolean;    // Raw inference/completion
  embedding: boolean;    // Vector embeddings
  contextSize: number;   // Maximum context size
  functions: boolean;    // Function calling support
  tools: boolean;        // Tool use support
  rag: boolean;          // Retrieval augmented generation
  visionSupport: boolean; // Image understanding
  multimodal: boolean;   // Multiple input/output modalities
}

/**
 * LLMManager class
 */
export class LLMManager {
  private channelManager: ChannelManager;
  private fs: StorageStreams;
  private leuteModel?: LeuteModel;
  
  // Essential maps and state
  private modelIdToNameMap = new Map<string, string>();
  private modelPaths = new Map<string, string>();
  private models = new Map<string, LLM>();
  private modelSettings = new Map<string, LLMSettings>();
  private objectHashes = new Map<string, { hash: string, idHash: string }>();
  private _modelsLoaded = false;
  private _llmModelChangedEvent = new OEvent<(model: LLM) => void>();
  // Cache to store personId mappings for quick lookup
  private _cachedPersonIdMappings = new Map<string, string>();

  // Static instance
  private static _instance: LLMManager;

  // Events
  public readonly onModelImported = new OEvent<(model: LLM, idHash: SHA256IdHash<LLM>, fullHash: SHA256Hash<LLM>) => void>();
  public readonly onModelsUpdated = new OEvent<() => void>();
  public readonly onModelStateChanged = new OEvent<(model: LLM) => void>();
  public readonly onModelRemoved = new OEvent<(modelId: string) => void>();
  public readonly onModelRefreshed = new OEvent<(model: LLM) => void>();
  public readonly onModelUpdated = new OEvent<(model: LLM) => void>();

  // Channel ID for LLM storage
  private _llmChannelId: string = 'llm';
  private _cachedChannelInfoHash: SHA256IdHash<ChannelInfo> | null = null;
  
  // MCP Manager reference
  private mcpManager?: any;

  // Reference to AIAssistantModel for creating contacts
  private _aiAssistantModel: any;

  // Model contexts for loaded models
  private modelContexts = new Map<string, any>();
  private contextInUse = new Map<string, boolean>();
  private onModelLoaded = new OEvent<(modelIdHash: string, context: any) => void>();
  private onModelUnloaded = new OEvent<(modelIdHash: string) => void>();

  constructor(
    channelManager: ChannelManager,
    fs: StorageStreams,
    leuteModel?: LeuteModel
  ) {
    console.log('[LLMManager] Constructor called');
    console.log('[LLMManager] Using normalized filenames for model storage');
    this.channelManager = channelManager;
    this.fs = fs;
    this.leuteModel = leuteModel;
    
    this.initialize().catch(error => {
      console.error('[LLMManager] Error during initialization:', error);
    });
  }

  /**
   * Initialize the LLMManager
   * Called during construction to set up directories and channels
   */
  private async initialize(): Promise<void> {
    console.log('[LLMManager] Initialize: Starting');
    try {
      // 1. Ensure models directory exists first
      const modelsDir = await this.ensureModelsDirectoryExists();
      console.log(`[LLMManager] Initialize: Models directory ensured at ${modelsDir}`);
      
      // 2. Ensure LLM channel exists for storage
      await this.ensureLLMChannelExists();
      console.log('[LLMManager] Initialize: LLM channel ensured');
      
      // 3. Load models from channel
      await this.listModels();
      console.log('[LLMManager] Initialize: Models loaded from channel');
      
      // 4. Validate model filenames - fail fast if any are invalid
      await this.validateModelFilenames();
      console.log('[LLMManager] Initialize: Model filenames validated');
      
      // 5. Rebuild all model paths to ensure they're current
      await this.rebuildAllModelPaths();
      console.log('[LLMManager] Initialize: Model paths rebuilt');
      
      // 6. Ensure all model personas have cryptographic keys
      await this.ensureAllModelPersonasHaveKeys();
      console.log('[LLMManager] Initialize: Model keys verified');
      
      // 7. Contact creation is now handled by AIAssistantModel
      console.log('[LLMManager] Initialize: Contact creation delegated to AIAssistantModel');
      
      console.log('[LLMManager] Initialize: Finished successfully');
    } catch (error) {
      console.error('[LLMManager] Initialization error:', error);
      throw error;
    }
  }

  /**
   * Rebuild paths for all models based on the app's storage directory
   * This ensures we're using the correct absolute paths for all models
   */
  public async rebuildAllModelPaths(): Promise<void> {
    console.log('[LLMManager] Rebuilding all model paths');
    
    // Get all models
    const models = Array.from(this.models.values());
    
    // Ensure models directory exists
    await this.ensureModelsDirectoryExists();
    
    // Rebuild path for each model
    for (const model of models) {
      await this.rebuildModel(model);
    }
    
    console.log(`[LLMManager] Path rebuild completed for ${models.length} models`);
  }

  /**
   * Ensure the models directory exists at the correct path
   * Creates the directory if it doesn't exist
   */
  private async ensureModelsDirectoryExists(): Promise<string> {
    try {
      const { getStorageDir, exists, makeDirectory } = await import('@refinio/one.core/lib/system/expo/storage-base');
      
      // Get the absolute path to private storage
      const privateDir = await getStorageDir(STORAGE.PRIVATE);
      console.log(`[LLMManager] Private directory path: ${privateDir}`);
      
      // Build the path to models directory
      const modelsDir = `${privateDir}/models`;
      console.log(`[LLMManager] Models directory path: ${modelsDir}`);
      
      // Check if directory exists
      const directoryExists = await exists(modelsDir);
      
      if (!directoryExists) {
        console.log('[LLMManager] Creating models directory:', modelsDir);
        // Use makeDirectory from one.core
        await makeDirectory(modelsDir, { intermediates: true });
        
        // Verify directory was created
        const directoryCreated = await exists(modelsDir);
        if (!directoryCreated) {
          throw new Error(`Failed to create models directory: ${modelsDir}`);
        }
        
        console.log('[LLMManager] Successfully created models directory');
      } else {
        console.log('[LLMManager] Models directory already exists:', modelsDir);
      }
      
      return modelsDir;
    } catch (error) {
      console.error('[LLMManager] Failed to create models directory:', error);
      throw error;
    }
  }

  /**
   * Load models from the channel using content addressing
   */
  private async loadModelsFromChannel(): Promise<void> {
    const channelInfoIdHash = await this.ensureLLMChannelExists();
    
    // Get owner ID for consistent channel operations
    let owner: SHA256IdHash<Person> | null = null;
    if (this.leuteModel) {
        try {
            owner = await this.leuteModel.myMainIdentity();
            console.log(`[LLMManager] Using owner ID for channel query: ${owner}`);
        } catch (e) {
            console.warn('[LLMManager] Could not get owner ID for query:', e);
        }
    }
    
    // Get all LLM objects from the channel
    const objects = await this.channelManager.getObjects({
        channelInfoIdHash,
        orderBy: Order.Descending,
        type: 'LLM',
        owner
    });

    console.log(`[LLMManager] loadModelsFromChannel: Fetched ${objects.length} objects from channel`);

    // Process each object
    for (const obj of objects) {
        if (obj?.data?.$type$ === 'LLM' && !obj.data.deleted) {
            const model = obj.data as LLM;
            const idHash = await calculateIdHashOfObj(model);
            this.models.set(model.name, model);  // Use name as key
            this.modelIdToNameMap.set(model.name, idHash);
        }
    }

    console.log(`[LLMManager] loadModelsFromChannel: Loaded ${this.models.size} models`);
  }

  /**
   * Initialize default models
   * 
   * Disabled to prevent confusion when models appear in settings but don't exist in contacts.
   * Users should explicitly import models instead.
   */
  public async initializeDefaultModels(): Promise<void> {
    console.log('[LLMManager] Default model initialization is disabled - users must explicitly import models');
    // Intentionally left empty to avoid creating default models
  }

  /**
   * Get the singleton instance of LLMManager
   */
  public static async getInstance({
    channelManager,
    fs,
    leuteModel
  }: {
    channelManager: ChannelManager;
    fs: StorageStreams;
    leuteModel?: LeuteModel;
  }): Promise<LLMManager> {
    if (LLMManager._instance) {
      // If the singleton already exists but we now have a LeuteModel while the instance
      // does not, inject it so that follow-up operations like contact/topic creation
      // work correctly. This situation happens when a UI component requested the
      // LLMManager BEFORE login (no LeuteModel available) and the proper instance
      // with LeuteModel becomes available AFTER login during AppModel.init().
      if (leuteModel && !LLMManager._instance.leuteModel) {
        console.log('[LLMManager.getInstance] 🔄 Injecting LeuteModel into existing singleton');
        (LLMManager._instance as any).leuteModel = leuteModel;
      }
      return LLMManager._instance;
    }
    
    if (!channelManager) {
      throw new Error('LLMManager.getInstance: channelManager is required');
    }
    
    if (!fs) {
      throw new Error('LLMManager.getInstance: fs is required');
    }
    
    // Create new instance
    LLMManager._instance = new LLMManager(channelManager, fs, leuteModel);

    try {
      // Initialize the instance properly - use try/catch to prevent startup failures
      console.log('[LLMManager.getInstance] Ensuring channel initialization');
      await LLMManager._instance.ensureLLMChannelExists();
      
      console.log('[LLMManager.getInstance] Loading models from storage');
      // Get models from both storage and channel
      const modelsFromStorage = await LLMManager._instance.recoverModelsFromStorage();
      const modelsFromChannel = await LLMManager._instance.listModels();
      
      console.log(`[LLMManager.getInstance] Loaded ${modelsFromStorage.length} models from storage, ${modelsFromChannel.length} from channel`);
      
      // Set the flag to indicate models are loaded
      LLMManager._instance._modelsLoaded = true;
      
      // Explicitly emit the models updated event
      LLMManager._instance.onModelsUpdated.emit();
      
      console.log('[LLMManager.getInstance] Initialization complete');
    } catch (error) {
      console.error('[LLMManager.getInstance] Error during initialization:', error);
      // Continue despite errors - we'll recover what we can
    }

    return LLMManager._instance;
  }

  /**
   * Notify listeners that models have changed
   * This method should only be called directly, not from event handlers
   * @private
   */
  private async _notifyModelChanged(): Promise<void> {
    try {
      // Emit the instance-specific event only
      // We use onModelsUpdated instead of the static event to avoid loops
      if (this.onModelsUpdated) {
        console.log('[LLMManager] Notifying listeners of model changes via instance event');
        this.onModelsUpdated.emit();
      }
    } catch (error) {
      console.error('[LLMManager.notifyModelChanged] Error notifying model change:', error);
    }
  }

  /**
   * Notify listeners that LLM models have changed
   * @private
   */
  private async _notifyLLMModelChanged(llm: LLM): Promise<void> {
    console.log('[LLMManager.notifyLLMModelChanged] Notifying listeners of LLM model changes:', llm.name);
    try {
      this._llmModelChangedEvent.emit(llm);
    } catch (error) {
      console.error('[LLMManager.notifyLLMModelChanged] Error notifying LLM model change:', error);
    }
  }



  /**
   * Creates a topic for a newly imported LLM model
   * This method gets the required models from AppModel and creates a chat topic
   */
  private async createTopicForImportedModel(model: LLM): Promise<void> {
    try {
      console.log(`[LLMManager.createTopicForImportedModel] Creating topic for model ${model.name}`);
      
      // Get required models from ModelService
      const { ModelService } = await import('../../services/ModelService');
      const appModel = ModelService.getModel();
      
      if (!appModel?.topicModel) {
        console.warn('[LLMManager.createTopicForImportedModel] TopicModel not available, skipping topic creation');
        return;
      }
      
      if (!this.leuteModel) {
        console.warn('[LLMManager.createTopicForImportedModel] LeuteModel not available, skipping topic creation');
        return;
      }
      
      // Import topic creation utility
      const { getOrCreateTopicForLLM } = await import('../../utils/contactUtils');
      
      // Create topic
      const topic = await getOrCreateTopicForLLM(
        model, 
        {
          leuteModel: this.leuteModel,
          topicModel: appModel.topicModel,
          channelManager: this.channelManager,
          aiAssistantModel: appModel.aiAssistantModel
        },
        this
      );
      
      if (topic) {
        console.log(`[LLMManager.createTopicForImportedModel] Successfully created topic for model ${model.name}`);
      } else {
        console.warn(`[LLMManager.createTopicForImportedModel] Topic creation returned null for model ${model.name}`);
      }
    } catch (error) {
      console.error(`[LLMManager.createTopicForImportedModel] Error creating topic for model ${model.name}:`, error);
      throw error;
    }
  }

  /**
   * Helper method to ensure AI contacts are created for LLM models
   * This ensures that even if leuteModel wasn't available during import,
   * contacts will be created when needed.
   */
  public async ensureContactsForModels(): Promise<void> {
    try {
      // Check if we have access to LeuteModel
      if (!this.leuteModel) {
        console.warn('[LLMManager] Cannot ensure contacts - LeuteModel not available');
        return;
      }
      
      const models = Array.from(this.models.values());
      console.log(`[LLMManager] Ensuring contacts exist for ${models.length} models`);
      
      // Import the centralized contact creation utility
      const { ensureContactsForModels: batchEnsureContacts, ensureTopicsForModels } = await import('../../models/ensureContactsForModels');
      
      // Use the centralized utility for batch processing
      const processedCount = await batchEnsureContacts(models, this.leuteModel);
      
      console.log(`[LLMManager] Processed contacts for ${processedCount} models`);
      
      // Also ensure topics exist for these models - this was the missing piece!
      try {
        // Get required models from ModelService
        const { ModelService } = await import('../../services/ModelService');
        const appModel = ModelService.getModel();
        
        if (!appModel) {
          console.log('[LLMManager] getAppModel not available during startup - will defer topic creation');
          return;
        }
        
        if (appModel?.topicModel && appModel?.channelManager) {
          console.log(`[LLMManager] Ensuring topics exist for ${models.length} models`);
          const topicCount = await ensureTopicsForModels(
            models,
            {
              leuteModel: this.leuteModel,
              topicModel: appModel.topicModel,
              channelManager: appModel.channelManager,
              aiAssistantModel: appModel.aiAssistantModel
            },
            this
          );
          console.log(`[LLMManager] Processed topics for ${topicCount} models`);
        } else {
          console.log('[LLMManager] AppModel not fully ready yet - will defer topic creation');
        }
      } catch (topicError) {
        console.log('[LLMManager] Topic creation deferred - AppModel not ready during startup:', topicError.message);
        // Don't throw - contacts are still working even if topics fail
      }
    } catch (error) {
      console.error('[LLMManager] Error ensuring contacts for models:', error);
    }
  }

  /**
   * Create topics for all existing models
   * This can be called after AppModel is fully ready to create missing topics
   */
  public async ensureTopicsForAllModels(): Promise<number> {
    try {
      console.log('[LLMManager] Ensuring topics for all existing models...');
      
      // Get all models
      const models = Array.from(this.models.values());
      if (models.length === 0) {
        console.log('[LLMManager] No models found to create topics for');
        return 0;
      }

      // Get required models from ModelService
      const { ModelService } = await import('../../services/ModelService');
      const appModel = ModelService.getModel();
      
      if (appModel?.topicModel && appModel?.channelManager) {
        console.log(`[LLMManager] Creating topics for ${models.length} existing models`);
        
        const { ensureTopicsForModels } = await import('../ensureContactsForModels');
        const topicCount = await ensureTopicsForModels(
          models,
          {
            leuteModel: this.leuteModel,
            topicModel: appModel.topicModel,
            channelManager: appModel.channelManager,
            aiAssistantModel: appModel.aiAssistantModel
          },
          this
        );
        
        console.log(`[LLMManager] ✅ Created topics for ${topicCount} models`);
        return topicCount;
      } else {
        console.log('[LLMManager] AppModel not fully ready yet - cannot create topics');
        return 0;
      }
    } catch (error) {
      console.error('[LLMManager] Error ensuring topics for models:', error);
      return 0;
    }
  }

  /**
   * Helper method to trace channel state for diagnostic purposes
   */
  private async traceChannelState(stage: string): Promise<void> {
    try {
      if (!this.channelManager) {
        console.log(`[LLMManager] Cannot trace channel state: No channel manager`);
        return;
      }
      
      // Get channel info hash using our cached value or create it if needed
      if (!this._cachedChannelInfoHash) {
        // Create the channel if needed using the existing API
        this._cachedChannelInfoHash = await this.ensureLLMChannelExists();
      }
      
      // Get channel objects to check their integrity
      const objects = await this.getChannelObjects(this._llmChannelId, 'LLM');
      
      // Create hash sets to check for duplicates
      const objectIds = new Set<string>();
      const names = new Set<string>();
      const duplicateIds = new Set<string>();
      const duplicateNames = new Set<string>();
      
      // Check for duplicates
      objects.forEach(obj => {
        if (!obj.data || obj.data.$type$ !== 'LLM') return;
        
        const llm = obj.data as LLM;
        
        // Check for duplicate names
        if (names.has(llm.name)) {
          duplicateNames.add(llm.name);
        } else {
          names.add(llm.name);
        }
        
        // Use object reference for identity instead of idHash
        const objectId = `${llm.name}-${llm.modified || llm.created || 0}`;
        if (objectIds.has(objectId)) {
          duplicateIds.add(objectId);
        } else {
          objectIds.add(objectId);
        }
      });
      
      // Log diagnostic info
      console.log(`[LLMManager.traceChannelState-${stage}] Channel state:`, {
        channelInfoIdHash: this._cachedChannelInfoHash,
        objectCount: objects.length,
        llmCount: objects.filter(o => o.data && o.data.$type$ === 'LLM').length,
        duplicateNames: Array.from(duplicateNames),
        duplicateIds: Array.from(duplicateIds)
      });
      
    } catch (error) {
      console.error(`[LLMManager.traceChannelState] Error tracing channel state:`, error);
    }
  }

  /**
   * Ensure the LLM channel exists in the channel manager
   * Simple, direct approach - create the channel and fail fast if it doesn't work
   */
  private async ensureLLMChannelExists(): Promise<SHA256IdHash<ChannelInfo>> {
    try {
      console.log('[LLMManager] Ensuring LLM channel exists');
      
      // Set channel ID
      const channelId = 'llm';
      this._llmChannelId = channelId;
      
      // Get owner ID if we have LeuteModel available
      let owner: SHA256IdHash<Person> | null = null;
      if (this.leuteModel) {
        try {
          owner = await this.leuteModel.myMainIdentity();
          console.log(`[LLMManager] Using owner ID for channel: ${owner}`);
        } catch (e) {
          console.warn('[LLMManager] Could not get owner ID:', e);
        }
      }
      
      // Simply create the channel - channelManager handles existence checks internally
      console.log(`[LLMManager] Creating/ensuring channel: ${channelId}`);
      const infoIdHash = await this.channelManager.createChannel(channelId, owner);
      
      if (!infoIdHash) {
        throw new Error('Channel creation returned null - this indicates a fundamental issue with the ChannelManager');
      }
      
      console.log(`[LLMManager] Channel ensured with info hash: ${infoIdHash}`);
      
      // Verify the channel works immediately - fail fast if it doesn't
      try {
        const objects = await this.channelManager.getObjects({ channelId });
        console.log(`[LLMManager] Channel verification successful - ${objects.length} objects accessible`);
      } catch (verifyError) {
        console.error('[LLMManager] Channel verification failed immediately after creation:', verifyError);
        throw new Error(`Channel verification failed: ${verifyError}. This indicates the ChannelManager.createChannel method is not working correctly.`);
      }
      
      // Cache the channel info hash only after successful verification
      this._cachedChannelInfoHash = infoIdHash;
      
      return infoIdHash;
    } catch (error) {
      console.error('[LLMManager] Failed to ensure LLM channel exists:', error);
      // Clear any cached values on failure
      this._cachedChannelInfoHash = null;
      throw error;
    }
  }

  /**
   * Recover LLM models from channel storage
   */
  private async recoverModelsFromStorage(): Promise<LLM[]> {
    try {
      // Ensure channel exists first
      await this.ensureLLMChannelExists();
      
      // Query for LLM objects
      const queryParams: QueryOptions = { 
        channelId: this._llmChannelId,
        orderBy: Order.Descending,
        type: 'LLM' as OneObjectTypeNames
      };
      
      console.log('[LLMManager] Querying channel for LLMs:', queryParams);
      const objects = await this.channelManager.getObjects(queryParams);
      console.log('[LLMManager] Retrieved objects count:', objects.length);
      
      // Process models and populate internal state
      const models = objects
        .filter(obj => obj?.data?.$type$ === 'LLM' && !obj.data.deleted)
        .map(obj => obj.data as LLM);
      
      // Store models in our maps using name as key
      for (const model of models) {
        const idHash = await calculateIdHashOfObj(model);
        this.models.set(model.name, model);  // Use name as key
        this.modelIdToNameMap.set(model.name, idHash);
      }
      
      return models;
    } catch (error) {
      console.error('[LLMManager] Error recovering models:', error);
      throw error;
    }
  }

  /**
   * List all available models
   * Uses the channel as source of truth
   */
  public async listModels(): Promise<LLM[]> {
    console.log('[LLMManager] Listing all models from channel');
    const queryParams = {
      channelId: this._llmChannelId,
      type: 'LLM' as OneObjectTypeNames
    };
    
    try {
      const objects = await this.channelManager.getObjects(queryParams);
      console.log(`[LLMManager] Found ${objects.length} objects in channel`);
      
      const models = objects
        .filter(obj => obj?.data?.$type$ === 'LLM' && !obj.data.deleted)
        .map(obj => {
          const model = obj.data as LLM;
          
          // FAIL FAST: If filename contains a path, throw an error instead of fixing it
          if (model.filename && model.filename.includes('/')) {
            console.error(`[LLMManager] listModels: Found full path in filename field: ${model.filename}`);
            throw new Error(`Data integrity error: LLM model '${model.name}' has a full path in filename field instead of just a filename. This indicates data corruption that requires manual repair.`);
          }
          
          return model;
        });
      
      console.log(`[LLMManager] Filtered to ${models.length} valid LLM models`);
  
      // Store models by name for consistent lookups
      for (const model of models) {
        // Always calculate ID hash using ONE core helper for consistency
        const idHash = await calculateIdHashOfObj(model) as SHA256IdHash<LLM>;
        
        // Store model using name as key
        this.models.set(model.name, model);
        
        // Store bidirectional mapping between name and ID
        this.modelIdToNameMap.set(model.name, idHash);
        this.modelIdToNameMap.set(idHash, model.name);
        
        console.log(`[LLMManager] Registered model ${model.name} with ID ${idHash}`);
      }
      
      // Mark models as loaded
      this._modelsLoaded = true;
      
      // Debug output
      console.log(`[LLMManager] Models registered: ${this.models.size}, ID mappings: ${this.modelIdToNameMap.size}`);
      
      return models;
    } catch (error) {
      console.error('[LLMManager] Error listing models:', error);
      throw error; // Re-throw the error to propagate it upward
    }
  }

  /**
   * Get a model by name
   */
  public async getModelByName(modelName: string): Promise<LLM | undefined> {
    const idHash = this.modelIdToNameMap.get(modelName);
    if (!idHash) {
      return undefined;
    }
    return this.getModelByIdHash(idHash);
  }

  /**
   * Get a model by its content hash
   * This provides a more robust lookup for models by ID hash
   */
  public async getModelByIdHash(modelIdHash: string): Promise<LLM | undefined> {
    console.log(`[LLMManager] Looking up model by ID hash: ${modelIdHash}`);
    
    // Directly use getObjectByIdHash from one.core storage
    try {
      // ensureIdHash might be needed if modelIdHash is just a string
      const idHashTyped = ensureIdHash<LLM>(modelIdHash);
      const versionedObject = await getObjectByIdHash(idHashTyped, 'LLM');
      
      // getObjectByIdHash returns the latest version's object
      if (versionedObject && versionedObject.obj) {
        console.log(`[LLMManager] Found model using getObjectByIdHash: ${versionedObject.obj.name}`);
        // Ensure the returned object is properly typed
        return versionedObject.obj as LLM;
      } else {
        console.log(`[LLMManager] Model not found using getObjectByIdHash for ID: ${modelIdHash}`);
        return undefined;
      }
    } catch (error) {
      console.error(`[LLMManager] Error using getObjectByIdHash for ID ${modelIdHash}:`, error);
      // Check if the error indicates 'not found' vs. other storage issues
      if (error instanceof Error && error.message.includes('not found')) {
        return undefined;
      } 
      // Re-throw other errors
      throw error;
    }
    
    // REMOVE_START - Old lookup logic
    // // If we have a direct map from ID to name, use it
    // if (this.modelIdToNameMap.has(modelIdHash)) {
    //   const modelName = this.modelIdToNameMap.get(modelIdHash);
    //   if (modelName) {
    //     return this.models.get(modelName);
    //   }
    // }
    // 
    // // If not in the map, check for filename integrity
    // if (!this._modelsLoaded) {
    //   await this.ensureModelsLoaded();
    // }
    // 
    // // Loop through all models to find the matching ID
    // for (const [modelName, model] of this.models.entries()) {
    //   const { idHash } = await this.calculateHashes(model); // Relies on removed method
    //   if (idHash === modelIdHash) {
    //     return model;
    //   }
    // }
    // 
    // return undefined;
    // REMOVE_END
  }

  /**
   * Store a model in the channel using content addressing
   */
  private async storeModel(model: LLM): Promise<{ idHash: SHA256IdHash<LLM>, fullHash: SHA256Hash<LLM> }> {
    console.log(`[LLMManager.storeModel] Storing model ${model.name}`);
    
    // CRITICAL: Check if filename contains path separators and throw error
    if (model.filename && model.filename.includes('/')) {
      console.error(`[LLMManager.storeModel] Found full path in filename field: ${model.filename}`);
      throw new Error(`Data integrity error: LLM model '${model.name}' has a full path in filename field instead of just a filename. This indicates data corruption that requires manual repair.`);
    }
    
    // Get owner ID for consistent channel operations
    let owner: SHA256IdHash<Person> | null = null;
    if (this.leuteModel) {
        try {
            owner = await this.leuteModel.myMainIdentity();
        } catch (e) {
            console.warn('[LLMManager.storeModel] Could not get owner ID:', e);
        }
    }
    
    // Set up personId before storing - this is critical for model identity
    if (!model.personId) {
      console.log(`[LLMManager.storeModel] Model has no personId, setting it up`);
      const personId = await this.setupModelPersonIdReference(model);
      if (!personId) {
        throw new Error(`[LLMManager.storeModel] Failed to set up personId for model ${model.name}`);
      }
      model.personId = personId;
    }
    
    // Store using one.core's versioned storage and get hashes from result
    console.log(`[LLMManager.storeModel] Storing model ${model.name} in versioned storage`);
    const storeResult = await storeVersionedObject(model);
    
    // Validate the result structure (add null checks)
    if (!storeResult || !storeResult.idHash || !storeResult.hash) {
        throw new Error(`[LLMManager.storeModel] storeVersionedObject did not return expected hashes for model ${model.name}`);
    }

    // Use the returned hashes
    const idHash = storeResult.idHash as SHA256IdHash<LLM>;
    const fullHash = storeResult.hash as SHA256Hash<LLM>;
    console.log(`[LLMManager.storeModel] Got hashes from storeResult: idHash=${idHash}, fullHash=${fullHash}`);
    
    // Use the stored object from storeResult to ensure all fields are persisted
    const storedModel = storeResult.obj as LLM;
    console.log(`[LLMManager.storeModel] Stored model has personId: ${storedModel.personId}`);
    
    // Validate that personId was actually persisted
    if (!storedModel.personId) {
      throw new Error(`[LLMManager.storeModel] CRITICAL: personId was not persisted for model ${model.name}. This indicates a recipe or storage issue.`);
    }
    
    // Post to channel - use the stored object
    console.log(`[LLMManager.storeModel] Posting model ${storedModel.name} to channel ${this._llmChannelId}`);
    await this.channelManager.postToChannel(this._llmChannelId, storedModel, owner);
    
    // Update maps for lookups - use the stored object
    console.log(`[LLMManager.storeModel] Updating maps for model ${storedModel.name}`);
    this.models.set(storedModel.name, storedModel);
    this.models.set(idHash, storedModel);  // Store by ID hash as well
    this.modelIdToNameMap.set(storedModel.name, idHash);
    this.modelIdToNameMap.set(idHash, storedModel.name);  // Bidirectional mapping
    
    console.log(`[LLMManager.storeModel] Successfully stored model ${model.name} with ID ${idHash}`);
    
    // Emit events - use the stored model
    this.onModelUpdated.emit(storedModel);
    this.onModelsUpdated.emit();
    
    return { idHash, fullHash };
  }
  
  /**
   * Calculate ID and full hash for an LLM model
   * This method calculates the ID hash and full hash for an LLM model
   * but does NOT modify the model object with its hash as that would break
   * content-addressability principles.
   * 
   * @param model LLM model to calculate hashes for
   * @returns Object containing ID and full hash
   */
  public async calculateHashes(model: LLM): Promise<{
    idHash: SHA256IdHash<LLM>;
    fullHash: SHA256Hash<LLM>;
  }> {
    // Calculate the hashes
    const idHash = await calculateIdHashOfObj(model) as SHA256IdHash<LLM>;
    const fullHash = await calculateHashOfObj(model);
    
    // Store the hashes in our lookup map without modifying the model
    this.objectHashes.set(model.name, {
      idHash,
      hash: fullHash
    });
    
    return { idHash, fullHash };
  }

  /**
   * Create a diagnostic log entry for model operations
   */
  private async createDiagnosticLog(model: LLM): Promise<void> {
    let idHash: string = '<unknown>';
    let hash: string = '<unknown>';
    
    try {
      // Just log the information available directly on the model object
      console.log(`\n======= LLM DIAGNOSTIC LOG =======`);
      console.log(`LLM: ${model.name}`);
      console.log(`  - Person ID: ${model.personId || '<none>'}`);
      console.log(`  - Filename: ${model.filename || '<none>'}`);
      console.log(`  - Created At: ${model.createdAt || '<unknown>'}`);
      
      // Log channel state
      try {
        await this.traceChannelState('FINAL');
      } catch (err) {
        console.log(`  - Error tracing channel state: ${err}`);
      }
      
      console.log(`======= END LLM DIAGNOSTIC LOG =======\n`);
    } catch (err) {
      console.error(`[LLMManager] Error creating diagnostic log:`, err);
    }
  }

  /**
   * Delete a model by ID
   */
  public async deleteModel(modelId: string): Promise<boolean> {
    debug('[LLMManager.deleteModel] Deleting model:', modelId);
    
    try {
      // Create a query for the exact model
      const queryParams: QueryOptions = {
        channelId: this._llmChannelId,
        type: 'LLM' as OneObjectTypeNames
      };

      // Find the model in storage
      const objects = await this.channelManager.getObjects(queryParams);
      debug(`[LLMManager.deleteModel] Found ${objects.length} matching objects`);
      
      // Find the object with matching ID (name)
      const modelObject = objects.find(obj => 
        obj.data && 
        obj.data.$type$ === 'LLM' && 
        obj.data.name === modelId
      );
      
      if (!modelObject) {
        debug('[LLMManager.deleteModel] No matching model found');
        return false;
      }
      
      // Get the model data
      const model = modelObject.data as LLM;
      debug('[LLMManager.deleteModel] Found model:', model.name);
      
      // Delete the model file if it exists
      if (model.modelPath) {
        try {
          const fileExists = await exists(model.modelPath);
          if (fileExists) {
            debug('[LLMManager.deleteModel] Deleting model file:', model.modelPath);
            await deleteFile(model.modelPath);
          }
        } catch (err) {
          debug('[LLMManager.deleteModel] Error deleting model file:', err);
          // Continue regardless of file deletion errors
        }
      }
      
      // Mark the model as deleted and update the channel
      model.deleted = true;
      model.active = false;
      
      // Post the updated model to the channel
      await this.channelManager.postToChannel(this._llmChannelId, model);
      
      // Remove from memory cache
      this.models.delete(modelId);
      this.modelPaths.delete(modelId);
      
      // Emit model removed event
      this.onModelRemoved.emit(modelId);
      
      debug('[LLMManager.deleteModel] Model deleted successfully');
      return true;
    } catch (error) {
      debug('[LLMManager.deleteModel] Error deleting model:', error);
      return false;
    }
  }

  /**
   * Sanitize model name for storage and identity calculation
   * Ensures consistent normalization for Person IDs, file paths, etc.
   * 
   * @param modelName The model name to sanitize
   * @returns A sanitized model name safe for file names and identifiers
   */
  private sanitizeModelName(modelName: string): string {
    if (!modelName) {
      return '';
    }
    
    // First remove any path components
    const baseName = modelName.split('/').pop() || modelName;
    
    // Convert to lowercase and replace special characters with dashes
    return baseName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  }

  /**
   * Ensures a model has a valid Person ID, setting it up if needed
   * This method includes proper error handling and avoids duplicate setup operations
   * 
   * @param llm The LLM model to ensure personId for
   * @returns The personId string or undefined if setup failed
   */
  public async ensureModelPersonId(llm: LLM): Promise<SHA256IdHash<Person> | undefined> {
    try {
      // If model already has a personId, return it
      if (llm.personId) {
        console.log(`[LLMManager] Model ${llm.name} already has a personId: ${llm.personId}`);
        return llm.personId;
      }
      
      // If not, set it up
      return await this.setupModelPersonIdReference(llm);
    } catch (error) {
      console.error(`[LLMManager] Error ensuring personId for model ${llm.name}:`, error);
      return undefined;
    }
  }

  /**
   * Setup model with person ID reference following ONE core principles
   * This method handles proper object identity and relationships
   * 
   * IMPORTANT: This is a low-level function and should generally not be called directly.
   * Use ensureModelPersonId instead, which includes proper error handling.
   */
  private async setupModelPersonIdReference(llm: LLM): Promise<SHA256IdHash<Person> | undefined> {
    try {
      // Check if model already has a personId to avoid duplicate setup
      if (llm.personId) {
        console.log(`[LLMManager] Model ${llm.name} already has personId ${llm.personId}, skipping setup`);
        return llm.personId as SHA256IdHash<Person>;
      }
      
      console.log(`[LLMManager] Setting up personId reference for model ${llm.name}`);
      
      // Use contactUtils to get the canonical Person ID
      const personId = await getPersonIdForLLM(llm);
      
      if (!personId) {
        console.error(`[LLMManager] Could not calculate personId for LLM ${llm.name} using contactUtils`);
        throw new Error(`Could not calculate personId for LLM ${llm.name}`);
      }

      try {
        // First check if Person object exists - but don't fail if it doesn't
        const storedPerson = await getObjectByIdHash(personId).catch(() => null);
        
        if (!storedPerson?.obj) {
          console.log(`[LLMManager] Person object not found for ID ${personId}, creating it`);
          
          // Create the Person object using the utility function before storing
          const personObj = createPersonObject(llm.name);

          // First create and store the Person object to ensure it exists
          await storeVersionedObject(personObj);
          console.log(`[LLMManager] Created basic Person object for ${llm.name} with ID ${personId}`);
          
          // Create cryptographic keys for the Person
          await this.ensurePersonHasKeys(personId);
          
          // Now create the full persona with remaining objects (Profile, Someone)
          if (!this.leuteModel) {
            console.warn(`[LLMManager] LeuteModel not available, deferring full persona creation for ${llm.name}`);
            // Don't throw - we'll create the contact later during post-init
            return personId;
          }
          
          // Create a minimal app model interface with just the components we need
          const minimalAppModel = {
            leuteModel: this.leuteModel,
            llmManager: this
          };
          
          // Use properly imported function instead of require
          console.log(`[LLMManager] Creating full persona objects for model ${llm.name}`);
          // Use the getOrCreateSomeoneForLLM function that's already imported
          const someone = await getOrCreateSomeoneForLLM(llm.name, minimalAppModel);
          
          if (!someone) {
            console.error(`[LLMManager] Failed to create full persona for model ${llm.name}`);
            throw new Error(`Failed to create full persona for model ${llm.name}`);
          }
          
          console.log(`[LLMManager] Successfully created full persona for model ${llm.name} with personId ${personId}`);
        } else {
          console.log(`[LLMManager] Person object already exists for ID ${personId}`);
          // Check if this existing person has keys
          await this.ensurePersonHasKeys(personId);
        }
      } catch (error) {
        console.error(`[LLMManager] Error creating/retrieving Person: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
      
      // Store the personId on the model directly as SHA256IdHash
      llm.personId = personId;
      llm.modelType = 'local';
      
      console.log(`[LLMManager] Successfully set up personId ${personId} for model ${llm.name}`);
      return personId;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[LLMManager] Error setting up model personId reference: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Ensure that a Person has the required cryptographic keys
   * 
   * @param personId The Person ID to ensure has keys
   * @returns True if the keys were created or already exist
   */
  private async ensurePersonHasKeys(personId: SHA256IdHash<Person>): Promise<boolean> {
    try {
      console.log(`[LLMManager] Checking if person ${personId} has default keys`);
      
      // Import the necessary cryptographic functions
      const { hasDefaultKeys } = await import('@refinio/one.core/lib/keychain/keychain.js');
      const hasKeys = await hasDefaultKeys(personId);
      
      if (hasKeys) {
        console.log(`[LLMManager] Person ${personId} already has default keys`);
        return true;
      }
      
      console.log(`[LLMManager] Creating default keys for person ${personId}`);
      
      // Import the remaining required functions
      const { createKeyPair } = await import('@refinio/one.core/lib/crypto/encryption.js');
      const { createSignKeyPair } = await import('@refinio/one.core/lib/crypto/sign.js');
      const { createDefaultKeys } = await import('@refinio/one.core/lib/keychain/keychain.js');
      
      // Create encryption and signing keypairs
      const encryptionKeyPair = createKeyPair();
      const signKeyPair = createSignKeyPair();
      
      // 🔍 LOG KEY CREATION DETAILS
      console.log('[LLMManager] 🔍 KEY CREATION DEBUG:');
      console.log('[LLMManager] 🔍   - Encryption keypair created');
      console.log('[LLMManager] 🔍     * Public key type:', typeof encryptionKeyPair.publicKey);
      console.log('[LLMManager] 🔍     * Public key length:', encryptionKeyPair.publicKey?.length);
      console.log('[LLMManager] 🔍     * Public key value:', encryptionKeyPair.publicKey);
      console.log('[LLMManager] 🔍     * Public key first 10 chars:', encryptionKeyPair.publicKey?.slice(0, 10));
      console.log('[LLMManager] 🔍     * Public key last 10 chars:', encryptionKeyPair.publicKey?.slice(-10));
      
      console.log('[LLMManager] 🔍   - Sign keypair created');
      console.log('[LLMManager] 🔍     * Public sign key type:', typeof signKeyPair.publicKey);
      console.log('[LLMManager] 🔍     * Public sign key length:', signKeyPair.publicKey?.length);
      console.log('[LLMManager] 🔍     * Public sign key value:', signKeyPair.publicKey);
      console.log('[LLMManager] 🔍     * Public sign key first 10 chars:', signKeyPair.publicKey?.slice(0, 10));
      console.log('[LLMManager] 🔍     * Public sign key last 10 chars:', signKeyPair.publicKey?.slice(-10));
      
      // Create the keys
      const keysHash = await createDefaultKeys(personId, encryptionKeyPair, signKeyPair);
      
      if (keysHash) {
        console.log(`[LLMManager] Successfully created keys for ${personId}`);
        return true;
      } else {
        console.warn(`[LLMManager] createDefaultKeys succeeded but returned no hash for ${personId}`);
        return false;
      }
    } catch (error: any) {
      // Handle special case where keys already exist (concurrency)
      if (error && error.code === 'KEYCH-HASDEFKEYS') {
        console.log(`[LLMManager] Keys for ${personId} were created by another process`);
        return true;
      }
      
      console.error(`[LLMManager] Error creating keys for person ${personId}:`, error);
      return false;
    }
  }

  /**
   * Import a model from a file
   */
  public async importFromFile(fileUri: string, metadata: Partial<LLM>): Promise<LLM> {
    console.log(`[LLMManager.importFromFile] Importing model from ${fileUri}`);
    
    try {
      // 1. Get creator ID
      let creatorIdentifier: string | undefined;
      if (this.leuteModel) {
        try {
          const creatorIdHash = await this.leuteModel.myMainIdentity();
          if (creatorIdHash && typeof creatorIdHash === 'string' && creatorIdHash.length === 64) {
             creatorIdentifier = creatorIdHash.toString(); 
          } else {
             throw new Error("Failed to get a valid user Person ID hash.");
          }
        } catch (error) {
          throw new Error(`Error obtaining creator Person ID: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        throw new Error("LeuteModel not available to determine creator.");
      }
      
      // 2. Extract the raw filename WITHOUT calling normalizeFilename (which adds path)
      let rawFilename: string;
      
      // First try to get the display name from metadata (from document picker)
      if (metadata.filename) {
        // Extract just the filename part without any path components
        const filenameParts = metadata.filename.split('/');
        rawFilename = filenameParts[filenameParts.length - 1];
        console.log(`[LLMManager.importFromFile] Using raw filename from metadata: ${rawFilename}`);
      } else {
        // Extract filename from URI as fallback
        rawFilename = fileUri.split('/').pop() || '';
        console.log(`[LLMManager.importFromFile] Extracted raw filename from URI: ${rawFilename}`);
      }
      
      // Validate filename - throw error if empty or contains path separators
      if (!rawFilename || rawFilename.includes('/')) {
        throw new Error(`Invalid filename extracted: ${rawFilename || 'empty'}`);
      }
      
      // 3. Use model name from metadata or filename without extension
      const modelName = metadata.name || getNameWithoutExtension(rawFilename);
      
      // 4. Ensure storage location exists and construct proper path using ONE core functions
      const privateDir = await getStorageDir(STORAGE.PRIVATE);
      const modelsDir = `${privateDir}/models`;
      
      // Note: We're storing just the raw filename in the model AND using it directly for the file path
      // NOT using UUID or any other generated name for the file
      const destPath = `${modelsDir}/${rawFilename}`;
      
      console.log(`[LLMManager.importFromFile] Model name: ${modelName}`);
      console.log(`[LLMManager.importFromFile] Raw filename: ${rawFilename}`);
      console.log(`[LLMManager.importFromFile] Destination path: ${destPath}`);

      // Create directory if needed
      const dirExists = await exists(modelsDir);
      if (!dirExists) {
        await makeDirectory(modelsDir, { intermediates: true });
      }

      // Copy the file
      const fileExists = await exists(destPath);
      if (!fileExists) {
        // Copy the file from external location (DocumentPicker temp) to internal storage
        console.log(`[LLMManager.importFromFile] Copying file from ${fileUri} to ${destPath}`);
        
        try {
          // Use Expo FileSystem for external file copy instead of ONE.core's copyFile
          // ONE.core's copyFile is designed for internal storage operations and fails with external files
          await FileSystem.copyAsync({
            from: fileUri,
            to: destPath
          });
          console.log(`[LLMManager.importFromFile] File copied successfully using FileSystem.copyAsync`);
        } catch (copyError: any) {
          console.error(`[LLMManager.importFromFile] Copy failed:`, copyError);
          
          // Provide user-friendly error
          const errorMessage = copyError?.message || 'Unknown error';
          if (errorMessage.includes('SB-COPY-FAIL') || errorMessage.includes('Failed to copy')) {
            throw new Error(`Unable to import model file. This may be due to iOS security restrictions. Please try selecting the file again or move it to a different location.`);
          }
          throw copyError;
        }
      } else {
        console.log(`[LLMManager.importFromFile] File already exists at ${destPath}, skipping copy`);
      }

      // Verify the file exists after copy
      const verifyFileExists = await exists(destPath);
      if (!verifyFileExists) {
        throw new Error(`Failed to copy model file to ${destPath}`);
      }

      // 5. Extract model metadata
      const modelFeatures = await this.extractModelMetadata(destPath);
      const modelFileSize = await fileSize(destPath);
      
      // 6. Create LLM object with RAW filename (no path)
      // IMPORTANT: LLM is a versioned ONE object and should only contain properties defined in its recipe
      // The isLoaded property is a runtime state and NOT part of the LLM recipe
      const newLLMBase = {
        $type$: 'LLM',
        name: modelName,
        filename: rawFilename, // Store the RAW filename (no path) in the model
        modelType: 'local',
        creator: creatorIdentifier,
        created: Date.now(),
        modified: Date.now(),
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        active: metadata.active !== undefined ? metadata.active : true, 
        deleted: metadata.deleted || false,
        size: metadata.size || modelFileSize || 0,
        usageCount: 0,
        lastInitialized: 0,
        capabilities: ['chat', 'inference'],
        ...modelFeatures
      };
      
      // Filter out any properties that don't belong in the LLM recipe
      // Runtime properties like 'isLoaded' should not be in the versioned object
      const { isLoaded, loadProgress, ...filteredMetadata } = metadata as Partial<LLM> & { 
        isLoaded?: boolean; 
        loadProgress?: number; 
      };
      
      // Merge filtered metadata
      const newLLM = { ...newLLMBase, ...filteredMetadata } as LLM;
      
      // 7. Setup personId BEFORE anything else - it's part of the object identity
      console.log(`[LLMManager.importFromFile] Setting up personId for model ${modelName}`);
      const personId = await this.setupModelPersonIdReference(newLLM);
      if (!personId) {
        throw new Error(`[LLMManager.importFromFile] Failed to set up personId for model ${modelName}`);
      }
      newLLM.personId = personId;
      console.log(`[LLMManager.importFromFile] Set personId ${personId} for model ${modelName}`);
      
      // 8. Store the model and get hashes from the result
      const storeResult = await storeVersionedObject(newLLM);
      // Validate the result structure (add null checks)
      if (!storeResult || !storeResult.idHash || !storeResult.hash) {
        throw new Error(`[LLMManager.importFromFile] storeVersionedObject did not return expected hashes for model ${modelName}`);
      }
      const idHash = storeResult.idHash as SHA256IdHash<LLM>;
      const fullHash = storeResult.hash as SHA256Hash<LLM>;
      console.log(`[LLMManager.importFromFile] Got hashes from storeResult: idHash=${idHash}, fullHash=${fullHash}`);
      
      // Use the stored object from storeResult to ensure personId is persisted
      const storedModel = storeResult.obj as LLM;
      console.log(`[LLMManager.importFromFile] Stored model has personId: ${storedModel.personId}`);
      
      // Validate that personId was actually persisted
      if (!storedModel.personId) {
        throw new Error(`[LLMManager.importFromFile] CRITICAL: personId was not persisted for model ${modelName}. This indicates a recipe or storage issue.`);
      }
      
      // 9. Post to channel for visibility to other components
      let owner: SHA256IdHash<Person> | null = null;
      if (this.leuteModel) {
        try {
          owner = await this.leuteModel.myMainIdentity();
        } catch (e) {
          console.warn('[LLMManager.importFromFile] Could not get owner ID:', e);
        }
      }
      
      // Add to channel - use the stored object to ensure consistency
      await this.channelManager.postToChannel(this._llmChannelId, storedModel, owner);
      
      // 10. Add the model to our maps - use the stored model
      this.models.set(storedModel.name, storedModel);
      this.modelIdToNameMap.set(storedModel.name, idHash);
      this.modelIdToNameMap.set(idHash, storedModel.name);
      
      // 12. Create default settings - this is where runtime state like isLoaded belongs
      const settings: LLMSettings = {
        $type$: 'LLMSettings',
        name: newLLM.name,
        creator: creatorIdentifier,
        created: Date.now(),
        modified: Date.now(),
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        llm: idHash as string,
        isLoaded: false, // Runtime state - properly placed in LLMSettings
        loadProgress: 0,  // Runtime state - properly placed in LLMSettings
        temperature: 0.7,
        maxTokens: 2048,
        threads: 4,
        nGpuLayers: 0,
        active: true,
        modelType: 'local'
      };
      
      // 13. Store settings
      await storeVersionedObject(settings);
      // Use the same channel ID as for LLMs since we don't have a separate settings channel
      await this.channelManager.postToChannel(this._llmChannelId, settings, owner);
      this.modelSettings.set(newLLM.name, settings);
      
      // 14. Create diagnostic log
      await this.createDiagnosticLog(newLLM);
      
      // Note: Contact creation for models is handled during LLMManager initialization
      // Individual model imports rely on the batch contact creation process
      
      // 16. Create contact and topic for the imported model
      if (this.leuteModel) {
        console.log(`[LLMManager.importFromFile] Creating contact and topic for ${modelName}`);
        try {
          // Create the contact
          const { getOrCreateSomeoneForLLM, getOrCreateTopicForLLM } = await import('../../utils/contactUtils');
          const someone = await getOrCreateSomeoneForLLM(storedModel.name, { leuteModel: this.leuteModel, llmManager: this });
          
          if (someone) {
            console.log(`[LLMManager.importFromFile] Contact created for ${modelName}`);
            
            // Create topic if we have access to appModel
            const { ModelService } = await import('../../services/ModelService');
            const appModel = ModelService.getModel();
            if (appModel) {
              const topic = await getOrCreateTopicForLLM(storedModel, appModel, this);
              if (topic) {
                console.log(`[LLMManager.importFromFile] Topic created for ${modelName}`);
              }
            }
          }
        } catch (error) {
          console.error(`[LLMManager.importFromFile] Error creating contact/topic for ${modelName}:`, error);
        }
      }
      
      // 17. Emit events - use the stored model
      this.onModelImported.emit(storedModel, idHash, fullHash);
      this.onModelUpdated.emit(storedModel);
      
      console.log(`[LLMManager.importFromFile] Import complete for ${modelName}`);
      return storedModel;
    } catch (error) {
      console.error(`[LLMManager.importFromFile] Error during import for ${fileUri}:`, error);
      throw error;
    }
  }

  /**
   * Get absolute path to a model file
   */
  public async getModelPath(modelIdHash: string): Promise<string> {
    // Check cache first
    if (this.modelPaths.has(modelIdHash)) {
      const path = this.modelPaths.get(modelIdHash) as string;
      return path.replace(/^file:\/\//, ''); // Ensure no file:// prefix
    }
    
    // Get model info
    const modelName = this.modelIdToNameMap.get(modelIdHash);
    if (!modelName) {
      throw new Error(`Model with ID '${modelIdHash}' not found in ID map`);
    }
    
    const model = this.models.get(modelName);
    if (!model) {
      throw new Error(`Model '${modelName}' not found in models collection`);
    }
    
    if (!model.filename) {
      throw new Error(`Model '${modelName}' has no filename`);
    }
    
    // Build path
    const { getStorageDir } = await import('@refinio/one.core/lib/system/expo/storage-base');
    const privateDir = await getStorageDir(STORAGE.PRIVATE);
    const modelsDir = `${privateDir}/models`;
    const modelPath = `${modelsDir}/${model.filename}`;
    
    // Cache and return
    const normalizedPath = modelPath.replace(/^file:\/\//, '');
    this.modelPaths.set(modelIdHash, normalizedPath);
    return normalizedPath;
  }

  /**
   * Verify that a model file exists and appears to be valid
   * This performs basic checks to detect common issues like corruption or incomplete downloads
   * 
   * @param modelPath Full path to the model file
   * @param modelName Name of the model for logging
   * @returns Promise that resolves if the file is valid, rejects with an error otherwise
   */
  private async verifyModelFile(modelPath: string, modelName: string): Promise<void> {
    try {
      // Import required functions for file operations
      const { exists, fileSize } = await import('@refinio/one.core/lib/system/expo/storage-base');
      
      // Log validation attempt with full path for debugging
      console.log(`[LLMManager] Verifying model file for ${modelName} at path: ${modelPath}`);
      
      // Check if file exists
      const fileExists = await exists(modelPath);
      if (!fileExists) {
        console.error(`[LLMManager] Model file does not exist at path: ${modelPath}`);
        throw new Error(`Model file does not exist: ${modelPath}`);
      }
      
      // Check file size
      const size = await fileSize(modelPath);
      
      // Basic validation checks
      if (size <= 0) {
        console.error(`[LLMManager] Model file exists but has zero size: ${modelPath}`);
        throw new Error(`Model file exists but has zero size: ${modelPath}`);
      }
      
      // Most LLM models are at least several MB in size
      const MIN_VALID_MODEL_SIZE = 1024 * 1024; // 1MB minimum
      if (size < MIN_VALID_MODEL_SIZE) {
        console.error(`[LLMManager] Model file is suspiciously small (${size} bytes): ${modelPath}`);
        throw new Error(`Model file is suspiciously small (${size} bytes), may be corrupt or incomplete`);
      }
      
      console.log(`[LLMManager] Successfully verified model file for ${modelName}: ${modelPath} (${size} bytes)`);
    } catch (error: any) {
      console.error(`[LLMManager] Model file verification error for ${modelName}:`, error);
      throw error;
    }
  }

  /**
   * Get a model by ID hash
   * 
   * @param modelIdHash The ID hash of the model
   * @returns The model object
   * @throws Error if model not found
   */
  public getModelById(modelIdHash: string): LLM {
    // Try to get model directly by ID hash
    if (this.models.has(modelIdHash)) {
      return this.models.get(modelIdHash) as LLM;
    }
    
    // Try to look up by name from ID mapping
    const modelName = this.modelIdToNameMap.get(modelIdHash);
    if (!modelName) {
      throw new Error(`[LLMManager] Model with ID '${modelIdHash}' not found in ID-to-name mapping`);
    }
    
    const model = this.models.get(modelName);
    if (!model) {
      throw new Error(`[LLMManager] Model '${modelName}' not found in models collection`);
    }
    
    return model;
  }

  /**
   * Get the Person ID for an LLM model
   * 
   * @param modelIdHash ID hash of the model
   * @returns Person ID for the model
   * @throws Error if model not found or personId cannot be set up
   */
  public getModelPersonId(modelIdHash: string): string {
    // Try to get model directly by ID hash
    const model = this.getModelById(modelIdHash);
    
    // If we already have a personId, return it
    if (model.personId) {
      return model.personId;
    }
    
    // If no personId, throw error - should be set up before this is called
    throw new Error(`[LLMManager] Model ${model.name} (${modelIdHash}) does not have a personId set`);
  }

  /**
   * Set the personId for a model
   * @param modelName The model name
   * @param personId The personId to set
   */
  public async setModelPersonId(modelName: string, personId: string): Promise<void> {
    try {
      const model = this.models.get(modelName);
      if (model) {
        model.personId = personId;
        await this.storeModel(model);
      }
    } catch (error) {
      console.error(`[LLMManager.setModelPersonId] Error:`, error);
    }
  }

  /**
   * Get the ID hash for a model by name
   * This is a critical method used by other components to look up models
   * 
   * @param modelName The name of the model to look up
   * @returns The ID hash of the model
   * @throws Error if model not found
   */
  public async getModelIdHash(modelName: string): Promise<string> {
    // Use the map first for efficiency
    const idHashFromMap = this.modelIdToNameMap.get(modelName);
    if (idHashFromMap) {
      console.log(`[LLMManager] Found ID hash ${idHashFromMap} for model ${modelName} in map`);
      return idHashFromMap;
    }
    
    // If not in map, try retrieving the object and calculating the ID hash
    // This handles cases where the map might be out of sync or model wasn't listed yet
    console.warn(`[LLMManager] ID hash for model ${modelName} not found in map, attempting direct calculation`);
    const model = this.models.get(modelName); // Get model from local cache if available
    
    if (!model) {
      // Optionally, try loading from storage if not in local cache?
      // For now, throw if not found in the current collection
      throw new Error(`[LLMManager] Model '${modelName}' not found in models collection`);
    }
    
    // Calculate the ID hash directly - necessary if it wasn't in the map
    const calculatedIdHash = await calculateIdHashOfObj(model) as SHA256IdHash<LLM>;
    console.log(`[LLMManager] Calculated ID hash ${calculatedIdHash} for model ${modelName}`);
    
    // Update the map for future lookups
    this.modelIdToNameMap.set(modelName, calculatedIdHash);
    this.modelIdToNameMap.set(calculatedIdHash, modelName);
    
    return calculatedIdHash;
    
    // REMOVE_START - Old logic relying on calculateHashes
    // // Get the model object directly
    // const model = this.models.get(modelName);
    // 
    // if (!model) {
    //   throw new Error(`[LLMManager] Model '${modelName}' not found in models collection`);
    // }
    // 
    // // Calculate the hash directly
    // const { idHash } = await this.calculateHashes(model); // Relies on removed method
    // return idHash as string;
    // REMOVE_END
  }

  /**
   * Ensures models are loaded, initializing them if needed
   * This method is used internally before any operation that requires models to be loaded
   */
  private async ensureModelsLoaded(): Promise<void> {
    if (this._modelsLoaded) {
      return;
    }
    
    console.log('[LLMManager] Ensuring models are loaded');
    
    try {
      // First load models from channel which populates the models collection
      await this.listModels();
      
      // Then rebuild paths to ensure we're using the correct paths
      await this.rebuildAllModelPaths();
      
      this._modelsLoaded = true;
      console.log('[LLMManager] Models successfully loaded and paths rebuilt');
    } catch (error) {
      this._modelsLoaded = false;
      console.error('[LLMManager] Failed to ensure models are loaded:', error);
      throw error; // Fail fast
    }
  }

  /**
   * Update model metadata after loading from llama.rn
   * This method updates the model's metadata (contextSize, architecture, etc.) 
   * after the actual values are discovered from the loaded model
   */
  public async updateModelMetadata(
    modelIdHash: string, 
    metadata: {
      contextSize?: number;
      contextLength?: number; // Alternative field name
      architecture?: string;
      quantization?: string;
      parameters?: number;
      maxTokens?: number;
    }
  ): Promise<void> {
    try {
      console.log(`[LLMManager] Updating metadata for model ${modelIdHash}:`, metadata);
      
      // Get the model name from the ID hash
      const modelName = this.modelIdToNameMap.get(modelIdHash);
      if (!modelName) {
        console.warn(`[LLMManager] Model with ID ${modelIdHash} not found in map, trying direct lookup`);
        // Try direct lookup in models map
        const model = this.models.get(modelIdHash);
        if (!model) {
          throw new Error(`[LLMManager] Model with ID ${modelIdHash} not found`);
        }
      }
      
      // Get the current model object
      const model = modelName ? this.models.get(modelName) : this.models.get(modelIdHash);
      if (!model) {
        throw new Error(`[LLMManager] Model not found in models collection`);
      }
      
      // Create updated model with new metadata
      const updatedModel: LLM = {
        ...model,
        contextSize: metadata.contextSize ?? model.contextSize,
        contextLength: metadata.contextLength ?? model.contextLength,
        architecture: metadata.architecture ?? model.architecture,
        quantization: metadata.quantization ?? model.quantization,
        maxTokens: metadata.maxTokens ?? model.maxTokens,
        modified: Date.now()
      };
      
      // If parameters were provided, update them
      if (metadata.parameters !== undefined) {
        updatedModel.size = metadata.parameters; // Store in size field
      }
      
      // Store the updated model
      const { idHash, fullHash } = await this.storeModel(updatedModel);
      
      console.log(`[LLMManager] Successfully updated metadata for model ${model.name}`);
      
      // Emit update events
      this.onModelUpdated.emit(updatedModel);
      this.onModelsUpdated.emit();
    } catch (error) {
      console.error(`[LLMManager] Error updating model metadata:`, error);
      throw error;
    }
  }

  /**
   * Sets the AIAssistantModel reference without triggering state changes
   * @param model The AIAssistantModel instance
   */
  public setAIAssistantModel(model: any): void {
    console.log('[LLMManager] Setting AIAssistantModel reference');
    this._aiAssistantModel = model;
  }

  /**
   * Gets the AIAssistantModel reference
   * @returns The AIAssistantModel instance
   */
  public getAIAssistantModel(): any {
    return this._aiAssistantModel;
  }

  /**
   * Validate model filenames
   * This method checks all stored LLM objects for invalid filenames
   * (filenames with path components) and throws errors when found
   */
  private async validateModelFilenames(): Promise<void> {
    console.log('[LLMManager] Validating model filenames');
    
    let invalidModels: string[] = [];
    
    // Process all models in the map
    for (const [modelName, model] of this.models.entries()) {
      if (model.filename && model.filename.includes('/')) {
        console.error(`[LLMManager] Found invalid filename for model ${modelName}: ${model.filename}`);
        invalidModels.push(modelName);
      }
    }
    
    if (invalidModels.length > 0) {
      throw new Error(`Data integrity error: Found ${invalidModels.length} models with invalid filenames. Models: ${invalidModels.join(', ')}. These must be manually repaired before the application can continue.`);
    } else {
      console.log('[LLMManager] All model filenames are valid');
    }
  }

  /**
   * Extract metadata from a model file
   */
  private async extractModelMetadata(modelPath: string): Promise<Partial<LLM>> {
    // For now, we only extract basic metadata
    const metadata: Partial<LLM> = {
      architecture: 'llama', // Default architecture
      contextLength: 2048,   // Default context length
      quantization: 'unknown',
      maxTokens: 2048,
      temperature: 0.7,
      threads: 4,
      capabilities: ['chat', 'inference'] // Default capabilities
    };
    
    // Add more sophisticated extraction logic here if needed
    
    return metadata;
  }

  /**
   * Verify if a model file is valid GGUF format
   * @returns true if valid, false if corrupted
   */
  public async verifyModelFile(modelPath: string): Promise<boolean> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(modelPath);
      if (!fileInfo.exists) {
        console.error(`[LLMManager] Model file does not exist: ${modelPath}`);
        return false;
      }
      
      // Check file size (should be > 100MB for most models)
      if (fileInfo.size < 100 * 1024 * 1024) {
        console.warn(`[LLMManager] Model file suspiciously small: ${fileInfo.size} bytes`);
        return false;
      }
      
      // Check GGUF magic number
      try {
        const firstBytes = await FileSystem.readAsStringAsync(modelPath, {
          length: 4,
          position: 0,
          encoding: FileSystem.EncodingType.Base64
        });
        
        // Decode base64 to check magic number
        const decoded = atob(firstBytes);
        if (decoded !== 'GGUF') {
          console.error(`[LLMManager] Invalid GGUF magic number. Found: ${decoded} (base64: ${firstBytes})`);
          return false;
        }
        
        console.log(`[LLMManager] Model file verified: valid GGUF format`);
        return true;
      } catch (readError) {
        console.error(`[LLMManager] Error reading model file:`, readError);
        return false;
      }
    } catch (error) {
      console.error(`[LLMManager] Error verifying model file:`, error);
      return false;
    }
  }

  /**
   * Attempt to fix a corrupted model by re-downloading
   */
  public async fixCorruptedModel(model: LLM): Promise<boolean> {
    console.log(`[LLMManager] Attempting to fix corrupted model: ${model.name}`);
    
    try {
      // Get the model path
      const modelPath = this.modelPaths.get(model.name);
      if (!modelPath) {
        console.error(`[LLMManager] No path found for model ${model.name}`);
        return false;
      }
      
      // Delete the corrupted file
      console.log(`[LLMManager] Deleting corrupted file: ${modelPath}`);
      await FileSystem.deleteAsync(modelPath, { idempotent: true });
      
      // Remove from our maps
      this.models.delete(model.name);
      this.modelPaths.delete(model.name);
      const idHash = await this.getModelIdHash(model.name);
      if (idHash) {
        this.modelIdToNameMap.delete(idHash);
      }
      
      // Check if model has a download URL
      const settings = this.modelSettings.get(model.name);
      if (!settings?.downloadUrl) {
        console.error(`[LLMManager] No download URL available for model ${model.name}`);
        return false;
      }
      
      console.log(`[LLMManager] Model ${model.name} can be re-downloaded from: ${settings.downloadUrl}`);
      console.log(`[LLMManager] Please use the download button in settings to re-download the model`);
      
      // Emit model removed event so UI updates
      this.onModelRemoved.emit(model.name);
      this.notifyModelsChanged();
      
      return true;
    } catch (error) {
      console.error(`[LLMManager] Error fixing corrupted model:`, error);
      return false;
    }
  }

  /**
   * Detect model capabilities based on model metadata and file analysis
   * This provides capability information used by the AIAssistantModel
   */
  public async detectModelCapabilities(model: LLM): Promise<LLMCapabilities> {
    console.log(`[LLMManager] Detecting capabilities for model ${model.name}`);
    
    // Start with capabilities from model object if available
    const capabilities: LLMCapabilities = {
      chat: model.capabilities?.includes('chat') || false,
      inference: model.capabilities?.includes('inference') || false,
      embedding: model.capabilities?.includes('embedding') || false,
      contextSize: model.contextLength || 2048,
      functions: model.capabilities?.includes('functions') || false,
      tools: model.capabilities?.includes('tools') || false,
      rag: model.capabilities?.includes('rag') || false,
      visionSupport: model.capabilities?.includes('vision') || false,
      multimodal: model.capabilities?.includes('multimodal') || false
    };
    
    // Heuristics based on model name and architecture
    const modelNameLower = model.name.toLowerCase();
    
    // Detect capabilities based on model family/name patterns
    if (modelNameLower.includes('gpt-4') || modelNameLower.includes('claude')) {
      capabilities.functions = true;
      capabilities.tools = true;
      capabilities.rag = true;
      capabilities.contextSize = Math.max(capabilities.contextSize, 8192);
    }
    
    if (modelNameLower.includes('mistral') || modelNameLower.includes('mixtral')) {
      capabilities.functions = true;
      capabilities.tools = true;
      capabilities.contextSize = Math.max(capabilities.contextSize, 4096);
    }
    
    if (modelNameLower.includes('llama-2') || modelNameLower.includes('llama2')) {
      capabilities.contextSize = Math.max(capabilities.contextSize, 4096);
    }
    
    if (modelNameLower.includes('llama-3') || modelNameLower.includes('llama3')) {
      capabilities.contextSize = Math.max(capabilities.contextSize, 8192);
      capabilities.functions = true;
      capabilities.tools = true;
    }
    
    if (modelNameLower.includes('vision') || 
        modelNameLower.includes('gpt-4v') || 
        modelNameLower.includes('multimodal')) {
      capabilities.visionSupport = true;
      capabilities.multimodal = true;
    }
    
    // At minimum, all models support basic inference
    capabilities.inference = true;
    
    console.log(`[LLMManager] Detected capabilities for ${model.name}:`, capabilities);
    return capabilities;
  }

  /**
   * Register a model's capabilities with the AIAssistantModel
   * This builds the bridge between LLMs and the assistant system
   */
  public async registerModelWithAssistant(model: LLM): Promise<void> {
    console.log(`[LLMManager] Registering model ${model.name} with AI assistant`);
    
    if (!this._aiAssistantModel) {
      console.warn('[LLMManager] No AI assistant model available, skipping registration');
      return;
    }
    
    try {
      // First ensure the model has a personId - essential for contact creation
      if (!model.personId) {
        console.log(`[LLMManager] Model ${model.name} has no personId, setting it up`);
        const personId = await this.setupModelPersonIdReference(model);
        if (personId) {
          model.personId = personId;
        }
      }
      
      // Only proceed if we have a valid leuteModel
      if (!this.leuteModel) {
        console.warn('[LLMManager] No leuteModel available, cannot register model with contacts');
        return;
      }
      
      // Import the centralized contact creation utility
      const { createContactForModel } = await import('../../models/ensureContactsForModels');
      
      // Use the centralized utility to ensure consistent implementation
      const someone = await createContactForModel(model, this.leuteModel);
      
      if (someone) {
        console.log(`[LLMManager] Successfully registered model ${model.name} with AI assistant. Someone: ${someone.idHash}`);
      }
    } catch (error) {
      console.error(`[LLMManager] Error registering model ${model.name} with AI assistant:`, error);
    }
  }

  // Add this method to ensure models are properly indexed by both name and ID hash
  /**
   * Indexes a model by both its name and ID hash to ensure consistent lookups
   * This ensures models can be found whether searching by name or ID hash
   * 
   * @param model The LLM model to index
   * @param modelIdHash The ID hash of the model
   */
  private indexModel(model: LLM, modelIdHash: string): void {
    if (!model || !model.name || !modelIdHash) {
      console.warn(`[LLMManager] Cannot index model: missing model, name, or ID hash`);
      return;
    }

    // Store the model under both its name AND its ID hash for consistent lookup
    this.models.set(model.name, model);
    this.models.set(modelIdHash, model);
    
    // Maintain bidirectional mapping between ID and name
    this.modelIdToNameMap.set(model.name, modelIdHash);
    this.modelIdToNameMap.set(modelIdHash, model.name);
    
    console.log(`[LLMManager] Indexed model ${model.name} with ID ${modelIdHash} in models collection`);
  }

  /**
   * Helper method to get objects from the channel with a specific type
   * This wraps the channelManager.getObjectsWithType method
   */
  private async getChannelObjects(channelId: string, objectType: string, tag?: string): Promise<any[]> {
    try {
      const options: any = { channelId };
      if (tag) {
        options.tag = tag;
      }
      
      return await this.channelManager.getObjectsWithType(objectType as any, options);
    } catch (error) {
      console.error(`[LLMManager] Error getting channel objects of type ${objectType}:`, error);
      return [];
    }
  }

  // Fix typings for parameters that were previously 'any'
  private async rebuildModelPaths(model: LLM): Promise<void> {
    try {
      // Implementation
    } catch (error) {
      console.error(`[LLMManager] Error rebuilding model path:`, error);
    }
  }

  // Fix other methods with implicit any parameters
  private async processChannelObjects(channelObjects: Array<{ obj: LLM | LLMSettings, hash: string }>): Promise<void> {
    // Process each object and add to the appropriate collection
    for (const obj of channelObjects) {
      if (!obj.obj || !obj.obj.$type$) {
        continue;
      }
      
      // Implementation
    }
  }

  /**
   * Find a known model definition by its ID or name
   * This method is used by AIAssistantModel to get preset configurations
   * 
   * @param idOrName The ID or name of the known model to find
   * @returns The known model configuration or undefined if not found
   */
  public findKnownModel(idOrName: string): LLMSettings | undefined {
    // First try direct lookup by name
    const directMatch = knownModels.find(model => 
      model.name === idOrName || 
      model.name.toLowerCase() === idOrName.toLowerCase()
    );
    
    if (directMatch) {
      return directMatch;
    }
    
    // Try matching with normalization - e.g., removing version numbers or quantization info
    const normalizedSearch = this.sanitizeModelName(idOrName);
    return knownModels.find(model => {
      const normalizedName = this.sanitizeModelName(model.name);
      return normalizedName.includes(normalizedSearch) || 
             normalizedSearch.includes(normalizedName);
    });
  }
  
  /**
   * Get all known model definitions
   * 
   * @returns Array of known model configurations
   */
  public getKnownModels(): LLMSettings[] {
    return [...knownModels];
  }

  /**
   * Ensure that all model personas have the required cryptographic keys
   * This fixes situations where existing models don't have keys set up
   */
  private async ensureAllModelPersonasHaveKeys(): Promise<void> {
    try {
      console.log('[LLMManager] Ensuring all model personas have cryptographic keys');
      
      // Get all models
      const models = Array.from(this.models.values());
      console.log(`[LLMManager] Checking keys for ${models.length} models`);
      
      for (const model of models) {
        try {
          // Skip if model doesn't have a personId
          if (!model.personId) {
            console.log(`[LLMManager] Model ${model.name} has no personId, setting it up`);
            const personId = await this.setupModelPersonIdReference(model);
            if (personId) {
              model.personId = personId;
              console.log(`[LLMManager] Set up personId ${personId} for model ${model.name}`);
            } else {
              console.warn(`[LLMManager] Failed to set up personId for model ${model.name}`);
              continue;
            }
          }
          
          // Now ensure this person has keys - use ensureIdHash to convert string to SHA256IdHash<Person>
          console.log(`[LLMManager] Ensuring keys for model ${model.name} with personId ${model.personId}`);
          const personIdHash = ensureIdHash<Person>(model.personId);
          const result = await this.ensurePersonHasKeys(personIdHash);
          
          if (result) {
            console.log(`[LLMManager] Successfully verified/created keys for model ${model.name}`);
          } else {
            console.warn(`[LLMManager] Failed to ensure keys for model ${model.name}`);
          }
        } catch (modelError) {
          console.error(`[LLMManager] Error processing keys for model ${model.name}:`, modelError);
          // Continue with next model
        }
      }
      
      console.log('[LLMManager] Completed key verification for all models');
    } catch (error) {
      console.error('[LLMManager] Error ensuring all model personas have keys:', error);
      throw error;
    }
  }

  /**
   * Check if a model is currently loaded
   * @param modelIdHash The ID hash of the model to check
   * @returns True if the model is loaded, false otherwise
   */
  public isModelLoaded(modelIdHash: string): boolean {
    // Check if the context exists in our map - this is the source of truth
    const contextExists = this.modelContexts.has(modelIdHash);
    
    // Also check the LlamaModel singleton state
    const llamaModel = LlamaModel.getInstance();
    const llamaModelState = llamaModel.getState();
    const isLlamaModelReady = llamaModelState === 'ready' || llamaModelState === 'generating';
    
    // If LlamaModel is not ready but we think we have context, clear it
    if (contextExists && !isLlamaModelReady) {
      console.log(`[LLMManager] Context exists for ${modelIdHash} but LlamaModel state is ${llamaModelState}, clearing context`);
      this.modelContexts.delete(modelIdHash);
      this.onModelUnloaded.emit(modelIdHash);
    }
    
    // Also update the model settings to match the actual state
    const modelName = this.modelIdToNameMap.get(modelIdHash);
    const settings = modelName ? this.modelSettings.get(modelName) : undefined;
    
    const actuallyLoaded = contextExists && isLlamaModelReady;
    
    if (settings && settings.isLoaded !== actuallyLoaded) {
      // Update settings to match the actual state
      settings.isLoaded = actuallyLoaded;
      // Note: We can't persist this change here since this is a synchronous method
      // The settings will be updated on future operations
    }
    
    // Return true only if we have context AND LlamaModel is ready
    return actuallyLoaded;
  }

  /**
   * Get a loaded model context
   * @param modelIdHash The ID hash of the model to get the context for
   * @returns The model context, or undefined if the model is not loaded
   */
  public getModelContext(modelIdHash: string): any | undefined {
    return this.modelContexts.get(modelIdHash);
  }

  /**
   * Mark a model context as in use or not
   * @param modelIdHash The ID hash of the model
   * @param inUse Whether the context is in use
   */
  public setContextInUse(modelIdHash: string, inUse: boolean): void {
    // Only manage the contextInUse map
    console.log(`[LLMManager] Setting contextInUse for ${modelIdHash} to: ${inUse}`);
    this.contextInUse.set(modelIdHash, inUse);
  }

  /**
   * Check if a model context is currently in use
   * @param modelIdHash The ID hash of the model
   * @returns True if the context is in use, false otherwise
   */
  public isContextInUse(modelIdHash: string): boolean {
    return this.contextInUse.get(modelIdHash) || false;
  }
  
  /**
   * Check if any model is currently generating
   * @returns True if any model is generating, false otherwise
   */
  public isAnyModelGenerating(): boolean {
    // Check contextInUse map
    for (const [modelIdHash, inUse] of this.contextInUse) {
      if (inUse) {
        return true;
      }
    }
    
    // Also check LlamaModel state directly
    try {
      const llamaModel = LlamaModel.getInstance();
      if (llamaModel && llamaModel.isGenerating()) {
        return true;
      }
    } catch (error) {
      // LlamaModel might not be initialized yet
      console.debug('[LLMManager] Could not check LlamaModel generation state:', error);
    }
    
    return false;
  }
  
  /**
   * Stop any ongoing generation
   * @returns Promise that resolves when generation is stopped
   */
  public async stopGeneration(): Promise<void> {
    console.log('[LLMManager] Stopping any ongoing generation...');
    
    try {
      // Get the LlamaModel instance and stop its completion
      const llamaModel = LlamaModel.getInstance();
      
      if (llamaModel.isGenerating()) {
        console.log('[LLMManager] Stopping LlamaModel completion...');
        await llamaModel.stopCompletion();
        console.log('[LLMManager] LlamaModel completion stopped');
      }
      
      // Clear all contextInUse flags
      for (const [modelIdHash, inUse] of this.contextInUse) {
        if (inUse) {
          console.log(`[LLMManager] Clearing in-use flag for model ${modelIdHash}`);
          this.contextInUse.set(modelIdHash, false);
        }
      }
    } catch (error) {
      console.error('[LLMManager] Error stopping generation:', error);
      throw error;
    }
  }
  
  /**
   * Get the ID hash of the model that is currently generating
   * @returns The model ID hash if a model is generating, undefined otherwise
   */
  public getCurrentlyGeneratingModel(): string | undefined {
    // Check contextInUse map
    for (const [modelIdHash, inUse] of this.contextInUse) {
      if (inUse) {
        return modelIdHash;
      }
    }
    
    return undefined;
  }

  /**
   * Loads a model by its ID hash
   * Returns a promise that resolves to the model context when loaded
   * 
   * @param modelIdHash The ID hash of the model to load
   * @returns A promise that resolves to the model context
   */
  public async loadModel(modelIdHash: string): Promise<any> {
    console.log(`[LLMManager] Loading model ${modelIdHash}`);
    console.log(`[LLMManager] Current modelContexts keys:`, Array.from(this.modelContexts.keys()));
    console.log(`[LLMManager] Looking for context with key: ${modelIdHash}`);
    
    // Check if model context already exists in our map
    if (this.modelContexts.has(modelIdHash)) {
      const existingContext = this.modelContexts.get(modelIdHash);
      // If context exists in map, assume it's the correct one (LlamaModel handles internal state)
      console.log(`[LLMManager] Model ${modelIdHash} context found in map, returning existing context`);
      return existingContext;
    }
    
    // If context not in map, proceed to load it via implementation method
    console.log(`[LLMManager] Model ${modelIdHash} context not found, proceeding to load`);
    // Use _loadModelImpl which now directly calls _loadModelImplInternal and handles map updates/errors
    const loadingPromise = this._loadModelImpl(modelIdHash)
      .then(context => {
        // Context is already stored in map by _loadModelImpl on success
        console.log(`[LLMManager] Model ${modelIdHash} loading promise resolved`);
        return context;
      })
      .catch(error => {
        // Error is handled and context is cleared in _loadModelImpl
        console.error(`[LLMManager] Model ${modelIdHash} loading promise rejected`);
        // Re-throw to continue the error chain
        throw error;
      });
    
    // Return the promise that resolves with the context or rejects with error
    return loadingPromise;
  }

  /**
   * Unload a model, freeing its resources
   * @param modelIdHash The ID hash of the model to unload
   * @returns A promise that resolves when the model is unloaded
   */
  public async unloadModel(modelIdHash: string): Promise<void> {
    // If the model isn't loaded, do nothing
    if (!this.modelContexts.has(modelIdHash)) {
      console.log(`[LLMManager] Model ${modelIdHash} not loaded, nothing to unload`);
      return;
    }

    // If the context is in use, log a warning but proceed
    if (this.contextInUse.get(modelIdHash)) {
      console.warn(`[LLMManager] Unloading model ${modelIdHash} while it's in use`);
    }

    try {
      // Note: We don't actually release the context here because the singleton
      // LlamaModel handles that internally when switching models.
      // We just need to update our tracking state.
      
      // Remove the context from our maps
      this.modelContexts.delete(modelIdHash);
      this.contextInUse.delete(modelIdHash);
      
      // Get the model settings and update the isLoaded flag
      const modelName = this.modelIdToNameMap.get(modelIdHash);
      if (modelName) {
        const settings = this.modelSettings.get(modelName);
        if (settings) {
          settings.isLoaded = false;
          settings.loadProgress = 0;
          
          // Persist the updated settings
          try {
            // Store the updated settings in the versioned objects store
            await storeVersionedObject(settings);
            
            // Update the settings in the channel too
            let owner: SHA256IdHash<Person> | null = null;
            if (this.leuteModel) {
              try {
                owner = await this.leuteModel.myMainIdentity();
              } catch (e) {
                console.warn('[LLMManager.unloadModel] Could not get owner ID:', e);
              }
            }
            
            await this.channelManager.postToChannel(this._llmChannelId, settings, owner);
            console.log(`[LLMManager] Updated settings for model ${modelName} to reflect unloaded state`);
          } catch (e) {
            console.warn(`[LLMManager] Error persisting updated settings:`, e);
          }
        }
      }
      
      // Emit event
      this.onModelUnloaded.emit(modelIdHash);
      
      console.log(`[LLMManager] Successfully unloaded model ${modelIdHash}`);
    } catch (error) {
      console.error(`[LLMManager] Error unloading model ${modelIdHash}:`, error);
      throw error;
    }
  }

  /**
   * Unload all loaded models
   * @returns A promise that resolves when all models are unloaded
   */
  public async unloadAllModels(): Promise<void> {
    console.log(`[LLMManager] Unloading all models`);
    
    const modelIds = Array.from(this.modelContexts.keys());
    for (const modelId of modelIds) {
      await this.unloadModel(modelId);
    }
    
    console.log(`[LLMManager] All models unloaded`);
  }

  /**
   * Internal implementation of model loading
   * This handles the actual loading of a model into memory using the LlamaModel singleton
   * 
   * @param modelIdHash The ID hash of the model to load
   * @returns Promise resolving to a loaded model context
   * @private
   */
  private async _loadModelImpl(modelIdHash: string): Promise<any> {
    console.log(`[LLMManager] Loading model ${modelIdHash}`);
    
    // Directly call the internal implementation - LlamaModel handles concurrency
    
    try {
      // Directly await the internal implementation
      const result = await this._loadModelImplInternal(modelIdHash);
      // Store context in the map upon successful load
      console.log(`[LLMManager] Storing context for model ${modelIdHash} in modelContexts map`);
      this.modelContexts.set(modelIdHash, result);
      console.log(`[LLMManager] modelContexts now has keys:`, Array.from(this.modelContexts.keys()));
      this.onModelLoaded.emit(modelIdHash, result);
      return result;
    } catch (error) { 
      // Ensure context map is cleared on error
      this.modelContexts.delete(modelIdHash);
      this.onModelUnloaded.emit(modelIdHash);
      throw error; // Re-throw
    } 
  }
  
  /**
   * Internal implementation of model loading
   * This contains the actual loading logic
   */
  private async _loadModelImplInternal(modelIdHash: string): Promise<any> {
    console.log(`[LLMManager] Loading model ${modelIdHash} (internal implementation)`);
    
    // Get the model recipe from the store
    const model = await this.getModelById(modelIdHash);
    
    if (!model) {
      const error = new Error(`[LLMManager] Model not found with ID ${modelIdHash}`);
      console.error(error.message);
      throw error;
    }
    
    // Get or create model path
    let modelPath = '';
    let fileSize = 0;
    
    try {
      // Pass the model ID hash string (not the model object) to getModelPath
      modelPath = await this.getModelPath(modelIdHash);
      this.modelPaths.set(modelIdHash, modelPath);
    } catch (pathError) {
      console.error(`[LLMManager] Error getting model path:`, pathError);
      throw new Error(`Failed to get model path: ${pathError instanceof Error ? pathError.message : String(pathError)}`);
    }
    
    try {
      // Use both native fs methods to verify file access
      const { exists, fileSize: fSize } = await import('@refinio/one.core/lib/system/expo/storage-base');
      
      if (!await exists(modelPath)) {
        const error = new Error(`Model file does not exist: ${modelPath}`);
        console.error(`[LLMManager] ${error.message}`);
        throw error;
      }
      
      fileSize = await fSize(modelPath);
      console.log(`[LLMManager] Model file verified: ${modelPath}, size: ${fileSize} bytes`);
      
      if (fileSize <= 0) {
        const error = new Error(`Model file has invalid size: ${fileSize} bytes`);
        console.error(`[LLMManager] ${error.message}`);
        throw error;
      }
      
      // Verify GGUF format before attempting to load
      const isValid = await this.verifyModelFile(modelPath);
      if (!isValid) {
        console.error(`[LLMManager] Model file is corrupted: ${modelPath}`);
        
        // Attempt to fix the corrupted model
        const fixed = await this.fixCorruptedModel(model);
        if (fixed) {
          throw new Error(`Model file is corrupted and has been removed. Please re-download the model.`);
        } else {
          throw new Error(`Model file is corrupted and could not be fixed automatically.`);
        }
      }
    } catch (fsError) {
      console.error(`[LLMManager] Error checking model file:`, fsError);
      throw new Error(`Error checking model file: ${fsError instanceof Error ? fsError.message : String(fsError)}`);
    }
    
    // Get the singleton instance only once
    const llamaModel = LlamaModel.getInstance();
    
    // Reset error state if the model was previously in error
    const currentState = llamaModel.getState();
    if (currentState === 'error') {
      console.log(`[LLMManager] Model is in error state, resetting before retry`);
      llamaModel.resetErrorState(modelPath);
    }
    
    // Check if the module is available before attempting to initialize
    if (!llamaModel.isModuleAvailable()) {
      const error = new Error(`LlamaBridge module is not available`);
      console.error(`[LLMManager] ${error.message}`);
      throw error;
    }
    
    console.log(`[LLMManager] Using LlamaModel singleton instance for ${model.name}`);
    
    try {
      // Initialize the model with optimized parameters for faster speed
      // Use low-batch size and optimized settings for mobile
      console.log(`[LLMManager] Calling initializeModel for ${model.name} at path ${modelPath}`);
      
      // Let the model use its native configuration
      // LlamaModel will query the model file for its capabilities
      const optimizedConfig = {
        modelAlias: model.name,
        // Enable GPU/MLX on iOS for better performance
        useGPU: Platform.OS === 'ios'
      };
      
      const initSuccess = await llamaModel.initializeModel(modelPath, optimizedConfig);
      
      if (!initSuccess) {
        const error = new Error(`[LLMManager] Model initialization failed for ${model.name}`);
        console.error(error.message);
        
        // Log model state for diagnostics
        const modelState = llamaModel.getActiveState();
        const modelInfo = llamaModel.getModelInfo();
        console.error(`[LLMManager] Model state: ${modelState}`, modelInfo);
        
        throw error;
      }
      
      // Extract and persist model metadata after successful initialization
      try {
        console.log(`[LLMManager] Checking for model metadata to persist`);
        
        // Get the model metadata from LlamaModel
        const modelMetadata = llamaModel.getModelMetadata();
        if (modelMetadata) {
          console.log(`[LLMManager] Found model metadata:`, modelMetadata);
          
          // Update the model metadata in persistent storage
          await this.updateModelMetadata(modelIdHash, {
            contextSize: modelMetadata.contextLength,
            contextLength: modelMetadata.contextLength,
            architecture: modelMetadata.architecture,
            quantization: modelMetadata.quantization,
            parameters: modelMetadata.parameters,
            maxTokens: modelMetadata.contextLength || 2048 // Use model's actual context length
          });
          
          console.log(`[LLMManager] Successfully persisted model metadata for ${model.name}`);
        } else {
          console.log(`[LLMManager] No model metadata found to persist`);
        }
      } catch (metadataError) {
        // Don't fail the model load if metadata persistence fails
        console.warn(`[LLMManager] Failed to persist model metadata:`, metadataError);
      }
      
      // Emit events
      this.onModelLoaded.emit(modelIdHash, llamaModel);
      
      console.log(`[LLMManager] Successfully loaded model ${model.name}`);
      return llamaModel;
    } catch (error) {
      console.error(`[LLMManager] Failed to load model ${model.name}:`, error);
      
      // Clean up partial state
      this.modelContexts.delete(modelIdHash); // Ensure context is cleared on error
      this.models.delete(modelIdHash);

      // Emit an event to notify of model unload due to error
      this.onModelUnloaded.emit(modelIdHash);

      throw error;
    }
  }

  /**
   * Check if models have been successfully loaded
   * @returns {boolean} True if models have been loaded, false otherwise
   */
  public hasLoadedModels(): boolean {
    // This method checks if we have model definitions loaded from storage
    // NOT whether they are loaded in memory (use isModelLoaded for that)
    return this._modelsLoaded || this.models.size > 0;
  }
  
  /**
   * Set the MCP Manager reference for tool integration
   */
  public setMCPManager(mcpManager: any): void {
    this.mcpManager = mcpManager;
    console.log('[LLMManager] MCPManager reference set');
  }
  
  /**
   * Get available MCP tools if MCPManager is available
   */
  public async getAvailableTools(): Promise<any[]> {
    if (!this.mcpManager) {
      return [];
    }
    
    try {
      const tools = await this.mcpManager.discoverTools();
      console.log(`[LLMManager] Found ${tools.length} MCP tools`);
      return tools;
    } catch (error) {
      console.error('[LLMManager] Error discovering MCP tools:', error);
      return [];
    }
  }

  private async _createNewModelObject(options: {
    name: string;
    filename: string;
    modelType?: 'local' | 'remote';
    creator?: string;
    size?: number;
    architecture?: string;
    contextLength?: number;
    quantization?: string;
    capabilities?: string[]; // Keep input type as string[]
    personId?: string;
  }): Promise<LLM> {
    const now = Date.now();
    const createdAt = new Date(now).toISOString();

    // Define valid capability strings based on the LLM type
    const validCapabilities = [
      'chat', 'inference', 'embedding', 'functions', 'tools', 
      'rag', 'vision', 'multimodal'
    ] as const; // Use 'as const' for type safety
    type ValidCapability = typeof validCapabilities[number];

    // Filter provided capabilities or use default
    const filteredCapabilities = options.capabilities
      ? options.capabilities.filter((cap): cap is ValidCapability => 
          validCapabilities.includes(cap as ValidCapability)
        )
      : ['chat', 'inference'] as ValidCapability[];

    // Generate a model object with all required fields
    const model: LLM = {
      $type$: 'LLM',
      name: options.name,
      filename: options.filename,
      // Map 'remote' to 'cloud' if provided, otherwise default to 'local'
      modelType: options.modelType === 'remote' ? 'cloud' : (options.modelType || 'local'),
      active: true,
      deleted: false,
      creator: options.creator || 'system',
      created: now,
      modified: now,
      createdAt: createdAt,
      lastUsed: createdAt,
      usageCount: 0,
      lastInitialized: 0,
      size: options.size || 0,
      
      // Include any optional properties if provided
      ...(options.architecture ? { architecture: options.architecture } : {}),
      ...(options.contextLength ? { contextLength: options.contextLength } : {}),
      ...(options.quantization ? { quantization: options.quantization } : {}),
      // Use the filtered capabilities
      capabilities: filteredCapabilities,
      ...(options.personId ? { personId: options.personId } : {}),
    };
    
    return model;
  }

  /**
   * Prepare a model for use by preloading it
   * @param modelIdHash The ID hash of the model to prepare
   * @returns A promise that resolves when the model is ready to use
   */
  public async prepareModel(modelIdHash: string): Promise<boolean> {
    try {
      console.log(`[LLMManager] Preparing model ${modelIdHash} for use`);
      
      // Check if the model is already loaded
      if (this.isModelLoaded(modelIdHash)) {
        console.log(`[LLMManager] Model ${modelIdHash} is already loaded, no preparation needed`);
        return true;
      }
      
      // Load the model
      await this.loadModel(modelIdHash);
      console.log(`[LLMManager] Successfully prepared model ${modelIdHash}`);
      return true;
    } catch (error) {
      console.error(`[LLMManager] Error preparing model ${modelIdHash}:`, error);
      return false;
    }
  }

  /**
   * Prepare all models by preloading them in the background
   * This is a non-blocking operation that initializes models
   * @returns A promise that resolves when all models are prepared
   */
  public async prepareAllModels(): Promise<boolean[]> {
    try {
      console.log(`[LLMManager] Preparing all models for use`);
      
      // Get all models
      const models = Array.from(this.models.values());
      console.log(`[LLMManager] Preparing ${models.length} models`);
      
      // Try to prepare each model (but don't fail the entire operation if one fails)
      const results = await Promise.all(
        models.map(async (model) => {
          try {
            // Calculate idHash directly to pass to prepareModel
            const idHash = await calculateIdHashOfObj(model) as SHA256IdHash<LLM>;
            return await this.prepareModel(idHash);
          } catch (error) {
            console.error(`[LLMManager] Error preparing model ${model.name}:`, error);
            return false;
          }
        })
      );
      
      console.log(`[LLMManager] Finished preparing models with results:`, results);
      return results;
    } catch (error) {
      console.error(`[LLMManager] Error preparing all models:`, error);
      return [];
    }
  }

  /**
   * Rebuild paths for all models
   * Called during initialization and after model imports
   */
  private async rebuildModel(model: LLM): Promise<void> {
    try {
      // Calculate ID hash for the model using the core utility
      const idHash = await calculateIdHashOfObj(model) as SHA256IdHash<LLM>;
      
      // Get the full absolute path via getStorageDir - not using direct string concatenation
      const { getStorageDir } = await import('@refinio/one.core/lib/system/expo/storage-base');
      const privateDir = await getStorageDir(STORAGE.PRIVATE);
      const modelsDir = `${privateDir}/models`;
      const modelPath = `${modelsDir}/${model.filename}`;
      
      // Store in paths map
      this.modelPaths.set(idHash, modelPath);
      
      console.log(`[LLMManager] Rebuilt path for model ${model.name} (${idHash}): ${modelPath}`);
    } catch (error) {
      console.error(`[LLMManager] Error rebuilding path for model ${model.name}:`, error);
    }
  }

  /**
   * List actual model files in the models directory
   * This is helpful for diagnosing issues with missing or corrupted model files
   */
  public async listModelFiles(): Promise<{path: string, size: number}[]> {
    try {
      const { getStorageDir, exists, makeDirectory, fileSize } = await import('@refinio/one.core/lib/system/expo/storage-base');
      const FileSystem = await import('expo-file-system');
      
      // Get the app's private storage directory
      const privateDir = await getStorageDir(STORAGE.PRIVATE);
      const modelsDir = `${privateDir}/models`;
      
      // Check if directory exists, create it if needed
      const dirExists = await exists(modelsDir);
      if (!dirExists) {
        console.log(`[LLMManager] Models directory doesn't exist, creating it: ${modelsDir}`);
        await makeDirectory(modelsDir, { intermediates: true });
        return []; // Empty directory, no models
      }
      
      console.log(`[LLMManager] Scanning models directory: ${modelsDir}`);
      
      // List files in the directory
      const files = await FileSystem.readDirectoryAsync(modelsDir);
      console.log(`[LLMManager] Found ${files.length} files in models directory`);
      
      // Get file info for each file
      const modelFiles = await Promise.all(
        files.map(async (filename) => {
          const path = `${modelsDir}/${filename}`;
          try {
            // Check if the file exists
            const fileExists = await exists(path);
            if (!fileExists) {
              console.warn(`[LLMManager] File ${path} reported by readDirectoryAsync but doesn't exist`);
              return { path, size: 0 };
            }
            
            // Get file size
            const size = await fileSize(path);
            console.log(`[LLMManager] Model file: ${filename}, size: ${size} bytes (${(size / (1024 * 1024)).toFixed(2)} MB)`);
            
            return { path, size };
          } catch (error) {
            console.error(`[LLMManager] Error getting info for file ${path}:`, error);
            return { path, size: 0 };
          }
        })
      );
      
      // Return only files that are likely to be model files (GGUF format)
      // Don't filter by size here, we want to see small files too in case of incomplete downloads
      return modelFiles.filter(file => file.path.toLowerCase().endsWith('.gguf'));
    } catch (error) {
      console.error(`[LLMManager] Error listing model files:`, error);
      return [];
    }
  }

  /**
   * Preload the Llama module
   * This is a convenience method that ensures the llama module is loaded
   * before trying to use any models
   */
  public async preloadModule(): Promise<void> {
    try {
      console.log('[LLMManager] Preloading Llama module');
      
      // Get the LlamaModel singleton to ensure it's initialized
      const llamaModel = LlamaModel.getInstance();
      console.log('[LLMManager] LlamaModel singleton accessed');
      
      // Check if module is available
      if (!llamaModel.isModuleAvailable()) {
        console.log('[LLMManager] Llama module not yet available, waiting for initialization');
      }
      
      console.log('[LLMManager] Llama module preloaded successfully');
    } catch (error) {
      console.error('[LLMManager] Error preloading Llama module:', error);
      // Don't throw - preloading is best-effort
    }
  }

  /**
   * Generate a completion using a model, loading it first if needed
   * This method provides a simple unified interface for AIAssistantModel to use
   * without needing to know about model loading details
   * 
   * @param modelIdHash The ID hash of the model to use
   * @param prompt The prompt text to complete
   * @param options Options for completion
   * @returns The generated completion text
   */
  public async completeWithModel(
    modelIdHash: string, 
    prompt: string, 
    options: {
      maxTokens?: number;
      temperature?: number;
      topP?: number;
      stopTokens?: string[];
      onProgress?: (progress: number) => void;
    } = {}
  ): Promise<string> {
    const startTime = Date.now();
    console.log(`[LLMManager] 🚀 completeWithModel START - model: ${modelIdHash.substring(0, 8)}..., prompt: ${prompt.length} chars`);
    
    // Remove all prompt validation
    console.log(`[LLMManager] Using prompt without validation`);
    
    try {
      // Get the LlamaModel singleton instance
      const llamaModel = LlamaModel.getInstance();
      
      // Only load model if needed
      const currentModelPath = llamaModel.getCurrentModelPath();
      const modelState = llamaModel.getActiveState();
      
      if (modelState !== 'ready' || !currentModelPath) {
        console.log(`[LLMManager] Model needs loading (state: ${modelState})`);
        const loadStartTime = Date.now();
        await this.loadModel(modelIdHash);
        console.log(`[LLMManager] ⏱️ Model load time: ${Date.now() - loadStartTime}ms`);
      } else {
        console.log(`[LLMManager] Model already ready, skipping load`);
      }
      
      // Mark the context as in use
      this.setContextInUse(modelIdHash, true);
      
      try {
        // Generate completion using LlamaModel directly
        console.log(`[LLMManager] Generating completion`);
        
        // Set completion options on the LlamaModel instance
        // Ensure LlamaModel instance exists and has completionOptions property
        if (!llamaModel || typeof llamaModel.completionOptions === 'undefined') {
          throw new Error('LlamaModel instance or completionOptions not available');
        }
        // Get default settings if not provided in options
        const settingsManager = LLMSettingsManager.getInstance();
        const localPersonId = await this.leuteModel.myMainIdentity();
        const globalSettings = await settingsManager.getGlobalSettings(localPersonId);
        
        llamaModel.completionOptions = {
          maxTokens: options.maxTokens || globalSettings.maxTokens || 2048,
          temperature: options.temperature || globalSettings.temperature || DEFAULT_LLM_SETTINGS.temperature,
          topP: options.topP || 0.9,
          stopSequences: options.stopTokens || ['\n\n']
        };
        
        // Listen to progress events if callback provided
        let progressListener: any;
        if (options.onProgress) {
          progressListener = llamaModel.onTokenGenerated.listen((event) => {
            console.log(`[LLMManager] Progress event received: ${event.progress}%`);
            options.onProgress!(event.progress);
          });
        }
        
        try {
          // Use LlamaModel's complete method directly with options
          const completion = await llamaModel.complete(prompt, {
            max_tokens: options.maxTokens,
            temperature: options.temperature,
            top_p: options.topP,
            stop: options.stopTokens
          });
          
          if (!completion) {
            console.error(`[LLMManager] Received empty completion from model ${modelIdHash}`);
            throw new Error('Empty completion from model');
          }
          
          const totalTime = Date.now() - startTime;
          console.log(`[LLMManager] ✅ completeWithModel SUCCESS - Total time: ${totalTime}ms, Response: ${completion.length} chars`);
          return completion;
        } finally {
          // Clean up progress listener
          if (progressListener) {
            progressListener();
          }
        }
      } finally {
        // Always mark the context as no longer in use
        this.setContextInUse(modelIdHash, false);
      }
    } catch (error) {
      console.error(`[LLMManager] Error completing with model ${modelIdHash}:`, error);
      
      // Check for context-specific errors that indicate the context is invalid
      if (error instanceof Error && 
          (error.message.includes('context') || error.message.includes('Context'))) {
        console.log(`[LLMManager] Detected context error, clearing cached context for ${modelIdHash}`);
        this.modelContexts.delete(modelIdHash);
        
        // Emit an event to notify of model unload due to error
        this.onModelUnloaded.emit(modelIdHash);
      }
      
      // Just re-throw the error - let the caller handle it
      throw error;
    }
  }

  /**
   * Extract thinking content from an LLM response and store it as a CLOB attachment
   * @param modelId The model ID that generated the response
   * @param response The raw LLM response object 
   * @returns Hash of the stored thinking content CLOB, or null if no thinking content
   */
  public async extractAndStoreThinking(
    modelId: string,
    response: any  // This should match the NativeCompletionResult type but we'll keep it simple
  ): Promise<SHA256Hash<CLOB> | null> {
    try {
      // Get the model settings
      const modelSettings = this.findKnownModel(modelId);
      if (!modelSettings || !modelSettings.thinkingEnabled) {
        return null;
      }
      
      // Extract thinking/reasoning content if available
      let thinkingContent = '';
      let thinkingType: 'thinking' | 'reasoning' = 'thinking';
      
      // Check for reasoning_content from LLM
      if (response.reasoning_content && typeof response.reasoning_content === 'string') {
        thinkingContent = response.reasoning_content;
        thinkingType = 'reasoning';
      } 
      // If no reasoning_content but model has thinking extraction enabled, try to extract from text
      else if (modelSettings.thinkingEnabled && response.text) {
        // Extract thinking content using regex patterns based on model's format
        thinkingContent = this.extractThinkingFromText(response.text, modelSettings.reasoningFormat);
      }
      
      // If no thinking content was found, return null
      if (!thinkingContent) {
        console.log('[LLMManager] No thinking content found in response');
        return null;
      }
      
      console.log(`[LLMManager] Extracted thinking content (${thinkingContent.length} chars)`);
      
      // Store as CLOB with appropriate metadata
      const result = await storeThinkingAsClob(
        thinkingContent,
        thinkingType,
        0,  // partIndex - could be incremented for multi-part thinking
        {
          modelId,
          timestamp: Date.now(),
          responseLength: response.text?.length || 0
        }
      );
      
      // Update the model settings with the latest thinking hash if available
      if (modelSettings && result && result.hash) {
        console.log(`[LLMManager] Updating model settings with thinking hash: ${result.hash}`);
        modelSettings.lastThinkingHash = result.hash.toString();
        // Note: updateModelInSettings doesn't exist in this class, so we'll just log it
        console.log('[LLMManager] Would update model settings with new thinking hash');
      }
      
      console.log(`[LLMManager] Successfully stored thinking content as CLOB: ${result.hash}`);
      return result.hash;
    } catch (error) {
      console.error('[LLMManager] Error extracting and storing thinking:', error);
      return null;
    }
  }

  /**
   * Extract thinking content from text based on model format
   * @param text The raw text to extract thinking from
   * @param format Optional format identifier for model-specific extraction
   */
  private extractThinkingFromText(text: string, format?: string): string {
    if (!text) return '';
    
    try {
      // Default to generic extraction if no format specified
      if (!format) {
        // Standard <think>...</think> tags
        const thinkTagMatch = /<think>([\s\S]*?)<\/think>/g.exec(text);
        if (thinkTagMatch && thinkTagMatch[1]) {
          return thinkTagMatch[1].trim();
        }
        
        // Alternative formats
        const markdownThink = /```think([\s\S]*?)```/g.exec(text);
        if (markdownThink && markdownThink[1]) {
          return markdownThink[1].trim();
        }
        
        const bracketThink = /\[thinking\]([\s\S]*?)\[\/thinking\]/g.exec(text);
        if (bracketThink && bracketThink[1]) {
          return bracketThink[1].trim();
        }
        
        // Special command format
        const commandThink = /<\|START_THINKING\|>([\s\S]*?)<\|END_THINKING\|>/g.exec(text);
        if (commandThink && commandThink[1]) {
          return commandThink[1].trim();
        }
        
        // If we still haven't found anything, check for inline thinking tags which may be in the text
        const inlineThink = text.match(/<think>([^<]+)<\/think>/);
        if (inlineThink && inlineThink[1]) {
          return inlineThink[1].trim();
        }
        
        return '';
      }
      
      // Format-specific extraction
      switch (format.toLowerCase()) {
        case 'deepseek':
        case 'deepseek_r1':
          const deepseekMatch = /<think>([\s\S]*?)<\/think>/g.exec(text);
          return deepseekMatch && deepseekMatch[1] ? deepseekMatch[1].trim() : '';
          
        case 'command_r7b':
          const commandMatch = /<\|START_THINKING\|>([\s\S]*?)<\|END_THINKING\|>/g.exec(text);
          return commandMatch && commandMatch[1] ? commandMatch[1].trim() : '';
          
        default:
          // Default to generic extraction
          return this.extractThinkingFromText(text);
      }
    } catch (error) {
      console.error('[LLMManager] Error in extractThinkingFromText:', error);
      return '';
    }
  }

  /**
   * Generate a chat style completion using the model's built-in chat template.
   * This should be preferred over the raw `completeWithModel` when talking to
   * instruction-tuned models because it lets llama.rn apply the tokenizer
   * chat-template that is bundled with the model.
   */
  public async chatCompletionWithModel(
    modelIdHash: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options: {
      maxTokens?: number;
      temperature?: number;
      topP?: number;
      stopTokens?: string[];
      onProgress?: (progress: number) => void;
    } = {}
  ): Promise<string> {
    const startTime = Date.now();
    console.log(`[LLMManager] 🚀 chatCompletionWithModel START – model: ${modelIdHash.substring(0,8)}… , messages: ${messages.length}`);
    
    // Log input messages
    console.log(`[LLMManager] === INPUT TO LLM ===`);
    messages.forEach((msg, index) => {
      const preview = msg.content.length > 300 ? msg.content.substring(0, 300) + '...' : msg.content;
      console.log(`[LLMManager] [${index}] ${msg.role.toUpperCase()}: ${preview}`);
    });
    console.log(`[LLMManager] === END INPUT ===`);

    try {
      const llamaModel = LlamaModel.getInstance();
      const currentPath = llamaModel.getCurrentModelPath();
      const state = llamaModel.getActiveState();
      if (state !== 'ready' || !currentPath) {
        await this.loadModel(modelIdHash);
      }

      // mark context busy
      this.setContextInUse(modelIdHash, true);
      let progressListener: any;
      try {
        if (options.onProgress) {
          progressListener = llamaModel.onTokenGenerated.listen((ev) => {
            options.onProgress!(ev.progress);
          });
        }

        const response = await llamaModel.chatCompletion(messages, {
          max_tokens: options.maxTokens,
          temperature: options.temperature,
          top_p: options.topP,
          stop: options.stopTokens ?? []
        });

        console.log(`[LLMManager] ✅ chatCompletion SUCCESS – ${(Date.now()-startTime)}ms, ${response.length} chars`);
        
        // Log output
        console.log(`[LLMManager] === OUTPUT FROM LLM ===`);
        console.log(response);
        console.log(`[LLMManager] === END OUTPUT ===`);
        return typeof response === 'string' ? response : String(response);
      } finally {
        if (progressListener) progressListener();
        this.setContextInUse(modelIdHash, false);
      }
    } catch (err) {
      console.error(`[LLMManager] Error in chatCompletionWithModel for ${modelIdHash}:`, err);
      throw err;
    }
  }
}

/**
 * Completion parameters that can be passed to completeWithModel
 */
export interface CompletionOptions {
  maxTokens?: number;
  temperature?: number; 
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  stopTokens?: string[];
  systemPrompt?: string; // Add support for system prompt
  onProgress?: (progress: number) => void; // Add progress callback
}

// Notify observers when the set of LLM objects in storage changes (add/remove/update)
export const onModelsChanged = new OEvent<() => void>();