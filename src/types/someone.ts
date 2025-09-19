/**
 * Someone Contact Management Types
 * 
 * Based on flexibel.one/leute.one architecture where:
 * - Someone objects are the display units for contacts
 * - Person IDs are technical content-addressed identifiers  
 * - Profiles can be moved between Someone objects for privacy management
 */

import { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import { Person } from '@refinio/one.core/lib/recipes.js';
import { Someone } from '@refinio/one.models/lib/recipes/Leute/Someone.js';
import { Profile } from '@refinio/one.models/lib/recipes/Leute/Profile.js';

/**
 * Someone display information for UI
 * Contains consolidated information from Someone object and its main profile
 */
export interface SomeoneDisplayInfo {
  /** Someone object ID hash */
  someoneId: SHA256IdHash<Someone>;
  
  /** Display name from profile descriptions */
  displayName: string;
  
  /** Secondary information (email, organization, etc.) */
  description?: string;
  
  /** Person ID from main profile */
  personId: SHA256IdHash<Person>;
  
  /** Main profile information */
  mainProfile: {
    profileId: string;
    personDescriptions: any[];
    communicationEndpoints: any[];
  };
  
  /** All profiles associated with this Someone */
  allProfiles: {
    profileId: string;
    personId: SHA256IdHash<Person>;
    displayName?: string;
    description?: string;
  }[];
  
  /** Connection information if this Someone has active connections */
  connections?: {
    total: number;
    active: number;
    lastSeen?: Date;
    connectionDetails: any[];
  };
  
  /** Whether this Someone represents an AI assistant */
  isAI: boolean;
  
  /** Whether this is the current user */
  isCurrentUser: boolean;
}

/**
 * Profile transfer operation for privacy management
 * Allows moving profiles between Someone objects
 */
export interface ProfileTransferRequest {
  /** Profile to be moved */
  profileId: string;
  
  /** Current Someone object containing the profile */
  fromSomeoneId: SHA256IdHash<Someone>;
  
  /** Target Someone object to receive the profile */
  toSomeoneId: SHA256IdHash<Someone>;
  
  /** Optional reason for the transfer */
  reason?: string;
}

/**
 * Someone merge operation
 * Combines multiple Someone objects representing the same real person
 */
export interface SomeoneMergeRequest {
  /** Primary Someone object to keep */
  primarySomeoneId: SHA256IdHash<Someone>;
  
  /** Someone objects to merge into the primary */
  secondarySomeoneIds: SHA256IdHash<Someone>[];
  
  /** How to handle conflicting information */
  conflictResolution: 'prefer-primary' | 'prefer-newer' | 'manual';
  
  /** Manual resolutions for specific conflicts */
  manualResolutions?: {
    displayName?: string;
    description?: string;
    preferredProfile?: string;
  };
}

/**
 * Someone split operation  
 * Separates profiles into different Someone objects for privacy
 */
export interface SomeoneSplitRequest {
  /** Someone object to split */
  sourceId: SHA256IdHash<Someone>;
  
  /** Profiles to move to new Someone objects */
  profileGroups: {
    /** New Someone display name */
    newSomeoneName: string;
    
    /** Profiles to move to this new Someone */
    profileIds: string[];
    
    /** Optional description for the new Someone */
    description?: string;
  }[];
}

/**
 * Connection summary grouped by Someone
 * This is what should be displayed in connection views
 */
export interface SomeoneConnectionSummary {
  /** Someone display information */
  someone: SomeoneDisplayInfo;
  
  /** All connections associated with this Someone's profiles */
  connections: {
    /** Connection details */
    connectionId: string;
    personId: SHA256IdHash<Person>;
    remoteInstanceId: string;
    isConnected: boolean;
    isInternetOfMe: boolean;
    lastSeen?: Date;
    bytesReceived?: number;
    bytesSent?: number;
  }[];
  
  /** Summary statistics */
  summary: {
    totalConnections: number;
    activeConnections: number;
    internetOfMeConnections: number;
    internetOfPeopleConnections: number;
    lastActivity?: Date;
  };
}

/**
 * Someone editing capabilities
 * Defines what operations are available for managing Someone objects
 */
export interface SomeoneEditingCapabilities {
  /** Can edit Someone display name and description */
  canEditBasicInfo: boolean;
  
  /** Can move profiles between Someone objects */
  canTransferProfiles: boolean;
  
  /** Can merge multiple Someone objects */
  canMergeSomeone: boolean;
  
  /** Can split Someone into multiple objects */
  canSplitSomeone: boolean;
  
  /** Can delete Someone (if no active connections) */
  canDeleteSomeone: boolean;
  
  /** Can create new Someone objects */
  canCreateSomeone: boolean;
  
  /** Reasons why certain operations might be restricted */
  restrictions?: {
    operation: string;
    reason: string;
    canOverride: boolean;
  }[];
}

/**
 * Privacy management context
 * Helps users understand the privacy implications of Someone management
 */
export interface PrivacyContext {
  /** Different identity contexts this Someone might represent */
  contexts: {
    name: string;
    description: string;
    profileIds: string[];
    suggestedSeparation: boolean;
  }[];
  
  /** Suggestions for improving privacy */
  suggestions: {
    type: 'merge' | 'split' | 'rename' | 'separate';
    description: string;
    affectedProfiles: string[];
    impact: 'low' | 'medium' | 'high';
  }[];
}

/**
 * Someone validation result
 * Ensures Someone objects are properly structured
 */
export interface SomeoneValidationResult {
  isValid: boolean;
  issues: {
    severity: 'error' | 'warning' | 'info';
    message: string;
    suggestion?: string;
  }[];
  canAutoFix: boolean;
  autoFixActions?: string[];
} 