import type { Recipe, Person, Group } from '@refinio/one.core/lib/recipes.js';
import type { SHA256IdHash, SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Topic } from '@refinio/one.models/lib/recipes/ChatRecipes.js';
import type { Someone } from '@refinio/one.models/lib/recipes/Leute/Someone.js';
import type { AIContext } from './ai';

/**
 * Extended Topic that includes temporal and relationship metadata
 */
export interface ExtendedTopic extends Recipe {
  $type$: 'Recipe';
  type: 'ExtendedTopic';
  id: string;
  baseTopicId: SHA256IdHash<Topic>;
  // Core topic data
  content: {
    title: string;
    description?: string;
    type: 'meeting' | 'conversation' | 'project' | 'event';
  };
  // Who's involved
  participants: {
    someone: SHA256IdHash<Someone>;
    role: 'owner' | 'member' | 'guest' | 'ai';
    joinedAt: number;
    context?: string; // Why/how they joined
  }[];
  // Time context
  temporal: {
    created: number;
    lastActive: number;
    // For calendar integration
    schedule?: {
      start?: number;
      end?: number;
      recurrence?: string; // iCal RRule
      reminders?: number[]; // timestamps
    };
  };
  // Relationship to other topics
  context: {
    parentTopic?: SHA256IdHash<Topic>;
    relatedTopics: SHA256IdHash<Topic>[];
    // For AI-enhanced context
    summary?: string;
    keywords?: string[];
    aiContext?: AIContext;
  };
  rule: [];
}

/**
 * Links between Someone/Group and their defining Topics
 */
export interface TopicLink extends Recipe {
  $type$: 'Recipe';
  type: 'TopicLink';
  id: string;
  // The entity this link belongs to
  entityId: SHA256IdHash<Someone | Group>;
  // The topic that defines/introduces this entity
  definitionTopic: SHA256IdHash<ExtendedTopic>;
  // All topics this entity participates in, ordered by time
  participatingTopics: {
    topicId: SHA256IdHash<ExtendedTopic>;
    joinedAt: number;
    role: 'owner' | 'member' | 'guest' | 'ai';
    context?: string; // Why they joined this topic
  }[];
  // When this link was created (e.g. when we met the person)
  created: number;
  // Additional context
  metadata: {
    // For Someone: how we met
    // For Group: why it was created
    context?: string;
    // Key moments in the relationship
    milestones?: {
      timestamp: number;
      type: string;
      description: string;
      topicId?: SHA256IdHash<ExtendedTopic>;
    }[];
    // For AI-enhanced features
    summary?: string;
    keywords?: string[];
    // Last N topics for quick access
    recentTopics?: SHA256IdHash<ExtendedTopic>[];
  };
  rule: [];
}

/**
 * Owner's timeline - special topic that represents the owner's life
 */
export interface Timeline extends Recipe {
  $type$: 'Recipe';
  type: 'Timeline';
  id: string;
  ownerId: SHA256IdHash<Someone>;
  // Key life events (birth, graduation, etc)
  events: {
    id: string;
    timestamp: number;
    type: string;
    description: string;
    topic?: SHA256IdHash<ExtendedTopic>;
    // For recurring events
    recurrence?: string; // iCal RRule
    // Related people/groups
    participants?: SHA256IdHash<Someone | Group>[];
  }[];
  // First encounters with people
  introductions: {
    someone: SHA256IdHash<Someone>;
    topic: SHA256IdHash<ExtendedTopic>;
    timestamp: number;
    context: string; // How we met
    // Follow-up interactions
    nextMeetings?: SHA256IdHash<ExtendedTopic>[];
  }[];
  // Group formations and changes
  groups: {
    group: SHA256IdHash<Group>;
    topic: SHA256IdHash<ExtendedTopic>;
    timestamp: number;
    type: 'created' | 'joined' | 'left';
    role: 'owner' | 'member' | 'guest';
    context?: string;
  }[];
  // Quick access to recent/important topics
  quickAccess?: {
    recentTopics: SHA256IdHash<ExtendedTopic>[];
    pinnedTopics: SHA256IdHash<ExtendedTopic>[];
    // Topics planned for near future
    upcomingTopics: SHA256IdHash<ExtendedTopic>[];
  };
  rule: [];
}

// Recipe type declarations for ONE system
declare module '@refinio/one.core/lib/recipes.js' {
  interface RecipeTypes {
    'ExtendedTopic': ExtendedTopic;
    'TopicLink': TopicLink;
    'Timeline': Timeline;
  }

  interface OneObjectTypeNames {
    'ExtendedTopic': 'ExtendedTopic';
    'TopicLink': 'TopicLink';
    'Timeline': 'Timeline';
  }
} 