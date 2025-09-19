import type { Recipe } from '@refinio/one.core/lib/recipes';
import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks';
import type { BLOB } from '@refinio/one.core/lib/recipes';

/**
 * Audio blob descriptor recipe
 * Used to store metadata about audio recordings
 */
export interface AudioBlobDescriptor {
  $type$: 'AudioBlobDescriptor';
  /** Hash of the audio blob */
  blobHash: SHA256Hash<BLOB>;
  /** Duration of the audio in seconds */
  duration: number;
  /** Sample rate in Hz */
  sampleRate: number;
  /** Number of channels (1 for mono, 2 for stereo) */
  channels: number;
  /** Audio format (e.g. 'wav', 'mp3') */
  format: string;
  /** Original filename if available */
  filename?: string;
  /** Creation timestamp */
  createdAt: number;
}

// Add to ONE's recipe system
declare module '@refinio/one.core/lib/recipes' {
  interface RecipeTypes {
    'AudioBlobDescriptor': AudioBlobDescriptor;
  }
} 