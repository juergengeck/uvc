/**
 * llama.ts - TypeScript wrapper for the LLaMA native module
 * 
 * This provides a clean TypeScript interface to the LlamaRNModule native module
 * with proper error handling and type safety.
 */

import { NativeModules, Platform } from 'react-native';
import type {
  LlamaModule,
  LlamaContext,
  LlamaContextParams,
  LlamaCompletionOptions,
  LlamaChatOptions,
  LlamaChatMessage,
  TokenizeOptions,
  LlamaCompletion,
  LlamaModelInfo
} from './llamaTypes';

// Get the native module
const { RNLlama } = NativeModules;

// Default error message if module not found
const LINKING_ERROR = 
  `The module "RNLlama" could not be found. 
   Please verify that:
   1. You've properly integrated the native LlamaRNModule
   2. Rebuilt your app after installation
   3. Enabled native module support in your config`;

// Check if the native module exists
if (!RNLlama) {
  console.error(LINKING_ERROR);
  throw new Error(LINKING_ERROR);
}

/**
 * Platform-specific wrapper for LLaMA module
 */
const LlamaWrapper: LlamaModule = {
  /**
   * Create a new LLaMA context with the given parameters
   */
  async createContext(params: LlamaContextParams): Promise<LlamaContext> {
    try {
      const contextId = await RNLlama.createContext(params);
      
      // Return a context object with methods that operate on this context
      return {
        /**
         * Tokenize a text string
         */
        async tokenize(text: string, options: TokenizeOptions = {}): Promise<number[]> {
          return await RNLlama.tokenize(contextId, text, options);
        },

        /**
         * Convert tokens back to text
         */
        async detokenize(tokens: number[]): Promise<string> {
          return await RNLlama.detokenize(contextId, tokens);
        },

        /**
         * Get text embedding
         */
        async embedding(text: string): Promise<number[]> {
          return await RNLlama.embedding(contextId, text);
        },

        /**
         * Generate a completion for the given prompt
         */
        async completion(prompt: string, options: LlamaCompletionOptions = {}): Promise<LlamaCompletion> {
          return await RNLlama.completion(contextId, prompt, options);
        },

        /**
         * Generate a completion with streaming
         */
        async completionStream(
          prompt: string, 
          options: LlamaCompletionOptions & { onToken?: (token: string) => void } = {}
        ): Promise<LlamaCompletion> {
          const { onToken, ...completionOptions } = options;
          return await RNLlama.completionStream(contextId, prompt, completionOptions, onToken);
        },

        /**
         * Generate a chat completion for the given messages
         */
        async chat(messages: LlamaChatMessage[], options: LlamaChatOptions = {}): Promise<LlamaCompletion> {
          return await RNLlama.chat(contextId, messages, options);
        },

        /**
         * Generate a chat completion with streaming
         */
        async chatStream(
          messages: LlamaChatMessage[], 
          options: LlamaChatOptions & { onToken?: (token: string) => void } = {}
        ): Promise<LlamaCompletion> {
          const { onToken, ...chatOptions } = options;
          return await RNLlama.chatStream(contextId, messages, chatOptions, onToken);
        },

        /**
         * Free the context
         */
        async free(): Promise<void> {
          return await RNLlama.freeContext(contextId);
        }
      };
    } catch (error) {
      console.error('Error creating LLaMA context:', error);
      throw error;
    }
  },

  /**
   * Get list of available models
   */
  async getModels(): Promise<LlamaModelInfo[]> {
    try {
      return await RNLlama.getModels();
    } catch (error) {
      console.error('Error getting LLaMA models:', error);
      throw error;
    }
  },

  /**
   * Get path for a specific model
   */
  async getModelPath(modelName: string): Promise<string> {
    try {
      return await RNLlama.getModelPath(modelName);
    } catch (error) {
      console.error(`Error getting model path for ${modelName}:`, error);
      throw error;
    }
  },

  /**
   * Get LLaMA library version
   */
  async getVersion(): Promise<string> {
    try {
      return await RNLlama.getVersion();
    } catch (error) {
      console.error('Error getting LLaMA version:', error);
      throw error;
    }
  },

  /**
   * Get current number of threads
   */
  async getNumThreads(): Promise<number> {
    try {
      return await RNLlama.getNumThreads();
    } catch (error) {
      console.error('Error getting number of threads:', error);
      throw error;
    }
  },

  /**
   * Set number of threads to use
   */
  async setNumThreads(numThreads: number): Promise<void> {
    try {
      return await RNLlama.setNumThreads(numThreads);
    } catch (error) {
      console.error(`Error setting number of threads to ${numThreads}:`, error);
      throw error;
    }
  },

  /**
   * Copy a model file
   */
  async copyModel(source: string, destination: string): Promise<void> {
    try {
      return await RNLlama.copyModel(source, destination);
    } catch (error) {
      console.error(`Error copying model from ${source} to ${destination}:`, error);
      throw error;
    }
  },

  /**
   * Check if GPU support is available
   */
  async hasGPUSupport(): Promise<boolean> {
    if (Platform.OS !== 'ios') {
      return false;
    }
    
    try {
      return await RNLlama.hasGPUSupport();
    } catch (error) {
      console.error('Error checking GPU support:', error);
      return false;
    }
  }
};

// Export default instance
export default LlamaWrapper; 