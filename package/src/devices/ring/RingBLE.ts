/**
 * R02 Ring BLE Service
 * Handles communication with R02 smart rings
 */

import { EventEmitter } from 'events';
import { btleService } from '../BLETurboModule';
import { Device, Characteristic, Service } from 'react-native-ble-plx';

// R02 Ring Service UUIDs (standard and custom)
const SERVICE_UUIDS = {
  HEART_RATE: '180D',  // Standard Heart Rate Service
  BATTERY: '180F',     // Standard Battery Service
  DEVICE_INFO: '180A', // Standard Device Information Service
  CUSTOM_R02: '6E400001-B5A3-F393-E0A9-E50E24DCCA9E', // Nordic UART Service (common for custom data)
};

const CHARACTERISTIC_UUIDS = {
  HEART_RATE_MEASUREMENT: '2A37',
  BATTERY_LEVEL: '2A19',
  SPO2: '2A5E', // Pulse Oximeter
  CUSTOM_TX: '6E400003-B5A3-F393-E0A9-E50E24DCCA9E', // Nordic UART TX (from device)
  CUSTOM_RX: '6E400002-B5A3-F393-E0A9-E50E24DCCA9E', // Nordic UART RX (to device)
};

// R02 Command Protocol
enum CommandType {
  HEART_RATE = 0x01,
  SPO2 = 0x02,
  TEMPERATURE = 0x03,
  STEPS = 0x04,
  BATTERY = 0x05,
  SLEEP = 0x06,
  SLEEP_HISTORY = 0x07,
  SET_TIME = 0x08,
  DEVICE_INFO = 0x09,
  RESET = 0x0A,
  CALIBRATE = 0x0B
}

export interface HealthData {
  heartRate?: number;
  spo2?: number;
  temperature?: number;
  steps?: number;
  battery?: number;
  timestamp: Date;
}

export interface SleepData {
  startTime: Date;
  endTime: Date;
  quality: 'awake' | 'light' | 'deep' | 'rem';
  duration: number; // minutes
}

export class R02RingService extends EventEmitter {
  private device: Device | null = null;
  private subscriptions: Map<string, any> = new Map();
  private isConnected: boolean = false;
  private lastHealthData: HealthData | null = null;

  constructor() {
    super();
  }

  /**
   * Connect to R02 ring
   */
  async connect(deviceId: string): Promise<boolean> {
    try {
      console.log(`[R02RingService] Connecting to device ${deviceId}`);
      
      // Connect to device
      this.device = await btleService.connectToDevice(deviceId);
      
      if (!this.device) {
        throw new Error('Failed to connect to device');
      }

      // Discover all services and characteristics
      await this.device.discoverAllServicesAndCharacteristics();
      
      this.isConnected = true;
      this.emit('connected', deviceId);
      
      // Start monitoring available characteristics
      await this.setupNotifications();
      
      // Get initial readings
      await this.readInitialData();
      
      console.log(`[R02RingService] Successfully connected to ${deviceId}`);
      return true;
    } catch (error) {
      console.error('[R02RingService] Connection failed:', error);
      this.isConnected = false;
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Disconnect from device
   */
  async disconnect(): Promise<void> {
    try {
      // Cancel all subscriptions
      for (const [key, subscription] of this.subscriptions) {
        subscription.remove();
      }
      this.subscriptions.clear();

      // Disconnect device
      if (this.device) {
        await this.device.cancelConnection();
      }

      this.device = null;
      this.isConnected = false;
      this.emit('disconnected');
    } catch (error) {
      console.error('[R02RingService] Disconnect error:', error);
    }
  }

  /**
   * Setup notifications for real-time data
   */
  private async setupNotifications(): Promise<void> {
    if (!this.device) return;

    try {
      // Monitor heart rate
      const hrSubscription = this.device.monitorCharacteristicForService(
        SERVICE_UUIDS.HEART_RATE,
        CHARACTERISTIC_UUIDS.HEART_RATE_MEASUREMENT,
        (error, characteristic) => {
          if (error) {
            console.error('[R02RingService] Heart rate monitor error:', error);
            return;
          }
          if (characteristic?.value) {
            const heartRate = this.parseHeartRate(characteristic.value);
            this.updateHealthData({ heartRate });
          }
        }
      );
      this.subscriptions.set('heartRate', hrSubscription);

      // Monitor custom data channel for SPO2 and other data
      const customSubscription = this.device.monitorCharacteristicForService(
        SERVICE_UUIDS.CUSTOM_R02,
        CHARACTERISTIC_UUIDS.CUSTOM_TX,
        (error, characteristic) => {
          if (error) {
            console.error('[R02RingService] Custom data monitor error:', error);
            return;
          }
          if (characteristic?.value) {
            this.parseCustomData(characteristic.value);
          }
        }
      );
      this.subscriptions.set('custom', customSubscription);

    } catch (error) {
      console.error('[R02RingService] Failed to setup notifications:', error);
    }
  }

  /**
   * Read initial data from device
   */
  private async readInitialData(): Promise<void> {
    if (!this.device) return;

    try {
      // Read battery level
      const battery = await this.readBatteryLevel();
      if (battery !== null) {
        this.updateHealthData({ battery });
      }

      // Request current readings via custom command
      await this.sendCommand(CommandType.HEART_RATE);
      await this.sendCommand(CommandType.SPO2);
      await this.sendCommand(CommandType.STEPS);

    } catch (error) {
      console.error('[R02RingService] Failed to read initial data:', error);
    }
  }

  /**
   * Read battery level
   */
  private async readBatteryLevel(): Promise<number | null> {
    if (!this.device) return null;

    try {
      const characteristic = await this.device.readCharacteristicForService(
        SERVICE_UUIDS.BATTERY,
        CHARACTERISTIC_UUIDS.BATTERY_LEVEL
      );
      
      if (characteristic?.value) {
        // Battery level is a single byte 0-100
        const bytes = Buffer.from(characteristic.value, 'base64');
        return bytes[0];
      }
    } catch (error) {
      console.error('[R02RingService] Failed to read battery:', error);
    }
    
    return null;
  }

  /**
   * Send command to device
   */
  private async sendCommand(command: CommandType, data?: Buffer): Promise<void> {
    if (!this.device) return;

    try {
      // Build packet according to R02 protocol
      const packet = this.buildPacket(command, data);
      const base64Data = packet.toString('base64');

      await this.device.writeCharacteristicWithResponseForService(
        SERVICE_UUIDS.CUSTOM_R02,
        CHARACTERISTIC_UUIDS.CUSTOM_RX,
        base64Data
      );
    } catch (error) {
      console.error('[R02RingService] Failed to send command:', error);
    }
  }

  /**
   * Build R02 protocol packet
   */
  private buildPacket(command: CommandType, data?: Buffer): Buffer {
    const PACKET_SIZE = 16;
    const HEADER = 0xAA;
    const FOOTER = 0x55;
    
    const packet = Buffer.alloc(PACKET_SIZE);
    packet[0] = HEADER;
    packet[1] = command;
    
    if (data) {
      const dataLength = Math.min(data.length, 12);
      packet[2] = dataLength;
      data.copy(packet, 3, 0, dataLength);
    } else {
      packet[2] = 0;
    }
    
    packet[15] = FOOTER;
    packet[14] = this.calculateChecksum(packet);
    
    return packet;
  }

  /**
   * Calculate packet checksum
   */
  private calculateChecksum(packet: Buffer): number {
    let sum = 0;
    for (let i = 0; i < 14; i++) {
      sum += packet[i];
    }
    return sum & 0xFF;
  }

  /**
   * Parse heart rate data
   */
  private parseHeartRate(base64Value: string): number {
    const bytes = Buffer.from(base64Value, 'base64');
    
    // Heart Rate Measurement characteristic format:
    // Byte 0: Flags
    // Byte 1: Heart Rate Value (uint8) if flag bit 0 is 0
    // Byte 1-2: Heart Rate Value (uint16) if flag bit 0 is 1
    
    const flags = bytes[0];
    const is16Bit = (flags & 0x01) === 1;
    
    if (is16Bit) {
      return bytes.readUInt16LE(1);
    } else {
      return bytes[1];
    }
  }

  /**
   * Parse custom R02 data packet
   */
  private parseCustomData(base64Value: string): void {
    const bytes = Buffer.from(base64Value, 'base64');
    
    // Check packet validity
    if (bytes.length < 16 || bytes[0] !== 0xAA || bytes[15] !== 0x55) {
      console.warn('[R02RingService] Invalid packet received');
      return;
    }

    const command = bytes[1] as CommandType;
    const dataLength = bytes[2];
    const data = bytes.slice(3, 3 + dataLength);

    switch (command) {
      case CommandType.HEART_RATE:
        if (dataLength >= 1) {
          const heartRate = data[0];
          this.updateHealthData({ heartRate });
        }
        break;

      case CommandType.SPO2:
        if (dataLength >= 1) {
          const spo2 = data[0];
          this.updateHealthData({ spo2 });
        }
        break;

      case CommandType.TEMPERATURE:
        if (dataLength >= 2) {
          // Temperature in 0.1°C units
          const temp = data.readInt16LE(0) / 10.0;
          this.updateHealthData({ temperature: temp });
        }
        break;

      case CommandType.STEPS:
        if (dataLength >= 4) {
          const steps = data.readUInt32LE(0);
          this.updateHealthData({ steps });
        }
        break;

      case CommandType.BATTERY:
        if (dataLength >= 1) {
          const battery = data[0];
          this.updateHealthData({ battery });
        }
        break;

      case CommandType.SLEEP:
        if (dataLength >= 6) {
          this.parseSleepData(data);
        }
        break;

      default:
        console.log(`[R02RingService] Received unknown command: ${command}`);
    }
  }

  /**
   * Parse sleep data
   */
  private parseSleepData(data: Buffer): void {
    // Sleep data format:
    // Bytes 0-1: Start time (minutes since midnight)
    // Bytes 2-3: Duration (minutes)
    // Byte 4: Quality (0=awake, 1=light, 2=deep, 3=rem)
    
    const startMinutes = data.readUInt16LE(0);
    const duration = data.readUInt16LE(2);
    const quality = data[4];
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const startTime = new Date(today.getTime() + startMinutes * 60000);
    const endTime = new Date(startTime.getTime() + duration * 60000);
    
    const qualityMap = ['awake', 'light', 'deep', 'rem'] as const;
    
    const sleepData: SleepData = {
      startTime,
      endTime,
      quality: qualityMap[quality] || 'awake',
      duration
    };
    
    this.emit('sleepData', sleepData);
  }

  /**
   * Update health data and emit event
   */
  private updateHealthData(partial: Partial<HealthData>): void {
    this.lastHealthData = {
      ...this.lastHealthData,
      ...partial,
      timestamp: new Date()
    } as HealthData;
    
    this.emit('healthData', this.lastHealthData);
    
    // Log for debugging
    console.log('[R02RingService] Health data updated:', this.lastHealthData);
  }

  /**
   * Get latest health data
   */
  getLatestHealthData(): HealthData | null {
    return this.lastHealthData;
  }

  /**
   * Request specific data type
   */
  async requestData(type: 'heartRate' | 'spo2' | 'steps' | 'temperature' | 'battery'): Promise<void> {
    const commandMap = {
      heartRate: CommandType.HEART_RATE,
      spo2: CommandType.SPO2,
      steps: CommandType.STEPS,
      temperature: CommandType.TEMPERATURE,
      battery: CommandType.BATTERY
    };

    await this.sendCommand(commandMap[type]);
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }
}

// Singleton instance
export const r02RingService = new R02RingService();