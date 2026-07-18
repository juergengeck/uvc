import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';
import type { Person } from '@refinio/one.core/lib/recipes.js';

/**
 * Data presentation format for ESP32 devices
 */
export interface ESP32DataPresentation {
  $type$: 'ESP32DataPresentation';
  format: 'json' | 'binary' | 'text';
}

/**
 * QUIC configuration for devices
 */
export interface DeviceQuicConfig {
  port: number;
  host: string;
  secure: boolean;
}

/**
 * Device settings interface
 */
export interface ESP32DeviceSettings {
  id: string;
  name: string;
  enabled: boolean;
  autoConnect: boolean;
  quicConfig: DeviceQuicConfig;
  dataPresentation: ESP32DataPresentation;
  lastConnected?: number;
  personId?: SHA256IdHash<Person>;
}

/**
 * Device settings group interface
 */
export interface DeviceSettingsGroup {
  $type$: 'Settings.device';
  devices: Record<string, ESP32DeviceSettings>;
  discoveryEnabled: boolean;
  discoveryPort: number;
  discoveryBroadcastInterval?: number; // In milliseconds, default 30000
  autoConnect: boolean;
  addOnlyConnectedDevices: boolean;
  defaultDataPresentation: ESP32DataPresentation;
}

/**
 * Device configuration interface
 */
export interface DeviceConfig {
  $type$: 'DeviceConfig';
  id: string;
  name: string;
  discoveryEnabled: boolean;
  discoveryPort: number;
  autoConnect: boolean;
  addOnlyConnectedDevices: boolean;
  defaultDataPresentation: ESP32DataPresentation;
  lastUpdated: number;
}
