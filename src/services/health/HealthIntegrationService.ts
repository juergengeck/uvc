/**
 * Health Integration Service
 * Bridges the refactored vendor packages with the app's BLE service
 */

import { EventEmitter } from 'events';
import { btleService } from '../BLETurboModule';
// These will be imported once packages are installed
// import { UnifiedBLEManager } from '@refinio/one.btle';
// import { BLEHealthIntegration, HealthStorageService } from '@refinio/one.health';

export interface HealthDevice {
  id: string;
  name: string;
  type: 'ring' | 'watch' | 'band' | 'sensor' | 'generic';
  isConnected: boolean;
  lastSync?: Date;
  batteryLevel?: number;
}

export interface HealthData {
  heartRate?: number;
  spo2?: number;
  temperature?: number;
  steps?: number;
  battery?: number;
  timestamp: Date;
}

/**
 * Singleton service that manages health device integration
 * Uses the app's btleService as the underlying BLE interface
 */
class HealthIntegrationService extends EventEmitter {
  private static instance: HealthIntegrationService | null = null;
  private bleManager: any; // UnifiedBLEManager
  private healthIntegration: any; // BLEHealthIntegration
  private storageService: any; // HealthStorageService
  private isInitialized: boolean = false;
  private pairedDevices: Map<string, HealthDevice> = new Map();

  private constructor() {
    super();
  }

  static getInstance(): HealthIntegrationService {
    if (!HealthIntegrationService.instance) {
      HealthIntegrationService.instance = new HealthIntegrationService();
    }
    return HealthIntegrationService.instance;
  }

  /**
   * Initialize the health integration service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // For now, we'll use the btleService directly
      // In production, this would initialize the vendor packages
      console.log('[HealthIntegration] Initializing...');
      
      // Initialize BLE service
      await btleService.initialize();
      
      // Setup event listeners
      this.setupEventListeners();
      
      this.isInitialized = true;
      console.log('[HealthIntegration] Initialized successfully');
    } catch (error) {
      console.error('[HealthIntegration] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Setup event listeners for BLE service
   */
  private setupEventListeners(): void {
    // Listen for device discoveries
    btleService.on('deviceDiscovered', (device: any) => {
      if (this.isHealthDevice(device)) {
        this.emit('healthDeviceDiscovered', this.transformDevice(device));
      }
    });

    // Listen for scan events
    btleService.on('scanStarted', () => {
      this.emit('scanStarted');
    });

    btleService.on('scanStopped', () => {
      this.emit('scanStopped');
    });
  }

  /**
   * Check if a device is a health device
   */
  private isHealthDevice(device: any): boolean {
    const name = (device.name || '').toLowerCase();
    return name.includes('r02') || 
           name.includes('ring') ||
           name.includes('watch') ||
           name.includes('band') ||
           name.includes('hrm') ||
           name.includes('sensor');
  }

  /**
   * Transform BLE device to health device
   */
  private transformDevice(bleDevice: any): HealthDevice {
    const type = this.identifyDeviceType(bleDevice);
    
    return {
      id: bleDevice.id,
      name: bleDevice.name || `Unknown ${bleDevice.id.slice(0, 6)}`,
      type,
      isConnected: bleDevice.isConnected || false,
      lastSync: undefined,
      batteryLevel: undefined
    };
  }

  /**
   * Identify device type from name
   */
  private identifyDeviceType(device: any): HealthDevice['type'] {
    const name = (device.name || '').toLowerCase();
    
    if (name.includes('r02') || name.includes('ring')) {
      return 'ring';
    }
    if (name.includes('watch')) {
      return 'watch';
    }
    if (name.includes('band') || name.includes('fit')) {
      return 'band';
    }
    if (name.includes('heart') || name.includes('hrm') || name.includes('sensor')) {
      return 'sensor';
    }
    
    return 'generic';
  }

  /**
   * Start device discovery
   */
  async startDiscovery(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    await btleService.startScan();
  }

  /**
   * Stop device discovery
   */
  async stopDiscovery(): Promise<void> {
    await btleService.stopScan();
  }

  /**
   * Pair a health device
   */
  async pairDevice(deviceId: string): Promise<HealthDevice> {
    console.log(`[HealthIntegration] Pairing device: ${deviceId}`);
    
    try {
      // Connect to device
      const connectedDevice = await btleService.connectToDevice(deviceId);
      
      // Create health device record
      const healthDevice: HealthDevice = {
        id: deviceId,
        name: connectedDevice.name || 'Unknown Device',
        type: this.identifyDeviceType(connectedDevice),
        isConnected: true,
        lastSync: new Date()
      };
      
      // Store paired device
      this.pairedDevices.set(deviceId, healthDevice);
      
      // Save to storage
      await this.savePairedDevice(healthDevice);
      
      // Emit events
      this.emit('devicePaired', healthDevice);
      this.emit('deviceConnected', healthDevice);
      
      // Start monitoring health data
      await this.startHealthMonitoring(deviceId);
      
      return healthDevice;
    } catch (error) {
      console.error(`[HealthIntegration] Failed to pair device ${deviceId}:`, error);
      throw error;
    }
  }

  /**
   * Unpair a device
   */
  async unpairDevice(deviceId: string): Promise<void> {
    console.log(`[HealthIntegration] Unpairing device: ${deviceId}`);
    
    // Disconnect if connected
    try {
      await btleService.disconnectDevice(deviceId);
    } catch (error) {
      console.warn(`[HealthIntegration] Error disconnecting device: ${error}`);
    }
    
    // Remove from paired devices
    this.pairedDevices.delete(deviceId);
    
    // Remove from storage
    await this.removePairedDevice(deviceId);
    
    // Emit event
    this.emit('deviceUnpaired', deviceId);
  }

  /**
   * Start monitoring health data from a device
   */
  private async startHealthMonitoring(deviceId: string): Promise<void> {
    // This would be implemented using the R02RingService or appropriate handler
    console.log(`[HealthIntegration] Starting health monitoring for ${deviceId}`);
    
    // For now, emit mock data for testing
    this.emit('healthDataReceived', {
      deviceId,
      data: {
        heartRate: 72,
        spo2: 98,
        timestamp: new Date()
      } as HealthData
    });
  }

  /**
   * Get all paired devices
   */
  async getPairedDevices(): Promise<HealthDevice[]> {
    // Load from storage if not in memory
    if (this.pairedDevices.size === 0) {
      await this.loadPairedDevices();
    }
    
    return Array.from(this.pairedDevices.values());
  }

  /**
   * Get device by ID
   */
  getDevice(deviceId: string): HealthDevice | undefined {
    return this.pairedDevices.get(deviceId);
  }

  /**
   * Save paired device to storage
   */
  private async savePairedDevice(device: HealthDevice): Promise<void> {
    // This would save to AsyncStorage or the app's storage model
    console.log(`[HealthIntegration] Saving paired device: ${device.id}`);
  }

  /**
   * Remove paired device from storage
   */
  private async removePairedDevice(deviceId: string): Promise<void> {
    // This would remove from AsyncStorage or the app's storage model
    console.log(`[HealthIntegration] Removing paired device: ${deviceId}`);
  }

  /**
   * Load paired devices from storage
   */
  private async loadPairedDevices(): Promise<void> {
    // This would load from AsyncStorage or the app's storage model
    console.log('[HealthIntegration] Loading paired devices from storage');
  }

  /**
   * Get health data for a device
   */
  async getHealthData(deviceId: string, type?: string): Promise<any[]> {
    // This would query the health storage service
    console.log(`[HealthIntegration] Getting health data for ${deviceId}, type: ${type}`);
    return [];
  }

  /**
   * Sync all health data
   */
  async syncAllHealthData(): Promise<void> {
    const connectedDevices = Array.from(this.pairedDevices.values())
      .filter(d => d.isConnected);
    
    for (const device of connectedDevices) {
      await this.startHealthMonitoring(device.id);
    }
  }

  /**
   * Get BLE state
   */
  async getBLEState(): Promise<string> {
    return await btleService.getState();
  }

  /**
   * Check if BLE is available
   */
  async isBLEAvailable(): Promise<boolean> {
    return await btleService.isBTLEAvailable();
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.removeAllListeners();
    btleService.removeAllListeners();
    this.pairedDevices.clear();
    this.isInitialized = false;
  }
}

// Export singleton instance
export const healthIntegration = HealthIntegrationService.getInstance();