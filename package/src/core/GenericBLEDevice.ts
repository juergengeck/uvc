/**
 * Generic BLE Device Implementation
 * 
 * Base class for all BLE devices in the system
 */

import { EventEmitter } from 'events';
import { BleManager, Device, Characteristic, Service } from 'react-native-ble-plx';
import { BLEDevice, BLEDeviceType, ConnectionState } from '../types/devices';

export abstract class GenericBLEDevice extends EventEmitter implements BLEDevice {
  public readonly id: string;
  public readonly name: string;
  public readonly type: BLEDeviceType;
  public connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  
  protected device: Device;
  protected bleManager: BleManager;
  protected services: Map<string, Service> = new Map();
  protected characteristics: Map<string, Characteristic> = new Map();

  constructor(device: Device, bleManager: BleManager, type: BLEDeviceType) {
    super();
    this.device = device;
    this.bleManager = bleManager;
    this.id = device.id;
    this.name = device.name || device.localName || 'Unknown Device';
    this.type = type;

    this.setupDeviceListeners();
  }

  async connect(): Promise<void> {
    try {
      this.connectionState = ConnectionState.CONNECTING;
      this.emit('connectionStateChanged', this.connectionState);

      this.device = await this.bleManager.connectToDevice(this.id);
      await this.device.discoverAllServicesAndCharacteristics();

      this.connectionState = ConnectionState.CONNECTED;
      this.emit('connectionStateChanged', this.connectionState);
      this.emit('connected');

      await this.onConnected();
    } catch (error) {
      this.connectionState = ConnectionState.DISCONNECTED;
      this.emit('connectionStateChanged', this.connectionState);
      this.emit('error', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.connectionState = ConnectionState.DISCONNECTING;
      this.emit('connectionStateChanged', this.connectionState);

      await this.bleManager.cancelDeviceConnection(this.id);
      
      this.connectionState = ConnectionState.DISCONNECTED;
      this.emit('connectionStateChanged', this.connectionState);
      this.emit('disconnected');

      await this.onDisconnected();
    } catch (error) {
      this.connectionState = ConnectionState.DISCONNECTED;
      this.emit('connectionStateChanged', this.connectionState);
      this.emit('error', error);
      throw error;
    }
  }

  async writeCharacteristic(serviceUUID: string, characteristicUUID: string, data: string): Promise<void> {
    try {
      if (this.connectionState !== ConnectionState.CONNECTED) {
        throw new Error('Device not connected');
      }

      await this.device.writeCharacteristicWithResponseForService(
        serviceUUID,
        characteristicUUID,
        data
      );
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async readCharacteristic(serviceUUID: string, characteristicUUID: string): Promise<string> {
    try {
      if (this.connectionState !== ConnectionState.CONNECTED) {
        throw new Error('Device not connected');
      }

      const characteristic = await this.device.readCharacteristicForService(
        serviceUUID,
        characteristicUUID
      );

      return characteristic.value || '';
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async subscribeToCharacteristic(
    serviceUUID: string, 
    characteristicUUID: string,
    callback: (data: string) => void
  ): Promise<void> {
    try {
      if (this.connectionState !== ConnectionState.CONNECTED) {
        throw new Error('Device not connected');
      }

      this.device.monitorCharacteristicForService(
        serviceUUID,
        characteristicUUID,
        (error, characteristic) => {
          if (error) {
            this.emit('error', error);
            return;
          }

          if (characteristic?.value) {
            callback(characteristic.value);
          }
        }
      );
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  getSignalStrength(): number {
    return this.device.rssi || -999;
  }

  getBatteryLevel(): Promise<number | null> {
    // Default implementation - override in subclasses
    return Promise.resolve(null);
  }

  /**
   * Abstract methods to be implemented by subclasses
   */
  abstract getDeviceInfo(): Promise<any>;
  abstract startDataCollection(): Promise<void>;
  abstract stopDataCollection(): Promise<void>;

  /**
   * Lifecycle hooks
   */
  protected async onConnected(): Promise<void> {
    // Override in subclasses
  }

  protected async onDisconnected(): Promise<void> {
    // Override in subclasses
  }

  /**
   * Setup device event listeners
   */
  private setupDeviceListeners(): void {
    // Listen for device disconnection
    this.bleManager.onDeviceDisconnected(this.id, (error, device) => {
      if (error) {
        this.emit('error', error);
      }
      
      this.connectionState = ConnectionState.DISCONNECTED;
      this.emit('connectionStateChanged', this.connectionState);
      this.emit('disconnected');
    });
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.removeAllListeners();
    this.services.clear();
    this.characteristics.clear();
  }
}