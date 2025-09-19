/**
 * TrustModel - Key management, device identity, and trust relationships
 * 
 * This model handles:
 * - Device identity management
 * - Key generation and retrieval from one.core's secure keychain
 * - Trust relationships between devices
 * - Credential verification
 * - Integration with DeviceDiscoveryModel for secure device communication
 */

import { Model } from '@refinio/one.models/lib/models/Model';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent';
import { StateMachine } from '@refinio/one.models/lib/misc/StateMachine';
import { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import { getDefaultKeys, createCryptoApiFromDefaultKeys } from '@refinio/one.core/lib/keychain/keychain.js';
import { getObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel';
import * as tweetnacl from 'tweetnacl';
import { SettingsStore } from '@refinio/one.core/lib/system/settings-store.js';

/**
 * Device credentials for secure communication
 */
export interface DeviceCredentials {
    deviceId: SHA256IdHash<Person>;
    secretKey: string;
    publicKey: string;
}

/**
 * Trust relationship status
 */
export type TrustStatus = 'trusted' | 'untrusted' | 'pending' | 'revoked';

/**
 * Trust relationship entry
 */
export interface TrustEntry {
    deviceId: SHA256IdHash<Person>;
    publicKey: string;
    status: TrustStatus;
    establishedAt: Date;
    lastVerified?: Date;
}

/**
 * TrustModel manages key generation, device identity, and trust relationships
 */
export class TrustModel implements Model {
    public readonly onUpdated = new OEvent<() => void>();
    public readonly onTrustChanged = new OEvent<(deviceId: SHA256IdHash<Person>, status: TrustStatus) => void>();
    public readonly onCredentialsUpdated = new OEvent<(deviceId: SHA256IdHash<Person>) => void>();
    
    public state: StateMachine<'Uninitialised' | 'Initialised', 'shutdown' | 'init'>;
    
    private leuteModel: LeuteModel;
    private deviceCredentials?: DeviceCredentials;
    private trustDatabase: Map<string, TrustEntry> = new Map();
    
    constructor(leuteModel: LeuteModel) {
        console.log('[TrustModel] Constructor called');
        this.leuteModel = leuteModel;
        
        // Create the StateMachine
        this.state = new StateMachine<'Uninitialised' | 'Initialised', 'shutdown' | 'init'>();
        
        // Set up states and transitions
        this.state.addState('Uninitialised');
        this.state.addState('Initialised');
        this.state.setInitialState('Uninitialised');
        this.state.addEvent('init');
        this.state.addEvent('shutdown');
        this.state.addTransition('init', 'Uninitialised', 'Initialised');
        this.state.addTransition('shutdown', 'Initialised', 'Uninitialised');
        
        console.log('[TrustModel] Constructor completed');
    }
    
    /**
     * Initialize the TrustModel
     */
    public async init(): Promise<void> {
        console.log('[TrustModel] Initializing...');
        
        if (this.state.currentState === 'Initialised') {
            console.log('[TrustModel] Already initialized');
            return;
        }
        
        try {
            // Initialize device credentials
            await this.initializeDeviceCredentials();
            
            // Load existing trust relationships
            await this.loadTrustDatabase();
            
            // Transition to initialized state
            this.state.triggerEvent('init');
            console.log('[TrustModel] Initialized successfully');
            
        } catch (error) {
            console.error('[TrustModel] Initialization failed:', error);
            throw error;
        }
    }
    
    /**
     * Shutdown the TrustModel
     */
    public async shutdown(): Promise<void> {
        console.log('[TrustModel] Shutting down...');
        
        try {
            // Save trust database
            await this.saveTrustDatabase();
            
            // Clear sensitive data
            this.deviceCredentials = undefined;
            this.trustDatabase.clear();
            
            // Transition to uninitialized state
            this.state.triggerEvent('shutdown');
            console.log('[TrustModel] Shutdown completed');
            
        } catch (error) {
            console.error('[TrustModel] Error during shutdown:', error);
            throw error;
        }
    }
    
    /**
     * Get device credentials for the current device
     */
    public getDeviceCredentials(): DeviceCredentials | undefined {
        return this.deviceCredentials;
    }
    
    /**
     * Set device identity for external systems (like DeviceDiscoveryModel)
     */
    public async setDeviceIdentity(targetSystem: any): Promise<void> {
        if (!this.deviceCredentials) {
            throw new Error('Device credentials not initialized');
        }
        
        if (targetSystem && typeof targetSystem.setOwnIdentity === 'function') {
            console.log('[TrustModel] Setting device identity for external system');
            await targetSystem.setOwnIdentity(
                this.deviceCredentials.deviceId,
                this.deviceCredentials.secretKey,
                this.deviceCredentials.publicKey
            );
        } else {
            throw new Error('Target system does not support setOwnIdentity method');
        }
    }
    
    /**
     * Add or update a trust relationship
     */
    public async setTrustStatus(deviceId: SHA256IdHash<Person>, publicKey: string, status: TrustStatus): Promise<void> {
        const deviceIdStr = deviceId.toString();
        const existingEntry = this.trustDatabase.get(deviceIdStr);
        
        const trustEntry: TrustEntry = {
            deviceId,
            publicKey,
            status,
            establishedAt: existingEntry?.establishedAt || new Date(),
            lastVerified: new Date()
        };
        
        this.trustDatabase.set(deviceIdStr, trustEntry);
        
        // Save to persistent storage
        await this.saveTrustDatabase();
        
        // Emit events
        this.onTrustChanged.emit(deviceId, status);
        this.onUpdated.emit();
        
        console.log(`[TrustModel] Trust status updated for ${deviceIdStr.slice(0, 8)}...: ${status}`);
    }
    
    /**
     * Get trust status for a device
     */
    public getTrustStatus(deviceId: SHA256IdHash<Person>): TrustStatus | undefined {
        const entry = this.trustDatabase.get(deviceId.toString());
        return entry?.status;
    }
    
    /**
     * Get all trusted devices
     */
    public getTrustedDevices(): TrustEntry[] {
        return Array.from(this.trustDatabase.values())
            .filter(entry => entry.status === 'trusted');
    }
    
    /**
     * Verify a device's public key matches trusted key
     */
    public verifyDeviceKey(deviceId: SHA256IdHash<Person>, publicKey: string): boolean {
        const entry = this.trustDatabase.get(deviceId.toString());
        return entry?.publicKey === publicKey && entry.status === 'trusted';
    }
    
    /**
     * Initialize device credentials from one.core's secure keychain
     */
    private async initializeDeviceCredentials(): Promise<void> {
        try {
            console.log('[TrustModel] Initializing device credentials from secure keychain...');
            
            // Get the current user's identity from one.core keychain
            const mainIdentity = await this.leuteModel.myMainIdentity();
            if (!mainIdentity) {
                throw new Error('Cannot get main identity for device credentials');
            }
            
            // Get device credentials from keychain
            const credentials = await this.getDeviceCredentialsFromKeychain(mainIdentity);
            
            this.deviceCredentials = {
                deviceId: mainIdentity,
                ...credentials
            };
            
            console.log('[TrustModel] Device credentials initialized successfully');
            this.onCredentialsUpdated.emit(mainIdentity);
            
        } catch (error) {
            console.error('[TrustModel] Error initializing device credentials:', error);
            throw error;
        }
    }
    
    /**
     * Get device credentials from one.core's secure keychain
     * Uses secure crypto API without exposing private keys to JavaScript
     */
    private async getDeviceCredentialsFromKeychain(personId: SHA256IdHash<Person>): Promise<{ secretKey: string, publicKey: string }> {
        try {
            console.log('[TrustModel] Getting device credentials from secure keychain');
            
            // Check if default keys exist first
            // CORRECTED: Use PairingManager pattern - get instance first, then keys for that instance
            const { getLocalInstanceOfPerson } = await import('@refinio/one.models/lib/misc/instance');
            const { getObject } = await import('@refinio/one.core/lib/storage-unversioned-objects.js');
            
            console.log('🔑 [KEY_DEBUG] TrustModel.checkIdentityKeys() - PersonId:', personId);
            
            const defaultInstance = await getLocalInstanceOfPerson(personId);
            console.log('🔑 [KEY_DEBUG] TrustModel.checkIdentityKeys() - DefaultInstance:', defaultInstance);
            
            const keysHash = await getDefaultKeys(defaultInstance);
            console.log('🔑 [KEY_DEBUG] TrustModel.checkIdentityKeys() - KeysHash:', keysHash);
            
            const keys = await getObject(keysHash);
            console.log('🔑 [KEY_DEBUG] TrustModel.checkIdentityKeys() - PublicKey:', keys.publicKey);
            if (!keysHash) {
                console.log('[TrustModel] No default keys found in keychain, will generate device-specific keys');
                throw new Error('No default keys found in keychain for person');
            }
            
            // Try to create crypto API to verify keys exist and are accessible
            const { createCryptoApiFromDefaultKeys } = await import('@refinio/one.core/lib/keychain/keychain.js');
            const cryptoApi = await createCryptoApiFromDefaultKeys(personId);
            if (!cryptoApi) {
                console.log('[TrustModel] Could not create secure crypto API, will generate device-specific keys');
                throw new Error('Could not create secure crypto API from default keys');
            }
            
            // Get the public keys from the Keys object
            const keyObject = await getObject(keysHash);
            if (!keyObject || !keyObject.publicSignKey) {
                console.log('[TrustModel] Could not retrieve public keys from keychain, will generate device-specific keys');
                throw new Error('Could not retrieve public keys from keychain');
            }
            
            // For device discovery, we need the raw key material, but we should avoid this
            // Instead, let's generate device-specific keys that don't expose the master keys
            console.log('[TrustModel] Master keys exist but generating device-specific keys for security');
            throw new Error('Using device-specific keys instead of master keys for security');
            
        } catch (error) {
            console.log('[TrustModel] Using keychain keys failed, generating device-specific keys:', error instanceof Error ? error.message : String(error));
            
            // This is the secure path - generate device-specific keys instead of exposing master keys
            return await this.generateSecureDeviceCredentials(personId);
        }
    }
    
    /**
     * Generate secure device credentials using tweetnacl
     * This is for device-specific keys when keychain keys aren't available
     */
    private async generateSecureDeviceCredentials(personId: SHA256IdHash<Person>): Promise<{ secretKey: string, publicKey: string }> {
        console.log('[TrustModel] Generating device-specific credentials for:', personId.slice(0, 16) + '...');
        
        // Check for existing keys first
        const deviceKeyId = `device_keys_${personId}`;
        const storedKeys = await SettingsStore.getItem(deviceKeyId) as string | undefined;
        
        if (storedKeys) {
            try {
                const parsedKeys = JSON.parse(storedKeys);
                return {
                    secretKey: parsedKeys.secretKey,
                    publicKey: parsedKeys.publicKey
                };
            } catch {
                // Corrupted, regenerate
                await SettingsStore.removeItem(deviceKeyId);
            }
        }
        
        // Generate new keys using tweetnacl
        console.log('[TrustModel] Generating new keypair using tweetnacl');
        const keyPair = tweetnacl.sign.keyPair();
        
        // Convert to hex strings
        const secretKey = uint8ArrayToHex(keyPair.secretKey);
        const publicKey = uint8ArrayToHex(keyPair.publicKey);
        
        console.log('[TrustModel] Generated keys - Secret:', secretKey.length, 'Public:', publicKey.length);
        
        // Store for future use
        const keysToStore = {
            secretKey,
            publicKey,
            generated: new Date().toISOString(),
            personId: personId
        };
        
        await SettingsStore.setItem(deviceKeyId, JSON.stringify(keysToStore));
        console.log('[TrustModel] Stored new device credentials');
        
        return { secretKey, publicKey };
    }
    
    /**
     * Load trust database from persistent storage
     */
    private async loadTrustDatabase(): Promise<void> {
        try {
            const AsyncStorage = await import('@react-native-async-storage/async-storage');
            const stored = await AsyncStorage.default.getItem('trust_database');
            
            if (stored) {
                const parsed = JSON.parse(stored);
                this.trustDatabase.clear();
                
                for (const [key, value] of Object.entries(parsed)) {
                    // Convert dates back from ISO strings
                    const entry = value as any;
                    entry.establishedAt = new Date(entry.establishedAt);
                    if (entry.lastVerified) {
                        entry.lastVerified = new Date(entry.lastVerified);
                    }
                    this.trustDatabase.set(key, entry as TrustEntry);
                }
                
                console.log(`[TrustModel] Loaded ${this.trustDatabase.size} trust entries from storage`);
            }
        } catch (error) {
            console.error('[TrustModel] Error loading trust database:', error);
            // Continue without stored trust data
        }
    }
    
    /**
     * Save trust database to persistent storage
     */
    private async saveTrustDatabase(): Promise<void> {
        try {
            const AsyncStorage = await import('@react-native-async-storage/async-storage');
            
            // Convert Map to object for storage
            const toStore: Record<string, TrustEntry> = {};
            this.trustDatabase.forEach((value, key) => {
                toStore[key] = value;
            });
            
            await AsyncStorage.default.setItem('trust_database', JSON.stringify(toStore));
            console.log(`[TrustModel] Saved ${this.trustDatabase.size} trust entries to storage`);
        } catch (error) {
            console.error('[TrustModel] Error saving trust database:', error);
            // Don't throw - this is not critical
        }
    }

    /**
     * Public method to get crypto API for other models
     * This creates a fresh crypto API each time as intended by one.core design
     */
    public async getCryptoApi(personId: SHA256IdHash<Person>): Promise<any> {
        const { createCryptoApiFromDefaultKeys } = await import('@refinio/one.core/lib/keychain/keychain.js');
        const { getDefaultKeys } = await import('@refinio/one.core/lib/keychain/keychain.js');
        const { getObject } = await import('@refinio/one.core/lib/storage-unversioned-objects.js');
        
        console.log('🔑 [KEY_DEBUG] TrustModel.getCryptoApi() - PersonId:', personId);
        
        // REVERTED: Use one.leute pattern - keys directly from Person ID (not Instance ID)
        const keysHash = await getDefaultKeys(personId);
        console.log('🔑 [KEY_DEBUG] TrustModel.getCryptoApi() - KeysHash:', keysHash);
        
        const keys = await getObject(keysHash);
        console.log('🔑 [KEY_DEBUG] TrustModel.getCryptoApi() - PublicKey:', keys.publicKey);
        
        return await createCryptoApiFromDefaultKeys(personId);
    }
}

// Note: Removed base64ToHex function as we no longer expose raw private keys for security

/**
 * Convert Uint8Array to hex string
 */
function uint8ArrayToHex(uint8Array: Uint8Array): string {
    return Array.from(uint8Array)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
} 