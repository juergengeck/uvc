/**
 * UnifiedNetworkManager - Single entry point for all network operations
 * 
 * This replaces the chaotic QuicModel/TransportManager/DeviceDiscoveryModel mess
 * with a clean, coordinated system.
 */

import { NetworkCoordinator, SERVICE_TYPES } from './NetworkCoordinator';
import { QuicVCLayer } from './QuicVCLayer';
import { DiscoveryService } from './DiscoveryService';
import { EventEmitter } from 'events';

interface NetworkIdentity {
  deviceId: string;
  secretKey: string;
  publicKey: string;
}

interface NetworkManagerConfig {
  port?: number;
  discoveryEnabled?: boolean;
  deviceName?: string;
  deviceType?: string;
  capabilities?: string[];
}

export class UnifiedNetworkManager extends EventEmitter {
  private static instance: UnifiedNetworkManager | null = null;
  
  private coordinator: NetworkCoordinator | null = null;
  private quicLayer: QuicVCLayer | null = null;
  private discovery: DiscoveryService | null = null;
  
  private identity: NetworkIdentity | null = null;
  private config: NetworkManagerConfig;
  private initialized = false;
  
  private constructor(config: NetworkManagerConfig = {}) {
    super();
    this.config = {
      port: 49497,
      discoveryEnabled: true,
      deviceName: 'Lama Device',
      deviceType: 'mobile',
      capabilities: ['messaging', 'file-transfer'],
      ...config
    };
  }
  
  static getInstance(config?: NetworkManagerConfig): UnifiedNetworkManager {
    if (!UnifiedNetworkManager.instance) {
      UnifiedNetworkManager.instance = new UnifiedNetworkManager(config);
    }
    return UnifiedNetworkManager.instance;
  }
  
  /**
   * Initialize with identity
   */
  async initialize(identity: NetworkIdentity): Promise<void> {
    if (this.initialized) {
      console.log('[UnifiedNetworkManager] Already initialized');
      return;
    }
    
    console.log('[UnifiedNetworkManager] Initializing network stack...');
    
    this.identity = identity;
    
    try {
      // 1. Create and initialize coordinator
      this.coordinator = NetworkCoordinator.getInstance({
        port: this.config.port!,
        broadcast: true,
        discoveryEnabled: this.config.discoveryEnabled!,
        ...identity
      });
      
      await this.coordinator.initialize();
      
      // 2. Create QUIC-VC layer
      this.quicLayer = new QuicVCLayer(this.coordinator, {
        ...identity,
        port: this.config.port
      });
      
      // 3. Create discovery service if enabled
      if (this.config.discoveryEnabled) {
        this.discovery = new DiscoveryService(this.coordinator, {
          deviceId: identity.deviceId,
          deviceName: this.config.deviceName!,
          deviceType: this.config.deviceType!,
          capabilities: this.config.capabilities!
        });
        
        this.discovery.start();
        
        // Forward discovery events
        this.discovery.on('deviceDiscovered', (device) => {
          this.emit('deviceDiscovered', device);
          
          // Auto-connect for QUIC-VC if it's a compatible device
          if (device.capabilities.includes('quic-vc')) {
            this.connectToDevice(device.id, device.address, device.port).catch(err => {
              console.error(`[UnifiedNetworkManager] Auto-connect failed for ${device.id}:`, err);
            });
          }
        });
        
        this.discovery.on('deviceUpdated', (device) => {
          this.emit('deviceUpdated', device);
        });
        
        this.discovery.on('deviceLost', (deviceId) => {
          this.emit('deviceLost', deviceId);
          this.quicLayer?.disconnect(deviceId);
        });
      }
      
      // 4. Set up QUIC-VC event forwarding
      this.quicLayer.on('authenticated', (deviceId) => {
        this.emit('deviceAuthenticated', deviceId);
      });
      
      this.quicLayer.on('data', (data) => {
        this.emit('data', data);
      });
      
      this.initialized = true;
      this.emit('ready');
      
      console.log('[UnifiedNetworkManager] Network stack initialized successfully');
      
    } catch (error) {
      console.error('[UnifiedNetworkManager] Initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Send a credential to a device
   */
  async sendCredential(deviceId: string, credential: any): Promise<boolean> {
    if (!this.initialized || !this.coordinator) {
      throw new Error('Network not initialized');
    }
    
    const device = this.discovery?.getDevice(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }
    
    return new Promise((resolve) => {
      let timeoutId: NodeJS.Timeout;
      
      // Register handler for credential response
      const cleanup = this.coordinator!.registerService(SERVICE_TYPES.CREDENTIALS, (data, rinfo) => {
        if (rinfo.address !== device.address) return;
        
        try {
          const response = JSON.parse(data.toString());
          if (response.type === 'credential_ack' && response.deviceId === deviceId) {
            clearTimeout(timeoutId);
            cleanup();
            
            if (response.status === 'accepted') {
              // Update device ownership
              this.discovery?.updateDeviceOwnership(deviceId, credential.ownerId);
              resolve(true);
            } else {
              resolve(false);
            }
          }
        } catch (error) {
          console.error('[UnifiedNetworkManager] Error parsing credential response:', error);
        }
      });
      
      // Set timeout
      timeoutId = setTimeout(() => {
        cleanup();
        resolve(false);
      }, 10000);
      
      // Send credential
      const packet = {
        type: 'credential_transfer',
        credential,
        timestamp: Date.now()
      };
      
      this.coordinator!.send(
        SERVICE_TYPES.CREDENTIALS,
        Buffer.from(JSON.stringify(packet)),
        device.address,
        device.port
      ).catch(err => {
        console.error('[UnifiedNetworkManager] Failed to send credential:', err);
        clearTimeout(timeoutId);
        cleanup();
        resolve(false);
      });
    });
  }
  
  /**
   * Send LED control command
   * @deprecated Use ESP32ConnectionManager.sendCommand() instead for ESP32 devices
   */
  async sendLEDCommand(deviceId: string, command: 'on' | 'off' | 'toggle'): Promise<boolean> {
    console.warn('[UnifiedNetworkManager] sendLEDCommand is deprecated. Use ESP32ConnectionManager.sendCommand() for ESP32 devices.');
    
    if (!this.initialized || !this.coordinator) {
      throw new Error('Network not initialized');
    }
    
    const device = this.discovery?.getDevice(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }
    
    // For ESP32 devices, delegate to ESP32ConnectionManager
    if (device.deviceType === 'ESP32') {
      try {
        const { ESP32ConnectionManager } = await import('./esp32/ESP32ConnectionManager');
        const esp32Manager = ESP32ConnectionManager.getInstance();
        
        const esp32Command = {
          type: 'led_control' as const,
          action: command,
          timestamp: Date.now()
        };
        
        const response = await esp32Manager.sendCommand(deviceId, esp32Command);
        return response.status === 'success' || response.status === 'sent';
      } catch (error) {
        console.error('[UnifiedNetworkManager] Failed to send LED command via ESP32ConnectionManager:', error);
        return false;
      }
    }
    
    // For non-ESP32 devices, return false (not implemented)
    console.warn(`[UnifiedNetworkManager] LED control not implemented for device type: ${device.deviceType}`);
    return false;
  }
  
  /**
   * Connect to a device using QUIC-VC
   */
  async connectToDevice(deviceId: string, address?: string, port?: number): Promise<void> {
    if (!this.quicLayer) {
      throw new Error('QUIC layer not initialized');
    }
    
    // Get device info if not provided
    if (!address || !port) {
      const device = this.discovery?.getDevice(deviceId);
      if (!device) {
        throw new Error(`Device ${deviceId} not found`);
      }
      address = device.address;
      port = device.port;
    }
    
    await this.quicLayer.connect(deviceId, address, port);
  }
  
  /**
   * Send data to an authenticated device
   */
  async sendData(deviceId: string, data: any): Promise<void> {
    if (!this.quicLayer) {
      throw new Error('QUIC layer not initialized');
    }
    
    await this.quicLayer.sendData(deviceId, data);
  }
  
  /**
   * Get discovered devices
   */
  getDevices(): any[] {
    return this.discovery?.getDevices() || [];
  }
  
  /**
   * Get network status
   */
  getStatus(): {
    initialized: boolean;
    coordinator: any;
    discovery: {
      enabled: boolean;
      deviceCount: number;
    };
    connections: any[];
  } {
    return {
      initialized: this.initialized,
      coordinator: this.coordinator?.getStatus() || null,
      discovery: {
        enabled: this.config.discoveryEnabled!,
        deviceCount: this.discovery?.getDevices().length || 0
      },
      connections: this.quicLayer?.getAllConnections() || []
    };
  }
  
  /**
   * Enable/disable discovery
   */
  setDiscoveryEnabled(enabled: boolean): void {
    if (enabled && !this.discovery && this.coordinator && this.identity) {
      this.discovery = new DiscoveryService(this.coordinator, {
        deviceId: this.identity.deviceId,
        deviceName: this.config.deviceName!,
        deviceType: this.config.deviceType!,
        capabilities: this.config.capabilities!
      });
      this.discovery.start();
    } else if (!enabled && this.discovery) {
      this.discovery.stop();
      this.discovery = null;
    }
    
    this.config.discoveryEnabled = enabled;
  }
  
  /**
   * Shutdown everything cleanly
   */
  async shutdown(): Promise<void> {
    console.log('[UnifiedNetworkManager] Shutting down...');
    
    if (this.discovery) {
      this.discovery.stop();
    }
    
    if (this.quicLayer) {
      this.quicLayer.shutdown();
    }
    
    if (this.coordinator) {
      await this.coordinator.shutdown();
    }
    
    this.initialized = false;
    this.emit('shutdown');
    
    // Clear singleton
    UnifiedNetworkManager.instance = null;
  }
}