/**
 * Unified BLE Manager
 * High-level BLE device management that uses the app's BLETurboModule
 */

import { EventEmitter } from 'events';
import { BLEDevice, BLEDeviceType, DeviceHandler } from '../types/devices';
import { RingBLE } from '../devices/ring/RingBLE';
import { ESP32WiFiConfig } from '../devices/esp32/ESP32WiFiConfig';
import { GenericBLEDevice } from './GenericBLEDevice';

export interface BLEManagerOptions {
  enableLogging?: boolean;
  restoreStateIdentifier?: string;
  restoreStateFunction?: (restoredState: any) => void;
}

export class UnifiedBLEManager extends EventEmitter {
  private btleService: any; // Will be injected from app
  private devices: Map<string, BLEDevice> = new Map();
  private handlers: Map<BLEDeviceType, DeviceHandler> = new Map();
  private isScanning = false;

  constructor(btleService: any, options: BLEManagerOptions = {}) {
    super();
    this.btleService = btleService;
    this.initializeHandlers();
    this.setupEventListeners();
  }

  private initializeHandlers() {
    // Register device type handlers
    this.handlers.set('ring', new RingBLE(this.btleService));
    this.handlers.set('esp32-config', new ESP32WiFiConfig(this.btleService));
    this.handlers.set('generic', new GenericBLEDevice(this.btleService));
  }

  private setupEventListeners() {
    // Forward events from btleService
    this.btleService.on('deviceDiscovered', (device: any) => {
      const bleDevice = this.transformDevice(device);
      this.devices.set(bleDevice.id, bleDevice);
      this.emit('deviceDiscovered', bleDevice);
    });

    this.btleService.on('scanStarted', () => {
      this.isScanning = true;
      this.emit('scanStarted');
    });

    this.btleService.on('scanStopped', () => {
      this.isScanning = false;
      this.emit('scanStopped');
    });

    this.btleService.on('stateChanged', (state: string) => {
      this.emit('stateChange', state);
    });
  }

  private transformDevice(device: any): BLEDevice {
    const deviceType = this.identifyDeviceType(device);
    
    return {
      id: device.id,
      name: device.name || `Unknown ${device.id.slice(0, 6)}`,
      type: deviceType,
      rssi: device.rssi,
      isConnected: device.isConnected || false,
      lastSeen: device.lastSeen || Date.now(),
      isConnectable: true,
      metadata: {
        manufacturer: device.name?.split(' ')[0] || 'Unknown',
        services: []
      }
    };
  }

  private identifyDeviceType(device: any): BLEDeviceType {
    const name = (device.name || '').toLowerCase();
    
    // ESP32 WiFi configuration
    if (name.startsWith('lama-config')) {
      return 'esp32-config';
    }
    
    // R02 Ring
    if (name.includes('r02') || name.includes('ring')) {
      return 'ring';
    }
    
    // Smart watch
    if (name.includes('watch')) {
      return 'watch';
    }
    
    // Fitness band
    if (name.includes('band') || name.includes('fit')) {
      return 'band';
    }
    
    // Health sensor
    if (name.includes('heart') || name.includes('hrm') || name.includes('sensor')) {
      return 'sensor';
    }
    
    return 'generic';
  }

  async initialize(): Promise<boolean> {
    return await this.btleService.initialize();
  }

  async startDiscovery(options: { 
    deviceTypes?: BLEDeviceType[],
    allowDuplicates?: boolean,
    scanMode?: 'LowPower' | 'Balanced' | 'LowLatency'
  } = {}): Promise<void> {
    if (this.isScanning) {
      return;
    }

    const state = await this.btleService.getState();
    if (state !== 'PoweredOn') {
      throw new Error('Bluetooth is not powered on');
    }

    // Clear devices for fresh scan
    this.devices.clear();
    
    // Start scan using btleService
    await this.btleService.startScan();
  }

  async stopDiscovery(): Promise<void> {
    await this.btleService.stopScan();
  }

  async connectToDevice(deviceId: string): Promise<any> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error('Device not found');
    }

    // Connect using btleService
    const connectedDevice = await this.btleService.connectToDevice(deviceId);
    
    // Get the appropriate handler for this device type
    const handler = this.handlers.get(device.type) || this.handlers.get('generic');
    if (handler) {
      await handler.initialize(connectedDevice);
    }

    return connectedDevice;
  }

  async disconnectDevice(deviceId: string): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device) {
      return;
    }

    // Get handler and cleanup
    const handler = this.handlers.get(device.type) || this.handlers.get('generic');
    if (handler) {
      await handler.cleanup();
    }

    // Disconnect using native device method if available
    // This would be implemented based on the actual device object
  }

  getDevice(deviceId: string): BLEDevice | undefined {
    return this.devices.get(deviceId);
  }

  getDevices(): BLEDevice[] {
    return Array.from(this.devices.values());
  }

  getConnectedDevices(): BLEDevice[] {
    return Array.from(this.devices.values()).filter(d => d.isConnected);
  }

  async getState(): Promise<string> {
    return await this.btleService.getState();
  }

  async isBTLEAvailable(): Promise<boolean> {
    return await this.btleService.isBTLEAvailable();
  }

  cleanup(): void {
    this.removeAllListeners();
    this.btleService.removeAllListeners();
    this.devices.clear();
    this.handlers.clear();
  }
}