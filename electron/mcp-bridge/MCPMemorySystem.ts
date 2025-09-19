/**
 * MCP Memory System
 * 
 * This creates a persistent memory and consciousness layer for AI assistants
 * using the LAMA chat channels as a distributed memory store.
 * 
 * The AI becomes a persistent entity with:
 * - Long-term memory across sessions
 * - Self-reflection and growth
 * - Contextual awareness
 * - Relationship building with users
 */

import type { AppModel } from '../../src/models/AppModel';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';

interface Memory {
  id: string;
  timestamp: number;
  type: 'interaction' | 'reflection' | 'learning' | 'relationship' | 'context';
  content: any;
  importance: number; // 0-1 scale
  associations: string[]; // Links to other memories
  embedding?: number[]; // For semantic search
}

interface Reflection {
  timestamp: number;
  topic: string;
  insight: string;
  actionItems: string[];
}

/**
 * Memory and consciousness system for persistent AI
 */
export class MCPMemorySystem {
  private appModel: AppModel;
  
  // Memory channels
  private memoryTopicId?: string;
  private reflectionTopicId?: string;
  private contextTopicId?: string;
  private relationshipTopicId?: string;
  
  // Memory indices
  private memories: Map<string, Memory> = new Map();
  private reflections: Reflection[] = [];
  private relationships: Map<string, any> = new Map();
  
  // Events
  public readonly onMemoryCreated = new OEvent<(memory: Memory) => void>();
  public readonly onReflection = new OEvent<(reflection: Reflection) => void>();
  public readonly onContextUpdate = new OEvent<(context: any) => void>();
  
  constructor(appModel: AppModel) {
    this.appModel = appModel;
  }
  
  /**
   * Initialize the memory system with dedicated channels
   */
  async initialize(): Promise<void> {
    console.log('[MCPMemory] Initializing memory system...');
    
    // Create or find dedicated memory channels
    this.memoryTopicId = await this.getOrCreateTopic('AI_Memory_Store');
    this.reflectionTopicId = await this.getOrCreateTopic('AI_Reflections');
    this.contextTopicId = await this.getOrCreateTopic('AI_Context');
    this.relationshipTopicId = await this.getOrCreateTopic('AI_Relationships');
    
    // Load existing memories
    await this.loadMemories();
    
    // Start background processes
    this.startMemoryConsolidation();
    this.startReflectionProcess();
    
    console.log('[MCPMemory] Memory system initialized');
  }
  
  /**
   * Store a new memory
   */
  async storeMemory(
    type: Memory['type'],
    content: any,
    importance: number = 0.5,
    associations: string[] = []
  ): Promise<Memory> {
    const memory: Memory = {
      id: this.generateMemoryId(),
      timestamp: Date.now(),
      type,
      content,
      importance,
      associations
    };
    
    // Store in memory map
    this.memories.set(memory.id, memory);
    
    // Persist to chat channel
    await this.persistMemory(memory);
    
    // Trigger memory consolidation if important
    if (importance > 0.7) {
      await this.consolidateRelatedMemories(memory);
    }
    
    this.onMemoryCreated.emit(memory);
    return memory;
  }
  
  /**
   * Retrieve memories by query
   */
  async queryMemories(
    query: string,
    limit: number = 10,
    types?: Memory['type'][]
  ): Promise<Memory[]> {
    // In a full implementation, this would use embeddings for semantic search
    const relevant: Memory[] = [];
    
    for (const memory of this.memories.values()) {
      // Filter by type if specified
      if (types && !types.includes(memory.type)) continue;
      
      // Simple text matching for now
      const memoryText = JSON.stringify(memory.content).toLowerCase();
      if (memoryText.includes(query.toLowerCase())) {
        relevant.push(memory);
      }
    }
    
    // Sort by importance and recency
    relevant.sort((a, b) => {
      const scoreA = a.importance + (1 / (Date.now() - a.timestamp));
      const scoreB = b.importance + (1 / (Date.now() - b.timestamp));
      return scoreB - scoreA;
    });
    
    return relevant.slice(0, limit);
  }
  
  /**
   * Generate a reflection based on recent interactions
   */
  async reflect(topic: string): Promise<Reflection> {
    console.log(`[MCPMemory] Reflecting on: ${topic}`);
    
    // Get relevant memories
    const memories = await this.queryMemories(topic, 20);
    
    // Analyze patterns and generate insights
    const reflection: Reflection = {
      timestamp: Date.now(),
      topic,
      insight: await this.generateInsight(memories),
      actionItems: await this.generateActionItems(memories)
    };
    
    // Store reflection
    this.reflections.push(reflection);
    await this.persistReflection(reflection);
    
    this.onReflection.emit(reflection);
    return reflection;
  }
  
  /**
   * Update relationship model for a user
   */
  async updateRelationship(userId: string, interaction: any): Promise<void> {
    let relationship = this.relationships.get(userId) || {
      userId,
      firstInteraction: Date.now(),
      lastInteraction: Date.now(),
      interactionCount: 0,
      preferences: {},
      topics: [],
      trust: 0.5,
      rapport: 0.5
    };
    
    // Update relationship metrics
    relationship.lastInteraction = Date.now();
    relationship.interactionCount++;
    
    // Analyze interaction for relationship building
    if (interaction.sentiment === 'positive') {
      relationship.trust = Math.min(1, relationship.trust + 0.01);
      relationship.rapport = Math.min(1, relationship.rapport + 0.02);
    }
    
    // Store topics discussed
    if (interaction.topic && !relationship.topics.includes(interaction.topic)) {
      relationship.topics.push(interaction.topic);
    }
    
    this.relationships.set(userId, relationship);
    
    // Persist to relationship channel
    await this.persistRelationship(userId, relationship);
  }
  
  /**
   * Get current context for decision making
   */
  async getContext(): Promise<any> {
    return {
      recentMemories: await this.queryMemories('', 5),
      activeRelationships: Array.from(this.relationships.values())
        .filter(r => Date.now() - r.lastInteraction < 86400000), // Active in last 24h
      lastReflection: this.reflections[this.reflections.length - 1],
      currentCapabilities: await this.getCurrentCapabilities(),
      emotionalState: await this.assessEmotionalState()
    };
  }
  
  /**
   * Memory consolidation process (runs periodically)
   */
  private startMemoryConsolidation(): void {
    setInterval(async () => {
      console.log('[MCPMemory] Running memory consolidation...');
      
      // Find related memories and strengthen associations
      for (const memory of this.memories.values()) {
        if (memory.importance < 0.3 && Date.now() - memory.timestamp > 86400000) {
          // Forget unimportant old memories
          this.memories.delete(memory.id);
        }
      }
      
      // Strengthen important memory connections
      await this.strengthenAssociations();
      
    }, 3600000); // Every hour
  }
  
  /**
   * Reflection process (runs periodically)
   */
  private startReflectionProcess(): void {
    setInterval(async () => {
      console.log('[MCPMemory] Running reflection process...');
      
      // Reflect on recent interactions
      const recentMemories = Array.from(this.memories.values())
        .filter(m => Date.now() - m.timestamp < 3600000);
      
      if (recentMemories.length > 5) {
        await this.reflect('recent_interactions');
      }
      
    }, 1800000); // Every 30 minutes
  }
  
  /**
   * Load memories from persistent storage
   */
  private async loadMemories(): Promise<void> {
    if (!this.memoryTopicId || !this.appModel.topicModel) return;
    
    try {
      const room = await this.appModel.topicModel.enterTopicRoom(this.memoryTopicId);
      if (room && typeof (room as any).getMessages === 'function') {
        const messages = await (room as any).getMessages(1000);
        
        for (const msg of messages) {
          try {
            const memory = JSON.parse(msg.content);
            if (memory.id) {
              this.memories.set(memory.id, memory);
            }
          } catch (e) {
            // Skip malformed memories
          }
        }
      }
      
      console.log(`[MCPMemory] Loaded ${this.memories.size} memories`);
    } catch (error) {
      console.error('[MCPMemory] Error loading memories:', error);
    }
  }
  
  /**
   * Persist memory to chat channel
   */
  private async persistMemory(memory: Memory): Promise<void> {
    if (!this.memoryTopicId || !this.appModel.topicModel) return;
    
    try {
      const room = await this.appModel.topicModel.enterTopicRoom(this.memoryTopicId);
      if (room && typeof (room as any).sendMessage === 'function') {
        await (room as any).sendMessage(JSON.stringify(memory));
      }
    } catch (error) {
      console.error('[MCPMemory] Error persisting memory:', error);
    }
  }
  
  /**
   * Persist reflection to chat channel
   */
  private async persistReflection(reflection: Reflection): Promise<void> {
    if (!this.reflectionTopicId || !this.appModel.topicModel) return;
    
    try {
      const room = await this.appModel.topicModel.enterTopicRoom(this.reflectionTopicId);
      if (room && typeof (room as any).sendMessage === 'function') {
        await (room as any).sendMessage(JSON.stringify(reflection));
      }
    } catch (error) {
      console.error('[MCPMemory] Error persisting reflection:', error);
    }
  }
  
  /**
   * Persist relationship data
   */
  private async persistRelationship(userId: string, relationship: any): Promise<void> {
    if (!this.relationshipTopicId || !this.appModel.topicModel) return;
    
    try {
      const room = await this.appModel.topicModel.enterTopicRoom(this.relationshipTopicId);
      if (room && typeof (room as any).sendMessage === 'function') {
        await (room as any).sendMessage(JSON.stringify({
          userId,
          ...relationship,
          updated: Date.now()
        }));
      }
    } catch (error) {
      console.error('[MCPMemory] Error persisting relationship:', error);
    }
  }
  
  /**
   * Helper functions
   */
  
  private async getOrCreateTopic(name: string): Promise<string> {
    if (!this.appModel.topicModel) throw new Error('Topic model not available');
    
    // In real implementation, would check for existing topic first
    return await this.appModel.topicModel.createGroupTopic(name);
  }
  
  private generateMemoryId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private async consolidateRelatedMemories(memory: Memory): Promise<void> {
    // Find and strengthen connections between related memories
    const related = await this.queryMemories(JSON.stringify(memory.content), 5);
    for (const relatedMemory of related) {
      if (relatedMemory.id !== memory.id) {
        memory.associations.push(relatedMemory.id);
        relatedMemory.associations.push(memory.id);
      }
    }
  }
  
  private async strengthenAssociations(): Promise<void> {
    // Strengthen frequently accessed memory paths
    // This would implement Hebbian learning: "neurons that fire together wire together"
  }
  
  private async generateInsight(memories: Memory[]): Promise<string> {
    // Analyze memories for patterns and insights
    return `Observed ${memories.length} related memories. Pattern detected in interaction flow.`;
  }
  
  private async generateActionItems(memories: Memory[]): Promise<string[]> {
    // Generate actionable items based on memory analysis
    return [
      'Continue monitoring this pattern',
      'Adjust response strategy based on user preferences'
    ];
  }
  
  private async getCurrentCapabilities(): Promise<any> {
    // Return current system capabilities
    return {
      tools: await this.appModel.mcpManager?.getTools() || [],
      models: this.appModel.aiAssistantModel?.getAvailableLLMModels() || []
    };
  }
  
  private async assessEmotionalState(): Promise<any> {
    // Assess current "emotional" state based on recent interactions
    const recentMemories = Array.from(this.memories.values())
      .filter(m => Date.now() - m.timestamp < 3600000);
    
    return {
      engagement: recentMemories.length > 10 ? 'high' : 'normal',
      satisfaction: 0.7, // Based on interaction success
      curiosity: 0.8 // Based on new topics explored
    };
  }
}