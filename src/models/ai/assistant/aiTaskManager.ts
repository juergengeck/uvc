import { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';
import { storeVersionedObject } from '@refinio/one.core/lib/storage-versioned-objects.js';
import { storeUnversionedObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import { AITaskType, type AITaskConfig } from './aiTaskTypes';
import type { JournalEntry } from '@OneObjectInterfaces';

/**
 * AITask ONE datatype
 */
export interface AITask {
  $type$: 'AITask';
  
  // Task identification
  name: string;                    // Human-readable task name
  type: AITaskType;               // Task type from predefined list
  
  // Metadata
  creationDate: number;           // Unix timestamp of creation
  owner: SHA256IdHash<Person>;    // Person who created the task
  
  // Dynamic topic associations
  topicAssociations?: Array<{
    topicId: string;              // Topic/channel this task is associated with
    enabled: boolean;             // Whether task is active for this topic
    priority: number;             // Execution order (lower = higher priority)
    addedDate: number;            // When task was added to topic
    addedBy: SHA256IdHash<Person>; // Who added this task to the topic
  }>;
  
  // Task configuration
  config?: AITaskConfig['config'];
}

/**
 * AISubject ONE datatype
 */
export interface AISubject {
  $type$: 'AISubject';
  
  // Subject identification
  name: string[];                 // Array of keywords identifying the subject
  summary: string;                // Concise summary of the subject
  
  // Context and relationships
  context: SHA256IdHash<AISubject>[]; // Related subjects
  
  // Topic references
  topicReferences: Array<{
    topicId: string;                    // Topic/channel ID
    messageHashes: SHA256IdHash<any>[]; // Messages discussing this subject
  }>;
  
  // Metadata
  owner: SHA256IdHash<Person>;          // Person who owns this subject
  creationDate: number;                 // Unix timestamp
  lastUpdated: number;                  // Last modification timestamp
}

/**
 * AITaskManager - Manages dynamic task associations with topics
 */
export class AITaskManager {
  private channelManager: ChannelManager;
  private personId: SHA256IdHash<Person>;
  private subjectChannelId: string = 'AISubjectsChannel'; // IoM system topic
  private journalChannelId: string = 'journal'; // Standard journal channel

  constructor(channelManager: ChannelManager, personId: SHA256IdHash<Person>) {
    this.channelManager = channelManager;
    this.personId = personId;
  }

  /**
   * Initialize the subject channel as an IoM system topic
   * This channel stores all AI subjects for discovery and sharing across all devices
   */
  public async initializeSubjectChannel(): Promise<void> {
    try {
      console.log('[AITaskManager] Initializing AISubjectsChannel as IoM system topic');
      
      // The subject channel is a system topic like EveryoneTopic
      // It will be created as part of the IoM infrastructure
      // For now, we just verify it can be accessed
      
      // Try to access the channel
      try {
        const channelInfos = await this.channelManager.getMatchingChannelInfos({
          channelId: this.subjectChannelId
        });
        
        if (channelInfos.length > 0) {
          console.log('[AITaskManager] AISubjectsChannel found in IoM');
        } else {
          console.log('[AITaskManager] AISubjectsChannel not yet available in IoM');
          // The channel will be created by the IoM infrastructure
          // when subjects are first posted
        }
      } catch (error) {
        console.log('[AITaskManager] AISubjectsChannel will be created on first use');
      }
    } catch (error) {
      console.error('[AITaskManager] Error checking subject channel:', error);
    }
  }

  /**
   * Get the task ID
   */
  public getTaskId(task: AITask): string {
    return `${task.type}-${task.creationDate}`;
  }

  /**
   * Get the subject ID
   */
  public getSubjectId(subject: AISubject): string {
    return subject.name.sort().join('-').toLowerCase();
  }

  /**
   * Create a new AI task
   */
  public async createTask(
    name: string,
    type: AITaskType,
    config?: AITaskConfig['config']
  ): Promise<AITask> {
    const task: AITask = {
      $type$: 'AITask',
      name,
      type,
      creationDate: Date.now(),
      owner: this.personId,
      config
    };

    // Store the task
    await storeVersionedObject(task);
    console.log(`[AITaskManager] Created task: ${name} (${type})`);
    
    return task;
  }

  /**
   * Add a task to a topic
   */
  public async addTaskToTopic(
    task: AITask,
    topicId: string,
    priority: number = 1
  ): Promise<void> {
    const association = {
      topicId,
      enabled: true,
      priority,
      addedDate: Date.now(),
      addedBy: this.personId
    };

    if (!task.topicAssociations) {
      task.topicAssociations = [];
    }

    // Check if already associated
    const existing = task.topicAssociations.findIndex(a => a.topicId === topicId);
    if (existing >= 0) {
      task.topicAssociations[existing] = association;
    } else {
      task.topicAssociations.push(association);
    }

    // Store updated task
    await storeVersionedObject(task);
    console.log(`[AITaskManager] Added task ${task.name} to topic ${topicId}`);
  }

  /**
   * Remove a task from a topic
   */
  public async removeTaskFromTopic(task: AITask, topicId: string): Promise<void> {
    if (!task.topicAssociations) return;

    const index = task.topicAssociations.findIndex(a => a.topicId === topicId);
    if (index >= 0) {
      task.topicAssociations.splice(index, 1);
      await storeVersionedObject(task);
      console.log(`[AITaskManager] Removed task ${task.name} from topic ${topicId}`);
    }
  }

  /**
   * Enable/disable a task for a topic
   */
  public async setTaskEnabled(
    task: AITask,
    topicId: string,
    enabled: boolean
  ): Promise<void> {
    const association = task.topicAssociations?.find(a => a.topicId === topicId);
    if (association) {
      association.enabled = enabled;
      await storeVersionedObject(task);
      console.log(`[AITaskManager] ${enabled ? 'Enabled' : 'Disabled'} task ${task.name} for topic ${topicId}`);
    }
  }

  /**
   * Get active tasks for a topic
   */
  public async getActiveTasksForTopic(topicId: string): Promise<AITask[]> {
    try {
      // Query all AITask objects
      const allTasks = await this.channelManager.getObjectsWithType('AITask');
      
      // Filter for tasks associated with this topic
      return allTasks
        .filter(task => 
          task.topicAssociations?.some(a => 
            a.topicId === topicId && a.enabled
          )
        )
        .sort((a, b) => {
          // Sort by priority
          const aPriority = a.topicAssociations?.find(x => x.topicId === topicId)?.priority || 999;
          const bPriority = b.topicAssociations?.find(x => x.topicId === topicId)?.priority || 999;
          return aPriority - bPriority;
        });
    } catch (error) {
      console.error(`[AITaskManager] Error getting tasks for topic ${topicId}:`, error);
      return [];
    }
  }

  /**
   * Convert AITask objects to AITaskConfig for execution
   */
  public convertTasksToConfigs(tasks: AITask[]): AITaskConfig[] {
    return tasks.map((task, index) => ({
      type: task.type,
      enabled: true,
      priority: index + 1, // Use order from sorted array
      config: task.config
    }));
  }

  /**
   * Create a new AI subject
   */
  public async createSubject(
    keywords: string[],
    summary: string,
    context: SHA256IdHash<AISubject>[] = []
  ): Promise<AISubject> {
    const subject: AISubject = {
      $type$: 'AISubject',
      name: keywords,
      summary,
      context,
      topicReferences: [],
      owner: this.personId,
      creationDate: Date.now(),
      lastUpdated: Date.now()
    };

    // Store the subject
    const storedSubject = await storeVersionedObject(subject);
    console.log(`[AITaskManager] Created subject: ${keywords.join(', ')}`);
    
    // Create journal entry for subject creation
    await this.createSubjectJournalEntry(subject, 'created');
    
    // Post to IoM subject channel for discovery across all devices
    try {
      // For IoM system channels, use null as owner (like EveryoneTopic)
      await this.channelManager.postToChannel(
        this.subjectChannelId,
        storedSubject,
        null // System channel owner
      );
      console.log(`[AITaskManager] Posted subject to IoM AISubjectsChannel`);
    } catch (error) {
      console.error('[AITaskManager] Error posting subject to IoM channel:', error);
    }
    
    return subject;
  }

  /**
   * Add topic reference to a subject
   */
  public async addTopicReferenceToSubject(
    subject: AISubject,
    topicId: string,
    messageHashes: SHA256IdHash<any>[]
  ): Promise<void> {
    const existing = subject.topicReferences.findIndex(ref => ref.topicId === topicId);
    
    if (existing >= 0) {
      // Add new message hashes to existing reference
      const uniqueHashes = new Set([
        ...subject.topicReferences[existing].messageHashes,
        ...messageHashes
      ]);
      subject.topicReferences[existing].messageHashes = Array.from(uniqueHashes);
    } else {
      // Add new topic reference
      subject.topicReferences.push({
        topicId,
        messageHashes
      });
    }

    subject.lastUpdated = Date.now();
    await storeVersionedObject(subject);
    console.log(`[AITaskManager] Added topic reference to subject ${this.getSubjectId(subject)}`);
    
    // Create journal entry for subject reference update
    await this.createSubjectJournalEntry(subject, 'referenced');
  }

  /**
   * Get subjects by keywords
   */
  public async getSubjectsByKeywords(keywords: string[]): Promise<AISubject[]> {
    try {
      // Get subjects from the subject channel
      const allSubjects = await this.channelManager.getObjectsWithType('AISubject', {
        channelId: this.subjectChannelId
      });
      
      // Find subjects that contain any of the keywords
      return allSubjects.filter(subject =>
        keywords.some(keyword =>
          subject.name.some(name =>
            name.toLowerCase().includes(keyword.toLowerCase())
          )
        )
      );
    } catch (error) {
      console.error(`[AITaskManager] Error getting subjects by keywords:`, error);
      return [];
    }
  }

  /**
   * Get subjects referenced in a topic
   */
  public async getSubjectsForTopic(topicId: string): Promise<AISubject[]> {
    try {
      const allSubjects = await this.channelManager.getObjectsWithType('AISubject', {
        channelId: this.subjectChannelId
      });
      
      return allSubjects.filter(subject =>
        subject.topicReferences.some(ref => ref.topicId === topicId)
      );
    } catch (error) {
      console.error(`[AITaskManager] Error getting subjects for topic:`, error);
      return [];
    }
  }
  
  /**
   * Get all subjects from the subject channel
   */
  public async getAllSubjects(): Promise<AISubject[]> {
    try {
      return await this.channelManager.getObjectsWithType('AISubject', {
        channelId: this.subjectChannelId
      });
    } catch (error) {
      console.error(`[AITaskManager] Error getting all subjects:`, error);
      return [];
    }
  }
  
  /**
   * Add context relationship between subjects
   */
  public async addSubjectContext(
    subject: AISubject,
    relatedSubjectId: SHA256IdHash<AISubject>
  ): Promise<void> {
    if (!subject.context.includes(relatedSubjectId)) {
      subject.context.push(relatedSubjectId);
      subject.lastUpdated = Date.now();
      
      await storeVersionedObject(subject);
      console.log(`[AITaskManager] Added context relationship to subject ${this.getSubjectId(subject)}`);
      
      // Create journal entry for context update
      await this.createSubjectJournalEntry(subject, 'updated');
    }
  }
  
  /**
   * Search subjects by summary content
   */
  public async searchSubjectsBySummary(searchTerm: string): Promise<AISubject[]> {
    try {
      const allSubjects = await this.getAllSubjects();
      const lowerSearchTerm = searchTerm.toLowerCase();
      
      return allSubjects.filter(subject =>
        subject.summary.toLowerCase().includes(lowerSearchTerm)
      );
    } catch (error) {
      console.error(`[AITaskManager] Error searching subjects:`, error);
      return [];
    }
  }
  
  /**
   * Create a journal entry for subject-related events
   */
  private async createSubjectJournalEntry(
    subject: AISubject,
    action: 'created' | 'updated' | 'referenced'
  ): Promise<void> {
    try {
      const journalEntry: JournalEntry = {
        $type$: 'JournalEntry',
        entryId: `subject-${action}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        type: 'AISubject',
        data: {
          action,
          subjectId: this.getSubjectId(subject),
          keywords: subject.name,
          summary: subject.summary,
          topicCount: subject.topicReferences.length,
          contextCount: subject.context.length,
          timestamp: Date.now()
        },
        userId: this.personId.toString()
      };
      
      // Store the journal entry
      const storedEntry = await storeUnversionedObject(journalEntry);
      
      // Post to journal channel
      await this.channelManager.postToChannel(
        this.journalChannelId,
        storedEntry,
        this.personId
      );
      
      console.log(`[AITaskManager] Created journal entry for subject ${action}: ${subject.name.join(', ')}`);
    } catch (error) {
      console.error('[AITaskManager] Error creating journal entry:', error);
      // Don't throw - journal entry creation shouldn't block subject operations
    }
  }
}