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

        // Get crypto API for signing operations
        const cryptoApi = await this.getCryptoApi(this.deviceCredentials.deviceId);

        if (targetSystem && typeof targetSystem.setOwnIdentity === 'function') {
            console.log('[TrustModel] Setting device identity for external system (with crypto API)');

            // Pass empty string for secret key since we're using crypto API
            // The target system should be refactored to use the crypto API for signing
            await targetSystem.setOwnIdentity(
                this.deviceCredentials.deviceId,
                '', // No raw secret key - use crypto API
                this.deviceCredentials.publicKey
            );

            // Also provide the crypto API if the target system supports it
            if (typeof targetSystem.setCryptoApi === 'function') {
                await targetSystem.setCryptoApi(cryptoApi);
            }
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
     * Returns public key only - private key operations use crypto API
     */
    private async getDeviceCredentialsFromKeychain(personId: SHA256IdHash<Person>): Promise<{ secretKey: string, publicKey: string }> {
        console.log('[TrustModel] Getting device credentials from secure keychain');

        // Get the public key from keychain
        const { getLocalInstanceOfPerson } = await import('@refinio/one.models/lib/misc/instance');
        const { getObject } = await import('@refinio/one.core/lib/storage-unversioned-objects.js');

        const defaultInstance = await getLocalInstanceOfPerson(personId);
        const keysHash = await getDefaultKeys(defaultInstance);

        if (!keysHash) {
            throw new Error('No default keys found in keychain for person');
        }

        const keyObject = await getObject(keysHash);
        if (!keyObject || !keyObject.publicSignKey) {
            throw new Error('Could not retrieve public keys from keychain');
        }

        // Return empty string for secretKey (not used) and the public key
        // The secret key operations will use the crypto API directly
        console.log('[TrustModel] Using keychain public key, private operations via crypto API');
        return {
            secretKey: '', // Not exposed - use crypto API for signing
            publicKey: keyObject.publicSignKey
        };
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