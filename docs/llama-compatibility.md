# Llama.rn Compatibility Guide

## Overview

This guide details how to maintain compatibility with the llama.rn format while using MLX as the inference backend. The adapter pattern allows us to support llama.rn's API surface while leveraging MLX's performance benefits.

## API Compatibility

### 1. Core Interfaces

```typescript
// llama.rn interfaces
interface LlamaConfig {
  model: string;
  use_mlock?: boolean;
  n_ctx?: number;
  n_gpu_layers?: number;
  embedding?: boolean;
  grammar?: string;
}

interface LlamaContext {
  completion(params: CompletionParams, callback?: CompletionCallback): Promise<CompletionResult>;
  tokenize(content: string): Promise<number[]>;
  detokenize(tokens: number[]): Promise<string>;
  embedding(content: string): Promise<number[]>;
  loadSession(path: string): Promise<void>;
  saveSession(path: string): Promise<void>;
  stopCompletion(): void;
  release(): void;
}

// Our adapter implementation
class MLXLlamaAdapter implements LlamaContext {
  private fullmoon: ExpoFullmoon;
  
  constructor(config: LlamaConfig) {
    this.fullmoon = new ExpoFullmoon();
    // Convert config to MLX format
  }
  
  async completion(params: CompletionParams, callback?: CompletionCallback): Promise<CompletionResult> {
    // Convert between formats and handle completion
    const mlxParams = this.convertCompletionParams(params);
    const result = await this.fullmoon.generate(mlxParams, (data) => {
      if (callback) {
        callback(this.convertProgressData(data));
      }
    });
    return this.convertCompletionResult(result);
  }
  
  // ... implement other methods
}
```

### 2. Completion Parameters

```typescript
// llama.rn completion parameters
interface CompletionParams {
  prompt?: string;
  messages?: ChatMessage[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  n_predict?: number;
  stop?: string[];
  stream?: boolean;
  grammar?: string;
}

// MLX conversion
function convertCompletionParams(params: CompletionParams): MLXGenerateParams {
  return {
    input: params.prompt || formatMessages(params.messages),
    maxTokens: params.n_predict,
    temperature: params.temperature,
    topP: params.top_p,
    stopTokens: params.stop,
    stream: params.stream,
    // Additional MLX-specific parameters
    batchSize: 512,
    threads: 4
  };
}
```

### 3. Chat Format

```typescript
// llama.rn chat format
interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Format conversion
function formatMessages(messages: ChatMessage[]): string {
  return messages.map(msg => {
    switch (msg.role) {
      case 'system':
        return `[INST] <<SYS>>${msg.content}<</SYS>>\n\n`;
      case 'user':
        return `[INST] ${msg.content} [/INST]\n`;
      case 'assistant':
        return `${msg.content}\n`;
    }
  }).join('');
}
```

## Model Management

### 1. Model Loading

```typescript
// llama.rn model loading
async function loadModel(path: string, config: LlamaConfig): Promise<LlamaContext> {
  const adapter = new MLXLlamaAdapter({
    ...config,
    model: path
  });
  await adapter.initialize();
  return adapter;
}

// MLX implementation
class MLXLlamaAdapter {
  async initialize() {
    await this.fullmoon.initialize({
      modelPath: this.config.model,
      nGpuLayers: this.config.n_gpu_layers || 0,
      threads: 4,
      batchSize: 512
    });
  }
}
```

### 2. Session Management

```typescript
// Session compatibility
class MLXLlamaAdapter {
  async loadSession(path: string): Promise<void> {
    // Convert llama.rn session format to MLX format
    const session = await this.readAndConvertSession(path);
    await this.fullmoon.loadState(session);
  }
  
  async saveSession(path: string): Promise<void> {
    const state = await this.fullmoon.saveState();
    // Convert MLX state to llama.rn format
    await this.convertAndWriteSession(state, path);
  }
}
```

## Grammar Support

### 1. Grammar Conversion

```typescript
// llama.rn grammar format
interface GrammarSpec {
  root: string;
  rules: Record<string, string[]>;
}

// Convert to MLX format
function convertGrammar(grammar: GrammarSpec): string {
  return Object.entries(grammar.rules)
    .map(([name, rules]) => `${name} ::= ${rules.join(' | ')}`)
    .join('\n');
}
```

### 2. JSON Schema Support

```typescript
// llama.rn JSON schema conversion
import { convertJsonSchemaToGrammar } from 'llama.rn';

class MLXLlamaAdapter {
  setJsonSchema(schema: object) {
    const grammar = convertJsonSchemaToGrammar({
      schema,
      propOrder: { function: 0, arguments: 1 }
    });
    this.fullmoon.setGrammar(grammar);
  }
}
```

## Performance Considerations

### 1. Memory Management

```typescript
class MLXLlamaAdapter {
  private async setupMemoryManagement() {
    // Monitor memory pressure
    if (Platform.OS === 'ios') {
      MemoryPressureObserver.observe(level => {
        if (level === 'critical') {
          this.fullmoon.purgeCache();
        }
      });
    }
  }
  
  release() {
    this.fullmoon.cleanup();
  }
}
```

### 2. Metal Acceleration

```typescript
class MLXLlamaAdapter {
  private async configureGPU() {
    if (this.config.n_gpu_layers > 0) {
      const hasMetalSupport = await this.fullmoon.checkMetalSupport();
      if (!hasMetalSupport) {
        console.warn('Metal not supported, falling back to CPU');
        this.config.n_gpu_layers = 0;
      }
    }
  }
}
```

## Error Handling

### 1. Error Mapping

```typescript
// llama.rn error types
class LlamaError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

// Error conversion
function convertError(error: any): LlamaError {
  if (error instanceof FullmoonError) {
    switch (error.code) {
      case FullmoonErrorCode.MODEL_LOAD_FAILED:
        return new LlamaError(error.message, 'model_load_error');
      case FullmoonErrorCode.GENERATION_FAILED:
        return new LlamaError(error.message, 'generation_error');
      // ... other cases
    }
  }
  return new LlamaError(error.message, 'unknown_error');
}
```

### 2. Error Recovery

```typescript
class MLXLlamaAdapter {
  private async handleError(error: any) {
    const llamaError = convertError(error);
    
    // Attempt recovery based on error type
    switch (llamaError.code) {
      case 'model_load_error':
        await this.reinitialize();
        break;
      case 'out_of_memory':
        await this.handleMemoryError();
        break;
      default:
        throw llamaError;
    }
  }
}
```

## Testing

### 1. Compatibility Tests

```typescript
describe('MLXLlamaAdapter', () => {
  it('matches llama.rn output format', async () => {
    const adapter = new MLXLlamaAdapter(config);
    const result = await adapter.completion({
      prompt: 'Hello',
      temperature: 0.7
    });
    
    expect(result).toMatchObject({
      text: expect.any(String),
      tokens: expect.any(Array),
      timings: expect.any(Object)
    });
  });
});
```

### 2. Format Verification

```typescript
describe('Format Compatibility', () => {
  it('correctly formats chat messages', () => {
    const messages = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi!' }
    ];
    
    const formatted = formatMessages(messages);
    expect(formatted).toMatch(/<<SYS>>.*<</SYS>>/);
    expect(formatted).toMatch(/\[INST\].*\[\/INST\]/);
  });
});
```

## Migration Guide

### 1. Switching from llama.rn

```typescript
// Old code
import { initLlama } from 'llama.rn';
const context = await initLlama(config);

// New code
import { MLXLlamaAdapter } from 'expo-fullmoon';
const adapter = new MLXLlamaAdapter(config);
const context = await adapter.initialize();
```

### 2. Handling Differences

```typescript
// Document key differences
const differences = {
  gpu_layers: 'MLX uses different GPU configuration',
  batch_size: 'MLX has optimal batch size settings',
  memory: 'MLX has different memory management',
  formats: 'Some format conversions may be needed'
};

// Provide migration helpers
export const migrationUtils = {
  convertConfig: (llamaConfig: LlamaConfig) => ({ /* ... */ }),
  convertFormat: (llamaFormat: any) => ({ /* ... */ }),
  handleErrors: (error: any) => ({ /* ... */ })
};
``` 