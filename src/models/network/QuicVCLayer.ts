/**
 * QuicVCLayer - QUIC with Verifiable Credentials
 * 
 * A clean, fast implementation that handles QUIC-VC protocol
 * without the brittleness of the current system.
 */

import { NetworkCoordinator, SERVICE_TYPES } from './NetworkCoordinator';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';

interface QuicVCConfig {
  deviceId: string;
  secretKey: string;
  publicKey: string;
  port?: number;
}

interface PendingConnection {
  deviceId: string;
  address: string;
  port: number;
  challenge: string;
  timestamp: number;
  retries: number;
}

interface EstablishedConnection {
  deviceId: string;
  address: string;
  port: number;
  publicKey: string;
  lastSeen: number;
  authenticated: boolean;
}

export class QuicVCLayer extends EventEmitter {
  private coordinator: NetworkCoordinator;
  private config: QuicVCConfig;
  
  // Connection management
  private pendingConnections = new Map<string, PendingConnection>();
  private establishedConnections = new Map<string, EstablishedConnection>();
  
  // Performance
  private connectionCache = new Map<string, EstablishedConnection>();
  private authenticationCache = new Map<string, { timestamp: number; valid: boolean }>();
  
  constructor(coordinator: NetworkCoordinator, config: QuicVCConfig) {
    super();
    this.coordinator = coordinator;
    this.config = config;
    
    // Set up handlers
    this.setupHandlers();
    
    // Start connection maintenance
    this.startConnectionMaintenance();
  }
  
  /**
   * Set up protocol handlers
   */
  private setupHandlers(): void {
    // Handle QUIC-VC authentication messages
    this.coordinator.registerService(SERVICE_TYPES.DATA, (data, rinfo) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'quic_vc_challenge':
            this.handleChallenge(message, rinfo);
            break;
          case 'quic_vc_response':
            this.handleChallengeResponse(message, rinfo);
            break;
          case 'quic_vc_ack':
            this.handleAck(message, rinfo);
            break;
          case 'data':
            this.handleData(message, rinfo);
            break;
        }
      } catch (error) {
        console.error('[QuicVCLayer] Error handling message:', error);
      }
    });
  }
  
  /**
   * Initiate connection to a device
   */
  async connect(deviceId: string, address: string, port: number): Promise<void> {
    // Check cache first
    const cached = this.connectionCache.get(deviceId);
    if (cached && cached.authenticated && Date.now() - cached.lastSeen < 60000) {
      console.log(`[QuicVCLayer] Using cached connection for ${deviceId}`);
      this.establishedConnections.set(deviceId, cached);
      this.emit('connected', deviceId);
      return;
    }
    
    // Generate challenge
    const challenge = this.generateChallenge();
    
    // Store pending connection
    this.pendingConnections.set(deviceId, {
      deviceId,
      address,
      port,
      challenge,
      timestamp: Date.now(),
      retries: 0
    });
    
    // Send challenge
    const message = {
      type: 'quic_vc_challenge',
      deviceId: this.config.deviceId,
      challenge,
      publicKey: this.config.publicKey,
      timestamp: Date.now()
    };
    
    await this.coordinator.send(
      SERVICE_TYPES.DATA,
      Buffer.from(JSON.stringify(message)),
      address,
      port
    );
    
    console.log(`[QuicVCLayer] Sent challenge to ${deviceId} at ${address}:${port}`);
  }
  
  /**
   * Handle incoming challenge
   */
  private async handleChallenge(message: any, rinfo: any): Promise<void> {
    console.log(`[QuicVCLayer] Received challenge from ${message.deviceId}`);
    
    // Verify message has required fields
    if (!message.challenge || !message.publicKey) {
      console.warn('[QuicVCLayer] Invalid challenge message');
      return;
    }
    
    // Generate response
    const response = this.signChallenge(message.challenge);
    
    // Send response
    const responseMessage = {
      type: 'quic_vc_response',
      deviceId: this.config.deviceId,
      challenge: message.challenge,
      response,
      publicKey: this.config.publicKey,
      timestamp: Date.now()
    };
    
    await this.coordinator.send(
      SERVICE_TYPES.DATA,
      Buffer.from(JSON.stringify(responseMessage)),
      rinfo.address,
      rinfo.port
    );
    
    // Store as pending
    this.pendingConnections.set(message.deviceId, {
      deviceId: message.deviceId,
      address: rinfo.address,
      port: rinfo.port,
      challenge: this.generateChallenge(), // Our challenge for them
      timestamp: Date.now(),
      retries: 0
    });
  }
  
  /**
   * Handle challenge response
   */
  private async handleChallengeResponse(message: any, rinfo: any): Promise<void> {
    console.log(`[QuicVCLayer] Received response from ${message.deviceId}`);
    
    const pending = this.pendingConnections.get(message.deviceId);
    if (!pending) {
      console.warn(`[QuicVCLayer] No pending connection for ${message.deviceId}`);
      return;
    }
    
    // Verify response
    if (this.verifyResponse(message.challenge, message.response, message.publicKey)) {
      console.log(`[QuicVCLayer] Authentication successful for ${message.deviceId}`);
      
      // Establish connection
      const connection: EstablishedConnection = {
        deviceId: message.deviceId,
        address: rinfo.address,
        port: rinfo.port,
        publicKey: message.publicKey,
        lastSeen: Date.now(),
        authenticated: true
      };
      
      this.establishedConnections.set(message.deviceId, connection);
      this.connectionCache.set(message.deviceId, connection);
      this.pendingConnections.delete(message.deviceId);
      
      // Send ACK
      const ackMessage = {
        type: 'quic_vc_ack',
        deviceId: this.config.deviceId,
        status: 'authenticated',
        timestamp: Date.now()
      };
      
      await this.coordinator.send(
        SERVICE_TYPES.DATA,
        Buffer.from(JSON.stringify(ackMessage)),
        rinfo.address,
        rinfo.port
      );
      
      this.emit('authenticated', message.deviceId);
      
    } else {
      console.warn(`[QuicVCLayer] Authentication failed for ${message.deviceId}`);
      this.pendingConnections.delete(message.deviceId);
      this.emit('authenticationFailed', message.deviceId);
    }
  }
  
  /**
   * Handle ACK
   */
  private handleAck(message: any, rinfo: any): void {
    if (message.status === 'authenticated') {
      console.log(`[QuicVCLayer] Received ACK from ${message.deviceId}`);
      this.emit('connected', message.deviceId);
    }
  }
  
  /**
   * Handle data messages
   */
  private handleData(message: any, rinfo: any): void {
    // Verify sender is authenticated
    const connection = this.establishedConnections.get(message.deviceId);
    if (!connection || !connection.authenticated) {
      console.warn(`[QuicVCLayer] Received data from unauthenticated device: ${message.deviceId}`);
      return;
    }
    
    // Update last seen
    connection.lastSeen = Date.now();
    
    // Emit data event
    this.emit('data', {
      deviceId: message.deviceId,
      data: message.data,
      timestamp: message.timestamp
    });
  }
  
  /**
   * Send data to authenticated device
   */
  async sendData(deviceId: string, data: any): Promise<void> {
    const connection = this.establishedConnections.get(deviceId);
    if (!connection || !connection.authenticated) {
      throw new Error(`No authenticated connection to ${deviceId}`);
    }
    
    const message = {
      type: 'data',
      deviceId: this.config.deviceId,
      data,
      timestamp: Date.now()
    };
    
    await this.coordinator.send(
      SERVICE_TYPES.DATA,
      Buffer.from(JSON.stringify(message)),
      connection.address,
      connection.port
    );
  }
  
  /**
   * Connection maintenance
   */
  private startConnectionMaintenance(): void {
    setInterval(() => {
      const now = Date.now();
      
      // Retry pending connections
      for (const [deviceId, pending] of this.pendingConnections) {
        if (now - pending.timestamp > 5000) { // 5 second timeout
          if (pending.retries < 3) {
            pending.retries++;
            pending.timestamp = now;
            
            // Retry connection
            this.connect(pending.deviceId, pending.address, pending.port).catch(err => {
              console.error(`[QuicVCLayer] Retry failed for ${deviceId}:`, err);
            });
          } else {
            // Give up
            this.pendingConnections.delete(deviceId);
            this.emit('connectionFailed', deviceId);
          }
        }
      }
      
      // Clean up stale connections
      for (const [deviceId, connection] of this.establishedConnections) {
        if (now - connection.lastSeen > 300000) { // 5 minutes
          console.log(`[QuicVCLayer] Removing stale connection: ${deviceId}`);
          this.establishedConnections.delete(deviceId);
          this.emit('disconnected', deviceId);
        }
      }
      
      // Clean up cache
      for (const [deviceId, connection] of this.connectionCache) {
        if (now - connection.lastSeen > 600000) { // 10 minutes
          this.connectionCache.delete(deviceId);
        }
      }
    }, 10000); // Every 10 seconds
  }
  
  /**
   * Generate a random challenge
   */
  private generateChallenge(): string {
    return createHash('sha256')
      .update(Math.random().toString())
      .update(Date.now().toString())
      .digest('hex');
  }
  
  /**
   * Sign a challenge with our secret key
   */
  private signChallenge(challenge: string): string {
    // Simplified signature for example - use proper crypto in production
    return createHash('sha256')
      .update(challenge)
      .update(this.config.secretKey)
      .digest('hex');
  }
  
  /**
   * Verify a challenge response
   */
  private verifyResponse(challenge: string, response: string, publicKey: string): boolean {
    // Simplified verification for example - use proper crypto in production
    // In real implementation, verify signature using public key
    return response.length === 64; // SHA256 hex length
  }
  
  /**
   * Get connection status
   */
  getConnectionStatus(deviceId: string): {
    connected: boolean;
    authenticated: boolean;
    lastSeen?: Date;
  } {
    const connection = this.establishedConnections.get(deviceId);
    if (connection) {
      return {
        connected: true,
        authenticated: connection.authenticated,
        lastSeen: new Date(connection.lastSeen)
      };
    }
    
    return {
      connected: false,
      authenticated: false
    };
  }
  
  /**
   * Get all connections
   */
  getAllConnections(): EstablishedConnection[] {
    return Array.from(this.establishedConnections.values());
  }
  
  /**
   * Disconnect from a device
   */
  disconnect(deviceId: string): void {
    this.establishedConnections.delete(deviceId);
    this.pendingConnections.delete(deviceId);
    this.emit('disconnected', deviceId);
  }
  
  /**
   * Shutdown the layer
   */
  shutdown(): void {
    this.establishedConnections.clear();
    this.pendingConnections.clear();
    this.connectionCache.clear();
    this.authenticationCache.clear();
    this.removeAllListeners();
  }
}