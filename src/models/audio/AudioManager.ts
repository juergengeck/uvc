import { storeArrayBufferAsBlob, readBlobAsArrayBuffer } from '@refinio/one.core/lib/storage-blob';
import { getInstanceDirectory } from '@refinio/one.core/lib/instance';
import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks';
import type { BLOB } from '@refinio/one.core/lib/recipes';
import type { AudioBlobDescriptor } from '../../recipes/AudioRecipes';
import type { Model } from '@src/models/Model';

/**
 * Audio metadata interface
 */
export interface AudioMetadata {
  /** Audio name for display */
  name?: string;
  /** Recording date */
  recordedAt?: Date;
  /** Duration in seconds */
  duration?: number;
  /** Sample rate in Hz */
  sampleRate?: number;
  /** Number of channels */
  channels?: number;
}

export interface StoredAudio {
  hash: SHA256Hash<BLOB>;
  path: string;
  metadata?: AudioMetadata;
}

/**
 * Manages audio files in one.core's blob storage
 */
export class AudioManager {
  private readonly model: Model;

  constructor(model: Model) {
    this.model = model;
  }

  /**
   * Store audio file in blob storage
   * @param buffer The audio file as ArrayBuffer
   * @param metadata Optional audio metadata
   * @returns Object containing the blob hash and path
   * @throws {Error} If storing fails
   */
  async storeAudio(buffer: ArrayBuffer, metadata?: AudioMetadata): Promise<{
    hash: SHA256Hash<BLOB>;
    path: string;
  }> {
    try {
      const result = await storeArrayBufferAsBlob(buffer);
      const path = this.getAudioPath(result.hash);
      
      if (metadata) {
        await this.model.propertyTree.setValue(`audio.${result.hash}`, JSON.stringify(metadata));
      }

      return { hash: result.hash, path };
    } catch (error) {
      throw new Error(`Failed to store audio: ${error}`);
    }
  }

  /**
   * Get the filesystem path for an audio blob
   * @param hash The blob's SHA256 hash
   * @returns Absolute path to the blob file
   * @throws {Error} If instance directory is not available
   */
  getAudioPath(hash: SHA256Hash<BLOB>): string {
    const instanceDir = getInstanceDirectory();
    if (!instanceDir) {
      throw new Error('Instance directory not available');
    }
    return `${instanceDir}/blobs/${hash}`;
  }

  /**
   * Delete an audio from blob storage
   * @param hash The blob's SHA256 hash
   * @throws {Error} If deletion fails
   */
  async deleteAudio(hash: SHA256Hash<BLOB>): Promise<void> {
    try {
      await this.model.propertyTree.setValue(`audio.${hash}`, '');
    } catch (error) {
      throw new Error(`Failed to delete audio: ${error}`);
    }
  }

  /**
   * Load an audio from blob storage
   * @param hash The blob's SHA256 hash
   * @returns The audio file as ArrayBuffer
   * @throws {Error} If loading fails
   */
  async loadAudio(hash: SHA256Hash<BLOB>): Promise<ArrayBuffer> {
    try {
      return await readBlobAsArrayBuffer(hash);
    } catch (error) {
      throw new Error(`Failed to load audio: ${error}`);
    }
  }

  /**
   * List all stored audio files
   * @returns Array of stored audio information
   * @throws {Error} If listing fails
   */
  async listAudio(): Promise<StoredAudio[]> {
    try {
      const audioFiles: StoredAudio[] = [];
      const prefix = 'audio.';
      
      // Get all keys with our prefix
      const keys = Array.from(this.model.propertyTree.keyValueStore.keys())
        .filter(key => key.startsWith(prefix));
      
      for (const key of keys) {
        const hash = key.replace(prefix, '') as SHA256Hash<BLOB>;
        const value = this.model.propertyTree.getValue(key);
        if (value && value !== '') {
          const metadata = JSON.parse(value);
          audioFiles.push({
            hash,
            path: this.getAudioPath(hash),
            metadata
          });
        }
      }
      
      return audioFiles;
    } catch (error) {
      throw new Error(`Failed to list audio files: ${error}`);
    }
  }
} 