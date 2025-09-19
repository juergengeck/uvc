import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type { LLMManager } from '../LLMManager';
import type { AITopicManager } from './aiTopicManager';
import { AITaskType, type AITaskConfig, type AITaskResult } from './aiTaskTypes';
import { getObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import type { AITaskManager } from './aiTaskManager';
import type { AIMessageProcessor } from './aiMessageProcessor';

/**
 * Default temperature settings for different task types
 * Lower temperatures = more deterministic/factual
 * Higher temperatures = more creative/varied
 */
const TASK_TEMPERATURE_DEFAULTS: Record<AITaskType, number> = {
  [AITaskType.RESPOND_TO_LAST]: 0.5,        // Conversational but consistent
  [AITaskType.RESPOND_TO_LAST_N]: 0.5,     // Conversational but consistent
  [AITaskType.RESPOND_TO_ALL]: 0.5,        // Conversational but consistent
  [AITaskType.SUMMARIZE_CONVERSATION]: 0.3, // Factual summarization
  [AITaskType.EXTRACT_KEYWORDS]: 0.2,       // Very deterministic extraction
  [AITaskType.GENERATE_TITLE]: 0.3,         // Consistent title generation
  [AITaskType.IDENTIFY_SUBJECTS]: 0.2,      // Deterministic identification
  [AITaskType.SUMMARIZE_BY_SUBJECT]: 0.3,   // Factual summarization
  [AITaskType.EXTRACT_ACTION_ITEMS]: 0.2,   // Deterministic extraction
  [AITaskType.ANALYZE_SENTIMENT]: 0.2,      // Consistent analysis
  [AITaskType.CUSTOM]: 0.5                  // Default for custom tasks
};

/**
 * AITaskExecutor - Executes configurable AI tasks on conversations
 */
export class AITaskExecutor {
  private channelManager: ChannelManager;
  private llmManager: LLMManager;
  private topicManager: AITopicManager;
  private leuteModel: LeuteModel;
  private taskManager?: AITaskManager;
  private messageProcessor?: AIMessageProcessor;

  constructor(
    channelManager: ChannelManager,
    llmManager: LLMManager,
    topicManager: AITopicManager,
    leuteModel: LeuteModel,
    messageProcessor?: AIMessageProcessor
  ) {
    this.channelManager = channelManager;
    this.llmManager = llmManager;
    this.topicManager = topicManager;
    this.leuteModel = leuteModel;
    this.messageProcessor = messageProcessor;
  }
  
  /**
   * Set the task manager for subject creation
   */
  public setTaskManager(taskManager: AITaskManager): void {
    this.taskManager = taskManager;
  }
  
  /**
   * Set the message processor for AI detection helpers
   */
  public setMessageProcessor(messageProcessor: AIMessageProcessor): void {
    this.messageProcessor = messageProcessor;
  }

  /**
   * Get the appropriate temperature for a task
   */
  private getTaskTemperature(task: AITaskConfig): number {
    // Check if task has custom temperature
    if ((task.config as any)?.temperature !== undefined) {
      return (task.config as any).temperature;
    }
    // Use task type default
    return TASK_TEMPERATURE_DEFAULTS[task.type] ?? 0.5;
  }

  /**
   * Execute a set of AI tasks for a topic
   */
  public async executeTasks(
    topicId: string,
    tasks: AITaskConfig[],
    modelId: string
  ): Promise<AITaskResult[]> {
    // Sort tasks by priority
    const sortedTasks = [...tasks]
      .filter(t => t.enabled)
      .sort((a, b) => a.priority - b.priority);

    const results: AITaskResult[] = [];

    for (const task of sortedTasks) {
      try {
        const result = await this.executeTask(topicId, task, modelId);
        results.push(result);
      } catch (error) {
        results.push({
          taskType: task.type,
          success: false,
          error: error.message,
          timestamp: new Date()
        });
      }
    }

    return results;
  }

  /**
   * Execute a single AI task
   */
  private async executeTask(
    topicId: string,
    task: AITaskConfig,
    modelId: string
  ): Promise<AITaskResult> {
    console.log(`[AITaskExecutor] Executing task ${task.type} for topic ${topicId}`);

    switch (task.type) {
      case AITaskType.RESPOND_TO_LAST:
        return await this.respondToLast(topicId, modelId, task);
      
      case AITaskType.RESPOND_TO_LAST_N:
        return await this.respondToLastN(topicId, modelId, task);
      
      case AITaskType.RESPOND_TO_ALL:
        return await this.respondToAll(topicId, modelId, task);
      
      case AITaskType.SUMMARIZE_CONVERSATION:
        return await this.summarizeConversation(topicId, modelId, task);
      
      case AITaskType.EXTRACT_KEYWORDS:
        return await this.extractKeywords(topicId, modelId, task);
      
      case AITaskType.GENERATE_TITLE:
        return await this.generateTitle(topicId, modelId, task);
      
      case AITaskType.IDENTIFY_SUBJECTS:
        return await this.identifySubjects(topicId, modelId, task);
      
      case AITaskType.SUMMARIZE_BY_SUBJECT:
        return await this.summarizeBySubject(topicId, modelId, task);
      
      case AITaskType.SUMMARIZE_LAST_N:
        return await this.summarizeLastN(topicId, modelId, task);
      
      case AITaskType.DETECT_INTENT:
        return await this.detectIntent(topicId, modelId, task);
      
      case AITaskType.ANALYZE_SENTIMENT:
        return await this.analyzeSentiment(topicId, modelId, task);
      
      case AITaskType.SUGGEST_RESPONSES:
        return await this.suggestResponses(topicId, modelId, task);
      
      case AITaskType.CUSTOM:
        return await this.executeCustomTask(topicId, modelId, task);
      
      default:
        throw new Error(`Unsupported task type: ${task.type}`);
    }
  }

  /**
   * Get messages from a topic
   */
  private async getMessages(topicId: string, limit?: number): Promise<any[]> {
    console.log(`[AITaskExecutor] Getting messages from topic ${topicId}`);
    
    try {
      // Get channel info for the topic
      const channelInfos = await this.channelManager.getMatchingChannelInfos({ 
        channelId: topicId 
      });
      
      if (channelInfos.length === 0) {
        console.log(`[AITaskExecutor] No channel info found for topic ${topicId}`);
        return [];
      }
      
      // Load messages from ALL channels to get complete conversation
      const messages: any[] = [];
      
      for (const channelInfo of channelInfos) {
        console.log(`[AITaskExecutor] Loading from channel owned by: ${channelInfo.owner?.substring(0, 8) || 'null'}`);
        
        // Get messages using channel iterator
        const iterator = (this.channelManager.constructor as any).singleChannelObjectIterator(channelInfo);
        
        for await (const entry of iterator) {
          if (entry && entry.dataHash) {
            try {
              const messageData = await getObject(entry.dataHash);
              if (messageData && (messageData.$type$ === 'ChatMessage' || messageData.text !== undefined)) {
                messages.push({
                  data: messageData,
                  creationTime: entry.creationTime || Date.now(),
                  hash: entry.dataHash
                });
              }
            } catch (err) {
              console.error('[AITaskExecutor] Failed to load message from entry', err);
            }
          }
        }
      }
      
      // Sort messages by creation time (newest first) after loading from all channels
      messages.sort((a, b) => b.creationTime - a.creationTime);
      
      // Apply limit after sorting if specified
      if (limit && messages.length > limit) {
        messages.length = limit;
      }
      
      // Messages are already in newest-first order from the iterator
      console.log(`[AITaskExecutor] Retrieved ${messages.length} messages`);
      return messages;
    } catch (error) {
      console.error(`[AITaskExecutor] Error getting messages from topic ${topicId}:`, error);
      return [];
    }
  }

  /**
   * Build a prompt from messages
   */
  private buildPromptFromMessages(messages: any[], instruction: string): string {
    const conversation = messages
      .reverse() // Oldest first for natural reading
      .map(msg => {
        const role = this.isAIMessage(msg) ? 'Assistant' : 'User';
        const text = msg.data?.text || msg.text || '';
        return `${role}: ${text}`;
      })
      .join('\n');

    // Simple format without extra newlines that trigger stop tokens
    return `${conversation}\n\nAssistant:`;
  }


  /**
   * Check if a message is from AI
   */
  private isAIMessage(message: any): boolean {
    // Use the message processor's helper if available
    if (this.messageProcessor) {
      // Extract the actual message data
      const messageData = message.data || message;
      return this.messageProcessor.isAIMessage(messageData);
    }
    
    // Fallback: Check for AI certificate in attachments
    const attachments = message.data?.attachments || message.attachments;
    if (attachments) {
      try {
        const { hasAICertificate } = require('../../../utils/messageUtils');
        return hasAICertificate(attachments);
      } catch (error) {
        console.error('[AITaskExecutor] Error checking AI certificate:', error);
      }
    }
    return false;
  }

  // Task implementations

  private async respondToLast(
    topicId: string,
    modelId: string,
    task: AITaskConfig
  ): Promise<AITaskResult> {
    console.log(`[AITaskExecutor] respondToLast called for topic ${topicId} with model ${modelId}`);
 
     // Retrieve recent messages (default 10)
     const messageCount = task.config?.messageCount || 10;
     const messages = await this.getMessages(topicId, messageCount);
 
     if (messages.length === 0) {
       return {
         taskType: task.type,
         success: false,
         error: 'No messages in topic',
         timestamp: new Date()
       };
     }
 
     // Get the last user message
     const lastUserMessage = messages.find(msg => !this.isAIMessage(msg));
     if (!lastUserMessage) {
       return {
         taskType: task.type,
         success: false,
         error: 'No user message found in recent messages',
         timestamp: new Date()
       };
     }
 
     const userText = lastUserMessage.data?.text || lastUserMessage.text || '';
     console.log(`[AITaskExecutor] Last user message: "${userText.substring(0, 100)}..."`);
 
     // Use the prompt builder to create proper chat messages
     // This ensures consistency and avoids duplicating system prompts
     const { AIPromptBuilder } = await import('./aiPromptBuilder');
     const promptBuilder = new AIPromptBuilder(
       this.channelManager, 
       this.llmManager, 
       this.leuteModel, 
       this.topicManager
     );
     
     // Set message processor if available
     if (this.messageProcessor) {
       promptBuilder.setMessageProcessor(this.messageProcessor);
     }
     
     const chatPrompt = await promptBuilder.buildChatMessages(modelId, userText, topicId);
     const chatMessages = chatPrompt.messages;
 
     const temperature = this.getTaskTemperature(task);
 
     console.log(`[AITaskExecutor] Built chat prompt with ${chatMessages.length} messages`);
     
     // Log the full prompt we're sending to the LLM
     console.log(`[AITaskExecutor] === FULL PROMPT BEING SENT TO LLM ===`);
     chatMessages.forEach((msg, index) => {
       const preview = msg.content.length > 200 ? 
         msg.content.substring(0, 200) + '...' : 
         msg.content;
       console.log(`[AITaskExecutor] [${index}] ${msg.role.toUpperCase()}: ${preview}`);
     });
     console.log(`[AITaskExecutor] === END OF PROMPT ===`);
     
     // Log the last user message to ensure we're seeing the right content
     const lastUserMsg = chatMessages.filter(m => m.role === 'user').pop();
     if (lastUserMsg) {
       console.log(`[AITaskExecutor] Last user message: "${lastUserMsg.content.substring(0, 100)}..."`);
     }
 
     // Get model-specific max tokens
     let maxTokens = 512; // fallback
     try {
       const model = await this.llmManager.getModelByIdHash(modelId);
       if (model && model.maxTokens) {
         maxTokens = Math.min(model.maxTokens, 1024); // Cap at 1024 for response generation
         console.log(`[AITaskExecutor] Using model max tokens: ${maxTokens}`);
       }
     } catch (error) {
       console.warn(`[AITaskExecutor] Error getting model max tokens:`, error);
     }
 
     const response = await this.llmManager.chatCompletionWithModel(modelId, chatMessages, {
       maxTokens,
       temperature
     });
 
     console.log(`[AITaskExecutor] LLM chat response received: "${response.substring(0, 80)}..."`);
     
     // Validate response has content after thinking tags
     let validatedResponse = response;
     const thinkingMatch = response.match(/<think>[\s\S]*?<\/think>/i);
     if (thinkingMatch) {
       const afterThinking = response.substring(thinkingMatch.index! + thinkingMatch[0].length).trim();
       if (!afterThinking) {
         console.warn('[AITaskExecutor] Response only contains thinking tags, adding default response');
         validatedResponse = response + '\n\nHello! I\'m here to help. How can I assist you today?';
       }
     } else if (response.includes('<think>') && !response.includes('</think>')) {
       // Unclosed thinking tag - add closing and default response
       console.warn('[AITaskExecutor] Unclosed thinking tag detected, fixing response');
       validatedResponse = response + '</think>\n\nHello! I\'m here to help. How can I assist you today?';
     } else if (!response.trim()) {
       console.warn('[AITaskExecutor] Empty response, adding default');
       validatedResponse = 'Hello! I\'m here to help. How can I assist you today?';
     }
 
     return {
       taskType: task.type,
       success: true,
       result: { response: validatedResponse, shouldRespond: task.config?.shouldRespond },
       timestamp: new Date()
     };
   }

  private async respondToLastN(
    topicId: string,
    modelId: string,
    task: AITaskConfig
  ): Promise<AITaskResult> {
    const n = task.config?.messageCount || 5;
    const messages = await this.getMessages(topicId, n);

    const prompt = this.buildPromptFromMessages(
      messages,
      'Based on the recent conversation, provide a helpful response:'
    );

    // Get model-specific max tokens
    let maxTokens = 512; // fallback
    try {
      const model = await this.llmManager.getModelByIdHash(modelId);
      if (model && model.maxTokens) {
        maxTokens = Math.min(model.maxTokens, 1024); // Cap at 1024 for response generation
      }
    } catch (error) {
      console.warn(`[AITaskExecutor] Error getting model max tokens:`, error);
    }

    const response = await this.llmManager.completeWithModel(modelId, prompt, {
      maxTokens,
      temperature: this.getTaskTemperature(task)
    });

    return {
      taskType: task.type,
      success: true,
      result: { response, shouldRespond: task.config?.shouldRespond },
      timestamp: new Date()
    };
  }

  private async respondToAll(
    topicId: string,
    modelId: string,
    task: AITaskConfig
  ): Promise<AITaskResult> {
    const messages = await this.getMessages(topicId);

    const prompt = this.buildPromptFromMessages(
      messages,
      'Based on the entire conversation, provide a helpful response:'
    );

    // Get model-specific max tokens
    let maxTokens = 512; // fallback
    try {
      const model = await this.llmManager.getModelByIdHash(modelId);
      if (model && model.maxTokens) {
        maxTokens = Math.min(model.maxTokens, 1024); // Cap at 1024 for response generation
      }
    } catch (error) {
      console.warn(`[AITaskExecutor] Error getting model max tokens:`, error);
    }

    const response = await this.llmManager.completeWithModel(modelId, prompt, {
      maxTokens,
      temperature: this.getTaskTemperature(task)
    });

    return {
      taskType: task.type,
      success: true,
      result: { response, shouldRespond: task.config?.shouldRespond },
      timestamp: new Date()
    };
  }

  private async summarizeConversation(
    topicId: string,
    modelId: string,
    task: AITaskConfig
  ): Promise<AITaskResult> {
    const messages = await this.getMessages(topicId);

    const prompt = this.buildPromptFromMessages(
      messages,
      'Summarize this conversation in 2-3 concise paragraphs:'
    );

    const summary = await this.llmManager.completeWithModel(modelId, prompt, {
      maxTokens: 300,
      temperature: this.getTaskTemperature(task)
    });

    return {
      taskType: task.type,
      success: true,
      result: { 
        summary, 
        messageCount: messages.length,
        shouldStore: task.config?.shouldStore 
      },
      timestamp: new Date()
    };
  }

  private async extractKeywords(
    topicId: string,
    modelId: string,
    task: AITaskConfig
  ): Promise<AITaskResult> {
    const messages = await this.getMessages(topicId);
    const maxKeywords = task.config?.maxKeywords || 5;

    const prompt = this.buildPromptFromMessages(
      messages,
      `Extract ${maxKeywords} key topics or keywords from this conversation. Return them as a comma-separated list:`
    );

    const keywordsText = await this.llmManager.completeWithModel(modelId, prompt, {
      maxTokens: 100,
      temperature: this.getTaskTemperature(task)
    });

    const keywords = keywordsText.split(',').map(k => k.trim());

    return {
      taskType: task.type,
      success: true,
      result: { keywords, shouldStore: task.config?.shouldStore },
      timestamp: new Date()
    };
  }

  private async generateTitle(
    topicId: string,
    modelId: string,
    task: AITaskConfig
  ): Promise<AITaskResult> {
    const messages = await this.getMessages(topicId, 10); // Use first 10 messages

    const prompt = this.buildPromptFromMessages(
      messages,
      'Generate a short, descriptive title (max 6 words) for this conversation:'
    );

    const title = await this.llmManager.completeWithModel(modelId, prompt, {
      maxTokens: 20,
      temperature: this.getTaskTemperature(task)
    });

    return {
      taskType: task.type,
      success: true,
      result: { title: title.trim(), shouldStore: task.config?.shouldStore },
      timestamp: new Date()
    };
  }

  private async executeCustomTask(
    topicId: string,
    modelId: string,
    task: AITaskConfig
  ): Promise<AITaskResult> {
    if (!task.config?.customPrompt) {
      throw new Error('Custom task requires customPrompt in config');
    }

    const messages = await this.getMessages(topicId);
    const prompt = this.buildPromptFromMessages(messages, task.config.customPrompt);

    // Get model-specific max tokens
    let maxTokens = 512; // fallback
    try {
      const model = await this.llmManager.getModelByIdHash(modelId);
      if (model && model.maxTokens) {
        maxTokens = Math.min(model.maxTokens, 1024); // Cap at 1024 for response generation
      }
    } catch (error) {
      console.warn(`[AITaskExecutor] Error getting model max tokens:`, error);
    }

    const response = await this.llmManager.completeWithModel(modelId, prompt, {
      maxTokens,
      temperature: this.getTaskTemperature(task)
    });

    return {
      taskType: task.type,
      success: true,
      result: { response, shouldRespond: task.config?.shouldRespond },
      timestamp: new Date()
    };
  }
  
  private async identifySubjects(
    topicId: string,
    modelId: string,
    task: AITaskConfig
  ): Promise<AITaskResult> {
    const messages = await this.getMessages(topicId);
    const minMessages = task.config?.minMessages || 3;
    
    if (messages.length < minMessages) {
      return {
        taskType: task.type,
        success: false,
        error: `Not enough messages (${messages.length} < ${minMessages})`,
        timestamp: new Date()
      };
    }
    
    const prompt = this.buildPromptFromMessages(
      messages,
      'Identify distinct subjects or topics discussed in this conversation. For each subject, provide:\n1. Keywords (2-4 words that identify the subject)\n2. A brief summary (1-2 sentences)\n\nFormat your response as JSON array:\n[{"keywords": ["word1", "word2"], "summary": "Brief summary"}]'
    );
    
    // Get model-specific max tokens
    let maxTokens = 512; // fallback
    try {
      const model = await this.llmManager.getModelByIdHash(modelId);
      if (model && model.maxTokens) {
        maxTokens = Math.min(model.maxTokens, 1024); // Cap at 1024 for response generation
      }
    } catch (error) {
      console.warn(`[AITaskExecutor] Error getting model max tokens:`, error);
    }

    const response = await this.llmManager.completeWithModel(modelId, prompt, {
      maxTokens,
      temperature: this.getTaskTemperature(task)
    });
    
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\[.*\]/s);
      if (!jsonMatch) {
        throw new Error('No JSON array found in response');
      }
      
      const subjects = JSON.parse(jsonMatch[0]);
      
      // Create AISubject objects if taskManager is available
      if (this.taskManager && task.config?.shouldStore) {
        for (const subj of subjects) {
          if (subj.keywords && subj.summary) {
            const newSubject = await this.taskManager.createSubject(
              subj.keywords,
              subj.summary
            );
            
            // Add topic reference to the newly created subject
            const messageHashes = messages.map(m => m.hash).filter(h => h);
            if (messageHashes.length > 0) {
              await this.taskManager.addTopicReferenceToSubject(
                newSubject,
                topicId,
                messageHashes
              );
            }
          }
        }
      }
      
      return {
        taskType: task.type,
        success: true,
        result: { subjects, shouldStore: task.config?.shouldStore },
        timestamp: new Date()
      };
    } catch (error) {
      console.error('[AITaskExecutor] Error parsing subjects:', error);
      return {
        taskType: task.type,
        success: false,
        error: 'Failed to parse subjects from response',
        timestamp: new Date()
      };
    }
  }
  
  private async summarizeBySubject(
    topicId: string,
    modelId: string,
    task: AITaskConfig
  ): Promise<AITaskResult> {
    // First, get existing subjects for this topic
    let subjects = [];
    
    if (this.taskManager) {
      subjects = await this.taskManager.getSubjectsForTopic(topicId);
    }
    
    // If no subjects exist and requireSubjectIdentification is true, run IDENTIFY_SUBJECTS first
    if (subjects.length === 0 && task.config?.requireSubjectIdentification) {
      const identifyResult = await this.identifySubjects(topicId, modelId, {
        type: AITaskType.IDENTIFY_SUBJECTS,
        enabled: true,
        priority: 0,
        config: { shouldStore: true, minMessages: 3 }
      });
      
      if (identifyResult.success && identifyResult.result?.subjects) {
        // Subjects were created, fetch them again
        if (this.taskManager) {
          subjects = await this.taskManager.getSubjectsForTopic(topicId);
        }
      }
    }
    
    if (subjects.length === 0) {
      return {
        taskType: task.type,
        success: false,
        error: 'No subjects identified for this topic',
        timestamp: new Date()
      };
    }
    
    const messages = await this.getMessages(topicId);
    const formatStyle = task.config?.formatStyle || 'sections';
    
    const subjectList = subjects.map(s => s.name.join(', ')).join('; ');
    const prompt = this.buildPromptFromMessages(
      messages,
      `Summarize this conversation organized by these subjects: ${subjectList}\n\nFormat the summary using ${formatStyle} style. For each subject, provide a comprehensive summary of what was discussed.`
    );
    
    const summary = await this.llmManager.completeWithModel(modelId, prompt, {
      maxTokens: 1024,
      temperature: this.getTaskTemperature(task)
    });
    
    return {
      taskType: task.type,
      success: true,
      result: {
        summary,
        subjects: subjects.map(s => ({ keywords: s.name, summary: s.summary })),
        formatStyle,
        shouldRespond: task.config?.shouldRespond,
        shouldStore: task.config?.shouldStore
      },
      timestamp: new Date()
    };
  }
  
  private async summarizeLastN(
    topicId: string,
    modelId: string,
    task: AITaskConfig
  ): Promise<AITaskResult> {
    const n = task.config?.messageCount || 10;
    const messages = await this.getMessages(topicId, n);
    
    const prompt = this.buildPromptFromMessages(
      messages,
      `Summarize the last ${n} messages of this conversation in 2-3 concise paragraphs:`
    );
    
    const summary = await this.llmManager.completeWithModel(modelId, prompt, {
      maxTokens: 300,
      temperature: this.getTaskTemperature(task)
    });
    
    return {
      taskType: task.type,
      success: true,
      result: {
        summary,
        messageCount: messages.length,
        shouldRespond: task.config?.shouldRespond,
        shouldStore: task.config?.shouldStore
      },
      timestamp: new Date()
    };
  }
  
  private async detectIntent(
    topicId: string,
    modelId: string,
    task: AITaskConfig
  ): Promise<AITaskResult> {
    const messages = await this.getMessages(topicId, 5); // Last 5 messages for intent
    
    const prompt = this.buildPromptFromMessages(
      messages,
      'Analyze the user\'s intent in this conversation. What is the user trying to achieve? Provide a brief analysis (1-2 sentences):'
    );
    
    const intent = await this.llmManager.completeWithModel(modelId, prompt, {
      maxTokens: 100,
      temperature: this.getTaskTemperature(task)
    });
    
    return {
      taskType: task.type,
      success: true,
      result: { intent, shouldStore: task.config?.shouldStore },
      timestamp: new Date()
    };
  }
  
  private async analyzeSentiment(
    topicId: string,
    modelId: string,
    task: AITaskConfig
  ): Promise<AITaskResult> {
    const messages = await this.getMessages(topicId, 10);
    
    const prompt = this.buildPromptFromMessages(
      messages,
      'Analyze the emotional sentiment of this conversation. Describe the overall mood and any sentiment changes. Provide categories: positive, negative, neutral, mixed:'
    );
    
    const sentiment = await this.llmManager.completeWithModel(modelId, prompt, {
      maxTokens: 150,
      temperature: this.getTaskTemperature(task)
    });
    
    return {
      taskType: task.type,
      success: true,
      result: { sentiment, shouldStore: task.config?.shouldStore },
      timestamp: new Date()
    };
  }
  
  private async suggestResponses(
    topicId: string,
    modelId: string,
    task: AITaskConfig
  ): Promise<AITaskResult> {
    const messages = await this.getMessages(topicId, 5);
    const maxSuggestions = task.config?.maxSuggestions || 3;
    
    const prompt = this.buildPromptFromMessages(
      messages,
      `Suggest ${maxSuggestions} possible user responses to continue this conversation. Keep each suggestion brief (1 sentence). Format as numbered list:`
    );
    
    const suggestionsText = await this.llmManager.completeWithModel(modelId, prompt, {
      maxTokens: 200,
      temperature: this.getTaskTemperature(task)
    });
    
    // Parse suggestions from numbered list
    const suggestions = suggestionsText
      .split('\n')
      .filter(line => line.match(/^\d+\./)) // Lines starting with number
      .map(line => line.replace(/^\d+\.\s*/, '').trim())
      .slice(0, maxSuggestions);
    
    return {
      taskType: task.type,
      success: true,
      result: { suggestions, shouldStore: false }, // Usually not stored
      timestamp: new Date()
    };
  }
}