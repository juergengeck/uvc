import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type { LLMManager } from '../LLMManager';
import type { AITopicManager } from './aiTopicManager';
import type { AIMessageProcessor } from './aiMessageProcessor';

/**
 * Result of prompt building containing required inputs for LLM
 */
export interface PromptResult {
  systemPrompt: string;
  enhancedPrompt: string;
}

export interface ChatPromptResult {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  systemPrompt: string;
}

/**
 * AIPromptBuilder handles the construction of prompts for LLMs
 * It provides methods to build appropriate prompts based on conversation history and system settings
 */
export class AIPromptBuilder {
  private channelManager: ChannelManager;
  private llmManager: LLMManager;
  private leuteModel: LeuteModel;
  private topicManager: AITopicManager;
  private messageProcessor?: AIMessageProcessor; // Optional as it might create circular dependency

  constructor(
    channelManager: ChannelManager,
    llmManager: LLMManager,
    leuteModel: LeuteModel,
    topicManager: AITopicManager
  ) {
    this.channelManager = channelManager;
    this.llmManager = llmManager;
    this.leuteModel = leuteModel;
    this.topicManager = topicManager;
  }

  /**
   * Set the message processor reference
   * This is done after construction to avoid circular dependencies
   */
  public setMessageProcessor(messageProcessor: AIMessageProcessor): void {
    this.messageProcessor = messageProcessor;
  }

  /**
   * Build a prompt for the LLM based on the user's message and conversation history
   * @param modelId The ID of the model to use
   * @param text The user's message text
   * @param topicId The ID of the topic/conversation
   * @returns Object containing systemPrompt and enhancedPrompt
   */
  public async buildPrompt(modelId: string, text: string, topicId: string): Promise<PromptResult> {
    console.log(`[AIPromptBuilder] Building prompt for model ${modelId}, topic ${topicId}`);
    
    // Get the system prompt from global settings
    let systemPrompt = "";
    try {
      // Get creator ID for settings
      const creatorId = await this.leuteModel.myMainIdentity();
      if (creatorId) {
        // Import the settings manager
        const { llmSettingsManager } = await import('../LLMSettingsManager');
        
        // Get global settings
        const globalSettings = await llmSettingsManager.getGlobalSettings(creatorId);
        
        // Use the default prompt if available
        systemPrompt = globalSettings.defaultPrompt || "";
        console.log(`[AIPromptBuilder] Using system prompt from settings: ${systemPrompt.substring(0, 50)}...`);
      }
    } catch (error) {
      console.warn("[AIPromptBuilder] Could not load system prompt from settings:", error);
      // Use a fallback prompt if settings can't be loaded
      systemPrompt = "You are a helpful and friendly AI assistant. Provide thoughtful, concise responses.";
    }
    
    let enhancedPrompt = "";
    const promptPrefix = systemPrompt ? `${systemPrompt}\n\n` : "";
    
    // Try to get message history but don't fail if it's not available
    try {
      if (this.channelManager) {
        // Get channel info for the topic (like ChatModel does)
        const channelInfos = await this.channelManager.getMatchingChannelInfos({ 
          channelId: topicId 
        });
        
        if (channelInfos.length === 0) {
          console.log(`[AIPromptBuilder] No channel info found for topic ${topicId}`);
          // Fall back to basic prompt without context
          enhancedPrompt = `${promptPrefix}User: ${text}\nAssistant:`;
          return { enhancedPrompt, systemPrompt };
        }
        
        // Get messages using channel iterator (like ChatModel does)
        const allMessages: any[] = [];
        
        // Load messages from ALL channels to get complete conversation history
        console.log(`[AIPromptBuilder] Loading message history from ${channelInfos.length} channel(s)`);
        
        for (const channelInfo of channelInfos) {
          console.log(`[AIPromptBuilder] Loading from channel owned by: ${channelInfo.owner?.substring(0, 8) || 'null'}`);
          
          const iterator = (this.channelManager.constructor as any).singleChannelObjectIterator(channelInfo);
          for await (const entry of iterator) {
            if (entry && entry.dataHash) {
              try {
                const { getObject } = require('@refinio/one.core/lib/storage-unversioned-objects.js');
                const messageData = await getObject(entry.dataHash);
                if (messageData && (messageData.$type$ === 'ChatMessage' || messageData.text !== undefined)) {
                  allMessages.push(messageData);
                }
              } catch (err) {
                console.error('[AIPromptBuilder] Failed to load message from entry', err);
              }
            }
          }
        }
        
        console.log(`[AIPromptBuilder] Loaded ${allMessages.length} messages for context`);
        
        // Sort messages by creation time (oldest first for chronological order)
        allMessages.sort((a, b) => {
          const timeA = a.creationTime || 0;
          const timeB = b.creationTime || 0;
          return timeA - timeB; // Oldest first
        });
        
        // Get conversation history with token-aware truncation
        const messageObjects = allMessages.filter((obj: any) => obj?.text && obj.text.trim());
        
        // Get actual model context length
        let modelContextLength = 2048; // fallback
        try {
          const model = await this.llmManager.getModelByIdHash(modelId);
          if (model && model.contextLength) {
            modelContextLength = model.contextLength;
            console.log(`[AIPromptBuilder] Using model context length: ${modelContextLength}`);
          } else {
            console.log(`[AIPromptBuilder] Model context length not found, using fallback: ${modelContextLength}`);
          }
        } catch (error) {
          console.warn(`[AIPromptBuilder] Error getting model context length:`, error);
        }
        
        // Calculate available context tokens
        // Reserve tokens for system prompt and current message
        const systemPromptTokens = promptPrefix ? Math.ceil(promptPrefix.length * 0.25) : 0;
        const currentMessageTokens = Math.ceil(text.length * 0.25);
        const reservedTokens = systemPromptTokens + currentMessageTokens + 50; // +50 for Assistant: prompt
        const maxContextForHistory = Math.max(0, modelContextLength - reservedTokens);
        
        console.log(`[AIPromptBuilder] Context budget: total=${modelContextLength}, reserved=${reservedTokens}, available=${maxContextForHistory}`);
        
        // Build messages from newest to oldest until we hit token limit
        let contextTokens = 0;
        const recentMessages = [];
        
        // Start from the end and work backwards
        for (let i = messageObjects.length - 1; i >= 0; i--) {
          const msg = messageObjects[i];
          const msgText = (msg as any)?.text || "";
          const estimatedTokens = Math.ceil(msgText.length * 0.25); // ~4 chars per token
          
          // Check if adding this message would exceed our budget
          if (contextTokens + estimatedTokens > maxContextForHistory) {
            console.log(`[AIPromptBuilder] Stopping context inclusion at ${contextTokens} tokens to stay within budget`);
            break;
          }
          
          recentMessages.unshift(msg);
          contextTokens += estimatedTokens;
        }
        
        console.log(`[AIPromptBuilder] Including ${recentMessages.length} messages (~${Math.round(contextTokens)} tokens) in context`);
        
        // Build a clean conversation history without duplicating the current message
        if (recentMessages.length > 0) {
          // Create messages array with explicit string type
          const messagesArr: string[] = [];
          
          // Add previous messages from conversation history
          for (const msg of recentMessages) {
            // Use type-safe property access
            const sender = (msg as any)?.sender || "unknown";
            const messageText = (msg as any)?.text || "";
            if (!messageText) continue; // Skip empty messages
            
            // Skip system messages or known redundancy patterns
            if (messageText.startsWith('[SYSTEM]')) continue;
            
            // Check if this is an AI message
            const isAI = this.messageProcessor ? 
              this.messageProcessor.isAIContact(sender) : 
              messageText.includes("Assistant:"); // Fallback heuristic
            
            const role = isAI ? "Assistant" : "User";
            
            // Skip corrupted AI messages that contain the system prompt
            if (isAI) {
              // More comprehensive check for corrupted messages
              const lowerText = messageText.toLowerCase();
              const corruptionPatterns = [
                // System prompt fragments
                "you are a helpful",
                "friendly ai assistant",
                "provide thoughtful",
                "concise responses",
                "accurate responses",
                "acknowledge when you don't know",
                // Model tokens
                "<|im_end|>",
                "<|im_start|>",
                "<|system|>",
                "<|user|>",
                "<|assistant|>",
                // Echo patterns
                "tell me a joke<|im_end|>",
                // Incomplete patterns (when message is cut off)
                "you p...",
                "you pr...",
                "you pro..."
              ];
              
              const isCorrupted = corruptionPatterns.some(pattern => 
                lowerText.includes(pattern.toLowerCase())
              );
              
              // Also check if the message appears to be the raw system prompt
              const isRawSystemPrompt = messageText.trim() === systemPrompt || 
                                       messageText.startsWith(systemPrompt.substring(0, 50));
              
              if (isCorrupted || isRawSystemPrompt) {
                console.warn(`[AIPromptBuilder] Skipping corrupted AI message: ${messageText.substring(0, 50)}...`);
                continue;
              }
            }
            
            // Include all historical messages in conversation context
            // Truncate very long messages but preserve context
            const truncatedText = messageText.length > 400 ? 
              messageText.substring(0, 400) + "..." : messageText;
            messagesArr.push(`${role}: ${truncatedText}`);
          }
          
          // Add the current user message only if it's not already included
          const currentMessageExists = messagesArr.some(msg => 
            msg.includes(`User: ${text}`) || msg.includes(text.substring(0, 50))
          );
          
          if (!currentMessageExists) {
            messagesArr.push(`User: ${text}`);
          }
          
          // Add the Assistant: prompt at the end
          messagesArr.push("Assistant:");
          
          // Build the prompt with clean formatting
          enhancedPrompt = messagesArr.join("\n\n");
        } else {
          // No message history but we have a channel - use a direct prompt
          enhancedPrompt = `${promptPrefix}User: ${text}\nAssistant:`;
        }
      } else {
        throw new Error("[AIPromptBuilder] Channel manager not available");
      }
    } catch (error) {
      console.error(`[AIPromptBuilder] Error getting message history: ${error}`);
      // Create a basic prompt if we couldn't get history
      enhancedPrompt = `${promptPrefix}User: ${text}\nAssistant:`;
    }

    // If we still don't have a prompt, something went wrong
    if (!enhancedPrompt) {
      console.warn("[AIPromptBuilder] Failed to create a valid prompt, using fallback");
      enhancedPrompt = `${promptPrefix}User: ${text}\nAssistant:`;
    }
    
    // Add the system prompt as a prefix - don't truncate to avoid breaking tags
    if (promptPrefix) {
      // If system prompt is too long, skip it entirely to avoid malformed content
      if (promptPrefix.length > 1000) {
        console.warn(`[AIPromptBuilder] System prompt too long (${promptPrefix.length} chars), skipping to avoid malformed content`);
      } else {
        enhancedPrompt = promptPrefix + enhancedPrompt;
      }
    }
    
    console.log(`[AIPromptBuilder] Prompt built successfully, length=${enhancedPrompt.length}`);
    console.log(`[AIPromptBuilder] Final prompt preview: "${enhancedPrompt.substring(0, 200)}..."`);
    
    // Log the complete prompt for debugging
    if (enhancedPrompt.length < 500) {
      console.log(`[AIPromptBuilder] Complete prompt:\n${enhancedPrompt}`);
    } else {
      console.log(`[AIPromptBuilder] Full prompt (first 500 chars):\n${enhancedPrompt.substring(0, 500)}...`);
    }
    
    return {
      systemPrompt,
      enhancedPrompt
    };
  }

  /**
   * Build a prompt in structured chat-message format suitable for
   * `llamaModel.chatCompletion()`.
   * This is a thin wrapper that re-uses the legacy `buildPrompt` logic and then
   * converts the resulting plain prompt into an array of role-tagged messages
   * so we can incrementally migrate without breaking old callers.
   */
  public async buildChatMessages(modelId: string, text: string, topicId: string, availableTools?: any[]): Promise<ChatPromptResult> {
    const legacy = await this.buildPrompt(modelId, text, topicId);
    
    // If MCP tools are available, add them to the system prompt
    let enhancedSystemPrompt = legacy.systemPrompt;
    if (availableTools && availableTools.length > 0) {
      const toolDescriptions = availableTools.map(tool => 
        `- ${tool.name}: ${tool.description}`
      ).join('\n');
      
      enhancedSystemPrompt += `\n\nYou have access to the following tools via MCP (Model Context Protocol):\n${toolDescriptions}\n\nTo use a tool, respond with: [USE_TOOL: tool_name] followed by the parameters in JSON format.`;
    }

    // Naïve splitter: we expect the legacy prompt to be built as alternating
    // "<Role>: <content>" lines separated by blank lines.  We parse that back
    // into an array.  If the pattern is not recognised we fall back to a two
    // message system+user conversation.

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

    if (enhancedSystemPrompt) {
      messages.push({ role: 'system', content: enhancedSystemPrompt });
    }

    // Strip the system prompt prefix from enhancedPrompt if it exists
    let promptToParse = legacy.enhancedPrompt;
    if (legacy.systemPrompt && promptToParse.startsWith(legacy.systemPrompt)) {
      // Remove the system prompt prefix to avoid duplicating it
      promptToParse = promptToParse.substring(legacy.systemPrompt.length).trim();
    }

    const parts = promptToParse.split(/\n\n+/g);
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('User:')) {
        messages.push({ role: 'user', content: trimmed.replace(/^User:\s*/, '') });
      } else if (trimmed.startsWith('Assistant:')) {
        const assistantContent = trimmed.replace(/^Assistant:\s*/, '');
        // Only add non-empty assistant messages
        if (assistantContent) {
          messages.push({ role: 'assistant', content: assistantContent });
        }
      }
    }

    // Deduplicate consecutive identical assistant messages (often repeated
    // apology lines when previous responses were rejected). This reduces
    // prompt size without losing information.
    const deduped: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
    for (const msg of messages) {
      if (
        msg.role === 'assistant' &&
        deduped.length &&
        deduped[deduped.length - 1].role === 'assistant' &&
        deduped[deduped.length - 1].content.trim() === msg.content.trim()
      ) {
        // Skip exact duplicate
        continue;
      }
      deduped.push(msg);
    }

    // Replace messages array with deduped version
    messages.length = 0;
    messages.push(...deduped);

    // Keep the prompt compact: limit to the last 12 messages in addition to the
    // (optional) system prompt.  We preserve the earliest assistant apology if
    // it is the only assistant entry so that the model sees some prior
    // context, then keep the most recent 11 messages to give recency while
    // avoiding quadratic growth that slows tokenisation.
    const SYSTEM_OFFSET = messages[0]?.role === 'system' ? 1 : 0;
    const MAX_CONTEXT_MESSAGES = 12 + SYSTEM_OFFSET;
    if (messages.length > MAX_CONTEXT_MESSAGES) {
      const retained = [
        ...messages.slice(0, SYSTEM_OFFSET), // keep system
        ...messages.slice(-MAX_CONTEXT_MESSAGES + SYSTEM_OFFSET)
      ];
      messages.length = 0;
      messages.push(...retained);
    }

    // Ensure the latest user message is present (edge-case where legacy path
    // failed to include it)
    if (!messages.find(m => m.role === 'user' && m.content === text)) {
      messages.push({ role: 'user', content: text });
    }

    // Log the final messages array for debugging
    console.log(`[AIPromptBuilder] Final chat messages array:`);
    messages.forEach((msg, index) => {
      const preview = msg.content.length > 200 ? msg.content.substring(0, 200) + '...' : msg.content;
      console.log(`[AIPromptBuilder] [${index}] ${msg.role}: ${preview}`);
    });

    return { messages, systemPrompt: enhancedSystemPrompt };
  }
} 