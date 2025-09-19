/**
 * Discovery ID - Unversioned object for discovery session identification
 */

import type { UnversionedObjectResult } from '@refinio/one.core/lib/storage-unversioned-objects.js';

// Declare the interface in the ONE object interfaces module
declare module '@OneObjectInterfaces' {
  interface OneUnversionedObjectInterfaces {
    DiscoveryID: DiscoveryID;
  }
}

/**
 * Discovery ID object for tracking discovery sessions
 */
export interface DiscoveryID {
  $type$: 'DiscoveryID';
  nonce: string;
  timestamp: number;
  sessionType: 'device_discovery';
}

// Recipe for DiscoveryID unversioned objects
import { Recipe, type RecipeRule } from '@refinio/one.core/lib/recipes.js';

export const DiscoveryIDRecipe: Recipe = {
  $type$: 'Recipe',
  name: 'DiscoveryID',
  rule: [
    {
      itemprop: 'nonce',
      itemtype: { type: 'string' }
    },
    {
      itemprop: 'timestamp',
      itemtype: { type: 'number' }
    },
    {
      itemprop: 'sessionType',
      itemtype: { type: 'string' }
    }
  ]
};

/**
 * Type guard for DiscoveryID objects
 */
export function isDiscoveryID(obj: any): obj is DiscoveryID {
  return obj && 
         obj.$type$ === 'DiscoveryID' &&
         typeof obj.nonce === 'string' &&
         typeof obj.timestamp === 'number' &&
         obj.sessionType === 'device_discovery';
}

/**
 * Create a new DiscoveryID object
 */
export function createDiscoveryID(nonce: string): DiscoveryID {
  return {
    $type$: 'DiscoveryID',
    nonce,
    timestamp: Date.now(),
    sessionType: 'device_discovery'
  };
}