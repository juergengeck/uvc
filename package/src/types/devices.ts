/**
 * Health device type definitions
 */

export interface HealthDevice {
  id: string;
  name: string;
  type: DeviceType;
  manufacturer?: string;
  model?: string;
  firmwareVersion?: string;
  batteryLevel?: number;
  isConnected: boolean;
  lastSync?: Date;
  capabilities: DeviceCapability[];
  connectionType: ConnectionType;
}

export enum DeviceType {
  FITNESS_TRACKER = 'fitness_tracker',
  SMART_WATCH = 'smart_watch',
  HEART_RATE_MONITOR = 'heart_rate_monitor',
  BLOOD_PRESSURE_MONITOR = 'blood_pressure_monitor',
  GLUCOSE_METER = 'glucose_meter',
  SCALE = 'scale',
  THERMOMETER = 'thermometer',
  PULSE_OXIMETER = 'pulse_oximeter',
  SLEEP_TRACKER = 'sleep_tracker',
  ECG_MONITOR = 'ecg_monitor',
  SMART_RING = 'smart_ring',
  BIKE_COMPUTER = 'bike_computer',
  RUNNING_POD = 'running_pod',
  OTHER = 'other'
}

export enum DeviceCapability {
  HEART_RATE = 'heart_rate',
  STEPS = 'steps',
  DISTANCE = 'distance',
  CALORIES = 'calories',
  SLEEP = 'sleep',
  BLOOD_PRESSURE = 'blood_pressure',
  BLOOD_GLUCOSE = 'blood_glucose',
  TEMPERATURE = 'temperature',
  OXYGEN_SATURATION = 'oxygen_saturation',
  ECG = 'ecg',
  ACTIVITY_TRACKING = 'activity_tracking',
  GPS = 'gps',
  WATER_RESISTANCE = 'water_resistance',
  NOTIFICATIONS = 'notifications',
  MUSIC_CONTROL = 'music_control',
  STRESS_MONITORING = 'stress_monitoring',
  BREATHING_EXERCISES = 'breathing_exercises',
  BODY_COMPOSITION = 'body_composition',
  HRV = 'hrv', // Heart Rate Variability
  VO2_MAX = 'vo2_max',
  TRAINING_LOAD = 'training_load',
  RECOVERY_TIME = 'recovery_time'
}

export enum ConnectionType {
  BLUETOOTH = 'bluetooth',
  BLUETOOTH_LE = 'bluetooth_le',
  WIFI = 'wifi',
  USB = 'usb',
  NFC = 'nfc',
  ANT_PLUS = 'ant_plus',
  CELLULAR = 'cellular'
}

export interface DeviceConnection {
  deviceId: string;
  connectionType: ConnectionType;
  address?: string; // MAC address or other identifier
  rssi?: number; // Signal strength
  isConnected: boolean;
  isPaired: boolean;
  lastConnected?: Date;
  connectionAttempts?: number;
  error?: string;
}

export interface DeviceData {
  deviceId: string;
  timestamp: Date;
  data: Record<string, any>;
  raw?: any; // Raw data from device
}

export interface DeviceSyncStatus {
  deviceId: string;
  lastSync: Date;
  nextSync?: Date;
  syncInProgress: boolean;
  recordsSynced: number;
  recordsPending: number;
  errors?: string[];
}

export interface DeviceConfiguration {
  deviceId: string;
  settings: {
    syncInterval?: number; // in minutes
    notificationsEnabled?: boolean;
    autoSync?: boolean;
    dataRetention?: number; // days to keep data
    units?: {
      distance?: 'km' | 'miles';
      weight?: 'kg' | 'lbs';
      temperature?: 'celsius' | 'fahrenheit';
    };
    goals?: Record<string, number>;
    alerts?: {
      heartRateHigh?: number;
      heartRateLow?: number;
      inactivityAlert?: boolean;
      goalAlerts?: boolean;
    };
  };
}

export interface BLECharacteristic {
  uuid: string;
  properties: string[];
  value?: any;
  descriptors?: BLEDescriptor[];
}

export interface BLEDescriptor {
  uuid: string;
  value?: any;
}

export interface BLEService {
  uuid: string;
  isPrimary: boolean;
  characteristics: BLECharacteristic[];
}

export interface BLEDevice {
  id: string;
  name?: string;
  rssi?: number;
  advertisementData?: {
    serviceUUIDs?: string[];
    manufacturerData?: ArrayBuffer;
    serviceData?: Record<string, ArrayBuffer>;
    txPowerLevel?: number;
    isConnectable?: boolean;
  };
  services?: BLEService[];
}

export interface DeviceCommand {
  command: string;
  parameters?: any;
  response?: any;
  timestamp: Date;
  status: 'pending' | 'sent' | 'acknowledged' | 'completed' | 'failed';
  error?: string;
}

export interface DeviceFirmware {
  currentVersion: string;
  availableVersion?: string;
  updateAvailable: boolean;
  lastChecked: Date;
  updateUrl?: string;
  releaseNotes?: string;
}

export interface DeviceCalibration {
  deviceId: string;
  type: string;
  value: any;
  timestamp: Date;
  expiresAt?: Date;
  notes?: string;
}