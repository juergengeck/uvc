/**
 * BLE Discovery Service
 * 
 * Handles discovery and filtering of BLE devices
 */

import { EventEmitter } from 'events';
import { BleManager, Device } from 'react-native-ble-plx';
import { BLEDeviceType } from '../types/devices';

export interface DiscoveryFilter {
  serviceUUIDs?: string[];
  deviceNames?: string[];
  deviceTypes?: BLEDeviceType[];
  minRSSI?: number;
  allowDuplicates?: boolean;
}

export interface DiscoveredDevice {
  device: Device;
  type: BLEDeviceType;
  confidence: number;
}

export class BLEDiscoveryService extends EventEmitter {
  private bleManager: BleManager;
  private isScanning: boolean = false;
  private discoveredDevices: Map<string, DiscoveredDevice> = new Map();
  private scanTimeout?: NodeJS.Timeout;

  // Known device signatures
  private static readonly DEVICE_SIGNATURES = {
    [BLEDeviceType.R02_RING]: {
      serviceUUIDs: ['6E40FFF0-B5A3-F393-E0A9-E50E24DCCA9E'],
      namePatterns: ['R02', 'Smart Ring']
    },
    [BLEDeviceType.ESP32]: {
      serviceUUIDs: ['0000ffe0-0000-1000-8000-00805f9b34fb'],
      namePatterns: ['ESP32', 'ESP_']
    },
    [BLEDeviceType.HEART_RATE_MONITOR]: {
      serviceUUIDs: ['180D'], // Heart Rate Service
      namePatterns: ['HR', 'Heart']
    },
    [BLEDeviceType.GENERIC]: {
      serviceUUIDs: [],
      namePatterns: []
    }
  };

  constructor(bleManager: BleManager) {
    super();
    this.bleManager = bleManager;
  }

  async startDiscovery(filter?: DiscoveryFilter, timeoutMs: number = 30000): Promise<void> {
    if (this.isScanning) {
      throw new Error('Discovery already in progress');
    }

    try {
      // Check if Bluetooth is enabled
      const state = await this.bleManager.state();
      if (state !== 'PoweredOn') {
        throw new Error(`Bluetooth is not available. State: ${state}`);
      }

      this.isScanning = true;
      this.discoveredDevices.clear();
      this.emit('discoveryStarted');

      // Set up scan timeout
      if (timeoutMs > 0) {
        this.scanTimeout = setTimeout(() => {
          this.stopDiscovery();
        }, timeoutMs);
      }

      // Start scanning
      this.bleManager.startDeviceScan(
        filter?.serviceUUIDs || null,
        {
          allowDuplicates: filter?.allowDuplicates || false
        },
        (error, device) => {
          if (error) {
            this.emit('error', error);
            return;
          }

          if (device) {
            this.handleDiscoveredDevice(device, filter);
          }
        }
      );
    } catch (error) {
      this.isScanning = false;
      this.emit('error', error);
      throw error;
    }
  }

  async stopDiscovery(): Promise<void> {
    if (!this.isScanning) {
      return;
    }

    this.isScanning = false;
    
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = undefined;
    }

    this.bleManager.stopDeviceScan();
    this.emit('discoveryEnded');
  }

  getDiscoveredDevices(): DiscoveredDevice[] {
    return Array.from(this.discoveredDevices.values());
  }

  getDevicesByType(type: BLEDeviceType): DiscoveredDevice[] {
    return this.getDiscoveredDevices().filter(d => d.type === type);
  }

  private handleDiscoveredDevice(device: Device, filter?: DiscoveryFilter): void {
    // Apply RSSI filter
    if (filter?.minRSSI && device.rssi && device.rssi < filter.minRSSI) {
      return;
    }

    // Identify device type
    const deviceType = this.identifyDeviceType(device);
    
    // Apply device type filter
    if (filter?.deviceTypes && !filter.deviceTypes.includes(deviceType)) {
      return;
    }

    // Apply device name filter
    if (filter?.deviceNames) {
      const deviceName = device.name || device.localName || '';
      if (!filter.deviceNames.some(name => deviceName.includes(name))) {
        return;
      }
    }

    // Calculate confidence score
    const confidence = this.calculateConfidence(device, deviceType);

    const discoveredDevice: DiscoveredDevice = {
      device,
      type: deviceType,
      confidence
    };

    // Update or add device
    this.discoveredDevices.set(device.id, discoveredDevice);
    this.emit('deviceDiscovered', discoveredDevice);
  }

  private identifyDeviceType(device: Device): BLEDeviceType {
    const deviceName = (device.name || device.localName || '').toLowerCase();
    const serviceUUIDs = device.serviceUUIDs || [];

    // Check each device type signature
    for (const [type, signature] of Object.entries(BLEDiscoveryService.DEVICE_SIGNATURES)) {
      // Check service UUIDs
      if (signature.serviceUUIDs.length > 0) {
        const hasMatchingService = signature.serviceUUIDs.some(uuid => 
          serviceUUIDs.some(serviceUUID => 
            serviceUUID.toLowerCase() === uuid.toLowerCase()
          )
        );
        if (hasMatchingService) {
          return type as BLEDeviceType;
        }
      }

      // Check name patterns
      if (signature.namePatterns.length > 0) {
        const hasMatchingName = signature.namePatterns.some(pattern =>
          deviceName.includes(pattern.toLowerCase())
        );
        if (hasMatchingName) {
          return type as BLEDeviceType;
        }
      }
    }

    return BLEDeviceType.GENERIC;
  }

  private calculateConfidence(device: Device, deviceType: BLEDeviceType): number {
    let confidence = 0.5; // Base confidence

    // Signal strength bonus
    if (device.rssi) {
      if (device.rssi > -50) confidence += 0.3;
      else if (device.rssi > -70) confidence += 0.2;
      else if (device.rssi > -85) confidence += 0.1;
    }

    // Name match bonus
    if (device.name || device.localName) {
      confidence += 0.2;
    }

    // Service UUID match bonus
    if (device.serviceUUIDs && device.serviceUUIDs.length > 0) {
      const signature = BLEDiscoveryService.DEVICE_SIGNATURES[deviceType];
      if (signature && signature.serviceUUIDs.length > 0) {
        const hasExactMatch = signature.serviceUUIDs.some(uuid =>
          device.serviceUUIDs!.some(serviceUUID =>
            serviceUUID.toLowerCase() === uuid.toLowerCase()
          )
        );
        if (hasExactMatch) {
          confidence += 0.3;
        }
      }
    }

    return Math.min(confidence, 1.0);
  }

  destroy(): void {
    this.stopDiscovery();
    this.removeAllListeners();
    this.discoveredDevices.clear();
  }
}