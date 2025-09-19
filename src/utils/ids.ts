/**
 * Utility functions for handling various ID types in the application
 */

import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';

/**
 * Safely converts various ID types to string representation
 * 
 * @param id - The ID to convert (can be string, SHA256IdHash, or other object with toString)
 * @returns The string representation of the ID, or empty string if conversion fails
 * @throws Error if the ID cannot be converted to a valid string
 */
export function toStringId(id: string | SHA256IdHash<any> | any): string {
  // Already a string
  if (typeof id === 'string') {
    return id;
  }
  
  // Handle SHA256IdHash or other objects with proper toString
  if (id && typeof id === 'object' && typeof id.toString === 'function') {
    const str = id.toString();
    
    // Validate that we got a proper hex string, not "[object Object]"
    if (str && str !== '[object Object]') {
      // Check if it looks like a valid ID (hex string or other valid format)
      if (/^[a-fA-F0-9]+$/.test(str) || str.includes('-') || str.length > 10) {
        return str;
      }
    }
  }
  
  // Handle Buffer-like objects (for Node.js compatibility)
  if (id && typeof id === 'object' && id.buffer instanceof ArrayBuffer) {
    return Buffer.from(id).toString('hex');
  }
  
  // Log error and return empty string
  console.error('[toStringId] Unable to convert ID to string:', {
    type: typeof id,
    value: id,
    toString: id?.toString?.(),
    constructor: id?.constructor?.name
  });
  
  return '';
}

/**
 * Safely converts various ID types to string representation with validation
 * Throws an error if conversion fails
 * 
 * @param id - The ID to convert
 * @param context - Context string for error messages (e.g., 'deviceId', 'personId')
 * @returns The string representation of the ID
 * @throws Error if the ID cannot be converted to a valid string
 */
export function requireStringId(id: string | SHA256IdHash<any> | any, context: string = 'ID'): string {
  const result = toStringId(id);
  
  if (!result) {
    throw new Error(`Invalid ${context}: Unable to convert to string. Got ${typeof id}: ${id}`);
  }
  
  return result;
}

/**
 * Checks if a value is a valid SHA256 hash string
 * 
 * @param value - The value to check
 * @returns true if the value is a valid 64-character hex string
 */
export function isValidSHA256String(value: string): boolean {
  return typeof value === 'string' && /^[a-fA-F0-9]{64}$/.test(value);
}

/**
 * Checks if a value is a valid device ID
 * Device IDs can be SHA256 hashes or prefixed IDs like "esp32-xxxxx"
 * 
 * @param value - The value to check
 * @returns true if the value is a valid device ID
 */
export function isValidDeviceId(value: string): boolean {
  if (typeof value !== 'string' || !value) {
    return false;
  }
  
  // Check for SHA256 hash
  if (isValidSHA256String(value)) {
    return true;
  }
  
  // Check for prefixed device IDs (e.g., "esp32-5c013b678d30")
  if (/^[a-zA-Z0-9]+-[a-fA-F0-9]+$/.test(value)) {
    return true;
  }
  
  return false;
}

/**
 * Formats a device ID for display
 * Shows first and last 8 characters for long IDs
 * 
 * @param id - The device ID to format
 * @returns Formatted device ID for display
 */
export function formatDeviceId(id: string): string {
  if (!id) return '<no-id>';
  
  if (id.length > 20) {
    return `${id.substring(0, 8)}...${id.substring(id.length - 8)}`;
  }
  
  return id;
}