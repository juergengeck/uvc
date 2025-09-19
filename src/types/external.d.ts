/**
 * TypeScript declarations for external modules 
 * This file helps TypeScript recognize modules that don't have their own type declarations
 */

// Declare the llama-rn module
declare module 'llama-rn' {
  export interface TokenData {
    token: string;
    completion_probabilities?: Array<any>;
  }

  export interface ContextParams {
    model: string;
    context_size?: number;
    batch_size?: number;
    threads?: number;
    gpu_layers?: number;
    cache_type_k?: string;
    cache_type_v?: string;
    pooling_type?: string;
    is_model_asset?: boolean;
    keep_context_size?: number;
    lora?: string;
    lora_list?: Array<{path: string; scaled?: number}>;
  }
  
  export interface CompletionParams {
    prompt?: string;
    messages?: Array<any>;
    max_tokens?: number;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    stop?: string[];
    frequency_penalty?: number;
    presence_penalty?: number;
    repeat_penalty?: number;
    mirostat?: number;
    mirostat_tau?: number;
    mirostat_eta?: number;
    seed?: number;
    logit_bias?: Record<string, number>;
    grammar?: string;
    schema?: object;
    logprobs?: number;
  }

  export class LlamaContext {
    id: number;
    gpu: boolean;
    reasonNoGPU: string;
    model: any;
    constructor(params: any);
    completion(params: CompletionParams, callback?: (data: TokenData) => void): Promise<any>;
    stopCompletion(): Promise<void>;
    tokenize(text: string): Promise<any>;
    detokenize(tokens: number[]): Promise<string>;
    embedding(text: string, params?: any): Promise<any>;
    release(): Promise<void>;
  }

  export function loadLlamaModelInfo(model: string): Promise<any>;
  export function initLlama(params: ContextParams, onProgress?: (progress: number) => void): Promise<LlamaContext>;
  export function releaseAllLlama(): Promise<void>;
  export function toggleNativeLog(enabled: boolean): Promise<void>;
} 