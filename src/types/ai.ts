import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';
import type { Recipe, RecipeRule, OneObjectTypeNames, BLOB, Person } from '@refinio/one.core/lib/recipes.js';
import type { VersionedObjectResult } from '@refinio/one.core/lib/storage-versioned-objects';
import type { Topic } from '@refinio/one.models/lib/recipes/ChatRecipes.js';
import type { Someone } from '@refinio/one.models/lib/recipes/Leute/Someone';
import type { LLM } from './llm';

/**
 * Type definitions for AI functionality that are not ONE objects
 * These are operational types used by the UI and business logic
 */

/**
 * Interface for managing LLM lifecycle
 */
export interface LLMManager {
    importFromUrl(url: string, knownModelId?: string): Promise<LLMSettings>;
    importFromFile(fileUri: string, metadata: Partial<LLM>): Promise<LLM>;
    deleteModel(modelId: string): Promise<void>;
    listModels(): Promise<LLM[]>;
    getModelPath(modelId: string): Promise<string>;
    getKnownModels(): LLMSettings[];
    findKnownModel(id: string): LLMSettings | undefined;
    validateAgainstKnown(metadata: VersionedObjectResult<LLM>): { valid: boolean; knownModel?: LLMSettings; issues: string[] };
}

/**
 * Settings for a Large Language Model
 */
export interface LLMSettings {
    $type$: 'LLMSettings';  // Type identifier for ONE object
    name: string;           // Name used as ID (matches llm.name)
    creator: string;        // Creator of the settings
    created: number;        // Creation timestamp
    modified: number;       // Last modification timestamp
    createdAt: string;      // Human-readable creation date for audit purposes
    lastUsed: string;       // Last time the model was used (ISO date string)
    
    // Reference to an LLM object by its ID hash
    llm: string;  // SHA256IdHash string referencing an LLM object
    
    // Model state
    isLoaded?: boolean;      // Runtime state not stored in LLM
    loadProgress?: number;  // Progress during model loading (0-1)
    
    // Thinking and reasoning extraction state
    thinkingEnabled?: boolean;        // Whether thinking extraction is enabled for this model
    thinkingAttachments?: boolean;    // Whether to save thinking as attachments
    extractReasoning?: boolean;       // Whether to extract reasoning content via LLM API  
    reasoningFormat?: string;         // Format used for reasoning extraction
    lastThinkingHash?: string;        // Hash of last thinking segment stored
    
    // Optional configuration parameters
    temperature?: number;   // Generation temperature (0.0-1.0)
    maxTokens?: number;     // Maximum tokens to generate
    threads?: number;       // Number of CPU threads to use
    batchSize?: number;     // Processing batch size
    nGpuLayers?: number;    // Number of layers to offload to GPU
    
    // File paths and references
    modelPath?: string;     // Path to the model file on disk
    modelBlobHash?: string; // Hash of model binary if stored as BLOB
    
    // UI state
    uiExpanded?: boolean;   // UI state for expanded view
    
    // Context-specific attributes
    channelId?: string;     // Channel ID for storing the model
    downloadUrl?: string;   // URL to download the model from
    contactId?: SHA256IdHash<Person>;
    topicId?: SHA256IdHash<Topic>;
    
    // Summaries
    lastSummary?: { [key: string]: any };
    
    // Optional version hash for ONE versioning
    $versionHash$?: string;

    modelType?: 'local' | 'remote' | string;
    active?: boolean;
}

// Register LLMSettings with @OneObjectInterfaces
declare module '@OneObjectInterfaces' {
  interface OneIdObjectInterfaces {
    LLMSettings: Pick<LLMSettings, '$type$' | 'name' | 'llm'>;
  }

  interface OneVersionedObjectInterfaces {
    LLMSettings: LLMSettings;
  }
}

/**
 * Configuration for summary generation
 */
export interface AISummaryConfig {
    enabled: boolean;
    maxTokens: number;
    temperature: number;
    topP: number;
    frequencyPenalty: number;
    presencePenalty: number;
}

/**
 * Topic configuration for AI assistants
 */
export interface AIAssistantTopic extends Topic {
    type: 'ai-assistant';
    capabilities: string[];
    summary: {
        config: AISummaryConfig;
        lastSummary?: {
            text: string;
            messageRange: [string, string];
            timestamp: number;
            provider: string;
        };
    };
    metadata: LLM;
}

/**
 * Model status states
 */
export enum ModelState {
    Offline = 'offline',
    Online = 'online',
    Loading = 'loading',
    Error = 'error'
}

/**
 * Parameters for generating text with an LLM
 */
export interface GenerateParams {
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    stop?: string[];
}

/**
 * Result from generating text with an LLM
 */
export interface GenerateResult {
    text: string;
    tokens: number;
    timeToGenerate: number;
}

/**
 * Settings for local AI models
 */
export interface LocalAISettings {
    modelPath: string;
    modelName?: string;
    threads: number;
    batchSize?: number;
    temperature: number;
    contextSize?: number;
}

/**
 * Result from AI operations (generation, analysis, etc.)
 */
export interface AiResult {
    text: string;
    type: 'text' | 'image-analysis' | 'chat';
    metadata?: {
        model?: string;
        tokens?: number;
        timeToGenerate?: number;
        confidence?: number;
    };
}

/**
 * Settings for cloud-based AI models
 */
export interface CloudAISettings {
    apiKey: string;
    model?: string;
    maxTokens: number;
    temperature?: number;
    baseUrl?: string;
} 