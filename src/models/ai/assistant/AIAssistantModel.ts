/**
 * @author Michael Hasenstein <hasenstein@yahoo.com>
 * @copyright REFINIO GmbH 2018
 * @license CC-BY-NC-SA-2.5; portions MIT License
 * @version 0.0.1
 */

import { SHA256IdHash, ensureIdHash } from '@refinio/one.core/lib/util/type-checks';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import type { Profile } from '@refinio/one.models/lib/recipes/Leute/Profile.js';
import type TopicModel from '@refinio/one.models/lib/models/Chat/TopicModel.js';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type { LLM } from '../../../types/llm';

// Import our refactored components
import { AITopicManager } from './aiTopicManager';
import { AIMessageProcessor } from './aiMessageProcessor';
import { AIPromptBuilder } from './aiPromptBuilder';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import { AIMessageListener } from './messageListener';
import { AITaskManager } from './aiTaskManager';
import { AIContactManager } from './aiContactManager';

// Import app model type
import { AppModel } from "../../AppModel";
import { getPersonIdForLLM as ensurePersonForLLM } from '../../../utils/contactUtils';
import { onModelsChanged } from '../LLMManager';
import { MCPManager } from '../../mcp/MCPManager';

// Define the TopicModel interface for TypeScript compatibility
interface TopicModelInterface {
  createGroupTopic: (name: string, topicId?: string, channelOwner?: string) => Promise<any>;
  topics: {
    queryById: (id: string) => Promise<any>;
  };
  channelManager?: any;
  enterTopicRoom: (topicId: string) => Promise<any>;
}

// Extend AppModel interface to include llmManager property
interface ExtendedAppModel extends AppModel {
  llmManager: any;
}

/**
 * AI Assistant Model
 * 
 * This class serves as the interface between LLM capabilities and the chat system.
 * It coordinates the component classes that handle specific aspects of functionality.
 */
export default class AIAssistantModel {
  // Core components
  private topicManager!: AITopicManager;
  private messageProcessor!: AIMessageProcessor;
  private promptBuilder!: AIPromptBuilder;
  private messageListener!: AIMessageListener;
  private taskManager!: AITaskManager;
  private contactManager!: AIContactManager;
  private mcpManager!: MCPManager;
  
  // Core dependencies
  private personId: SHA256IdHash<Person>;
  private profileId: SHA256IdHash<Profile>;
  private leuteModel!: LeuteModel;
  private topicModel!: TopicModelInterface;
  private channelManager!: ChannelManager;
  private appModel!: ExtendedAppModel;
  private llmManager: any;
  
  // State
  private isInitialized = false;
  private availableLLMModels: Array<{
    id: string;
    name: string;
    displayName?: string;
    personId: SHA256IdHash<Person>
  }> = [];
  
  // Events
  private onAITopicsChanged: OEvent<() => void>;
  public readonly onGenerationProgress = new OEvent<(topicId: string, progress: number) => void>();

  /**
   * Constructor for AIAssistantModel
   */
  constructor(
    instanceOwner: SHA256IdHash<Person>,
    profileId: SHA256IdHash<Profile>
  ) {
    console.log('[AIAssistantModel] 🔧 Constructor called');
    console.log('[AIAssistantModel] Constructor params:', { instanceOwner, profileId });
    this.personId = instanceOwner;
    this.profileId = profileId;
    this.onAITopicsChanged = new OEvent<() => void>();
    console.log(`[AIAssistantModel] ✅ Constructor completed with personId=${instanceOwner} and profileId=${profileId}`);
  }

  /**
   * Sets the AppModel instance.
   * Called by AppModel before init to provide the current reference.
   */
  setAppModel(appModel: ExtendedAppModel) {
    console.log('[AIAssistantModel] Setting AppModel reference');
    this.appModel = appModel;
    
    // Now we need to set leuteModel from appModel since we don't get it in constructor
    if (appModel.leuteModel) {
      console.log('[AIAssistantModel] Setting leuteModel from appModel');
      this.leuteModel = appModel.leuteModel;
    } else {
      console.warn('[AIAssistantModel] AppModel does not have leuteModel property');
    }
  }

  /**
   * Get the AITaskManager instance
   * @returns The task manager for dynamic task associations
   */
  getTaskManager(): AITaskManager {
    return this.taskManager;
  }

  /**
   * Initialize the AIAssistantModel
   * This is a public method called by AppModel
   * 
   * @returns {Promise<void>} A promise that resolves when initialization is complete
   * @throws {Error} If initialization fails
   */
  public async init(): Promise<void> {
    console.log('[AIAssistantModel] 🚀 Starting initialization...');
    console.log('[AIAssistantModel] PersonId:', this.personId);
    console.log('[AIAssistantModel] ProfileId:', this.profileId);
    
    if (this.isInitialized) {
      console.warn('[AIAssistantModel] Already initialized.');
      return;
    }
    
    // Ensure dependencies are set - fail fast with clear errors
    if (!this.appModel) {
      throw new Error('[AIAssistantModel] Initialization failed: appModel not set via setAppModel()');
    }
    
    // Explicitly verify that LeuteModel is ready and available first
    if (!this.leuteModel) {
      throw new Error('[AIAssistantModel] Initialization failed: leuteModel is unavailable');
    }
    
    // Verify LeuteModel is fully initialized by checking for critical functionality
    try {
      const me = await this.leuteModel.me();
      if (!me) {
        throw new Error('[AIAssistantModel] LeuteModel.me() returned null or undefined');
      }
      
      const mainIdentity = await this.leuteModel.myMainIdentity();
      if (!mainIdentity) {
        throw new Error('[AIAssistantModel] LeuteModel.myMainIdentity() returned null or undefined');
      }
      
      console.log(`[AIAssistantModel] LeuteModel verified with identity: ${mainIdentity}`);
    } catch (error) {
      console.error('[AIAssistantModel] LeuteModel verification failed:', error);
      throw new Error(`[AIAssistantModel] LeuteModel not fully initialized: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Critical: Set topicModel reference from appModel
    this.topicModel = this.appModel.topicModel;
    if (!this.topicModel) {
      throw new Error('[AIAssistantModel] Initialization failed: topicModel is undefined in appModel');
    }
    
    // Set channel manager if available
    this.channelManager = (this.appModel as any)._channelManager;
    if (!this.channelManager) {
      console.warn('[AIAssistantModel] channelManager is undefined in appModel, some features may not work');
    }
    
    // Get LLMManager from AppModel instead of creating our own
    this.llmManager = this.appModel.llmManager;
    if (!this.llmManager) {
      throw new Error('[AIAssistantModel] Initialization failed: LLMManager not available in AppModel');
    }
    console.log('[AIAssistantModel] Using LLMManager from AppModel');
    
    // Initialize our component architecture
    await this.initializeComponents();
    
    // Refresh available models whenever LLMManager reports a change (no contact creation on updates)
    this.llmManager.onModelsUpdated.listen(() => {
      this.updateAvailableLLMModels(false).catch(err => console.error('[AIAssistantModel] Error refreshing models after model update:', err));
    });

    // Populate the model list once more now that the listener is installed –
    // the initial onModelsUpdated event from LLMManager may have fired before
    // we attached the handler during startup, leaving the list empty.
    await this.updateAvailableLLMModels(false).catch(err => console.error('[AIAssistantModel] Error running initial post-listener model refresh:', err));

    // Start the message listener now that everything is initialized
    if (this.messageListener) {
      console.log('[AIAssistantModel] Starting message listener...');
      this.messageListener.start();
    } else {
      console.error('[AIAssistantModel] Message listener not created!');
    }
    
    console.log('[AIAssistantModel] Initialization complete');
  }

  /**
   * Initialize the component architecture
   * @private
   */
  private async initializeComponents(): Promise<void> {
    try {
      console.log('[AIAssistantModel] Initializing components');
      
      // 1. Create the AIContactManager
      this.contactManager = new AIContactManager(this.leuteModel);
      
      // 2. Create and initialize the MCPManager
      this.mcpManager = new MCPManager(this.personId);
      if (this.appModel.transportManager && this.appModel.quicModel) {
        this.mcpManager.setDependencies(
          this.appModel.transportManager,
          this.appModel.quicModel,
          this.leuteModel
        );
        await this.mcpManager.init();
        console.log('[AIAssistantModel] MCPManager initialized');
      } else {
        console.warn('[AIAssistantModel] MCPManager dependencies not available');
      }
      
      // 3. Create the AITopicManager
      this.topicManager = new AITopicManager(
        this.topicModel,
        this.llmManager,
        this.channelManager,
        this.leuteModel,
        this.personId,
        this // Pass 'this' as aiaModel reference
      );
      
      // 4. Create the AIPromptBuilder
      this.promptBuilder = new AIPromptBuilder(
        this.channelManager,
        this.llmManager,
        this.leuteModel,
        this.topicManager
      );
      
      // 5. Create the AIMessageProcessor
      this.messageProcessor = new AIMessageProcessor(
        this.channelManager,
        this.llmManager,
        this.leuteModel,
        this.personId,
        this.topicManager,
        this.promptBuilder,
        this.availableLLMModels
      );
      
      // Connect progress events
      this.messageProcessor.onGenerationProgress = (topicId, progress) => {
        console.log(`[AIAssistantModel] Forwarding progress event: topic=${topicId}, progress=${progress}%`);
        this.onGenerationProgress.emit(topicId, progress);
      };
      
      // 6. Create the AITaskManager
      this.taskManager = new AITaskManager(
        this.channelManager,
        this.personId
      );
      
      // 7. Connect circular references
      this.promptBuilder.setMessageProcessor(this.messageProcessor);
      this.messageProcessor.setTaskManager(this.taskManager);
      
      // 8. Create the AIMessageListener
      this.messageListener = new AIMessageListener(this.channelManager, this);
      
      // 9. Set up event forwarding
      // Forward topic loading state changes to listeners
      this.topicManager.onTopicLoadingStateChanged.listen((topicId, isLoading) => {
        // Any component that needs to know about topic loading state changes
        console.log(`[AIAssistantModel] Topic ${topicId} loading state changed: ${isLoading}`);
      });
      
      // Initialize AI topics FIRST before marking as initialized
      // This ensures topic mappings are created before we start listening
      try {
        // Temporarily set initialized flag for ensureTopicsForModels to work
        this.isInitialized = true;
        await this.initializeAITopics();
        
        // Initialize the subject channel for knowledge management
        await this.taskManager.initializeSubjectChannel();
        console.log('[AIAssistantModel] Subject channel initialized');
      } catch (error) {
        this.isInitialized = false;
        throw error;
      }
      
      // Log the topic model mappings
      console.log(`[AIAssistantModel] 📊 Topic model mappings:`, this.topicManager.topicModelMap.size);
      this.topicManager.topicModelMap.forEach((modelId, topicId) => {
        console.log(`[AIAssistantModel] 🎯 Topic ${topicId} -> Model ${modelId}`);
      });
      
      // Also log display names
      console.log(`[AIAssistantModel] 📝 Topic display names:`, this.topicManager.topicDisplayNames);
      Object.entries(this.topicManager.topicDisplayNames).forEach(([topicId, name]) => {
        console.log(`[AIAssistantModel] 📝 Topic ${topicId} display name: ${name}`);
      });
      
      // 10. Start the message listener
      this.messageListener.start();
      console.log('[AIAssistantModel] Message listener started');
      
      console.log('[AIAssistantModel] Components initialized successfully');
    } catch (error) {
      console.error('[AIAssistantModel] Error initializing components:', error);
      // Reset initialized state on error
      this.isInitialized = false;
      throw error;
    }
  }



  /**
   * Initialize AI topics by creating contacts and topics for available LLMs.
   * Uses this.appModel internally.
   */
  private async initializeAITopics(): Promise<void> {
    console.log('[AIAssistantModel] Initializing AI topics');
    
    try {
      // Create contacts for models during initialization
      const models = await this.updateAvailableLLMModels(true);
      console.log(`[AIAssistantModel] Found ${models.length} models to initialize AI topics for`);
      
      // Delegate to AITopicManager for actual creation
      // This would normally be handled within AITopicManager in a method like initializeAITopics
      // but for now we'll delegate to next steps like ensureTopicsForModels
      
      // Ensure topics exist for all models
      await this.ensureTopicsForModels();
      
      console.log(`[AIAssistantModel] AI topics initialization complete`);
    } catch (error) {
      console.error('[AIAssistantModel] Error initializing AI topics:', error);
      throw error;
    }
  }

  /**
   * Updates available LLM models list for use throughout the component
   * @param createContacts Whether to create contacts for models (default: false)
   * @returns Promise<LLM[]> The list of models for reuse
   */
  private async updateAvailableLLMModels(createContacts: boolean = false): Promise<LLM[]> {
    console.log('[AIAssistantModel] Updating available LLM models');
    try {
      const models = await this.llmManager.listModels();
      
      // Clear existing models
      this.availableLLMModels = [];
      
      // Process each model
      for (const model of models) {
        if (!model.name) continue;
        
        try {
          // Always use getModelIdHash to ensure consistency with ONE core helpers
          const modelId = await this.llmManager.getModelIdHash(model.name);
          console.log(`[AIAssistantModel] Model ${model.name} has ID hash: ${modelId}`);
          
          // Ensure a Person exists for this LLM (creates one if missing)
          const personId = model.personId ?? await ensurePersonForLLM(model.name);
          if (!personId) {
            console.error(`[AIAssistantModel] Could not create/find personId for model ${model.name}`);
            continue; // Skip models we cannot map to a Person
          }
          
          this.availableLLMModels.push({
            id: modelId,
            name: model.name,
            displayName: (model as any).displayName || model.name,
            personId: personId
          });
          
        } catch (modelError) {
          console.error(`[AIAssistantModel] Error processing model ${model.name}:`, modelError);
        }
      }
      
      console.log(`[AIAssistantModel] Updated available LLM models: ${this.availableLLMModels.length} models`);
      
      // Log the models for debugging
      this.availableLLMModels.forEach(model => {
        console.log(`[AIAssistantModel] Model in availableLLMModels: name=${model.name}, id=${model.id}, personId=${model.personId}`);
      });
      
      // Create contacts for all models ONLY when explicitly requested
      if (createContacts && this.contactManager && models.length > 0) {
        console.log('[AIAssistantModel] Creating contacts for LLM models');
        try {
          const contactsCreated = await this.contactManager.ensureContactsForModels(models);
          console.log(`[AIAssistantModel] ✅ Created/verified ${contactsCreated} contacts for LLM models`);
        } catch (contactError) {
          console.error('[AIAssistantModel] Error creating contacts for models:', contactError);
        }
      } else if (createContacts) {
        console.log(`[AIAssistantModel] ❌ Skipping contact creation: contactManager=${!!this.contactManager}, models.length=${models.length}`);
      }
      
      // Update the message processor's models
      this.messageProcessor.setAvailableLLMModels(this.availableLLMModels);
      
      // Emit an event if we have listeners
      if (this.onAITopicsChanged) {
        this.onAITopicsChanged.emit();
      }
      
      // Return the models for reuse
      return models;
    } catch (error) {
      console.error('[AIAssistantModel] Error updating available LLM models:', error);
      return [];
    }
  }

  /**
   * Ensure topics exist for all AI models
   * This method now delegates to the centralized ensureTopicsForModels which creates proper 1-to-1 topics
   * @returns The number of topics ensured
   */
  public async ensureTopicsForModels(): Promise<number> {
    console.log('[AIAssistantModel] Ensuring topics exist for all models');
    
    if (!this.isInitialized) {
      console.warn('[AIAssistantModel] Cannot ensure topics - not initialized');
      return 0;
    }
    
    try {
      // Get all models
      const models = await this.llmManager.listModels();
      console.log(`[AIAssistantModel] Found ${models.length} models to ensure topics for`);
      
      // Use the centralized topic creation which creates proper 1-to-1 topics
      const { ensureTopicsForModels } = await import('../../ensureContactsForModels');
      const topicCount = await ensureTopicsForModels(
        models,
        {
          leuteModel: this.leuteModel,
          topicModel: this.topicModel,
          channelManager: this.channelManager,
          aiAssistantModel: this
        },
        this.llmManager
      );
      
      console.log(`[AIAssistantModel] Topic creation complete: ${topicCount} topics created`);
      
      // The topic model mappings are added during topic creation in getOrCreateTopicForLLM
      // So we don't need to manually add them here anymore
      
      if (this.onAITopicsChanged) {
        this.onAITopicsChanged.emit();
      }
      
      return topicCount;
    } catch (error) {
      console.error('[AIAssistantModel] Error in ensureTopicsForModels:', error);
      return 0;
    }
  }

  /**
   * Public methods to delegate to AITopicManager
   */
  
  public getTopicDisplayName(topicId: string): string | undefined {
    const displayName = this.topicManager.getTopicDisplayName(topicId);
    console.log(`[AIAssistantModel] Getting display name for ${topicId}: ${displayName}`);
    return displayName;
  }
  
  public setTopicDisplayName(topicId: string, name: string): void {
    this.topicManager.setTopicDisplayName(topicId, name);
  }
  
  public getAllAITopicIds(): string[] {
    return this.topicManager.getAllAITopicIds();
  }
  
  public isTopicReady(topicId: string): boolean {
    if (this.topicManager.isTopicLoading(topicId)) { 
      return false; 
    }
    
    // Check if the model is loaded - delegate to LLMManager
    const modelIdHash = this.topicManager.topicModelMap.get(topicId);
    if (!modelIdHash) {
      console.log(`[AIAssistantModel] Cannot determine readiness for topic ${topicId} - no model mapping found`);
      return false;
    }
    
    try {
      return this.llmManager.isModelLoaded(modelIdHash);
    } catch (error) {
      console.error(`[AIAssistantModel] Error checking if topic ${topicId} is ready:`, error);
      return false;
    }
  }

  /**
   * Public methods to delegate to AIMessageProcessor
   */
  
  public async handleTopicMessage(topicId: string, message: any): Promise<void> {
    return this.messageProcessor.handleTopicMessage(topicId, message);
  }
  
  public isAIContact(profileIdOrPersonId: string | SHA256IdHash<Profile> | SHA256IdHash<Person>): boolean {
    return this.messageProcessor.isAIContact(profileIdOrPersonId);
  }
  
  public isAIPersonId(personId: string | SHA256IdHash<Person>): boolean {
    return this.messageProcessor.isAIContact(personId);
  }
  
  public isAIMessage(message: any): boolean {
    return this.messageProcessor.isAIMessage(message);
  }

  /**
   * Check if a topic is an AI topic (has an AI model mapped to it)
   * @param topicId The topic ID to check
   * @returns true if the topic is an AI topic
   */
  public isAITopic(topicId: string): boolean {
    if (!this.topicManager) {
      console.warn('[AIAssistantModel] topicManager not initialized');
      return false;
    }
    return this.topicManager.topicModelMap.has(topicId);
  }

  /**
   * Check if the AI assistant model is ready
   * @returns true if the model is initialized and ready for use
   */
  public isReady(): boolean {
    const initialized = this.isInitialized;
    const hasLLMManager = !!this.llmManager;
    
    console.log(`[AIAssistantModel] isReady check: initialized=${initialized}, llmManager=${hasLLMManager}`);
    
    if (this.llmManager) {
      // Check hasLoadedModels but don't make it a requirement for readiness
      const hasLoadedModels = this.llmManager.hasLoadedModels();
      console.log(`[AIAssistantModel] isReady check: hasLoadedModels=${hasLoadedModels}`);
    }
    
    // Only require initialized and hasLLMManager to be true
    return initialized && hasLLMManager;
  }

  /**
   * Get the model's initialization status with detailed information
   * @returns An object with status information about the model
   */
  public getStatus(): {
    initialized: boolean;
    llmManagerAvailable: boolean;
    topicsReady: boolean;
    topicCount: number;
    loadingTopicCount: number;
    modelsLoaded: boolean
  } {
    // Get basic status
    const initialized = this.isInitialized;
    let llmManagerAvailable = false;
    const topicCount = this.topicManager?.topicModelMap.size || 0;
    let modelsLoaded = false;
    
    let loadingTopicCount = 0;
    
    // Check for loading topics
    if (this.topicManager?.topicLoadingState) {
      for (const [_, isLoading] of this.topicManager.topicLoadingState.entries()) {
        if (isLoading) loadingTopicCount++;
      }
    }
    
    // Check if LLM manager has any models loaded
    try {
      llmManagerAvailable = !!this.llmManager;
      if (llmManagerAvailable) {
        // Use the public hasLoadedModels method to safely check model loading status
        modelsLoaded = this.llmManager.hasLoadedModels();
      }
    } catch (e) {
      console.warn('[AIAssistantModel] Error checking models status:', e);
      llmManagerAvailable = false;
      modelsLoaded = false;
    }
    
    // Overall topics readiness
    const topicsReady = topicCount > 0 && loadingTopicCount === 0;
    
    return {
      initialized,
      llmManagerAvailable,
      topicsReady,
      topicCount,
      loadingTopicCount,
      modelsLoaded
    };
  }

  /**
   * Get the LLMManager instance managed by this AIAssistantModel
   * @returns The LLMManager instance
   */
  public getLLMManager(): any {
    if (!this.llmManager) {
      throw new Error('[AIAssistantModel] LLMManager not available - call init() first');
    }
    return this.llmManager;
  }

  /**
   * Manually refresh topic mappings - useful for debugging or after model changes
   */
  public async refreshTopicMappings(): Promise<void> {
    console.log('[AIAssistantModel] Manually refreshing topic mappings...');
    if (!this.isInitialized) {
      console.warn('[AIAssistantModel] Cannot refresh mappings - not initialized');
      return;
    }
    
    await this.ensureTopicsForModels();
    
    console.log(`[AIAssistantModel] Topic mappings after refresh:`, this.topicManager.topicModelMap.size);
    this.topicManager.topicModelMap.forEach((modelId, topicId) => {
      console.log(`[AIAssistantModel] Topic ${topicId} -> Model ${modelId}`);
    });
  }

  /**
   * Get the available LLM models with their person IDs
   * @returns Array of available LLM models
   */
  public getAvailableLLMModels(): Array<{ id: string; name: string; displayName?: string; personId: SHA256IdHash<Person> }> {
    return this.availableLLMModels;
  }

  /**
   * Get the MCPManager instance for MCP tool access
   * @returns The MCPManager instance
   */
  public getMCPManager(): MCPManager {
    if (!this.mcpManager) {
      throw new Error('[AIAssistantModel] MCPManager not available - initialization may have failed');
    }
    return this.mcpManager;
  }

  /**
   * Get available MCP tools that the AI can use
   * @returns Promise resolving to array of MCP tools
   */
  public async getAvailableMCPTools(): Promise<any[]> {
    if (!this.mcpManager) {
      console.warn('[AIAssistantModel] MCPManager not available');
      return [];
    }
    
    try {
      return await this.mcpManager.discoverTools();
    } catch (error) {
      console.error('[AIAssistantModel] Error getting MCP tools:', error);
      return [];
    }
  }

  /**
   * Execute an MCP tool on behalf of the AI
   * @param toolId The tool ID to execute
   * @param params The parameters for the tool
   * @returns Promise resolving to the tool execution result
   */
  public async executeMCPTool(toolId: string, params: any): Promise<any> {
    if (!this.mcpManager) {
      throw new Error('[AIAssistantModel] MCPManager not available');
    }
    
    console.log(`[AIAssistantModel] AI executing MCP tool: ${toolId}`);
    
    try {
      return await this.mcpManager.executeTool(toolId, params);
    } catch (error) {
      console.error(`[AIAssistantModel] Error executing MCP tool ${toolId}:`, error);
      throw error;
    }
  }

  /**
   * Connect to an MCP server to make its tools available
   * @param serverId Server identifier
   * @param command Command to run the MCP server
   * @param args Arguments for the command
   */
  public async connectToMCPServer(serverId: string, command: string, args: string[] = []): Promise<void> {
    if (!this.mcpManager) {
      throw new Error('[AIAssistantModel] MCPManager not available');
    }
    
    console.log(`[AIAssistantModel] Connecting to MCP server: ${serverId}`);
    
    try {
      await this.mcpManager.connectToMCPServer(serverId, command, args);
      console.log(`[AIAssistantModel] Successfully connected to MCP server: ${serverId}`);
    } catch (error) {
      console.error(`[AIAssistantModel] Error connecting to MCP server ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * Check if a topic has AI participants
   * @param topicId The topic ID to check
   * @returns Promise that resolves to true if the topic has AI participants
   */
  public async checkTopicHasAIParticipant(topicId: string): Promise<boolean> {
    // First check if this is a known AI topic by checking the topicModelMap
    const modelId = this.topicManager.topicModelMap.get(topicId);
    if (modelId) {
      console.log(`[AIAssistantModel] Topic ${topicId} is mapped to AI model ${modelId}`);
      return true;
    }
    
    // If not in topicModelMap, check participants as a fallback
    try {
      const room = await this.topicModel.enterTopicRoom(topicId);
      if (room && typeof (room as any).getParticipants === 'function') {
        const participants = await (room as any).getParticipants();
        if (participants && Array.isArray(participants)) {
          console.log(`[AIAssistantModel] Topic ${topicId} has ${participants.length} participants`);
          
          // Check each participant to see if any are AI models
          for (const participantId of participants) {
            if (this.isAIContact(participantId)) {
              console.log(`[AIAssistantModel] Found AI participant ${participantId} in topic ${topicId}`);
              return true;
            }
          }
        }
      }
    } catch (error) {
      console.warn(`[AIAssistantModel] Could not check participants for topic ${topicId}:`, error);
    }
    
    console.log(`[AIAssistantModel] No AI participants found in topic ${topicId}`);
    return false;
  }

  /**
   * Preload the AI model for a specific topic
   * This ensures the model is loaded before the user sends their first message
   * @param topicId The topic ID
   * @returns Promise that resolves when the model is loaded or rejects if loading fails
   */
  public async preloadModelForTopic(topicId: string): Promise<void> {
    console.log(`[AIAssistantModel] Preloading model for topic ${topicId}`);
    
    const modelId = this.topicManager.getModelIdForTopic(topicId);
    if (!modelId) {
      console.log(`[AIAssistantModel] No model mapped for topic ${topicId}, nothing to preload`);
      return;
    }
    
    console.log(`[AIAssistantModel] Topic ${topicId} maps to model ${modelId}`);
    
    try {
      // Check if model is already loaded
      const isLoaded = this.llmManager.isModelLoaded(modelId);
      console.log(`[AIAssistantModel] Model ${modelId} loaded status: ${isLoaded}`);
      
      if (!isLoaded) {
        console.log(`[AIAssistantModel] Loading model ${modelId}...`);
        const context = await this.llmManager.loadModel(modelId);
        
        if (!context) {
          throw new Error(`Failed to load model ${modelId}`);
        }
        
        console.log(`[AIAssistantModel] Model ${modelId} loaded successfully`);
      } else {
        console.log(`[AIAssistantModel] Model ${modelId} already loaded`);
      }
    } catch (error) {
      console.error(`[AIAssistantModel] Failed to preload model for topic ${topicId}:`, error);
      throw error;
    }
  }
  
  /**
   * Stop the AI Assistant and clean up resources
   */
  public async stop(): Promise<void> {
    console.log('[AIAssistantModel] Stopping AI Assistant...');
    
    try {
      // Stop the message listener first to prevent new messages
      if (this.messageListener) {
        this.messageListener.stop();
        console.log('[AIAssistantModel] Message listener stopped');
      }
      
      // Stop any ongoing message processing
      if (this.messageProcessor) {
        // The message processor might have queued messages
        // We should wait for them to complete or cancel them
        console.log('[AIAssistantModel] Stopping message processor...');
        // TODO: Add proper queue cancellation if needed
      }
      
      // Clear any timers or intervals
      if (this.taskManager) {
        // TODO: Stop any scheduled tasks
        console.log('[AIAssistantModel] Task manager cleaned up');
      }
      
      // Shutdown MCPManager
      if (this.mcpManager) {
        console.log('[AIAssistantModel] Shutting down MCPManager...');
        try {
          await this.mcpManager.shutdown();
          console.log('[AIAssistantModel] MCPManager shutdown complete');
        } catch (error) {
          console.error('[AIAssistantModel] Error shutting down MCPManager:', error);
        }
      }
      
      // Unload all LLM models via LLMManager
      if (this.llmManager && this.llmManager.unloadAllModels) {
        console.log('[AIAssistantModel] Unloading all LLM models...');
        try {
          await this.llmManager.unloadAllModels();
          console.log('[AIAssistantModel] All LLM models unloaded');
        } catch (error) {
          console.error('[AIAssistantModel] Error unloading LLM models:', error);
        }
      }
      
      // Destroy the LlamaModel singleton instance
      try {
        const { LlamaModel } = await import('../LlamaModel');
        if (LlamaModel && LlamaModel.destroyInstance) {
          console.log('[AIAssistantModel] Destroying LlamaModel singleton...');
          await LlamaModel.destroyInstance();
          console.log('[AIAssistantModel] LlamaModel singleton destroyed');
        }
      } catch (error) {
        console.error('[AIAssistantModel] Error destroying LlamaModel singleton:', error);
      }
      
      // Clear event listeners (OEvent doesn't have removeAllListeners)
      // Events will be cleared when new OEvent instances are created on re-init
      // Note: OEvent listeners are automatically cleaned up when the object is garbage collected
      
      this.isInitialized = false;
      console.log('[AIAssistantModel] AI Assistant stopped successfully');
    } catch (error) {
      console.error('[AIAssistantModel] Error during stop:', error);
      throw error;
    }
  }
} 