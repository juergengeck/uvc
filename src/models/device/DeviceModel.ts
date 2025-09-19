/**
 * DeviceModel - Manages device instances in ONE architecture
 * 
 * Handles device registration, ownership, and credential management
 * by leveraging ONE object storage for persistence.
 */

import { Model } from '@refinio/one.models/lib/models/Model.js';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import { SHA256IdHash, SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';
import { Person } from '@refinio/one.core/lib/recipes.js';
import { DeviceDiscoveryModel } from '../network/DeviceDiscoveryModel';
import { QuicModel } from '../network/QuicModel';
import Debug from 'debug';
import { createCryptoHash } from '@refinio/one.core/lib/system/crypto-helpers.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import { calculateIdHashOfObj, calculateHashOfObj } from '@refinio/one.core/lib/util/object.js';
import { getObject, storeUnversionedObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import { getObjectByIdHash, storeVersionedObject } from '@refinio/one.core/lib/storage-versioned-objects.js';
// Import device types from recipes
import { Device, DeviceSettings, DeviceRegistrationResult, DeviceList } from '../../recipes/device';
import type { VerifiableCredential } from '@OneObjectInterfaces';
import { addRecipeToRuntime, hasRecipe } from '@refinio/one.core/lib/object-recipes.js';
import { DeviceOwnershipLicense } from '@src/recipes/VerifiableCredential';
import type { License } from '@refinio/one.models/lib/recipes/Certificates/License.js';

// Initialize debug logger
const debugLogger = Debug('one:device:model');

/**
 * Runtime device type combining stored device with runtime state
 */
interface RuntimeDevice extends Device {
  // Runtime state fields
  online: boolean;
  connected: boolean;
  discovering: boolean;
  blueLedStatus?: 'on' | 'off' | 'blink';
  sessionId?: string;
  isAuthenticated: boolean;
  discoverySource: 'broadcast' | 'stored' | 'manual';
  status?: string;
}

// DiscoveredDevice interface removed - we now use DiscoveryDevice from interfaces.ts

/**
 * Type guard for DeviceList
 */
function isDeviceList(obj: any): obj is DeviceList {
  return obj && obj.$type$ === 'DeviceList' && Array.isArray(obj.devices);
}

/**
 * Model for managing device instances and credentials
 * following ONE architecture patterns.
 */
export class DeviceModel extends Model {
  // Cache of devices (keyed by deviceId)
  private _devices = new Map<string, Device>();
  
  // Cache of runtime state (keyed by deviceId)
  private _runtimeState = new Map<string, Partial<RuntimeDevice>>();
  
  // Cache of device settings (keyed by deviceId)
  private _deviceSettings = new Map<string, DeviceSettings>();
  
  // Cache of credentials (keyed by id)
  private _credentials = new Map<string, VerifiableCredential>();
  
  // Required models
  private _leuteModel: LeuteModel | null = null;
  private _deviceDiscoveryModel: DeviceDiscoveryModel | null = null;
  
  // Initialization state
  private _initialized: boolean = false;
  private _initializing: boolean = false;
  
  // Anonymous device owner ID hash (for devices not yet owned)
  private _anonymousOwnerIdHash: SHA256IdHash<Person> | null = null;
  
  // Device list for owned devices
  private _deviceList: DeviceList | null = null;
  private _deviceListHash: SHA256Hash<DeviceList> | null = null;
  
  // Events
  public readonly onDeviceRegistered = new OEvent<(device: Device) => void>();
  public readonly onDeviceCredentialIssued = new OEvent<(credential: VerifiableCredential, device: Device) => void>();
  public readonly onDeviceOwnershipChanged = new OEvent<(device: Device, ownerId: SHA256IdHash<Person>) => void>();
  public readonly onDeviceSettingsChanged = new OEvent<(deviceId: string, settings: DeviceSettings) => void>();
  
  // Singleton instance
  private static _instance: DeviceModel | null = null;
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): DeviceModel {
    if (!DeviceModel._instance) {
      DeviceModel._instance = new DeviceModel();
    }
    return DeviceModel._instance;
  }
  
  /**
   * Ensure model is initialized
   */
  public static async ensureInitialized(leuteModel: LeuteModel): Promise<DeviceModel> {
    const instance = DeviceModel.getInstance();
    if (!instance.isInitialized()) {
      await instance.init(leuteModel);
    }
    return instance;
  }
  
  /**
   * Constructor
   */
  constructor() {
    super();
    debugLogger('DeviceModel created');
  }
  
  /**
   * Initialize the device model
   */
  public async init(leuteModel: LeuteModel): Promise<void> {
    // Check if already initialized
    if (this._initialized) {
      debugLogger('Already initialized');
      return;
    }
    
    // Check if already initializing
    if (this._initializing) {
      debugLogger('Initialization already in progress');
      return;
    }
    
    this._initializing = true;
    debugLogger('Initializing device model');
    
    try {
      // Store the leute model
      this._leuteModel = leuteModel;
      
      // Generate anonymous owner ID hash
      this._anonymousOwnerIdHash = await this._getAnonymousOwnerIdHash();
      
      // Get the device discovery model
      try {
        this._deviceDiscoveryModel = DeviceDiscoveryModel.getInstance();
        
        // Set up event listeners for device discovery
        this._deviceDiscoveryModel.onDeviceDiscovered.listen(this._handleDeviceDiscovered.bind(this));
        this._deviceDiscoveryModel.onDeviceUpdated.listen(this._handleDeviceUpdated.bind(this));
        this._deviceDiscoveryModel.onDeviceLost.listen(this._handleDeviceLost.bind(this));
      } catch (e) {
        debugLogger('DeviceDiscoveryModel not available: %o', e);
        // Continue initialization even without the device discovery model
      }
      
      // Load or create device list
      await this._loadOrCreateDeviceList();
      
      // Load stored devices
      await this._loadStoredDevices();
      
      // Mark as initialized
      this._initialized = true;
      this._initializing = false;
      
      debugLogger('Device model initialized successfully');
    } catch (error) {
      this._initializing = false;
      debugLogger('Initialization failed: %o', error);
      throw error;
    }
  }
  
  /**
   * Get anonymous owner ID hash for unowned devices
   * Uses "anonymous" as the email to create a consistent person ID
   */
  private async _getAnonymousOwnerIdHash(): Promise<SHA256IdHash<Person>> {
    // Create a consistent anonymous person ID hash for unowned devices
    const anonymousPersonObject = { 
      $type$: 'Person', 
      email: 'anonymous' 
    } as const;
    
    const personIdHash = await calculateIdHashOfObj(anonymousPersonObject) as SHA256IdHash<Person>;
    return personIdHash;
  }
  
  /**
   * Check if the model is initialized
   */
  public isInitialized(): boolean {
    return this._initialized;
  }
  
  /**
   * Get a device by its deviceId
   */
  public async getDevice(deviceId: string): Promise<Device | null> {
    // Check cache first
    if (this._devices.has(deviceId)) {
      return this._devices.get(deviceId) || null;
    }
    
    // Try to load from storage via discovered devices
    try {
      // For already registered devices, search the cache for matching deviceId property
      const cachedDevices = Array.from(this._devices.values());
      const foundDevice = cachedDevices.find(device => device.deviceId === deviceId);
      if (foundDevice) {
        return foundDevice;
      }
      
      // If discovery model is available, try to find device there
      if (this._deviceDiscoveryModel) {
        const discoveredDevice = this._deviceDiscoveryModel.getDevice(deviceId);
        if (discoveredDevice) {
          // Get device name - use provided name or generate one from ID
          const deviceName = discoveredDevice.name || `Device-${deviceId.substring(0, 8)}`;
          
          // Get the owner - if unowned, use anonymous owner ID
          // If it has an owner already, use that 
          const owner = discoveredDevice.owner || this._anonymousOwnerIdHash;
          
          if (!owner) {
            debugLogger('Cannot create device without owner ID');
            return null;
          }
          
          // Convert to our Device interface - discovered device already has correct properties
          const device: Device = {
            ...discoveredDevice,
            owner,
            name: deviceName,
            capabilities: this._parseCapabilities(discoveredDevice.capabilities),
            firstSeen: discoveredDevice.firstSeen || Date.now(),
            lastSeen: discoveredDevice.lastSeen || Date.now()
          };
          
          // Store in cache and persistent storage
          this._devices.set(deviceId, device);
          await this._storeDevice(device);
          
          // Create default settings if not exist
          await this._ensureDeviceSettings(deviceId, deviceName, false);
          
          return device;
        }
      }
    } catch (error) {
      debugLogger('Error loading device from storage: %o', error);
    }
    
    return null;
  }
  
  /**
   * Get device settings by device ID
   */
  public async getDeviceSettings(deviceId: string): Promise<DeviceSettings | null> {
    // Check cache first
    if (this._deviceSettings.has(deviceId)) {
      return this._deviceSettings.get(deviceId) || null;
    }
    
    try {
      // Get device
      const device = await this.getDevice(deviceId);
      if (!device) {
        return null;
      }
      
      // Calculate the device's idHash with proper typing
      const deviceIdObject = { 
        $type$: 'Device', 
        owner: device.owner,
        name: device.name
      } as const;
      
      const deviceIdHash = await calculateIdHashOfObj(deviceIdObject) as SHA256IdHash<Device>;
      
      // Calculate the settings idHash using the device's idHash as forDevice
      const settingsIdObject = { $type$: 'DeviceSettings', forDevice: deviceIdHash } as const;
      const settingsIdHash = await calculateIdHashOfObj(settingsIdObject);
      
      // Try to load settings from storage
      const result = await getObjectByIdHash(settingsIdHash);
      
      if (result && result.obj) {
        const settingsObj = result.obj as unknown;
        if (typeof settingsObj === 'object' && settingsObj !== null && '$type$' in settingsObj && settingsObj.$type$ === 'DeviceSettings') {
          const settings = settingsObj as DeviceSettings;
          // Update cache
          this._deviceSettings.set(deviceId, settings);
          return settings;
        }
      }
    } catch (error) {
      debugLogger('Error loading device settings from storage: %o', error);
    }
    
    return null;
  }
  
  /**
   * Update device settings
   */
  public async updateDeviceSettings(
    deviceId: string, 
    updatedSettings: Partial<Omit<DeviceSettings, '$type$' | 'forDevice' | 'deviceId' | 'lastModified' | 'modifiedBy'>>
  ): Promise<DeviceSettings | null> {
    // Get existing settings or create defaults
    const settings = await this.getDeviceSettings(deviceId) || 
      await this._createDefaultDeviceSettings(deviceId);
    
    if (!settings) {
      return null;
    }
    
    // Get current user's person ID for tracking who made the change
    let personId: SHA256IdHash<Person> | undefined;
    if (this._leuteModel) {
      try {
        const me = await this._leuteModel.me();
        const profile = await me.mainProfile();
        personId = profile.personId;
      } catch (e) {
        debugLogger('Could not get current user ID: %o', e);
        // Continue without user ID
      }
    }
    
    // Update settings with new values
    const newSettings: DeviceSettings = {
      ...settings,
      ...updatedSettings,
      $type$: 'DeviceSettings', // Ensure type is maintained
      forDevice: settings.forDevice, // Keep original forDevice (it's an isID field)
      deviceId: settings.deviceId, // Keep original deviceId
      lastModified: Date.now(),
      modifiedBy: personId
    };
    
    // Store in versioned storage
    await storeVersionedObject(newSettings);
    
    // Update cache
    this._deviceSettings.set(deviceId, newSettings);
    
    // Emit event
    this.onDeviceSettingsChanged.emit(deviceId, newSettings);
    
    return newSettings;
  }
  
  /**
   * Update device connection state
   */
  public async updateDeviceConnectionState(
    deviceId: string, 
    isConnected: boolean
  ): Promise<DeviceSettings | null> {
    return this.updateDeviceSettings(deviceId, { isConnected });
  }
  
  /**
   * Remove device ownership
   */
  public async removeDeviceOwnership(deviceId: string): Promise<void> {
    if (!this._initialized) {
      throw new Error('DeviceModel not initialized');
    }
    
    try {
      debugLogger('Removing device ownership for %s', deviceId);
      
      // Remove from cache
      this._devices.delete(deviceId);
      this._deviceSettings.delete(deviceId);
      
      // Get the device to find its idHash
      const device = await this.getDevice(deviceId);
      if (device) {
        // Calculate the device's idHash
        const deviceIdObject = { 
          $type$: 'Device', 
          owner: device.owner,
          name: device.name
        } as const;
        const deviceIdHash = await calculateIdHashOfObj(deviceIdObject) as SHA256IdHash<Device>;
        
        // Remove from device list
        await this._removeFromDeviceList(deviceIdHash);
      }
      
      debugLogger('Removed device ownership for %s', deviceId);
    } catch (error) {
      debugLogger('Error removing device ownership: %o', error);
      throw error;
    }
  }

  /**
   * Persist device ownership without sending credentials (for VC-Exchange flow)
   */
  public async persistDeviceOwnership(deviceId: string, ownerId: string): Promise<DeviceRegistrationResult> {
    if (!this._initialized) {
      return {
        success: false,
        error: 'DeviceModel not initialized'
      };
    }
    
    try {
      debugLogger('Persisting device ownership for %s with owner %s', deviceId, ownerId);
      
      // Get the device from discovery
      const discoveredDevice = this._deviceDiscoveryModel?.getDevice(deviceId);
      if (!discoveredDevice) {
        return {
          success: false,
          deviceId,
          error: 'Device not found in discovery'
        };
      }
      
      const personId = ownerId as SHA256IdHash<Person>;
      
      debugLogger('Creating Device object with owner: %s', personId);
      
      // Create a new Device ONE object with owner as the isID field
      // Build the device object explicitly to ensure all required fields
      const newDevice: Device = {
        $type$: 'Device', // Required for ONE versioned object
        owner: personId, // This is the isID field - MUST be SHA256IdHash<Person>
        name: discoveredDevice.name || `Device-${deviceId.substring(0, 8)}`,
        deviceId: discoveredDevice.deviceId || deviceId,
        deviceType: discoveredDevice.deviceType || 'ESP32',
        address: discoveredDevice.address,
        port: discoveredDevice.port,
        capabilities: this._parseCapabilities(discoveredDevice.capabilities),
        hasValidCredential: true, // VC-Exchange already handled this
        firstSeen: discoveredDevice.firstSeen || Date.now(),
        lastSeen: discoveredDevice.lastSeen || Date.now()
      };
      
      debugLogger('Device object to store: %o', newDevice);
      
      // Store the device to get its hash
      const deviceResult = await storeVersionedObject(newDevice);
      const deviceHash = deviceResult.hash;
      debugLogger('Stored device with hash: %s', deviceHash);
      
      // Update the cache with the new device
      this._devices.set(deviceId, newDevice);
      
      // Calculate the device's idHash for settings and device list
      const deviceIdObject = { 
        $type$: 'Device', 
        owner: personId, // Use owner for ID calculation
        name: newDevice.name
      } as const;
      const deviceIdHash = await calculateIdHashOfObj(deviceIdObject) as SHA256IdHash<Device>;
      
      // Add to device list
      await this._addToDeviceList(deviceIdHash);
      
      // Create device settings
      const newSettings: DeviceSettings = {
        $type$: 'DeviceSettings',
        forDevice: deviceIdHash,
        deviceId,
        displayName: discoveredDevice.name || `Device-${deviceId.substring(0, 8)}`,
        isConnected: true, // Already connected via VC-Exchange
        autoConnect: true,
        notifications: true,
        autoUpdate: true,
        permissions: ['owner', 'control', 'configure', 'monitor'],
        lastModified: Date.now(),
        modifiedBy: personId
      };
      
      // Store in versioned storage
      await storeVersionedObject(newSettings);
      
      // Update cache
      this._deviceSettings.set(deviceId, newSettings);
      
      // Emit events
      this.onDeviceOwnershipChanged.emit(newDevice, personId);
      this.onDeviceSettingsChanged.emit(deviceId, newSettings);
      
      return {
        success: true,
        deviceId,
        credentialId: undefined // No credential sent, VC-Exchange handled it
      };
      
    } catch (error) {
      debugLogger('Error persisting device ownership: %o', error);
      return {
        success: false,
        deviceId,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get a runtime device with discovery state
   */
  public async getRuntimeDevice(deviceId: string): Promise<RuntimeDevice | null> {
    const device = await this.getDevice(deviceId);
    if (!device) return null;
    
    // Get runtime state from discovery
    const discoveryDevice = this._deviceDiscoveryModel?.getDevice(deviceId);
    const runtimeState = this._runtimeState.get(deviceId) || {};
    
    // Combine stored device with runtime state
    const runtimeDevice: RuntimeDevice = {
      ...device,
      online: discoveryDevice?.online || runtimeState.online || false,
      connected: discoveryDevice?.connected || runtimeState.connected || false,
      discovering: this._deviceDiscoveryModel?.isDiscovering() || false,
      blueLedStatus: discoveryDevice?.blueLedStatus || runtimeState.blueLedStatus,
      sessionId: discoveryDevice?.sessionId || runtimeState.sessionId,
      isAuthenticated: discoveryDevice?.isAuthenticated || runtimeState.isAuthenticated || false,
      discoverySource: discoveryDevice ? 'broadcast' : 'stored',
      status: discoveryDevice?.status || runtimeState.status
    };
    
    return runtimeDevice;
  }
  
  /**
   * Get all devices as runtime devices
   */
  public async getRuntimeDevices(): Promise<RuntimeDevice[]> {
    const devices = await this.getDevices();
    const runtimeDevices: RuntimeDevice[] = [];
    
    for (const device of devices) {
      const runtimeDevice = await this.getRuntimeDevice(device.deviceId);
      if (runtimeDevice) {
        runtimeDevices.push(runtimeDevice);
      }
    }
    
    return runtimeDevices;
  }

  /**
   * Get all known devices
   */
  public async getDevices(): Promise<Device[]> {
    const devices: Device[] = [];
    const seenDeviceIds = new Set<string>();
    
    debugLogger('Getting all devices...');
    console.log('[DeviceModel] Device list status:', {
      hasDeviceList: !!this._deviceList,
      deviceCount: this._deviceList?.devices?.length || 0
    });
    
    // First, load owned devices from the device list
    if (this._deviceList && this._deviceList.devices.length > 0) {
      console.log('[DeviceModel] Loading devices from device list:', this._deviceList.devices);
      for (const deviceIdHash of this._deviceList.devices) {
        try {
          // Try to load from cache first
          const cachedDevice = Array.from(this._devices.values()).find(d => {
            // Calculate its ID hash to compare
            const idObj = { $type$: 'Device', owner: d.owner, name: d.name } as const;
            // Note: We can't await in find, so we'll load from storage if not in cache
            return false; // Force loading from storage for now
          });
          
          if (cachedDevice) {
            devices.push(cachedDevice);
            seenDeviceIds.add(cachedDevice.deviceId);
          } else {
            // Load from storage
            const result = await getObjectByIdHash(deviceIdHash);
            if (result?.obj && result.obj.$type$ === 'Device') {
              const device = result.obj as Device;
              
              // Add ownerId for UI compatibility - this should match owner unless it's anonymous
              (device as any).ownerId = (device.owner === this._anonymousOwnerIdHash) ? undefined : device.owner;
              
              // Cache the loaded device
              this._devices.set(device.deviceId, device);
              devices.push(device);
              seenDeviceIds.add(device.deviceId);
              debugLogger('Loaded device from storage: %s', device.deviceId);
              console.log('[DeviceModel] Loaded owned device from storage:', {
                deviceId: device.deviceId,
                owner: device.owner,
                ownerId: (device as any).ownerId,
                hasValidCredential: device.hasValidCredential
              });
            }
          }
        } catch (error) {
          debugLogger('Could not load device %s: %o', deviceIdHash, error);
        }
      }
    }
    
    // Then add discovered devices that aren't already in the list
    if (this._deviceDiscoveryModel) {
      const discoveredDevices = this._deviceDiscoveryModel.getDevices();
      console.log('[DeviceModel] Discovered devices:', discoveredDevices.length);
      
      // Process each discovered device
      for (const discoveredDevice of discoveredDevices) {
        if (seenDeviceIds.has(discoveredDevice.deviceId)) continue; // Already loaded
        
        // Debug log to understand the discovered device structure
        console.log('[DeviceModel] Processing discovered device:', {
          deviceId: discoveredDevice.deviceId,
          deviceType: discoveredDevice.deviceType,
          name: discoveredDevice.name,
          hasDeviceId: 'deviceId' in discoveredDevice,
          hasId: 'id' in discoveredDevice,
          hasDeviceType: 'deviceType' in discoveredDevice,
          hasType: 'type' in discoveredDevice
        });
        
        // Check if we already have this device in cache
        let device = this._devices.get(discoveredDevice.deviceId);
        
        if (!device) {
          const deviceId = discoveredDevice.deviceId;
          // Get device name - use provided name or generate one from ID
          const deviceName = discoveredDevice.name || `Device-${deviceId.substring(0, 8)}`;
          
          // For ONE storage, we need an owner ID
          // Use actual owner if device is owned, otherwise use anonymous owner
          const owner = discoveredDevice.ownerId || this._anonymousOwnerIdHash;
          
          if (!owner) {
            debugLogger('Cannot create device without owner ID');
            continue;
          }
          
          // Use the discovered device directly since it already matches Device interface
          device = {
            ...discoveredDevice,
            owner, // Required for ONE storage
            name: deviceName,
            capabilities: this._parseCapabilities(discoveredDevice.capabilities),
            firstSeen: discoveredDevice.firstSeen || Date.now(),
            lastSeen: discoveredDevice.lastSeen || Date.now()
          };
          
          // Add ownerId for UI compatibility - this should match owner unless it's anonymous
          (device as any).ownerId = (owner === this._anonymousOwnerIdHash) ? undefined : owner;
          
          // Store in cache and persistent storage
          this._devices.set(discoveredDevice.deviceId, device);
          await this._storeDevice(device);
          
          // Ensure default settings exist
          await this._ensureDeviceSettings(discoveredDevice.deviceId, deviceName, false);
        } else {
          // Update existing device with latest discovery information
          device.address = discoveredDevice.address;
          device.port = discoveredDevice.port;
          device.lastSeen = discoveredDevice.lastSeen;
          device.hasValidCredential = discoveredDevice.hasValidCredential;
          device.capabilities = this._parseCapabilities(discoveredDevice.capabilities);
          device.online = discoveredDevice.online; // Update online status from discovery
          
          // Update optional properties if they exist
          if (discoveredDevice.macAddress) device.macAddress = discoveredDevice.macAddress;
          if (discoveredDevice.serialNumber) device.serialNumber = discoveredDevice.serialNumber;
          if (discoveredDevice.firmwareVersion) device.firmwareVersion = discoveredDevice.firmwareVersion;
          if (discoveredDevice.ownerId) device.ownerId = discoveredDevice.ownerId; // Update ownership info
          
          // Update in storage
          await this._storeDevice(device);
          
          // Update connection state in settings
          await this.updateDeviceConnectionState(discoveredDevice.deviceId, false);
        }
        
        devices.push(device);
      }
    }
    
    // Add any cached devices not already included
    for (const [deviceId, device] of this._devices.entries()) {
      if (!devices.some(d => d.deviceId === deviceId)) {
        // Ensure capabilities is always an array before returning
        if (!Array.isArray(device.capabilities)) {
          device.capabilities = this._parseCapabilities(device.capabilities);
        }
        devices.push(device);
      }
    }
    
    console.log('[DeviceModel] Returning devices:', devices.map(d => ({ 
      id: d.deviceId, 
      type: d.deviceType,
      online: d.online,
      source: 'getDevices'
    })));
    
    // Debug: log full device objects if any have undefined deviceId
    const devicesWithUndefinedId = devices.filter(d => !d.deviceId);
    if (devicesWithUndefinedId.length > 0) {
      console.log('[DeviceModel] WARNING: Devices with undefined deviceId:', devicesWithUndefinedId);
    }
    
    return devices;
  }
  
  /**
   * Register ownership of a device for the current user
   */
  public async registerDeviceOwnership(deviceId: string): Promise<DeviceRegistrationResult> {
    if (!this._initialized) {
      return {
        success: false,
        error: 'DeviceModel not initialized'
      };
    }
    
    try {
      // Get the device
      const device = await this.getDevice(deviceId);
      if (!device) {
        return {
          success: false,
          deviceId,
          error: 'Device not found'
        };
      }
      
      // Check if device is already owned by a real user (not anonymous)
      if (device.owner !== this._anonymousOwnerIdHash) {
        // This device is already owned by someone
        if (this._leuteModel) {
          const me = await this._leuteModel.me();
          const profile = await me.mainProfile();
          const currentPersonId = profile.personId;
          
          // Device is already owned by current user
          if (currentPersonId && device.owner === currentPersonId) {
            return {
              success: true,
              deviceId
            };
          }
        }
        
        return {
          success: false,
          deviceId,
          error: 'Device is already owned by another user'
        };
      }
      
      // Get current user's person ID
      if (!this._leuteModel) {
        return {
          success: false,
          deviceId,
          error: 'LeuteModel not available'
        };
      }
      
      const me = await this._leuteModel.me();
      const profile = await me.mainProfile();
      const personId = profile.personId;
      
      if (!personId) {
        return {
          success: false,
          deviceId,
          error: 'Could not determine current user ID'
        };
      }
      
      // Create a new device with the current user as owner
      const newDevice: Device = {
        ...device,
        owner: personId  // Change owner to current user
      };
      
      // Store the device first to get its hash
      const deviceResult = await storeVersionedObject(newDevice);
      const deviceHash = deviceResult.hash;
      debugLogger('Stored device with hash: %s', deviceHash);
      
      // Create credential referencing the device object
      const credential = await this._createDeviceCredential(
        personId,
        deviceHash,  // Pass the device hash instead of deviceId
        deviceId,
        device.deviceType
      );
      
      // Send credential to device
      const success = await this._sendCredentialToDevice(
        credential,
        device.address,
        device.port
      );
      
      if (!success) {
        return {
          success: false,
          deviceId,
          error: 'Failed to send credential to device'
        };
      }
      
      // Update device with credential information
      newDevice.hasValidCredential = true;
      newDevice.credentialId = credential.id;
      
      // Replace original device with new one
      this._devices.set(deviceId, newDevice);
      
      // Store updated device again with credential info
      await this._storeDevice(newDevice);
      
      // Calculate new ID hash for device settings
      const newDeviceIdObject = { 
        $type$: 'Device', 
        owner: newDevice.owner,
        name: newDevice.name
      } as const;
      const newDeviceIdHash = await calculateIdHashOfObj(newDeviceIdObject) as SHA256IdHash<Device>;
      
      // Update device settings to reflect ownership
      // First remove old settings and create new ones with new forDevice
      this._deviceSettings.delete(deviceId);
      
      // Create new settings
      const newSettings: DeviceSettings = {
        $type$: 'DeviceSettings',
        forDevice: newDeviceIdHash,
        deviceId, // Keep original ID for convenience
        displayName: device.deviceId,
        isConnected: false, // Initially disconnected
        autoConnect: true,
        notifications: true,
        autoUpdate: true,
        permissions: ['owner', 'control', 'configure', 'monitor'],
        lastModified: Date.now(),
        modifiedBy: personId
      };
      
      // Store in versioned storage
      await storeVersionedObject(newSettings);
      
      // Update cache
      this._deviceSettings.set(deviceId, newSettings);
      
      // Register with device discovery model
      if (this._deviceDiscoveryModel) {
        await this._deviceDiscoveryModel.registerDeviceOwner(deviceId, personId);
      }
      
      // Emit events
      this.onDeviceOwnershipChanged.emit(newDevice, personId);
      this.onDeviceSettingsChanged.emit(deviceId, newSettings);
      
      return {
        success: true,
        deviceId,
        credential
      };
    } catch (error) {
      debugLogger('Error registering device ownership: %o', error);
      return {
        success: false,
        deviceId,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Create a device credential
   */
  private async _createDeviceCredential(
    ownerId: SHA256IdHash<Person>,
    deviceHash: SHA256Hash<Device>,
    deviceId: string,
    deviceType: string
  ): Promise<VerifiableCredential> {
    // Generate a unique ID
    const id = `credential-${deviceId}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    const now = Date.now();
    const validUntil = now + (365 * 24 * 60 * 60 * 1000); // 1 year
    
    // Store the license and get its hash
    const licenseResult = await storeUnversionedObject(DeviceOwnershipLicense);
    const licenseHash = licenseResult.hash as SHA256Hash<License>;
    
    // Create claims map for device ownership
    const claims = new Map<string, any>([
      ['device_id', deviceId],
      ['device_type', deviceType],
      ['ownership', 'owner'],
      ['permissions', ['control', 'configure', 'monitor']]
    ]);
    
    // Create the credential object
    const credential: VerifiableCredential = {
      $type$: 'VerifiableCredential',
      id,
      issuer: ownerId,
      subject: deviceHash,  // Reference to the actual Device object
      credentialType: 'DeviceOwnership',
      claims,
      issuedAt: now,
      validUntil,
      license: licenseHash,
      proof: await this._generateProof(id, ownerId, deviceId),
      revoked: false
    };
    
    // Store in unversioned object storage
    await storeUnversionedObject(credential);
    
    // Update cache
    this._credentials.set(id, credential);
    
    // Emit event
    const device = await this.getDevice(deviceId);
    if (device) {
      this.onDeviceCredentialIssued.emit(credential, device);
    }
    
    return credential;
  }
  
  /**
   * Generate cryptographic proof for a credential
   */
  private async _generateProof(
    id: string,
    ownerId: SHA256IdHash<Person>,
    deviceId: string
  ): Promise<string> {
    // Use createCryptoHash from ONE
    const hashInput = `${id}:${ownerId}:${deviceId}:${Date.now()}`;
    const hash = await createCryptoHash(hashInput);
    return hash.toString();
  }
  
  /**
   * Send a credential to a device
   */
  private async _sendCredentialToDevice(
    credential: VerifiableCredential,
    deviceAddress: string,
    devicePort: number
  ): Promise<boolean> {
    try {
      // Ensure QUIC model is initialized
      const quicModel = QuicModel.getInstance();
      if (!quicModel.isInitialized()) {
        await quicModel.init();
      }
      
      // Create a UDP socket
      const socket = await quicModel.createUdpSocket({
        type: 'udp4',
        reuseAddr: true
      });
      
      // Convert credential to the format expected by the device
      // Extract claims for device consumption
      const deviceCredential = {
        id: credential.id,
        issuer: credential.issuer.toString(),
        subject: credential.subject.toString(),
        device_id: credential.claims.get('device_id'),
        device_type: credential.claims.get('device_type'),
        issued_at: Math.floor(credential.issuedAt.getTime() / 1000),
        expires_at: credential.validUntil ? Math.floor(credential.validUntil.getTime() / 1000) : 0,
        ownership: credential.claims.get('ownership'),
        permissions: credential.claims.get('permissions').join(','),
        proof: credential.proof,
        is_valid: !credential.revoked
      };
      
      // Create the credential flash packet
      const packet = {
        type: 'credential_flash',
        credential: Buffer.from(JSON.stringify(deviceCredential)).toString('base64'),
        source: 'lama-app',
        timestamp: Date.now()
      };
      
      // Send the packet to the device
      await socket.send(JSON.stringify(packet), devicePort, deviceAddress);
      
      // Wait for acknowledgment (timeout after 5 seconds)
      const timeoutPromise = new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), 5000);
      });
      
      const ackPromise = new Promise<boolean>((resolve) => {
        const handleMessage = (data: Buffer, rinfo: any) => {
          if (rinfo.address === deviceAddress && rinfo.port === devicePort) {
            try {
              const response = JSON.parse(data.toString());
              if (response.type === 'credential_ack' && response.success) {
                socket.removeListener('message', handleMessage);
                resolve(true);
              }
            } catch (e) {
              // Ignore parsing errors
            }
          }
        };
        
        socket.on('message', handleMessage);
        
        // Clean up handler after timeout
        setTimeout(() => {
          socket.removeListener('message', handleMessage);
        }, 5000);
      });
      
      // Wait for acknowledgment or timeout
      const success = await Promise.race([ackPromise, timeoutPromise]);
      
      // Close the socket
      await socket.close();
      
      return success;
    } catch (error) {
      debugLogger('Error sending credential to device: %o', error);
      return false;
    }
  }
  
  /**
   * Store a device in the ONE object store
   */
  private async _storeDevice(device: Device): Promise<void> {
    try {
      // Ensure capabilities is always an array
      if (!Array.isArray(device.capabilities)) {
        device.capabilities = this._parseCapabilities(device.capabilities);
      }
      
      await storeVersionedObject(device);
    } catch (error) {
      debugLogger('Error storing device: %o', error);
    }
  }
  
  /**
   * Parse capabilities from various formats into a string array
   */
  private _parseCapabilities(capabilities: any): string[] {
    if (!capabilities) return [];
    
    if (Array.isArray(capabilities)) {
      return capabilities.map(cap => String(cap));
    }
    
    if (typeof capabilities === 'string') {
      if (capabilities.trim() === '') return [];
      return capabilities.split(',').map(cap => cap.trim()).filter(Boolean);
    }
    
    if (typeof capabilities === 'object' && capabilities !== null) {
      return Object.entries(capabilities)
        .filter(([_, value]) => !!value)
        .map(([key]) => key);
    }
    
    // Default fallback for unexpected types
    debugLogger('Unexpected capabilities format: %o', capabilities);
    return [];
  }
  
  /**
   * Create default device settings
   */
  private async _createDefaultDeviceSettings(
    deviceId: string, 
    deviceName?: string,
    isConnected: boolean = false
  ): Promise<DeviceSettings | null> {
    try {
      // Get the device
      const device = await this.getDevice(deviceId);
      if (!device) {
        debugLogger('Cannot create settings for non-existent device: %s', deviceId);
        return null;
      }
      
      // Calculate the device's idHash with proper typing
      const deviceIdObject = { 
        $type$: 'Device', 
        owner: device.owner,
        name: device.name
      } as const;
      
      const deviceIdHash = await calculateIdHashOfObj(deviceIdObject) as SHA256IdHash<Device>;
      
      // Create default settings
      const settings: DeviceSettings = {
        $type$: 'DeviceSettings',
        forDevice: deviceIdHash,
        deviceId, // Keep original ID for convenience
        displayName: deviceName || device.deviceId,
        isConnected,
        autoConnect: false,
        notifications: true,
        autoUpdate: true,
        permissions: ['view'],
        lastModified: Date.now()
      };
      
      // Store in versioned storage
      await storeVersionedObject(settings);
      
      // Update cache
      this._deviceSettings.set(deviceId, settings);
      
      return settings;
    } catch (error) {
      debugLogger('Error creating default device settings: %o', error);
      return null;
    }
  }
  
  /**
   * Ensure device settings exist
   */
  private async _ensureDeviceSettings(
    deviceId: string, 
    deviceName?: string,
    isConnected: boolean = false
  ): Promise<DeviceSettings | null> {
    // Check if settings already exist
    const existingSettings = await this.getDeviceSettings(deviceId);
    if (existingSettings) {
      // Update connection state if needed
      if (existingSettings.isConnected !== isConnected) {
        return this.updateDeviceSettings(deviceId, { isConnected });
      }
      return existingSettings;
    }
    
    // Create default settings
    return this._createDefaultDeviceSettings(deviceId, deviceName, isConnected);
  }
  
  /**
   * Load or create the device list
   */
  private async _loadOrCreateDeviceList(): Promise<void> {
    try {
      // Calculate the device list ID hash for current user
      const personId = this._leuteModel!.getOwnInstance().personId;
      debugLogger('Loading device list for person: %s', personId);
      
      const deviceListId = {
        $type$: 'DeviceList',
        owner: personId
      } as const;
      
      const deviceListIdHash = await calculateIdHashOfObj(deviceListId) as SHA256IdHash<DeviceList>;
      debugLogger('Device list ID hash: %s', deviceListIdHash);
      
      try {
        // Try to load existing device list
        const result = await getObjectByIdHash(deviceListIdHash);
        if (result?.obj && isDeviceList(result.obj)) {
          this._deviceList = result.obj;
          this._deviceListHash = result.hash;
          debugLogger('Loaded existing device list with %d devices', this._deviceList.devices.length);
          console.log('[DeviceModel] Loaded device list with devices:', this._deviceList.devices);
        }
      } catch (error) {
        // Device list doesn't exist yet, create it
        debugLogger('Device list not found, creating new one: %o', error);
        console.log('[DeviceModel] Device list not found, will create new one');
      }
      
      if (!this._deviceList) {
        // Create new device list
        this._deviceList = {
          $type$: 'DeviceList',
          owner: personId,
          devices: []
        };
        
        const stored = await storeVersionedObject(this._deviceList);
        this._deviceListHash = stored.hash;
        debugLogger('Created new device list');
      }
    } catch (error) {
      debugLogger('Error loading/creating device list: %o', error);
      // Continue without device list - devices will still work from discovery
    }
  }
  
  /**
   * Add a device to the device list
   */
  private async _addToDeviceList(deviceIdHash: SHA256IdHash<Device>): Promise<void> {
    if (!this._deviceList) return;
    
    // Check if already in list
    if (this._deviceList.devices.includes(deviceIdHash)) return;
    
    // Create new device list with added device
    const newDeviceList: DeviceList = {
      ...this._deviceList,
      devices: [...this._deviceList.devices, deviceIdHash]
    };
    
    const stored = await storeVersionedObject(newDeviceList);
    this._deviceList = newDeviceList;
    this._deviceListHash = stored.hash;
    
    debugLogger('Added device to device list, now %d devices', this._deviceList.devices.length);
  }
  
  /**
   * Remove a device from the device list
   */
  private async _removeFromDeviceList(deviceIdHash: SHA256IdHash<Device>): Promise<void> {
    if (!this._deviceList) return;
    
    // Check if in list
    if (!this._deviceList.devices.includes(deviceIdHash)) return;
    
    // Create new device list without the device
    const newDeviceList: DeviceList = {
      ...this._deviceList,
      devices: this._deviceList.devices.filter(d => d !== deviceIdHash)
    };
    
    const stored = await storeVersionedObject(newDeviceList);
    this._deviceList = newDeviceList;
    this._deviceListHash = stored.hash;
    
    debugLogger('Removed device from device list, now %d devices', this._deviceList.devices.length);
  }
  
  /**
   * Load stored devices from the ONE object store
   */
  private async _loadStoredDevices(): Promise<void> {
    // This is now handled by loading devices from the device list on demand
  }
  
  /**
   * Handle device discovered event from DeviceDiscoveryModel
   */
  private async _handleDeviceDiscovered(discoveredDevice: any): Promise<void> {
    try {
      // Get existing device or create new one
      const deviceId = discoveredDevice.deviceId;
      let device = this._devices.get(deviceId);
      
      if (!device) {
        // Get device name - use provided name or generate one from ID
        const deviceName = discoveredDevice.name || `Device-${deviceId.substring(0, 8)}`;
        
        // For ONE storage, we need an owner ID
        // Use actual owner if device is owned, otherwise use anonymous owner
        const owner = discoveredDevice.ownerId || this._anonymousOwnerIdHash;
        
        if (!owner) {
          debugLogger('Cannot create device without owner ID');
          return;
        }
        
        // Create a new Device object
        device = {
          $type$: 'Device',
          owner, // Required for ONE storage
          name: deviceName,
          deviceId: discoveredDevice.deviceId,
          deviceType: discoveredDevice.deviceType,
          address: discoveredDevice.address,
          port: discoveredDevice.port,
          capabilities: this._parseCapabilities(discoveredDevice.capabilities),
          hasValidCredential: discoveredDevice.hasValidCredential,
          firstSeen: Date.now(),
          lastSeen: discoveredDevice.lastSeen,
          online: discoveredDevice.online // Preserve online status from discovery
        } as Device;
        
        // Add ownerId for UI compatibility - this should match owner unless it's anonymous
        (device as any).ownerId = (owner === this._anonymousOwnerIdHash) ? undefined : owner;
        
        // Add optional properties if they exist
        if (discoveredDevice.macAddress) device.macAddress = discoveredDevice.macAddress;
        if (discoveredDevice.serialNumber) device.serialNumber = discoveredDevice.serialNumber;
        if (discoveredDevice.firmwareVersion) device.firmwareVersion = discoveredDevice.firmwareVersion;
        
        // Store in cache and persistent storage
        this._devices.set(deviceId, device);
        await this._storeDevice(device);
        
        // Ensure default settings exist with connection state
        await this._ensureDeviceSettings(
          deviceId, 
          deviceName, 
          !!discoveredDevice.connected
        );
        
        // Emit event for newly discovered device
        this.onDeviceRegistered.emit(device);
      }
    } catch (error) {
      debugLogger('Error handling device discovered: %o', error);
    }
  }
  
  /**
   * Handle device updated event from DeviceDiscoveryModel
   */
  private async _handleDeviceUpdated(discoveredDevice: any): Promise<void> {
    try {
      // Try to get from cache first
      const deviceId = discoveredDevice.deviceId;
      let device = this._devices.get(deviceId);
      
      if (device) {
        // Update existing device with latest discovery information
        device.address = discoveredDevice.address;
        device.port = discoveredDevice.port;
        device.lastSeen = discoveredDevice.lastSeen;
        device.hasValidCredential = discoveredDevice.hasValidCredential;
        device.capabilities = this._parseCapabilities(discoveredDevice.capabilities);
        device.online = discoveredDevice.online; // Update online status from discovery
        
        // Update optional properties if they exist
        if (discoveredDevice.macAddress) device.macAddress = discoveredDevice.macAddress;
        if (discoveredDevice.serialNumber) device.serialNumber = discoveredDevice.serialNumber;
        if (discoveredDevice.firmwareVersion) device.firmwareVersion = discoveredDevice.firmwareVersion;
        
        // Update in storage
        await this._storeDevice(device);
        
        // Update connection state in settings
        const isConnected = typeof discoveredDevice.connected === 'boolean' ? discoveredDevice.connected : false;
        await this.updateDeviceConnectionState(deviceId, isConnected);
        
        // Update ownership if changed (note: we don't change the owner field as it's an isID field)
      } else {
        // Handle as new device
        await this._handleDeviceDiscovered(discoveredDevice);
      }
    } catch (error) {
      debugLogger('Error handling device updated: %o', error);
    }
  }
  
  /**
   * Handle device lost event from DeviceDiscoveryModel
   */
  private async _handleDeviceLost(deviceId: string): Promise<void> {
    try {
      const device = this._devices.get(deviceId);
      if (device) {
        // Update last seen timestamp
        device.lastSeen = Date.now();
        await this._storeDevice(device);
        
        // Update connection state in settings
        await this.updateDeviceConnectionState(deviceId, false);
      }
    } catch (error) {
      debugLogger('Error handling device lost: %o', error);
    }
  }

  /**
   * Shutdown the model
   */
  public async shutdown(): Promise<void> {
    debugLogger('Shutting down DeviceModel');
    this._initialized = false;
    this._initializing = false;
    this._leuteModel = null;
    this._deviceDiscoveryModel = null;
    this._devices.clear();
    this._deviceSettings.clear();
    this._credentials.clear();
  }
}

// Export the singleton instance
export default DeviceModel; 