import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person, Recipe, RecipeRule, OneObjectTypeNames } from '@refinio/one.core/lib/recipes.js';

/**
 * LLM Definition - Base configuration for a language model
export interface LLMDefinition {
  id: string;
  name: string;
  size: number;
  parameters: number;
  architecture: string;
  capabilities: string[];
  contextLength: number;
  quantization: string;
}
 */

/**
 * LLM - Main object type for language models
 * This interface should match the canonical definition in src/@OneObjectInterfaces.d.ts
 */
export interface LLM {
  $type$: 'LLM';
  name: string;
  filename: string;
  modelType: 'local' | 'cloud';
  active: boolean;
  deleted: boolean;
  creator: string;
  created: number;
  modified: number;
  createdAt: string;
  lastUsed: string;
  size: number;
  capabilities: Array<'chat' | 'inference' | 'embedding' | 'functions' | 'tools' | 'rag' | 'vision' | 'multimodal'>;
  lastInitialized: number;
  usageCount: number;
  
  // Model parameters
  temperature?: number;
  maxTokens?: number;
  contextSize?: number;
  batchSize?: number;
  threads?: number;
  mirostat?: number;
  topK?: number;
  topP?: number;
  
  // Thinking and reasoning options
  extractThinking?: boolean;           // Whether to extract thinking content into separate attachments
  reasoningFormat?: string;            // Format string for reasoning extraction (e.g., 'deepseek', 'command_r7b')
  thinkingTagsEnabled?: boolean;       // Whether to support thinking tags like <think>...</think>
  thinkingSeparatorTokens?: string[];  // Custom tokens that mark thinking sections
  
  // Optional properties
  personId?: SHA256IdHash<Person>; // Person ID reference
  idHash?: SHA256IdHash<LLM>; // Immutable content hash of this LLM object
  architecture?: string;
  contextLength?: number;
  quantization?: string;
  checksum?: string;
  provider?: string;
  downloadUrl?: string;
  modelPath?: string;                  // Path to the model file
  $versionHash$?: string;
}

// Register LLM with @OneObjectInterfaces
declare module '@OneObjectInterfaces' {
  interface OneIdObjectInterfaces {
    LLM: Pick<LLM, '$type$' | 'name'>;
  }

  interface OneVersionedObjectInterfaces {
    LLM: LLM;
  }
}

/**
 * LLM UI Model - Used for display and selection in the UI
 * This is a UI-only representation, NOT a Recipe definition
 */
export interface LLMUIModel {
  id: string;
  displayName: string;
  description: string;
  isLocal: boolean;
  capabilities: string[];
  
  // Reference to the actual model for internal use
  modelRef?: string;
  
  // Additional UI display properties
  isAvailable?: boolean;
  isLoading?: boolean;
  icon?: string;
}

/**
 * Generation parameters for text generation
 */
export interface GenerationParameters {
  input: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopTokens?: string[];
}

/**
 * Generation result from text generation
 */
export interface GenerationResult {
  text: string;
  tokens?: number;
  timeToGenerate?: number;
}

/**
 * Provider configuration for AI models
 * Used to configure both local and cloud AI providers
 */
export interface AIProviderConfig {
  id: string;
  name: string;
  enabled: boolean;
  settings: LocalAISettings | CloudAISettings;
  lastUpdated?: number;
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
 * Settings for cloud-based AI models
 */
export interface CloudAISettings {
  apiKey: string;
  model?: string;
  maxTokens: number;
  temperature?: number;
  baseUrl?: string;
}

// Type definitions used in AIProviderSettings.tsx
export type LocalAIProviderConfig = AIProviderConfig & { id: 'local', settings: LocalAISettings };
export type CloudAIProviderConfig = AIProviderConfig & { id: 'cloud', settings: CloudAISettings }; 