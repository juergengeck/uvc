/**
 * Utilities for generating thumbnails
 */

import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/**
 * Generates thumbnails for a list of files
 * @param files Array of files to generate thumbnails for
 * @param targetWidth Target width for thumbnails
 * @param targetHeight Target height for thumbnails
 * @returns Promise resolving to array of thumbnail files
 */
export async function generateThumbnails(
  files: File[],
  targetWidth = 200,
  targetHeight = 200
): Promise<File[]> {
  return Promise.all(
    files.map(async (file) => {
      // Create URL for the file
      const url = URL.createObjectURL(file);
      
      try {
        // Manipulate the image
        const result = await manipulateAsync(
          url,
          [
            {
              resize: {
                width: targetWidth,
                height: targetHeight,
              },
            },
          ],
          {
            compress: 0.7,
            format: SaveFormat.JPEG,
          }
        );
        
        // Convert result to File object
        const response = await fetch(result.uri);
        const blob = await response.blob();
        return new File([blob], file.name, {
          type: 'image/jpeg',
        });
      } finally {
        // Clean up the URL
        URL.revokeObjectURL(url);
      }
    })
  );
} 