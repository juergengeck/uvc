/**
 * Microdata Helper Utilities
 *
 * Wrapper functions for ONE.core microdata conversion.
 * These helpers:
 * - Provide type-safe conversion between JS objects and microdata strings
 * - Handle errors gracefully with detailed logging
 * - Support device control objects (commands, responses, credentials)
 *
 * Usage:
 * ```typescript
 * // Convert object to microdata
 * const command = { $type$: 'LEDControlCommand', deviceId: 'esp32-001', ... };
 * const microdata = convertToMicrodata(command);
 *
 * // Parse microdata back to object
 * const receivedObj = parseFromMicrodata<LEDControlCommand>(microdataString);
 * ```
 */

import { convertObjToMicrodata } from '@refinio/one.core/lib/object-to-microdata.js';
import { convertMicrodataToObject } from '@refinio/one.core/lib/microdata-to-object.js';
import { createCryptoHash } from '@refinio/one.core/lib/system/crypto-helpers.js';
import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';

/**
 * Convert a ONE object to microdata string
 *
 * @param obj - Object with $type$ property
 * @returns Microdata string representation
 * @throws Error if object is invalid or conversion fails
 *
 * @example
 * ```typescript
 * const command: LEDControlCommand = {
 *   $type$: 'LEDControlCommand',
 *   deviceId: 'esp32-001',
 *   action: 'set_state',
 *   state: 'on',
 *   timestamp: Date.now()
 * };
 *
 * const microdata = convertToMicrodata(command);
 * // Returns: <div itemscope itemtype="//refin.io/LEDControlCommand">...
 * ```
 */
export function convertToMicrodata<T extends { $type$: string }>(obj: T): string {
  try {
    if (!obj.$type$) {
      throw new Error('Object must have $type$ property');
    }

    const microdata = convertObjToMicrodata(obj as any);

    // Validate that we got a string
    if (typeof microdata !== 'string' || microdata.length === 0) {
      throw new Error(`Invalid microdata conversion result for ${obj.$type$}`);
    }

    return microdata;
  } catch (error) {
    console.error('[MicrodataHelpers] Failed to convert object to microdata:', error);
    console.error('[MicrodataHelpers] Object:', JSON.stringify(obj, null, 2));
    throw new Error(`Microdata conversion failed: ${error.message}`);
  }
}

/**
 * Parse microdata string back to ONE object
 *
 * @param microdata - HTML microdata string
 * @param expectedType - Optional expected type for validation
 * @returns Parsed ONE object
 * @throws Error if parsing fails or type mismatch
 *
 * @example
 * ```typescript
 * const microdata = '<div itemscope itemtype="//refin.io/LEDStatusResponse">...';
 * const response = parseFromMicrodata<LEDStatusResponse>(microdata);
 *
 * console.log(response.$type$); // 'LEDStatusResponse'
 * console.log(response.state);  // 'on' or 'off'
 * ```
 */
export function parseFromMicrodata<T extends { $type$: string }>(
  microdata: string,
  expectedType?: string
): T {
  try {
    if (!microdata || typeof microdata !== 'string') {
      throw new Error('Microdata must be a non-empty string');
    }

    // Parse microdata to object
    const obj = convertMicrodataToObject(microdata) as T;

    // Validate result
    if (!obj || !obj.$type$) {
      throw new Error('Parsed object missing $type$ property');
    }

    // Optional type validation
    if (expectedType && obj.$type$ !== expectedType) {
      throw new Error(`Type mismatch: expected ${expectedType}, got ${obj.$type$}`);
    }

    return obj;
  } catch (error) {
    console.error('[MicrodataHelpers] Failed to parse microdata:', error);
    console.error('[MicrodataHelpers] Microdata preview:', microdata.substring(0, 200));
    throw new Error(`Microdata parsing failed: ${error.message}`);
  }
}

/**
 * Calculate SHA-256 hash of microdata string
 *
 * This is the content-addressable hash that uniquely identifies the object.
 *
 * @param microdata - HTML microdata string
 * @returns SHA-256 hash of the microdata
 *
 * @example
 * ```typescript
 * const microdata = convertToMicrodata(command);
 * const hash = await getMicrodataHash(microdata);
 * // hash can now be used to reference this command immutably
 * ```
 */
export async function getMicrodataHash<T>(microdata: string): Promise<SHA256Hash<T>> {
  try {
    return await createCryptoHash(microdata) as SHA256Hash<T>;
  } catch (error) {
    console.error('[MicrodataHelpers] Failed to compute microdata hash:', error);
    throw new Error(`Hash computation failed: ${error.message}`);
  }
}

/**
 * Convert object to microdata and compute its hash in one step
 *
 * @param obj - Object with $type$ property
 * @returns Tuple of [microdata string, hash]
 *
 * @example
 * ```typescript
 * const [microdata, hash] = await convertToMicrodataWithHash(command);
 * // Store both for efficient lookup and verification
 * ```
 */
export async function convertToMicrodataWithHash<T extends { $type$: string }>(
  obj: T
): Promise<[string, SHA256Hash<T>]> {
  const microdata = convertToMicrodata(obj);
  const hash = await getMicrodataHash<T>(microdata);
  return [microdata, hash];
}

/**
 * Verify that microdata string matches its expected hash
 *
 * @param microdata - HTML microdata string
 * @param expectedHash - Expected SHA-256 hash
 * @returns True if hash matches, false otherwise
 *
 * @example
 * ```typescript
 * const isValid = await verifyMicrodataHash(receivedMicrodata, expectedHash);
 * if (!isValid) {
 *   throw new Error('Command has been tampered with!');
 * }
 * ```
 */
export async function verifyMicrodataHash<T>(
  microdata: string,
  expectedHash: SHA256Hash<T>
): Promise<boolean> {
  try {
    const actualHash = await getMicrodataHash<T>(microdata);
    return actualHash === expectedHash;
  } catch (error) {
    console.error('[MicrodataHelpers] Hash verification failed:', error);
    return false;
  }
}

/**
 * Compact microdata to single line (removes unnecessary whitespace)
 *
 * ONE microdata should already be compact, but this ensures it for transmission.
 *
 * @param microdata - HTML microdata string
 * @returns Compacted microdata string
 */
export function compactMicrodata(microdata: string): string {
  // ONE microdata should already be on one line
  // This is mainly for safety in case pretty-printed microdata is passed
  return microdata.replace(/>\s+</g, '><').trim();
}

/**
 * Extract object type from microdata without full parsing
 *
 * Efficiently extracts the $type$ from microdata for routing/validation.
 *
 * @param microdata - HTML microdata string
 * @returns Object type name or null if not found
 *
 * @example
 * ```typescript
 * const type = extractMicrodataType(receivedData);
 * if (type === 'LEDControlCommand') {
 *   handleLEDCommand(receivedData);
 * }
 * ```
 */
export function extractMicrodataType(microdata: string): string | null {
  // Extract itemtype from <div itemscope itemtype="//refin.io/TYPE">
  const match = microdata.match(/itemtype="\/\/refin\.io\/([^"]+)"/);
  return match ? match[1] : null;
}

/**
 * Validate microdata structure without full parsing
 *
 * Quick validation check before attempting full parse.
 *
 * @param microdata - HTML microdata string
 * @returns True if structure looks valid
 */
export function isValidMicrodataStructure(microdata: string): boolean {
  if (!microdata || typeof microdata !== 'string') {
    return false;
  }

  // Check for basic microdata structure
  return (
    microdata.includes('itemscope') &&
    microdata.includes('itemtype="//refin.io/') &&
    microdata.startsWith('<div') &&
    microdata.endsWith('</div>')
  );
}

/**
 * Safe microdata parsing with fallback
 *
 * Attempts to parse microdata, returns null on failure instead of throwing.
 * Useful for handling potentially malformed data.
 *
 * @param microdata - HTML microdata string
 * @param expectedType - Optional expected type
 * @returns Parsed object or null on failure
 */
export function tryParseFromMicrodata<T extends { $type$: string }>(
  microdata: string,
  expectedType?: string
): T | null {
  try {
    return parseFromMicrodata<T>(microdata, expectedType);
  } catch (error) {
    console.warn('[MicrodataHelpers] Failed to parse microdata (non-fatal):', error.message);
    return null;
  }
}
