/**
 * BLE Utility Functions
 * 
 * Common utilities for BLE operations
 */

import { Device } from 'react-native-ble-plx';

export class BLEUtils {
  /**
   * Convert string to base64 for BLE transmission
   */
  static stringToBase64(str: string): string {
    return Buffer.from(str, 'utf8').toString('base64');
  }

  /**
   * Convert base64 to string from BLE reception
   */
  static base64ToString(base64: string): string {
    return Buffer.from(base64, 'base64').toString('utf8');
  }

  /**
   * Convert hex string to base64
   */
  static hexToBase64(hex: string): string {
    return Buffer.from(hex, 'hex').toString('base64');
  }

  /**
   * Convert base64 to hex string
   */
  static base64ToHex(base64: string): string {
    return Buffer.from(base64, 'base64').toString('hex');
  }

  /**
   * Convert buffer to base64
   */
  static bufferToBase64(buffer: Buffer): string {
    return buffer.toString('base64');
  }

  /**
   * Convert base64 to buffer
   */
  static base64ToBuffer(base64: string): Buffer {
    return Buffer.from(base64, 'base64');
  }

  /**
   * Parse JSON from base64 encoded data
   */
  static parseJsonFromBase64(base64: string): any {
    try {
      const jsonString = this.base64ToString(base64);
      return JSON.parse(jsonString);
    } catch (error) {
      throw new Error('Failed to parse JSON from base64 data');
    }
  }

  /**
   * Convert object to base64 encoded JSON
   */
  static objectToBase64Json(obj: any): string {
    try {
      const jsonString = JSON.stringify(obj);
      return this.stringToBase64(jsonString);
    } catch (error) {
      throw new Error('Failed to convert object to base64 JSON');
    }
  }

  /**
   * Get device display name
   */
  static getDeviceDisplayName(device: Device): string {
    return device.name || device.localName || `Unknown Device (${device.id.slice(0, 8)})`;
  }

  /**
   * Get signal strength description
   */
  static getSignalStrengthDescription(rssi: number): string {
    if (rssi >= -30) return 'Excellent';
    if (rssi >= -50) return 'Very Good';
    if (rssi >= -70) return 'Good';
    if (rssi >= -85) return 'Fair';
    return 'Poor';
  }

  /**
   * Normalize UUID to standard format
   */
  static normalizeUUID(uuid: string): string {
    // Remove dashes and convert to uppercase
    const cleaned = uuid.replace(/-/g, '').toUpperCase();
    
    // Add dashes in standard positions for full UUIDs
    if (cleaned.length === 32) {
      return `${cleaned.slice(0, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(12, 16)}-${cleaned.slice(16, 20)}-${cleaned.slice(20)}`;
    }
    
    // Return as-is for short UUIDs
    return cleaned;
  }

  /**
   * Check if two UUIDs are equal (case insensitive)
   */
  static uuidsEqual(uuid1: string, uuid2: string): boolean {
    return this.normalizeUUID(uuid1) === this.normalizeUUID(uuid2);
  }

  /**
   * Generate a simple checksum for data validation
   */
  static calculateChecksum(data: Buffer): number {
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    return sum & 0xFF;
  }

  /**
   * Validate BLE device compatibility
   */
  static isDeviceCompatible(device: Device, requiredServices?: string[]): boolean {
    // Check if device has a name (indicates it's advertising properly)
    if (!device.name && !device.localName) {
      return false;
    }

    // Check required services if specified
    if (requiredServices && requiredServices.length > 0) {
      const deviceServices = device.serviceUUIDs || [];
      return requiredServices.some(requiredService =>
        deviceServices.some(deviceService =>
          this.uuidsEqual(requiredService, deviceService)
        )
      );
    }

    return true;
  }

  /**
   * Format MAC address
   */
  static formatMacAddress(mac: string): string {
    // Remove any existing separators
    const cleaned = mac.replace(/[:-]/g, '');
    
    // Add colons every 2 characters
    return cleaned.match(/.{2}/g)?.join(':').toUpperCase() || mac;
  }

  /**
   * Create a delay promise
   */
  static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry a BLE operation with exponential backoff
   */
  static async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) {
          throw lastError;
        }

        // Exponential backoff: baseDelay * 2^attempt
        const delay = baseDelay * Math.pow(2, attempt);
        await this.delay(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Validate BLE characteristic value
   */
  static validateCharacteristicValue(value: string | null | undefined): boolean {
    if (!value) return false;
    
    try {
      // Try to decode as base64
      Buffer.from(value, 'base64');
      return true;
    } catch {
      return false;
    }
  }
}