# llama.rn Integration

## Overview

llama.rn provides local LLM inference capabilities in the application. It's implemented through several key components working together to handle model management, text generation, and chat functionality.

## Module Import Architecture

To maintain a clean and consistent architecture, the application follows a single path of responsibility for LLM operations:

1. **Direct Native Module Access**:
   - All components import directly from `llama.rn` instead of through intermediate modules
   - No reexporting of the llama.rn functionality through one.core
   - This ensures consistent API usage and avoids version mismatch issues

2. **Responsibility Flow**:
   - AIAssistantModel delegates all LLM operations to LLMManager
   - LLMManager orchestrates model loading and lifecycle
   - LlamaModel handles direct interaction with the llama.rn native module
   - This creates a clear chain of responsibility and avoids duplicate model loading

3. **Dependency Model**:
   - llama.rn is a direct dependency of the app, not of one.core
   - This allows one.core to remain platform-agnostic
   - App-specific native modules are managed at the app level, not the core library level

## Core Components

1. **LlamaModel** (src/models/ai/LlamaModel.ts):
   - Provides a clean wrapper around llama.rn's native functionality
   - Handles initialization, text generation, and resource cleanup
   - Exposes events for progress tracking and state changes
   - Uses native functions like `initLlama`, `loadLlamaModelInfo`, and completion methods

2. **LLMManager** (src/models/ai/LLMManager.ts):
   - Manages model metadata, storage, and identity relationships
   - Maintains a channel-based registry of available models
   - Handles model importing, loading/unloading, and diagnostics
   - Creates appropriate contact relationships for models

3. **AIAssistantModel** (src/models/AIAssistantModel.ts):
   - Coordinates user interactions with AI models via topics/chats
   - Creates topic rooms for AI conversations
   - Processes user messages and generates AI responses
   - Ensures messages are sent with appropriate AI identities

4. **RNLlama Native Module** (ios-custom-modules/llama.rn/):
   - Implements a React Native TurboModule for native LLM inference
   - Provides a high-performance bridge between JavaScript and native code
   - Manages LLaMA contexts, model loading, and text generation
   - Implemented as Objective-C++ with C++ core for iOS

## Native Implementation Architecture

The native implementation follows a multi-layer architecture:

1. **TurboModule Interface Layer**:
   - `RNLlamaSpec.h`: Defines the contract between JavaScript and native code
   - `RNLlamaSpecJSI.h/mm`: JSI interface implementation that handles data conversion
   - Uses Facebook's JSI (JavaScript Interface) for direct memory access

2. **Objective-C++ Bridge Layer**:
   - `RNLlama.h/mm`: Main module implementation, inherits from RCTEventEmitter
   - Manages context lifecycle, event emissions, and error handling
   - Provides methods for model initialization, text generation, and resource management

3. **Context Management Layer**:
   - `RNLlamaContext.h/mm`: Handles individual LLaMA inference contexts
   - Manages memory usage, GPU acceleration, and inference parameters
   - Implements safeguards against memory issues and optimizes for device capabilities

4. **C++ Core Layer**:
   - Integrates with llama.cpp for the actual inference logic
   - Provides optimized implementations for token generation, embedding, and other operations
   - Manages the low-level memory allocation and tensor operations

## Data Flow

When handling a user message:

1. User message is received in `AIAssistantModel.handleTopicMessage()`
2. Active model is identified through the LLMManager
3. LlamaModel is instantiated with the appropriate model path
4. Model is initialized with optimal parameters
5. The message is processed with parameters:
   ```javascript
   {
     input: userMessage,
     maxTokens: 500,
     temperature: 0.7,
     stopSequences: ['\n\n']
   }
   ```
6. The generated response is sent back to the topic with the AI's personId

## Native Module Implementation Details

### RNLlama Class

The `RNLlama` class implements a React Native TurboModule that exposes LLaMA functionality to JavaScript:

- **Context Management**: Uses a dictionary to store and manage multiple LLaMA contexts with unique string handles
- **JSI Integration**: Implements the TurboModule spec for high-performance JavaScript interaction
- **Event Emission**: Inherits from RCTEventEmitter to provide event-based streaming for token generation
- **Error Handling**: Implements robust error handling and propagation across the JS-native boundary
- **Memory Protection**: Contains safeguards against memory issues and implements resource cleanup

### Key Native Methods

1. **Context Initialization**:
   ```objc
   - (void)initialize:(NSDictionary *)config
         withResolver:(RCTPromiseResolveBlock)resolve
         withRejecter:(RCTPromiseRejectBlock)reject;
   ```
   Loads a model file and creates a LLaMA context with the specified parameters.

2. **Text Generation**:
   ```objc
   - (void)generate:(ContextHandle)handle
        withParams:(NSDictionary *)params
      withResolver:(RCTPromiseResolveBlock)resolve
      withRejecter:(RCTPromiseRejectBlock)reject;
   ```
   Generates text synchronously based on the provided parameters.

3. **Streaming Generation**:
   ```objc
   - (void)generateStream:(ContextHandle)handle
              withParams:(NSDictionary *)params
            withResolver:(RCTPromiseResolveBlock)resolve
            withRejecter:(RCTPromiseRejectBlock)reject;
   ```
   Starts asynchronous token generation with events emitted for each token.

4. **Resource Management**:
   ```objc
   - (void)release:(ContextHandle)handle
      withResolver:(RCTPromiseResolveBlock)resolve
      withRejecter:(RCTPromiseRejectBlock)reject;
   ```
   Releases resources associated with a context.

### JSI Implementation

The TurboModule interface is implemented using JSI (JavaScript Interface) for high performance:

- **Zero-Copy Data Transfer**: Uses direct memory references where possible to avoid serialization overhead
- **Promise-Based API**: All methods return JavaScript Promises for async operation
- **Type Conversion**: Implements bidirectional conversion between JavaScript and Objective-C types
- **Event Bridge**: Connects native events to JavaScript event listeners

## Model Metadata Structure (LLM Interface)

Models are stored with comprehensive metadata:

```typescript
interface LLM {
  $type$: 'LLM';
  name: string;
  modelType: 'local' | 'cloud';
  filename: string;
  personId?: string;         // Critical for message identity
  deleted: boolean;
  active: boolean;
  creator: string;
  created: number;
  modified: number;
  createdAt: string;
  lastUsed: string;
  usageCount: number;
  size: number;
  capabilities: Array<'chat' | 'inference'>;
  lastInitialized: number;
  
  // Model parameters
  temperature?: number;
  batchSize?: number;
  threads?: number;
  maxTokens?: number;
  contextSize?: number;
  mirostat?: number;
  topK?: number;
  topP?: number;
  
  // Optional properties
  architecture?: string;
  contextLength?: number;
  quantization?: string;
  checksum?: string;
  provider?: string;
  modelLoaded?: boolean;
  modelPath: string;
}
```

## Key API Parameters

When generating text with llama.rn, these parameters are used:

- **input**: The user message (prompt)
- **maxTokens**: Default 500, limits response length
- **temperature**: Default 0.7, controls randomness
- **stopTokens**: Sequences that stop generation
- **topP**: Default 1.0, controls token sampling diversity

The low-level configuration for model initialization includes:
```javascript
{
  model: cleanPath,       // Path to model file
  n_threads: 4,           // CPU threads to use
  n_ctx: 2048,            // Context window size
  n_batch: 512,           // Batch size for processing
  n_gpu_layers: 1         // GPU layer usage
}
```

## Response Structure

The generated results are returned in this format:

```typescript
{
  text: string;               // Generated response text
  tokens: number;             // Token count generated
  finishReason: string;       // Why generation stopped
  timing: {                   // Performance metrics
    startTime: number;
    endTime: number;
    elapsedTime: number;
    tokensPerSecond: number;
  };
  usage: {                    // Token usage statistics
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

## Native Optimizations

The native implementation includes several optimizations:

1. **Metal GPU Acceleration**:
   - Detects Metal GPU capabilities on iOS devices
   - Uses GPU for accelerated inference when available
   - Falls back gracefully to CPU with diagnostic information

2. **Memory Management**:
   - Implements memory usage tracking and prediction
   - Contains safeguards against out-of-memory conditions
   - Applies conservative memory settings on resource-constrained devices

3. **Platform-Specific Adaptations**:
   - Optimizes for simulator vs. physical device
   - Adjusts parameters based on device capabilities
   - Provides detailed diagnostic information for troubleshooting

4. **Resource Cleanup**:
   - Implements proper cleanup for native resources
   - Handles context lifecycle with explicit release methods
   - Prevents memory leaks through reference counting

## Known Model Configuration

The application supports specific pre-configured models:

```javascript
const KNOWN_MODELS = [
    {
        id: 'tinyllama-1.1b',
        name: 'TinyLlama 1.1B',
        size: 1_017_611_264, // ~1GB
        parametersCount: 1_100_000_000,
        temperature: 0.7,
        maxTokens: 2048,
        threads: 4,
        architecture: 'llama',
        version: '1.0.0',
        isLoaded: false,
        capabilities: ['chat', 'inference'],
        filename: 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
        contextLength: 2048,
        quantization: 'Q4_K_M',
        downloadUrl: 'https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf'
    },
    {
        id: 'deepseek-1.5b',
        name: 'DeepSeek Distilled 1.5B',
        size: 892_783_616, // ~850MB
        parametersCount: 1_500_000_000,
        temperature: 0.7,
        maxTokens: 4096,
        threads: 4,
        architecture: 'qwen2',
        version: '1.0.0',
        isLoaded: false,
        capabilities: ['chat', 'inference'],
        filename: 'DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf',
        contextLength: 4096,
        quantization: 'Q4_K_M',
        downloadUrl: 'https://huggingface.co/TheBloke/deepseek-coder-1.3b-base-GGUF/resolve/main/deepseek-coder-1.3b-base.Q4_K_M.gguf'
    }
];
```

## Refactoring Plan (Native <-> JS Interface)

The current interaction between the core C++ `llama.cpp`, the C++ wrapper (`rn-llama.cpp`, `common.cpp`), the Objective-C++ bridge (`RNLlama.mm`, `RNLlamaContext.mm`), and the TypeScript interface (`LlamaModule.ts`, `AIAssistantModel.ts`, `LlamaModel.ts`) has become complex and difficult to trace, leading to issues like the initialization crash.

### Current State & Challenges

*   **Multiple Initialization Paths:** `initLlama` and `initContext` offer different ways to create LLM contexts, adding confusion.
*   **Distributed Parameter Handling:** Default values and configurations are set at multiple layers (JS, ObjC++, C++), making it hard to track the final parameters used.
*   **Inconsistent Error Propagation:** Errors originating in C++ may not surface clearly in TypeScript, hindering debugging.
*   **Split Context Management:** Context handles/references are managed partly in Objective-C++ (`contextRegistry`) and partly in TypeScript (`modelContexts`), increasing complexity.

### Refactoring Goals

1.  **Unified Initialization:** Provide a single, clear API method from TypeScript to initialize a model and obtain a usable context handle.
2.  **Simplified Native API:** Reduce the surface area of the Objective-C++ bridge. Expose fewer, more focused methods (e.g., `initialize`, `generate`, `release`).
3.  **Robust Error Handling:** Implement consistent error checking at each layer, ensuring that errors (OOM, file not found, bad params, C++ exceptions) propagate meaningfully to TypeScript.
4.  **Centralized Context Management:** Clearly define the responsibility for context lifecycle. Ideally, the native layer manages context resources, exposing only an opaque handle to TypeScript.
5.  **Clear Parameter Responsibility:** Define which layer handles parameter validation and defaults (likely the TypeScript wrapper `LlamaModule.ts`).
6.  **Improved Type Safety:** Enhance TypeScript definitions for configuration objects and results passed across the bridge.

### Proposed Refactoring Steps

1.  **Native Bridge Consolidation (`RNLlama.mm`, `RNLlamaContext.mm`):**
    *   Replace `initLlama` and `initContext` with a single `initialize(config: Dict) -> Promise<ContextHandle>`. This method will internally handle model loading and context creation, calling either the intermediate C++ layer (`rn-llama`/`common`) or the core `llama.cpp` functions directly.
    *   Return an opaque `ContextHandle` (e.g., a pointer address as a string or number) on success, or throw a specific error (OOM, file error, etc.).
    *   Replace `completion` and `completionStream` with `generate(handle: ContextHandle, params: Dict) -> Promise<r>` and potentially `generateStream(...)`.
    *   Implement `