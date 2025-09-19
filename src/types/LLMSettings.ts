/**
 * LLMSettings.ts - Type definitions for LLM configuration and settings
 * 
 * This file provides interfaces for LLM configuration that can be used 
 * throughout the application without type casting. It ensures type safety
 * across the LLMManager, LlamaModel, and other components.
 */

/**
 * LLM initialization parameters
 * Closely matches llama.rn's InitLlamaParams but decoupled from the specific implementation
 */
export interface LLMInitParams {
  /** Path to the model file */
  modelPath: string;
  
  /** Context window size (number of tokens) */
  contextSize?: number;
  
  /** Number of threads to use for inference */
  threads?: number;
  
  /** Batch size for inference */
  batchSize?: number;
  
  /** Whether to use half-precision (f16) for key/value cache */
  useF16KV?: boolean;
  
  /** Whether to use mlock to keep the model in RAM */
  useMlock?: boolean;
  
  /** Whether to only load the vocabulary (for testing) */
  vocabOnly?: boolean;
  
  /** Whether to compute embeddings */
  embedding?: boolean;
  
  /** Random seed for reproducibility */
  seed?: number;
}

/**
 * LLM prediction/generation parameters
 * Aligned with llama.rn's PredictParams but decoupled
 */
export interface LLMGenerationParams {
  /** Temperature for sampling (higher = more random) */
  temperature?: number;
  
  /** Top-k sampling parameter */
  topK?: number;
  
  /** Top-p (nucleus) sampling parameter */
  topP?: number;
  
  /** Repetition penalty */
  repeatPenalty?: number;
  
  /** Stop sequences to end generation */
  stopSequences?: string[];
  
  /** Maximum number of tokens to generate */
  maxTokens?: number;
}

/**
 * Result of LLM generation
 */
export interface LLMGenerationResult {
  /** Generated text */
  text: string;
  
  /** Number of tokens generated */
  tokens: number;
  
  /** Whether generation completed normally */
  completed: boolean;
}

/**
 * LLM context information
 * Matches the structure returned by llama.rn's initLlama() method
 */
export interface LLMContextInfo {
  /** Context ID (numeric) - this is the primary identifier returned by llama.rn */
  id: number;
  
  /** Whether GPU was used by the native context */
  gpu: boolean;
  
  /** Reason GPU was not used by native context */
  reasonNoGPU: string;
  
  /** Model path (used in our internal tracking) */
  modelPath?: string;
  
  /** Model metadata and information returned by the native module */
  model?: any;
}

/**
 * LLM model state
 */
export type LLMModelState = 'loading' | 'ready' | 'generating' | 'error';

/**
 * LLM platform information
 */
export interface LLMPlatformInfo {
  /** Operating system */
  os: string;
  
  /** OS version */
  version: string | number;
  
  /** Whether running in simulator */
  isSimulator?: boolean;
  
  /** Device type */
  deviceType?: string;
}

/**
 * Convert standard LLMInitParams to llama.rn specific format
 * This acts as an adapter between our generic parameters and llama.rn
 */
export function convertToLlamaRNParams(params: LLMInitParams): any {
  return {
    model: params.modelPath,
    n_ctx: params.contextSize,
    n_threads: params.threads,
    n_batch: params.batchSize,
    f16_kv: params.useF16KV,
    use_mlock: params.useMlock,
    vocab_only: params.vocabOnly,
    embedding: params.embedding,
    seed: params.seed
  };
}

/**
 * Convert LLMGenerationParams to llama.rn specific format
 */
export function convertToLlamaRNGenerationParams(params: LLMGenerationParams): any {
  return {
    temperature: params.temperature,
    top_k: params.topK,
    top_p: params.topP,
    repeat_penalty: params.repeatPenalty,
    stop: params.stopSequences,
    max_tokens: params.maxTokens
  };
} 