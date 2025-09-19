// Export utilities
export { type TopicModelWithCreateGroupTopic } from './utils';

// Export AI assistant components with their implementations
export { AITopicManager } from './aiTopicManager';
export { AIPromptBuilder, type PromptResult } from './aiPromptBuilder';
export { AIMessageProcessor } from './aiMessageProcessor';

// Export the main AIAssistantModel
export { default as AIAssistantModel } from './AIAssistantModel';

// This will be the main export once we move AIAssistantModel
// export { AIAssistantModel } from './AIAssistantModel'; 