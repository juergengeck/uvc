import type { AIProvider, AICapability, GenerateParams, GenerateResult, ModelState, ModelStateEvent, GenerationProgressEvent } from '../types';
import { FullmoonModel } from '../FullmoonModel';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent';

/**
 * Configuration for Fullmoon model
 */
export interface FullmoonConfig {
  modelPath: string;
  nGpuLayers: number;
  threads: number;
  batchSize: number;
}

/**
 * Event emitted during model loading
 */
export interface ModelLoadEvent {
  progress: number;
  total: number;
  message?: string;
}

/**
 * Provider implementation for local LLM inference using Fullmoon
 */
export class FullmoonProvider implements AIProvider {
  public readonly name = 'fullmoon';
  private model: FullmoonModel;

  /**
   * Event emitted during text generation
   */
  public readonly onProgress = new OEvent<(event: GenerationProgressEvent) => void>();

  /**
   * Event emitted when model state changes
   */
  public readonly onStateChange = new OEvent<(event: ModelStateEvent) => void>();

  /**
   * Event emitted during model loading
   */
  public readonly onLoadProgress = new OEvent<(event: ModelLoadEvent) => void>();

  constructor(modelPath: string) {
    this.model = new FullmoonModel();

    // Forward model events
    this.model.onProgress.listen((event) => this.onProgress.emit(event));
    this.model.onStateChange.listen((event) => this.onStateChange.emit(event));
    this.model.onLoadProgress.listen((event) => this.onLoadProgress.emit(event));

    this.model.setConfig({
      modelPath,
      nGpuLayers: 0, // Default to CPU-only
      threads: 4,
      batchSize: 512
    });
  }

  /**
   * Provider capabilities
   */
  get capabilities(): AICapability {
    return {
      isAvailable: true, // We'll update this based on Metal support check
      requiresNetwork: false,
      maxContextSize: 4096, // This should match the model's context size
      supportsStreaming: true
    };
  }

  /**
   * Initialize the provider
   */
  async initialize(): Promise<void> {
    // Check Metal support and update GPU layers if supported
    const hasMetalSupport = await this.model.checkMetalSupport();
    if (hasMetalSupport) {
      const config = this.model.getConfig();
      this.model.setConfig({
        ...config,
        nGpuLayers: 32 // Use all layers on GPU if supported
      });
    }

    await this.model.initialize();
  }

  /**
   * Generate text using the local model
   */
  async generate(params: GenerateParams): Promise<GenerateResult> {
    return await this.model.generate(params);
  }

  /**
   * Load a session state
   */
  async loadSession(state: string): Promise<void> {
    // Fullmoon doesn't support session state yet
    throw new Error('Session management not supported');
  }

  /**
   * Save the current session state
   */
  async saveSession(sessionPath: string): Promise<void> {
    // Fullmoon doesn't support session state yet
    throw new Error('Session management not supported');
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    await this.model.cleanup();
  }
} 