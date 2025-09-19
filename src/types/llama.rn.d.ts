/**
 * Type definitions for llama.rn npm package
 * 
 * These types match the API provided by the llama.rn package v0.5.8
 */

declare module 'llama.rn' {
  export interface NativeLlamaContext {
    contextId: number;
    gpu: boolean;
    reasonNoGPU: string;
    model: {
      chatTemplates: {
        llamaChat?: boolean;
        minja?: {
          default?: boolean;
          toolUse?: boolean;
        };
      };
    };
    androidLib?: string;
  }

  export interface ContextParams {
    model: string;
    n_ctx?: number;
    n_batch?: number;
    n_threads?: number;
    n_gpu_layers?: number;
    seed?: number;
    f16_kv?: boolean;
    logits_all?: boolean;
    vocab_only?: boolean;
    use_mlock?: boolean;
    embedding?: boolean;
    no_gpu_devices?: boolean;
    cache_type_k?: string;
    cache_type_v?: string;
    pooling_type?: string;
    lora?: string;
    lora_list?: Array<{ path: string; scaled?: number }>;
  }

  export interface CompletionParams {
    prompt?: string;
    temperature?: number;
    top_k?: number;
    top_p?: number;
    repeat_penalty?: number;
    stop?: string[];
    max_tokens?: number;
    grammar?: string;
    emit_partial_completion?: boolean;
  }

  export interface NativeCompletionResult {
    text: string;
    tokens_predicted: number;
    completion_probabilities?: any[];
    timings?: any;
  }

  export interface TokenData {
    token: string;
    completion_probabilities?: any[];
  }

  export class LlamaContext {
    id: number;
    gpu: boolean;
    reasonNoGPU: string;
    model: NativeLlamaContext['model'];

    constructor(context: NativeLlamaContext);
    
    completion(params: CompletionParams, callback?: (data: TokenData) => void): Promise<NativeCompletionResult>;
    stopCompletion(): Promise<void>;
    tokenize(text: string, options?: { media_paths?: string[] }): Promise<{ tokens: number[] }>;
    detokenize(tokens: number[]): Promise<string>;
    release(): Promise<void>;
  }

  /**
   * Initialize the llama model
   */
  export function initLlama(params: ContextParams, onProgress?: (progress: number) => void): Promise<LlamaContext>;

  /**
   * Release all contexts
   */
  export function releaseAllLlama(): Promise<void>;

  /**
   * Toggle native logging
   */
  export function toggleNativeLog(enabled: boolean): Promise<void>;

  /**
   * Add a native log listener
   */
  export function addNativeLogListener(listener: (level: string, text: string) => void): { remove: () => void };
} 