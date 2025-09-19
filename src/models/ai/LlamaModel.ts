import { OEvent } from '@refinio/one.models/lib/misc/OEvent';
import { Platform, NativeModules } from 'react-native';
import * as FileSystem from 'expo-file-system';
// Add import for react-native-fs
import * as RNFS from 'react-native-fs';

// Import debugging utilities
import { getLlamaRNEnvironmentInfo } from '../../utils/llamaRNDebug';

// Use native crypto instead of crypto-js
import { v4 as uuidv4 } from 'uuid';

// Import modern llama.rn API
import { initLlama, LlamaContext, releaseAllLlama } from 'llama.rn';

// Still check native module for compatibility
const RNLlama = NativeModules.RNLlama;

// Check which API is available
const useModernAPI = typeof initLlama === 'function';

// Debug logging for module availability
console.log('[LlamaModel] Checking llama.rn module availability:');
console.log('[LlamaModel] - typeof initLlama:', typeof initLlama);
console.log('[LlamaModel] - typeof LlamaContext:', typeof LlamaContext);
console.log('[LlamaModel] - typeof releaseAllLlama:', typeof releaseAllLlama);
console.log('[LlamaModel] - RNLlama available:', !!RNLlama);

if (!useModernAPI && !RNLlama) {
  const LINKING_ERROR = 
    `Neither modern llama.rn API nor native module 'RNLlama' is available.\n` +
    `- Make sure 'llama.rn' is correctly installed and linked.\n` +
    `- If using Fabric (New Architecture), ensure the module supports it and codegen ran.\n` +
    `- Rebuild your app after changes (pod install, npm install).\n` +
    `- Check for build errors during the native build process.`;
  console.error(LINKING_ERROR);
} else {
  console.log(`[LlamaModel] Using ${useModernAPI ? 'modern llama.rn API' : 'legacy RNLlama Native Module'}`);
}

/**
 * Helper function to get a LlamaContext from a context ID
 * This is a simplified implementation for direct usage
 */
async function getContext(contextId: string): Promise<any | null> {
  console.warn(`[LlamaModel] getContext(${contextId}): Not fully implemented - needs LlamaContext registry.`);
  // In a complete implementation, we would maintain a registry of active contexts
  // For now, return null to indicate this needs to be implemented
  return null;
}

/**
 * Modified type for FileInfo with size property
 */
type FileInfoWithSize = FileSystem.FileInfo & {
  size: number;
};

// Types for generation progress
interface GenerationProgressEvent {
  token: string;
  progress: number;
}

// Model state types
type LLMModelState = 'uninitialized' | 'loading' | 'ready' | 'generating' | 'error' | 'released';

interface ModelStateEvent {
  state: LLMModelState;
  previous: LLMModelState;
}

// Define simple version of parameters
interface ModelInitParams {
  model: string;
  n_ctx?: number;
  n_batch?: number;
  n_threads?: number;
  use_mlock?: boolean;
  vocab_only?: boolean;
  embedding?: boolean;
  seed?: number;
  no_gpu_devices?: boolean;
}

interface GenerationParams {
  temperature?: number;
  top_k?: number;
  top_p?: number;
  repeat_penalty?: number;
  stop?: string[];
  max_tokens?: number;
  grammar?: string; // Grammar sampling support
  
  // Multimodal support
  images?: string[]; // Array of image paths/URIs
  audio?: string; // Audio file path/URI
  
  // Tool calling support
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: any;
    };
  }>;
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

interface GenerationResult {
  text: string;
  tokens: number;
  completed: boolean;
}

// Types for llama.rn context information
interface LlamaContextInfo {
  id: number;
  gpu?: boolean;
  reasonNoGPU?: string;
  model?: any;
}

/**
 * LlamaModel - A wrapper around llama.rn for local LLM inference
 * 
 * This class provides a singleton interface to interact with a single LlamaContext
 * from the llama.rn package, managing the model lifecycle and providing convenient
 * methods for completion generation.
 */
export class LlamaModel {
  // Singleton instance
  private static instance: LlamaModel | null = null;
  
  // Instance ID for logging/tracking
  private readonly instanceId: string;

  // Model metadata
  public readonly id: string;
  public name: string = 'LlamaModel';
  public created: number;
  public modified: number;
  public size: number = 0;
  public parameters: number = 0;
  public hash: string = '';
  
  // Current model information
  private currentModelPath: string = '';
  private activeContext: LlamaContextInfo | null = null;
  private modernContext: LlamaContext | null = null; // Modern llama.rn context
  private modelMetadata?: {
    contextLength: number;
    architecture: string;
    quantization: string;
    parameters: number;
  };
  
  // State management
  private modelState: LLMModelState = 'uninitialized';
  private initializingPromise: Promise<boolean> | null = null;
  
  // Track initialization failures to prevent infinite retries
  private failureCounter: Map<string, number> = new Map();
  private readonly MAX_FAILURES = 3;
  
  // Track active generation to prevent issues with concurrent requests
  private activeGenerationId: string | null = null;
  private activeTimeoutHandle: NodeJS.Timeout | null = null;
  private activeIntervalHandle: NodeJS.Timeout | null = null;
  
  // Event emitters
  public readonly onTokenGenerated = new OEvent<(event: GenerationProgressEvent) => void>();
  public readonly onStateChanged = new OEvent<(event: ModelStateEvent) => void>();
  public readonly onModelChanged = new OEvent<(modelPath: string) => void>();

  // Default completion parameters
  public defaultCompletionParams: GenerationParams = {
    temperature: 0.7,
    top_p: 0.9,
    top_k: 40,
    repeat_penalty: 1.1,
    stop: [],
    max_tokens: 1024  // Increased from 500 to allow longer responses
  };

  /**
   * Check if llama.rn is available
   */
  public static isAvailable(): boolean {
    try {
      // First check modern API
      if (useModernAPI) {
        return true;
      }
      // Fall back to legacy check
      return RNLlama && typeof RNLlama.initContext === 'function'; 
    } catch (error) {
      console.error('[LlamaModel] Error checking llama.rn availability:', error);
      return false;
    }
  }

  /**
   * Instance method to check if llama.rn is available
   * This is an alias for the static isAvailable method to maintain API compatibility with LLMManager
   */
  public isModuleAvailable(): boolean {
    return LlamaModel.isAvailable();
  }

  /**
   * Get active model state - used by LLMManager for diagnostics
   */
  public getActiveState(): string {
    return this.modelState;
  }

  /**
   * Get the absolute file system path of the model that is currently loaded in
   * the Llama context (if any). Returns an empty string when no model has been
   * loaded yet.  This small helper allows external managers (e.g. LLMManager)
   * to decide whether the requested model is already resident or a load
   * operation is required.
   */
  public getCurrentModelPath(): string {
    return this.currentModelPath;
  }

  /**
   * Completion options used by LLMManager
   */
  public completionOptions: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    stopSequences?: string[];
  } = {
    maxTokens: 1024,  // Increased from 500 to allow longer responses
    temperature: 0.7,
    topP: 0.9,
    stopSequences: []
  };

  /**
   * Get the llama.rn version
   */
  public static async getVersion(): Promise<string> {
    if (!LlamaModel.isAvailable()) {
      throw new Error('llama.rn module not available');
    }
    try {
      // Return a placeholder version
      return "version not available";
    } catch (error) {
      console.error('[LlamaModel] Error getting llama.rn version:', error);
      throw error;
    }
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): LlamaModel {
    if (!LlamaModel.instance) {
      LlamaModel.instance = new LlamaModel();
    }
    return LlamaModel.instance;
  }
  
  /**
   * Destroy the singleton instance and release all resources
   */
  public static async destroyInstance(): Promise<void> {
    if (LlamaModel.instance) {
      console.log('[LlamaModel] Destroying singleton instance...');
      await LlamaModel.instance.destroy();
      LlamaModel.instance = null;
      
      // Also call releaseAllLlama if available
      if (typeof releaseAllLlama === 'function') {
        console.log('[LlamaModel] Calling releaseAllLlama...');
        try {
          await releaseAllLlama();
          console.log('[LlamaModel] Released all llama contexts');
        } catch (error) {
          console.error('[LlamaModel] Error calling releaseAllLlama:', error);
        }
      }
      
      console.log('[LlamaModel] Singleton instance destroyed');
    }
  }

  /**
   * Private constructor for singleton pattern
   */
  private constructor() {
    this.instanceId = uuidv4().substring(0, 8);
    this.id = `llama-${this.instanceId}`;
    this.created = Date.now();
    this.modified = Date.now();
    this.setState('uninitialized');
    
    console.log(`[LlamaModel:${this.instanceId}] Created new instance`);
  }
  
  /**
   * Update the model state and emit change event
   */
  private setState(newState: LLMModelState): void {
    const previousState = this.modelState;
    if (previousState === newState) return;
    
    // Clean up if transitioning from generating to any other state
    if (previousState === 'generating' && newState !== 'generating') {
      this.cleanupActiveGeneration();
    }
    
    this.modelState = newState;
    this.modified = Date.now();
    
    console.log(`[LlamaModel:${this.instanceId}] State changed: ${previousState} -> ${newState}`);
    this.onStateChanged.emit({ state: newState, previous: previousState });
    
    // Reset failure counter when model becomes ready
    if (newState === 'ready' && this.currentModelPath && this.failureCounter) {
      this.failureCounter.delete(this.currentModelPath);
    }
  }
  
  /**
   * Get the current model state
   */
  public getState(): LLMModelState {
    return this.modelState;
  }
  
  /**
   * Check if a model path has had too many failures
   */
  private hasTooManyFailures(modelPath: string): boolean {
    const failures = this.failureCounter.get(modelPath) || 0;
    return failures >= this.MAX_FAILURES;
  }
  
  /**
   * Record a failure for a model path
   */
  private recordFailure(modelPath: string): void {
    const failures = this.failureCounter.get(modelPath) || 0;
    this.failureCounter.set(modelPath, failures + 1);
    console.warn(`[LlamaModel:${this.instanceId}] Failure #${failures + 1} for ${modelPath}`);
  }
  
  /**
   * Load model file metadata and validate file access
   */
  private async loadModelMetadata(modelPath: string): Promise<void> {
    console.log(`[LlamaModel:${this.instanceId}] Loading metadata for ${modelPath}`);
    
    try {
      // Try to get file info using RNFS first, then fallback to Expo
      let fileInfo: { exists?: boolean; size?: number; mtime?: number | Date } | null = null;
      
      try {
        console.log(`[LlamaModel:${this.instanceId}] Checking file using RNFS: ${modelPath}`);
        const stats = await RNFS.stat(modelPath);
        if (stats && stats.isFile()) {
          fileInfo = {
            exists: true,
            size: stats.size,
            mtime: stats.mtime
          };
          console.log(`[LlamaModel:${this.instanceId}] RNFS stats: exists=${true}, size=${stats.size}`);
        }
      } catch (rnfsError: any) {
        console.log(`[LlamaModel:${this.instanceId}] RNFS error, trying Expo FileSystem:`, rnfsError);
        try {
          const expoInfo = await FileSystem.getInfoAsync(modelPath, { size: true }) as FileInfoWithSize;
          if (expoInfo.exists) {
            fileInfo = {
              exists: true,
              size: expoInfo.size,
              mtime: expoInfo.modificationTime
            };
            console.log(`[LlamaModel:${this.instanceId}] Expo FileSystem info: exists=${expoInfo.exists}, size=${expoInfo.size}`);
          }
        } catch (expoError: any) {
          console.warn(`[LlamaModel:${this.instanceId}] Failed to get file info:`, expoError);
          throw new Error(`Failed to access model file: ${expoError?.message || 'Unknown error'}`);
        }
      }
      
      if (fileInfo?.exists && fileInfo.size) {
        this.size = fileInfo.size;
        if (fileInfo.mtime) {
          this.modified = fileInfo.mtime instanceof Date 
            ? fileInfo.mtime.getTime() 
            : fileInfo.mtime;
        }
        console.log(`[LlamaModel:${this.instanceId}] Model file size: ${this.size} bytes`);
        
        // Check minimum model size - GGUF models should be at least 1MB
        if (this.size < 1024 * 1024) {
          throw new Error(`Model file too small (${this.size} bytes). Potentially corrupted or incomplete.`);
        }
      } else {
        throw new Error(`File not found or empty: ${modelPath}`);
      }
      
      // Check if the path contains simulator path which might cause issues
      if (Platform.OS === 'ios' && modelPath.includes('CoreSimulator')) {
        console.log(`[LlamaModel:${this.instanceId}] Model is in simulator path - this is expected but might affect performance`);
      }
      
      // Try to load model info for capabilities
      try {
        console.log(`[LlamaModel:${this.instanceId}] Loading model info...`);
        const { loadLlamaModelInfo } = await import('llama.rn');
        const modelInfo = await loadLlamaModelInfo(modelPath);
        console.log(`[LlamaModel:${this.instanceId}] Model info loaded:`, JSON.stringify(modelInfo, null, 2).substring(0, 500));
        
        // Extract useful metadata
        if (modelInfo && typeof modelInfo === 'object') {
          this.modelMetadata = {
            contextLength: modelInfo['llama.train.context_length'] || 
                          modelInfo['n_ctx_train'] || 
                          modelInfo['max_position_embeddings'] ||
                          2048,
            architecture: modelInfo['general.architecture'] || 'unknown',
            quantization: modelInfo['general.quantization_version'] || 'unknown',
            parameters: modelInfo['general.parameter_count'] || 0
          };
          console.log(`[LlamaModel:${this.instanceId}] Extracted metadata:`, this.modelMetadata);
        }
      } catch (error) {
        console.warn(`[LlamaModel:${this.instanceId}] Could not load model info (non-fatal):`, error);
        // Set default metadata
        this.modelMetadata = {
          contextLength: 2048,
          architecture: 'unknown',
          quantization: 'unknown',
          parameters: 0
        };
      }
      
    } catch (error) {
      console.error(`[LlamaModel:${this.instanceId}] Error loading model metadata:`, error);
      throw error;
    }
  }
  
  /**
   * Initialize or switch to a model
   * @param modelPath Path to the .gguf model file
   * @param optimizationOptions Optional parameters to speed up model initialization
   * @returns Promise resolving to true if initialization succeeded
   */
  public async initializeModel(
    modelPath: string, 
    optimizationOptions?: {
      contextSize?: number,
      batchSize?: number,
      threadCount?: number,
      useGPU?: boolean,
      lowMemoryMode?: boolean,
      modelAlias?: string
    }
  ): Promise<boolean> {
    console.log(`[LlamaModel:${this.instanceId}] Initializing model: ${modelPath}`);
    
    // Prevent concurrent initialization
    if (this.initializingPromise) {
      console.log(`[LlamaModel:${this.instanceId}] Another initialization in progress, waiting...`);
      return this.initializingPromise;
    }
    
    // Check if already initialized with this model
    if (this.modelState === 'ready' && this.currentModelPath === modelPath && this.activeContext) {
      console.log(`[LlamaModel:${this.instanceId}] Model already active`);
      return true;
    }
    
    // Check if too many failures for this model
    if (this.hasTooManyFailures(modelPath)) {
      console.error(`[LlamaModel:${this.instanceId}] Too many failures for ${modelPath}, giving up`);
      return false;
    }
    
    // Pass optimization options to the internal implementation
    const initPromise = this._initializeModel(modelPath, optimizationOptions);
    this.initializingPromise = initPromise;
    
    try {
      return await initPromise;
    } finally {
      this.initializingPromise = null;
    }
  }
  
  /**
   * Internal implementation of model initialization
   */
  private async _initializeModel(
    modelPath: string,
    optimizationOptions?: {
      contextSize?: number,
      batchSize?: number,
      threadCount?: number,
      useGPU?: boolean,
      lowMemoryMode?: boolean,
      modelAlias?: string
    }
  ): Promise<boolean> {
    this.setState('loading');
    this.currentModelPath = modelPath;
    
    try {
      // Release any existing context first
      if (this.activeContext) {
        await this.releaseContext();
      }
      
      // Verify RNLlama is available via the constant
      if (!LlamaModel.isAvailable()) {
        throw new Error('RNLlama native module not available or initContext method missing');
      }
      
      // Log the available methods on RNLlama for debugging
      console.log(`[LlamaModel:${this.instanceId}] Available RNLlama methods: ${Object.keys(RNLlama).filter(key => typeof RNLlama[key] === 'function').join(', ')}`);
      
      // Log Native module info
      console.log(`[LlamaModel:${this.instanceId}] RNLlama API check: initContext=${typeof RNLlama.initContext}, completion=${typeof RNLlama.completion}, releaseContext=${typeof RNLlama.releaseContext}`);
      
      // Load model metadata
      await this.loadModelMetadata(modelPath);
      
      // Prepare memory for model loading
      await ensureMemoryAvailable();
      
      // Check if model file exists in source path
      console.log(`[LlamaModel:${this.instanceId}] Verified model file exists with size: ${this.size} bytes`);
      
      // Generate a unique context ID - using a simple timestamp
      // This is sufficient for our purposes as initialization is serialized
      const contextId = Date.now();
      
      // Apply optimization options if provided, otherwise use defaults
      const params = {
        model: modelPath,
        n_ctx: optimizationOptions?.contextSize || this.modelMetadata?.contextLength || 2048,   // Use model's context length if available
        n_batch: optimizationOptions?.batchSize || 512,    // Default or customized batch size
        n_threads: optimizationOptions?.threadCount || 4,  // Default or customized thread count
        use_mlock: true,                                   // Always keep in memory
        no_gpu_devices: !optimizationOptions?.useGPU,      // Use CPU only as default 
        vocab_only: false,                                 // Need full model
      };
      
      // If lowMemoryMode is enabled, reduce context and batch sizes further
      if (optimizationOptions?.lowMemoryMode) {
        params.n_ctx = Math.min(params.n_ctx, 1024);    // Further reduced context size
        params.n_batch = Math.min(params.n_batch, 128); // Further reduced batch size
      }
      
      if (optimizationOptions?.modelAlias) {
        this.name = optimizationOptions.modelAlias;
      }
      
      // Log GPU/MLX usage
      if (optimizationOptions?.useGPU) {
        console.log(`[LlamaModel:${this.instanceId}] 🚀 MLX/GPU acceleration ENABLED on iOS`);
      } else {
        console.log(`[LlamaModel:${this.instanceId}] ⚠️ Running on CPU - MLX/GPU acceleration disabled`);
      }
      
      console.log(`[LlamaModel:${this.instanceId}] Optimized params: ${JSON.stringify(params)}`);
      
      // Use modern API if available
      if (useModernAPI) {
          console.log(`[LlamaModel:${this.instanceId}] Using modern initLlama API`);
          
          try {
            console.log(`[LlamaModel:${this.instanceId}] About to call initLlama with params:`, JSON.stringify(params, null, 2));
            console.log(`[LlamaModel:${this.instanceId}] Model file path: ${modelPath}`);
            console.log(`[LlamaModel:${this.instanceId}] Model file size: ${this.size} bytes`);
            
            // Add more detailed logging about the model file
            try {
              const fileInfo = await FileSystem.getInfoAsync(modelPath);
              console.log(`[LlamaModel:${this.instanceId}] FileSystem info:`, JSON.stringify(fileInfo, null, 2));
              
              // Check if we can read the first few bytes to verify it's a valid GGUF file
              if (fileInfo.exists) {
                // GGUF files should start with "GGUF" magic number
                const firstBytes = await FileSystem.readAsStringAsync(modelPath, {
                  length: 4,
                  position: 0,
                  encoding: FileSystem.EncodingType.Base64
                });
                console.log(`[LlamaModel:${this.instanceId}] First 4 bytes (base64): ${firstBytes}`);
                // Decode base64 to check magic number
                const decoded = atob(firstBytes);
                console.log(`[LlamaModel:${this.instanceId}] Magic number: ${decoded}`);
                if (decoded !== 'GGUF') {
                  console.warn(`[LlamaModel:${this.instanceId}] WARNING: File doesn't start with GGUF magic number, might be corrupted`);
                }
              }
            } catch (infoError) {
              console.error(`[LlamaModel:${this.instanceId}] Error checking file info:`, infoError);
            }
            
            // Use modern API with progress callback
            const progressCallback = (progress: number) => {
              // normalise 0-100
              const percentageNum = typeof progress === 'number' ? (progress > 1 ? progress : progress * 100) : Number(progress);
              const percentage = isNaN(percentageNum) ? 0 : percentageNum;
              console.log(`[LlamaModel:${this.instanceId}] Model loading progress: ${percentage.toFixed(1)}%`);

              // Forward progress to UI via the existing onTokenGenerated event so callers
              // can display a single unified progress bar.  Use 0-85 % range for loading
              // phase so generation (which usually begins around 90 %) can smoothly take
              // over afterwards.
              const capped = Math.min(Math.max(percentage * 0.85, 1), 85);
              this.onTokenGenerated.emit({ token: '', progress: Math.round(capped) });
            };
            
            // Try with reduced parameters for simulator
            const isSimulator = Platform.OS === 'ios' && modelPath.includes('CoreSimulator');
            const simulatorParams = {
              model: params.model,
              n_ctx: isSimulator ? 512 : params.n_ctx, // Reduce context for simulator
              n_batch: isSimulator ? 128 : params.n_batch, // Reduce batch size
              n_threads: isSimulator ? 2 : params.n_threads, // Reduce threads for simulator
              use_mlock: isSimulator ? false : params.use_mlock, // Disable mlock for simulator
              n_gpu_layers: isSimulator ? 0 : (params.no_gpu_devices ? 0 : 99), // Disable GPU for simulator
            };
            
            console.log(`[LlamaModel:${this.instanceId}] Using ${isSimulator ? 'simulator' : 'device'} parameters:`, JSON.stringify(simulatorParams, null, 2));
            
            const context = await initLlama(simulatorParams, progressCallback);
            
            console.log(`[LlamaModel:${this.instanceId}] initLlama succeeded, context:`, context);
            console.log(`[LlamaModel:${this.instanceId}] Context type:`, typeof context);
            console.log(`[LlamaModel:${this.instanceId}] Context constructor:`, context?.constructor?.name);
            console.log(`[LlamaModel:${this.instanceId}] Context is LlamaContext:`, context instanceof LlamaContext);
            console.log(`[LlamaModel:${this.instanceId}] Context keys:`, context ? Object.keys(context) : 'null');
            
            // Check all properties and methods
            if (context) {
              console.log(`[LlamaModel:${this.instanceId}] Context properties and methods:`);
              for (const key in context) {
                console.log(`[LlamaModel:${this.instanceId}]   - ${key}: ${typeof context[key]}`);
              }
              // Check prototype methods
              const proto = Object.getPrototypeOf(context);
              if (proto) {
                console.log(`[LlamaModel:${this.instanceId}] Context prototype methods:`);
                Object.getOwnPropertyNames(proto).forEach(name => {
                  if (typeof proto[name] === 'function' && name !== 'constructor') {
                    console.log(`[LlamaModel:${this.instanceId}]   - ${name}: function`);
                  }
                });
              }
            }
            
            // Store the modern context
            this.modernContext = context;
            console.log(`[LlamaModel:${this.instanceId}] Stored modernContext, has completion method:`, typeof context?.completion);
            
            this.activeContext = {
              id: context.id || `modern-${this.instanceId}`,
              gpu: context.gpu || false,
              reasonNoGPU: context.reasonNoGPU || '',
              model: context.model || {}
            };
            
            // Extract actual loaded context size from model info
            if (context.model && typeof context.model === 'object') {
              const actualContextSize = context.model.n_ctx || context.model.context_length || params.n_ctx;
              console.log(`[LlamaModel:${this.instanceId}] Actual loaded context size: ${actualContextSize}`);
              
              // Update metadata with actual values
              if (this.modelMetadata) {
                this.modelMetadata.contextLength = actualContextSize;
              }
            }
            
            // Update state and emit event
            this.setState('ready');
            this.onModelChanged.emit(modelPath);
            
            return true;
          } catch (specificError: any) {
            console.error(`[LlamaModel:${this.instanceId}] initLlama failed with specific error:`, specificError);
            console.error(`[LlamaModel:${this.instanceId}] Error type: ${specificError?.constructor?.name}`);
            console.error(`[LlamaModel:${this.instanceId}] Error message: ${specificError?.message || 'Unknown error'}`);
            console.error(`[LlamaModel:${this.instanceId}] Error code: ${specificError?.code || 'none'}`);
            console.error(`[LlamaModel:${this.instanceId}] Error stack: ${specificError?.stack || 'No stack trace'}`);
            
            // Log full error object
            console.error(`[LlamaModel:${this.instanceId}] Full error object:`, JSON.stringify(specificError, null, 2));
            
            // Check for common error patterns
            if (specificError?.message?.includes('memory') || specificError?.message?.includes('alloc')) {
              console.error(`[LlamaModel:${this.instanceId}] MEMORY ERROR: Not enough memory to load model`);
              console.error(`[LlamaModel:${this.instanceId}] Try: 1) Using a smaller model, 2) Closing other apps, 3) Restarting the device`);
            } else if (specificError?.message?.includes('format') || specificError?.message?.includes('magic')) {
              console.error(`[LlamaModel:${this.instanceId}] FORMAT ERROR: Model file format not compatible`);
              console.error(`[LlamaModel:${this.instanceId}] This model may require a different quantization format`);
            } else if (specificError?.message?.includes('file') || specificError?.message?.includes('open')) {
              console.error(`[LlamaModel:${this.instanceId}] FILE ERROR: Cannot read model file`);
              console.error(`[LlamaModel:${this.instanceId}] Check file permissions and path: ${modelPath}`);
            }
            
            // Check for simulator-specific issues
            if (Platform.OS === 'ios' && modelPath.includes('CoreSimulator')) {
              console.warn(`[LlamaModel:${this.instanceId}] Model loading in simulator can be problematic. Consider testing on a real device.`);
            }
            
            throw specificError;
          }
        } else {
          // Fall back to legacy API
          console.log(`[LlamaModel:${this.instanceId}] Using legacy RNLlama.initContext API`);
          console.log(`[LlamaModel:${this.instanceId}] Calling RNLlama.initContext with ID: ${contextId}`);
          
          // Try-catch with more detailed logging
          let context;
          try {
            console.log(`[LlamaModel:${this.instanceId}] About to call RNLlama.initContext with params:`, JSON.stringify(params, null, 2));
            console.log(`[LlamaModel:${this.instanceId}] Model file path: ${modelPath}`);
            console.log(`[LlamaModel:${this.instanceId}] Model file size: ${this.size} bytes`);
            
            context = await RNLlama.initContext(contextId, params);
            console.log(`[LlamaModel:${this.instanceId}] initContext succeeded`);
          } catch (specificError: any) {
            console.error(`[LlamaModel:${this.instanceId}] initContext failed with specific error:`, specificError);
            console.error(`[LlamaModel:${this.instanceId}] Error type: ${specificError?.constructor?.name}`);
            console.error(`[LlamaModel:${this.instanceId}] Error message: ${specificError?.message || 'Unknown error'}`);
            console.error(`[LlamaModel:${this.instanceId}] Error code: ${specificError?.code || 'none'}`);
            console.error(`[LlamaModel:${this.instanceId}] Error stack: ${specificError?.stack || 'No stack trace'}`);
            
            // Log full error object
            console.error(`[LlamaModel:${this.instanceId}] Full error object:`, JSON.stringify(specificError, null, 2));
            
            // Check for common error patterns
            if (specificError?.message?.includes('memory') || specificError?.message?.includes('alloc')) {
              console.error(`[LlamaModel:${this.instanceId}] MEMORY ERROR: Not enough memory to load model`);
              console.error(`[LlamaModel:${this.instanceId}] Try: 1) Using a smaller model, 2) Closing other apps, 3) Restarting the device`);
            } else if (specificError?.message?.includes('format') || specificError?.message?.includes('magic')) {
              console.error(`[LlamaModel:${this.instanceId}] FORMAT ERROR: Model file format not compatible`);
              console.error(`[LlamaModel:${this.instanceId}] This model may require a different quantization format`);
            } else if (specificError?.message?.includes('file') || specificError?.message?.includes('open')) {
              console.error(`[LlamaModel:${this.instanceId}] FILE ERROR: Cannot read model file`);
              console.error(`[LlamaModel:${this.instanceId}] Check file permissions and path: ${modelPath}`);
            }
            
            // Check for simulator-specific issues
            if (Platform.OS === 'ios' && modelPath.includes('CoreSimulator')) {
              console.warn(`[LlamaModel:${this.instanceId}] Model loading in simulator can be problematic. Consider testing on a real device.`);
            }
            
            throw specificError;
          }
          
          console.log(`[LlamaModel:${this.instanceId}] initContext result type: ${typeof context}`);
          if (context) {
            console.log(`[LlamaModel:${this.instanceId}] initContext result:`, context);
          }
          
          // Verify the context is valid
          if (!context) {
            console.error(`[LlamaModel:${this.instanceId}] initContext returned null or undefined`);
            throw new Error('Null context returned from initContext');
          }
          
          if (typeof context !== 'object') {
            console.error(`[LlamaModel:${this.instanceId}] initContext returned non-object:`, context);
            throw new Error(`Invalid context type returned from initContext: ${typeof context}`);
          }
          
          // Create a context info object with the contextId we supplied
          // The native module might return its own ID or other data
          this.activeContext = {
            id: contextId,
            gpu: false, // Don't try to access potentially missing props
            reasonNoGPU: '',
            model: {}
          };
          
          console.log(`[LlamaModel:${this.instanceId}] Model initialized successfully: ID=${contextId}`);
          
          // Update state and emit event
          this.setState('ready');
          this.onModelChanged.emit(modelPath);
          
          return true;
        }
    } catch (error) {
      console.error(`[LlamaModel:${this.instanceId}] Failed to initialize model ${modelPath}:`, error);
      this.recordFailure(modelPath);
      this.setState('error'); 
      return false;
    }
  }
  
  /**
   * Clean up any active generation resources
   */
  private cleanupActiveGeneration(): void {
    console.log(`[LlamaModel:${this.instanceId}] Cleaning up active generation`);
    
    // Clear generation ID
    this.activeGenerationId = null;
    
    // Clear any active timers
    if (this.activeTimeoutHandle) {
      clearTimeout(this.activeTimeoutHandle);
      this.activeTimeoutHandle = null;
    }
    if (this.activeIntervalHandle) {
      clearInterval(this.activeIntervalHandle);
      this.activeIntervalHandle = null;
    }
    
    // Try to stop any ongoing completion
    if (this.modernContext && this.modelState === 'generating') {
      this.modernContext.stopCompletion().catch(err => {
        console.warn(`[LlamaModel:${this.instanceId}] Error stopping completion during cleanup:`, err);
      });
    }
  }
  
  /**
   * Reset error state and clear failure history for a model
   */
  public resetErrorState(modelPath?: string): void {
    console.log(`[LlamaModel:${this.instanceId}] Resetting error state`);
    
    if (this.modelState === 'error') {
      this.setState('uninitialized');
    }
    
    if (modelPath) {
      this.failureCounter.delete(modelPath);
      console.log(`[LlamaModel:${this.instanceId}] Cleared failure history for ${modelPath}`);
    } else {
      this.failureCounter.clear();
      console.log(`[LlamaModel:${this.instanceId}] Cleared all failure history`);
    }
  }

  /**
   * Generate embeddings for text
   * @param text The text to embed
   * @returns Array of numbers representing the embedding
   */
  public async generateEmbedding(text: string): Promise<number[]> {
    if (!useModernAPI || !this.modernContext) {
      throw new Error('Embeddings require modern llama.rn API');
    }
    
    try {
      console.log(`[LlamaModel:${this.instanceId}] Generating embedding for text: "${text.substring(0, 50)}..."`);
      const result = await this.modernContext.embedding(text);
      return result;
    } catch (error) {
      console.error(`[LlamaModel:${this.instanceId}] Error generating embedding:`, error);
      throw error;
    }
  }

  /**
   * Process an image for multimodal input
   * @param imagePath Path to the image file
   * @returns Processed image data for model input
   */
  public async processImage(imagePath: string): Promise<any> {
    if (!useModernAPI || !this.modernContext) {
      throw new Error('Image processing requires modern llama.rn API');
    }
    
    try {
      console.log(`[LlamaModel:${this.instanceId}] Processing image: ${imagePath}`);
      // The modern API handles image loading internally
      return imagePath;
    } catch (error) {
      console.error(`[LlamaModel:${this.instanceId}] Error processing image:`, error);
      throw error;
    }
  }

  /**
   * Generate a chat completion with message history
   * @param messages Array of chat messages with roles
   * @param options Generation parameters
   * @returns Generated response
   */
  public async chatCompletion(
    messages: Array<{
      role: 'system' | 'user' | 'assistant';
      content: string;
      images?: string[];
    }>,
    options?: Partial<GenerationParams>
  ): Promise<string> {
    console.log(`[LlamaModel:${this.instanceId}] chatCompletion called with ${messages.length} messages`);
    console.log(`[LlamaModel:${this.instanceId}] useModernAPI: ${useModernAPI}, modernContext: ${!!this.modernContext}`);
    
    if (!useModernAPI || !this.modernContext) {
      console.log(`[LlamaModel:${this.instanceId}] Falling back to prompt-based completion`);
      // Fall back to regular completion with formatted prompt
      const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n') + '\nassistant:';
      return this.complete(prompt, options);
    }
    
    // Check if already generating to prevent concurrent completions
    if (this.modelState === 'generating') {
      console.warn(`[LlamaModel:${this.instanceId}] Attempted to start completion while already generating. Attempting to stop...`);
      
      // Try to stop any ongoing completion
      try {
        if (this.modernContext && typeof this.modernContext.stopCompletion === 'function') {
          console.log(`[LlamaModel:${this.instanceId}] Stopping ongoing completion...`);
          await this.modernContext.stopCompletion();
          
          // Reset state
          this.activeGenerationId = null;
          this.setState('ready');
          
          // Wait a bit for the context to settle
          await new Promise(resolve => setTimeout(resolve, 100));
          console.log(`[LlamaModel:${this.instanceId}] Previous completion stopped, proceeding with new request`);
        } else {
          throw new Error('Model is already generating a response. Please wait for the current generation to complete.');
        }
      } catch (stopError) {
        console.error(`[LlamaModel:${this.instanceId}] Failed to stop ongoing completion:`, stopError);
        throw new Error('Model is already generating a response and could not be stopped.');
      }
    }
    
    try {
      this.setState('generating');
      
      console.log(`[LlamaModel:${this.instanceId}] Generating chat completion with ${messages.length} messages`);
      
      // Log the full messages array
      console.log(`[LlamaModel:${this.instanceId}] === LLM INPUT MESSAGES START ===`);
      messages.forEach((msg, index) => {
        console.log(`[LlamaModel:${this.instanceId}] [${index}] ${msg.role.toUpperCase()}: ${msg.content}`);
      });
      console.log(`[LlamaModel:${this.instanceId}] === LLM INPUT MESSAGES END ===`);
      
      // Build options for llama.rn API with messages
      // Note: llama.rn expects CompletionParams, not raw options
      // Calculate appropriate max tokens based on context and prompt
      const promptLength = JSON.stringify(messages).length;
      const promptTokenEstimate = Math.ceil(promptLength / 4); // Rough estimate: 4 chars per token
      const contextSize = this.activeContext?.model?.n_ctx || this.modelMetadata?.contextLength || 2048;
      
      // Leave buffer for prompt and safety margin
      const maxPossibleTokens = Math.max(256, contextSize - promptTokenEstimate - 100);
      const requestedTokens = options?.max_tokens ?? 1024;
      const maxTokens = Math.min(requestedTokens, maxPossibleTokens);
      
      console.log(`[LlamaModel:${this.instanceId}] Token calculation: context=${contextSize}, prompt_estimate=${promptTokenEstimate}, max_possible=${maxPossibleTokens}, using=${maxTokens}`);
      const completionOptions: any = {
        messages,
        n_predict: maxTokens,
        temperature: options?.temperature ?? 0.7,
        top_k: options?.top_k ?? 40,
        top_p: options?.top_p ?? 0.95,
        stop: options?.stop || [],
        n_threads: 4,
        // Add seed for reproducibility
        seed: -1,
        // Enable immediate streaming without buffering
        stream: true
      };
      
      console.log(`[LlamaModel:${this.instanceId}] Max tokens (n_predict): ${maxTokens}`);
      
      // Add advanced features if provided
      if (options?.grammar) {
        completionOptions.grammar = options.grammar;
      }
      
      if (options?.tools) {
        completionOptions.tools = options.tools;
        if (options.tool_choice) {
          completionOptions.tool_choice = options.tool_choice;
        }
      }
      
      // Generate completion with streaming support
      let tokenCount = 0;
      
      // Emit initial progress for generation phase – we have already
      // reported loading progress up to ~85 %.  Jump to 90 % so the UI
      // indicates that token generation has actually started.
      this.onTokenGenerated.emit({ token: '', progress: 90 });
      
      // Track tokens for manual completion detection
      let allTokens = '';
      let lastTokenTime = Date.now();
      
      // Create token callback for streaming
      const tokenCallback = (data: any) => {
        // Check if this callback is for the current generation
        if (this.activeGenerationId !== generationId) {
          console.log(`[LlamaModel:${this.instanceId}] Ignoring token from old generation (current: ${this.activeGenerationId}, received: ${generationId})`);
          return;
        }
        
        // Remove verbose token logging for performance
        
        if (data && data.token) {
          tokenCount++;
          allTokens += data.token;
          lastTokenTime = Date.now();
          
          // Calculate progress based on actual max tokens
          const estimatedTokens = Math.min(maxTokens, 500); // More realistic estimate
          // Scale token progress into the 90-99 % range
          const rawProgress = (tokenCount / estimatedTokens) * 9;
          const progress = 90 + Math.min(Math.round(rawProgress), 9);
          
          // Log every 50 tokens to reduce console spam
          if (tokenCount % 50 === 0) {
            console.log(`[LlamaModel:${this.instanceId}] Generated ${tokenCount} tokens, total length: ${allTokens.length}`);
          }
          
          // Emit every token for real-time streaming
          // This ensures smooth UI updates
          const shouldEmit = true;
          
          if (shouldEmit) {
            // Only log progress every 25 tokens to reduce console spam
            if (tokenCount % 25 === 0) {
              console.log(`[LlamaModel:${this.instanceId}] Progress: ${progress}% (${tokenCount} tokens)`)
            };
            this.onTokenGenerated.emit({
              token: data.token,
              progress: progress
            });
          }
        }
      };
      
      // Generate unique ID for this completion to prevent callback confusion
      const generationId = `gen-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this.activeGenerationId = generationId;
      
      // Add intelligent timeout that can return partial results
      const timeoutMs = 60000; // 60 seconds timeout (increased from 30s)
      const checkInterval = 1000; // Check every second
      let timeoutHandle: NodeJS.Timeout;
      let intervalHandle: NodeJS.Timeout;
      
      const timeoutPromise = new Promise<any>((resolve, reject) => {
        // Check periodically if we're still receiving tokens
        intervalHandle = setInterval(async () => {
          // Check if this interval is still for the active generation
          if (this.activeGenerationId !== generationId) {
            clearInterval(intervalHandle);
            return;
          }
        
          const timeSinceLastToken = Date.now() - lastTokenTime;
          if (tokenCount > 0 && timeSinceLastToken > 5000) {
            // No new tokens for 5 seconds, consider it complete
            console.log(`[LlamaModel:${this.instanceId}] No new tokens for 5s, stopping completion and returning result`);
            clearInterval(intervalHandle);
            clearTimeout(timeoutHandle);
            
            // Try to stop the completion to force it to resolve
            try {
              console.log(`[LlamaModel:${this.instanceId}] Calling stopCompletion to force resolution...`);
              await this.modernContext.stopCompletion();
              // Give it a moment to clean up
              await new Promise(resolve => setTimeout(resolve, 100));
            } catch (stopErr) {
              console.warn(`[LlamaModel:${this.instanceId}] Error stopping completion:`, stopErr);
            }
            
            // Return the accumulated tokens
            resolve({
              text: allTokens,
              tokens_predicted: tokenCount,
              stopped_eos: false,
              stopped_limit: true,
              timings: { predicted_ms: Date.now() - lastTokenTime }
            });
          }
        }, checkInterval);
        
        // Store interval handle for cleanup
        this.activeIntervalHandle = intervalHandle;
        
        // Hard timeout
        timeoutHandle = setTimeout(async () => {
          // Check if this timeout is still for the active generation
          if (this.activeGenerationId !== generationId) {
            return;
          }
          clearInterval(intervalHandle);
          if (tokenCount > 0) {
            console.log(`[LlamaModel:${this.instanceId}] Hard timeout reached with ${tokenCount} tokens`);
            
            // Try to stop the completion
            try {
              await this.modernContext.stopCompletion();
            } catch (stopErr) {
              console.warn(`[LlamaModel:${this.instanceId}] Error stopping completion on timeout:`, stopErr);
            }
            
            resolve({
              text: allTokens,
              tokens_predicted: tokenCount,
              stopped_eos: false,
              stopped_limit: true,
              timings: { predicted_ms: timeoutMs }
            });
          } else {
            console.error(`[LlamaModel:${this.instanceId}] Chat completion timed out with no tokens`);
            reject(new Error(`Chat completion timed out after ${timeoutMs}ms`));
          }
        }, timeoutMs);
        
        // Store timeout handle for cleanup
        this.activeTimeoutHandle = timeoutHandle;
      });

      console.log(`[LlamaModel:${this.instanceId}] Starting chat completion with ${completionOptions.messages.length} messages`);

      try {
        // Call completion with streaming callback, with timeout
        console.log(`[LlamaModel:${this.instanceId}] Calling modernContext.completion...`);
        
        const completionPromise = this.modernContext.completion(completionOptions, tokenCallback);
        
        console.log(`[LlamaModel:${this.instanceId}] Completion promise created, racing against timeout...`);
        
        const result = await Promise.race([
          completionPromise.then(res => {
            console.log(`[LlamaModel:${this.instanceId}] Completion promise resolved successfully`);
            return res;
          }).catch(err => {
            console.error(`[LlamaModel:${this.instanceId}] Completion promise rejected:`, err);
            throw err;
          }),
          timeoutPromise.then(res => {
            console.log(`[LlamaModel:${this.instanceId}] TIMEOUT FIRED! Partial result available: ${allTokens.length} chars`);
            return res;
          })
        ]);
        
        // Clean up timers
        clearInterval(intervalHandle);
        clearTimeout(timeoutHandle);
        this.activeTimeoutHandle = null;
        this.activeIntervalHandle = null;
        
        console.log(`[LlamaModel:${this.instanceId}] Promise.race completed, result type: ${typeof result}`);
        console.log(`[LlamaModel:${this.instanceId}] Total tokens collected: ${tokenCount}, length: ${allTokens.length}`);
        
        // Emit 100% completion
        this.onTokenGenerated.emit({
          token: '',
          progress: 100
        });
        
        // Clear generation ID before setting state to ready
        this.activeGenerationId = null;
        this.setState('ready');
        
        // Handle result format
        console.log(`[LlamaModel:${this.instanceId}] Handling result, type: ${typeof result}`);
        console.log(`[LlamaModel:${this.instanceId}] Result value:`, JSON.stringify(result).substring(0, 200));
        
        // Check if this was a timeout with partial tokens
        if (allTokens && tokenCount > 0) {
          console.log(`[LlamaModel:${this.instanceId}] Using accumulated tokens (${tokenCount} tokens, ${allTokens.length} chars)`);
          console.log(`[LlamaModel:${this.instanceId}] === LLM OUTPUT START ===`);
          console.log(allTokens);
          console.log(`[LlamaModel:${this.instanceId}] === LLM OUTPUT END ===`);
          return allTokens;
        } else if (result && typeof result === 'object' && 'text' in result) {
          console.log(`[LlamaModel:${this.instanceId}] === LLM OUTPUT START ===`);
          console.log(result.text);
          console.log(`[LlamaModel:${this.instanceId}] === LLM OUTPUT END ===`);
          return result.text;
        } else if (typeof result === 'string') {
          console.log(`[LlamaModel:${this.instanceId}] === LLM OUTPUT START ===`);
          console.log(result);
          console.log(`[LlamaModel:${this.instanceId}] === LLM OUTPUT END ===`);
          return result;
        } else {
          console.error(`[LlamaModel:${this.instanceId}] Invalid result format:`, result);
          throw new Error('Invalid chat completion result');
        }
      } catch (completionError) {
        // Clean up timers on error
        if (intervalHandle) clearInterval(intervalHandle);
        if (timeoutHandle) clearTimeout(timeoutHandle);
        
        console.error(`[LlamaModel:${this.instanceId}] Chat completion failed:`, completionError);
        
        // Clean up generation state
        this.activeGenerationId = null;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (intervalHandle) clearInterval(intervalHandle);
        this.activeTimeoutHandle = null;
        this.activeIntervalHandle = null;
        
        // If context is busy, try to stop any ongoing completion
        if (completionError && completionError.message && completionError.message.includes('Context is busy')) {
          console.warn(`[LlamaModel:${this.instanceId}] Context is busy error detected, attempting to stop completion...`);
          try {
            if (this.modernContext && typeof this.modernContext.stopCompletion === 'function') {
              await this.modernContext.stopCompletion();
              console.log(`[LlamaModel:${this.instanceId}] Stopped busy context`);
            }
          } catch (stopErr) {
            console.error(`[LlamaModel:${this.instanceId}] Failed to stop busy context:`, stopErr);
          }
        }
        
        this.setState('ready'); // Reset state on error
        throw completionError;
      }
    } catch (error) {
      // Ensure cleanup on any error
      this.activeGenerationId = null;
      if (this.activeTimeoutHandle) {
        clearTimeout(this.activeTimeoutHandle);
        this.activeTimeoutHandle = null;
      }
      if (this.activeIntervalHandle) {
        clearInterval(this.activeIntervalHandle);
        this.activeIntervalHandle = null;
      }
      
      this.setState('ready');
      console.error(`[LlamaModel:${this.instanceId}] Chat completion error:`, error);
      throw error;
    }
  }

  /**
   * Check if the model supports multimodal input
   */
  public supportsMultimodal(): boolean {
    if (!useModernAPI || !this.modernContext) {
      return false;
    }
    
    // Check if the model has vision capabilities
    try {
      // This will be available in the context metadata
      return this.activeContext?.model?.supportsVision || false;
    } catch {
      return false;
    }
  }

  /**
   * Generate a completion from a prompt (optimized for faster response)
   */
  public async complete(prompt: string, options?: Partial<GenerationParams>): Promise<string> {
    // Verify state
    if (this.modelState !== 'ready' || !this.activeContext) {
      throw new Error(`Cannot generate completion: model not ready (state: ${this.modelState})`);
    }
    
    // Trim the prompt to save processing time
    const trimmedPrompt = prompt.length > 4000 ? prompt.slice(-4000) : prompt;
    console.log(`[LlamaModel:${this.instanceId}] Generating completion for prompt (${trimmedPrompt.length} chars): "${trimmedPrompt.substring(0, 50)}..."`);
    
    try {
      this.setState('generating');
      
      // Default parameters for generation
      const defaultFastParams = {
        temperature: 0.7,     // Balanced temperature for good quality responses
        top_k: 40,            // Standard sampling parameter
        top_p: 0.9,           // Standard nucleus sampling
        repeat_penalty: 1.1,  // Slight penalty to avoid repetition
        max_tokens: 1024,     // Allow longer responses (was 250)
        stop: ["User:", "Human:", "<|im_end|>"] // Stop tokens without \n\n to allow multi-paragraph responses
      };
      
      // Combine default fast params with custom parameters
      const params = {
        prompt: trimmedPrompt,
        ...defaultFastParams,
        ...options
      };
      
      console.log(`[LlamaModel:${this.instanceId}] Completion parameters:`, JSON.stringify(params));
      
      // Use modern API if available
      if (useModernAPI && this.modernContext) {
        console.log(`[LlamaModel:${this.instanceId}] Using modern completion API`);
        
        // Log what methods are available on modernContext
        console.log(`[LlamaModel:${this.instanceId}] Modern context methods:`, Object.keys(this.modernContext));
        console.log(`[LlamaModel:${this.instanceId}] Modern context type:`, typeof this.modernContext);
        console.log(`[LlamaModel:${this.instanceId}] Has completion method:`, typeof this.modernContext.completion);
        
        // Log all properties including inherited ones
        for (const key in this.modernContext) {
          console.log(`[LlamaModel:${this.instanceId}] Modern context property '${key}':`, typeof this.modernContext[key]);
        }
        
        // Check if completion is a function
        if (typeof this.modernContext.completion !== 'function') {
          console.error(`[LlamaModel:${this.instanceId}] ERROR: completion is not a function on modernContext`);
          console.error(`[LlamaModel:${this.instanceId}] modernContext object:`, this.modernContext);
          throw new Error('Modern context does not have completion method');
        }
        
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise<any>((_, reject) => {
          setTimeout(() => reject(new Error('Completion timed out')), 60000); // 60 second timeout (was 20)
        });
        
        // Build completion options with multimodal support
        // Use n_predict instead of max_tokens for llama.rn
        const completionOptions: any = {
          prompt: trimmedPrompt,
          n_predict: params.max_tokens || 1024,
          temperature: params.temperature,
          top_k: params.top_k,
          top_p: params.top_p,
          repeat_penalty: params.repeat_penalty,
          stop: params.stop || []
        };
        
        // Add multimodal inputs if provided
        if (options?.images && options.images.length > 0) {
          console.log(`[LlamaModel:${this.instanceId}] Adding ${options.images.length} images to completion`);
          completionOptions.images = options.images;
        }
        
        if (options?.audio) {
          console.log(`[LlamaModel:${this.instanceId}] Adding audio to completion`);
          completionOptions.audio = options.audio;
        }
        
        // Add grammar if provided
        if (options?.grammar) {
          console.log(`[LlamaModel:${this.instanceId}] Using grammar for constrained generation`);
          completionOptions.grammar = options.grammar;
        }
        
        // Add tools if provided
        if (options?.tools && options.tools.length > 0) {
          console.log(`[LlamaModel:${this.instanceId}] Adding ${options.tools.length} tools for function calling`);
          completionOptions.tools = options.tools;
          if (options.tool_choice) {
            completionOptions.tool_choice = options.tool_choice;
          }
        }
        
        try {
          // Log the actual completion call
          console.log(`[LlamaModel:${this.instanceId}] Calling modernContext.completion with options:`, JSON.stringify({
            ...completionOptions,
            prompt: completionOptions.prompt.substring(0, 100) + '...'
          }, null, 2));
          
          // Generate completion with streaming support
          let tokenCount = 0;
          const maxTokens = params.max_tokens || completionOptions.n_predict || 1024;
          
          // Emit initial progress
          this.onTokenGenerated.emit({
            token: '',
            progress: 0.1
          });
          
          // Create token callback for streaming
          const tokenCallback = (data: any) => {
            if (data && data.token) {
              tokenCount++;
              
              // Calculate progress (cap at 99% during generation)
              const estimatedTokens = Math.min(maxTokens, 100);
              const rawProgress = (tokenCount / estimatedTokens) * 100;
              const progress = Math.min(Math.round(rawProgress), 99);
              
              // Emit progress at intervals
              const shouldEmit = tokenCount === 1 || 
                               tokenCount % 10 === 0 ||
                               progress >= 95;
              
              if (shouldEmit) {
                this.onTokenGenerated.emit({
                  token: data.token,
                  progress: progress
                });
              }
            }
          };
          
          // Race the completion against the timeout  
          const result = await Promise.race([
            this.modernContext.completion(completionOptions, tokenCallback),
            timeoutPromise
          ]);
          
          // Emit 100% completion
          console.log(`[LlamaModel:${this.instanceId}] Emitting 100% completion progress`);
          this.onTokenGenerated.emit({
            token: '',
            progress: 100
          });
          
          console.log(`[LlamaModel:${this.instanceId}] Modern completion result type: ${typeof result}`);
          console.log(`[LlamaModel:${this.instanceId}] Modern completion result:`, result);
          
          // Extract text from result
          if (result && typeof result === 'object' && 'text' in result) {
            this.setState('ready');
            return result.text;
          } else if (typeof result === 'string') {
            this.setState('ready');
            return result;
          } else {
            console.error(`[LlamaModel:${this.instanceId}] Unexpected result format:`, result);
            throw new Error('Invalid completion result format');
          }
        } catch (completionError) {
          console.error(`[LlamaModel:${this.instanceId}] Completion error:`, completionError);
          console.error(`[LlamaModel:${this.instanceId}] Error details:`, {
            message: completionError.message,
            stack: completionError.stack,
            name: completionError.name
          });
          throw completionError;
        }
      } else {
        // Fall back to legacy API
        // Get the context ID directly
        const contextId = this.activeContext.id;
        console.log(`[LlamaModel:${this.instanceId}] Using context with ID: ${contextId}`);
        
        // Verify RNLlama constant and completion function exist
        if (!RNLlama || typeof RNLlama.completion !== 'function') {
          throw new Error('completion function not available in RNLlama native module');
        }
        
        console.log(`[LlamaModel:${this.instanceId}] Calling RNLlama.completion with ID: ${contextId}`);
        
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise<any>((_, reject) => {
          setTimeout(() => reject(new Error('Completion timed out')), 60000); // 60 second timeout (was 20)
        });
        
        // Race the completion against the timeout
        const result = await Promise.race([
          RNLlama.completion(contextId, params),
          timeoutPromise
        ]);
        
        // Process legacy result
        return this.processCompletionResult(result);
      }
      
      console.log(`[LlamaModel:${this.instanceId}] Completion result type: ${typeof result}`);
      if (result) {
        console.log(`[LlamaModel:${this.instanceId}] Completion result properties:`, Object.keys(result));
        console.log(`[LlamaModel:${this.instanceId}] Completion finished, tokens: ${result.tokens_predicted || 'unknown'}`);
      } else {
        console.warn(`[LlamaModel:${this.instanceId}] Completion returned null or undefined result`);
      }
      
      // Return to ready state
      this.setState('ready');
      
      // Extract text from result with fallbacks
      let text = '';
      if (result) {
        if (typeof result.content === 'string' && result.content) {
          text = result.content;
        } else if (typeof result.text === 'string' && result.text) {
          text = result.text;
        } else {
          console.warn(`[LlamaModel:${this.instanceId}] No content or text in completion result:`, result);
        }
      }
      
      return text || '';
    } catch (error) {
      console.error(`[LlamaModel:${this.instanceId}] Completion failed:`, error);
      this.setState('error'); // Set error state on failure
      throw error;
    }
  }
  
  /**
   * Release the current context
   */
  public async releaseContext(): Promise<void> {
    if (!this.activeContext) {
      console.log(`[LlamaModel:${this.instanceId}] No active context to release`);
      return;
    }
    
    // Get the contextId directly
    const contextId = this.activeContext.id;
    console.log(`[LlamaModel:${this.instanceId}] Releasing context with ID: ${contextId}`);
    
    // Clear references first to prevent reuse
    this.activeContext = null;
    
    try {
      // Verify RNLlama has the function
      if (typeof RNLlama.releaseContext !== 'function') {
        throw new Error('releaseContext function not available in RNLlama');
      }
      
      console.log(`[LlamaModel:${this.instanceId}] Calling RNLlama.releaseContext with ID: ${contextId}`);
      await RNLlama.releaseContext(contextId);
      console.log(`[LlamaModel:${this.instanceId}] Context released successfully`);
    } catch (error) {
      console.error(`[LlamaModel:${this.instanceId}] Error releasing context:`, error);
    }
    
    this.setState('released');
  }
  
  /**
   * Clean up all resources
   */
  public async destroy(): Promise<void> {
    console.log(`[LlamaModel:${this.instanceId}] Destroying LlamaModel instance`);
    
    // Release current context
    await this.releaseContext();
    
    // Clear state
    this.failureCounter.clear();
    this.currentModelPath = '';
    
    this.setState('uninitialized');
  }
  
  /**
   * Get model and context information
   */
  public getModelInfo(): Record<string, any> {
    return {
      id: this.id,
      instanceId: this.instanceId,
      name: this.name,
      state: this.modelState,
      modelPath: this.currentModelPath,
      contextId: this.activeContext?.id || null,
      fileSize: this.size,
      parameters: this.parameters,
      created: this.created,
      modified: this.modified,
      gpuEnabled: this.activeContext?.gpu || false,
      gpuReason: this.activeContext?.reasonNoGPU || '',
      modelDetails: this.activeContext?.model || null
    };
  }
  
  /**
   * Get the discovered model metadata
   * @returns Model metadata if available
   */
  public getModelMetadata(): {
    contextLength: number;
    architecture: string;
    quantization: string;
    parameters: number;
  } | undefined {
    return this.modelMetadata;
  }
  
  /**
   * Check if the model is currently generating
   */
  public isGenerating(): boolean {
    return this.state === 'generating';
  }
  
  /**
   * Stop any ongoing completion
   */
  public async stopCompletion(): Promise<void> {
    if (this.modernContext && typeof this.modernContext.stopCompletion === 'function') {
      console.log(`[LlamaModel:${this.instanceId}] Stopping completion...`);
      await this.modernContext.stopCompletion();
      this.activeGenerationId = null;
      this.setState('ready');
    }
  }
  
  /**
   * Validate if the context is ready for inference
   */
  public isReady(): boolean {
    return this.modelState === 'ready' && this.activeContext !== null;
  }
}

/**
 * Helper to ensure sufficient memory (placeholder)
 */
async function ensureMemoryAvailable(): Promise<void> {
  // TODO: Implement actual memory check and cleanup if needed
  console.warn('[LlamaModel] ensureMemoryAvailable() is currently a placeholder.');
  // Comment out potentially problematic line causing linter error
  // const args: any[] = []; 
  // Math.max(...args); // Example line causing error
} 