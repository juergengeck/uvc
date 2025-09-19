# API Reference

## Core APIs

### AI Provider API

#### Provider Interface
```typescript
interface AIProvider {
  id: string;
  name: string;
  type: 'local' | 'cloud';
  
  initialize(config: ProviderConfig): Promise<void>;
  generate(prompt: string, options?: GenerateOptions): Promise<Response>;
  cleanup(): Promise<void>;
  
  getStatus(): ProviderStatus;
  updateConfig(config: Partial<ProviderConfig>): Promise<void>;
}
```

#### Configuration Types
```typescript
interface ProviderConfig {
  modelPath?: string;
  threads?: number;
  batchSize?: number;
  temperature?: number;
  maxTokens?: number;
  endpoint?: string;
  apiKey?: string;
}

interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  stop?: string[];
}

interface ProviderStatus {
  isInitialized: boolean;
  isGenerating: boolean;
  modelInfo?: ModelInfo;
  error?: Error;
}
```

### Chat API

#### Message Interface
```typescript
interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: number;
  metadata?: Record<string, unknown>;
}

interface Chat {
  id: string;
  messages: Message[];
  title?: string;
  createdAt: number;
  updatedAt: number;
  settings?: ChatSettings;
}
```

#### Chat Manager
```typescript
interface ChatManager {
  // Chat Operations
  createChat(): Promise<Chat>;
  getChat(id: string): Promise<Chat>;
  updateChat(id: string, updates: Partial<Chat>): Promise<void>;
  deleteChat(id: string): Promise<void>;
  
  // Message Operations
  sendMessage(chatId: string, content: string): Promise<Message>;
  getMessages(chatId: string, options?: GetMessagesOptions): Promise<Message[]>;
  deleteMessage(chatId: string, messageId: string): Promise<void>;
  
  // Subscriptions
  subscribeToChat(chatId: string, callback: ChatCallback): Unsubscribe;
  subscribeToMessages(chatId: string, callback: MessageCallback): Unsubscribe;
}
```

### Model Management API

#### Model Interface
```typescript
interface Model {
  id: string;
  name: string;
  version: string;
  size: number;
  format: string;
  capabilities: ModelCapabilities;
  metadata: ModelMetadata;
}

interface ModelManager {
  // Model Operations
  downloadModel(url: string, options?: DownloadOptions): Promise<Model>;
  deleteModel(id: string): Promise<void>;
  getModel(id: string): Promise<Model>;
  listModels(): Promise<Model[]>;
  
  // Model Status
  getModelStatus(id: string): Promise<ModelStatus>;
  validateModel(id: string): Promise<ValidationResult>;
  
  // Events
  onModelDownload(callback: DownloadCallback): Unsubscribe;
  onModelDelete(callback: DeleteCallback): Unsubscribe;
}
```

### Storage API

#### Storage Interface
```typescript
interface Storage {
  // Key-Value Operations
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  
  // Batch Operations
  getMultiple(keys: string[]): Promise<Record<string, unknown>>;
  setMultiple(items: Record<string, unknown>): Promise<void>;
  deleteMultiple(keys: string[]): Promise<void>;
  
  // Utilities
  getAllKeys(): Promise<string[]>;
  contains(key: string): Promise<boolean>;
}
```

### Event System

#### Event Types
```typescript
type EventType = 
  | 'chat:message'
  | 'chat:update'
  | 'model:download'
  | 'model:delete'
  | 'provider:status'
  | 'error';

interface EventEmitter {
  on(event: EventType, callback: EventCallback): Unsubscribe;
  off(event: EventType, callback: EventCallback): void;
  emit(event: EventType, data: unknown): void;
}
```

### Error Handling

#### Error Types
```typescript
class AIError extends Error {
  code: string;
  details?: unknown;
}

class ModelError extends AIError {
  modelId: string;
}

class ProviderError extends AIError {
  providerId: string;
}

class ChatError extends AIError {
  chatId: string;
}
```

## React Hooks

### AI Hooks
```typescript
// Provider Hook
function useAIProvider(config?: ProviderConfig): {
  provider: AIProvider;
  status: ProviderStatus;
  error: Error | null;
  initialize: () => Promise<void>;
  generate: (prompt: string, options?: GenerateOptions) => Promise<Response>;
};

// Model Hook
function useModel(modelId: string): {
  model: Model | null;
  status: ModelStatus;
  error: Error | null;
  download: () => Promise<void>;
  delete: () => Promise<void>;
};
```

### Chat Hooks
```typescript
// Chat Hook
function useChat(chatId: string): {
  chat: Chat | null;
  messages: Message[];
  loading: boolean;
  error: Error | null;
  sendMessage: (content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
};

// Message Hook
function useMessages(chatId: string, options?: GetMessagesOptions): {
  messages: Message[];
  loading: boolean;
  error: Error | null;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
};
```

## Utility Types

### Common Types
```typescript
type Unsubscribe = () => void;

interface Pagination {
  offset: number;
  limit: number;
}

interface TimeRange {
  start: number;
  end: number;
}

interface SortOptions {
  field: string;
  order: 'asc' | 'desc';
}

interface FilterOptions {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'contains';
  value: unknown;
}
```

### Configuration Types
```typescript
interface AppConfig {
  ai: AIConfig;
  chat: ChatConfig;
  storage: StorageConfig;
}

interface AIConfig {
  defaultProvider: string;
  providers: Record<string, ProviderConfig>;
  modelDefaults: Partial<ModelConfig>;
}

interface ChatConfig {
  maxMessages: number;
  retentionPeriod: number;
  autoCleanup: boolean;
}

interface StorageConfig {
  encryption: boolean;
  compression: boolean;
  maxSize: number;
}
```

## Constants

### Error Codes
```typescript
const ErrorCodes = {
  // Provider Errors
  PROVIDER_NOT_INITIALIZED: 'provider_not_initialized',
  PROVIDER_GENERATION_FAILED: 'provider_generation_failed',
  
  // Model Errors
  MODEL_NOT_FOUND: 'model_not_found',
  MODEL_DOWNLOAD_FAILED: 'model_download_failed',
  MODEL_VALIDATION_FAILED: 'model_validation_failed',
  
  // Chat Errors
  CHAT_NOT_FOUND: 'chat_not_found',
  MESSAGE_NOT_FOUND: 'message_not_found',
  
  // Storage Errors
  STORAGE_FULL: 'storage_full',
  STORAGE_CORRUPTED: 'storage_corrupted'
} as const;
```

### Event Names
```typescript
const EventNames = {
  // Chat Events
  CHAT_CREATED: 'chat:created',
  CHAT_UPDATED: 'chat:updated',
  CHAT_DELETED: 'chat:deleted',
  MESSAGE_SENT: 'chat:message_sent',
  MESSAGE_RECEIVED: 'chat:message_received',
  
  // Model Events
  MODEL_DOWNLOAD_STARTED: 'model:download_started',
  MODEL_DOWNLOAD_PROGRESS: 'model:download_progress',
  MODEL_DOWNLOAD_COMPLETED: 'model:download_completed',
  MODEL_DELETED: 'model:deleted',
  
  // Provider Events
  PROVIDER_INITIALIZED: 'provider:initialized',
  PROVIDER_ERROR: 'provider:error',
  
  // System Events
  ERROR: 'system:error',
  WARNING: 'system:warning'
} as const;
```

### AI Model Management

The `AIModelManager` class provides functionality for managing AI models:

```typescript
interface AIModelManager {
  // Model lifecycle management
  importFromUrl(url: string, knownModelId?: string): Promise<LLMDefinition>;
  importFromFile(fileUri: string, metadata: Partial<AIModelMetadata>): Promise<SHA256Hash<BLOB>>;
  deleteModel(filename: string): Promise<void>;
  
  // Model discovery and validation
  listModels(): Promise<AIModelMetadata[]>;
  getModelPath(filename: string): Promise<string>;
  getKnownModels(): KnownModelDefinition[];
  findKnownModel(id: string): KnownModelDefinition | undefined;
  
  // Model loading and validation
  loadModel(weightHash: SHA256Hash<BLOB>): Promise<{ data: ArrayBuffer; metadata: AIModelMetadata }>;
  validateAgainstKnown(metadata: AIModelMetadata): { valid: boolean; knownModel?: KnownModelDefinition; issues: string[] };
}
``` 