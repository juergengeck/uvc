/**
 * DiscoveryService - Simple, fast device discovery
 * 
 * Built on NetworkCoordinator for reliability
 */

import { NetworkCoordinator, SERVICE_TYPES } from './NetworkCoordinator';
import { EventEmitter } from 'events';

interface DiscoveryConfig {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  capabilities: string[];
  broadcastInterval?: number;
  deviceTimeout?: number;
}

interface DiscoveredDevice {
  id: string;
  name: string;
  type: string;
  address: string;
  port: number;
  capabilities: string[];
  lastSeen: number;
  ownerId?: string;
}

export class DiscoveryService extends EventEmitter {
  private coordinator: NetworkCoordinator;
  private config: DiscoveryConfig;
  private devices = new Map<string, DiscoveredDevice>();
  private broadcastTimer: NodeJS.Timer | null = null;
  private cleanupTimer: NodeJS.Timer | null = null;
  
  constructor(coordinator: NetworkCoordinator, config: DiscoveryConfig) {
    super();
    this.coordinator = coordinator;
    this.config = {
      broadcastInterval: 5000,
      deviceTimeout: 30000,
      ...config
    };
    
    this.setupHandlers();
  }
  
  /**
   * Start discovery
   */
  start(): void {
    console.log('[DiscoveryService] Starting discovery...');
    
    // Set up discovery message handler
    this.coordinator.registerService(SERVICE_TYPES.DISCOVERY, (data, rinfo) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleDiscoveryMessage(message, rinfo);
      } catch (error) {
        console.error('[DiscoveryService] Invalid discovery message:', error);
      }
    });
    
    // Start broadcasting
    this.startBroadcasting();
    
    // Start cleanup timer
    this.startCleanup();
    
    this.emit('started');
  }
  
  /**
   * Stop discovery
   */
  stop(): void {
    console.log('[DiscoveryService] Stopping discovery...');
    
    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = null;
    }
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    this.emit('stopped');
  }
  
  /**
   * Start broadcasting our presence
   */
  private startBroadcasting(): void {
    const broadcast = async () => {
      const message = {
        type: 'discovery',
        id: this.config.deviceId,
        name: this.config.deviceName,
        deviceType: this.config.deviceType,
        capabilities: this.config.capabilities,
        timestamp: Date.now()
      };
      
      try {
        await this.coordinator.broadcast(
          SERVICE_TYPES.DISCOVERY,
          Buffer.from(JSON.stringify(message)),
          49497
        );
      } catch (error) {
        console.error('[DiscoveryService] Broadcast failed:', error);
      }
    };
    
    // Initial broadcast
    broadcast();
    
    // Set up interval
    this.broadcastTimer = setInterval(broadcast, this.config.broadcastInterval!);
  }
  
  /**
   * Handle incoming discovery messages
   */
  private handleDiscoveryMessage(message: any, rinfo: any): void {
    if (message.type !== 'discovery' || message.id === this.config.deviceId) {
      return; // Ignore our own broadcasts
    }
    
    const device: DiscoveredDevice = {
      id: message.id,
      name: message.name || message.id,
      type: message.deviceType || 'unknown',
      address: rinfo.address,
      port: rinfo.port,
      capabilities: message.capabilities || [],
      lastSeen: Date.now(),
      ownerId: message.ownerId
    };
    
    const existing = this.devices.get(device.id);
    if (existing) {
      // Update existing device
      Object.assign(existing, device);
      this.emit('deviceUpdated', device);
    } else {
      // New device
      this.devices.set(device.id, device);
      this.emit('deviceDiscovered', device);
      console.log(`[DiscoveryService] Discovered device: ${device.id} (${device.name})`);
    }
  }
  
  /**
   * Clean up stale devices
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      const timeout = this.config.deviceTimeout!;
      
      for (const [id, device] of this.devices) {
        if (now - device.lastSeen > timeout) {
          this.devices.delete(id);
          this.emit('deviceLost', id);
          console.log(`[DiscoveryService] Device lost: ${id}`);
        }
      }
    }, 10000); // Check every 10 seconds
  }
  
  /**
   * Get all discovered devices
   */
  getDevices(): DiscoveredDevice[] {
    return Array.from(this.devices.values());
  }
  
  /**
   * Get a specific device
   */
  getDevice(deviceId: string): DiscoveredDevice | undefined {
    return this.devices.get(deviceId);
  }
  
  /**
   * Update device ownership
   */
  updateDeviceOwnership(deviceId: string, ownerId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.ownerId = ownerId;
      this.emit('deviceUpdated', device);
    }
  }
}