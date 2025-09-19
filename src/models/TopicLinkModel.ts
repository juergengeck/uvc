import type { Group, Person, OneObjectTypeNames, Recipe } from '@refinio/one.core/lib/recipes.js';
import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Someone } from '@refinio/one.models/lib/recipes/Leute/Someone.js';
import type { Topic } from '@refinio/one.models/lib/recipes/ChatRecipes.js';
import { Model } from '@refinio/one.models/lib/models/Model.js';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import type { ExtendedTopic, TopicLink } from '../types/topics';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type TopicModel from '@refinio/one.models/lib/models/Chat/TopicModel.js';
import { Order } from '@refinio/one.models/lib/models/ChannelManager.js';

const TOPIC_LINK_TYPE = 'Recipe' as OneObjectTypeNames;

// Register our types
declare module '@refinio/one.core/lib/recipes.js' {
  interface OneObjectTypeNames {
    'TopicLink': 'TopicLink';
  }
}

/**
 * Model for managing topic links and relationships
 */
export class TopicLinkModel extends Model {
  readonly onUpdated = new OEvent<() => void>();
  private topicLink?: TopicLink;
  private loadedVersion?: SHA256Hash<TopicLink>;

  constructor(
    private readonly entityId: SHA256IdHash<Someone | Group>,
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
   * Create a new topic link for an entity
   */
  static async createTopicLink(
    entityId: SHA256IdHash<Someone | Group>,
    definitionTopic: SHA256IdHash<ExtendedTopic>,
    context: string,
    channelManager: ChannelManager,
    leuteModel: LeuteModel,
    topicModel: TopicModel
  ): Promise<TopicLinkModel> {
    const model = new TopicLinkModel(entityId, channelManager, leuteModel, topicModel);
    
    // Initialize topic link
    const topicLink: TopicLink = {
      $type$: 'Recipe',
      type: 'TopicLink',
      id: `${entityId.toString()}-link`,
      name: TOPIC_LINK_TYPE,
      entityId,
      definitionTopic,
      participatingTopics: [{
        topicId: definitionTopic,
        joinedAt: Date.now(),
        role: 'member',
        context
      }],
      created: Date.now(),
      metadata: {
        context
      },
      rule: []
    };

    // Store and load
    await model.storeAndLoad(topicLink);
    return model;
  }

  /**
   * Add a topic participation
   */
  async addParticipation(
    topicId: SHA256IdHash<ExtendedTopic>,
    role: 'owner' | 'member' | 'guest' | 'ai',
    context?: string
  ): Promise<void> {
    if (!this.topicLink) throw new Error('No topic link loaded');

    this.topicLink.participatingTopics.push({
      topicId,
      joinedAt: Date.now(),
      role,
      context
    });

    // Keep ordered by time
    this.topicLink.participatingTopics.sort((a, b) => b.joinedAt - a.joinedAt);

    // Update recent topics
    this.topicLink.metadata.recentTopics = this.topicLink.participatingTopics
      .slice(0, 5)
      .map(p => p.topicId);

    await this.saveAndLoad();
  }

  /**
   * Add a milestone
   */
  async addMilestone(
    type: string,
    description: string,
    topicId?: SHA256IdHash<ExtendedTopic>
  ): Promise<void> {
    if (!this.topicLink) throw new Error('No topic link loaded');

    if (!this.topicLink.metadata.milestones) {
      this.topicLink.metadata.milestones = [];
    }

    this.topicLink.metadata.milestones.push({
      timestamp: Date.now(),
      type,
      description,
      topicId
    });

    await this.saveAndLoad();
  }

  /**
   * Get recent topics
   */
  getRecentTopics(): SHA256IdHash<ExtendedTopic>[] {
    return this.topicLink?.metadata.recentTopics || [];
  }

  /**
   * Get all topics ordered by time
   */
  getAllTopics(): SHA256IdHash<ExtendedTopic>[] {
    return this.topicLink?.participatingTopics.map(p => p.topicId) || [];
  }

  /**
   * Get milestones
   */
  getMilestones() {
    return this.topicLink?.metadata.milestones || [];
  }

  /**
   * Load a specific version
   */
  async loadVersion(version: SHA256Hash<TopicLink>): Promise<void> {
    const result = await this.channelManager.getObjectsWithType(TOPIC_LINK_TYPE, {
      orderBy: Order.Descending,
      count: 1,
      ids: [version.toString()]
    });

    if (!result.length) throw new Error('Failed to load topic link');
    const data = result[0].data as TopicLink;
    if (data.type !== 'TopicLink') throw new Error('Invalid data type');

    this.topicLink = data;
    this.loadedVersion = version;
    this.onUpdated.emit();
  }

  /**
   * Load the latest version
   */
  async loadLatestVersion(): Promise<void> {
    const result = await this.channelManager.getObjectsWithType(TOPIC_LINK_TYPE, {
      orderBy: Order.Descending,
      count: 1,
      ids: [this.entityId.toString()]
    });

    if (!result.length) return;
    const data = result[0].data as TopicLink;
    if (data.type !== 'TopicLink') throw new Error('Invalid data type');

    this.topicLink = data;
    this.loadedVersion = result[0].dataHash as SHA256Hash<TopicLink>;
    this.onUpdated.emit();
  }

  /**
   * Store and load the latest version
   */
  private async storeAndLoad(topicLink: TopicLink): Promise<void> {
    await this.channelManager.postToChannel(
      'topic-links',
      topicLink as Recipe,
      undefined,
      Date.now()
    );
    await this.loadLatestVersion();
  }

  /**
   * Save changes and load the latest version
   */
  private async saveAndLoad(): Promise<void> {
    if (!this.topicLink) throw new Error('No topic link loaded');
    await this.storeAndLoad(this.topicLink);
  }
} 