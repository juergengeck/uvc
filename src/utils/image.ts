import * as FileSystem from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { createError } from './errors';

/**
 * Maximum size for profile images in bytes (2MB)
 */
export const MAX_PROFILE_IMAGE_SIZE = 2 * 1024 * 1024;

/**
 * Supported image types
 */
export const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png'] as const;

/**
 * Error types for image operations
 */
export type ImageErrorType = 
  | 'IMAGE_TOO_LARGE'
  | 'UNSUPPORTED_TYPE'
  | 'PROCESSING_ERROR'
  | 'FILE_SYSTEM_ERROR';

// Error type constants
export const ImageErrors = {
  IMAGE_TOO_LARGE: 'IMAGE_TOO_LARGE',
  UNSUPPORTED_TYPE: 'UNSUPPORTED_TYPE',
  PROCESSING_ERROR: 'PROCESSING_ERROR',
  FILE_SYSTEM_ERROR: 'FILE_SYSTEM_ERROR'
} as const;

/**
 * Options for processing images
 */
export interface ProcessImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: SaveFormat;
}

/**
 * Processes an image from a URI, optionally resizing and compressing it
 * @param uri URI of the image to process
 * @param options Processing options
 * @returns Promise resolving to the processed image as an ArrayBuffer
 */
export async function processImage(
  uri: string, 
  options: ProcessImageOptions = {}
): Promise<ArrayBuffer> {
  try {
    // Get file info
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) {
      throw new Error('File does not exist');
    }

    // Check file size
    if (fileInfo.size && fileInfo.size > MAX_PROFILE_IMAGE_SIZE) {
      throw createError(ImageErrors.IMAGE_TOO_LARGE, {
        message: `Image size exceeds maximum allowed size of ${MAX_PROFILE_IMAGE_SIZE} bytes`
      });
    }

    // Process the image
    const {
      maxWidth = 1024,
      maxHeight = 1024,
      quality = 0.8,
      format = SaveFormat.JPEG
    } = options;

    // Handle file:// protocol in URI
    const processUri = uri.startsWith('file://') ? uri : `file://${uri}`;

    const result = await manipulateAsync(
      processUri,
      [{ resize: { width: maxWidth, height: maxHeight } }],
      { compress: quality, format }
    );

    // Read the processed file
    const processedData = await FileSystem.readAsStringAsync(result.uri, {
      encoding: FileSystem.EncodingType.Base64
    });

    // Convert base64 to ArrayBuffer
    return Uint8Array.from(atob(processedData), c => c.charCodeAt(0)).buffer;
  } catch (error) {
    if ((error as any).type === ImageErrors.IMAGE_TOO_LARGE) {
      throw error;
    }
    throw createError(ImageErrors.PROCESSING_ERROR, {
      message: 'Failed to process image',
      cause: error instanceof Error ? error : new Error(String(error))
    });
  }
}

/**
 * Creates a data URL from an ArrayBuffer
 * @param buffer The image data as an ArrayBuffer
 * @param mimeType The MIME type of the image
 * @returns A data URL string
 */
export function createImageDataUrl(buffer: ArrayBuffer, mimeType: string): string {
  const base64 = btoa(
    new Uint8Array(buffer)
      .reduce((data, byte) => data + String.fromCharCode(byte), '')
  );
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Validates an image file
 * @param uri URI of the image to validate
 * @returns Promise resolving to true if valid, throws error if invalid
 */
export async function validateImage(uri: string): Promise<true> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) {
      throw new Error('File does not exist');
    }

    if (fileInfo.size && fileInfo.size > MAX_PROFILE_IMAGE_SIZE) {
      throw createError(ImageErrors.IMAGE_TOO_LARGE, {
        message: `Image size exceeds maximum allowed size of ${MAX_PROFILE_IMAGE_SIZE} bytes`
      });
    }

    return true;
  } catch (error) {
    if ((error as any).type === ImageErrors.IMAGE_TOO_LARGE) {
      throw error;
    }
    throw createError(ImageErrors.FILE_SYSTEM_ERROR, {
      message: 'Failed to validate image',
      cause: error instanceof Error ? error : new Error(String(error))
    });
  }
}

/**
 * Draws bounding boxes on a canvas for face predictions
 */
export function drawBoundingBoxes(canvas: HTMLCanvasElement, predictions: FacePrediction[]): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Style for the boxes
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;
  ctx.fillStyle = 'rgba(0, 255, 0, 0.2)';

  predictions.forEach(pred => {
    const width = pred.bottomRight[0] - pred.topLeft[0];
    const height = pred.bottomRight[1] - pred.topLeft[1];

    // Draw filled rectangle with transparency
    ctx.fillRect(pred.topLeft[0], pred.topLeft[1], width, height);

    // Draw border
    ctx.strokeRect(pred.topLeft[0], pred.topLeft[1], width, height);

    // Draw confidence score
    ctx.fillStyle = '#00ff00';
    ctx.font = '16px Arial';
    ctx.fillText(
      `${Math.round(pred.probability * 100)}%`,
      pred.topLeft[0],
      pred.topLeft[1] > 20 ? pred.topLeft[1] - 5 : pred.topLeft[1] + 20
    );
  });
}

/**
 * Creates an ImageBitmap from a blob
 */
export async function createImageBitmapFromBlob(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

/**
 * Creates a canvas element and returns its context
 */
export function createCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | null;
} {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return {
    canvas,
    ctx: canvas.getContext('2d'),
  };
}

/**
 * Converts a canvas to a blob
 */
export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to blob'));
        }
      },
      type,
      quality
    );
  });
}

export default {
    MAX_PROFILE_IMAGE_SIZE,
    SUPPORTED_IMAGE_TYPES,
    ImageErrors,
    processImage,
    createImageDataUrl,
    validateImage,
    drawBoundingBoxes,
    createImageBitmapFromBlob,
    createCanvas,
    canvasToBlob,
};