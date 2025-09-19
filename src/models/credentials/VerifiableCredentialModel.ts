/**
 * VerifiableCredentialModel - Manages verifiable credentials for device ownership
 * 
 * This model centralizes the creation, verification, and management of
 * verifiable credentials that establish ownership of ESP32 devices.
 */

import { Model } from '@refinio/one.models/lib/models/Model.js';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import { storeVersionedObject } from '@refinio/one.core/lib/storage-versioned-objects.js';
import { getObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import { calculateIdHashOfObj, calculateHashOfObj } from '@refinio/one.core/lib/util/object.js';
import { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import { Person } from '@refinio/one.core/lib/recipes.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type ProfileModel from '@refinio/one.models/lib/models/Leute/ProfileModel.js';
import { DeviceDiscoveryModel } from '../network/DeviceDiscoveryModel';
import { QuicModel } from '../network/QuicModel';
import { UdpModel, type UdpSocket, type UdpRemoteInfo } from '../network/UdpModel';
import Debug from 'debug';
import { createCryptoHash } from '@refinio/one.core/lib/system/crypto-helpers.js';
import * as tweetnacl from 'tweetnacl';

// Initialize debug logger
const debugLogger = Debug('one:vc:model');

/**
 * Interface for a verifiable credential
 * Following W3C Verifiable Credentials standard field names
 */
export interface VerifiableCredential {
  /** Unique identifier for the credential */
  id: string;
  
  /** Issuer of the credential (owner's Person ID) */
  issuer: string;
  
  /** Subject of the credential (device ID) */
  subject: string;
  
  /** JWT-style issuer field for ESP32 compatibility */
  iss?: string;
  
  /** JWT-style subject field for ESP32 compatibility */
  sub?: string;
  
  /** Device ID this credential is for */
  device_id: string;
  
  /** Device type */
  device_type: string;
  
  /** Issued at timestamp (Unix timestamp) */
  issued_at: number;
  
  /** Expiration timestamp (Unix timestamp, 0 for no expiration) */
  expires_at: number;
  
  /** Ownership type (owner, guest, etc.) */
  ownership: string;
  
  /** Permissions granted by this credential (comma-separated list) */
  permissions: string;
  
  /** Cryptographic proof of the credential's validity */
  proof: string;
  
  /** MAC address of the device (optional) */
  mac?: string;
  
  /** Whether the credential is currently valid */
  is_valid: boolean;
}

/**
 * Device Owner Verification Result
 */
export interface DeviceOwnerVerificationResult {
  isValid: boolean;
  isExpired: boolean;
  owner: string | null;
  deviceId: string | null;
  credential: VerifiableCredential | null;
  errorMessage?: string;
}

/**
 * Export format for credentials
 */
export interface CredentialExport {
  credentials: VerifiableCredential[];
  exportedAt: number;
  source: string;
}

/**
 * Model for managing verifiable credentials for device ownership
 */
export class VerifiableCredentialModel extends Model {
  public id: string;
  private credentials: Map<string, VerifiableCredential>;
  private deviceAuthKeys: Map<string, string>;
  private _leuteModel: LeuteModel | null = null;
  private _deviceDiscoveryModel: DeviceDiscoveryModel | null = null;
  private _initialized: boolean = false;
  private _initializing: boolean = false;
  
  // Credential cache
  private _credentialCache: Map<string, VerifiableCredential> = new Map();
  /**
   * Tracks in-flight credential transfers so we don’t spam the same device
   * with repeated credential packets while we’re still waiting for an ACK.
   * Key format: `${ip}:${port}`
   */
  private _pendingTransfers: Set<string> = new Set();
  private _credentialHandlerRegistered: boolean = false;
  private _pendingAcks: Map<string, (success: boolean) => void> = new Map();
  
  // Events
  public readonly onCredentialCreated = new OEvent<(credential: VerifiableCredential) => void>();
  public readonly onCredentialVerified = new OEvent<(result: DeviceOwnerVerificationResult) => void>();
  public readonly onCredentialsExported = new OEvent<(exportData: CredentialExport) => void>();
  
  // Singleton instance
  private static _instance: VerifiableCredentialModel | null = null;
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): VerifiableCredentialModel {
    if (!VerifiableCredentialModel._instance) {
      VerifiableCredentialModel._instance = new VerifiableCredentialModel();
    }
    return VerifiableCredentialModel._instance;
  }
  
  /**
   * Ensure model is initialized
   */
  public static async ensureInitialized(leuteModel: LeuteModel): Promise<VerifiableCredentialModel> {
    const instance = VerifiableCredentialModel.getInstance();
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
    // Create a unique ID for the model
    this.id = `vc-model-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    this.credentials = new Map<string, VerifiableCredential>();
    this.deviceAuthKeys = new Map<string, string>();
    debugLogger('VerifiableCredentialModel created');
  }
  
  /**
   * Initialize the verifiable credential model
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
    debugLogger('Initializing verifiable credential model');
    
    try {
      // Store the leute model
      this._leuteModel = leuteModel;
      
      // Get the device discovery model
      try {
        this._deviceDiscoveryModel = DeviceDiscoveryModel.getInstance();
      } catch (e) {
        debugLogger('DeviceDiscoveryModel not available: %o', e);
        // Continue initialization even without the device discovery model
        // This allows credential operations that don't need device discovery
      }
      
      // Load stored credentials
      this.loadStoredCredentials();
      
      // Mark as initialized
      this._initialized = true;
      this._initializing = false;
      
      debugLogger('Verifiable credential model initialized successfully');
    } catch (error) {
      this._initializing = false;
      debugLogger('Initialization failed: %o', error);
      throw error;
    }
  }
  
  /**
   * Check if the model is initialized
   */
  public isInitialized(): boolean {
    return this._initialized;
  }
  
  /**
   * Check if device discovery is available
   * 
   * @returns true if device discovery is available
   */
  public isDeviceDiscoveryAvailable(): boolean {
    return !!this._deviceDiscoveryModel;
  }
  
  /**
   * Load stored credentials from persistent storage
   */
  private loadStoredCredentials(): void {
    try {
      // Use AsyncStorage from React Native instead of localStorage
      const getCredentials = async () => {
        try {
          // Get AsyncStorage from React Native
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          
          // Load credentials
          const storedCredentials = await AsyncStorage.getItem('verifiable_credentials');
          if (storedCredentials) {
            const parsed = JSON.parse(storedCredentials);
            for (const key in parsed) {
              this.credentials.set(key, parsed[key]);
            }
          }
          
          // Load auth keys
          const storedAuthKeys = await AsyncStorage.getItem('device_auth_keys');
          if (storedAuthKeys) {
            const parsed = JSON.parse(storedAuthKeys);
            for (const key in parsed) {
              this.deviceAuthKeys.set(key, parsed[key]);
            }
          }
          
          console.log('[VerifiableCredentialModel] Successfully loaded stored credentials');
        } catch (error) {
          console.error('[VerifiableCredentialModel] Error loading stored credentials:', error);
        }
      };
      
      // Execute the async function, but don't wait for it
      // This is a compromise since the original method wasn't async
      getCredentials();
    } catch (error) {
      console.error('[VerifiableCredentialModel] Failed to load stored credentials:', error);
    }
  }
  
  /**
   * Save credentials to persistent storage
   */
  private saveCredentials(): void {
    try {
      // Use AsyncStorage from React Native instead of localStorage
      const storeCredentials = async () => {
        try {
          // Get AsyncStorage from React Native
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          
          // Convert Map to object for storage
          const credentialsObj: Record<string, VerifiableCredential> = {};
          this.credentials.forEach((value, key) => {
            credentialsObj[key] = value;
          });
          
          // Store the credentials
          await AsyncStorage.setItem('verifiable_credentials', JSON.stringify(credentialsObj));
          console.log('[VerifiableCredentialModel] Successfully saved credentials');
        } catch (error) {
          console.error('[VerifiableCredentialModel] Error saving credentials:', error);
        }
      };
      
      // Execute the async function, but don't wait for it
      // This is a compromise since the original method wasn't async
      storeCredentials();
    } catch (error) {
      console.error('[VerifiableCredentialModel] Failed to save credentials:', error);
    }
  }
  
  /**
   * Save authentication keys to persistent storage
   */
  private saveAuthKeys(): void {
    try {
      // Use AsyncStorage from React Native instead of localStorage
      const storeAuthKeys = async () => {
        try {
          // Get AsyncStorage from React Native
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          
          // Convert Map to object for storage
          const authKeysObj: Record<string, string> = {};
          this.deviceAuthKeys.forEach((value, key) => {
            authKeysObj[key] = value;
          });
          
          // Store the auth keys
          await AsyncStorage.setItem('device_auth_keys', JSON.stringify(authKeysObj));
          console.log('[VerifiableCredentialModel] Successfully saved auth keys');
        } catch (error) {
          console.error('[VerifiableCredentialModel] Error saving auth keys:', error);
        }
      };
      
      // Execute the async function, but don't wait for it
      // This is a compromise since the original method wasn't async
      storeAuthKeys();
    } catch (error) {
      console.error('[VerifiableCredentialModel] Failed to save auth keys:', error);
    }
  }
  
  /**
   * Export all credentials - no device connection required
   * 
   * @returns An object containing all credentials
   */
  public exportAllCredentials(): CredentialExport {
    const allCredentials = Array.from(this.credentials.values());
    
    const exportData: CredentialExport = {
      credentials: allCredentials,
      exportedAt: Date.now(),
      source: 'lama-app'
    };
    
    // Emit export event
    this.onCredentialsExported.emit(exportData);
    
    return exportData;
  }
  
  /**
   * Export credentials for a specific device - no device connection required
   * 
   * @param deviceId The ID of the device to export credentials for
   * @returns An object containing the device's credentials
   */
  public exportCredentialsForDevice(deviceId: string): CredentialExport {
    const deviceCredentials = this.getCredentialsForDevice(deviceId);
    
    const exportData: CredentialExport = {
      credentials: deviceCredentials,
      exportedAt: Date.now(),
      source: 'lama-app'
    };
    
    // Emit export event
    this.onCredentialsExported.emit(exportData);
    
    return exportData;
  }
  
  /**
   * Export credentials as JSON string - no device connection required
   * 
   * @param deviceId Optional device ID to filter credentials
   * @returns JSON string containing credentials
   */
  public exportCredentialsAsJson(deviceId?: string): string {
    const exportData = deviceId 
      ? this.exportCredentialsForDevice(deviceId)
      : this.exportAllCredentials();
    
    return JSON.stringify(exportData, null, 2);
  }
  
  /**
   * Import credentials from a credential export object
   * 
   * @param exportData The exported credentials
   * @returns Number of imported credentials
   */
  public importCredentials(exportData: CredentialExport): number {
    let importCount = 0;
    
    exportData.credentials.forEach(credential => {
      // Only import valid credentials
      if (this.verifyCredential(credential)) {
        this.credentials.set(credential.id, credential);
        importCount++;
      }
    });
    
    // Save the updated credentials
    if (importCount > 0) {
      this.saveCredentials();
    }
    
    return importCount;
  }
  
  /**
   * Import credentials from JSON string
   * 
   * @param jsonData JSON string containing exported credentials
   * @returns Number of imported credentials
   */
  public importCredentialsFromJson(jsonData: string): number {
    try {
      const exportData = JSON.parse(jsonData) as CredentialExport;
      return this.importCredentials(exportData);
    } catch (error) {
      debugLogger('Error importing credentials from JSON: %o', error);
      return 0;
    }
  }
  
  /**
   * Create a device ownership credential
   * 
   * @param ownerPersonId Person ID who owns the device
   * @param deviceId Device ID
   * @param deviceType Device type
   * @param deviceMac Optional MAC address
   * @param expirationDate Optional expiration date
   * @returns The created credential
   */
  public async createDeviceOwnershipCredential(
    ownerPersonId: string,
    deviceId: string,
    deviceType: string,
    deviceMac?: string,
    expirationDate?: Date
  ): Promise<VerifiableCredential> {
    if (!this._initialized) {
      throw new Error('VerifiableCredentialModel not initialized');
    }
    
    // Generate a unique ID for the credential
    const id = `vc-${deviceId}-${Date.now().toString(36)}`;
    
    // Create the credential
    const now = new Date();
    const credential: VerifiableCredential = {
      id,
      issuer: ownerPersonId,  // The owner is the issuer
      subject: deviceId,      // The device is the subject
      // Also include JWT-style field names for ESP32 compatibility
      iss: ownerPersonId,     // JWT issuer field
      sub: deviceId,          // JWT subject field
      device_id: deviceId,
      device_type: deviceType,
      issued_at: Math.floor(now.getTime() / 1000),
      expires_at: expirationDate ? Math.floor(expirationDate.getTime() / 1000) : 0,
      ownership: 'owner',
      permissions: 'control,configure,monitor',
      proof: await this.generateProof(id, ownerPersonId, deviceId),
      is_valid: true
    };
    
    if (deviceMac) {
      credential.mac = deviceMac;
    }
    
    // Store the credential
    this.credentials.set(id, credential);
    this.saveCredentials();
    
    // Cache the credential
    this._credentialCache.set(deviceId, credential);
    
    // Emit credential created event
    this.onCredentialCreated.emit(credential);
    
    debugLogger(`Device ownership credential created for device ${deviceId} and person ${ownerPersonId}`);
    
    return credential;
  }
  
  
  /**
   * Shutdown the model
   */
  public async shutdown(): Promise<void> {
    debugLogger('Shutting down VerifiableCredentialModel');
    this._initialized = false;
    this._leuteModel = null;
    this._deviceDiscoveryModel = null;
    this._credentialCache.clear();
  }
  
  /**
   * Send a credential to an ESP32 device
   * 
   * @param credential The credential to send
   * @param deviceAddress The device's IP address
   * @param devicePort The device's port (must be valid - no fallbacks)
   * @returns A promise resolving to a boolean indicating success
   */
  public async sendCredentialToESP32(
    credential: VerifiableCredential,
    deviceAddress: string,
    devicePort: number
  ): Promise<boolean> {
    const transferKey = credential.device_id; // track by deviceId to avoid port-based duplication
    if (this._pendingTransfers.has(transferKey)) {
      console.log(`[VerifiableCredentialModel] Credential transfer already in flight for ${transferKey} – skipping.`);
      return false;
    }
    
    // No fallbacks - if we don't have a valid port, we fail
    if (!devicePort || devicePort <= 0) {
      console.error(`[VerifiableCredentialModel] Invalid port ${devicePort} for device ${credential.device_id}. Cannot send credential.`);
      return false;
    }
    
    this._pendingTransfers.add(transferKey);
    try {
      const unifiedServicePort = devicePort;
      
      // Ensure QUIC model is initialized and ready
      const quicModel = await QuicModel.ensureInitialized();
      if (!quicModel.isReady()) {
        console.error('[VerifiableCredentialModel] QuicModel not ready for sending credentials');
        return false;
      }
      
      // Get auth key if exists
      const authKey = this.deviceAuthKeys.get(credential.device_id);
      
      // Create the credential transfer packet
      const packet: Record<string, any> = {
        type: 'credential_flash',  // ESP32 expects 'credential_flash' type
        credential: JSON.stringify(credential), // ESP32 expects credential as a JSON string
        source: 'lama-app',
        timestamp: Date.now()
      };
      
      // Add authentication token if available
      if (authKey) {
        packet.auth_token = authKey;
      }
      
      console.log(`[VerifiableCredentialModel] Sending credential to ${deviceAddress}:${unifiedServicePort} (service type 2, provided port: ${devicePort})`);
      
      // Create the service packet with service type 2 for credentials
      const serviceType = 2; // Credentials service type
      const packetJson = JSON.stringify(packet);
      
      // Create Uint8Array for service packet (React Native doesn't have Buffer.concat)
      const jsonBytes = new TextEncoder().encode(packetJson);
      
      // Create the service packet with proper buffer alignment
      // First create a properly sized ArrayBuffer
      const buffer = new ArrayBuffer(1 + jsonBytes.length);
      const servicePacket = new Uint8Array(buffer);
      servicePacket[0] = serviceType;
      servicePacket.set(jsonBytes, 1);
      
      // DISABLED: Using CredentialServiceHandler instead to avoid duplicate handlers
      // Register global handler if not already registered
      // if (!this._credentialHandlerRegistered) {
      //   this._registerCredentialHandler(quicModel);
      // }
      
      // Use CredentialServiceHandler for ACK handling
      const { CredentialServiceHandler } = await import('./CredentialServiceHandler');
      const credentialHandler = CredentialServiceHandler.getInstance();
      
      // Register the handler if not already registered
      credentialHandler.registerWithTransport(quicModel);
      
      // ACK promise - will be resolved by CredentialServiceHandler
      const ackPromise = credentialHandler.waitForAcknowledgment(deviceAddress, credential.device_id, 10000);
      
      // Send the credential packet with service type byte
      await quicModel.send(servicePacket, deviceAddress, unifiedServicePort);
      console.log(`[VerifiableCredentialModel] Credential packet sent to ${deviceAddress}:${unifiedServicePort} with service type ${serviceType}, waiting for acknowledgment...`);
      
      // Wait for acknowledgment (includes timeout)
      const success = await ackPromise;
      
      if (success) {
        console.log(`[VerifiableCredentialModel] ESP32 at ${deviceAddress} confirmed credential ownership`);
        
        // Update device ownership in DeviceDiscoveryModel
        if (this._deviceDiscoveryModel) {
          const device = credential.device_id;
          const owner = credential.issuer;  // The issuer is the owner, not the subject
          console.log(`[VerifiableCredentialModel] Updating device ${device} ownership to ${owner}`);
          await this._deviceDiscoveryModel.registerDeviceOwner(device, owner);
        }
      } else {
        console.log(`[VerifiableCredentialModel] ESP32 at ${deviceAddress} did not confirm credential ownership (timeout or rejection)`);
      }
      
      return success;
    } catch (error) {
      console.error(`[VerifiableCredentialModel] Error sending credential to ESP32:`, error);
      if (error instanceof Error && error.message.includes('not ready for sending')) {
        console.error('[VerifiableCredentialModel] QuicModel transport is not ready. This may indicate the UDP socket failed to bind.');
      }
      throw new Error('Failed to send credential to device.');
    } finally {
      // Clean up pending transfer tracking
      this._pendingTransfers.delete(transferKey);
    }
  }
  
  /**
   * Register the global credential handler (only done once)
   */
  private _registerCredentialHandler(quicModel: QuicModel): void {
    if (this._credentialHandlerRegistered) return;
    
    const handleMessage = (data: any, rinfo: any) => {
      console.log(`[VerifiableCredentialModel] Global handler received message from ${rinfo.address}:${rinfo.port}`);
      
      // Find any pending ack for this address
      let matchingKey: string | null = null;
      for (const [key, resolver] of this._pendingAcks) {
        const [addr] = key.split(':');
        if (addr === rinfo.address) {
          matchingKey = key;
          break;
        }
      }
      
      if (!matchingKey) {
        console.log(`[VerifiableCredentialModel] No pending ack for ${rinfo.address}, ignoring`);
        return;
      }
      
      try {
        // Skip the service type byte if present
        let actualData = data;
        if (data && data.length > 0 && data[0] === 2) {
          actualData = data.slice(1);
        }
        
        // Decode the message
        let messageStr: string;
        if (actualData instanceof Uint8Array) {
          messageStr = new TextDecoder().decode(actualData);
        } else if (Array.isArray(actualData)) {
          messageStr = new TextDecoder().decode(new Uint8Array(actualData));
        } else if (typeof actualData === 'string') {
          messageStr = actualData;
        } else {
          console.error(`[VerifiableCredentialModel] Unexpected data type: ${typeof actualData}`);
          return;
        }
        
        const message = JSON.parse(messageStr);
        console.log(`[VerifiableCredentialModel] Parsed credential ACK:`, message);
        
        if (message.type === 'credential_ack' || message.type === 'credential_response') {
          const success = message.status === 'success' || message.success === true;
          const resolver = this._pendingAcks.get(matchingKey);
          
          if (resolver) {
            console.log(`[VerifiableCredentialModel] Resolving ack for ${rinfo.address} with ${success ? 'success' : 'failure'}`);
            this._pendingAcks.delete(matchingKey);
            resolver(success);
          }
        }
      } catch (error) {
        console.error(`[VerifiableCredentialModel] Error processing message:`, error);
      }
    };
    
    quicModel.addService(2, handleMessage);
    this._credentialHandlerRegistered = true;
    console.log('[VerifiableCredentialModel] Registered global credential handler');
  }

  /**
   * Verify a device ownership credential from an ESP32 device
   * 
   * @param deviceId Device ID to verify
   * @param credentialData The credential data to verify
   * @returns Verification result
   */
  public verifyDeviceOwnership(
    deviceId: string,
    credentialData: string
  ): DeviceOwnerVerificationResult {
    try {
      // Parse the credential data
      let credential: VerifiableCredential;
      try {
        credential = JSON.parse(credentialData);
      } catch (e) {
        debugLogger('Error parsing credential data: %o', e);
        return {
          isValid: false,
          isExpired: false,
          owner: null,
          deviceId: null,
          credential: null,
          errorMessage: 'Invalid credential format'
        };
      }
      
      // Verify the device ID matches
      if (credential.device_id !== deviceId) {
        return {
          isValid: false,
          isExpired: false,
          owner: null,
          deviceId,
          credential,
          errorMessage: 'Device ID mismatch'
        };
      }
      
      // Check if the credential is expired
      const now = Math.floor(Date.now() / 1000);
      const isExpired = credential.expires_at > 0 && now > credential.expires_at;
      
      // Verify the credential
      const isValid = this.verifyCredential(credential);
      
      // Return the verification result
      return {
        isValid: isValid && !isExpired,
        isExpired,
        owner: credential.subject,
        deviceId,
        credential
      };
    } catch (error) {
      debugLogger('Error verifying device ownership: %o', error);
      return {
        isValid: false,
        isExpired: false,
        owner: null,
        deviceId: null,
        credential: null,
        errorMessage: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Associates a device with an owner.
   * This is a no-op if device discovery is not available.
   * 
   * @param personId - PersonId the device should be associated with
   * @param deviceId - Optional device ID to associate with owner. If not provided, will attempt to use currently connected device
   * @returns true for success (always returns true to avoid credential failures)
   */
  public async associateDeviceWithOwner(personId: string | SHA256IdHash<Person>, deviceId?: string): Promise<boolean> {
    if (!this.isDeviceDiscoveryAvailable()) {
      debugLogger("Device discovery not available, skipping device association");
      return true;
    }

    try {
      debugLogger("Associating device with owner", personId);
      if (typeof this._deviceDiscoveryModel!.registerDeviceOwner === 'function') {
        // Use provided device ID or try to find a connected device
        if (!deviceId) {
          const devices = this._deviceDiscoveryModel!.getDevices();
          if (devices && devices.length > 0) {
            deviceId = devices[0].id;
            debugLogger("Using first available device ID:", deviceId);
          }
        }
        
        if (deviceId) {
          // Pass the personId to registerDeviceOwner
          await this._deviceDiscoveryModel!.registerDeviceOwner(deviceId, personId as SHA256IdHash<Person>);
          debugLogger("Successfully registered device owner for device", deviceId);
        } else {
          debugLogger("No device ID provided or available, skipping device owner registration");
        }
      }
      return true;
    } catch (e) {
      debugLogger("Error associating device with owner, continuing anyway", e);
      return true; // Return true to avoid credential failures
    }
  }

  /**
   * Create a verifiable credential
   * 
   * @param subjectId The ID of the subject (person or device)
   * @param deviceId The ID of the device
   * @param deviceType The type of device
   * @param deviceMac The MAC address of the device (if applicable)
   * @param ownershipType The type of ownership (owner, guest, etc.)
   * @param permissions The permissions granted by this credential
   * @returns The created credential
   */
  public async createCredential(
    subjectId: string,
    deviceId: string,
    deviceType: string,
    deviceMac?: string,
    ownershipType = 'owner',
    permissions = 'control,configure,monitor',
  ): Promise<VerifiableCredential> {
    // Generate a unique ID for the credential
    const id = `vc-${deviceId}-${Date.now().toString(36)}`;
    
    // Create the credential
    const credential: VerifiableCredential = {
      id,
      issuer: subjectId,      // The owner is the issuer
      subject: deviceId,      // The device is the subject
      device_id: deviceId,
      device_type: deviceType,
      issued_at: Math.floor(Date.now() / 1000),
      expires_at: 0, // No expiration for now
      ownership: ownershipType,
      permissions: permissions,
      proof: await this.generateProof(id, subjectId, deviceId),
      is_valid: true,
    };
    
    if (deviceMac) {
      credential.mac = deviceMac;
    }
    
    // Store the credential
    this.credentials.set(id, credential);
    this.saveCredentials();
    
    // Generate an authentication key for this device
    await this.generateAuthKey(deviceId);
    
    return credential;
  }
  
  /**
   * Generate an authentication key for a device
   * 
   * @param deviceId The device ID to generate a key for
   * @returns The generated authentication key
   */
  public async generateAuthKey(deviceId: string): Promise<string> {
    // Generate a random authentication key using createCryptoHash
    const timestamp = Date.now().toString();
    const random = Math.random().toString();
    const hashInput = `auth-key-${deviceId}-${timestamp}-${random}`;
    const hash = await createCryptoHash(hashInput);
    const authKey = hash.toString();
    
    // Store the key
    this.deviceAuthKeys.set(deviceId, authKey);
    this.saveAuthKeys();
    
    return authKey;
  }
  
  /**
   * Get the authentication key for a device
   * 
   * @param deviceId The device ID to get the key for
   * @returns The authentication key or undefined if none exists
   */
  public getAuthKey(deviceId: string): string | undefined {
    return this.deviceAuthKeys.get(deviceId);
  }

  /**
   * Get a credential by its ID
   * 
   * @param credentialId The ID of the credential
   * @returns The credential or undefined if not found
   */
  public getCredential(credentialId: string): VerifiableCredential | undefined {
    return this.credentials.get(credentialId);
  }
  
  /**
   * Get all credentials for a specific device
   * 
   * @param deviceId The ID of the device
   * @returns An array of credentials for the device
   */
  public getCredentialsForDevice(deviceId: string): VerifiableCredential[] {
    const result: VerifiableCredential[] = [];
    this.credentials.forEach(credential => {
      if (credential.device_id === deviceId) {
        result.push(credential);
      }
    });
    return result;
  }
  
  /**
   * Get all credentials for a specific subject (user)
   * 
   * @param subjectId The ID of the subject
   * @returns An array of credentials for the subject
   */
  public getCredentialsForSubject(subjectId: string): VerifiableCredential[] {
    const result: VerifiableCredential[] = [];
    this.credentials.forEach(credential => {
      if (credential.subject === subjectId) {
        result.push(credential);
      }
    });
    return result;
  }

  /**
   * Generate a proof for a credential
   * 
   * @param id The ID of the credential
   * @param subjectId The ID of the subject
   * @param deviceId The ID of the device
   * @returns A proof string
   */
  private async generateProof(id: string, subjectId: string, deviceId: string): Promise<string> {
    // In a real implementation, this would use a digital signature
    // Here we'll use createCryptoHash from one.core
    const hashInput = `${id}:${subjectId}:${deviceId}:${Date.now()}`;
    const hash = await createCryptoHash(hashInput);
    return hash.toString();
  }

  /**
   * Verify if a credential is valid
   * 
   * @param credential The credential to verify
   * @returns True if the credential is valid, false otherwise
   */
  public verifyCredential(credential: VerifiableCredential): boolean {
    // Check if the credential has expired
    if (credential.expires_at > 0 && credential.expires_at < Math.floor(Date.now() / 1000)) {
      return false;
    }
    
    // In a real implementation, this would verify the digital signature
    // Here we'll just assume it's valid if we have all required fields
    return !!(
      credential.id &&
      credential.issuer &&
      credential.subject &&
      credential.device_id &&
      credential.issued_at &&
      credential.proof
    );
  }
  
  /**
   * Send a credential to a device
   * 
   * @param credential The credential to send
   * @param deviceIp The IP address of the device
   * @param devicePort The port to send to (default: 3333)
   * @returns A promise that resolves when the credential is sent
   */
  public async sendCredentialToDevice(
    credential: VerifiableCredential,
    deviceIp: string,
    devicePort = 3333
  ): Promise<boolean> {
    return this.sendCredentialToESP32(credential, deviceIp, devicePort);
  }
  
  /**
   * Replace a credential on a device
   * 
   * @param oldCredentialId The ID of the old credential
   * @param newCredential The new credential to replace it with
   * @param deviceIp The IP address of the device
   * @param devicePort The port to send to (default: 3333)
   * @returns A promise that resolves when the credential is replaced
   */
  public async replaceCredentialOnDevice(
    oldCredentialId: string,
    newCredential: VerifiableCredential,
    deviceIp: string, 
    devicePort = 3333
  ): Promise<boolean> {
    // Verify the new credential
    if (!this.verifyCredential(newCredential)) {
      console.error('Cannot send invalid replacement credential to device');
      return false;
    }
    
    // Get the old credential
    const oldCredential = this.getCredential(oldCredentialId);
    if (!oldCredential) {
      console.error('Old credential not found');
      return false;
    }
    
    // Ensure the device IDs match
    if (oldCredential.dev !== newCredential.dev) {
      console.error('Cannot replace credential for different device');
      return false;
    }
    
    // Send the new credential to the device
    const success = await this.sendCredentialToDevice(
      newCredential,
      deviceIp,
      devicePort
    );
    
    if (success) {
      // Remove the old credential and store the new one
      this.credentials.delete(oldCredentialId);
      this.credentials.set(newCredential.id, newCredential);
      this.saveCredentials();
    }
    
    return success;
  }

  /**
   * Revoke a credential
   * 
   * @param credentialId The ID of the credential to revoke
   * @returns True if the credential was revoked, false otherwise
   */
  public revokeCredential(credentialId: string): boolean {
    const credential = this.credentials.get(credentialId);
    if (!credential) {
      return false;
    }
    
    // Mark the credential as invalid
    credential.is_valid = false;
    
    // Set expiration to now
    credential.expires_at = Math.floor(Date.now() / 1000);
    
    // Update in storage
    this.saveCredentials();
    
    return true;
  }
  
  /**
   * Delete a credential
   * 
   * @param credentialId The ID of the credential to delete
   * @returns True if the credential was deleted, false otherwise
   */
  public deleteCredential(credentialId: string): boolean {
    const result = this.credentials.delete(credentialId);
    if (result) {
      this.saveCredentials();
    }
    return result;
  }

  /**
   * Export Device Credentials UI - Promise-based version that handles errors gracefully
   * This can be called directly from UI components
   * 
   * @param deviceId Optional device ID to filter credentials
   * @returns Promise resolving to the exported JSON string
   */
  public async exportCredentialsForUI(deviceId?: string): Promise<string> {
    try {
      // Export credentials without requiring device discovery
      const exportData = deviceId 
        ? this.exportCredentialsForDevice(deviceId)
        : this.exportAllCredentials();
      
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Error exporting credentials:', error);
      return JSON.stringify({
        error: 'Failed to export credentials',
        message: error instanceof Error ? error.message : String(error),
        credentials: [],
        exportedAt: Date.now(),
        source: 'lama-app-error'
      });
    }
  }

  /**
   * Auto-credential a device by creating and sending credentials if device doesn't have any
   * Takes advantage of ESP32's behavior of accepting credentials when it has none
   * 
   * @param deviceId The ID of the device to credential
   * @param deviceIp The IP address of the device
   * @param devicePort The port to send to (default: 3333)
   * @param deviceType The type of device (default: 'esp32')
   * @param deviceMac Optional MAC address
   * @returns Promise resolving to the created credential if successful, undefined otherwise
   */
  public async autoCredentialDevice(
    deviceId: string,
    deviceIp: string,
    devicePort: number = 3333,
    deviceType: string = 'esp32',
    deviceMac?: string
  ): Promise<VerifiableCredential | undefined> {
    debugLogger(`Auto-credentialing device ${deviceId} at ${deviceIp}:${devicePort}`);
    try {
      // Check if device already has credentials
      const existingCredentials = this.getCredentialsForDevice(deviceId);
      if (existingCredentials.length > 0) {
        debugLogger(`Device ${deviceId} already has ${existingCredentials.length} credentials`);
        
        // Try sending the most recent credential
        const mostRecentCredential = existingCredentials.reduce((latest, current) => 
          latest.iat > current.iat ? latest : current
        );
        
        debugLogger(`Sending most recent credential ${mostRecentCredential.id} to device`);
        const sent = await this.sendCredentialToDevice(
          mostRecentCredential,
          deviceIp,
          devicePort
        );
        
        return sent ? mostRecentCredential : undefined;
      }
      
      // No existing credentials, create and send a new one
      debugLogger(`No existing credentials for device ${deviceId}, creating new credential`);
      
      // Get the current user's ID
      if (!this._leuteModel) {
        throw new Error('LeuteModel not available, cannot create credential');
      }
      
      // Get the current user's personId
      const me = await this._leuteModel.me();
      const profile = await me.mainProfile();
      const personId = profile.personId;
      
      if (!personId) {
        throw new Error('Could not determine current user ID');
      }
      
      // Create a new credential
      const credential = await this.createCredential(
        personId,
        deviceId,
        deviceType,
        deviceMac
      );
      
      debugLogger(`Created credential ${credential.id} for device ${deviceId}, sending to device`);
      
      // Send the credential to the device
      const success = await this.sendCredentialToDevice(
        credential,
        deviceIp,
        devicePort
      );
      
      // Associate device with owner
      if (success) {
        debugLogger(`Successfully sent credential to device ${deviceId}`);
        await this.associateDeviceWithOwner(personId, deviceId);
        return credential;
      } else {
        debugLogger(`Failed to send credential to device ${deviceId}`);
        return undefined;
      }
    } catch (error) {
      debugLogger(`Error auto-credentialing device ${deviceId}: ${error}`);
      console.error('Error auto-credentialing device:', error);
      return undefined;
    }
  }

  /**
   * Send credential removal command to device
   * This tells the device to remove its stored ownership credential
   * 
   * @param command The removal command with device info
   * @param deviceAddress The device's IP address
   * @param devicePort The device's port
   * @returns A promise resolving to success status
   */
  public async sendCredentialRemovalToDevice(
    command: {
      type: 'credential_remove';
      senderPersonId: string;
      deviceId: string;
      timestamp: number;
    },
    deviceAddress: string,
    devicePort: number
  ): Promise<boolean> {
    try {
      console.log(`[VerifiableCredentialModel] Sending credential removal to ${command.deviceId} at ${deviceAddress}:${devicePort}`);
      
      // Ensure QUIC model is initialized
      const quicModel = await QuicModel.ensureInitialized();
      if (!quicModel.isReady()) {
        console.error('[VerifiableCredentialModel] QuicModel not ready for sending removal');
        return false;
      }
      
      // Create packet with credentials service type
      const commandBuffer = Buffer.from(JSON.stringify(command));
      const packet = Buffer.concat([
        Buffer.from([2]), // SERVICE_TYPE_CREDENTIALS
        commandBuffer
      ]);
      
      // Send the removal command
      await quicModel.send(packet, deviceAddress, devicePort);
      console.log(`[VerifiableCredentialModel] Sent credential removal command to ${command.deviceId}`);
      
      // Remove from our credential store
      const credentialsForDevice = Array.from(this.credentials.values()).filter(
        cred => cred.dev === command.deviceId
      );
      
      for (const cred of credentialsForDevice) {
        this.credentials.delete(cred.id);
        console.log(`[VerifiableCredentialModel] Removed credential ${cred.id} from local store`);
      }
      
      if (credentialsForDevice.length > 0) {
        this.saveCredentials();
      }
      
      return true;
    } catch (error) {
      console.error('[VerifiableCredentialModel] Error sending credential removal:', error);
      return false;
    }
  }

  /**
   * Automatically try to establish device ownership to the first available device
   * This is useful for initial setup where we want to connect to any ESP32
   * 
   * @returns Promise resolving to success status and device info if applicable
   */
  public async autoCredentialFirstDevice(): Promise<{
    success: boolean;
    deviceId?: string;
    deviceIp?: string;
    credential?: VerifiableCredential;
    error?: string;
  }> {
    try {
      debugLogger('Auto-credentialing first available device');
      
      // Verify we have necessary dependencies
      if (!this._deviceDiscoveryModel) {
        return {
          success: false,
          error: 'Device discovery model not available'
        };
      }
      
      // Get all discovered devices
      const devices = this._deviceDiscoveryModel.getDevices();
      if (!devices || devices.length === 0) {
        return {
          success: false,
          error: 'No devices discovered'
        };
      }
      
      // Filter for ESP32 devices
      const esp32Devices = devices.filter(device => device.type === 'esp32');
      if (esp32Devices.length === 0) {
        return {
          success: false,
          error: 'No ESP32 devices discovered'
        };
      }
      
      // Use the first ESP32 device
      const device = esp32Devices[0];
      debugLogger(`Using first ESP32 device: ${device.id} at ${device.address}`);
      
      // Auto-credential the device
      const credential = await this.autoCredentialDevice(
        device.id,
        device.address,
        3333, // Default port
        'esp32'
      );
      
      if (!credential) {
        return {
          success: false,
          deviceId: device.id,
          deviceIp: device.address,
          error: 'Failed to credential device'
        };
      }
      
      return {
        success: true,
        deviceId: device.id,
        deviceIp: device.address,
        credential
      };
    } catch (error) {
      debugLogger('Error in autoCredentialFirstDevice:', error);
      return {
        success: false,
      };
    }
  }
}

// Export the singleton instance
export default VerifiableCredentialModel; 