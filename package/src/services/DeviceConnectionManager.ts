/**
 * Device Connection Manager
 * 
 * Manages connections to multiple BLE devices
 */

import { EventEmitter } from 'events';
import { BleManager, Device } from 'react-native-ble-plx';
import { GenericBLEDevice } from '../core/GenericBLEDevice';
import { RingBLE } from '../devices/ring/RingBLE';
import { ESP32WiFiConfig } from '../devices/esp32/ESP32WiFiConfig';
import { BLEDeviceType, ConnectionState } from '../types/devices';

export interface DeviceConnection {
  id: string;
  device: GenericBLEDevice;
  lastSeen: Date;
  autoReconnect: boolean;
}

export class DeviceConnectionManager extends EventEmitter {
  private bleManager: BleManager;
  private connections: Map<string, DeviceConnection> = new Map();
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  private reconnectInterval: number = 5000; // 5 seconds

  constructor(bleManager: BleManager) {
    super();
    this.bleManager = bleManager;
    this.setupBleManagerListeners();
  }

  async connectDevice(
    device: Device, 
    deviceType: BLEDeviceType, 
    autoReconnect: boolean = true
  ): Promise<GenericBLEDevice> {
    try {
      // Check if already connected
      const existing = this.connections.get(device.id);
      if (existing && existing.device.connectionState === ConnectionState.CONNECTED) {
        return existing.device;
      }

      // Create device instance based on type
      const deviceInstance = this.createDeviceInstance(device, deviceType);
      
      // Setup device listeners
      this.setupDeviceListeners(deviceInstance, autoReconnect);

      // Connect
      await deviceInstance.connect();

      // Store connection
      const connection: DeviceConnection = {
        id: device.id,
        device: deviceInstance,
        lastSeen: new Date(),
        autoReconnect
      };
      
      this.connections.set(device.id, connection);
      this.emit('deviceConnected', deviceInstance);

      return deviceInstance;
    } catch (error) {
      this.emit('connectionError', device.id, error);
      throw error;
    }
  }

  async disconnectDevice(deviceId: string): Promise<void> {
    const connection = this.connections.get(deviceId);
    if (!connection) {
      throw new Error('Device not found');
    }

    try {
      // Cancel reconnect timer
      const timer = this.reconnectTimers.get(deviceId);
      if (timer) {
        clearTimeout(timer);
        this.reconnectTimers.delete(deviceId);
      }

      // Disconnect device
      await connection.device.disconnect();
      
      // Remove connection
      this.connections.delete(deviceId);
      this.emit('deviceDisconnected', deviceId);
    } catch (error) {
      this.emit('disconnectionError', deviceId, error);
      throw error;
    }
  }

  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.connections.keys()).map(deviceId =>
      this.disconnectDevice(deviceId).catch(error => 
        this.emit('disconnectionError', deviceId, error)
      )
    );

    await Promise.allSettled(disconnectPromises);
  }

  getConnectedDevices(): GenericBLEDevice[] {
    return Array.from(this.connections.values())
      .filter(conn => conn.device.connectionState === ConnectionState.CONNECTED)
      .map(conn => conn.device);
  }

  getDevice(deviceId: string): GenericBLEDevice | null {
    const connection = this.connections.get(deviceId);
    return connection ? connection.device : null;
  }

  getDevicesByType(deviceType: BLEDeviceType): GenericBLEDevice[] {
    return this.getConnectedDevices().filter(device => device.type === deviceType);
  }

  isConnected(deviceId: string): boolean {
    const connection = this.connections.get(deviceId);
    return connection ? connection.device.connectionState === ConnectionState.CONNECTED : false;
  }

  setAutoReconnect(deviceId: string, enabled: boolean): void {
    const connection = this.connections.get(deviceId);
    if (connection) {
      connection.autoReconnect = enabled;
      
      if (!enabled) {
        // Cancel any pending reconnect
        const timer = this.reconnectTimers.get(deviceId);
        if (timer) {
          clearTimeout(timer);
          this.reconnectTimers.delete(deviceId);
        }
      }
    }
  }

  private createDeviceInstance(device: Device, deviceType: BLEDeviceType): GenericBLEDevice {
    switch (deviceType) {
      case BLEDeviceType.R02_RING:
        return new RingBLE(device, this.bleManager);
      
      case BLEDeviceType.ESP32:
        return new ESP32WiFiConfig(device, this.bleManager);
      
      default:
        // For now, use GenericBLEDevice as fallback
        // In practice, you might want to create specific implementations
        throw new Error(`Unsupported device type: ${deviceType}`);
    }
  }

  private setupDeviceListeners(device: GenericBLEDevice, autoReconnect: boolean): void {
    device.on('connectionStateChanged', (state: ConnectionState) => {
      const connection = this.connections.get(device.id);
      if (connection) {
        connection.lastSeen = new Date();
      }
      
      this.emit('deviceStateChanged', device.id, state);
    });

    device.on('disconnected', () => {
      if (autoReconnect) {
        this.scheduleReconnect(device.id);
      }
      this.emit('deviceDisconnected', device.id);
    });

    device.on('error', (error: Error) => {
      this.emit('deviceError', device.id, error);
      
      // If connection error and auto-reconnect enabled, schedule reconnect
      if (autoReconnect && device.connectionState === ConnectionState.DISCONNECTED) {
        this.scheduleReconnect(device.id);
      }
    });
  }

  private setupBleManagerListeners(): void {
    this.bleManager.onStateChange((state) => {
      this.emit('bleStateChanged', state);
      
      if (state !== 'PoweredOn') {
        // Disconnect all devices when Bluetooth is turned off
        this.disconnectAll();
      }
    }, true);
  }

  private scheduleReconnect(deviceId: string): void {
    // Cancel existing timer
    const existingTimer = this.reconnectTimers.get(deviceId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new reconnect attempt
    const timer = setTimeout(async () => {
      try {
        const connection = this.connections.get(deviceId);
        if (connection && connection.autoReconnect) {
          await connection.device.connect();
          this.emit('deviceReconnected', deviceId);
        }
      } catch (error) {
        this.emit('reconnectionError', deviceId, error);
        
        // Schedule another attempt if still auto-reconnecting
        const connection = this.connections.get(deviceId);
        if (connection && connection.autoReconnect) {
          this.scheduleReconnect(deviceId);
        }
      }
      
      this.reconnectTimers.delete(deviceId);
    }, this.reconnectInterval);

    this.reconnectTimers.set(deviceId, timer);
  }

  destroy(): void {
    // Cancel all reconnect timers
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    // Disconnect all devices
    this.disconnectAll();

    // Cleanup
    this.removeAllListeners();
    this.connections.clear();
  }
}