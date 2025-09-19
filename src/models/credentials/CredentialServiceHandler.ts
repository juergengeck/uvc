/**
 * Credential Service Handler
 * 
 * Manages credential acknowledgment handlers without race conditions.
 * Each credential send gets a unique handler ID to avoid conflicts.
 */

import { EventEmitter } from 'events';
import type { UdpRemoteInfo } from '../network/UdpModel';

interface PendingCredential {
  deviceAddress: string;
  deviceId: string;
  timestamp: number;
  timeoutId: NodeJS.Timeout;
  resolve: (success: boolean) => void;
}

export class CredentialServiceHandler extends EventEmitter {
  private static instance: CredentialServiceHandler | null = null;
  private pendingCredentials: Map<string, PendingCredential> = new Map();
  private isRegistered: boolean = false;
  
  private constructor() {
    super();
  }
  
  public static getInstance(): CredentialServiceHandler {
    if (!this.instance) {
      this.instance = new CredentialServiceHandler();
    }
    return this.instance;
  }
  
  /**
   * Register this handler with the transport (only done once)
   */
  public registerWithTransport(quicModel: any): void {
    if (this.isRegistered) return;
    
    // Register a permanent handler for credential service (type 2)
    quicModel.addService(2, this.handleCredentialMessage.bind(this));
    this.isRegistered = true;
    console.log('[CredentialServiceHandler] Registered with transport');
  }
  
  /**
   * Handle incoming credential messages
   */
  private handleCredentialMessage(data: any, rinfo: UdpRemoteInfo): void {
    console.log(`[CredentialServiceHandler] Received message from ${rinfo.address}:${rinfo.port}`);
    console.log(`[CredentialServiceHandler] Data type: ${data?.constructor?.name}, length: ${data?.length || 0}`);
    
    try {
      // Skip the service type byte if present
      let jsonData = data;
      if (data instanceof Uint8Array) {
        console.log(`[CredentialServiceHandler] First byte: 0x${data[0]?.toString(16).padStart(2, '0')}`);
        if (data[0] === 2) {
          jsonData = data.slice(1);
          console.log('[CredentialServiceHandler] Skipped service type byte');
        }
      }
      
      // Parse the message
      let message;
      try {
        message = typeof jsonData === 'string' 
          ? JSON.parse(jsonData)
          : JSON.parse(new TextDecoder().decode(jsonData));
        
        console.log(`[CredentialServiceHandler] Parsed message:`, message);
      } catch (parseError) {
        console.warn(`[CredentialServiceHandler] Invalid message from ${rinfo.address}:${rinfo.port} - ignoring`);
        return;
      }
      
      // Check if this is a credential acknowledgment
      if (message.type === 'credential_ack' || message.type === 'credential_response') {
        const deviceAddress = rinfo.address;
        
        // Find pending credential for this device
        let pendingKey: string | null = null;
        for (const [key, pending] of this.pendingCredentials) {
          if (pending.deviceAddress === deviceAddress) {
            pendingKey = key;
            break;
          }
        }
        
        if (pendingKey) {
          const pending = this.pendingCredentials.get(pendingKey)!;
          
          // Clear timeout
          clearTimeout(pending.timeoutId);
          
          // Resolve based on status
          const success = message.status === 'success' || message.success === true;
          console.log(`[CredentialServiceHandler] Device ${deviceAddress} responded with ${success ? 'success' : 'failure'}`);
          
          pending.resolve(success);
          this.pendingCredentials.delete(pendingKey);
        } else {
          console.warn(`[CredentialServiceHandler] Received ack from ${deviceAddress} but no pending credential found`);
        }
      }
    } catch (error) {
      console.error('[CredentialServiceHandler] Error handling message:', error);
    }
  }
  
  /**
   * Wait for credential acknowledgment from a device
   */
  public async waitForAcknowledgment(
    deviceAddress: string,
    deviceId: string,
    timeoutMs: number = 10000
  ): Promise<boolean> {
    const key = `${deviceId}-${Date.now()}`;
    
    return new Promise<boolean>((resolve) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        console.log(`[CredentialServiceHandler] Timeout waiting for ${deviceAddress}`);
        this.pendingCredentials.delete(key);
        resolve(false);
      }, timeoutMs);
      
      // Store pending credential
      this.pendingCredentials.set(key, {
        deviceAddress,
        deviceId,
        timestamp: Date.now(),
        timeoutId,
        resolve
      });
      
      console.log(`[CredentialServiceHandler] Waiting for ack from ${deviceAddress} (timeout: ${timeoutMs}ms)`);
    });
  }
  
  /**
   * Clean up old pending credentials
   */
  public cleanup(): void {
    const now = Date.now();
    const maxAge = 60000; // 1 minute
    
    for (const [key, pending] of this.pendingCredentials) {
      if (now - pending.timestamp > maxAge) {
        clearTimeout(pending.timeoutId);
        pending.resolve(false);
        this.pendingCredentials.delete(key);
      }
    }
  }
  
  /**
   * Shutdown handler
   */
  public shutdown(): void {
    // Clear all pending
    for (const [key, pending] of this.pendingCredentials) {
      clearTimeout(pending.timeoutId);
      pending.resolve(false);
    }
    this.pendingCredentials.clear();
    
    // Note: We don't unregister from transport as other parts may still need it
    console.log('[CredentialServiceHandler] Shutdown complete');
  }
}