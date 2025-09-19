# LlamaModel

The `LlamaModel` class provides a clean interface for local LLM inference using `llama.rn`. It handles model initialization, state management, text generation, and Metal acceleration status tracking.

## Key Features

- Single implementation combining high-level interface with direct native access
- Proper state management with event-based updates
- Built-in Metal acceleration support with status tracking
- Comprehensive error handling and reporting
- Progress tracking during generation
- Resource cleanup management

## Implementation Details

### Model Initialization
```typescript
const model = new LlamaModel('/path/to/model.bin');
await model.initialize();
```

The initialization process:
1. Validates model file existence
2. Configures optimal defaults for TinyLlama
3. Initializes native model with Metal support
4. Sets up event listeners
5. Transitions state to 'ready'

### State Management
```typescript
type ModelState = 'loading' | 'ready' | 'generating' | 'error';
```

State transitions:
- `loading` → `ready`: After successful initialization
- `ready` → `generating`: During text generation
- `generating` → `ready`: After generation completes
- Any state → `error`: On error with message

### Event System
```typescript
model.onProgress.listen(event => {
  console.log('Token:', event.partialText);
  console.log('Speed:', event.tokensPerSecond);
});

model.onStateChange.listen(event => {
  console.log('New state:', event.state);
  if (event.error) console.error(event.error);
});
```

Events provide:
- Generation progress with timing
- State changes with error details
- Model load progress

### Metal Acceleration
```typescript
const status = model.getStatus();
if (status.metalEnabled) {
  console.log('Using Metal acceleration');
} else if (status.metalReason) {
  console.log('Metal disabled:', status.metalReason);
}
```

Metal support:
- Automatic detection and enablement
- Clear status reporting
- Detailed error messages
- Performance optimization

### Error Handling
```typescript
try {
  await model.generate(params);
} catch (error) {
  console.error('Generation failed:', error);
  // Model transitions to error state automatically
  // Cleanup is handled
  // Error is propagated with context
}
```

Error handling features:
- Automatic state transitions
- Resource cleanup
- Detailed error messages
- Error propagation
- Recovery options

## Integration with LLMManager

The `LlamaModel` works with `LLMManager` for:
- Model discovery and loading
- Metadata management
- Resource cleanup
- Event propagation

Example:
```typescript
const llmManager = await LLMManager.getInstance(personId, someoneId, channelManager);
const modelPath = await llmManager.getModelPath(model.$versionHash$);
const llmModel = new LlamaModel(modelPath);
```

## Migration Guide

### From Previous Versions

1. Replace AIProvider usage:
   ```typescript
   // Old
   const provider = new LlamaProvider(modelPath);
   await provider.initialize();

   // New
   const model = new LlamaModel(modelPath);
   await model.initialize();
   ```

2. Update event handlers:
   ```typescript
   // Old
   provider.onProgress(event => ...);
   provider.onStateChange(event => ...);

   // New
   model.onProgress.listen(event => ...);
   model.onStateChange.listen(event => ...);
   ```

3. Remove session management:
   ```typescript
   // Old
   await provider.loadSession(...);
   await provider.saveSession(...);

   // New
   // Session management is handled automatically
   ```

4. Use status checks:
   ```typescript
   // Old
   const isReady = provider.isInitialized;
   const hasError = provider.error;

   // New
   const status = model.getStatus();
   const isReady = status.isInitialized;
   const hasError = status.state === 'error';
   ```

### Benefits of Migration

1. Simplified Integration
   - Single implementation to maintain
   - Cleaner API surface
   - Better type safety
   - Automatic resource management

2. Improved Reliability
   - Consistent state management
   - Better error handling
   - Automatic cleanup
   - Clear status reporting

3. Better Performance
   - Optimized defaults
   - Metal acceleration support
   - Resource efficiency
   - Memory management

4. Enhanced Maintainability
   - Clear separation of concerns
   - Type-safe events
   - Documented interfaces
   - Testable components

## Usage

```typescript
// Initialize model
const model = new LlamaModel('/path/to/model.bin');
await model.initialize();

// Check status
const status = model.getStatus();
console.log('Model ready:', status.isInitialized);
console.log('Metal enabled:', status.metalEnabled);

// Generate text
const result = await model.generate({
  input: 'Your prompt here',
  maxTokens: 2048,
  temperature: 0.7,
  topP: 0.9,
  stopTokens: ['</s>']
});

// Clean up when done
await model.cleanup();
```

## State Management

The model maintains a clear state machine with the following states:
- `loading`: Initial state or during initialization
- `ready`: Model is loaded and ready for inference
- `generating`: Currently generating text
- `error`: An error occurred (with error message)

State changes are emitted through the `onStateChange` event.

## Events

- `onProgress`: Emitted during text generation with token and timing information
- `onStateChange`: Emitted when model state changes
- `onLoadProgress`: Emitted during model loading

## Metal Acceleration

Metal status is tracked automatically:
- `isMetalEnabled`: Whether Metal acceleration is active
- `metalDisabledReason`: Reason why Metal is not available (if any)

## Error Handling

Errors are handled consistently throughout:
- Clear error messages with context
- State transitions to 'error' with message
- Proper cleanup on failure
- Error propagation to caller

## Configuration

Default configuration optimized for TinyLlama:
- Context size: 2048 tokens
- Batch size: 512
- GPU layers: 1 (for Metal)
- Threads: 4

## Migration from Previous Versions

1. Replace AIProvider usage with direct LlamaModel
2. Update event handlers to use new event types
3. Remove session management code
4. Use getStatus() for comprehensive state info
5. Update Metal status checks to use new properties

## Benefits

- Simplified codebase
- Better error handling
- Clearer state management
- Improved Metal support
- More consistent API
- Better performance through optimized defaults
- Reduced memory usage
- Easier maintenance

## Detailed Migration Plan

### 1. Core Components

#### AIAssistantModel Updates
```typescript
// Remove provider-related code
- getEnabledAIProvider()
- updateProviderConfig()
- getProviderConfig()

// Add model-related methods
+ async getModel(): Promise<LlamaModel> {
+   const modelPath = await this.getModelPath();
+   return new LlamaModel(modelPath);
+ }

// Update generation methods
- const provider = await this.getEnabledAIProvider();
- const result = await provider.generate(params);
+ const model = await this.getModel();
+ const result = await model.generate(params);
```

#### LLMManager Updates
```typescript
// Remove provider management
- private providers = new Map<string, AIProvider>();
- async getProvider(modelPath: string): Promise<AIProvider>
- async cleanupProvider(modelPath: string): Promise<void>

// Update model handling
+ async getModelPath(versionHash: string): Promise<string>
+ private async findModel(versionHash: string): Promise<LLM | undefined>
```

#### Hook Updates
```typescript
// useLLM.ts is already migrated
// Update components using it to match new pattern
const { model, chat, summarize } = useLLM({
  model: currentModel,
  onError: handleError,
  onProgress: handleProgress
});
```

### 2. Files to Remove

- `src/models/ai/providers/LlamaProvider.ts`
- `src/models/ai/providers/FullmoonProvider.ts`
- Provider-related interfaces in `src/models/ai/types.ts`

### 3. Component Updates

#### Chat Components
```typescript
// AIChat.tsx
- const provider = aiModel.getEnabledAIProvider();
+ const model = aiModel.getModel();

// ChatAiSelector.tsx
- const provider = aiModel.getEnabledAIProvider();
+ const model = aiModel.getModel();
```

#### Settings Components
```typescript
// AISettings.tsx
- providerConfigs?: Record<string, AIProviderConfig>;
+ modelSettings?: LLM;

// AIProviderSettings.tsx
// Replace with ModelSettings.tsx
export function ModelSettings({
  model,
  onUpdate
}: {
  model: LLM;
  onUpdate: (update: Partial<LLM>) => Promise<void>;
}) {
  // Implementation
}
```

### 4. Type Updates

#### Remove Types
- `AIProvider` interface
- `AIProviderConfig` interface
- Provider-specific types

#### Update Types
```typescript
// types/llm.ts
export interface LLM {
  $type$: 'LLM';
  name: string;
  modelType: 'local';
  architecture: string;
  capabilities: string[];
  contextLength: number;
  threads: number;
  parameters: number;
  quantization?: string;
  localModel: {
    path: string;
    loaded: boolean;
  };
}
```

### 5. Storage Updates

#### Model Storage
```typescript
// Update storage paths
const modelDir = `${await getStorageDir(STORAGE.PRIVATE)}/models`;
const modelPath = `${modelDir}/${model.filename}`;
const metadataPath = `${modelDir}/${model.filename}.json`;
```

#### Settings Storage
```typescript
// Update settings format
- await instance.propertyTree.setValue('aiProviders', JSON.stringify({}));
+ await instance.propertyTree.setValue('models', JSON.stringify([]));
```

### 6. Migration Order

1. Core Updates:
   - Implement new `LlamaModel`
   - Update `LLMManager`
   - Update storage paths

2. Type System:
   - Remove provider types
   - Update LLM types
   - Update validation

3. Component Updates:
   - Migrate settings UI
   - Update chat components
   - Add model management UI

4. Storage Migration:
   - Create migration script
   - Update existing settings
   - Validate paths

5. Cleanup:
   - Remove provider files
   - Clean up unused imports
   - Update tests

### 7. Testing Steps

1. Model Management:
   - Model initialization
   - State transitions
   - Event handling
   - Resource cleanup

2. Generation:
   - Text generation
   - Progress events
   - Error handling
   - Metal acceleration

3. Settings:
   - Model configuration
   - Storage format
   - UI updates

4. Integration:
   - Chat functionality
   - Model switching
   - Error recovery

### 8. Rollback Plan

1. Keep old files until migration is complete
2. Version critical changes
3. Maintain compatibility layer if needed
4. Document breaking changes
5. Provide rollback scripts

### 9. Validation Checklist

- [ ] All provider references removed
- [ ] Model initialization working
- [ ] Generation functioning
- [ ] Settings UI updated
- [ ] Storage migrated
- [ ] Events working
- [ ] Error handling verified
- [ ] Metal acceleration checked
- [ ] Resource cleanup confirmed
- [ ] Tests passing 