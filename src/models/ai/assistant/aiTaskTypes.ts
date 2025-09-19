/**
 * AI Task Types - Configurable tasks that AI assistants can perform
 */

export enum AITaskType {
  // Conversation tasks
  RESPOND_TO_LAST = 'respond_to_last',          // Respond to the last user message
  RESPOND_TO_LAST_N = 'respond_to_last_n',      // Respond to last N messages
  RESPOND_TO_ALL = 'respond_to_all',            // Consider full conversation
  
  // Summary tasks
  SUMMARIZE_CONVERSATION = 'summarize',         // Create a summary of the conversation
  SUMMARIZE_LAST_N = 'summarize_last_n',        // Summarize last N messages
  SUMMARIZE_BY_SUBJECT = 'summarize_by_subject', // Summarize by identified subjects
  
  // Analysis tasks
  EXTRACT_KEYWORDS = 'extract_keywords',         // Extract keywords from conversation
  DETECT_INTENT = 'detect_intent',               // Detect user intent
  ANALYZE_SENTIMENT = 'analyze_sentiment',       // Analyze conversation sentiment
  IDENTIFY_SUBJECTS = 'identify_subjects',       // Identify distinct subjects/topics
  
  // Generation tasks
  GENERATE_TITLE = 'generate_title',             // Generate a title for the conversation
  SUGGEST_RESPONSES = 'suggest_responses',       // Suggest possible responses
  
  // Custom tasks
  CUSTOM = 'custom'                              // Custom user-defined task
}

export interface AITaskConfig {
  type: AITaskType;
  enabled: boolean;
  priority: number;  // Order of execution if multiple tasks
  
  // Task-specific configuration
  config?: {
    // For RESPOND_TO_LAST_N and SUMMARIZE_LAST_N
    messageCount?: number;
    
    // For EXTRACT_KEYWORDS
    maxKeywords?: number;
    
    // For IDENTIFY_SUBJECTS
    minMessages?: number;        // Minimum messages to form a subject
    
    // For SUMMARIZE_BY_SUBJECT
    formatStyle?: 'bullets' | 'paragraphs' | 'sections';
    requireSubjectIdentification?: boolean;
    
    // For CUSTOM tasks
    customPrompt?: string;
    
    // Response behavior
    shouldRespond?: boolean;      // Should this task generate a chat response?
    shouldStore?: boolean;        // Should results be stored (e.g., summaries)?
    triggerOn?: 'user' | 'ai' | 'both';  // What type of messages trigger this task
  };
}

export interface AITaskResult {
  taskType: AITaskType;
  success: boolean;
  result?: any;
  error?: string;
  timestamp: Date;
}

/**
 * Default task configurations for different AI modes
 */
export const DEFAULT_TASK_CONFIGS: { [key: string]: AITaskConfig[] } = {
  // Standard chat mode - just respond to messages
  chat: [
    {
      type: AITaskType.RESPOND_TO_LAST,
      enabled: true,
      priority: 1,
      config: {
        shouldRespond: true,
        triggerOn: 'user'
      }
    }
  ],
  
  // Assistant mode - respond and analyze
  assistant: [
    {
      type: AITaskType.RESPOND_TO_ALL,
      enabled: true,
      priority: 1,
      config: {
        shouldRespond: true,
        triggerOn: 'user'
      }
    },
    {
      type: AITaskType.EXTRACT_KEYWORDS,
      enabled: true,
      priority: 2,
      config: {
        maxKeywords: 5,
        shouldStore: true,
        triggerOn: 'both'
      }
    }
  ],
  
  // Summary mode - focus on summarization
  summarizer: [
    {
      type: AITaskType.SUMMARIZE_LAST_N,
      enabled: true,
      priority: 1,
      config: {
        messageCount: 10,
        shouldStore: true,
        shouldRespond: true,
        triggerOn: 'user'
      }
    },
    {
      type: AITaskType.GENERATE_TITLE,
      enabled: true,
      priority: 2,
      config: {
        shouldStore: true,
        triggerOn: 'user'
      }
    }
  ]
};