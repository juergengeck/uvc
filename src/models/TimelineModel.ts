import type { Group, Person, OneObjectTypeNames } from '@refinio/one.core/lib/recipes.js';
import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Someone } from '@refinio/one.models/lib/recipes/Leute/Someone.js';
import type { Topic } from '@refinio/one.models/lib/recipes/ChatRecipes.js';
import { Model } from '@refinio/one.models/lib/models/Model.js';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import type { ExtendedTopic, Timeline } from '../types/topics';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type TopicModel from '@refinio/one.models/lib/models/Chat/TopicModel.js';

/**
 * Model for managing the owner's timeline
 */
export class TimelineModel extends Model {
  readonly onUpdated = new OEvent<() => void>();
  private timeline?: Timeline;
  private loadedVersion?: SHA256Hash<Timeline>;

  constructor(
    private readonly ownerId: SHA256IdHash<Someone>,
    private readonly channelManager: ChannelManager,
    private readonly leuteModel: LeuteModel,
    private readonly topicModel: TopicModel
  ) {
    super();
  }

  /**
   * Shutdown the model
   */
  async shutdown(): Promise<void> {
    // Nothing to clean up
  }

  /**
   * Create a new timeline for the owner
   */
  static async createTimeline(
    ownerId: SHA256IdHash<Someone>,
    birthDate: number,
    channelManager: ChannelManager,
    leuteModel: LeuteModel,
    topicModel: TopicModel
  ): Promise<TimelineModel> {
    const model = new TimelineModel(ownerId, channelManager, leuteModel, topicModel);
    
    // Initialize timeline
    const timeline: Timeline = {
      $type$: 'Recipe',
      type: 'Timeline',
      id: `${ownerId.toString()}-timeline`,
      name: 'Timeline' as OneObjectTypeNames,
      ownerId,
      events: [{
        id: 'birth',
        timestamp: birthDate,
        type: 'birth',
        description: 'Born'
      }],
      introductions: [],
      groups: [],
      rule: []
    };

    // Store and load
    await model.storeAndLoad(timeline);
    return model;
  }

  /**
   * Add a life event
   */
  async addEvent(
    type: string,
    description: string,
    timestamp: number,
    topic?: SHA256IdHash<ExtendedTopic>,
    participants?: SHA256IdHash<Someone | Group>[],
    recurrence?: string
  ): Promise<void> {
    if (!this.timeline) throw new Error('No timeline loaded');

    this.timeline.events.push({
      id: `${type}-${Date.now()}`,
      timestamp,
      type,
      description,
      topic,
      participants,
      recurrence
    });

    // Keep ordered by time
    this.timeline.events.sort((a, b) => b.timestamp - a.timestamp);

    await this.saveAndLoad();
  }

  /**
   * Add a first meeting with someone
   */
  async addIntroduction(
    someone: SHA256IdHash<Someone>,
    topic: SHA256IdHash<ExtendedTopic>,
    timestamp: number,
    context: string
  ): Promise<void> {
    if (!this.timeline) throw new Error('No timeline loaded');

    this.timeline.introductions.push({
      someone,
      topic,
      timestamp,
      context
    });

    // Keep ordered by time
    this.timeline.introductions.sort((a, b) => b.timestamp - a.timestamp);

    await this.saveAndLoad();
  }

  /**
   * Add a group event
   */
  async addGroupEvent(
    group: SHA256IdHash<Group>,
    topic: SHA256IdHash<ExtendedTopic>,
    timestamp: number,
    type: 'created' | 'joined' | 'left',
    role: 'owner' | 'member' | 'guest',
    context?: string
  ): Promise<void> {
    if (!this.timeline) throw new Error('No timeline loaded');

    this.timeline.groups.push({
      group,
      topic,
      timestamp,
      type,
      role,
      context
    });

    // Keep ordered by time
    this.timeline.groups.sort((a, b) => b.timestamp - a.timestamp);

    await this.saveAndLoad();
  }

  /**
   * Update quick access topics
   */
  async updateQuickAccess(
    recentTopics: SHA256IdHash<ExtendedTopic>[],
    pinnedTopics: SHA256IdHash<ExtendedTopic>[],
    upcomingTopics: SHA256IdHash<ExtendedTopic>[]
  ): Promise<void> {
    if (!this.timeline) throw new Error('No timeline loaded');

    this.timeline.quickAccess = {
      recentTopics,
      pinnedTopics,
      upcomingTopics
    };

    await this.saveAndLoad();
  }

  /**
   * Get events in a time range
   */
  getEvents(start: number, end: number) {
    return this.timeline?.events.filter(e => 
      e.timestamp >= start && e.timestamp <= end
    ) || [];
  }

  /**
   * Get introductions in a time range
   */
  getIntroductions(start: number, end: number) {
    return this.timeline?.introductions.filter(i =>
      i.timestamp >= start && i.timestamp <= end
    ) || [];
  }

  /**
   * Get group events in a time range
   */
  getGroupEvents(start: number, end: number) {
    return this.timeline?.groups.filter(g =>
      g.timestamp >= start && g.timestamp <= end
    ) || [];
  }

  /**
   * Get quick access topics
   */
  getQuickAccess() {
    return this.timeline?.quickAccess;
  }

  /**
   * Load a specific version
   */
  async loadVersion(version: SHA256Hash<Timeline>): Promise<void> {
    const timelines = await this.channelManager.getObjectsWithType<Timeline>(
      'Timeline',
      { version }
    );
    if (!timelines.length) throw new Error('Failed to load timeline');

    this.timeline = timelines[0].data;
    this.loadedVersion = version;
    this.onUpdated.emit();
  }

  /**
   * Load the latest version
   */
  async loadLatestVersion(): Promise<void> {
    const timelines = await this.channelManager.getObjectsWithType<Timeline>(
      'Timeline',
      { ownerId: this.ownerId.toString() }
    );
    if (!timelines.length) return;

    this.timeline = timelines[0].data;
    this.loadedVersion = timelines[0].hash;
    this.onUpdated.emit();
  }

  /**
   * Store and load the latest version
   */
  private async storeAndLoad(timeline: Timeline): Promise<void> {
    await this.channelManager.storeObject(timeline);
    await this.loadLatestVersion();
  }

  /**
   * Save changes and load the latest version
   */
  private async saveAndLoad(): Promise<void> {
    if (!this.timeline) throw new Error('No timeline loaded');
    await this.storeAndLoad(this.timeline);
  }
} 