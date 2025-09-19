import { SHA256IdHash, ensureIdHash } from '@refinio/one.core/lib/util/type-checks';
import { calculateHashOfObj } from '@refinio/one.core/lib/util/object';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import type { Profile } from '@refinio/one.models/lib/recipes/Leute/Profile.js';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type { LLM } from '../../../types/llm';
import type { LLMManager } from '../LLMManager';
import { LLMSettingsManager, DEFAULT_LLM_SETTINGS } from '../LLMSettingsManager';
import type { AITopicManager } from './aiTopicManager';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import type { AIPromptBuilder } from './aiPromptBuilder';
import { AITaskExecutor } from './aiTaskExecutor';
import { AITaskType, type AITaskConfig, DEFAULT_TASK_CONFIGS } from './aiTaskTypes';
import { AITaskManager } from './aiTaskManager';

/**
 * Message processor for AI assistant
 * Handles queuing and processing of messages
 */
export class AIMessageProcessor {
  private channelManager: InstanceType<typeof ChannelManager>;
  private llmManager: LLMManager;
  private leuteModel: InstanceType<typeof LeuteModel>;
  private personId: SHA256IdHash<Person>;
  private topicManager: AITopicManager;
  private promptBuilder: AIPromptBuilder;
  private taskExecutor: AITaskExecutor;
  private taskManager?: AITaskManager;
  
  // Queue management
  private messageQueues = new Map<string, { isProcessing: boolean, queue: any[] }>();
  private MAX_QUEUE_SIZE_PER_TOPIC = 10;
  private processingMessageIds: Set<string> = new Set();
  private activeTopicProcessing = new Set<string>();
  private processingMap = new Map<string, boolean>();
  private currentlyGeneratingTopicId: string | null = null;
  // Remember the last message that was fully processed per topic so we can
  // drop duplicate enqueue attempts that arise from repeated onUpdated
  // notifications while the same message is still syncing through CHUM.
  private lastProcessedMessageId: Map<string, string> = new Map();
  
  // System topics
  private systemTopicMessages: Map<string, Array<{text: string, sender: string, timestamp: number}>> = new Map();
  
  // Models info
  private availableLLMModels: Array<{
    id: string;
    name: string;
    displayName?: string;
    personId: SHA256IdHash<Person>
  }> = [];
  
  // AI contact cache
  private _aiContacts: Set<string> = new Set();
  
  // Progress callback
  public onGenerationProgress?: (topicId: string, progress: number) => void;

  constructor(
    channelManager: InstanceType<typeof ChannelManager>,
    llmManager: LLMManager,
    leuteModel: InstanceType<typeof LeuteModel>,
    personId: SHA256IdHash<Person>,
    topicManager: AITopicManager,
    promptBuilder: AIPromptBuilder,
    availableLLMModels: Array<{
      id: string;
      name: string;
      displayName?: string;
      personId: SHA256IdHash<Person>
    }> = []
  ) {
    this.channelManager = channelManager;
    this.llmManager = llmManager;
    this.leuteModel = leuteModel;
    this.personId = personId;
    this.topicManager = topicManager;
    this.promptBuilder = promptBuilder;
    this.availableLLMModels = availableLLMModels;
    
    // Create the task executor with reference to this message processor
    this.taskExecutor = new AITaskExecutor(
      channelManager,
      llmManager,
      topicManager,
      leuteModel,
      this
    );
  }

  /**
   * Handles an incoming message from a topic
   * @param topicId The ID of the topic where the message was received
   * @param message The message content (can be a string or an object)
   */
  public async handleTopicMessage(topicId: string, message: any): Promise<void> {
    // Log for debugging
    console.log(`[AIMessageProcessor] Received notification for topic ${topicId}`);
    console.log(`[AIMessageProcessor] Message parameter:`, JSON.stringify(message, null, 2).substring(0, 500));
    
    // Check if any model is currently generating globally
    if (this.llmManager.isAnyModelGenerating()) {
      // If it's the same topic that's generating, we can add to queue
      if (this.currentlyGeneratingTopicId === topicId) {
        console.log(`[AIMessageProcessor] Same topic ${topicId} is generating, will add to queue`);
        // Continue to normal processing which will add to queue
      } else {
        console.log(`[AIMessageProcessor] Different topic ${this.currentlyGeneratingTopicId} is generating, deferring message for topic ${topicId}`);
        // Defer the message handling for different topics
        setTimeout(() => {
          this.handleTopicMessage(topicId, message).catch(err => 
            console.error(`[AIMessageProcessor] Error in deferred message handling:`, err)
          );
        }, 1000);
        return;
      }
    }
    
    // Log current processing state
    const queueInfo = this.messageQueues.get(topicId);
    console.log(`[AIMessageProcessor] Current queue state for ${topicId}:`, {
      exists: !!queueInfo,
      isProcessing: queueInfo?.isProcessing || false,
      queueSize: queueInfo?.queue.length || 0
    });
    
    // Check if this is a channel update notification
    if (message && message.isChannelUpdate) {
      console.log(`[AIMessageProcessor] Channel update notification received for topic ${topicId}`);
      
      // Add a small delay to ensure messages are fully stored
      console.log(`[AIMessageProcessor] Waiting 300ms for messages to be fully stored...`);
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Check if we need to respond
      const needsResponse = await this.topicManager.needsResponse(topicId);
      if (!needsResponse) {
        console.log(`[AIMessageProcessor] No response needed for topic ${topicId}`);
        return;
      }
      
      // Get the latest user message to respond to
      try {
        console.log(`[AIMessageProcessor] Response needed, getting latest user message`);
        const latestMessage = await this.topicManager.getLatestUserMessage(topicId);
        if (!latestMessage) {
          console.log(`[AIMessageProcessor] Could not get latest user message`);
          return;
        }
        
        console.log(`[AIMessageProcessor] Processing user message: "${latestMessage.text?.substring(0, 50)}..."`);
        await this.processUserMessage(topicId, latestMessage);
        return;
      } catch (error) {
        console.error(`[AIMessageProcessor] Error processing message:`, error);
        return;
      }
    }
    
    console.log(`[AIMessageProcessor] Message type: ${typeof message}`);
    console.log(`[AIMessageProcessor] Message structure:`, JSON.stringify(message, (key, value) => {
      // Truncate long strings and hide circular references
      if (typeof value === 'string' && value.length > 100) {
        return value.substring(0, 100) + '...';
      }
      return value;
    }, 2).substring(0, 500));
    
    // Extract message text and sender info
    let messageText = '';
    let messageSender = 'unknown';
    let messageId = '';
    
    if (typeof message === 'string') {
      messageText = message;
      // Generate a deterministic ID for string messages
      messageId = calculateHashOfObj({ text: message, timestamp: Date.now() }).toString();
    } else if (typeof message === 'object') {
      // Log the full object structure to help debug format issues
      console.log(`[AIMessageProcessor] Message object keys:`, message ? Object.keys(message) : 'null');
      
      if (message?.messageRef) {
        console.log(`[AIMessageProcessor] MessageRef keys:`, message.messageRef ? Object.keys(message.messageRef) : 'null');
      }
      
      // Extract message text
      if (message?.messageRef?.text) {
        messageText = message.messageRef.text;
        if (message.messageRef.sender) {
          messageSender = message.messageRef.sender;
        }
        // Use the message hash if available
        messageId = message.hash ? message.hash.toString() : '';
      } else if (message?.text) {
        messageText = message.text;
        if (message.sender) {
          messageSender = message.sender;
        }
        // Use the message hash if available
        messageId = message.hash ? message.hash.toString() : '';
      } else {
        // If we can't find text in the expected places, try to extract it from anywhere in the object
        const extractText = (obj: any, depth = 0): string | null => {
          if (depth > 3) return null; // Prevent infinite recursion
          if (!obj || typeof obj !== 'object') return null;
          
          if (obj.text && typeof obj.text === 'string') {
            return obj.text;
          }
          
          for (const key in obj) {
            if (key === 'text' && typeof obj[key] === 'string') {
              return obj[key];
            } else if (typeof obj[key] === 'object') {
              const foundText = extractText(obj[key], depth + 1);
              if (foundText) return foundText;
            }
          }
          
          return null;
        };
        
        const extractedText = extractText(message);
        if (extractedText) {
          console.log(`[AIMessageProcessor] Found text in unexpected location:`, extractedText.substring(0, 50) + (extractedText.length > 50 ? '...' : ''));
          messageText = extractedText;
        } else {
          console.error(`[AIMessageProcessor] Could not extract text from message:`, message);
        }
      }
      
      // If we still don't have a messageId, generate one
      if (!messageId) {
        messageId = calculateHashOfObj(message).toString();
      }
    }

    // Enhanced logging of message details
    console.log(`[AIMessageProcessor] Message details - topicId: ${topicId}, text: "${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}", sender: ${messageSender}, messageId: ${messageId}`);
    
    // Skip processing messages from the AI itself
    // IMPORTANT: this.personId is the USER's ID, not the AI's ID
    // We should skip messages that are from AI contacts, not from the user
    if (messageSender === 'ai' || messageSender === 'assistant' || 
        this.isAIContact(messageSender)) {
      console.log('[AIMessageProcessor] Skipping message from AI to prevent loops');
      return;
    }
    
    // Don't skip messages from the user (this.personId)
    if (this.personId && messageSender === this.personId.toString()) {
      console.log('[AIMessageProcessor] Message is from user, processing it');
    }
      
    // Enqueue the message for processing
    await this.enqueueMessage(topicId, messageId, message, messageText);
  }

  /**
   * Process messages in the queue for a specific topic
   * @param topicId The topic ID to process messages for
   */
  private async processMessageQueue(topicId: string): Promise<void> {
    // Mark this topic as the one currently generating to suppress duplicate notifications
    this.currentlyGeneratingTopicId = topicId;
    const queueInfo = this.messageQueues.get(topicId)!;
    if (!queueInfo || queueInfo.queue.length === 0) {
      if (queueInfo) queueInfo.isProcessing = false;
      return;
    }
    
    // Mark as processing
    queueInfo.isProcessing = true;
    
    try {
      // Process each message in order
      while (queueInfo.queue.length > 0) {
        const { messageId, message, text } = queueInfo.queue[0];
        
        // Skip empty messages
        if (!text || text.trim() === '') {
          console.log(`[AIMessageProcessor] Skipping empty message`);
          queueInfo.queue.shift(); // Remove from queue
          continue;
        }
        
        // Set topic as loading
        this.topicManager.setTopicLoadingState(topicId, true);
        
        try {
          // Check if any model is currently generating to avoid context conflicts
          if (this.llmManager.isAnyModelGenerating()) {
            console.warn(`[AIMessageProcessor] Another model is currently generating, deferring message processing`);
            // Keep message in queue and stop processing for now
            queueInfo.isProcessing = false;
            // Try again in a bit
            setTimeout(() => {
              if (!queueInfo.isProcessing) {
                this.processMessageQueue(topicId);
              }
            }, 1000);
            return;
          }
          
          // Special handling for system topics
          if (this.isSystemTopic(topicId)) {
            console.log(`[AIMessageProcessor] Processing message in system topic ${topicId} (monitoring only)`);
            // Store the message for access by other LLMs
            this.storeSystemTopicMessage(topicId, text, message.sender || 'unknown');
            // Remove from queue now that we've processed it
            queueInfo.queue.shift();
            continue;
          }
          
          // Regular AI topic processing for non-system topics
          const modelId = this.topicManager.topicModelMap.get(topicId);
          if (!modelId) {
            console.warn(`[AIMessageProcessor] No model mapped for topic ${topicId}, skipping response generation`);
            // Remove from queue and continue
            queueInfo.queue.shift();
            continue;
          }
          
          // Get tasks for this topic - either dynamic or default
          const taskConfigs = await this.getTasksForTopic(topicId);
          
          console.log(`[AIMessageProcessor] Found ${taskConfigs.length} tasks for topic ${topicId}`);
          console.log(`[AIMessageProcessor] Task configs:`, JSON.stringify(taskConfigs, null, 2));
          
          // Execute tasks for this topic
          const taskResults = await this.taskExecutor.executeTasks(
            topicId,
            taskConfigs,
            modelId
          );
          
          console.log(`[AIMessageProcessor] Task results:`, JSON.stringify(taskResults, null, 2));
          
          // Process task results
          for (const result of taskResults) {
            console.log(`[AIMessageProcessor] Processing result - success: ${result.success}, shouldRespond: ${result.result?.shouldRespond}, has response: ${!!result.result?.response}`);
            if (result.success && result.result?.shouldRespond && result.result?.response) {
              // Send the response back to the topic
              console.log(`[AIMessageProcessor] Sending response to topic`);
              await this.sendResponseToTopic(topicId, result.result.response);
            }
          }
          
          // Mark this message as processed so we can de-duplicate future
          // notifications referring to the same ChatMessage.
          this.lastProcessedMessageId.set(topicId, messageId);

          // Remove the processed message from the queue
          queueInfo.queue.shift();
        } catch (error) {
          console.error(`[AIMessageProcessor] Error processing message for topic ${topicId}:`, error);
          // Remove the failing message from the queue to prevent getting stuck
          queueInfo.queue.shift();
        } finally {
          // Always clear loading state when done
          this.topicManager.setTopicLoadingState(topicId, false);
        }
      }
    } finally {
      // Mark as not processing when queue is empty
      queueInfo.isProcessing = false;
      // Clear generating flag when finished
      if (this.currentlyGeneratingTopicId === topicId) {
        this.currentlyGeneratingTopicId = null;
      }
      console.log(`[AIMessageProcessor] Queue processing completed for topic ${topicId}, queue size now: ${queueInfo.queue.length}`);
    }
  }

  /**
   * Generate a response using the specified model
   * @param modelId The ID of the model to use
   * @param text The user's message text
   * @param topicId The ID of the topic
   * @returns The generated response
   */
  private async generateResponse(modelId: string, text: string, topicId: string): Promise<string> {
    console.log(`[AIMessageProcessor] Generating response with model: ${modelId} for topic: ${topicId}`);
    console.log(`[AIMessageProcessor] Model ID format check - length: ${modelId.length}, looks like hash: ${modelId.length === 64}`);
    
    // Check for available MCP tools
    let availableTools: any[] = [];
    try {
      availableTools = await this.llmManager.getAvailableTools();
      if (availableTools.length > 0) {
        console.log(`[AIMessageProcessor] Found ${availableTools.length} MCP tools available`);
      }
    } catch (error) {
      console.warn('[AIMessageProcessor] Could not get MCP tools:', error);
    }
    
    // Build structured chat messages with tool information if available
    const chatPrompt = await this.promptBuilder.buildChatMessages(modelId, text, topicId, availableTools);
    
    try {
      // Load model - this will throw if loading fails
      console.log(`[AIMessageProcessor] Loading model ${modelId}`);
      const modelContext = await this.llmManager.loadModel(modelId);
      
      if (!modelContext) {
        throw new Error(`Failed to get context for model: ${modelId}`);
      }
      
      // Mark model as in use and track which topic is generating
      this.llmManager.setContextInUse(modelId, true);
      this.currentlyGeneratingTopicId = topicId;
      
      try {
        // Generate response with the model, using validated prompt
        console.log(`[AIMessageProcessor] Generating response with model ${modelId} for topic ${topicId}`);
        
        // Create timeout promise - 3 minutes to give models plenty of time
        const timeoutPromise = new Promise<string>((_, reject) => {
          setTimeout(() => reject(new Error("Response generation timed out")), 180000);  // 3 minutes
        });
        
        // Store system prompt for future use if needed
        // Since LLMManager.completeWithModel doesn't directly accept systemPrompt,
        // we'll just log it for now - in a future update, we can modify LLMManager
        // to accept the system prompt directly
        if (chatPrompt.systemPrompt) {
          console.log(`[AIMessageProcessor] System prompt: ${chatPrompt.systemPrompt.substring(0, 50)}...`);
        }
        
        // Get model-specific settings and global defaults
        const model = await this.llmManager.getModelByIdHash(modelId);
        const settingsManager = LLMSettingsManager.getInstance();
        const globalSettings = await settingsManager.getGlobalSettings(this.personId);
        
        // Get model metadata for actual capabilities
        let modelMaxTokens = 512; // conservative fallback
        let modelContextLength = 2048; // fallback
        try {
          const modelMetadata = await this.llmManager.getModelByIdHash(modelId);
          if (modelMetadata) {
            modelMaxTokens = modelMetadata.maxTokens || modelMaxTokens;
            modelContextLength = modelMetadata.contextLength || modelContextLength;
            console.log(`[AIMessageProcessor] Model capabilities - maxTokens: ${modelMaxTokens}, contextLength: ${modelContextLength}`);
          }
        } catch (error) {
          console.warn(`[AIMessageProcessor] Could not get model metadata:`, error);
        }
        
        // Use model-specific maxTokens if available, otherwise use global settings
        // Cap response tokens to leave room for context
        const responseMaxTokens = Math.min(
          modelMaxTokens,
          globalSettings.maxTokens || modelMaxTokens,
          Math.floor(modelContextLength * 0.3) // Don't use more than 30% of context for response
        );
        const temperature = model?.temperature || globalSettings.temperature || DEFAULT_LLM_SETTINGS.temperature;
        
        console.log(`[AIMessageProcessor] Using maxTokens: ${responseMaxTokens}, temperature: ${temperature} for model ${modelId}`);
        
        // Determine appropriate max tokens based on query complexity
        const adjustedMaxTokens = this.calculateMaxTokensForQuery(text, responseMaxTokens);
        
        console.log(`[AIMessageProcessor] Adjusted max tokens from ${responseMaxTokens} to ${adjustedMaxTokens} based on query complexity`);
        
        const response = await Promise.race([
          this.llmManager.chatCompletionWithModel(modelId, chatPrompt.messages, {
            maxTokens: adjustedMaxTokens,
            temperature: temperature,
            topP: 0.85,
            stopTokens: [
              // Chat template markers
              "<|im_start|>",
              "<|im_end|>",
              "<|endoftext|>",
              // Role markers
              "User:",
              "Human:",
              "Assistant:",
              "System:",
              // Common end markers
              "\n\nUser:",
              "\n\nHuman:",
              "\nUser:",
              "\nHuman:",
              // Double newline followed by potential new conversation
              "\n\n<|im_start|>",
              // End of turn markers
              "<|eot_id|>",
              "[/INST]",
              "</s>",
              // Prevent looping
              "assistant\n",
              "\nassistant",
              "<|im_start|>assistant",
              "<|im_start|>user"
            ],
            onProgress: (progress) => {
              console.log(`[AIMessageProcessor] Generation progress for topic ${topicId}: ${progress}%`);
              this.onGenerationProgress?.(topicId, progress);
            }
          }),
          timeoutPromise
        ]);
        
        // Early detection of malformed responses
        if (this.isMalformedResponse(response)) {
          console.error(`[AIMessageProcessor] Detected severely malformed response, length: ${response.length}`);
          console.error(`[AIMessageProcessor] First 500 chars of malformed response: "${response.substring(0, 500)}"`);
          
          // Check if the model might be having issues
          const templateTokens = (response.match(/<\|im_start\|>|<\|im_end\|>/g) || []).length;
          console.error(`[AIMessageProcessor] Found ${templateTokens} template tokens in response`);
          
          // Return a user-friendly error message
          return "I apologize, but I'm having trouble generating a proper response right now. This might be due to the model configuration or context length. Please try asking a simpler question or restarting the conversation.";
        }
        
        // Clean up the response
        console.log(`[AIMessageProcessor] Raw LLM response: "${response}"`);
        let cleanedResponse = this.cleanAIResponse(response);
        console.log(`[AIMessageProcessor] Cleaned response: "${cleanedResponse}"`);
        
        return cleanedResponse;
      } catch (error) {
        // Handle different error cases
        console.error(`[AIMessageProcessor] Error during model completion:`, error);
        if (error instanceof Error) {
          if (error.message.includes("timed out")) {
            return "I'm sorry, but I couldn't generate a response in time. This might be due to the complexity of your request or limited device resources. Could you try asking a simpler question?";
          } else if (error.message.includes("out of memory") || error.message.includes("allocation failed")) {
            return "I apologize, but your device doesn't have enough memory to process this request. Try closing other apps or restarting the app.";
          } else if (error.message.includes("cancelled")) {
            return "The response generation was cancelled.";
          }
        }
        return "I apologize, but I encountered an error generating a response. Please try again with a different question.";
      } finally {
        // Always mark context as no longer in use and clear generation tracking
        this.llmManager.setContextInUse(modelId, false);
        this.currentlyGeneratingTopicId = null;
      }
    } catch (error) {
      console.error(`[AIMessageProcessor] Error generating response:`, error);
      if (error instanceof Error) {
        if (error.message.includes("model not found") || error.message.includes("Failed to get context")) {
          return "I apologize, but the AI model couldn't be loaded. This could be due to limited device resources or an installation issue.";
        }
      }
      return "I apologize, but I encountered an error. Please try again later.";
    }
  }

  /**
   * Calculate appropriate max tokens based on query complexity
   * @param query The user's query
   * @param defaultMaxTokens The default max tokens
   * @returns Adjusted max tokens
   */
  private calculateMaxTokensForQuery(query: string, defaultMaxTokens: number): number {
    const len = query.trim().length;

    if (len <= 12) {
      return Math.min(64, defaultMaxTokens);
    }
    if (len <= 25) {
      return Math.min(128, defaultMaxTokens);
    }
    if (len <= 100) {
      return Math.min(256, defaultMaxTokens);
    }
    // Anything beyond ~20 words gets a medium allowance
    if (len <= 300) {
      return Math.min(512, defaultMaxTokens);
    }
    return Math.min(800, defaultMaxTokens);
  }
  
  /**
   * Check if a response is severely malformed
   * @param response The raw response from the LLM
   * @returns true if the response is malformed beyond repair
   */
  private isMalformedResponse(response: string): boolean {
    if (!response || typeof response !== 'string') {
      return true;
    }
    
    // Count template tokens
    const startTokens = (response.match(/<\|im_start\|>/g) || []).length;
    const endTokens = (response.match(/<\|im_end\|>/g) || []).length;
    
    // If we have more than 10 template tokens, it's likely garbage
    if (startTokens > 10 || endTokens > 10) {
      return true;
    }
    
    // Check for repeated patterns that indicate a loop
    const repeatedAssistant = (response.match(/<\|im_start\|>assistant\s*<\|im_end\|>/g) || []).length;
    if (repeatedAssistant > 5) {
      return true;
    }
    
    // Check if the response is mostly template tokens
    const cleanedLength = response
      .replace(/<\|im_start\|>/g, '')
      .replace(/<\|im_end\|>/g, '')
      .replace(/assistant/g, '')
      .replace(/user/g, '')
      .replace(/system/g, '')
      .trim()
      .length;
    
    // If after removing template tokens we have less than 10% content, it's malformed
    if (response.length > 100 && cleanedLength < response.length * 0.1) {
      return true;
    }
    
    // Check for other known malformed patterns
    if (response.includes('<|im_start|>assistant') && response.split('<|im_start|>assistant').length > 20) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Clean an AI response
   * @param text The raw response text
   * @returns The cleaned response text
   */
  private cleanAIResponse(text: string): string {
    try {
      let cleanedText = text.trim();
      
      // DO NOT remove thinking tags - we need them for "Show thinking" feature
      // The UI will handle hiding them from display
      const hasThinkingContent = /<think>[\s\S]*?<\/think>/.test(cleanedText);
      if (hasThinkingContent) {
        console.log(`[AIMessageProcessor] Response contains thinking tags - preserving for UI feature`);
        
        // Special handling for responses with think tags that have template tokens at the end
        // Pattern: <think>...</think>\nActual response<|im_end|>
        // First try to remove any im_end token that appears right after the content
        cleanedText = cleanedText.replace(/(<\/think>\s*)([\s\S]*?)(<\|im_end\|>)$/g, '$1$2');
        // Also handle cases where im_end appears without spaces
        cleanedText = cleanedText.replace(/(<\/think>)([\s\S]*?)(<\|im_end\|>)$/g, '$1$2');
      }
      
      // Check for severely malformed responses (repeated template tokens)
      const templateTokenCount = (cleanedText.match(/<\|im_start\|>/g) || []).length;
      const endTokenCount = (cleanedText.match(/<\|im_end\|>/g) || []).length;
      
      if (templateTokenCount > 5 || endTokenCount > 5) {
        console.warn(`[AIMessageProcessor] Detected malformed response with ${templateTokenCount} start tokens and ${endTokenCount} end tokens`);
        
        // Try to extract any meaningful content before the template mess
        const beforeTemplateMatch = cleanedText.match(/^(.*?)(?=<\|im_end\|>[\s\S]*<\|im_start\|>)/);
        if (beforeTemplateMatch && beforeTemplateMatch[1].trim().length > 10) {
          cleanedText = beforeTemplateMatch[1].trim();
          console.log(`[AIMessageProcessor] Extracted content before template tokens: "${cleanedText.substring(0, 50)}..."`);
        } else {
          // Response is too corrupted to salvage
          console.error(`[AIMessageProcessor] Response too corrupted to clean, returning error message`);
          return "I apologize, but I encountered an error generating a proper response. Please try asking your question again.";
        }
      }
      
      // Remove all chat template tokens more aggressively
      // First remove complete template blocks
      cleanedText = cleanedText.replace(/<\|im_start\|>(?:user|assistant|system)[\s\S]*?<\|im_end\|>/g, '');
      
      // Then remove any remaining template tokens
      cleanedText = cleanedText.replace(/<\|im_start\|>/g, '');
      cleanedText = cleanedText.replace(/<\|im_end\|>/g, '');
      cleanedText = cleanedText.replace(/<\|endoftext\|>/g, '');
      
      // Also remove template tokens that might appear at the very end
      cleanedText = cleanedText.replace(/<\|im_end\|>$/g, '');
      cleanedText = cleanedText.replace(/<\|endoftext\|>$/g, '');
      
      // Remove any lines that are just "assistant" or other role indicators
      cleanedText = cleanedText.replace(/^(assistant|user|system)\s*$/gm, '');
      
      // Remove all variations of end_of_sentence markers (including those with spaces and underscores)
      cleanedText = cleanedText.replace(/<\s*\|\s*end_of_sentence\s*\|\s*>/g, '');
      cleanedText = cleanedText.replace(/\|\s*end_of_sentence\s*\|/g, '');
      cleanedText = cleanedText.replace(/<\s*end_of_sentence\s*>/g, '');
      cleanedText = cleanedText.replace(/<\s*\/?\s*end_of_sentence\s*>/g, '');
      
      // Remove end_of_sentence with underscores (as shown in screenshot)
      cleanedText = cleanedText.replace(/\|\s*end_?_?of_?_?sentence\s*\|/g, '');
      cleanedText = cleanedText.replace(/end_?_?of_?_?sentence/g, '');
      
      // Remove with full-width pipe characters (｜) as seen in the logs
      cleanedText = cleanedText.replace(/<\s*｜\s*end[_▁]*of[_▁]*sentence\s*｜\s*>/g, '');
      cleanedText = cleanedText.replace(/｜\s*end[_▁]*of[_▁]*sentence\s*｜/g, '');
      
      // Remove any "Assistant:" or "User:" prefixes
      cleanedText = cleanedText.replace(/^(Assistant|User):\s*/gm, '');
      
      // Remove any template artifacts
      cleanedText = cleanedText.replace(/Final Answer:[\s]*/g, '');
      cleanedText = cleanedText.replace(/Revised Response:[\s]*/g, '');
      
      // Remove other model-specific tokens
      cleanedText = cleanedText.replace(/\[\/INST\]/g, '');
      cleanedText = cleanedText.replace(/\[INST\]/g, '');
      
      // Clean up any multiple newlines
      cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n');
      
      // Trim again after all replacements
      cleanedText = cleanedText.trim();
      
      // Check if response is now empty or too short after cleaning
      if (cleanedText.length < 3) {
        console.error(`[AIMessageProcessor] Response became empty after cleaning`);
        return "I apologize, but I couldn't generate a proper response. Please try again.";
      }
      
      // Limit response length
      const MAX_LENGTH = 8000;  // Increased from 1500 to allow longer responses
      if (cleanedText.length > MAX_LENGTH) {
        return cleanedText.substring(0, MAX_LENGTH) + "...";
      }
      
      return cleanedText;
    } catch (error) {
      console.error('[AIMessageProcessor] Error cleaning AI response:', error);
      return text.trim(); // Return original text if cleaning fails
    }
  }

  /**
   * Validate a response before sending it
   * @param response The response text to validate
   * @returns Validation result with isValid flag and optional reason/fallback
   */
  private validateResponse(response: string): { 
    isValid: boolean; 
    reason?: string; 
    fallbackMessage?: string 
  } {
    // Check if response is empty or too short
    if (!response || response.trim().length < 2) {
      return {
        isValid: false,
        reason: "Response is empty or too short",
        fallbackMessage: "I apologize, but I couldn't generate a response. Please try again."
      };
    }
    
    // Extract the actual response content (excluding think tags)
    // The UI will handle displaying/hiding the think content
    let contentForValidation = response;
    const thinkMatch = response.match(/<think>[\s\S]*?<\/think>\s*([\s\S]*)/);
    if (thinkMatch && thinkMatch[1]) {
      // Use only the content after the think tag for validation
      contentForValidation = thinkMatch[1].trim();
    }
    
    // Check if response still contains template tokens after cleaning
    const hasTemplateTokens = /<\|im_start\|>|<\|im_end\|>|<\|endoftext\|>/.test(contentForValidation);
    if (hasTemplateTokens) {
      return {
        isValid: false,
        reason: "Response still contains template tokens after cleaning",
        fallbackMessage: "I apologize, but there was an issue with my response format. Please try asking your question again."
      };
    }
    
    // Check if there's no actual content after the think tag
    if (thinkMatch && (!thinkMatch[1] || thinkMatch[1].trim().length < 2)) {
      return {
        isValid: false,
        reason: "Response contains only thinking content with no actual response",
        fallbackMessage: "I apologize, but I didn't provide a response. Let me try again."
      };
    }
    
    // Check if response is just repeated characters or nonsense
    const uniqueChars = new Set(response.replace(/\s/g, ''));
    if (response.length > 50 && uniqueChars.size < 5) {
      return {
        isValid: false,
        reason: "Response appears to be repeated characters",
        fallbackMessage: "I apologize, but I encountered an error generating a response. Please try again."
      };
    }
    
    // Check if response contains only whitespace and newlines
    if (response.replace(/[\s\n]/g, '').length === 0) {
      return {
        isValid: false,
        reason: "Response contains only whitespace",
        fallbackMessage: "I apologize, but I couldn't generate a meaningful response. Please try rephrasing your question."
      };
    }
    
    // Check for excessive repetition of words
    const words = response.toLowerCase().split(/\s+/);
    if (words.length > 20) {
      const wordCounts = new Map<string, number>();
      for (const word of words) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
      
      // If any word appears more than 50% of the time, it's likely corrupted
      const maxCount = Math.max(...wordCounts.values());
      if (maxCount > words.length * 0.5) {
        return {
          isValid: false,
          reason: "Response contains excessive word repetition",
          fallbackMessage: "I apologize, but my response got corrupted. Please try asking your question again."
        };
      }
    }
    
    // Response passed all validation checks
    return { isValid: true };
  }
  
  /**
   * Sends a response to a topic
   * @param topicId ID of the topic to send the response to
   * @param text Text of the response
   */
  private async sendResponseToTopic(topicId: string, text: string): Promise<void> {
    try {
      console.log(`[AIMessageProcessor] Sending response to topic ${topicId}`);
      
      // Validate the response before sending
      const validationResult = this.validateResponse(text);
      if (!validationResult.isValid) {
        console.error(`[AIMessageProcessor] Response validation failed: ${validationResult.reason}`);
        console.error(`[AIMessageProcessor] Invalid response preview: "${text.substring(0, 200)}..."`);
        
        // Send an error message instead
        text = validationResult.fallbackMessage || "I apologize, but I couldn't generate a valid response. Please try asking your question differently.";
      }
      
      // Get the model ID for this topic
      const modelId = this.topicManager.topicModelMap.get(topicId);
      if (!modelId) {
        throw new Error(`[AIMessageProcessor] No model mapped for topic ${topicId}`);
      }
      
      console.log(`[AIMessageProcessor] Looking for model ${modelId} in availableLLMModels`);
      console.log(`[AIMessageProcessor] Available models:`, this.availableLLMModels.map(m => ({ name: m.name, id: m.id })));
      
      // Find the model's personId in availableLLMModels
      const modelInfo = this.availableLLMModels.find(m => m.id === modelId);
      if (!modelInfo || !modelInfo.personId) {
        throw new Error(`[AIMessageProcessor] Could not find personId for model ${modelId}`);
      }
      
      // Trim any excessive whitespace and limit length
      let cleanedText = text.trim();
      const MAX_RESPONSE_LENGTH = 10000;
      if (cleanedText.length > MAX_RESPONSE_LENGTH) {
        console.log(`[AIMessageProcessor] Truncating long response from ${cleanedText.length} to ${MAX_RESPONSE_LENGTH} chars`);
        cleanedText = cleanedText.substring(0, MAX_RESPONSE_LENGTH) + 
          "\n\n[Response truncated due to length]";
      }
      
      // Create AI message with certificate and thinking support
      const { createAIMessage } = require('../../../utils/messageUtils');
      const message = await createAIMessage(
        cleanedText, 
        modelInfo.personId,
        undefined, // previousMessageHash
        undefined, // channelIdHash
        topicId,   // topicIdHash
        modelInfo.id // modelId for thinking metadata
      );
      
      // Determine the correct channel owner to post to
      // IMPORTANT: In proper 1-to-1 chat, AI should post to its own channel
      // This follows the standard two-channel pattern where each participant owns their channel
      let channelOwner: SHA256IdHash<Person> | null | undefined = undefined;
      
      // Get the AI's person ID to explicitly set as channel owner
      if (modelInfo.personId) {
        channelOwner = modelInfo.personId;
        console.log(`[AIMessageProcessor] AI will post to its own channel with owner: ${channelOwner.toString().substring(0, 8)}...`);
      } else {
        // Fallback to undefined which should use the AI's default channel
        console.log(`[AIMessageProcessor] No personId found for model, using default channel behavior`);
      }

      // Before posting, ensure the AI's channel exists
      // In 1-to-1 chats, each participant needs their own channel
      try {
        const channelInfos = await this.channelManager.getMatchingChannelInfos({ 
          channelId: topicId 
        });
        
        // Check if AI's channel exists
        const aiChannelExists = channelInfos.some(info => 
          info.owner && info.owner.toString() === channelOwner?.toString()
        );
        
        if (!aiChannelExists && channelOwner) {
          console.log(`[AIMessageProcessor] AI's channel doesn't exist yet, creating it now`);
          
          // Create the AI's channel
          try {
            await this.channelManager.createChannel(topicId, channelOwner);
            console.log(`[AIMessageProcessor] Successfully created AI's channel for topic ${topicId}`);
          } catch (createError) {
            // Channel might already exist or creation might fail for other reasons
            console.warn(`[AIMessageProcessor] Error creating AI's channel:`, createError);
            // Continue anyway - postToChannel might still work
          }
        }
      } catch (error) {
        console.warn(`[AIMessageProcessor] Error checking for existing channels:`, error);
      }

      const result = await this.channelManager.postToChannel(
        topicId,
        message,
        channelOwner
      );
      
      console.log(`[AIMessageProcessor] Response posted successfully to topic ${topicId}`);
      return result;
    } catch (error) {
      console.error(`[AIMessageProcessor] Error sending response to topic ${topicId}:`, error);
      throw error;
    }
  }

  /**
   * Stores a message from a system topic for access by all LLMs
   * @param topicId The ID of the system topic (e.g., EveryoneTopic)
   * @param message The message text
   * @param sender The sender ID or identifier
   */
  public storeSystemTopicMessage(topicId: string, message: string, sender: string): void {
    if (!this.systemTopicMessages.has(topicId)) {
      this.systemTopicMessages.set(topicId, []);
    }
    
    const messages = this.systemTopicMessages.get(topicId)!;
    messages.push({
      text: message,
      sender,
      timestamp: Date.now()
    });
    
    // Limit to last 100 messages per topic to avoid memory issues
    if (messages.length > 100) {
      messages.shift(); // Remove oldest message
    }
    
    console.log(`[AIMessageProcessor] Stored message in system topic ${topicId}, total messages: ${messages.length}`);
  }
  
  /**
   * Gets recent messages from a system topic
   * @param topicId The topic ID to get messages for (e.g., EveryoneTopic)
   * @param limit Maximum number of messages to return (default 10)
   * @returns Array of message objects, newest first
   */
  public getSystemTopicMessages(topicId: string, limit: number = 10): Array<{text: string, sender: string, timestamp: number}> {
    const messages = this.systemTopicMessages.get(topicId) || [];
    // Return newest messages first, limited to requested count
    return [...messages].reverse().slice(0, limit);
  }
  
  /**
   * Checks if a topic ID is a system topic
   * @param topicId The topic ID to check
   * @returns true if this is a system topic
   */
  public isSystemTopic(topicId: string): boolean {
    return topicId === 'EveryoneTopic' || 
           topicId === 'GlueTopic' || 
           topicId === 'GlueOneTopic' ||
           topicId === 'AISubjectsChannel'; // IoM subject channel
  }

  /**
   * Checks if a profile ID or person ID belongs to an AI assistant
   * @param profileIdOrPersonId The profile ID or person ID to check
   * @returns True if the profile belongs to an AI assistant, false otherwise
   */
  public isAIContact(profileIdOrPersonId: string | SHA256IdHash<Person>): boolean {
    try {
      if (!profileIdOrPersonId) return false;
      
      const idString = profileIdOrPersonId.toString();
      
      // Check if this ID is in our known AI contacts cache
      if (this._aiContacts.has(idString)) {
        return true;
      }
      
      // Check if this ID matches any known AI model person IDs
      for (const model of this.availableLLMModels) {
        if (model.personId && model.personId.toString() === idString) {
          // Add to cache for future lookups
          this._aiContacts.add(idString);
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error(`[AIMessageProcessor] Error checking if profile ${profileIdOrPersonId} is AI:`, error);
      return false;
    }
  }

  /**
   * Checks if a message is from an AI by checking the sender and attachments
   * @param message The message to check
   * @returns True if the message is from an AI assistant, false otherwise
   */
  public isAIMessage(message: any): boolean {
    // First check if there's an AI certificate in the attachments
    if (message && message.attachments) {
      try {
        const { hasAICertificate } = require('../../../utils/messageUtils');
        if (hasAICertificate(message.attachments)) {
          return true;
        }
      } catch (error) {
        console.error('[AIMessageProcessor] Error checking for AI certificate:', error);
      }
    }
    
    // Then check if the sender is an AI contact
    if (message && message.sender) {
      return this.isAIContact(message.sender);
    }
    
    return false;
  }

  /**
   * Set the available LLM models for this message processor
   * @param models Array of available LLM models
   */
  public setAvailableLLMModels(models: Array<{
    id: string;
    name: string;
    displayName?: string;
    personId: SHA256IdHash<Person>
  }>): void {
    this.availableLLMModels = models;
  }
  
  /**
   * Set the task manager for dynamic task loading
   * @param taskManager The AITaskManager instance
   */
  public setTaskManager(taskManager: AITaskManager): void {
    this.taskManager = taskManager;
    // Also pass it to the task executor for subject creation
    this.taskExecutor.setTaskManager(taskManager);
  }

  /**
   * Add a message to the processing queue for a topic
   * @param topicId The topic ID
   * @param messageId The unique message ID
   * @param message The full message object
   * @param text The extracted message text
   */
  private async enqueueMessage(topicId: string, messageId: string, message: any, text: string): Promise<void> {
    // Initialize the queue for this topic if it doesn't exist
    if (!this.messageQueues.has(topicId)) {
      this.messageQueues.set(topicId, {
        isProcessing: false,
        queue: []
      });
    }
      
    // Get the queue info
    const currentQueueInfo = this.messageQueues.get(topicId)!;
      
    // Check if queue is full - maintain reasonable queue size
    if (currentQueueInfo.queue.length >= this.MAX_QUEUE_SIZE_PER_TOPIC) {
      console.log(`[AIMessageProcessor] Queue for topic ${topicId} is full (${currentQueueInfo.queue.length}), dropping oldest message`);
      currentQueueInfo.queue.shift(); // Remove oldest message
    }
      
    // Prevent duplicates: skip if this message was already processed or is
    // already queued.
    if (this.lastProcessedMessageId.get(topicId) === messageId) {
      console.log(`[AIMessageProcessor] Duplicate message ${messageId} for topic ${topicId} ignored (already processed)`);
      return;
    }

    if (currentQueueInfo.queue.some(item => item.messageId === messageId)) {
      console.log(`[AIMessageProcessor] Duplicate message ${messageId} for topic ${topicId} ignored (already in queue)`);
      return;
    }

    // Add this message to the queue
    currentQueueInfo.queue.push({ messageId, message, text });
    console.log(`[AIMessageProcessor] Added message to queue for topic ${topicId}, queue size: ${currentQueueInfo.queue.length}`);
      
    // Process the queue if not already processing - let errors propagate
    if (!currentQueueInfo.isProcessing) {
      console.log(`[AIMessageProcessor] Starting queue processing for topic ${topicId}`);
      await this.processMessageQueue(topicId);
    } else {
      console.log(`[AIMessageProcessor] Queue already processing for topic ${topicId}, message will be processed when current processing completes`);
    }
  }

  /**
   * Process a user message directly
   * @param topicId The topic ID
   * @param message The message object containing the user's text
   */
  private async processUserMessage(topicId: string, message: any): Promise<void> {
    console.log(`[AIMessageProcessor] Processing user message for topic ${topicId}`);
    console.log(`[AIMessageProcessor] Message object keys:`, Object.keys(message || {}));
    
    // Extract text from the message
    const messageText = message?.text || message?.messageRef?.text || '';
    
    if (!messageText || messageText.trim() === '') {
      console.log(`[AIMessageProcessor] No text found in user message`);
      console.log(`[AIMessageProcessor] Message content:`, JSON.stringify(message, null, 2).substring(0, 200));
      return;
    }
    
    console.log(`[AIMessageProcessor] User message text: "${messageText.substring(0, 50)}..."`);
    console.log(`[AIMessageProcessor] Sender: ${message.sender || 'unknown'}`);
    
    // Add to queue for processing
    console.log(`[AIMessageProcessor] Adding message to queue for AI processing`);
    
    // Extract message hash
    const messageHash = message.hash || calculateHashOfObj(message);
    
    // Enqueue the message directly to avoid recursive call
    await this.enqueueMessage(topicId, messageHash, message, messageText);
    
    console.log(`[AIMessageProcessor] Message added to queue successfully`);
  }
  
  /**
   * Get tasks for a topic - either dynamically associated or default
   * @param topicId The topic ID
   * @returns Array of task configurations
   */
  private async getTasksForTopic(topicId: string): Promise<AITaskConfig[]> {
    try {
      // First, check if there are custom task configs set on the topic
      const customConfigs = this.topicManager.getTopicTaskConfigs(topicId);
      if (customConfigs && customConfigs.length > 0) {
        console.log(`[AIMessageProcessor] Using ${customConfigs.length} custom task configs for topic ${topicId}`);
        return customConfigs;
      }
      
      // Query AITask objects from storage that are associated with this topic
      if (this.taskManager) {
        try {
          const aiTasks = await this.taskManager.getActiveTasksForTopic(topicId);
          if (aiTasks.length > 0) {
            const taskConfigs = this.taskManager.convertTasksToConfigs(aiTasks);
            console.log(`[AIMessageProcessor] Found ${taskConfigs.length} dynamically associated tasks for topic ${topicId}`);
            return taskConfigs;
          }
        } catch (error) {
          console.error(`[AIMessageProcessor] Error loading dynamic tasks:`, error);
        }
      }
      
      // Fall back to default mode-based configs
      const aiMode = this.topicManager.getTopicAIMode(topicId);
      const defaultConfigs = DEFAULT_TASK_CONFIGS[aiMode] || DEFAULT_TASK_CONFIGS.chat;
      
      console.log(`[AIMessageProcessor] Using default '${aiMode}' mode with ${defaultConfigs.length} tasks`);
      return defaultConfigs;
    } catch (error) {
      console.error(`[AIMessageProcessor] Error getting tasks for topic ${topicId}:`, error);
      // Fall back to chat mode on error
      return DEFAULT_TASK_CONFIGS.chat;
    }
  }
}