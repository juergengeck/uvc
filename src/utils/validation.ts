/**
 * Validation utilities for settings import/export
 */

import type { AIProviderConfig, AISummaryConfig } from '../types/ai';

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Type guard for AIProviderConfig
 */
function isAIProviderConfig(value: unknown): value is AIProviderConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Record<string, unknown>;
  
  return (
    typeof config.id === 'string' &&
    typeof config.name === 'string' &&
    typeof config.enabled === 'boolean' &&
    typeof config.settings === 'object' &&
    config.settings !== null &&
    typeof config.lastUpdated === 'number'
  );
}

/**
 * Type guard for AISummaryConfig
 */
function isAISummaryConfig(value: unknown): value is AISummaryConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Record<string, unknown>;
  
  return (
    typeof config.enabled === 'boolean' &&
    typeof config.maxTokens === 'number' &&
    typeof config.temperature === 'number' &&
    typeof config.topP === 'number' &&
    typeof config.frequencyPenalty === 'number' &&
    typeof config.presencePenalty === 'number'
  );
}

/**
 * Validates local AI (Fullmoon) settings
 */
export function validateLocalAISettings(settings: Record<string, unknown>): ValidationResult {
  const { modelPath, threads, batchSize, temperature } = settings;

  if (typeof modelPath !== 'undefined' && typeof modelPath !== 'string') {
    return {
      isValid: false,
      error: 'Model path must be a string'
    };
  }

  if (typeof threads !== 'undefined') {
    const threadCount = Number(threads);
    if (isNaN(threadCount) || threadCount < 1 || threadCount > 8) {
      return {
        isValid: false,
        error: 'Thread count must be between 1 and 8'
      };
    }
  }

  if (typeof batchSize !== 'undefined') {
    const size = Number(batchSize);
    if (isNaN(size) || size < 1 || size > 2048) {
      return {
        isValid: false,
        error: 'Batch size must be between 1 and 2048'
      };
    }
  }

  if (typeof temperature !== 'undefined') {
    const temp = Number(temperature);
    if (isNaN(temp) || temp < 0.1 || temp > 2.0) {
      return {
        isValid: false,
        error: 'Temperature must be between 0.1 and 2.0'
      };
    }
  }

  return { isValid: true };
}

/**
 * Validates cloud AI (Anthropic) settings
 */
export function validateCloudAISettings(settings: Record<string, unknown>): ValidationResult {
  const { apiKey, maxTokens, temperature } = settings;

  if (typeof apiKey !== 'undefined') {
    const key = String(apiKey).trim();
    if (!key.startsWith('sk-') || key.length < 32) {
      return {
        isValid: false,
        error: 'Invalid API key format'
      };
    }
  }

  if (typeof maxTokens !== 'undefined') {
    const tokens = Number(maxTokens);
    if (isNaN(tokens) || tokens < 1 || tokens > 4096) {
      return {
        isValid: false,
        error: 'Max tokens must be between 1 and 4096'
      };
    }
  }

  if (typeof temperature !== 'undefined') {
    const temp = Number(temperature);
    if (isNaN(temp) || temp < 0 || temp > 1) {
      return {
        isValid: false,
        error: 'Temperature must be between 0 and 1'
      };
    }
  }

  return { isValid: true };
}

/**
 * Validates summary settings
 */
export function validateSummarySettings(settings: Partial<AISummaryConfig>): ValidationResult {
  const { maxTokens, temperature, topP, frequencyPenalty, presencePenalty } = settings;

  if (typeof maxTokens !== 'undefined') {
    if (maxTokens < 1 || maxTokens > 4096) {
      return {
        isValid: false,
        error: 'Max tokens must be between 1 and 4096'
      };
    }
  }

  if (typeof temperature !== 'undefined') {
    if (temperature < 0 || temperature > 1) {
      return {
        isValid: false,
        error: 'Temperature must be between 0 and 1'
      };
    }
  }

  if (typeof topP !== 'undefined') {
    if (topP < 0 || topP > 1) {
      return {
        isValid: false,
        error: 'Top P must be between 0 and 1'
      };
    }
  }

  if (typeof frequencyPenalty !== 'undefined') {
    if (frequencyPenalty < -2 || frequencyPenalty > 2) {
      return {
        isValid: false,
        error: 'Frequency penalty must be between -2 and 2'
      };
    }
  }

  if (typeof presencePenalty !== 'undefined') {
    if (presencePenalty < -2 || presencePenalty > 2) {
      return {
        isValid: false,
        error: 'Presence penalty must be between -2 and 2'
      };
    }
  }

  return { isValid: true };
}

/**
 * Export settings to a JSON string
 */
export function exportSettings(providerConfigs: Record<string, AIProviderConfig>, summaryConfig: AISummaryConfig): string {
  return JSON.stringify({
    providerConfigs,
    summaryConfig
  }, null, 2);
}

/**
 * Import settings from a JSON string
 * @throws {Error} If the JSON is invalid or missing required fields
 */
export function importSettings(json: string): {
  providerConfigs: Record<string, AIProviderConfig>;
  summaryConfig: AISummaryConfig;
} {
  try {
    const data = JSON.parse(json);

    if (!data || typeof data !== 'object') {
      throw new Error('Invalid settings format');
    }

    if (!data.providerConfigs || typeof data.providerConfigs !== 'object') {
      throw new Error('Missing or invalid provider configurations');
    }

    if (!data.summaryConfig || typeof data.summaryConfig !== 'object') {
      throw new Error('Missing or invalid summary configuration');
    }

    // Validate provider configs
    const providerConfigs: Record<string, AIProviderConfig> = {};
    Object.entries(data.providerConfigs).forEach(([id, config]) => {
      if (!isAIProviderConfig(config)) {
        throw new Error(`Invalid configuration for provider ${id}`);
      }
      providerConfigs[id] = config;
    });

    // Validate summary config
    if (!isAISummaryConfig(data.summaryConfig)) {
      throw new Error('Invalid summary configuration');
    }

    return {
      providerConfigs,
      summaryConfig: data.summaryConfig
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to import settings: ${error.message}`);
    }
    throw new Error('Failed to import settings: Unknown error');
  }
} 