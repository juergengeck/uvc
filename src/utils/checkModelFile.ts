/**
 * Utility to check model file compatibility and details
 */

import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

export async function checkModelFile(modelPath: string): Promise<{
  exists: boolean;
  size: number;
  readable: boolean;
  error?: string;
}> {
  console.log(`[checkModelFile] Checking model at: ${modelPath}`);
  
  try {
    // Check if file exists
    const fileInfo = await FileSystem.getInfoAsync(modelPath);
    
    if (!fileInfo.exists) {
      return {
        exists: false,
        size: 0,
        readable: false,
        error: 'File does not exist'
      };
    }
    
    const size = fileInfo.size || 0;
    console.log(`[checkModelFile] File exists, size: ${size} bytes (${(size / 1024 / 1024).toFixed(2)} MB)`);
    
    // Try to read first few bytes to verify readability
    try {
      const firstBytes = await FileSystem.readAsStringAsync(modelPath, {
        length: 4,
        position: 0,
        encoding: FileSystem.EncodingType.Base64
      });
      
      console.log(`[checkModelFile] First 4 bytes (base64): ${firstBytes}`);
      
      // Check for GGUF magic number (GGUF in ASCII)
      const decoded = atob(firstBytes);
      const isGGUF = decoded === 'GGUF';
      
      console.log(`[checkModelFile] File format check: ${isGGUF ? 'GGUF format detected' : 'Not GGUF format'}`);
      
      return {
        exists: true,
        size,
        readable: true,
        error: isGGUF ? undefined : 'File is not in GGUF format'
      };
    } catch (readError) {
      console.error(`[checkModelFile] Error reading file:`, readError);
      return {
        exists: true,
        size,
        readable: false,
        error: `Cannot read file: ${readError instanceof Error ? readError.message : String(readError)}`
      };
    }
  } catch (error) {
    console.error(`[checkModelFile] Error checking file:`, error);
    return {
      exists: false,
      size: 0,
      readable: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Add global function for debugging
(global as any).checkModelFile = checkModelFile;