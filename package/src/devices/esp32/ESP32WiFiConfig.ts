/**
 * ESP32 WiFi Configuration via BLE
 * 
 * Handles WiFi provisioning for ESP32 devices through BLE communication
 */

import { GenericBLEDevice } from '../../core/GenericBLEDevice';
import { BleManager, Device } from 'react-native-ble-plx';
import { BLEDeviceType } from '../../types/devices';
import { ESP32WiFiCredentials, ESP32DeviceInfo, ESP32Status } from '../../types/esp32';

export class ESP32WiFiConfig extends GenericBLEDevice {
  private static readonly SERVICE_UUID = '0000ffe0-0000-1000-8000-00805f9b34fb';
  private static readonly CHAR_WIFI_SSID = '0000ffe1-0000-1000-8000-00805f9b34fb';
  private static readonly CHAR_WIFI_PASSWORD = '0000ffe2-0000-1000-8000-00805f9b34fb';
  private static readonly CHAR_WIFI_STATUS = '0000ffe3-0000-1000-8000-00805f9b34fb';
  private static readonly CHAR_DEVICE_INFO = '0000ffe4-0000-1000-8000-00805f9b34fb';
  private static readonly CHAR_CONTROL = '0000ffe5-0000-1000-8000-00805f9b34fb';

  constructor(device: Device, bleManager: BleManager) {
    super(device, bleManager, BLEDeviceType.ESP32);
  }

  async getDeviceInfo(): Promise<ESP32DeviceInfo> {
    try {
      const data = await this.readCharacteristic(
        ESP32WiFiConfig.SERVICE_UUID,
        ESP32WiFiConfig.CHAR_DEVICE_INFO
      );

      const deviceInfo = JSON.parse(Buffer.from(data, 'base64').toString());
      
      return {
        chipId: deviceInfo.chipId || 'unknown',
        macAddress: deviceInfo.macAddress || 'unknown',
        firmwareVersion: deviceInfo.firmwareVersion || 'unknown',
        freeHeap: deviceInfo.freeHeap || 0,
        flashSize: deviceInfo.flashSize || 0,
        features: deviceInfo.features || []
      };
    } catch (error) {
      this.emit('error', error);
      throw new Error('Failed to get device info');
    }
  }

  async configureWiFi(credentials: ESP32WiFiCredentials): Promise<void> {
    try {
      if (this.connectionState !== 'connected') {
        throw new Error('Device not connected');
      }

      // Send SSID
      const ssidData = Buffer.from(credentials.ssid, 'utf8').toString('base64');
      await this.writeCharacteristic(
        ESP32WiFiConfig.SERVICE_UUID,
        ESP32WiFiConfig.CHAR_WIFI_SSID,
        ssidData
      );

      // Send password
      const passwordData = Buffer.from(credentials.password, 'utf8').toString('base64');
      await this.writeCharacteristic(
        ESP32WiFiConfig.SERVICE_UUID,
        ESP32WiFiConfig.CHAR_WIFI_PASSWORD,
        passwordData
      );

      // Send optional configuration
      if (credentials.staticIP) {
        const configData = Buffer.from(JSON.stringify({
          staticIP: credentials.staticIP,
          gateway: credentials.gateway,
          subnet: credentials.subnet,
          dns1: credentials.dns1,
          dns2: credentials.dns2
        }), 'utf8').toString('base64');

        await this.writeCharacteristic(
          ESP32WiFiConfig.SERVICE_UUID,
          ESP32WiFiConfig.CHAR_CONTROL,
          configData
        );
      }

      // Trigger WiFi connection
      const connectCommand = Buffer.from('CONNECT', 'utf8').toString('base64');
      await this.writeCharacteristic(
        ESP32WiFiConfig.SERVICE_UUID,
        ESP32WiFiConfig.CHAR_CONTROL,
        connectCommand
      );

      this.emit('wifiConfigSent', credentials);
    } catch (error) {
      this.emit('error', error);
      throw new Error('Failed to configure WiFi');
    }
  }

  async getWiFiStatus(): Promise<ESP32Status> {
    try {
      const data = await this.readCharacteristic(
        ESP32WiFiConfig.SERVICE_UUID,
        ESP32WiFiConfig.CHAR_WIFI_STATUS
      );

      const status = JSON.parse(Buffer.from(data, 'base64').toString());
      
      return {
        connected: status.connected || false,
        ssid: status.ssid || '',
        ipAddress: status.ipAddress || '',
        signalStrength: status.signalStrength || -999,
        lastError: status.lastError || null
      };
    } catch (error) {
      this.emit('error', error);
      throw new Error('Failed to get WiFi status');
    }
  }

  async scanWiFiNetworks(): Promise<string[]> {
    try {
      const scanCommand = Buffer.from('SCAN', 'utf8').toString('base64');
      await this.writeCharacteristic(
        ESP32WiFiConfig.SERVICE_UUID,
        ESP32WiFiConfig.CHAR_CONTROL,
        scanCommand
      );

      // Wait for scan results
      await new Promise(resolve => setTimeout(resolve, 3000));

      const data = await this.readCharacteristic(
        ESP32WiFiConfig.SERVICE_UUID,
        ESP32WiFiConfig.CHAR_CONTROL
      );

      const networks = JSON.parse(Buffer.from(data, 'base64').toString());
      return networks.ssids || [];
    } catch (error) {
      this.emit('error', error);
      throw new Error('Failed to scan WiFi networks');
    }
  }

  async resetWiFiConfig(): Promise<void> {
    try {
      const resetCommand = Buffer.from('RESET_WIFI', 'utf8').toString('base64');
      await this.writeCharacteristic(
        ESP32WiFiConfig.SERVICE_UUID,
        ESP32WiFiConfig.CHAR_CONTROL,
        resetCommand
      );

      this.emit('wifiReset');
    } catch (error) {
      this.emit('error', error);
      throw new Error('Failed to reset WiFi config');
    }
  }

  async startDataCollection(): Promise<void> {
    // Subscribe to status updates
    await this.subscribeToCharacteristic(
      ESP32WiFiConfig.SERVICE_UUID,
      ESP32WiFiConfig.CHAR_WIFI_STATUS,
      (data) => {
        try {
          const status = JSON.parse(Buffer.from(data, 'base64').toString());
          this.emit('statusUpdate', status);
        } catch (error) {
          this.emit('error', error);
        }
      }
    );
  }

  async stopDataCollection(): Promise<void> {
    // BLE characteristics monitoring is automatically stopped on disconnect
  }

  protected async onConnected(): Promise<void> {
    try {
      // Get initial device information
      const deviceInfo = await this.getDeviceInfo();
      this.emit('deviceInfo', deviceInfo);

      // Get initial WiFi status
      const wifiStatus = await this.getWiFiStatus();
      this.emit('wifiStatus', wifiStatus);
    } catch (error) {
      this.emit('error', error);
    }
  }

  protected async onDisconnected(): Promise<void> {
    this.emit('configurationEnded');
  }
}