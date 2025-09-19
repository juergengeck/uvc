# AI Tasks System

## Overview

The AI Tasks system provides a flexible, configurable framework for AI assistants to perform various tasks on conversations. Instead of hardcoding behavior like "respond to the last message", the system allows multiple task types that can be combined and configured.

## Task Types

### Conversation Tasks

#### `RESPOND_TO_LAST`
- **Purpose**: Respond to the most recent user message
- **Use Case**: Standard chat behavior
- **Config Options**:
  - `shouldRespond`: true (generates a chat message)
  - `triggerOn`: 'user' (only triggers on user messages)

#### `RESPOND_TO_LAST_N`
- **Purpose**: Consider the last N messages for context
- **Use Case**: When recent context is important
- **Config Options**:
  - `messageCount`: Number of messages to consider (default: 5)
  - `shouldRespond`: true
  - `triggerOn`: 'user'

#### `RESPOND_TO_ALL`
- **Purpose**: Consider the entire conversation history
- **Use Case**: Complex queries requiring full context
- **Config Options**:
  - `shouldRespond`: true
  - `triggerOn`: 'user'

### Summary Tasks

#### `SUMMARIZE_CONVERSATION`
- **Purpose**: Create a summary of the entire conversation
- **Use Case**: Long conversations, meeting notes
- **Config Options**:
  - `shouldStore`: true (save the summary)
  - `shouldRespond`: optional (post summary as message)

#### `SUMMARIZE_LAST_N`
- **Purpose**: Summarize recent messages
- **Use Case**: Periodic summaries, context switching
- **Config Options**:
  - `messageCount`: Number of messages to summarize
  - `shouldStore`: true
  - `triggerOn`: 'user' or 'both'

#### `SUMMARIZE_BY_SUBJECT`
- **Purpose**: Create separate summaries for each identified subject
- **Use Case**: Multi-topic conversations, meeting notes with agenda items
- **Config Options**:
  - `shouldStore`: true
  - `shouldRespond`: optional (post summaries as message)
  - `requireSubjectIdentification`: true (depends on IDENTIFY_SUBJECTS)
  - `formatStyle`: 'bullets' | 'paragraphs' | 'sections'

### Analysis Tasks

#### `EXTRACT_KEYWORDS`
- **Purpose**: Extract key topics and keywords
- **Use Case**: Tagging, search optimization, topic detection
- **Config Options**:
  - `maxKeywords`: Maximum keywords to extract (default: 5)
  - `shouldStore`: true
  - `triggerOn`: 'both' (analyze all messages)

#### `DETECT_INTENT`
- **Purpose**: Understand user's intention
- **Use Case**: Smart routing, action suggestions
- **Config Options**:
  - `shouldStore`: true
  - `triggerOn`: 'user'

#### `ANALYZE_SENTIMENT`
- **Purpose**: Analyze emotional tone
- **Use Case**: Customer support, mood tracking
- **Config Options**:
  - `shouldStore`: true
  - `triggerOn`: 'both'

#### `IDENTIFY_SUBJECTS`
- **Purpose**: Identify distinct subjects/topics discussed
- **Use Case**: Multi-topic conversations, context switching detection
- **Config Options**:
  - `shouldStore`: true
  - `triggerOn`: 'both'
  - `minMessages`: Minimum messages to form a subject (default: 3)

### Generation Tasks

#### `GENERATE_TITLE`
- **Purpose**: Auto-generate conversation titles
- **Use Case**: Automatic chat naming
- **Config Options**:
  - `shouldStore`: true
  - `triggerOn`: 'user' (after meaningful exchange)

#### `SUGGEST_RESPONSES`
- **Purpose**: Suggest possible user responses
- **Use Case**: Quick replies, conversation assistance
- **Config Options**:
  - `maxSuggestions`: Number of suggestions (default: 3)
  - `shouldStore`: false

### Custom Tasks

#### `CUSTOM`
- **Purpose**: User-defined tasks with custom prompts
- **Use Case**: Specialized analysis, custom workflows
- **Config Options**:
  - `customPrompt`: The prompt template to use
  - `shouldRespond`: Depends on use case
  - `shouldStore`: Depends on use case

## Configuration Examples

### Standard Chat Mode
```typescript
const chatConfig: AITaskConfig[] = [
  {
    type: AITaskType.RESPOND_TO_LAST,
    enabled: true,
    priority: 1,
    config: {
      shouldRespond: true,
      triggerOn: 'user'
    }
  }
];
```

### Smart Assistant Mode
```typescript
const assistantConfig: AITaskConfig[] = [
  {
    type: AITaskType.DETECT_INTENT,
    enabled: true,
    priority: 1,
    config: {
      shouldStore: true,
      triggerOn: 'user'
    }
  },
  {
    type: AITaskType.RESPOND_TO_ALL,
    enabled: true,
    priority: 2,
    config: {
      shouldRespond: true,
      triggerOn: 'user'
    }
  },
  {
    type: AITaskType.EXTRACT_KEYWORDS,
    enabled: true,
    priority: 3,
    config: {
      maxKeywords: 5,
      shouldStore: true,
      triggerOn: 'both'
    }
  }
];
```

### Meeting Summarizer
```typescript
const summarizerConfig: AITaskConfig[] = [
  {
    type: AITaskType.IDENTIFY_SUBJECTS,
    enabled: true,
    priority: 1,
    config: {
      shouldStore: true,
      minMessages: 3,
      triggerOn: 'both'
    }
  },
  {
    type: AITaskType.SUMMARIZE_BY_SUBJECT,
    enabled: true,
    priority: 2,
    config: {
      shouldStore: true,
      shouldRespond: true,
      formatStyle: 'sections',
      triggerOn: 'user'
    }
  },
  {
    type: AITaskType.GENERATE_TITLE,
    enabled: true,
    priority: 3,
    config: {
      shouldStore: true,
      triggerOn: 'user'
    }
  },
  {
    type: AITaskType.EXTRACT_KEYWORDS,
    enabled: true,
    priority: 4,
    config: {
      maxKeywords: 10,
      shouldStore: true,
      triggerOn: 'both'
    }
  }
];
```

### Custom Analysis
```typescript
const customConfig: AITaskConfig[] = [
  {
    type: AITaskType.CUSTOM,
    enabled: true,
    priority: 1,
    config: {
      customPrompt: 'Analyze this conversation for action items and list them in bullet points:',
      shouldRespond: true,
      shouldStore: true,
      triggerOn: 'user'
    }
  }
];
```

## Implementation Details

### Task Execution Flow

1. **Trigger Detection**: When a message is posted, check if it matches the `triggerOn` criteria
2. **Task Selection**: Get all enabled tasks for the current AI mode
3. **Priority Sorting**: Sort tasks by priority (lower number = higher priority)
4. **Sequential Execution**: Execute tasks in order, collecting results
5. **Result Processing**: 
   - If `shouldRespond` is true, post the response as a message
   - If `shouldStore` is true, save the result for later use

### Task Chaining

Tasks can build on each other's results:

```typescript
// Example: Intent detection influences response generation
const chainedConfig: AITaskConfig[] = [
  {
    type: AITaskType.DETECT_INTENT,
    enabled: true,
    priority: 1,
    config: {
      shouldStore: true
    }
  },
  {
    type: AITaskType.CUSTOM,
    enabled: true,
    priority: 2,
    config: {
      customPrompt: 'Based on the detected intent, provide a specialized response:',
      shouldRespond: true
    }
  }
];
```

```typescript
// Example: Subject identification enables subject-based summaries
const subjectAnalysisConfig: AITaskConfig[] = [
  {
    type: AITaskType.IDENTIFY_SUBJECTS,
    enabled: true,
    priority: 1,
    config: {
      shouldStore: true,
      minMessages: 3
    }
  },
  {
    type: AITaskType.SUMMARIZE_BY_SUBJECT,
    enabled: true,
    priority: 2,
    config: {
      shouldRespond: true,
      formatStyle: 'sections',
      requireSubjectIdentification: true
    }
  }
];
```

### Error Handling

Each task is executed independently with error isolation:
- If one task fails, others continue
- Failed tasks return error results
- System remains functional even with partial failures

### Performance Considerations

1. **Parallel Execution**: Tasks with same priority could run in parallel
2. **Caching**: Results can be cached to avoid reprocessing
3. **Token Limits**: Each task respects model token limits
4. **Rate Limiting**: System can throttle task execution

## Future Enhancements

1. **Task Dependencies**: Define explicit dependencies between tasks
2. **Conditional Execution**: Run tasks based on previous results
3. **Scheduled Tasks**: Run tasks on a schedule (hourly summaries, etc.)
4. **Task Templates**: Pre-built task configurations for common use cases
5. **Multi-Model Tasks**: Use different models for different tasks
6. **External Integrations**: Tasks that interact with external services

## Benefits

1. **Flexibility**: Easy to add new capabilities without changing core code
2. **Configurability**: Users can customize AI behavior
3. **Extensibility**: New task types can be added easily
4. **Reusability**: Tasks can be shared across different AI modes
5. **Testability**: Each task can be tested independently