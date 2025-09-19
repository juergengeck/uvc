# AI Assistant Refactoring

This directory contains the refactored implementation of the AIAssistantModel, breaking it down into more focused components with clearer responsibilities.

## Architecture

The AI Assistant functionality has been refactored into the following components:

### Core Components

1. **AITopicManager** (`aiTopicManager.ts`)
   - Manages AI chat topics
   - Maps topics to models
   - Handles topic loading state
   - Provides helper methods for topic naming/creation

2. **AIMessageProcessor** (`aiMessageProcessor.ts`)
   - Processes incoming messages
   - Handles message queues and prioritization
   - Coordinates message extraction and response generation
   - Manages system topics and their messages

3. **AIPromptBuilder** (`aiPromptBuilder.ts`)
   - Builds prompts for the LLM based on conversation history
   - Formats prompts with system instructions
   - Manages prompt history and context

4. **Shared Utilities** (`utils.ts`)
   - Contains shared interfaces and utility classes
   - Uses OEvent from @refinio/one.models for event handling
   - Defines common interfaces like TopicModelWithCreateGroupTopic

### Integration

All components are exported through the `index.ts` file, making them available to the rest of the application.

## Current Status

The refactoring is in progress:

- ✅ Core components have been extracted and implemented
- ✅ Component interfaces are well-defined
- ✅ Inter-component communication is established
- ⬜ Integration with AIAssistantModel.ts is pending
- ⬜ Unit tests need to be updated

## Next Steps

1. Create a top-level `AIAssistantModel.ts` in this directory that uses all these components
2. Migrate the remaining functionality from the original AIAssistantModel.ts
3. Update any code that directly imports or uses AIAssistantModel
4. Add unit tests for the new components
5. Remove the old implementation once migration is complete

## Implementation Notes

- The components use dependency injection for easier testing and flexibility
- Circular dependencies are avoided by using optional references (see AIPromptBuilder)
- All components include proper logging for debugging purposes
- Component responsibilities are clearly defined and separated 