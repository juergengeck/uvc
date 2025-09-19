import { ModelManager } from '../../models/ai/ModelManager';
import * as FileSystem from 'expo-file-system';
import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks';
import type { BLOB } from '@refinio/one.core/lib/recipes';

/**
 * Migrate a model file from the old location to one.core's blob storage
 * @param oldPath Path to existing model file
 * @returns Object containing the blob hash and new path
 * @throws If migration fails
 */
export async function migrateModelFile(oldPath: string): Promise<{
  hash: SHA256Hash<BLOB>;
  path: string;
}> {
  try {
    // Read existing model file
    const buffer = await FileSystem.readAsStringAsync(oldPath, {
      encoding: FileSystem.EncodingType.Base64
    });
    
    // Convert base64 to ArrayBuffer
    const modelBuffer = Uint8Array.from(atob(buffer), c => c.charCodeAt(0)).buffer;
    
    // Store in blob storage
    const modelManager = new ModelManager();
    const result = await modelManager.storeModel(modelBuffer);
    
    // Clean up old file
    await FileSystem.deleteAsync(oldPath, { idempotent: true });
    
    return result;
  } catch (error) {
    throw new Error(`Migration failed: ${error}`);
  }
}

/**
 * Check if a model needs migration
 * @param path Path to check
 * @returns Whether the path is in the old format
 */
export function needsMigration(path: string): boolean {
  const documentDir = FileSystem.documentDirectory;
  if (!documentDir) return false;
  return path.startsWith(documentDir);
}

/**
 * Migrate all models in a directory
 * @param directory Directory containing old model files
 * @returns Map of old paths to new blob info
 * @throws If migration fails
 */
export async function migrateDirectory(directory: string): Promise<Map<string, {
  hash: SHA256Hash<BLOB>;
  path: string;
}>> {
  const results = new Map();
  
  try {
    // List all files in directory
    const files = await FileSystem.readDirectoryAsync(directory);
    
    // Migrate each model file
    for (const file of files) {
      const oldPath = `${directory}/${file}`;
      if (needsMigration(oldPath)) {
        const result = await migrateModelFile(oldPath);
        results.set(oldPath, result);
      }
    }
    
    return results;
  } catch (error) {
    throw new Error(`Directory migration failed: ${error}`);
  }
} 