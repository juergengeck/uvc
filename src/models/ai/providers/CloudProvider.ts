import { OEvent } from '@refinio/one.models/lib/misc/OEvent';
import type { AIProvider, AICapability, GenerateParams, GenerateResult, ModelStateEvent, GenerationProgressEvent, ModelState } from '../types';

/**
 * Configuration for cloud LLM provider
 */
export interface CloudProviderConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature?: number;
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
 * Provider implementation for cloud-based LLM inference
 * This provider can integrate with various cloud APIs like OpenAI, Anthropic, etc.
 */
export class CloudProvider implements AIProvider {
  public readonly name = 'cloud';
  private config: CloudProviderConfig;
  private isInitialized = false;

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

  constructor(config: CloudProviderConfig) {
    this.config = config;
  }

  /**
   * Provider capabilities
   */
  get capabilities(): AICapability {
    return {
      isAvailable: true,
      requiresNetwork: true,
      maxContextSize: 16000, // Default, but can vary based on model
      supportsStreaming: true
    };
  }

  /**
   * Initialize the provider
   */
  async initialize(): Promise<void> {
    // Validate the configuration
    if (!this.config.endpoint) {
      throw new Error('Cloud provider endpoint is required');
    }
    
    if (!this.config.apiKey) {
      throw new Error('Cloud provider API key is required');
    }
    
    if (!this.config.model) {
      throw new Error('Cloud provider model name is required');
    }
    
    // Emit state change event
    this.onStateChange.emit({
      state: 'loading',
      error: undefined
    });
    
    try {
      // Validate API key with a lightweight request - we'll just check the format
      if (!this.config.apiKey.startsWith('sk-')) {
        throw new Error('Invalid API key format. Anthropic keys must start with "sk-"');
      }
      
      this.isInitialized = true;
      
      // Emit state change event
      this.onStateChange.emit({
        state: 'ready',
        error: undefined
      });
    } catch (error) {
      // Emit state change event
      this.onStateChange.emit({
        state: 'error',
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw error;
    }
  }

  // Add input transformation to adapt from different parameter formats
  private adaptGenerateParams(params: GenerateParams): { input: string; systemPrompt?: string } {
    // If we have a prompt property (from older interface), use that
    const input = 'prompt' in params ? (params as any).prompt : params.input;
    const systemPrompt = params.systemPrompt;
    
    return { input, systemPrompt };
  }

  /**
   * Generate text using the Anthropic API
   */
  async generate(params: GenerateParams): Promise<GenerateResult> {
    if (!this.isInitialized) {
      throw new Error('Cloud provider not initialized');
    }
    
    // Emit state change event
    this.onStateChange.emit({
      state: 'generating',
      error: undefined
    });
    
    try {
      const temperature = this.config.temperature ?? 0.7;
      const maxTokens = this.config.maxTokens || 1000;
      
      // Get adapted parameters
      const { input, systemPrompt } = this.adaptGenerateParams(params);
      
      // Determine if we're using the Anthropic or other endpoint
      const isAnthropicModel = this.config.model.includes('claude') || 
                              this.config.endpoint.includes('anthropic');

      let response: string;
      let totalTokens = 0;
      
      // Capture start time for timing info
      const startTime = Date.now() / 1000;
      
      if (isAnthropicModel) {
        // Format for Anthropic API (latest version)
        const body = {
          model: this.config.model,
          messages: [
            { role: "user", content: input }
          ],
          max_tokens: maxTokens,
          temperature: temperature,
          stream: false, // Set to true to enable streaming when supported
          system: systemPrompt || "You are Claude, an AI assistant created by Anthropic."
        };
        
        // Setup request to Anthropic
        const controller = new AbortController();
        const { signal } = controller;
        
        const apiEndpoint = this.config.endpoint || 'https://api.anthropic.com/v1/messages';
        
        console.log('[CloudProvider] Sending request to Anthropic API:', apiEndpoint);
        
        // Make the API request
        const fetchResponse = await fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.config.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'messages-2023-12-15' // Latest beta features
          },
          body: JSON.stringify(body),
          signal
        });
        
        if (!fetchResponse.ok) {
          const errorText = await fetchResponse.text();
          throw new Error(`Anthropic API error: ${fetchResponse.status} - ${errorText}`);
        }
        
        const data = await fetchResponse.json();
        
        if (!data.content || data.content.length === 0) {
          throw new Error('Empty response from Anthropic API');
        }
        
        // Extract text from the response (handling potential array of content blocks)
        response = '';
        for (const contentBlock of data.content) {
          if (contentBlock.type === 'text') {
            response += contentBlock.text;
          }
        }
        
        totalTokens = data.usage?.output_tokens || response.split(/\s+/).length;
        
        // Calculate elapsed time
        const endTime = Date.now() / 1000; // in seconds
        const elapsedTime = endTime - startTime;
        
        // Emit progress events (although Anthropic doesn't provide streamed tokens)
        this.onProgress.emit({
          generatedTokens: totalTokens,
          partialText: response,
          elapsedTime: elapsedTime,
          tokensPerSecond: totalTokens / elapsedTime
        });
        
        console.log('[CloudProvider] Response received from Anthropic API:', {
          tokenCount: totalTokens,
          elapsedTime: elapsedTime.toFixed(2) + 's'
        });
      } else {
        // Generic implementation for other providers
        throw new Error(`Unsupported provider for model ${this.config.model}`);
      }
      
      // Calculate end time and elapsed time
      const endTime = Date.now() / 1000;
      const elapsedTime = endTime - startTime;
      
      // Emit state change event
      this.onStateChange.emit({
        state: 'ready',
        error: undefined
      });
      
      // Return response with both new and backward compatible formats
      return {
        text: response,
        tokens: totalTokens, // For backward compatibility
        finishReason: 'stop',
        timing: {
          startTime: startTime,
          endTime: endTime,
          elapsedTime: elapsedTime,
          tokensPerSecond: totalTokens / elapsedTime
        },
        // For backward compatibility
        timings: {
          start: startTime,
          end: endTime,
          elapsed: elapsedTime,
          tokensPerSecond: totalTokens / elapsedTime
        },
        usage: {
          promptTokens: input.split(/\s+/).length,
          completionTokens: totalTokens,
          totalTokens: input.split(/\s+/).length + totalTokens
        }
      };
    } catch (error) {
      // Emit state change event
      this.onStateChange.emit({
        state: 'error',
        error: error instanceof Error ? error.message : String(error)
      });
      
      throw error;
    }
  }

  /**
   * Load session (not supported for cloud provider)
   */
  async loadSession(sessionPath: string): Promise<void> {
    // Cloud provider doesn't support sessions, so this is a no-op
    return Promise.resolve();
  }
  
  /**
   * Save session (not supported for cloud provider)
   */
  async saveSession(sessionPath: string): Promise<void> {
    // Cloud provider doesn't support sessions, so this is a no-op
    return Promise.resolve();
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    // No cleanup needed for cloud provider
    this.isInitialized = false;
    
    // Emit state change event
    this.onStateChange.emit({
      state: 'error', // Using error state as uninitialized isn't in ModelState
      error: undefined
    });
  }
} 