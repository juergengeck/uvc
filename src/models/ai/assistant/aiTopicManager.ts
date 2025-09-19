import { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import type TopicModel from '@refinio/one.models/lib/models/Chat/TopicModel.js';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type { LLMManager } from '../LLMManager';
import type { LLM } from '../../../types/llm';
import type { Topic } from '@refinio/one.models/lib/recipes/ChatRecipes.js';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import { TopicModelWithCreateGroupTopic } from './utils';
import { getObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import { AITaskType, type AITaskConfig } from './aiTaskTypes';

// Placeholder for LLMSettingsManager and other utils that might be needed
// import { llmSettingsManager } from './LLMSettingsManager';
// import { createSystemMessage, hasSystemCertificate, addSystemCertificate } from '../../../utils/messageUtils';

export class AITopicManager {
    private topicModel: TopicModelWithCreateGroupTopic;
    private llmManager: LLMManager;
    private channelManager: ChannelManager;
    private leuteModel: LeuteModel;
    private personId: SHA256IdHash<Person>;
    private aiaModel: any; // Reference to the main AIAssistantModel for now

    // Properties to be managed by this class
    public topicDisplayNames: Record<string, string> = {};
    public topicLoadingState = new Map<string, boolean>();
    public onTopicLoadingStateChanged: OEvent<(topicId: string, isLoading: boolean) => void>;
    private _loggedMissingTopics = new Set<string>();
    public topicModelMap = new Map<string, string>();
    private _loggedReadinessState = new Set<string>();
    private topicTaskConfigs = new Map<string, AITaskConfig[]>();
    private topicAIModes = new Map<string, string>();


    constructor(
        topicModel: TopicModelWithCreateGroupTopic,
        llmManager: LLMManager,
        channelManager: ChannelManager,
        leuteModel: LeuteModel,
        personId: SHA256IdHash<Person>,
        aiaModel: any
    ) {
        this.topicModel = topicModel;
        this.llmManager = llmManager;
        this.channelManager = channelManager;
        this.leuteModel = leuteModel;
        this.personId = personId;
        this.aiaModel = aiaModel;
        this.onTopicLoadingStateChanged = new OEvent();
    }

    /**
     * Set loading state for a topic and notify listeners
     * @param topicId The ID of the topic
     * @param isLoading Whether the topic is loading
     */
    public setTopicLoadingState(topicId: string, isLoading: boolean): void {
        const currentState = this.topicLoadingState.get(topicId);
        if (currentState === isLoading) return; // No change
        
        console.log(`[AITopicManager] Setting topic loading state for ${topicId}: ${isLoading}`);
        this.topicLoadingState.set(topicId, isLoading);
        this.onTopicLoadingStateChanged.emit(topicId, isLoading);
    }

    /**
     * Check if a topic is currently loading
     * @param topicId The topic ID to check
     * @returns True if the topic is loading, false otherwise
     */
    public isTopicLoading(topicId: string): boolean {
        return this.topicLoadingState.get(topicId) || false;
    }

    /**
     * Gets display name for a topic
     * @param topicId ID of the topic
     * @returns Display name or undefined if not found
     */
    public getTopicDisplayName(topicId: string): string | undefined {
        return this.topicDisplayNames[topicId];
    }
    
    /**
     * Sets display name for a topic
     * @param topicId ID of the topic
     * @param name Display name to set
     */
    public setTopicDisplayName(topicId: string, name: string): void {
        this.topicDisplayNames[topicId] = name;
    }

    /**
     * Gets all AI topic IDs
     * @returns Array of AI topic IDs
     */
    public getAllAITopicIds(): string[] {
        return Array.from(this.topicModelMap.keys());
    }

    /**
     * Generates a display name for a topic based on model name or ID
     * @param modelNameOrId Name or ID of the model
     * @returns Generated display name
     */
    public generateTopicDisplayName(modelNameOrId: string): string {
        // Remove "Chat with" prefix if present
        if (modelNameOrId.toLowerCase().startsWith('chat with ')) {
            return modelNameOrId.substring('chat with '.length);
        }
        
        // Make model names more readable
        // Convert names like "smollm3-q4_k_m" to "SmolLM3 Q4 K M"
        let displayName = modelNameOrId
            .replace(/[-_]/g, ' ') // Replace hyphens and underscores with spaces
            .replace(/\b(\w)/g, (char) => char.toUpperCase()) // Capitalize first letter of each word
            .replace(/Smollm/gi, 'SmolLM') // Fix specific model name casing
            .replace(/Q4 K M/g, 'Q4-K-M') // Keep quantization format readable
            .replace(/Q8 0/g, 'Q8-0')
            .replace(/Q4 0/g, 'Q4-0');
            
        console.log(`[AITopicManager] Generated display name: ${modelNameOrId} -> ${displayName}`);
        return displayName;
    }


    /**
     * Get the model ID for a given topic
     * @param topicId The topic ID
     * @returns The model ID if found, undefined otherwise
     */
    public getModelIdForTopic(topicId: string): string | undefined {
        return this.topicModelMap.get(topicId);
    }

    /**
     * Adds a topic to model mapping to the topicModelMap
     * @param topicId The topic ID
     * @param modelIdHash The model ID hash
     */
    public addTopicModelMapping(topicId: string, modelIdHash: string): void {
        // Ensure topicModelMap is initialized
        if (!this.topicModelMap) {
            console.warn(`[AITopicManager] topicModelMap not initialized, creating new Map`);
            this.topicModelMap = new Map<string, string>();
        }
        
        this.topicModelMap.set(topicId, modelIdHash);
        console.log(`[AITopicManager] ✅ Added mapping: topic ${topicId} -> model ${modelIdHash}`);
        console.log(`[AITopicManager] 📊 TopicModelMap now has ${this.topicModelMap.size} entries`);
    }

    /**
     * Ensures the topicModelMap is properly initialized
     * @returns True if initialized, false if there was an issue
     */
    public ensureTopicModelMapInitialized(): boolean {
        if (!this.topicModelMap) {
            console.warn(`[AITopicManager] topicModelMap was null/undefined, initializing new Map`);
            this.topicModelMap = new Map<string, string>();
        }
        return this.topicModelMap instanceof Map;
    }

    /**
     * Validates that the model map is properly initialized and contains the expected topic
     * @param topicId The topic ID to validate
     * @returns True if the topic is properly mapped, false otherwise
     */
    public validateTopicModelMapping(topicId: string): boolean {
        if (!this.ensureTopicModelMapInitialized()) {
            console.error(`[AITopicManager] Failed to initialize topicModelMap`);
            return false;
        }

        const modelId = this.topicModelMap.get(topicId);
        if (!modelId) {
            console.warn(`[AITopicManager] No model mapping found for topic ${topicId}`);
            console.log(`[AITopicManager] Available topics: ${Array.from(this.topicModelMap.keys()).join(', ')}`);
            return false;
        }

        console.log(`[AITopicManager] ✅ Topic ${topicId} properly mapped to model ${modelId}`);
        return true;
    }

    /**
     * Get the latest user message from a topic
     * @param topicId The topic ID to get the message from
     * @returns The latest message object or null if none found
     */
    public async getLatestUserMessage(topicId: string): Promise<any> {
        console.log(`[AITopicManager] Getting latest user message from topic ${topicId}`);
        
        try {
            // Get channel info for the topic
            console.log(`[AITopicManager] Getting channel infos for topic: ${topicId}`);
            const channelInfos = await this.channelManager.getMatchingChannelInfos({ 
                channelId: topicId 
            });
            
            console.log(`[AITopicManager] Found ${channelInfos.length} channel infos`);
            if (channelInfos.length === 0) {
                console.log(`[AITopicManager] No channel info found for topic ${topicId}`);
                return null;
            }
            
            // For getting the latest user message, we check ALL channels
            // but skip messages from AI senders
            // Check all channels for user messages
            
            let foundUserMessage = null;
            let latestMessageTime = 0;
            
            // Check each channel for the latest user message
            for (const channelInfo of channelInfos) {
                // Check this channel for messages
                
                // Get messages using channel iterator in DESCENDING order (newest first)
                const iterator = (this.channelManager.constructor as any).singleChannelObjectIterator(channelInfo);
                
                let count = 0;
                // Look for latest user message in this channel
                
                for await (const entry of iterator) {
                    if (entry && entry.dataHash) {
                        try {
                            const messageData = await getObject(entry.dataHash);
                            if (messageData && (messageData.$type$ === 'ChatMessage' || messageData.text !== undefined)) {
                                count++;
                                // Skip verbose per-message logging for performance
                                
                                // Skip messages from AI (they have AI certificates)
                                if (messageData.attachments) {
                                    try {
                                        const { hasAICertificate } = require('../../../utils/messageUtils');
                                        if (hasAICertificate(messageData.attachments)) {
                                            // Skip AI message
                                            continue;
                                        }
                                    } catch (error) {
                                        console.error('[AITopicManager] Error checking for AI certificate:', error);
                                    }
                                }
                                
                                // Check if this message has text content
                                if (!messageData.text) {
                                    // Skip message without text
                                    continue;
                                }
                                
                                // Check if this is actually from a user (not the AI's own person ID)
                                if (messageData.sender && this.aiaModel && this.aiaModel.isAIPersonId && this.aiaModel.isAIPersonId(messageData.sender)) {
                                    // Skip message from AI person
                                    continue;
                                }
                                
                                // Check if this message is newer than what we've found so far
                                const messageTime = entry.creationTime || 0;
                                if (messageTime > latestMessageTime) {
                                    console.log(`[AITopicManager] Found user message from ${messageData.sender}: ${messageData.text?.substring(0, 50)}...`);
                                    foundUserMessage = messageData;
                                    latestMessageTime = messageTime;
                                }
                                
                                // Since we're iterating newest first, we can break after finding the first user message
                                break;
                            }
                        } catch (err) {
                            console.error('[AITopicManager] Failed to load message from entry', err);
                        }
                    }
                }
                
                // Finished checking this channel
            }
            
            if (!foundUserMessage) {
                console.log(`[AITopicManager] No user message found across all channels`);
                return null;
            }
            
            console.log(`[AITopicManager] Returning latest user message: ${foundUserMessage.text?.substring(0, 50)}...`);
            return foundUserMessage;
        } catch (error) {
            console.error(`[AITopicManager] Error getting latest message from topic ${topicId}:`, error);
            return null;
        }
    }

    /**
     * Check if the latest message in a topic needs an AI response
     * @param topicId The topic ID
     * @returns True if a response is needed
     */
    public async needsResponse(topicId: string): Promise<boolean> {
        // Check if topic needs AI response
        
        try {
            // Get all messages from the topic to check the sequence
            const channelInfos = await this.channelManager.getMatchingChannelInfos({ 
                channelId: topicId 
            });
            
            if (channelInfos.length === 0) {
                console.log(`[AITopicManager] No channel info found`);
                return false;
            }
            
            // Get all AI person IDs from the AIAssistantModel
            const aiPersonIds = new Set<string>();
            if (this.aiaModel && this.aiaModel.getAvailableLLMModels) {
                const models = this.aiaModel.getAvailableLLMModels();
                for (const model of models) {
                    if (model.personId) {
                        aiPersonIds.add(model.personId.toString());
                    }
                }
            }
            
            // Get current user ID for null owner resolution
            const myPersonId = this.leuteModel ? await this.leuteModel.myMainIdentity() : null;
            
            // Filter out channels where AI posts
            const nonAIChannels = channelInfos.filter(channelInfo => {
                const effectiveOwner = channelInfo.owner || myPersonId;
                if (effectiveOwner && aiPersonIds.has(effectiveOwner.toString())) {
                    return false;
                }
                return true;
            });
            
            // Check non-AI channels for messages needing response
            
            // Instead of loading ALL messages, just get the latest message efficiently
            let latestMessage = null;
            let latestTimestamp = 0;
            
            // Check each non-AI channel for just the latest message
            for (const channelInfo of nonAIChannels) {
                const iterator = (this.channelManager.constructor as any).singleChannelObjectIterator(channelInfo);
                
                // Since iterator returns newest first, we only need the first valid message
                for await (const entry of iterator) {
                    if (entry && entry.dataHash && entry.creationTime > latestTimestamp) {
                        try {
                            const messageData = await getObject(entry.dataHash);
                            if (messageData && (messageData.$type$ === 'ChatMessage' || messageData.text !== undefined)) {
                                latestMessage = messageData;
                                latestTimestamp = entry.creationTime;
                                break; // Found the latest message in this channel, move to next channel
                            }
                        } catch (err) {
                            // Ignore errors loading individual messages
                        }
                    }
                }
            }
            
            if (!latestMessage) {
                console.log(`[AITopicManager] No messages found in topic`);
                return false;
            }
            
            // Check for AI certificate
            if (latestMessage.attachments) {
                try {
                    const { hasAICertificate } = require('../../../utils/messageUtils');
                    if (hasAICertificate(latestMessage.attachments)) {
                        // Latest message is from AI, no response needed
                        return false;
                    }
                } catch (error) {
                    console.error('[AITopicManager] Error checking for AI certificate:', error);
                }
            }
            
            // Check if it's from AI person
            if (latestMessage.sender && this.aiaModel && this.aiaModel.isAIPersonId && this.aiaModel.isAIPersonId(latestMessage.sender)) {
                // Latest message is from AI person, no response needed
                return false;
            }
            
            console.log(`[AITopicManager] Latest message is from user: "${latestMessage.text?.substring(0, 50)}...", response needed`);
            return true;
            
        } catch (error) {
            console.error(`[AITopicManager] Error checking if response needed:`, error);
            return false;
        }
    }

    /**
     * Set the AI mode for a topic
     * @param topicId The topic ID
     * @param mode The AI mode (chat, assistant, summarizer, etc.)
     */
    public setTopicAIMode(topicId: string, mode: string): void {
        this.topicAIModes.set(topicId, mode);
        console.log(`[AITopicManager] Set AI mode for topic ${topicId}: ${mode}`);
    }
    
    /**
     * Get the AI mode for a topic
     * @param topicId The topic ID
     * @returns The AI mode, defaults to 'chat' if not set
     */
    public getTopicAIMode(topicId: string): string {
        return this.topicAIModes.get(topicId) || 'chat';
    }
    
    /**
     * Set custom task configurations for a topic
     * @param topicId The topic ID
     * @param configs Array of task configurations
     */
    public setTopicTaskConfigs(topicId: string, configs: AITaskConfig[]): void {
        this.topicTaskConfigs.set(topicId, configs);
        console.log(`[AITopicManager] Set ${configs.length} task configs for topic ${topicId}`);
    }
    
    /**
     * Get task configurations for a topic
     * @param topicId The topic ID
     * @returns Array of task configurations or null if not set
     */
    public getTopicTaskConfigs(topicId: string): AITaskConfig[] | null {
        return this.topicTaskConfigs.get(topicId) || null;
    }
    
    // Placeholder for methods that will be moved here, e.g.:
    // public async initializeAITopics(): Promise<void> { /* ... */ }
    // public async ensureTopicForModel(model: LLM): Promise<string> { /* ... */ }
    // ... etc.
} 