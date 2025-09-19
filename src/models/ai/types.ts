/**
 * Event emitted during text generation
 */
export interface GenerationProgressEvent {
  /** Number of tokens generated so far */
  generatedTokens: number;
  /** Generated text so far */
  partialText: string;
  /** Time elapsed in seconds */
  elapsedTime: number;
  /** Estimated tokens per second */
  tokensPerSecond: number;
}

/**
 * Event emitted when model state changes
 */
export type ModelState = 'loading' | 'ready' | 'generating' | 'error';

export interface ModelStateEvent {
  /** Current model state */
  state: ModelState;
  /** Error message if state is 'error' */
  error?: string;
}

/**
 * Event emitted during model loading
 */
export interface ModelLoadEvent {
  /** Loading progress (0-100) */
  progress: number;
  /** Total progress (0-100) */
  total: number;
  /** Optional message */
  message?: string;
}

/**
 * Text generation parameters
 */
export interface GenerateParams {
  /** Input text/prompt */
  input: string;
  /** System prompt for context */
  systemPrompt?: string;
  /** Maximum number of tokens to generate */
  maxTokens?: number;
  /** Temperature for sampling (0.0-1.0) */
  temperature?: number;
  /** Top-p sampling threshold (0.0-1.0) */
  topP?: number;
  /** List of strings that stop generation when encountered */
  stopTokens?: string[];
  /** Whether to stream tokens as they're generated */
  stream?: boolean;
}

/**
 * Generation result
 */
export interface GenerateResult {
  /** Generated text */
  text: string;
  /** Number of tokens generated */
  tokens?: number;
  /** Reason why generation stopped */
  finishReason?: 'stop' | 'length' | 'content_filter' | null;
  /** Timing information */
  timing?: {
    /** Start timestamp (seconds) */
    startTime: number;
    /** End timestamp (seconds) */
    endTime: number;
    /** Total elapsed time (seconds) */
    elapsedTime: number;
    /** Generation speed (tokens/second) */
    tokensPerSecond: number;
  };
  /** Usage statistics */
  usage?: {
    /** Tokens in prompt */
    promptTokens: number;
    /** Tokens in completion */
    completionTokens: number;
    /** Total tokens used */
    totalTokens: number;
  };
  /** For backward compatibility */
  timings?: {
    start: number;
    end: number;
    elapsed: number;
    tokensPerSecond: number;
  };
}

export interface ModelInfo {
  name: string;
  path: string;
  size: number;
  architecture?: string;
  parameters?: number;
  contextLength?: number;
  quantization?: string;
}

export interface ProgressInfo {
  receivedBytes: number;
  totalBytes: number;
}

/**
 * AI provider capabilities
 */
export interface AICapability {
  isAvailable: boolean;
  requiresNetwork: boolean;
  maxContextSize: number;
  supportsStreaming: boolean;
}

/**
 * AI provider interface
 */
export interface AIProvider {
  name: string;
  capabilities: AICapability;
  initialize(): Promise<void>;
  generate(params: GenerateParams): Promise<GenerateResult>;
  loadSession(sessionPath: string): Promise<void>;
  saveSession(sessionPath: string): Promise<void>;
  cleanup(): Promise<void>;
} 