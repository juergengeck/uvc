/**
 * CLOB (Character Large Object) Storage Utilities
 * 
 * This file provides functions for storing and retrieving text data as CLOBs.
 * It's meant to complement the BLOB storage functions in one.core for text-specific use cases.
 */

import { storeUTF8Clob, readUTF8TextFile } from '@refinio/one.core/lib/storage-blob.js';
import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { CLOB, Recipe, Person } from '@refinio/one.core/lib/recipes.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Thinking segment metadata structure
 * This is a dedicated type for the metadata in thinking segments
 * to better integrate with ONE's type system
 */
export interface ThinkingSegmentMetadata {
  $type$: 'ThinkingSegmentMetadata';
  partIndex: number;      // Index in a multi-part thinking sequence
  timestamp: number;      // When this segment was created
  visible: boolean;       // Whether this segment should be visible by default
  modelId?: string;       // ID of the model that generated this thinking
  responseLength?: number; // Length of the associated response
  responseHash?: string;  // Hash of the associated response message
  creator?: SHA256IdHash<Person>; // Who created/requested this thinking
  aiId?: SHA256IdHash<Person>;    // ID of the AI that generated this thinking
  sessionId?: string;     // Session ID to group related thinking segments
  [key: string]: any;     // Extensible with additional properties
}

/**
 * Recipe for ThinkingSegmentMetadata
 * Provides validation rules for the metadata structure
 */
export const ThinkingSegmentMetadataRecipe: Recipe = {
  $type$: 'Recipe',
  name: 'ThinkingSegmentMetadata',
  rule: [
    { itemprop: '$type$', itemtype: { type: 'string' }, isId: true },
    { itemprop: 'partIndex', itemtype: { type: 'number' } },
    { itemprop: 'timestamp', itemtype: { type: 'number' } },
    { itemprop: 'visible', itemtype: { type: 'boolean' } },
    { itemprop: 'modelId', itemtype: { type: 'string' }, optional: true },
    { itemprop: 'responseLength', itemtype: { type: 'number' }, optional: true },
    { itemprop: 'responseHash', itemtype: { type: 'string' }, optional: true },
    { itemprop: 'creator', itemtype: { type: 'string' }, optional: true },
    { itemprop: 'aiId', itemtype: { type: 'string' }, optional: true },
    { itemprop: 'sessionId', itemtype: { type: 'string' }, optional: true }
  ]
};

/**
 * Thinking segment structure that matches what ThinkingView expects
 */
export interface ThinkingSegment {
  $type$: 'ThinkingSegment';
  id: string;
  type: string;
  content: string;
  metadata: ThinkingSegmentMetadata;
}

/**
 * Recipe for ThinkingSegment
 * Provides validation rules for the thinking segment structure
 */
export const ThinkingSegmentRecipe: Recipe = {
  $type$: 'Recipe',
  name: 'ThinkingSegment',
  rule: [
    { itemprop: '$type$', itemtype: { type: 'string' }, isId: true },
    { itemprop: 'id', itemtype: { type: 'string' }, isId: true },
    { itemprop: 'type', itemtype: { type: 'string' } },
    { itemprop: 'content', itemtype: { type: 'string' } },
    { itemprop: 'metadata', itemtype: { type: 'object', rules: [] } }
  ]
};

// Register types with @OneObjectInterfaces
declare module '@OneObjectInterfaces' {
  interface OneIdObjectInterfaces {
    ThinkingSegment: Pick<ThinkingSegment, '$type$' | 'id'>;
    ThinkingSegmentMetadata: Pick<ThinkingSegmentMetadata, '$type$'>;
  }

  interface OneVersionedObjectInterfaces {
    ThinkingSegment: ThinkingSegment;
    ThinkingSegmentMetadata: ThinkingSegmentMetadata;
  }
}

/**
 * Store a string as a CLOB
 * @param text The text to store
 * @returns Object containing the hash
 */
export async function storeTextAsClob(text: string): Promise<{
  hash: SHA256Hash<CLOB>;
}> {
  // Use ONE.core's native UTF-8 CLOB storage
  const result = await storeUTF8Clob<CLOB>(text);
  
  return {
    hash: result.hash
  };
}

/**
 * Store AI thinking content as a CLOB
 * @param content The thinking content to store
 * @param type The type of thinking ('thinking', 'reasoning', etc)
 * @param partIndex The index of this segment in a multi-part thinking sequence
 * @param additionalMetadata Any additional metadata to include
 * @returns Object containing the hash
 */
export async function storeThinkingAsClob(
  content: string, 
  type: 'thinking' | 'reasoning' | 'response' | 'raw',
  partIndex: number = 0,
  additionalMetadata: Record<string, any> = {}
): Promise<{
  hash: SHA256Hash<CLOB>;
  segment: ThinkingSegment;
}> {
  // Create the thinking segment metadata
  const metadata: ThinkingSegmentMetadata = {
    $type$: 'ThinkingSegmentMetadata',
    partIndex,
    timestamp: Date.now(),
    visible: true,
    ...additionalMetadata
  };
  
  // Create the thinking segment structure
  const segment: ThinkingSegment = {
    $type$: 'ThinkingSegment',
    id: uuidv4(),
    type,
    content,
    metadata
  };
  
  // Convert to JSON string
  const jsonString = JSON.stringify(segment);
  
  // Store the JSON string as CLOB
  const result = await storeTextAsClob(jsonString);
  
  return {
    hash: result.hash,
    segment
  };
}

/**
 * Read a CLOB as text
 * @param hash The CLOB's hash
 * @returns The text content
 */
export async function readClobAsText(hash: SHA256Hash<CLOB>): Promise<string> {
  try {
    // Use ONE.core's native UTF-8 text file reading
    return await readUTF8TextFile(hash);
  } catch (error) {
    console.error('Error reading CLOB as text:', error);
    throw error;
  }
} 