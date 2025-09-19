# AI System Documentation

## Architecture Overview

The AI system consists of two primary components:

1. **LLMManager** - Responsible for:
   - Model file storage and handling
   - Metadata management
   - Model validation and importing
   - LLM identity creation and management

2. **AIAssistantModel** - Responsible for:
   - Using LLMs in conversation contexts
   - Managing AI topics and interactions
   - Controlling model usage in the system
   - Central control point for AI resources

## Model Types

The system supports two types of AI models:

1. **Local Models** - Models stored and run locally on the device:
   - Uses the llama.rn backend for inference
   - Requires model files (.gguf format) to be imported and stored locally
   - Naming format: `[model-name]@llama.local`

2. **Cloud Models** - Models accessed through provider APIs:
   - Currently supports Anthropic Claude models
   - Requires API key configuration in settings
   - Naming format: `[model-name]@[provider].local` (e.g., `claude-3-opus@anthropic.local`)

## Model Loading Process

The AI system requires a specific initialization sequence to properly load and enable models:

1. Model Storage
   - For local models: Model file is stored in `${STORAGE.PRIVATE}/models/`
   - For cloud models: Configuration is stored in settings
   - Metadata is stored using `storeVersionedObject`
   - Model identity is created using `LLMManager.setupLLMWithIdentity`

2. AI Topic Initialization
   - Must happen BEFORE enabling the provider
   - Creates necessary topic rooms and contacts
   - Called via `aiModel.initializeAITopics()`

3. Provider Configuration
   - For local models:
     ```typescript
     {
       modelPath: filename,
       modelName: metadata.name,
       architecture: metadata.architecture,
       threads: metadata.threads,
       batchSize: 512,
       temperature: 0.7
     }
     ```
   - For cloud models:
     ```typescript
     {
       endpoint: 'https://api.anthropic.com/v1/messages',
       apiKey: 'sk-ant-...',
       model: 'claude-3-opus',
       maxTokens: 2048,
       temperature: 0.7
     }
     ```

4. Provider Enablement
   - Only after topics initialized and config updated
   - Called via `aiModel.setProviderEnabled('local', true)` or `aiModel.setProviderEnabled('cloud', true)`

## Cloud Provider Setup

To use the Anthropic Claude API:

1. **API Key Configuration**
   - Obtain an API key from Anthropic
   - Configure in the app settings under "AI Provider Settings"
   - The API key must start with "sk-"

2. **Model Selection**
   - Choose from available Claude models:
     - claude-3-opus: Most capable model (up to 200K tokens context)
     - claude-3-sonnet: Balanced capability and speed
     - claude-3-haiku: Fastest model for quick responses

3. **Parameter Configuration**
   - `endpoint`: API endpoint URL (default: https://api.anthropic.com/v1/messages)
   - `maxTokens`: Maximum tokens to generate in responses (1-4096)
   - `temperature`: Response randomness (0.0-1.0)

4. **Implementation Details**
   - The `CloudProvider` class handles all API communication
   - Messages are sent using the Anthropic Messages API format
   - Default context size is set to 16K tokens
   - Responses are processed and streamed back to the conversation

## Identity Management

LLM identity management has been streamlined:

1. `LLMManager` provides the central method for identity creation:
   ```typescript
   // High-level method that handles all identity-related operations
   const updatedModel = await llmManager.setupLLMWithIdentity(modelConfig);
   ```

2. This creates or reuses identities for LLMs, ensuring:
   - Each model has a proper Person identity
   - The Person is added to contacts
   - A profile is created with appropriate descriptors
   - The model is updated with the personId
   - Required fields are present on the model

3. Email Naming Convention for AI Identities:
   The system now uses a standardized email format through the `generateAIEmail` helper:

   ```typescript
   /**
    * Generate a standardized email for an AI model
    * Follows the format:
    * - Local models: [slugified-model-name]@llama.local
    * - Cloud models: [model-name]@[provider].local (e.g., claude2@anthropic.local)
    */
   private generateAIEmail(model: LLM): string {
     // Slugify the model name (lowercase, spaces to hyphens, alphanumeric only)
     const slugifiedName = model.name
       .toLowerCase()
       .replace(/\s+/g, '-')
       .replace(/[^a-z0-9-]/g, '');
     
     // Determine domain based on model type
     if (model.modelType === 'cloud' && model.provider) {
       return `${slugifiedName}@${model.provider}.local`;
     }
     
     // Default to llama.local for local models
     return `${slugifiedName}@llama.local`;
   }
   ```
   
   Examples:
   - Local model: `mistral-7b-instruct-v0-2@llama.local`
   - Cloud model: `claude-3-opus@anthropic.local`

4. `AIAssistantModel` uses this service rather than duplicating functionality:
   ```typescript
   // AIAssistantModel now delegates identity creation to LLMManager
   async createAIContact(displayName, modelType, modelConfig) {
     const llmManager = await LLMManager.getInstance(...);
     const updatedModel = await llmManager.setupLLMWithIdentity(modelConfig);
     return ensureIdHash<Person>(updatedModel.personId);
   }
   ```

## Required Model Fields

When creating an LLM model object, ensure it includes ALL required fields:

```typescript
const modelObject: LLM = {
  $type$: 'LLM',
  name: 'Model Name',
  filename: 'filename.gguf',
  modelType: 'local',  // Use 'cloud' for Claude models
  provider: 'anthropic', // For cloud models
  deleted: false,
  // Required fields that must not be omitted
  active: false,              // Boolean indicating if model is active
  creator: '',                // String for creator info
  created: Date.now(),        // Timestamp for creation date
  modified: Date.now(),       // Timestamp for last modification
  // Other fields
  createdAt: new Date().toISOString(),
  lastUsed: new Date().toISOString(),
  usageCount: 0,
  // ... other fields
};
```

The system uses `LLMManager.createLLM()` to ensure all required fields are set correctly. Always use this method instead of creating objects directly to avoid missing required fields:

```typescript
const validModel = llmManager.createLLM({
  name: 'Model Name',
  filename: 'filename.gguf',
  modelType: 'local', // or 'cloud' for Claude
  provider: 'anthropic', // for cloud models
  // Only provide the fields you want to set - createLLM will handle the rest
});
```

Omitting any required field will result in errors like:
```
Error: M2O-PD1: Value for property "active" is missing but there is no "optional" flag
```

## Common Issues

1. "No model available" despite model being stored
   - Usually means the initialization sequence was incorrect
   - Topics must be initialized before enabling provider
   - Provider config must be updated before enabling

2. Model visible but not usable
   - Check if AI topics were properly initialized
   - Verify provider configuration has correct model path
   - Ensure provider was enabled after setup

3. Type errors in `createPerson` or `setupLLMWithIdentity`
   - The `leuteModel.createPerson()` function may not be available in all builds/environments
   - Always verify the function exists before calling it:
   ```typescript
   if (typeof this.leuteModel.createPerson === 'function') {
     const person = await this.leuteModel.createPerson();
     // ...
   } else {
     // Fall back to direct Person object creation
     const person = { 
       $type$: 'Person', 
       email: `${modelName}@llama.local` // Using the correct naming pattern
     };
     // ... store the person ...
   }
   ```

4. Cloud API authentication errors
   - Verify API key format (should start with "sk-")
   - Check network connectivity
   - Ensure endpoint URL is correct and accessible

5. Syntax errors in template strings
   - Always close template strings with backticks
   - Check for unterminated template literals in console logging
   ```typescript
   // WRONG:
   console.log(`Storing model: ${model.name}); // Missing closing backtick
   
   // CORRECT:
   console.log(`Storing model: ${model.name}`);
   ```

## Implementation Notes

The initialization sequence is critical. Always follow this order:

```typescript
// 1. Store model and metadata, including identity creation
const updatedModel = await llmManager.setupLLMWithIdentity(modelConfig);

// 2. Initialize AI topics
await aiModel.initializeAITopics();

// 3. Update provider configuration
// For local models:
await aiModel.updateProviderConfig('local', {
  settings: {
    modelPath: updatedModel.filename,
    modelName: updatedModel.name,
    architecture: updatedModel.architecture,
    // ... other settings
  }
});
// OR for cloud models:
await aiModel.updateProviderConfig('cloud', {
  settings: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    apiKey: 'sk-ant-...',
    model: 'claude-3-opus',
    maxTokens: 2048,
    temperature: 0.7
  }
});

// 4. Enable the provider
await aiModel.setProviderEnabled('local', true); // or 'cloud' for cloud providers
```

Progress tracking during import:
- 0.1: Started copying
- 0.5: Model stored and identity created
- 0.7: Topics initialized
- 0.9: Config updated
- 1.0: Provider enabled

## Model Manager

The `LLMManager` handles:
- Model file storage
- Metadata management
- Model validation
- Import from files/URLs
- Identity creation and management

Key methods:
- `setupLLMWithIdentity`: Creates/updates LLM identity
- `importFromFile`/`importFromUrl`: Import models
- `createLLM`: Creates a properly formatted LLM object with all required fields
- `generateAIEmail`: Creates a standardized email for AI identity

Key events:
- `onModelImported`: Emitted when new model is imported
- `onModelsUpdated`: Emitted when models list changes

## Provider States

AI providers can be in these states:
1. No model available (initial state)
2. Model stored but not initialized
3. Model initialized but provider disabled
4. Model initialized and provider enabled (ready to use)

Always check provider state before operations and ensure proper initialization sequence is followed.

## AI Task and Subject Data Types

The AI system defines two new ONE datatypes to support advanced conversation processing:

### AITask Datatype

AITask represents a configurable task that AI assistants can perform on conversations.

```typescript
interface AITask {
  $type$: 'AITask';
  
  // Task identification
  name: string;                    // Human-readable task name
  type: AITaskType;               // Task type from predefined list
  
  // Metadata
  creationDate: number;           // Unix timestamp of creation
  owner: SHA256IdHash<Person>;    // Person who created the task
  
  // Dynamic topic associations
  topicAssociations?: Array<{
    topicId: string;              // Topic/channel this task is associated with
    enabled: boolean;             // Whether task is active for this topic
    priority: number;             // Execution order (lower = higher priority)
    addedDate: number;            // When task was added to topic
    addedBy: SHA256IdHash<Person>; // Who added this task to the topic
  }>;
  
  // Task configuration
  config?: {
    messageCount?: number;        // For RESPOND_TO_LAST_N, SUMMARIZE_LAST_N
    maxKeywords?: number;         // For EXTRACT_KEYWORDS
    minMessages?: number;         // For IDENTIFY_SUBJECTS
    formatStyle?: 'bullets' | 'paragraphs' | 'sections'; // For SUMMARIZE_BY_SUBJECT
    customPrompt?: string;        // For CUSTOM tasks
    shouldRespond?: boolean;      // Generate chat response?
    shouldStore?: boolean;        // Store results?
    triggerOn?: 'user' | 'ai' | 'both'; // Message trigger type
  };
}

// Task ID is derived from type and creation date
function getTaskId(task: AITask): string {
  return `${task.type}-${task.creationDate}`;
}
```

### AISubject Datatype

AISubject represents a distinct topic or theme identified within conversations.

```typescript
interface AISubject {
  $type$: 'AISubject';
  
  // Subject identification
  name: string[];                 // Array of keywords identifying the subject
  summary: string;                // Concise summary of the subject
  
  // Context and relationships
  context: SHA256IdHash<AISubject>[]; // Related subjects
  
  // Topic references
  topicReferences: Array<{
    topicId: string;                    // Topic/channel ID
    messageHashes: SHA256IdHash<any>[]; // Messages discussing this subject
  }>;
  
  // Metadata
  owner: SHA256IdHash<Person>;          // Person who owns this subject
  creationDate: number;                 // Unix timestamp
  lastUpdated: number;                  // Last modification timestamp
}

// Subject ID is derived from the keyword array
function getSubjectId(subject: AISubject): string {
  return subject.name.sort().join('-').toLowerCase();
}
```

### Usage Examples

#### Creating an AITask

```typescript
const extractKeywordsTask: AITask = {
  $type$: 'AITask',
  name: 'Extract Keywords from Conversation',
  type: AITaskType.EXTRACT_KEYWORDS,
  creationDate: Date.now(),
  owner: userPersonId,
  config: {
    maxKeywords: 10,
    shouldStore: true,
    triggerOn: 'both'
  }
};
```

#### Creating an AISubject

```typescript
const projectDiscussion: AISubject = {
  $type$: 'AISubject',
  name: ['project', 'architecture', 'design'],
  summary: 'Discussion about the new project architecture and design patterns',
  context: [relatedSubjectId1, relatedSubjectId2],
  topicReferences: [
    {
      topicId: 'chat-with-assistant',
      messageHashes: [msg1Hash, msg2Hash, msg3Hash]
    }
  ],
  owner: userPersonId,
  creationDate: Date.now(),
  lastUpdated: Date.now()
};
```

### Integration with Task System

These datatypes integrate with the existing AI task execution system:

1. **AITask** objects can be stored and retrieved from the ONE storage system
2. **AISubject** objects are created by tasks like `IDENTIFY_SUBJECTS` and `SUMMARIZE_BY_SUBJECT`
3. Both types can be queried and managed through the channel system
4. Subjects can form a knowledge graph through their context relationships

### Dynamic Task Association

Tasks can be dynamically associated with topics, allowing flexible configuration of AI behavior:

```typescript
// Example: Adding a task to a topic
async function addTaskToTopic(
  task: AITask, 
  topicId: string, 
  addedBy: SHA256IdHash<Person>
): Promise<void> {
  // Add or update topic association
  const association = {
    topicId,
    enabled: true,
    priority: 1,
    addedDate: Date.now(),
    addedBy
  };
  
  if (!task.topicAssociations) {
    task.topicAssociations = [];
  }
  
  // Check if already associated
  const existing = task.topicAssociations.findIndex(a => a.topicId === topicId);
  if (existing >= 0) {
    task.topicAssociations[existing] = association;
  } else {
    task.topicAssociations.push(association);
  }
  
  // Store updated task
  await storeVersionedObject(task);
}

// Example: Getting active tasks for a topic
async function getActiveTasksForTopic(topicId: string): Promise<AITask[]> {
  // Query all AITask objects
  const allTasks = await channelManager.getObjectsWithType('AITask');
  
  // Filter for tasks associated with this topic
  return allTasks
    .filter(task => 
      task.topicAssociations?.some(a => 
        a.topicId === topicId && a.enabled
      )
    )
    .sort((a, b) => {
      // Sort by priority
      const aPriority = a.topicAssociations?.find(x => x.topicId === topicId)?.priority || 999;
      const bPriority = b.topicAssociations?.find(x => x.topicId === topicId)?.priority || 999;
      return aPriority - bPriority;
    });
}
```

This dynamic association enables:
- **Per-topic customization**: Different topics can have different sets of active tasks
- **User control**: Users can enable/disable tasks for specific conversations
- **Priority management**: Tasks execute in a defined order per topic
- **Shared tasks**: One task definition can be reused across multiple topics
- **Audit trail**: Track who added tasks and when

### Subject Channel (IoM System Topic)

The AI system maintains a dedicated IoM (Internet of Me) system channel for AISubject objects, enabling knowledge discovery and sharing across all connected devices:

```typescript
const SUBJECT_CHANNEL_ID = 'AISubjectsChannel'; // IoM system topic
```

#### IoM Integration

The AISubjectsChannel is a system topic similar to EveryoneTopic:
- **Cross-Device Sync**: Subjects synchronize across all devices in the user's IoM
- **Persistent Knowledge**: Subjects persist across app restarts and device changes
- **Shared Infrastructure**: Part of the core IoM system topics
- **No Owner Required**: Uses `null` owner like other system channels

#### Purpose

The subject channel serves as a central repository for all AI-identified subjects across the IoM:
- **Discovery**: Browse all subjects from any connected device
- **Search**: Find subjects by keywords or summary content
- **Universal Access**: Subjects are available on all IoM devices
- **Knowledge Graph**: Build relationships between subjects across the network

#### Operations

```typescript
// Initialize the subject channel
await taskManager.initializeSubjectChannel();

// Create a subject (automatically posted to channel)
const subject = await taskManager.createSubject(
  ['machine-learning', 'neural-networks'],
  'Discussion about neural network architectures and training methods'
);

// Search subjects
const mlSubjects = await taskManager.getSubjectsByKeywords(['machine-learning']);
const summaryResults = await taskManager.searchSubjectsBySummary('neural network');

// Get all subjects
const allSubjects = await taskManager.getAllSubjects();

// Get subjects for a specific topic
const topicSubjects = await taskManager.getSubjectsForTopic(topicId);
```

#### Channel Structure

The subject channel stores AISubject objects with:
- Automatic indexing by keywords
- Chronological ordering by creation date
- Topic cross-references for context
- Owner attribution for filtering

This enables building a searchable knowledge base from conversations across the entire system.

#### Journal Integration

Every AISubject operation creates a journal entry for audit and timeline tracking:

```typescript
// Journal entry structure for AISubject events
interface SubjectJournalEntry extends JournalEntry {
  type: 'AISubject';
  data: {
    action: 'created' | 'updated' | 'referenced';
    subjectId: string;
    keywords: string[];
    summary: string;
    topicCount: number;
    contextCount: number;
  };
}
```

Journal entries are created for:
- **Subject Creation**: When a new subject is identified
- **Topic References**: When a subject is linked to a new topic
- **Context Updates**: When subject relationships change

This provides:
- **Audit Trail**: Complete history of knowledge discovery
- **Timeline View**: When subjects were identified
- **Usage Tracking**: Which topics reference which subjects
- **Knowledge Evolution**: How understanding develops over time

### Benefits

- **Persistence**: Tasks and subjects are stored in the ONE system
- **Reusability**: Tasks can be shared and reused across topics
- **Knowledge Building**: Subjects create a searchable knowledge base
- **Flexibility**: Custom tasks allow user-defined processing
- **Traceability**: Owner and timestamp tracking for all objects 

## 2025-07 Optimisations

### 1. Debounced channel updates

The CHUM protocol emits one *channel-update* event **per stored object** (ChatMessage   + attachments).  In practice an AI reply can create 5-10 objects which used to
result in 5-10 `channelManager.onUpdated` callbacks in less than a second.

`AIMessageListener` now coalesces those bursts with a per-channel debounce window
of **200 ms**:

```ts
private static readonly DEBOUNCE_MS = 200;
```

If multiple updates arrive for the same `channelId` within that window we clear
the previous timer and schedule a single callback.  The AI layer therefore sees
exactly **one** notification for each logical user/AI action which eliminates
log spam and unnecessary queue work.

### 2. Single-topic generation lock

`AIMessageProcessor.currentlyGeneratingTopicId` is set as soon as the message
queue for a topic starts processing and cleared only when that queue is empty.

All subsequent notifications for **other** topics are deferred until the lock
is cleared, preventing a cascade of `handleTopicMessage → defer → defer …`
loops while a long generation is running.

### 3. Removing `<think>` blocks from stored ChatMessage text

`createAIMessage()` now:

1. Extracts *every* `<think>…</think>` block from the LLM response.
2. Stores the combined reasoning text as a CLOB attachment (so debugging tools
   can still inspect it).
3. Writes only the visible answer into the `text` field – users and prompt
   builder never see internal reasoning anymore.

This fixed the “Skipping corrupted AI message” warnings and reduces prompt size
by hundreds of tokens.

---
These three changes together restored sub-second pipeline overhead; the wall-
clock latency of an AI reply is now dominated by the LLM generation time, not
by message-handling overhead.

### 4. Prompt deduplication of repeated apology messages

`AIPromptBuilder.buildChatMessages()` now removes consecutive identical
assistant messages before the prompt is sent to the model.  Typical case: five
copies of the same _“I’m sorry, but …”_ apology that were stored while the
format-checker rejected earlier replies.  Deduplication trims the prompt by
≈ 150–300 tokens in real logs and eliminates wasted context.

```ts
// inside buildChatMessages()
if (
  msg.role === 'assistant' &&
  deduped.length &&
  deduped[deduped.length - 1].role === 'assistant' &&
  deduped[deduped.length - 1].content.trim() === msg.content.trim()
) {
  // skip exact duplicate
  continue;
}
```

### 5. Dynamic max-tokens cap for very short queries

`AIMessageProcessor.calculateMaxTokensForQuery()` now applies tight upper
bounds based on the *length of the user input*:

| Input length | Max tokens |
|--------------|------------|
| ≤ 12 chars   | 64         |
| ≤ 25 chars   | 128        |
| otherwise    | unchanged  |

For trivial prompts like “Hi” or “Aloha” the model no longer tries to generate
500-plus tokens, shaving another ~8–10 s off CPU-bound local models.

---
Total effect of items 4 & 5:  **prompt size –45 %**  and **inference time –65 %**
for the short-message benchmarks while keeping full context for longer
conversations. 