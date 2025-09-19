/**
 * NetworkCoordinator - Single source of truth for all network operations
 * 
 * This replaces the chaotic multiple initialization points with a single,
 * well-coordinated network stack that is fast and resilient.
 */

import { UdpModel } from './UdpModel';
import { EventEmitter } from 'events';
import type { UdpRemoteInfo } from './UdpModel';

interface NetworkConfig {
  port: number;
  broadcast: boolean;
  discoveryEnabled: boolean;
  deviceId: string;
  secretKey: string;
  publicKey: string;
}

interface ServiceHandler {
  serviceType: number;
  handler: (data: Buffer, rinfo: UdpRemoteInfo) => void;
  timeout?: NodeJS.Timeout;
}

export class NetworkCoordinator extends EventEmitter {
  private static instance: NetworkCoordinator | null = null;
  
  private config: NetworkConfig;
  private udpSocket: any = null;
  private services: Map<number, ServiceHandler[]> = new Map();
  private isInitialized = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private socketError: Error | null = null;
  
  // Performance metrics
  private packetsSent = 0;
  private packetsReceived = 0;
  private lastActivity = Date.now();
  
  private constructor(config: NetworkConfig) {
    super();
    this.config = config;
  }
  
  static getInstance(config?: NetworkConfig): NetworkCoordinator {
    if (!NetworkCoordinator.instance) {
      if (!config) {
        throw new Error('NetworkCoordinator requires config on first initialization');
      }
      NetworkCoordinator.instance = new NetworkCoordinator(config);
    }
    return NetworkCoordinator.instance;
  }
  
  /**
   * Initialize the network stack once and properly
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[NetworkCoordinator] Already initialized');
      return;
    }
    
    console.log('[NetworkCoordinator] Initializing network stack...');
    
    try {
      // 1. Initialize UDP layer
      const udpModel = UdpModel.getInstance();
      if (!udpModel.isInitialized()) {
        await udpModel.init();
      }
      
      // 2. Create socket with retry logic
      this.udpSocket = await this.createSocketWithRetry();
      
      // 3. Set up message routing
      this.setupMessageRouting();
      
      // 4. Start health monitoring
      this.startHealthMonitoring();
      
      this.isInitialized = true;
      this.emit('ready');
      
      console.log('[NetworkCoordinator] Network stack initialized successfully');
      
    } catch (error) {
      console.error('[NetworkCoordinator] Initialization failed:', error);
      this.socketError = error as Error;
      throw error;
    }
  }
  
  /**
   * Create socket with retry logic for resilience
   */
  private async createSocketWithRetry(retries = 3): Promise<any> {
    const udpModel = UdpModel.getInstance();
    let lastError: Error | null = null;
    
    for (let i = 0; i < retries; i++) {
      try {
        console.log(`[NetworkCoordinator] Creating UDP socket (attempt ${i + 1})...`);
        
        const socket = await udpModel.createSocket({
          type: 'udp4',
          reuseAddr: true,
          reusePort: true,
          broadcast: this.config.broadcast
        });
        
        // Bind to port
        await new Promise<void>((resolve, reject) => {
          socket.bind(this.config.port, '0.0.0.0', (err?: Error) => {
            if (err) reject(err);
            else resolve();
          });
        });
        
        console.log(`[NetworkCoordinator] Socket bound to port ${this.config.port}`);
        return socket;
        
      } catch (error) {
        lastError = error as Error;
        console.warn(`[NetworkCoordinator] Socket creation attempt ${i + 1} failed:`, error);
        
        if (i < retries - 1) {
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
      }
    }
    
    throw lastError || new Error('Failed to create socket after retries');
  }
  
  /**
   * Set up efficient message routing
   */
  private setupMessageRouting(): void {
    if (!this.udpSocket) return;
    
    this.udpSocket.on('message', (data: Buffer, rinfo: UdpRemoteInfo) => {
      this.packetsReceived++;
      this.lastActivity = Date.now();
      
      // Fast path: check first byte for service type
      if (data.length === 0) return;
      
      const serviceType = data[0];
      const handlers = this.services.get(serviceType);
      
      if (handlers && handlers.length > 0) {
        const payload = data.slice(1); // Remove service type byte
        
        // Call all handlers for this service type
        for (const handler of handlers) {
          try {
            handler.handler(payload, rinfo);
          } catch (error) {
            console.error(`[NetworkCoordinator] Handler error for service ${serviceType}:`, error);
          }
        }
      }
    });
    
    this.udpSocket.on('error', (error: Error) => {
      console.error('[NetworkCoordinator] Socket error:', error);
      this.socketError = error;
      this.handleSocketError();
    });
    
    this.udpSocket.on('close', () => {
      console.warn('[NetworkCoordinator] Socket closed');
      this.handleSocketClose();
    });
  }
  
  /**
   * Register a service handler
   */
  registerService(serviceType: number, handler: (data: Buffer, rinfo: UdpRemoteInfo) => void, timeout?: number): () => void {
    const serviceHandler: ServiceHandler = {
      serviceType,
      handler,
      timeout: timeout ? setTimeout(() => {
        this.removeServiceHandler(serviceType, serviceHandler);
      }, timeout) : undefined
    };
    
    if (!this.services.has(serviceType)) {
      this.services.set(serviceType, []);
    }
    
    this.services.get(serviceType)!.push(serviceHandler);
    
    // Return cleanup function
    return () => {
      this.removeServiceHandler(serviceType, serviceHandler);
    };
  }
  
  /**
   * Remove a specific service handler
   */
  private removeServiceHandler(serviceType: number, handler: ServiceHandler): void {
    const handlers = this.services.get(serviceType);
    if (!handlers) return;
    
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
      if (handler.timeout) {
        clearTimeout(handler.timeout);
      }
    }
    
    if (handlers.length === 0) {
      this.services.delete(serviceType);
    }
  }
  
  /**
   * Send data with automatic retry and error handling
   */
  async send(serviceType: number, data: Buffer, address: string, port: number): Promise<void> {
    if (!this.isInitialized || !this.udpSocket) {
      throw new Error('Network not initialized');
    }
    
    // Prepend service type
    const packet = Buffer.concat([Buffer.from([serviceType]), data]);
    
    return new Promise((resolve, reject) => {
      this.udpSocket.send(packet, port, address, (error?: Error) => {
        if (error) {
          console.error(`[NetworkCoordinator] Send error to ${address}:${port}:`, error);
          reject(error);
        } else {
          this.packetsSent++;
          this.lastActivity = Date.now();
          resolve();
        }
      });
    });
  }
  
  /**
   * Broadcast data to all devices
   */
  async broadcast(serviceType: number, data: Buffer, port: number): Promise<void> {
    if (!this.config.broadcast) {
      throw new Error('Broadcast not enabled');
    }
    
    await this.send(serviceType, data, '255.255.255.255', port);
  }
  
  /**
   * Handle socket errors with reconnection logic
   */
  private handleSocketError(): void {
    if (this.reconnectTimer) return; // Already reconnecting
    
    console.log('[NetworkCoordinator] Scheduling reconnection...');
    
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.reconnect();
      } catch (error) {
        console.error('[NetworkCoordinator] Reconnection failed:', error);
        // Schedule another attempt
        this.handleSocketError();
      }
    }, 5000); // 5 second delay
  }
  
  /**
   * Handle socket close
   */
  private handleSocketClose(): void {
    this.isInitialized = false;
    this.emit('disconnected');
    this.handleSocketError(); // Trigger reconnection
  }
  
  /**
   * Reconnect the socket
   */
  private async reconnect(): Promise<void> {
    console.log('[NetworkCoordinator] Attempting reconnection...');
    
    // Clean up old socket
    if (this.udpSocket) {
      this.udpSocket.removeAllListeners();
      try {
        this.udpSocket.close();
      } catch (e) {
        // Ignore close errors
      }
      this.udpSocket = null;
    }
    
    // Reset state
    this.isInitialized = false;
    this.socketError = null;
    
    // Reinitialize
    await this.initialize();
    
    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    this.emit('reconnected');
  }
  
  /**
   * Health monitoring for early problem detection
   */
  private startHealthMonitoring(): void {
    setInterval(() => {
      const now = Date.now();
      const timeSinceLastActivity = now - this.lastActivity;
      
      // If no activity for 30 seconds and discovery is enabled, do a health check
      if (timeSinceLastActivity > 30000 && this.config.discoveryEnabled) {
        this.performHealthCheck();
      }
      
      // Log metrics periodically
      if (this.packetsSent > 0 || this.packetsReceived > 0) {
        console.log(`[NetworkCoordinator] Stats - Sent: ${this.packetsSent}, Received: ${this.packetsReceived}`);
      }
    }, 10000); // Check every 10 seconds
  }
  
  /**
   * Perform a health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      // Try to send a test packet to ourselves
      await this.send(0xFF, Buffer.from('HEALTH_CHECK'), '127.0.0.1', this.config.port);
    } catch (error) {
      console.error('[NetworkCoordinator] Health check failed:', error);
      this.handleSocketError();
    }
  }
  
  /**
   * Get network status
   */
  getStatus(): {
    initialized: boolean;
    connected: boolean;
    error: Error | null;
    stats: {
      packetsSent: number;
      packetsReceived: number;
      lastActivity: Date;
    };
  } {
    return {
      initialized: this.isInitialized,
      connected: this.isInitialized && !this.socketError,
      error: this.socketError,
      stats: {
        packetsSent: this.packetsSent,
        packetsReceived: this.packetsReceived,
        lastActivity: new Date(this.lastActivity)
      }
    };
  }
  
  /**
   * Shutdown the network stack cleanly
   */
  async shutdown(): Promise<void> {
    console.log('[NetworkCoordinator] Shutting down...');
    
    // Clear all timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Clear all service handlers
    for (const [serviceType, handlers] of this.services) {
      for (const handler of handlers) {
        if (handler.timeout) {
          clearTimeout(handler.timeout);
        }
      }
    }
    this.services.clear();
    
    // Close socket
    if (this.udpSocket) {
      this.udpSocket.removeAllListeners();
      try {
        this.udpSocket.close();
      } catch (e) {
        // Ignore close errors
      }
      this.udpSocket = null;
    }
    
    this.isInitialized = false;
    this.emit('shutdown');
    
    // Clear singleton
    NetworkCoordinator.instance = null;
  }
}

// Export service types as constants
export const SERVICE_TYPES = {
  DISCOVERY: 1,
  CREDENTIALS: 2,
  LED_CONTROL: 3,
  DATA: 4,
  HEALTH_CHECK: 0xFF
} as const;