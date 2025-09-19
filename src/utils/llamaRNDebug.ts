/**
 * llamaRNDebug.ts - Debugging utilities for llama.rn native module
 * 
 * This file provides debugging wrappers and diagnostics for the llama.rn native module
 * to help diagnose initialization and model loading issues.
 */

import { Platform } from 'react-native';
import { LLMInitParams, convertToLlamaRNParams } from '../types/LLMSettings';

/**
 * Debug version parameters to try with llama.rn
 */
export const FALLBACK_PARAMS = [
  // Attempt 1: Absolute minimum settings
  {
    contextSize: 256,
    threads: 1,
    batchSize: 32,
    useF16KV: false,
    useMlock: false,
    vocabOnly: true,
  },
  // Attempt 2: Try without mlock
  {
    contextSize: 512, 
    threads: 1,
    batchSize: 64,
    useF16KV: false,
    useMlock: false,
    vocabOnly: true,
  },
  // Attempt 3: Try with f16_kv
  {
    contextSize: 512,
    threads: 1, 
    batchSize: 64,
    useF16KV: true, 
    useMlock: false,
    vocabOnly: true,
  }
];

/**
 * Attempt to load a model with multiple parameter configurations
 * This tries different parameter combinations to find one that works
 */
export async function tryLoadWithFallbacks(
  llamaRN: any, 
  modelPath: string, 
  logPrefix: string
): Promise<{success: boolean, contextId?: string, params?: any}> {
  console.log(`${logPrefix} Attempting model load with fallback parameters`);
  
  // First try to get the llama.rn version to verify basic functionality
  try {
    const version = await llamaRN.getVersion();
    console.log(`${logPrefix} llama.rn version: ${version}`);
  } catch (versionError) {
    console.error(`${logPrefix} Error getting llama.rn version:`, versionError);
    // If we can't even get the version, the native module is fundamentally broken
    return { success: false };
  }
  
  // Loop through fallback parameter sets
  for (let i = 0; i < FALLBACK_PARAMS.length; i++) {
    try {
      const baseParams: LLMInitParams = {
        modelPath,
        ...FALLBACK_PARAMS[i]
      };
      
      const params = convertToLlamaRNParams(baseParams);
      console.log(`${logPrefix} Attempt ${i+1}: Trying with params:`, params);
      
      const contextInfo = await llamaRN.initLlama(params);
      
      if (contextInfo && contextInfo.contextId) {
        console.log(`${logPrefix} Success with attempt ${i+1}! Context ID: ${contextInfo.contextId}`);
        return { 
          success: true, 
          contextId: contextInfo.contextId,
          params: params
        };
      } else {
        console.log(`${logPrefix} Attempt ${i+1} returned invalid context info:`, contextInfo);
      }
    } catch (error) {
      console.error(`${logPrefix} Attempt ${i+1} failed:`, error);
    }
  }
  
  console.error(`${logPrefix} All fallback attempts failed`);
  return { success: false };
}

/**
 * Get detailed environment information to help diagnose module issues
 */
export function getLlamaRNEnvironmentInfo(): Record<string, any> {
  return {
    platform: Platform.OS,
    version: Platform.Version,
    isSimulator: Platform.OS === 'ios' && 
                typeof Platform.constants?.osVersion === 'string' && 
                typeof Platform.constants?.systemName === 'string',
    deviceInfo: Platform.OS === 'ios' ? {
      ...Platform.constants
    } : {},
    memoryInfo: {
      heapLimit: (globalThis as any).performance?.memory?.jsHeapSizeLimit,
      totalHeap: (globalThis as any).performance?.memory?.totalJSHeapSize,
      usedHeap: (globalThis as any).performance?.memory?.usedJSHeapSize,
    }
  };
}

/**
 * Check if llama.rn native module can be loaded and is properly functioning
 */
export async function checkLlamaRNHealth(llamaRN: any): Promise<{
  available: boolean;
  version?: string;
  methods?: string[];
  error?: any;
}> {
  try {
    if (!llamaRN) {
      return { available: false, error: 'Module not found' };
    }
    
    const methods = Object.keys(llamaRN).filter(
      key => typeof llamaRN[key] === 'function'
    );
    
    let version: string | undefined;
    try {
      version = await llamaRN.getVersion();
    } catch (versionError) {
      return { 
        available: false, 
        methods,
        error: {
          message: 'Failed to get version',
          details: versionError
        }
      };
    }
    
    return {
      available: true,
      version,
      methods
    };
  } catch (error) {
    return {
      available: false,
      error
    };
  }
} 