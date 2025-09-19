/**
 * Storage Interface
 * 
 * This interface defines the core storage operations to break circular dependencies
 * between storage components. It provides a common abstraction layer that can be
 * implemented by both versioned and unversioned storage.
 */

import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';

export interface StorageOperations {
  /**
   * Store an object with its ID hash
   */
  store(idHash: SHA256IdHash<any>, obj: any): Promise<void>;
  
  /**
   * Retrieve an object by its ID hash
   */
  get(idHash: SHA256IdHash<any>): Promise<any>;
  
  /**
   * Check if an object exists
   */
  exists(idHash: SHA256IdHash<any>): Promise<boolean>;
  
  /**
   * Delete an object
   */
  delete(idHash: SHA256IdHash<any>): Promise<void>;
}

export interface StorageMetadata {
  /**
   * Get metadata for an object
   */
  getMetadata(idHash: SHA256IdHash<any>): Promise<any>;
  
  /**
   * Update metadata for an object
   */
  updateMetadata(idHash: SHA256IdHash<any>, metadata: any): Promise<void>;
}

export interface StorageEvents {
  /**
   * Subscribe to storage events
   */
  subscribe(callback: (event: StorageEvent) => void): () => void;
}

export interface StorageEvent {
  type: 'create' | 'update' | 'delete';
  idHash: SHA256IdHash<any>;
  metadata?: any;
}

/**
 * Core storage interface that combines all storage operations
 */
export interface IStorage extends StorageOperations, StorageMetadata, StorageEvents {
  /**
   * Initialize storage
   */
  initialize(): Promise<void>;
  
  /**
   * Close storage and cleanup
   */
  close(): Promise<void>;
}

/**
 * Factory function type for creating storage instances
 */
export type StorageFactory = (config: StorageConfig) => Promise<IStorage>;

/**
 * Storage configuration
 */
export interface StorageConfig {
  /**
   * Storage location/path
   */
  path: string;
  
  /**
   * Storage type (versioned/unversioned)
   */
  type: 'versioned' | 'unversioned';
  
  /**
   * Optional encryption key
   */
  encryptionKey?: string;
} 