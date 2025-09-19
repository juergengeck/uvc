/**
 * DeviceRegistry Recipe
 * 
 * Maintains a registry of device ID hashes for retrieval from ONE storage.
 * This allows us to know which devices exist without preloading them all.
 */

import type { UnversionedObjectResult, OneUnversionedObjectInterfaces } from '@OneObjectInterfaces';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Device } from './device';

export interface DeviceRegistry extends OneUnversionedObjectInterfaces {
  readonly $type$: 'DeviceRegistry';
  
  /**
   * Owner of this registry (Person ID hash)
   */
  readonly owner: SHA256IdHash<Person>;
  
  /**
   * List of device ID hashes owned by this person
   */
  readonly devices: SHA256IdHash<Device>[];
  
  /**
   * Timestamp of last update
   */
  readonly lastUpdated: number;
}

/**
 * Recipe definition for DeviceRegistry
 */
export const DeviceRegistryRecipe: UnversionedObjectResult<DeviceRegistry> = {
  $type$: 'Recipe',
  name: 'DeviceRegistry',
  rule: [
    // Type field
    {
      itemprop: '$type$',
      isRequired: true,
      valueType: 'Text',
      value: 'DeviceRegistry'
    },
    // Owner field
    {
      itemprop: 'owner',
      isRequired: true,
      valueType: 'SHA256IdHash'
    },
    // Devices array
    {
      itemprop: 'devices',
      isRequired: true,
      valueType: 'ItemList',
      itemValueType: 'SHA256IdHash'
    },
    // Last updated timestamp
    {
      itemprop: 'lastUpdated',
      isRequired: true,
      valueType: 'Number'
    }
  ]
};

/**
 * Type guard for DeviceRegistry
 */
export function isDeviceRegistry(obj: any): obj is DeviceRegistry {
  return obj && 
    typeof obj === 'object' && 
    obj.$type$ === 'DeviceRegistry' &&
    typeof obj.owner === 'string' &&
    Array.isArray(obj.devices) &&
    typeof obj.lastUpdated === 'number';
}