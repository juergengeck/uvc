/**
 * QuicTransport - Local implementation using UdpModel
 * 
 * This provides a simplified transport layer that adapts the local UdpModel
 * to work with the QuicModel interface, avoiding one.core native module dependencies.
 */

import { UdpModel, UdpSocket, UdpRemoteInfo } from '../UdpModel';
import type { IQuicTransport, QuicTransportOptions, TransportStats } from '../interfaces';
import Debug from 'debug';

const debug = Debug('one:quic:transport');

// Simple EventEmitter for React Native compatibility
class EventEmitter {
  private listeners: Map<string, Function[]> = new Map();
  
  emit(event: string, ...args: any[]): boolean {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => listener(...args));
      return true;
    }
    return false;
  }
  
  on(event: string, listener: Function): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
    return this;
  }
  
  removeListener(event: string, listener: Function): this {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
    return this;
  }
  
  removeAllListeners(event?: string): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }
}

export class UdpServiceTransport extends EventEmitter implements IQuicTransport {
  private udpModel: UdpModel;
  private socket: UdpSocket | null = null;
  private services: Map<number, Function> = new Map();
  private _initialized = false;
  private options?: QuicTransportOptions;

  private _stats: TransportStats = {
    packetsReceived: 0,
    packetsSent: 0,
    bytesReceived: 0,
    bytesSent: 0,
    errors: 0
  };

  constructor(options?: QuicTransportOptions) {
    super();
    this.options = options;
    this.udpModel = UdpModel.getInstance();
    debug('QuicTransport created with options:', options);
  }

  async init(options?: QuicTransportOptions): Promise<void> {
    if (this._initialized && this.socket) {
      // Validate that the socket is still valid (native module might have been reset)
      try {
        // Try to get the socket address to verify it's still valid
        const addr = this.socket.address();
        if (addr) {
          debug('QuicTransport already initialized with valid socket');
          console.log(`[UdpServiceTransport] Already initialized on port ${addr.port}, skipping init`);
          return;
        }
      } catch (error) {
        console.warn(`[UdpServiceTransport] Socket validation failed - native module may have been reset:`, error);
        console.log(`[UdpServiceTransport] Closing invalid socket and reinitializing...`);

        // Socket is invalid, close it and reinitialize
        try {
          await this.socket.close();
        } catch (closeError) {
          // Ignore close errors on invalid socket
        }
        this.socket = null;
        this._initialized = false;
      }
    }

    // If marked as initialized but no socket, we need to reinitialize
    if (this._initialized && !this.socket) {
      console.log(`[UdpServiceTransport] Transport marked as initialized but socket is null - reinitializing`);
      this._initialized = false;
    }

    try {
      // Merge options
      this.options = { ...this.options, ...options };
      
      // Initialize UDP model first
      if (!this.udpModel.isInitialized()) {
        debug('Initializing UdpModel...');
        await this.udpModel.init();
      }

      // Create UDP socket
      debug('Creating UDP socket...');
      this.socket = await this.udpModel.createSocket({
        type: 'udp4',
        debugLabel: 'QuicTransport',
        broadcast: false,  // Don't enable broadcast by default
        reuseAddr: true,  // Allow multiple processes to bind to same port
        reusePort: true   // Allow multiple processes to share the port (macOS requirement)
      });

      // Set up message handler
      this.socket.on('message', (data: Buffer, rinfo: UdpRemoteInfo) => {
        this.handleMessage(data, rinfo);
      });

      // Bind to port if specified
      if (this.options?.port) {
        debug(`Binding to port ${this.options.port}...`);
        console.log(`[UdpServiceTransport] Binding UDP socket to ${this.options.host || '0.0.0.0'}:${this.options.port}`);
        await this.socket.bind(this.options.port, this.options.host || '0.0.0.0');
        console.log(`[UdpServiceTransport] ✅ Socket bound successfully to port ${this.options.port}`);
        
        // Enable broadcast mode after binding for discovery
        debug('Enabling broadcast mode...');
        await this.socket.setBroadcast(true);
        console.log(`[UdpServiceTransport] ✅ Broadcast mode enabled`);
      }

      this._initialized = true;
      debug('QuicTransport initialized successfully');
      console.log('[UdpServiceTransport] Initialization complete, emitting ready event');
      this.emit('ready');
      console.log('[UdpServiceTransport] Ready event emitted');

    } catch (error) {
      debug('QuicTransport initialization failed:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Alias for init() method to maintain compatibility with QuicModel expectations
   * ExpoQuicTransport from one.core uses listen() instead of init()
   */
  async listen(options?: QuicTransportOptions): Promise<void> {
    return this.init(options);
  }

  private handleMessage(data: Buffer, rinfo: UdpRemoteInfo): void {
    try {
      this.stats.packetsReceived++;
      this.stats.bytesReceived += data.length;

      // Log all received packets for debugging
      const isOwnAddress = rinfo.address === '192.168.178.102' || rinfo.address === '127.0.0.1';
      
      // Log ALL packets from local network for debugging
      if (rinfo.address.startsWith('192.168.178.')) {
        const firstByte = data.length > 0 ? data[0] : -1;
        // console.log(`[UdpServiceTransport] 📡 UDP packet from ${rinfo.address}:${rinfo.port}, size: ${data.length}, first byte: 0x${firstByte.toString(16)}`);
      }
      

      // Check if message has service type byte prefix
      if (data.length > 0) {
        const firstByte = data[0];
        
        // Log packets from ESP32 subnet for debugging
        if (rinfo.address.startsWith('192.168.178.')) {
          // console.log(`[UdpServiceTransport] Packet from ${rinfo.address}:${rinfo.port}, size: ${data.length}, first byte: 0x${firstByte.toString(16).padStart(2, '0')}, lower 2 bits: ${firstByte & 0x03}`);
        }
        
        // Check if this is a QUICVC packet (bit 7 = 1 indicates long header)
        const isLongHeader = (firstByte & 0x80) !== 0;

        // For long header packets, check packet type in lower 2 bits (QUIC spec)
        // For short header packets (bit 7 = 0), we don't support them yet
        if (isLongHeader && data.length > 20) {
          // Packet type is in bits 0-1, NOT bits 4-5 (QUIC spec RFC 9000)
          const packetType = firstByte & 0x03;
          const packetTypeName = packetType === 0x00 ? 'INITIAL' :
                                 packetType === 0x01 ? 'HANDSHAKE' :
                                 packetType === 0x02 ? 'PROTECTED' : 'RETRY';
          console.log(`[UdpServiceTransport] Detected QUICVC ${packetTypeName} packet from ${rinfo.address}:${rinfo.port}`);
          debug(`Received QUICVC packet from ${rinfo.address}:${rinfo.port}`);
          this.emit('message', data, rinfo);
          return;
        }
        
        const serviceType = firstByte;
        
        // Special logging for VC packets
        if (serviceType === 7) {
          console.log(`[UdpServiceTransport] *** VC RESPONSE RECEIVED (type 7) from ${rinfo.address}:${rinfo.port}`);
          const vcData = data.slice(1);
          try {
            const vcText = new TextDecoder().decode(vcData);
            console.log(`[UdpServiceTransport] VC response content:`, vcText.substring(0, 200));
          } catch (e) {
            console.log(`[UdpServiceTransport] Could not decode VC response as text`);
          }
        }
        
        // Check if this looks like a service-prefixed message
        if (serviceType >= 0 && serviceType <= 255 && this.services.has(serviceType)) {
          debug(`Received service message type ${serviceType} from ${rinfo.address}:${rinfo.port}`);
          // console.log(`[UdpServiceTransport] Routing to service handler for type ${serviceType}`);
          
          // Strip the service byte and pass only the payload to handler
          const payload = data.slice(1);
          const handler = this.services.get(serviceType);
          if (handler) {
            // console.log(`[UdpServiceTransport] Calling handler for service type ${serviceType}`);
            try {
              const result = handler(payload, rinfo);
              if (result && typeof result.catch === 'function') {
                result.catch((err: any) => {
                  console.error(`[UdpServiceTransport] Handler for service type ${serviceType} threw error:`, err);
                });
              }
            } catch (syncError) {
              console.error(`[UdpServiceTransport] Sync error in handler for service type ${serviceType}:`, syncError);
            }
          }
          
          // Also emit raw message event
          this.emit('message', data, rinfo, serviceType);
          return;
        } else {
          // console.log(`[UdpServiceTransport] No handler registered for service type ${serviceType}, registered types:`, Array.from(this.services.keys()));
        }
      }

      // If not a service message, try to parse as JSON
      try {
        const message = JSON.parse(data.toString());
        const serviceType = message.serviceType || message.type || 0;

        debug(`Received JSON message from ${rinfo.address}:${rinfo.port}, service: ${serviceType}`);

        // Route to registered service
        const handler = this.services.get(serviceType);
        if (handler) {
          handler(message.data || message, rinfo);
        } else {
          debug(`No handler for service type: ${serviceType}`);
        }
      } catch (jsonError) {
        // Not JSON, emit as raw message
        debug(`Received non-JSON message from ${rinfo.address}:${rinfo.port}`);
        this.emit('message', data, rinfo);
      }

    } catch (error) {
      debug('Error handling message:', error);
      this.stats.errors++;
      this.emit('error', error);
    }
  }

  async send(data: Uint8Array | string, address: string, port: number): Promise<void> {
    // Check if we need to reinitialize
    if (!this._initialized || !this.socket) {
      console.log(`[UdpServiceTransport] Transport not ready (initialized=${this._initialized}, hasSocket=${!!this.socket}), attempting reinitialization`);
      
      // Try to reinitialize with existing options
      try {
        await this.init(this.options);
        console.log(`[UdpServiceTransport] Successfully reinitialized transport`);
      } catch (reinitError) {
        console.error(`[UdpServiceTransport] Failed to reinitialize transport:`, reinitError);
        throw new Error('Transport reinitialization failed after socket invalidation');
      }
      
      // Verify we now have a socket
      if (!this.socket) {
        throw new Error('QuicTransport not initialized - failed to create socket');
      }
    }

    try {
      if (typeof data !== 'string' && !(data instanceof Uint8Array)) {
        throw new Error(`Invalid data type for UDP send: expected string or Uint8Array, got ${typeof data} (${data?.constructor?.name})`);
      }

      const byteLength = typeof data === 'string' 
        ? new TextEncoder().encode(data).length 
        : data.length;

      debug(`Calling socket.send with ${byteLength} bytes to ${address}:${port}`);
      // Only log sends to external addresses (not broadcast or loopback)
      if (!address.endsWith('.255') && address !== '127.0.0.1') {
        console.log(`[UdpServiceTransport] Sending ${byteLength} bytes to ${address}:${port}`);
      }
      
      try {
        await this.socket.send(data, port, address);
        debug(`socket.send completed successfully`);
      } catch (sendError: any) {
        console.error(`[UdpServiceTransport] Send failed:`, sendError);
        console.error(`[UdpServiceTransport] Send details:`, {
          address,
          port,
          dataLength: byteLength,
          dataType: typeof data,
          socketBound: !!this.socket,
          error: sendError
        });
        
        // Check if it's a socket invalidation error (stale socket or not found)
        if (sendError?.message?.includes('Socket invalidated by native module reset') || 
            (sendError?.message?.includes('Socket') && sendError?.message?.includes('not found'))) {
          console.error(`[UdpServiceTransport] Socket has been invalidated. Attempting reinitialization...`);
          
          // Clean up the invalid socket reference
          this.socket = null;
          this._initialized = false;
          
          // Try to reinitialize immediately
          try {
            await this.init(this.options);
            console.log(`[UdpServiceTransport] Socket reinitialized successfully, retrying send`);
            
            // Retry the send operation with fresh socket
            await this.socket!.send(data, port, address);
            this._stats.packetsSent++;
            this._stats.bytesSent += byteLength;
            debug(`Retried send successful after socket reinitialization`);
            return;
          } catch (reinitError) {
            console.error(`[UdpServiceTransport] Failed to reinitialize socket:`, reinitError);
            this.emit('socket-invalidated', sendError);
            throw new Error(`Socket reinitialization failed: ${reinitError.message}`);
          }
        }
        
        throw sendError;
      }
      
      this._stats.packetsSent++;
      this._stats.bytesSent += byteLength;
      
      debug(`Sent ${byteLength} bytes to ${address}:${port}, stats updated`);

    } catch (error) {
      debug('Error sending message:', error);
      this._stats.errors++;
      throw error;
    }
  }

  addService(serviceType: number, handler: (data: any, rinfo: UdpRemoteInfo) => void): void {
    this.services.set(serviceType, handler);
    debug(`Added service handler for type: ${serviceType}`);
  }

  removeService(serviceType: number): void {
    this.services.delete(serviceType);
    debug(`Removed service handler for type: ${serviceType}`);
  }

  clearServices(): void {
    this.services.clear();
    debug('Cleared all service handlers');
  }

  async getInfo(): Promise<{port: number, host: string} | null> {
    if (!this.socket) {
      return null;
    }

    try {
      const addressInfo = await this.socket.address();
      if (addressInfo) {
        return {
          port: addressInfo.port,
          host: addressInfo.address
        };
      }
    } catch (error) {
      debug('Error getting socket info:', error);
    }

    return {
      port: this.options?.port || 0,
      host: this.options?.host || '0.0.0.0'
    };
  }

  async close(): Promise<void> {
    debug('Closing QuicTransport...');
    
    if (this.socket) {
      await this.socket.close();
      this.socket = null;
    }
    
    this.services.clear();
    this._initialized = false;
    this.emit('close');
    debug('QuicTransport closed');
  }

  isInitialized(): boolean {
    return this._initialized;
  }

  isReady(): boolean {
    // Transport is ready when it's initialized and has a socket
    return this._initialized && this.socket !== null;
  }

  getStats(): TransportStats {
    return { ...this._stats };
  }

  get stats(): TransportStats {
    return this.getStats();
  }

  async runDiagnostics(): Promise<string> {
    const isInit = this.isInitialized();
    const hasSocket = !!this.socket;
    const serviceCount = this.services.size;
    
    return `QuicTransport Diagnostics:
- Initialized: ${isInit}
- Socket: ${hasSocket ? 'Active' : 'None'}
- Services: ${serviceCount}
- Stats: ${JSON.stringify(this.stats, null, 2)}`;
  }
} 