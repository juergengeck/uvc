import type { SHA256IdHash, SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person, Instance, VersionNode } from '@refinio/one.core/lib/recipes.js';

/**
 * Device object in the ONE architecture.
 * 
 * This is a versioned ONE object for device state.
 * It references a Person object through the owner field.
 */
export interface Device {
  // Standard ONE object type field
  $type$: 'Device';
  
  // Reference to Person object's ID hash - this is the isID field (device owner)
  owner: SHA256IdHash<Person>;
  
  // Device name - this is also part of the isID field
  name: string;
  
  // Original device ID (from discovery) for reference
  deviceId: string;
  
  // Device type classification
  deviceType: string;
  
  // Network information
  address: string;
  port: number;
  
  // Device capabilities as an array of capability strings
  capabilities: string[];
  
  // Hardware identifiers
  macAddress?: string;
  serialNumber?: string;
  
  // Credential reference
  credentialId?: string;
  
  // Status flags
  hasValidCredential: boolean;
  firmwareVersion?: string;
  
  // Timestamps
  firstSeen: number;
  lastSeen: number;
  
  // Online status (for runtime use, not persisted)
  online?: boolean;
  
  // Additional metadata as a JSON string
  metadata?: string;
}

/**
 * Device Settings in the ONE architecture.
 * 
 * This is a versioned ONE object for storing device configuration.
 * The 'forDevice' field serves as the isID field, storing the idHash of 
 * the Device this settings object belongs to.
 */
export interface DeviceSettings {
  // Standard ONE object type field
  $type$: 'DeviceSettings';
  
  // Reference to Device ID hash - this is the isID field
  forDevice: SHA256IdHash<Device>;
  
  // Original device ID for convenience (not used for idHash calculation)
  deviceId: string;
  
  // User-defined name/nickname for the device
  displayName: string;
  
  // Connection state
  isConnected: boolean;
  autoConnect: boolean;
  
  // User preferences
  icon?: string;
  color?: string;
  group?: string;
  
  // Device configuration options
  notifications: boolean;
  autoUpdate: boolean;
  permissions: string[];
  customFields?: Map<string, string>;
  
  // User note about this device
  note?: string;
  
  // Last modified timestamp
  lastModified: number;
  
  // Who modified these settings
  modifiedBy?: SHA256IdHash<Person>;
}

/**
 * Device List in the ONE architecture.
 * 
 * This is a versioned ONE object for storing references to owned devices.
 * It stores ID hashes of ESP32Device objects that are owned by a person.
 */
export interface DeviceList {
  // Standard ONE object type field
  $type$: 'DeviceList';
  
  // Owner of this device list (isID field)
  owner: SHA256IdHash<Person>;
  
  // Array of device ID hashes (references to Device objects)
  devices: SHA256IdHash<Device>[];
}

/**
 * Result of a device registration operation.
 */
export interface DeviceRegistrationResult {
  success: boolean;
  deviceId?: string;
  credential?: any; // VerifiableCredential from @OneObjectInterfaces
  error?: string;
}

/**
 * Device data presentation format
 */
export type DeviceDataFormat = 'json' | 'binary' | 'text';

/**
 * Device data presentation configuration
 */
export interface ESP32DataPresentation {
  $type$: 'ESP32DataPresentation';
  format: DeviceDataFormat;
}

/**
 * Device QUIC configuration
 */
export interface DeviceQuicConfig {
  port?: number;
  host?: string;
  maxDatagramSize?: number;
  discoveryPort?: number;
}

/**
 * Device settings interface for compatibility with old code
 * @deprecated Use DeviceSettings instead
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
  autoConnect: boolean;
  defaultDataPresentation: ESP32DataPresentation;
}

// Recipe definitions
import type { Recipe } from '@refinio/one.core/lib/recipes.js';

export const DeviceRecipe: Recipe = {
  $type$: 'Recipe',
  name: 'Device',
  rule: [
    { itemprop: 'owner', isId: true, itemtype: { type: 'referenceToId', allowedTypes: new Set(['Person']) } },
    { itemprop: 'name', isId: true, itemtype: { type: 'string' } },
    { itemprop: 'deviceId', itemtype: { type: 'string' } },
    { itemprop: 'deviceType', itemtype: { type: 'string' } },
    { itemprop: 'address', itemtype: { type: 'string' } },
    { itemprop: 'port', itemtype: { type: 'number' } },
    { itemprop: 'capabilities', itemtype: { type: 'array', item: { type: 'string' } } },
    { itemprop: 'macAddress', itemtype: { type: 'string' }, optional: true },
    { itemprop: 'serialNumber', itemtype: { type: 'string' }, optional: true },
    { itemprop: 'credentialId', itemtype: { type: 'string' }, optional: true },
    { itemprop: 'hasValidCredential', itemtype: { type: 'boolean' } },
    { itemprop: 'firmwareVersion', itemtype: { type: 'string' }, optional: true },
    { itemprop: 'firstSeen', itemtype: { type: 'number' } },
    { itemprop: 'lastSeen', itemtype: { type: 'number' } },
    { itemprop: 'online', itemtype: { type: 'boolean' }, optional: true },
    { itemprop: 'metadata', itemtype: { type: 'string' }, optional: true }
  ]
};

export const DeviceSettingsRecipe: Recipe = {
  $type$: 'Recipe',
  name: 'DeviceSettings',
  rule: [
    { itemprop: 'forDevice', isId: true, itemtype: { type: 'referenceToId', allowedTypes: new Set(['Device']) } },
    { itemprop: 'deviceId', itemtype: { type: 'string' } },
    { itemprop: 'displayName', itemtype: { type: 'string' } },
    { itemprop: 'isConnected', itemtype: { type: 'boolean' } },
    { itemprop: 'autoConnect', itemtype: { type: 'boolean' } },
    { itemprop: 'icon', itemtype: { type: 'string' }, optional: true },
    { itemprop: 'color', itemtype: { type: 'string' }, optional: true },
    { itemprop: 'group', itemtype: { type: 'string' }, optional: true },
    { itemprop: 'notifications', itemtype: { type: 'boolean' } },
    { itemprop: 'autoUpdate', itemtype: { type: 'boolean' } },
    { itemprop: 'permissions', itemtype: { type: 'array', item: { type: 'string' } } },
    { itemprop: 'customFields', itemtype: { type: 'map', key: { type: 'string' }, value: { type: 'string' } }, optional: true },
    { itemprop: 'note', itemtype: { type: 'string' }, optional: true },
    { itemprop: 'lastModified', itemtype: { type: 'number' } },
    { itemprop: 'modifiedBy', itemtype: { type: 'referenceToId', allowedTypes: new Set(['Person']) }, optional: true }
  ]
};

export const DeviceListRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'DeviceList',
    rule: [
        {
            itemprop: 'owner',
            itemtype: {type: 'referenceToId', allowedTypes: new Set(['Person'])},
            isId: true
        },
        {
            itemprop: 'devices',
            itemtype: {
                type: 'array',
                item: { type: 'referenceToId', allowedTypes: new Set(['Device']) }
            }
        }
    ]
};

// Add ONE Core type augmentation
declare module '@OneObjectInterfaces' {
  interface OneVersionedObjectInterfaces {
    Device: Device;
    // DeviceSettings is already defined in @OneObjectInterfaces.d.ts  
    DeviceList: DeviceList;
  }
  
  interface OneUnversionedObjectInterfaces {
    ESP32DataPresentation: ESP32DataPresentation;
    // DeviceSettingsGroup is already defined in @OneObjectInterfaces.d.ts
  }
  
  interface OneIdObjectInterfaces {
    // The ID-only interfaces used for idHash generation
    Device: Pick<Device, '$type$' | 'owner' | 'name'>;
    // DeviceSettings is already defined with 'forDevice' as ID field
    DeviceList: Pick<DeviceList, '$type$' | 'owner'>;
  }
} 