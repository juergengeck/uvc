/**
 * NetworkModel - Manages all network transport functionality
 * 
 * Extracted from AppModel to handle all network-related operations:
 * - QUIC transport management via QuicModel
 * - UDP socket creation via UdpModel  
 * - Device discovery and pairing via DeviceDiscoveryModel
 * - Network initialization and shutdown coordination
 * - Network identity management
 */

import { QuicModel } from './network/QuicModel';
import { UdpModel } from './network/UdpModel';
import type { UdpSocket, UdpSocketOptions } from './network/UdpModel';
import { DeviceDiscoveryModel } from './network/DeviceDiscoveryModel';
import type { IQuicTransport } from './network/interfaces';
import type { DeviceSettingsService } from '@src/services/DeviceSettingsService';
import { btleService } from '@refinio/one.btle';

export class NetworkModel {
    private _quicModel!: QuicModel;
    private _udpModel!: UdpModel;
    private _deviceDiscoveryModel?: DeviceDiscoveryModel;
    private _btleInitialized = false;
    private _isInitialized = false;

    constructor() {
        console.log('[NetworkModel] Constructor called');
    }

    /**
     * Initialize all network components in the correct order
     */
    public async init(): Promise<void> {
        if (this._isInitialized) {
            console.log('[NetworkModel] Already initialized, skipping');
            return;
        }

        console.log('[NetworkModel] Initializing network components...');

        try {
            // Initialize QUIC transport first as it's foundational
            await this.initQuicModel();
            
            // Initialize UDP model
            await this.initUdpModel();
            
            // Initialize device discovery last as it depends on QUIC
            await this.initDeviceDiscovery();
            
            this._isInitialized = true;
            console.log('[NetworkModel] All network components initialized successfully');
        } catch (error) {
            console.error('[NetworkModel] Error initializing network components:', error);
            throw error; // Fail fast
        }
    }

    /**
     * Initialize QuicModel and QUIC transport
     */
    private async initQuicModel(): Promise<void> {
        console.log('[NetworkModel] Initializing QuicModel...');
        
        try {
            // Ensure QuicModel is initialized with discovery port
            await QuicModel.ensureInitialized({ port: 49497, host: '0.0.0.0' });
            console.log('[NetworkModel] QuicModel initialization attempt completed with port 49497');
            
            // Get singleton instance
            this._quicModel = QuicModel.getInstance();
            
            // Verify initialization
            console.log('[NetworkModel] QuicModel ready state:', this._quicModel.isReady());
            
        } catch (initError) {
            console.error('[NetworkModel] Error initializing QuicModel:', initError);
            console.warn('[NetworkModel] QuicModel initialization failed, network will have limited functionality');
            // Still assign instance for fallback behavior
            this._quicModel = QuicModel.getInstance();
        }
        
        console.log('[NetworkModel] QuicModel initialization process completed');
    }

    /**
     * Initialize UdpModel for UDP socket management
     */
    private async initUdpModel(): Promise<void> {
        console.log('[NetworkModel] Initializing UdpModel...');
        
        try {
            this._udpModel = UdpModel.getInstance();
            // UdpModel typically doesn't need async initialization, but we call init if it exists
            if (typeof this._udpModel.init === 'function') {
                await this._udpModel.init();
            }
            console.log('[NetworkModel] UdpModel initialized successfully');
        } catch (error) {
            console.error('[NetworkModel] Error initializing UdpModel:', error);
            throw error; // Fail fast
        }
    }

    /**
     * Initialize BTLE service for Bluetooth Low Energy support
     */
    private async initBTLE(): Promise<void> {
        console.log('[NetworkModel] Initializing BTLE service...');
        
        try {
            const initialized = await btleService.initialize();
            if (initialized) {
                this._btleInitialized = true;
                console.log('[NetworkModel] BTLE service initialized successfully');
                
                // Log BTLE state
                const state = await btleService.getState();
                console.log('[NetworkModel] BTLE state:', state);
                
                // Set up BTLE event listeners
                btleService.on('deviceDiscovered', (device) => {
                    console.log('[NetworkModel] BTLE device discovered:', device);
                });
                
                btleService.on('error', (error) => {
                    console.error('[NetworkModel] BTLE error:', error);
                });
            } else {
                console.warn('[NetworkModel] BTLE service initialization returned false');
                this._btleInitialized = false;
            }
        } catch (error) {
            console.error('[NetworkModel] Error initializing BTLE service:', error);
            // BTLE is not critical for basic operation, so we continue
            console.warn('[NetworkModel] BTLE initialization failed, Bluetooth features will be unavailable');
            this._btleInitialized = false;
        }
    }

    /**
     * Initialize DeviceDiscoveryModel and link it with other network components
     */
    private async initDeviceDiscovery(): Promise<void> {
        console.log('[NetworkModel] Initializing DeviceDiscoveryModel...');
        
        try {
            // Initialize DeviceDiscoveryModel BEFORE applying state protection
            this._deviceDiscoveryModel = DeviceDiscoveryModel.getInstance();
            
            // Ensure QuicModel is passed to DeviceDiscoveryModel
            this._deviceDiscoveryModel.setQuicModel(this._quicModel);
            
            // Initialize DeviceDiscoveryModel (it will handle settings service connection internally if needed)
            await this._deviceDiscoveryModel.init();
            console.log('[NetworkModel] DeviceDiscoveryModel initialized and linked');
            
        } catch (error) {
            console.error('[NetworkModel] Error initializing DeviceDiscoveryModel:', error);
            // DeviceDiscovery is not critical for basic operation, so we continue
            console.warn('[NetworkModel] DeviceDiscoveryModel initialization failed, device discovery will be unavailable');
        }
    }

    /**
     * Set device identity credentials for device discovery
     * This delegates to the DeviceDiscoveryModel if available
     */
    public async setOwnIdentity(deviceId: string, secretKey: string, publicKey: string): Promise<void> {
        await this.setDeviceIdentity(deviceId, secretKey, publicKey);
    }

    /**
     * Set device identity credentials for device discovery
     */
    public async setDeviceIdentity(deviceId: string, secretKey: string, publicKey: string): Promise<void> {
        if (!this._deviceDiscoveryModel) {
            console.error('[NetworkModel] DeviceDiscoveryModel not available for setting identity');
            return;
        }

        try {
            console.log('[NetworkModel] Setting device identity for DeviceDiscoveryModel');
            await this._deviceDiscoveryModel.setOwnIdentity(deviceId, secretKey, publicKey);
        } catch (error) {
            console.error('[NetworkModel] Error setting device identity:', error);
            // Don't fail completely, as this may be called before full initialization
        }
    }

    /**
     * Connect DeviceSettingsService to DeviceDiscoveryModel
     */
    public connectSettingsService(deviceSettingsService: DeviceSettingsService): void {
        try {
            if (this._deviceDiscoveryModel && typeof this._deviceDiscoveryModel.setSettingsService === 'function') {
                this._deviceDiscoveryModel.setSettingsService(deviceSettingsService);
                console.log('[NetworkModel] Connected DeviceDiscoveryModel with DeviceSettingsService');
            } else {
                console.warn('[NetworkModel] DeviceDiscoveryModel not available for settings service connection');
            }
        } catch (discoveryError) {
            console.error('[NetworkModel] Error connecting DeviceDiscoveryModel:', discoveryError);
        }
    }

    /**
     * Gets the QuicTransport instance.
     * This is a convenience method to access the QuicTransport from the QuicModel.
     */
    public get quicTransport(): IQuicTransport {
        return this._quicModel.getTransport();
    }

    /**
     * Creates a UDP socket through the UdpModel or QuicModel.
     * This convenience method creates a UDP socket through the network layer.
     */
    public async createUdpSocket(options: UdpSocketOptions = { type: 'udp4' }): Promise<UdpSocket> {
        if (!this._quicModel) {
            throw new Error('NetworkModel not initialized - QuicModel unavailable');
        }
        
        // Try UdpModel first if available, fallback to QuicModel
        if (this._udpModel && typeof this._udpModel.createSocket === 'function') {
            return await this._udpModel.createSocket(options);
        } else if (typeof this._quicModel.createUdpSocket === 'function') {
            return await this._quicModel.createUdpSocket(options);
        } else {
            throw new Error('No UDP socket creation method available');
        }
    }

    /**
     * Gets the QuicModel singleton instance.
     * Provides access to QUIC transport functionality.
     */
    public get quicModel(): QuicModel {
        if (!this._quicModel) {
            console.warn('[NetworkModel] QuicModel accessed before initialization, getting instance');
            this._quicModel = QuicModel.getInstance();
        }
        return this._quicModel;
    }

    /**
     * Gets the UdpModel singleton instance.
     * Provides access to UDP socket functionality.
     */
    public get udpModel(): UdpModel {
        if (!this._udpModel) {
            console.warn('[NetworkModel] UdpModel accessed before initialization, getting instance');
            this._udpModel = UdpModel.getInstance();
        }
        return this._udpModel;
    }

    /**
     * Gets the DeviceDiscoveryModel instance.
     * Provides access to device discovery and pairing functionality.
     */
    public get deviceDiscoveryModel(): DeviceDiscoveryModel | undefined {
        return this._deviceDiscoveryModel;
    }

    /**
     * Check if BTLE is initialized and available
     */
    public get isBTLEInitialized(): boolean {
        return this._btleInitialized;
    }

    /**
     * Get the BTLE service instance
     */
    public get btleService() {
        return btleService;
    }

    /**
     * Check if the network layer is fully initialized
     */
    public get isInitialized(): boolean {
        return this._isInitialized;
    }

    /**
     * Get network status information for debugging
     */
    public getNetworkStatus(): {
        quicReady: boolean;
        udpAvailable: boolean;
        deviceDiscoveryAvailable: boolean;
        isInitialized: boolean;
    } {
        return {
            quicReady: this._quicModel?.isReady() ?? false,
            udpAvailable: !!this._udpModel,
            deviceDiscoveryAvailable: !!this._deviceDiscoveryModel,
            isInitialized: this._isInitialized
        };
    }

    /**
     * Shutdown all network components
     */
    public async shutdown(): Promise<void> {
        console.log('[NetworkModel] Shutting down network components...');
        
        try {
            // Shutdown DeviceDiscoveryModel first
            if (this._deviceDiscoveryModel) {
                try {
                    await this._deviceDiscoveryModel.shutdown();
                    this._deviceDiscoveryModel = undefined;
                    console.log('[NetworkModel] DeviceDiscoveryModel shut down');
                } catch (error) {
                    console.error('[NetworkModel] Error shutting down DeviceDiscoveryModel:', error);
                }
            }

            // Shutdown UdpModel if it has shutdown method
            if (this._udpModel && typeof this._udpModel.shutdown === 'function') {
                try {
                    await this._udpModel.shutdown();
                    console.log('[NetworkModel] UdpModel shut down');
                } catch (error) {
                    console.error('[NetworkModel] Error shutting down UdpModel:', error);
                }
            }

            // Shutdown QuicModel if it has shutdown method
            if (this._quicModel && typeof this._quicModel.shutdown === 'function') {
                try {
                    await this._quicModel.shutdown();
                    console.log('[NetworkModel] QuicModel shut down');
                } catch (error) {
                    console.error('[NetworkModel] Error shutting down QuicModel:', error);
                }
            }

            this._isInitialized = false;
            console.log('[NetworkModel] Network shutdown completed');
            
        } catch (error) {
            console.error('[NetworkModel] Error during network shutdown:', error);
            // Continue shutdown process even if some components fail
        }
    }

    /**
     * Helper method to get DeviceDiscoveryModel instance safely
     * This is a convenience method for compatibility
     */
    private getDeviceDiscoveryModel(): DeviceDiscoveryModel | undefined {
        try {
            return DeviceDiscoveryModel.getInstance();
        } catch (error) {
            console.warn('[NetworkModel] Failed to get DeviceDiscoveryModel:', error);
            return undefined;
        }
    }
} 