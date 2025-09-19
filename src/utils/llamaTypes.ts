/**
 * Types for the LLaMA React Native module
 */

export interface LlamaContextParams {
  model: string;
  contextSize?: number;
  batchSize?: number;
  seed?: number;
  gpu?: boolean;
  splitMode?: number;
  numThreads?: number;
  numGpuLayers?: number;
  numBatch?: number;
  loraAdapter?: string;
  loraBase?: string;
  verbose?: boolean;
  embeddings?: boolean;
}

export interface TokenizeOptions {
  bos?: boolean;
  eos?: boolean;
  special?: boolean;
}

export interface LlamaCompletionOptions {
  temperature?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
  maxTokens?: number;
  nPredict?: number;
  stopSequences?: string[];
  logitBias?: Record<number, number>;
  input?: number[];
  nProbs?: number;
  penalizeNl?: boolean;
  grammar?: string;
  eosToken?: number;
  logPrompt?: boolean;
  mirostat?: number;
  mirostatTau?: number;
  mirostatEta?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface LlamaCompletion {
  tokens: number[];
  text: string;
  generation: string;
}

export interface LlamaPrompt {
  role: string;
  content: string;
}

export interface LlamaChatOptions extends LlamaCompletionOptions {
  template?: string;
}

export interface LlamaChatMessage extends LlamaPrompt {
  metadata?: Record<string, any>;
}

export interface LlamaModelInfo {
  name: string;
  path: string;
  size: number;
}

export interface LlamaContext {
  tokenize: (text: string, options?: TokenizeOptions) => Promise<number[]>;
  detokenize: (tokens: number[]) => Promise<string>;
  embedding: (text: string) => Promise<number[]>;
  completion: (prompt: string, options?: LlamaCompletionOptions) => Promise<LlamaCompletion>;
  completionStream: (prompt: string, options?: LlamaCompletionOptions & { onToken?: (token: string) => void }) => Promise<LlamaCompletion>;
  chat: (messages: LlamaChatMessage[], options?: LlamaChatOptions) => Promise<LlamaCompletion>;
  chatStream: (messages: LlamaChatMessage[], options?: LlamaChatOptions & { onToken?: (token: string) => void }) => Promise<LlamaCompletion>;
  free: () => Promise<void>;
}

export interface LlamaModule {
  createContext: (params: LlamaContextParams) => Promise<LlamaContext>;
  getModels: () => Promise<LlamaModelInfo[]>;
  getModelPath: (modelName: string) => Promise<string>;
  getVersion: () => Promise<string>;
  getNumThreads: () => Promise<number>;
  setNumThreads: (numThreads: number) => Promise<void>;
  copyModel: (source: string, destination: string) => Promise<void>;
  hasGPUSupport: () => Promise<boolean>;
} 