/**
 * Attachment caching system following one.leute's pattern
 * Provides efficient loading and caching of chat attachments
 */

import { getObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import { readBlobAsArrayBuffer, readUTF8TextFile } from '@refinio/one.core/lib/storage-blob.js';
import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';
import type { BLOB, CLOB, OneObjectTypes } from '@refinio/one.core/lib/recipes.js';
import type { 
  ChatAttachment, 
  AttachmentCacheEntry, 
  AttachmentType,
  BlobDescriptor 
} from '@src/types/attachments';

/**
 * Cache configuration
 */
const CACHE_CONFIG = {
  maxEntries: 100,
  maxMemoryMB: 50,
  ttlMs: 1000 * 60 * 60, // 1 hour
  mediaMaxSizeMB: 10
};

/**
 * Attachment cache manager
 */
export class AttachmentCache {
  private cache: Map<string, AttachmentCacheEntry> = new Map();
  private memoryUsage: number = 0;
  private loadingPromises: Map<string, Promise<ChatAttachment>> = new Map();

  /**
   * Get attachment from cache or load it
   */
  async getAttachment(hash: SHA256Hash): Promise<ChatAttachment | null> {
    // Check if already cached
    const cached = this.cache.get(hash);
    if (cached && this.isValid(cached)) {
      return cached.attachment;
    }

    // Check if already loading
    const loadingPromise = this.loadingPromises.get(hash);
    if (loadingPromise) {
      return loadingPromise;
    }

    // Start loading
    const promise = this.loadAttachment(hash);
    this.loadingPromises.set(hash, promise);

    try {
      const attachment = await promise;
      this.loadingPromises.delete(hash);
      return attachment;
    } catch (error) {
      this.loadingPromises.delete(hash);
      console.error(`[AttachmentCache] Failed to load attachment ${hash}:`, error);
      return null;
    }
  }

  /**
   * Load attachment from storage
   */
  private async loadAttachment(hash: SHA256Hash): Promise<ChatAttachment> {
    try {
      // First try to load as a ONE object
      const obj = await getObject(hash);
      
      if (obj && '$type$' in obj) {
        // Handle specific ONE object types
        switch (obj.$type$) {
          case 'BlobDescriptor':
            return this.loadBlobDescriptor(hash, obj as BlobDescriptor);
          
          case 'ThinkingSegment':
            return this.loadThinkingSegment(hash, obj);
          
          default:
            // Generic ONE object attachment
            return this.createAttachment(hash, 'unknown', obj);
        }
      }
    } catch (error) {
      // Not a ONE object, try as raw BLOB/CLOB
      console.log(`[AttachmentCache] ${hash} is not a ONE object, trying as BLOB/CLOB`);
    }

    // Try to determine type and load accordingly
    const type = await this.detectAttachmentType(hash);
    return this.loadRawAttachment(hash, type);
  }

  /**
   * Load BlobDescriptor attachment
   */
  private async loadBlobDescriptor(
    hash: SHA256Hash, 
    descriptor: BlobDescriptor
  ): Promise<ChatAttachment> {
    const type = this.getTypeFromMimeType(descriptor.mimeType);
    
    const attachment: ChatAttachment = {
      hash,
      type,
      cachedObject: descriptor,
      metadata: {
        mimeType: descriptor.mimeType,
        fileName: descriptor.fileName,
        fileSize: descriptor.fileSize,
        width: descriptor.width,
        height: descriptor.height,
        duration: descriptor.duration,
        thumbnailHash: descriptor.thumbnailHash
      }
    };

    // Cache it
    this.addToCache(hash, attachment);
    
    return attachment;
  }

  /**
   * Load thinking segment
   */
  private async loadThinkingSegment(
    hash: SHA256Hash,
    segment: any
  ): Promise<ChatAttachment> {
    const attachment: ChatAttachment = {
      hash: hash as SHA256Hash<CLOB>,
      type: 'thinking',
      cachedObject: segment,
      metadata: segment.metadata || {}
    };

    this.addToCache(hash, attachment);
    return attachment;
  }

  /**
   * Load raw BLOB/CLOB attachment
   */
  private async loadRawAttachment(
    hash: SHA256Hash,
    type: AttachmentType
  ): Promise<ChatAttachment> {
    const attachment: ChatAttachment = {
      hash,
      type,
      metadata: {}
    };

    this.addToCache(hash, attachment);
    return attachment;
  }

  /**
   * Detect attachment type from content
   */
  private async detectAttachmentType(hash: SHA256Hash): Promise<AttachmentType> {
    try {
      // Try to read first few bytes to detect type
      const arrayBuffer = await readBlobAsArrayBuffer(hash);
      const bytes = new Uint8Array(arrayBuffer.slice(0, 16));
      
      // Check for common file signatures
      if (this.isImageSignature(bytes)) return 'image';
      if (this.isVideoSignature(bytes)) return 'video';
      if (this.isAudioSignature(bytes)) return 'audio';
      if (this.isPDFSignature(bytes)) return 'document';
      
      // Try as text
      try {
        await readUTF8TextFile(hash);
        return 'clob';
      } catch {
        return 'blob';
      }
    } catch (error) {
      console.error(`[AttachmentCache] Failed to detect type for ${hash}:`, error);
      return 'unknown';
    }
  }

  /**
   * Check if bytes match image file signature
   */
  private isImageSignature(bytes: Uint8Array): boolean {
    // JPEG
    if (bytes[0] === 0xFF && bytes[1] === 0xD8) return true;
    // PNG
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return true;
    // GIF
    if (bytes[0] === 0x47 && bytes[1] === 0x49) return true;
    // WebP
    if (bytes[8] === 0x57 && bytes[9] === 0x45) return true;
    
    return false;
  }

  /**
   * Check if bytes match video file signature
   */
  private isVideoSignature(bytes: Uint8Array): boolean {
    // MP4
    if (bytes[4] === 0x66 && bytes[5] === 0x74) return true;
    // AVI
    if (bytes[0] === 0x52 && bytes[1] === 0x49) return true;
    // MOV
    if (bytes[4] === 0x6D && bytes[5] === 0x6F) return true;
    
    return false;
  }

  /**
   * Check if bytes match audio file signature
   */
  private isAudioSignature(bytes: Uint8Array): boolean {
    // MP3
    if (bytes[0] === 0x49 && bytes[1] === 0x44) return true;
    // WAV
    if (bytes[8] === 0x57 && bytes[9] === 0x41) return true;
    // M4A
    if (bytes[4] === 0x66 && bytes[5] === 0x74) return true;
    
    return false;
  }

  /**
   * Check if bytes match PDF signature
   */
  private isPDFSignature(bytes: Uint8Array): boolean {
    return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  }

  /**
   * Get attachment type from MIME type
   */
  private getTypeFromMimeType(mimeType: string): AttachmentType {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('application/pdf')) return 'document';
    if (mimeType.startsWith('application/')) return 'document';
    if (mimeType.startsWith('text/')) return 'clob';
    return 'blob';
  }

  /**
   * Add attachment to cache
   */
  private addToCache(hash: string, attachment: ChatAttachment, size: number = 0): void {
    // Remove oldest entries if cache is full
    if (this.cache.size >= CACHE_CONFIG.maxEntries) {
      this.evictOldest();
    }

    const entry: AttachmentCacheEntry = {
      attachment,
      loadedAt: Date.now(),
      size
    };

    this.cache.set(hash, entry);
    this.memoryUsage += size;

    // Evict if memory usage is too high
    while (this.memoryUsage > CACHE_CONFIG.maxMemoryMB * 1024 * 1024) {
      this.evictOldest();
    }
  }

  /**
   * Check if cache entry is still valid
   */
  private isValid(entry: AttachmentCacheEntry): boolean {
    return Date.now() - entry.loadedAt < CACHE_CONFIG.ttlMs;
  }

  /**
   * Evict oldest cache entry
   */
  private evictOldest(): void {
    let oldest: string | null = null;
    let oldestTime = Infinity;

    for (const [hash, entry] of this.cache) {
      if (entry.loadedAt < oldestTime) {
        oldest = hash;
        oldestTime = entry.loadedAt;
      }
    }

    if (oldest) {
      const entry = this.cache.get(oldest);
      if (entry) {
        this.memoryUsage -= entry.size || 0;
        this.cache.delete(oldest);
      }
    }
  }

  /**
   * Create generic attachment
   */
  private createAttachment(
    hash: SHA256Hash,
    type: AttachmentType,
    cachedObject?: OneObjectTypes
  ): ChatAttachment {
    return {
      hash,
      type,
      cachedObject,
      metadata: {}
    };
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
    this.loadingPromises.clear();
    this.memoryUsage = 0;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      entries: this.cache.size,
      memoryUsageMB: this.memoryUsage / (1024 * 1024),
      loading: this.loadingPromises.size
    };
  }
}

// Singleton instance
export const attachmentCache = new AttachmentCache();