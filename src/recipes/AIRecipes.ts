/**
 * AI Recipes Module
 * 
 * Defines the recipes and interfaces for AI-related objects in the system.
 * This includes:
 * - AI messages and responses
 * - Model configuration
 * - Processing status
 */

import type { Recipe, OneObjectTypeNames, BLOB } from '@refinio/one.core/lib/recipes.js';
import type { LocalAISettings, CloudAISettings } from '../types/ai';
import type { LLM } from '../types/llm';

/**
 * Recipe for AI message processing status
 */
export const AIProcessingStatusRecipe: Recipe = {
  name: 'AIProcessingStatus' as OneObjectTypeNames,
  $type$: 'Recipe',
  rule: [
    {
      itemprop: 'messageId',
      itemtype: { type: 'string' },
      optional: false
    },
    {
      itemprop: 'provider',
      itemtype: { type: 'string' },
      optional: false
    },
    {
      itemprop: 'startTime',
      itemtype: { type: 'number' },
      optional: false
    }
  ]
};

/**
 * Recipe for AI message response
 */
export const AIResponseRecipe: Recipe = {
  name: 'AIResponse' as OneObjectTypeNames,
  $type$: 'Recipe',
  rule: [
    {
      itemprop: 'messageId',
      itemtype: { type: 'string' },
      optional: false
    },
    {
      itemprop: 'provider',
      itemtype: { type: 'string' },
      optional: false
    },
    {
      itemprop: 'model',
      itemtype: { type: 'string' },
      optional: false
    },
    {
      itemprop: 'tokens',
      itemtype: { type: 'number' },
      optional: false
    },
    {
      itemprop: 'processingTime',
      itemtype: { type: 'number' },
      optional: false
    },
    {
      itemprop: 'content',
      itemtype: { type: 'string' },
      optional: false
    }
  ]
};

/**
 * Recipe for local AI model configuration
 */
export const LocalAIConfigRecipe: Recipe = {
  name: 'LocalAIConfig' as OneObjectTypeNames,
  $type$: 'Recipe',
  rule: [
    {
      itemprop: 'modelBlobHash',
      itemtype: { type: 'string' },
      optional: false
    },
    {
      itemprop: 'threads',
      itemtype: { type: 'number' },
      optional: false
    },
    {
      itemprop: 'batchSize',
      itemtype: { type: 'number' },
      optional: false
    },
    {
      itemprop: 'temperature',
      itemtype: { type: 'number' },
      optional: false
    }
  ]
};

/**
 * Interface for provider configuration
 */
export interface AIProviderConfig {
  $type$: 'AIProviderConfig';
  id: string;
  name: string;
  enabled: boolean;
  settings: LocalAISettings | CloudAISettings;
  lastUpdated: number;
}

export const AIProviderConfigRecipe: Recipe = {
  name: 'AIProviderConfig' as OneObjectTypeNames,
  $type$: 'Recipe',
  rule: [
    { itemprop: '$type$', itemtype: { type: 'string', regexp: /^AIProviderConfig$/ } },
    { itemprop: 'id', itemtype: { type: 'string' } },
    { itemprop: 'name', itemtype: { type: 'string' } },
    { itemprop: 'enabled', itemtype: { type: 'boolean' } },
    { itemprop: 'settings', itemtype: { type: 'object', rules: [
      { itemprop: 'modelPath', itemtype: { type: 'string' }, optional: true },
      { itemprop: 'threads', itemtype: { type: 'integer' }, optional: true },
      { itemprop: 'batchSize', itemtype: { type: 'integer' }, optional: true },
      { itemprop: 'temperature', itemtype: { type: 'number' }, optional: true }
    ]}},
    { itemprop: 'lastUpdated', itemtype: { type: 'integer' } }
  ]
};

/**
 * Interface for AI processing status
 */
export interface AIProcessingStatus {
  $type$: 'AIProcessingStatus';
  messageId: string;
  provider: string;
  startTime: number;
}

/**
 * Interface for AI response
 */
export interface AIResponse {
  $type$: 'AIResponse';
  messageId: string;
  provider: string;
  model: string;
  tokens: number;
  processingTime: number;
  content: string;
}

/**
 * Interface for local AI configuration
 */
export interface LocalAIConfig {
  $type$: 'LocalAIConfig';
  modelBlobHash: BLOB;
  threads: number;
  batchSize: number;
  temperature: number;
}

// Register with @OneObjectInterfaces
declare module '@OneObjectInterfaces' {
  interface OneUnversionedObjectInterfaces {
    AIProviderConfig: AIProviderConfig;
    AIProcessingStatus: AIProcessingStatus;
    AIResponse: AIResponse;
    LocalAIConfig: LocalAIConfig;
  }
}

// Export provider config types
export type LocalAIProviderConfig = AIProviderConfig & { id: 'local', settings: LocalAISettings };
export type CloudAIProviderConfig = AIProviderConfig & { id: 'cloud', settings: CloudAISettings };

export default [
  AIProcessingStatusRecipe,
  AIResponseRecipe,
  LocalAIConfigRecipe,
  AIProviderConfigRecipe
]; 