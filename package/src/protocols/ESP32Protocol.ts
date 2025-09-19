/**
 * ESP32 Protocol Implementation
 * 
 * Protocol definitions and utilities for ESP32 BLE communication
 */

export class ESP32Protocol {
  private static readonly MAX_DATA_SIZE = 512;
  private static readonly CHUNK_SIZE = 20; // BLE MTU limitation

  /**
   * Encode data for transmission to ESP32
   */
  static encodeData(data: string | object): string {
    const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
    return Buffer.from(jsonString, 'utf8').toString('base64');
  }

  /**
   * Decode data received from ESP32
   */
  static decodeData(base64Data: string): any {
    try {
      const jsonString = Buffer.from(base64Data, 'base64').toString('utf8');
      return JSON.parse(jsonString);
    } catch (error) {
      // If not JSON, return as string
      return Buffer.from(base64Data, 'base64').toString('utf8');
    }
  }

  /**
   * Split large data into chunks for BLE transmission
   */
  static chunkData(data: string): string[] {
    const chunks: string[] = [];
    const base64Data = this.encodeData(data);
    
    for (let i = 0; i < base64Data.length; i += this.CHUNK_SIZE) {
      chunks.push(base64Data.slice(i, i + this.CHUNK_SIZE));
    }
    
    return chunks;
  }

  /**
   * Validate ESP32 response
   */
  static validateResponse(response: any): boolean {
    if (!response || typeof response !== 'object') {
      return false;
    }

    // Check for common ESP32 response structure
    return response.hasOwnProperty('status') || 
           response.hasOwnProperty('result') ||
           response.hasOwnProperty('error');
  }

  /**
   * Create command packet for ESP32
   */
  static createCommand(command: string, params?: any): string {
    const packet = {
      command,
      params: params || {},
      timestamp: Date.now()
    };

    return this.encodeData(packet);
  }

  /**
   * Parse ESP32 status response
   */
  static parseStatusResponse(data: string): {
    connected: boolean;
    ssid: string;
    ipAddress: string;
    signalStrength: number;
    lastError: string | null;
  } {
    const decoded = this.decodeData(data);
    
    return {
      connected: decoded.connected || false,
      ssid: decoded.ssid || '',
      ipAddress: decoded.ipAddress || '',
      signalStrength: decoded.signalStrength || -999,
      lastError: decoded.lastError || null
    };
  }

  /**
   * Parse ESP32 device info response
   */
  static parseDeviceInfoResponse(data: string): {
    chipId: string;
    macAddress: string;
    firmwareVersion: string;
    freeHeap: number;
    flashSize: number;
    features: string[];
  } {
    const decoded = this.decodeData(data);
    
    return {
      chipId: decoded.chipId || 'unknown',
      macAddress: decoded.macAddress || 'unknown',
      firmwareVersion: decoded.firmwareVersion || 'unknown',
      freeHeap: decoded.freeHeap || 0,
      flashSize: decoded.flashSize || 0,
      features: decoded.features || []
    };
  }

  /**
   * Create WiFi configuration packet
   */
  static createWiFiConfig(ssid: string, password: string, options?: {
    staticIP?: string;
    gateway?: string;
    subnet?: string;
    dns1?: string;
    dns2?: string;
  }): {
    ssidPacket: string;
    passwordPacket: string;
    configPacket?: string;
  } {
    return {
      ssidPacket: this.encodeData(ssid),
      passwordPacket: this.encodeData(password),
      configPacket: options ? this.encodeData(options) : undefined
    };
  }
}