# AIAssistantModel Integration Guide

This document outlines the steps to migrate from the original monolithic `AIAssistantModel` to the new refactored component architecture.

## Overview of Changes

We've refactored the `AIAssistantModel` into more focused components:

1. **AITopicManager**: Manages AI chat topics and their relationship to models
2. **AIMessageProcessor**: Processes messages and generates responses
3. **AIPromptBuilder**: Creates properly formatted prompts for the LLM
4. **Utils**: Contains shared utilities and interfaces

## Migration Steps

### Step 1: Import the New Components

Add these imports to `src/models/AIAssistantModel.ts`:

```typescript
// Import refactored components from the assistant directory
import { 
  AITopicManager, 
  AIMessageProcessor, 
  AIPromptBuilder
} from './ai/assistant';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
```

### Step 2: Add Component Properties

Add these properties to the `AIAssistantModel` class:

```typescript
// Refactored components
private aiTopicManager!: AITopicManager;
private aiMessageProcessor!: AIMessageProcessor;
private aiPromptBuilder!: AIPromptBuilder;
```

### Step 3: Initialize Components

Add this method to initialize the components and call it from `_init()`:

```typescript
/**
 * Initialize the refactored components
 */
private async initializeComponents(): Promise<void> {
  try {
    console.log('[AIAssistantModel] Initializing refactored components');
    
    // 1. Create the AITopicManager
    this.aiTopicManager = new AITopicManager(
      this.topicModel,
      this.llmManager,
      this.channelManager,
      this.leuteModel,
      this.personId,
      this // Pass 'this' as aiaModel reference
    );
    
    // 2. Create the AIPromptBuilder
    this.aiPromptBuilder = new AIPromptBuilder(
      this.channelManager,
      this.llmManager,
      this.leuteModel,
      this.aiTopicManager
    );
    
    // 3. Create the AIMessageProcessor
    this.aiMessageProcessor = new AIMessageProcessor(
      this.channelManager,
      this.llmManager,
      this.personId,
      this.aiTopicManager,
      this.aiPromptBuilder,
      this.availableLLMModels
    );
    
    // 4. Connect circular references
    this.aiPromptBuilder.setMessageProcessor(this.aiMessageProcessor);
    
    // 5. Set up event forwarding
    // Forward topic loading state changes 
    this.aiTopicManager.onTopicLoadingStateChanged.listen((topicId, isLoading) => {
      console.log(`[AIAssistantModel] Topic ${topicId} loading state changed: ${isLoading}`);
    });
    
    console.log('[AIAssistantModel] Refactored components initialized successfully');
  } catch (error) {
    console.error('[AIAssistantModel] Error initializing refactored components:', error);
    throw error;
  }
}
```

Update `_init()` to call this method:

```typescript
private async _init(): Promise<void> {
  try {
    console.log('[AIAssistantModel] Initializing...');
    
    // Ensure critical dependencies for AITopicManager are ready
    if (!this.topicModel || !this.llmManager || !this.channelManager || !this.leuteModel || !this.personId) {
        throw new Error('[AIAssistantModel] Cannot initialize components - core dependencies missing in _init');
    }

    // Initialize refactored components
    await this.initializeComponents();
    
    // ... rest of existing initialization ...
  } catch (error) {
    console.error('[AIAssistantModel] Error during initialization:', error);
    throw error;
  }
}
```

### Step 4: Delegate Methods

Replace the implementations of these methods to delegate to the new components:

```typescript
/**
 * Handle incoming message from a topic
 */
public async handleTopicMessage(topicId: string, message: any): Promise<void> {
  // Delegate to the AIMessageProcessor component
  return this.aiMessageProcessor.handleTopicMessage(topicId, message);
}

/**
 * Checks if a profile ID or person ID belongs to an AI assistant
 */
public isAIContact(profileIdOrPersonId: string | SHA256IdHash<Profile> | SHA256IdHash<Person>): boolean {
  // Delegate to the AIMessageProcessor component
  return this.aiMessageProcessor.isAIContact(profileIdOrPersonId);
}

/**
 * Checks if a message is from an AI by examining both sender and certificate
 */
public isAIMessage(message: any): boolean {
  // Delegate to the AIMessageProcessor component
  return this.aiMessageProcessor.isAIMessage(message);
}

/**
 * Gets display name for a topic
 */
public getTopicDisplayName(topicId: string): string | undefined {
  // Delegate to the AITopicManager component
  return this.aiTopicManager.getTopicDisplayName(topicId);
}

/**
 * Sets display name for a topic
 */
public setTopicDisplayName(topicId: string, name: string): void {
  // Delegate to the AITopicManager component
  this.aiTopicManager.setTopicDisplayName(topicId, name);
}

/**
 * Gets all AI topic IDs
 */
public getAllAITopicIds(): string[] {
  // Delegate to the AITopicManager component
  return this.aiTopicManager.getAllAITopicIds();
}
```

### Step 5: Update Model Access

Update `updateAvailableLLMModels()` to set models in the AIMessageProcessor:

```typescript
private async updateAvailableLLMModels(): Promise<LLM[]> {
  // ... existing implementation ...
  
  // Update the message processor's models
  this.aiMessageProcessor.setAvailableLLMModels(this.availableLLMModels);
  
  // ... rest of existing implementation ...
}
```

### Step 6: Progressive Migration

Gradually migrate these methods to the new components:

1. `processMessageQueue`: Move to AIMessageProcessor
2. `generateResponse`: Move to AIMessageProcessor
3. `cleanAIResponse`: Move to AIMessageProcessor
4. `sendResponseToTopic`: Move to AIMessageProcessor
5. `initializeAITopics`: Move to AITopicManager
6. `ensureTopicForModel`: Move to AITopicManager
7. `createTopic`: Move to AITopicManager

### Step 7: Testing Strategy

1. Test basic initialization
2. Test message handling
3. Test topic management
4. Test AI contact identification
5. Verify no regression in existing functionality

## Completion Checklist

- [ ] Import new components
- [ ] Add component properties 
- [ ] Initialize components in `_init()`
- [ ] Delegate core methods
- [ ] Update model access
- [ ] Progressively migrate remaining methods
- [ ] Comprehensive testing
- [ ] Remove unused code once migration is complete

## Future Improvements

Once the migration is complete:

1. Move shared interfaces to dedicated files
2. Implement unit tests for each component
3. Consider adding dependency injection for easier testing
4. Add comprehensive documentation 