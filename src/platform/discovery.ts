/**
 * ESP32 Discovery Listener
 * 
 * This module sets up a UDP socket to listen for discovery packets from ESP32 devices.
 * It logs all discovery heartbeats and can be used to monitor ESP32 devices on the network.
 */

import { createSocket } from './udp';
import { EventEmitter } from 'events';
import { Buffer } from '@refinio/one.core/lib/system/expo/index.js';
import { Platform } from 'react-native';
import { UdpModel } from '../models/network/UdpModel';
import { NetworkServiceType } from '../models/network/interfaces';
import Debug from 'debug';

// Primary discovery port that ESP32 devices use
const ESP32_DISCOVERY_PORT = 49497;

/**
 * Discovery event data
 */
export interface DiscoveryEvent {
  deviceId: string;
  address: string;
  port: number;
  data: any;
  timestamp: number;
  raw: any;
}

/**
 * ESP32 Discovery Listener
 * Listens for discovery packets from ESP32 devices
 */
export class ESP32DiscoveryListener extends EventEmitter {
  private socket: any = null;
  private devices: Map<string, DiscoveryEvent> = new Map();
  private isListening: boolean = false;
  private debug: boolean;
  
  /**
   * Create a new discovery listener
   * @param options Options for the discovery listener
   */
  constructor(options: { debug?: boolean } = {}) {
    super();
    this.debug = options.debug !== undefined ? options.debug : true;
    
    if (this.debug) {
      console.log('ESP32DiscoveryListener: Created');
    }
  }
  
  /**
   * Start listening for discovery packets
   */
  public start(): Promise<void> {
    if (this.isListening) {
      return Promise.resolve();
    }
    
    console.log(`ESP32DiscoveryListener: Starting to listen on port ${ESP32_DISCOVERY_PORT}`);
    
    return this.listenOnPort()
      .then(() => {
        this.isListening = true;
        console.log(`ESP32DiscoveryListener: Listening on port ${ESP32_DISCOVERY_PORT}`);
      })
      .catch(error => {
        console.error(`ESP32DiscoveryListener: CRITICAL - Failed to listen on port ${ESP32_DISCOVERY_PORT}:`, error);
        throw error;
      });
  }
  
  /**
   * Stop listening for discovery packets
   */
  public stop(): Promise<void> {
    if (!this.isListening) {
      return Promise.resolve();
    }
    
    if (this.debug) {
      console.log('ESP32DiscoveryListener: Stopping');
    }
    
    if (this.socket) {
      return this.socket.close()
        .catch((err: Error) => {
          console.error('Error closing socket:', err);
        })
        .finally(() => {
          this.socket = null;
          this.isListening = false;
          console.log('ESP32DiscoveryListener: Stopped');
        });
    }
    
    return Promise.resolve();
  }
  
  /**
   * Get all discovered devices
   */
  public getDevices(): Map<string, DiscoveryEvent> {
    return this.devices;
  }
  
  /**
   * Listen on the ESP32 discovery port
   */
  private listenOnPort(): Promise<void> {
    let localSocket: any = null; // Keep a local reference for logging within this scope
    console.log(`ESP32DiscoveryListener: Creating socket for port ${ESP32_DISCOVERY_PORT}`);
    
    // Create a UDP socket with special configuration for iOS
    return createSocket({ 
      type: 'udp4', 
      debug: true,
      reuseAddr: true,
      debugLabel: `ESP32Discovery:${ESP32_DISCOVERY_PORT}` 
    }).then(socket => {
      localSocket = socket;
      const socketAddressInfo = localSocket.address(); // Get address info early for logging
      const logPrefix = `ESP32DiscoveryListener (Port ${ESP32_DISCOVERY_PORT}, Socket @ ${socketAddressInfo ? socketAddressInfo.address + ':' + socketAddressInfo.port : 'N/A'}):`;
      console.log(`${logPrefix} Socket created.`);
      
      // Store the socket
      this.socket = localSocket;
      
      // Listen for discovery packets with better logging
      localSocket.addListener('message', (message: Buffer, rinfo: { address: string, port: number }) => {
        console.log(`${logPrefix} [+] MESSAGE from ${rinfo.address}:${rinfo.port} (${message.length} bytes)`);
        
        // Log raw data for debugging in HEX 
        try {
          const previewHex = Array.from(message.slice(0, Math.min(32, message.length)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join(' ');
          console.log(`${logPrefix}     HEX: ${previewHex}`);
          
          // Also try to log as UTF-8
          const previewStr = message.toString('utf8').replace(/[\x00-\x1F\x7F-\xFF]/g, '.');
          console.log(`${logPrefix}     STR: ${previewStr.substring(0, 100)}`);
        } catch (e) {
          console.log(`${logPrefix}     Could not log packet content:`, e);
        }
        
        this.handleDiscoveryPacket(message, rinfo);
      });
      
      // Add explicit error handler
      localSocket.addListener('error', (error: Error) => {
        console.error(`${logPrefix} [-] ERROR:`, error);
      });
      
      // Add explicit close handler
      localSocket.addListener('close', () => {
        console.log(`${logPrefix} [x] CLOSE`);
        if (this.socket === localSocket) { // Check if it's the current active socket
        this.socket = null;
        this.isListening = false;
        }
      });
      
      console.log(`${logPrefix} All event listeners attached.`);
      
      // Bind to the port with improved error handling
      console.log(`${logPrefix} Binding to 0.0.0.0:${ESP32_DISCOVERY_PORT}`);
      
      return localSocket.bind(ESP32_DISCOVERY_PORT, '0.0.0.0')
        .then(() => {
          const boundAddress = localSocket.address(); // Get address after binding
          console.log(`${logPrefix} Successfully bound to ${boundAddress?.address}:${boundAddress?.port}`);
          
          // Enable broadcast reception
          console.log(`${logPrefix} Setting broadcast true`);
          return localSocket.setBroadcast(true)
            .then(() => {
              console.log(`${logPrefix} Broadcast reception enabled`);
              
              // Send a dummy broadcast packet to trigger local network permission prompt on iOS
              if (Platform.OS === 'ios') {
                console.log(`${logPrefix} Sending dummy broadcast to trigger iOS permission prompt...`);
                const dummyPacket = Buffer.from('dummy_permission_trigger');
                // Send to a common broadcast address, port doesn't matter much here
                localSocket.send(dummyPacket, '255.255.255.255', ESP32_DISCOVERY_PORT + 1) // Use a different port
                  .then(() => console.log(`${logPrefix} Dummy broadcast sent.`))
                  .catch((dummyErr: Error) => console.warn(`${logPrefix} Failed to send dummy broadcast:`, dummyErr));
              }
            })
            .catch(broadcastErr => {
              console.error(`${logPrefix} Failed to enable broadcast:`, broadcastErr);
              // Non-fatal, continue
            });
        })
        .catch(err => {
          console.error(`ESP32DiscoveryListener: FAILED to bind to port ${ESP32_DISCOVERY_PORT}:`, err);
          // Clean up the socket
          return localSocket.close()
            .catch(closeErr => {
              console.error(`ESP32DiscoveryListener: Error closing failed socket:`, closeErr);
            })
            .finally(() => {
              this.socket = null;
              throw err;
            });
        });
    }).catch(error => {
      console.error(`ESP32DiscoveryListener: Failed to create socket for port ${ESP32_DISCOVERY_PORT}:`, error);
      throw error;
    });
  }
  
  /**
   * Handle a discovery packet
   * @param message The message buffer
   * @param rinfo Remote info
   */
  private handleDiscoveryPacket(message: Buffer | any, rinfo: { address: string, port: number }): void {
    try {
      // Log the raw packet for debugging
      console.log(`ESP32DiscoveryListener: Processing packet from ${rinfo.address}:${rinfo.port}`);
      
      if (Buffer.isBuffer(message)) {
        console.log(`ESP32DiscoveryListener: RAW PACKET (hex) from ${rinfo.address}:${rinfo.port} - ${message.length} bytes: ${message.toString('hex')}`);
        try {
          const utf8String = message.toString('utf-8');
          console.log(`ESP32DiscoveryListener: RAW PACKET (utf-8 attempt) from ${rinfo.address}:${rinfo.port}: ${utf8String}`);
        } catch (e) {
          console.log(`ESP32DiscoveryListener: RAW PACKET (utf-8 attempt failed) from ${rinfo.address}:${rinfo.port}: Not a valid UTF-8 string.`);
        }
      } else {
        console.log(`ESP32DiscoveryListener: Received non-buffer message from ${rinfo.address}:${rinfo.port}:`, message);
        // If it's not a buffer, we probably can't process it further in the current logic.
        // Depending on expected non-buffer messages, you might add handling here.
        return; 
      }
      
      // Basic approach - try to parse as JSON first
      let data: any;
      let deviceId: string = `esp32-${rinfo.address}`;
      
      if (Buffer.isBuffer(message)) {
        try {
          // Check for ESP32 QuicVC protocol format: service type byte (0x01) + JSON payload
          if (message.length > 1 && message[0] === 0x01) {
            console.log('ESP32DiscoveryListener: Detected QuicVC protocol format with service type byte');
            // Remove the service type byte before parsing as JSON
            const jsonPayload = message.slice(1);
            const jsonString = jsonPayload.toString('utf8');
            data = JSON.parse(jsonString);
            console.log(`ESP32DiscoveryListener: Successfully parsed QuicVC JSON packet:`, data);
            
            if (data.deviceId) {
              deviceId = data.deviceId;
            } else if (data.mac) {
              deviceId = `esp32-${data.mac.replace(/:/g, '')}`;
            }
          } else {
            // Try to decode as standard JSON by converting buffer to string
          const jsonString = message.toString('utf8');
          data = JSON.parse(jsonString);
          console.log(`ESP32DiscoveryListener: Successfully parsed JSON packet:`, data);
          
          if (data.deviceId) {
            deviceId = data.deviceId;
          } else if (data.mac) {
            deviceId = `esp32-${data.mac.replace(/:/g, '')}`;
            }
          }
        } catch (e) {
          // Not JSON, check for binary ESP32 discovery packet format
          const headerText = 'ONECORE_DISCOVERY';
          const headerBuffer = Buffer.from(headerText);
          
          // Check if this is an ESP32 discovery packet
          let isEsp32DiscoveryPacket = false;
          if (message.length >= headerBuffer.length) {
            const headerPart = message.slice(0, headerBuffer.length);
            isEsp32DiscoveryPacket = headerPart.toString() === headerText;
          }
          
          if (isEsp32DiscoveryPacket) {
            // Extract the MAC address from the binary packet
            // Format is "ONECORE_DISCOVERY" + version byte (1) + MAC address (6 bytes)
            const headerSize = headerBuffer.length + 1; // Header + version
            if (message.length >= headerSize + 6) {
              const macBytes = message.slice(headerSize, headerSize + 6);
              const macString = Array.from(macBytes)
                .map(b => b.toString(16).padStart(2, '0'))
                .join(':');
              
              deviceId = `esp32-${macString.replace(/:/g, '')}`;
              data = { 
                mac: macString,
                type: 'ESP32',
                format: 'binary' 
              };
              console.log(`ESP32DiscoveryListener: Detected binary discovery packet with MAC: ${macString}`);
            } else {
              data = { 
                raw: this.bufferToHex(message),
                stringPreview: this.safeBufferToString(message),
                format: 'binary'
              };
            }
          } else {
            // Not a JSON or known binary format, treat as raw data
            console.log(`ESP32DiscoveryListener: Not a known packet format, treating as raw data`);
            data = { 
              raw: this.bufferToHex(message),
              stringPreview: this.safeBufferToString(message)
            };
          }
        }
      } else if (typeof message === 'string') {
        try {
          data = JSON.parse(message);
        } catch (e) {
          data = { raw: message };
        }
      } else {
        data = { unknown: true };
      }
      
      // Create discovery event
      const event: DiscoveryEvent = {
        deviceId,
        address: rinfo.address,
        port: rinfo.port,
        data,
        timestamp: Date.now(),
        raw: message
      };
      
      // Store the device
      this.devices.set(deviceId, event);
      
      // Emit discovery event
      this.emit('discovery', event);
      
      console.log(`🔍 ESP32 DISCOVERY: Device ${deviceId} at ${rinfo.address}:${rinfo.port}`);
    } catch (err) {
      console.error('Error handling discovery packet:', err);
    }
  }
  
  /**
   * Safely convert buffer to string with error handling
   */
  private safeBufferToString(buffer: Buffer): string {
    try {
      // Try UTF-8 first
      return buffer.toString('utf8');
    } catch (e) {
      try {
        // Fall back to hex representation
        return buffer.toString('hex');
      } catch (e2) {
        return 'Unable to convert buffer to string';
      }
    }
  }
  
  /**
   * Convert a buffer to hex string for logging
   * @param buffer The buffer to convert
   */
  private bufferToHex(buffer: any): string {
    if (typeof buffer === 'string') {
      // Convert string to array of char codes
      return Array.from(buffer)
        .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(' ');
    }
    
    if (buffer.buffer || Array.isArray(buffer)) {
      // Convert array or buffer to hex
      return Array.from(buffer)
        .map((b: any) => (typeof b === 'number' ? b : b.charCodeAt(0)).toString(16).padStart(2, '0'))
        .join(' ');
    }
    
    return String(buffer);
  }
  
  /**
   * Send a discovery packet to a specific IP address
   * This can be used to test if an ESP32 device is responding to discovery
   * 
   * @param address The IP address to send to
   * @param port The port to send to (defaults to 49497, the ESP32 discovery port)
   * @returns Promise that resolves when the packet is sent
   */
  public async sendDiscoveryPacket(address: string, port: number = 49497): Promise<void> {
    if (!this.isListening || !this.socket) {
      throw new Error('Discovery listener is not running. Call start() first.');
    }
    
    if (this.debug) {
      console.log(`ESP32DiscoveryListener: Sending discovery packet to ${address}:${port}`);
    }
    
    // Create a discovery packet in the format the ESP32 expects
    // Format: "ONECORE_DISCOVERY" + version byte (1) + MAC address (6 bytes)
    const header = Buffer.from('ONECORE_DISCOVERY');
    const version = Buffer.from([1]);
    
    // Use a dummy MAC address (all zeros)
    const mac = Buffer.from([0, 0, 0, 0, 0, 0]);
    
    // Combine the buffers
    const packet = Buffer.concat([header, version, mac]);
    
    // Send the packet with correct parameter order: (message, host, port)
    return new Promise<void>((resolve, reject) => {
      this.socket.send(packet, address, port)
        .then(() => {
          if (this.debug) {
            console.log(`ESP32DiscoveryListener: Discovery packet sent to ${address}:${port}`);
          }
          resolve();
        })
        .catch((err: Error) => {
          console.error(`ESP32DiscoveryListener: Failed to send discovery packet:`, err);
          reject(err);
        });
    });
  }
  
  /**
   * Send a JSON discovery packet to a specific IP address
   * This matches the second format that ESP32 sends
   * 
   * @param address The IP address to send to
   * @param port The port to send to (defaults to 49497, the ESP32 discovery port)
   * @returns Promise that resolves when the packet is sent
   */
  public async sendJsonDiscoveryPacket(address: string, port: number = 49497): Promise<void> {
    if (!this.isListening || !this.socket) {
      throw new Error('Discovery listener is not running. Call start() first.');
    }
    
    if (this.debug) {
      console.log(`ESP32DiscoveryListener: Sending JSON discovery packet to ${address}:${port}`);
    }
    
    // Create a JSON discovery packet similar to what the ESP32 sends
    const jsonData = {
      type: "discovery_request",
      deviceId: 'mobile-client',
      deviceName: 'Mobile Client',
      deviceType: 'Mobile',
      version: '1.0.0',
      timestamp: Date.now(),
      capabilities: ['discovery', 'control']
    };
    
    const jsonStr = JSON.stringify(jsonData);
    
    // Format: [Service Type Byte (0x01)] + [JSON Payload]
    // The first byte 0x01 indicates this is a discovery service packet
    const serviceTypeByte = Buffer.from([0x01]);
    const jsonBuffer = Buffer.from(jsonStr);
    const packet = Buffer.concat([serviceTypeByte, jsonBuffer]);
    
    console.log(`ESP32DiscoveryListener: Sending formatted discovery packet to ${address}:${port}`, jsonData);
    
    // Send the packet with correct parameter order: (message, host, port)
    return new Promise<void>((resolve, reject) => {
      this.socket.send(packet, address, port)
        .then(() => {
          if (this.debug) {
            console.log(`ESP32DiscoveryListener: JSON discovery packet sent to ${address}:${port}`);
          }
          resolve();
        })
        .catch((err: Error) => {
          console.error(`ESP32DiscoveryListener: Failed to send JSON discovery packet:`, err);
          reject(err);
        });
    });
  }
  
  /**
   * Broadcast a discovery packet to the entire network or send unicast to a specific IP
   * 
   * @param targetIp Optional IP address for unicast send. If omitted, broadcasts to 255.255.255.255.
   * @returns Promise that resolves when the packet is sent
   */
  public async broadcastDiscovery(targetIp?: string): Promise<void> {
    if (!this.isListening || !this.socket) {
      throw new Error('Discovery listener is not running. Call start() first.');
    }
    
    const destination = targetIp || '255.255.255.255';
    const isBroadcast = !targetIp;
    
    console.log(`ESP32DiscoveryListener: Sending discovery packet to ${destination}`);
    
    if (isBroadcast) {
      // Make sure broadcast is enabled 
      await this.socket.setBroadcast(true)
        .catch((err: Error) => {
          console.warn('ESP32DiscoveryListener: Could not enable broadcast mode:', err);
          // Continue anyway
        });
    } else {
       // Disable broadcast for unicast (might not be strictly necessary, but cleaner)
       await this.socket.setBroadcast(false)
        .catch((err: Error) => {
          console.warn('ESP32DiscoveryListener: Could not disable broadcast mode for unicast:', err);
        });
    }
    
    // Send to broadcast or specific address 
    return this.sendJsonDiscoveryPacket(destination, ESP32_DISCOVERY_PORT)
      .then(() => {
        console.log(`ESP32DiscoveryListener: Discovery packet sent successfully to ${destination}`);
      })
      .catch((err: Error) => {
        console.error(`ESP32DiscoveryListener: Failed to send discovery packet to ${destination}:`, err);
        throw err;
    });
  }
}

// Export a singleton instance for easy use
export const discoveryListener = new ESP32DiscoveryListener();

// Auto-start the listener when imported
discoveryListener.start().catch(err => {
  console.error('Failed to start discovery listener:', err);
}); 