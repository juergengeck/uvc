/**
 * ESP32 BLE Types
 * 
 * Type definitions for ESP32 WiFi configuration and communication
 */

export interface ESP32WiFiCredentials {
  ssid: string;
  password: string;
  staticIP?: string;
  gateway?: string;
  subnet?: string;
  dns1?: string;
  dns2?: string;
}

export interface ESP32DeviceInfo {
  chipId: string;
  macAddress: string;
  firmwareVersion: string;
  freeHeap: number;
  flashSize: number;
  features: string[];
}

export interface ESP32Status {
  connected: boolean;
  ssid: string;
  ipAddress: string;
  signalStrength: number;
  lastError: string | null;
}

export interface ESP32ScanResult {
  ssids: string[];
  timestamp: Date;
}

export enum ESP32Command {
  CONNECT = 'CONNECT',
  DISCONNECT = 'DISCONNECT',
  SCAN = 'SCAN',
  RESET_WIFI = 'RESET_WIFI',
  GET_STATUS = 'GET_STATUS',
  GET_INFO = 'GET_INFO'
}

export interface ESP32ConfigEvent {
  type: 'wifi_config_sent' | 'wifi_status' | 'wifi_reset' | 'device_info' | 'scan_complete';
  data: any;
  timestamp: Date;
}