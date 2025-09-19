/**
 * Attachment type definitions following one.leute patterns
 */

import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { BLOB, CLOB, OneObjectTypes, Person } from '@refinio/one.core/lib/recipes.js';

/**
 * Base attachment info structure
 */
export interface AttachmentInfo {
  hash: SHA256Hash;
  type: AttachmentType;
  cachedObject?: OneObjectTypes;
  metadata?: Record<string, any>;
}

/**
 * Attachment types supported by the application
 */
export type AttachmentType = 
  | 'blob'        // Images, videos, documents
  | 'clob'        // Text content
  | 'thinking'    // AI thinking content
  | 'image'       // Image with thumbnail support
  | 'video'       // Video with thumbnail support
  | 'audio'       // Audio files
  | 'document'    // PDF, Word, etc.
  | 'unknown';    // Fallback type

/**
 * Media attachment with thumbnail support
 */
export interface MediaAttachment extends AttachmentInfo {
  type: 'image' | 'video';
  thumbnailHash?: SHA256Hash<BLOB>;
  mimeType?: string;
  width?: number;
  height?: number;
  duration?: number; // For videos
}

/**
 * Document attachment
 */
export interface DocumentAttachment extends AttachmentInfo {
  type: 'document';
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
}

/**
 * Thinking attachment (CLOB)
 */
export interface ThinkingAttachment extends AttachmentInfo {
  type: 'thinking';
  hash: SHA256Hash<CLOB>;
  metadata: {
    partIndex: number;
    timestamp: number;
    visible: boolean;
    modelId?: string;
    responseHash?: string;
    aiId?: SHA256IdHash<Person>;
  };
}

/**
 * Audio attachment
 */
export interface AudioAttachment extends AttachmentInfo {
  type: 'audio';
  mimeType?: string;
  duration?: number;
}

/**
 * Union type for all attachment types
 */
export type ChatAttachment = 
  | MediaAttachment
  | DocumentAttachment
  | ThinkingAttachment
  | AudioAttachment
  | AttachmentInfo;

/**
 * Attachment view props for components
 */
export interface AttachmentViewProps {
  attachment: ChatAttachment;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: any;
}

/**
 * Attachment cache entry
 */
export interface AttachmentCacheEntry {
  attachment: ChatAttachment;
  loadedAt: number;
  size?: number;
  localUri?: string; // For cached media files
}

/**
 * BLOB descriptor for media files (following one.leute pattern)
 */
export interface BlobDescriptor {
  $type$: 'BlobDescriptor';
  mimeType: string;
  fileName?: string;
  fileSize?: number;
  width?: number;
  height?: number;
  duration?: number;
  thumbnailHash?: SHA256Hash<BLOB>;
}