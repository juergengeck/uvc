/**
 * SettingsModel - Manages application settings and device configuration
 * 
 * Extracted from AppModel to handle all settings-related functionality:
 * - PropertyTreeStore management
 * - Dark mode settings
 * - Device settings and DeviceSettingsService
 * - Settings persistence and retrieval
 */

import PropertyTreeStore from '@refinio/one.models/lib/models/SettingsModel';
import type { DeviceSettingsService as DeviceSettingsServiceType } from '@src/services/DeviceSettingsService';
import type { DeviceSettingsGroup, ESP32DataPresentation } from '@src/types/device';

export class SettingsModel {
    private _propertyTree!: PropertyTreeStore;
    private _deviceSettingsService?: DeviceSettingsServiceType;
    private _isInitialized = false;

    constructor(private appName: string = 'lama-app') {}

    /**
     * Initialize the SettingsModel
     */
    public async init(): Promise<void> {
        if (this._isInitialized) {
            console.log('[SettingsModel] Already initialized');
            return;
        }

        console.log('[SettingsModel] Initializing...');
        
        // Initialize PropertyTree
        await this.initPropertyTree();
        
        // Initialize DeviceSettingsService
        await this.initDeviceSettingsService();
        
        this._isInitialized = true;
        console.log('[SettingsModel] Initialization complete');
    }

    /**
     * Initialize PropertyTree for general settings storage
     */
    private async initPropertyTree(): Promise<void> {
        if (!this._propertyTree) {
            console.log('[SettingsModel] Creating PropertyTreeStore');
            this._propertyTree = new PropertyTreeStore(this.appName);
            await this._propertyTree.init();
            console.log('[SettingsModel] PropertyTreeStore initialized');
        }
    }

    /**
     * Get the PropertyTree instance
     */
    public get propertyTree(): PropertyTreeStore {
        if (!this._propertyTree) {
            console.warn('[SettingsModel] PropertyTree accessed before initialization, creating emergency instance');
            // Create emergency instance for fallback
            this._propertyTree = new PropertyTreeStore(`${this.appName}-emergency`);
            this._propertyTree.init().catch(e => {
                console.error('[SettingsModel] Failed to initialize emergency PropertyTree:', e);
            });
        }
        return this._propertyTree;
    }

    /**
     * Get dark mode setting
     */
    public async getDarkMode(): Promise<boolean | null> {
        try {
            const value = await this.propertyTree.getValue('darkMode');
            return value ? JSON.parse(value) : null;
        } catch (error) {
            console.error('[SettingsModel] Error getting dark mode:', error);
            return null;
        }
    }

    /**
     * Set dark mode setting
     */
    public async setDarkMode(value: boolean): Promise<void> {
        try {
            await this.propertyTree.setValue('darkMode', String(value));
            console.log('[SettingsModel] Dark mode set to:', value);
        } catch (error) {
            console.error('[SettingsModel] Error setting dark mode:', error);
            throw error;
        }
    }

    /**
     * Initialize DeviceSettingsService
     */
    private async initDeviceSettingsService(): Promise<void> {
        console.log('[SettingsModel] Initializing DeviceSettingsService...');
        
        try {
            // Import the service dynamically to avoid TypeScript errors
            const { DeviceSettingsService } = await import('@src/services/DeviceSettingsService');
            
            // Create default device settings with proper type
            const defaultSettings: DeviceSettingsGroup = {
                $type$: 'Settings.device',
                devices: {},
                discoveryEnabled: false,
                discoveryPort: 49497,
                autoConnect: false,
                addOnlyConnectedDevices: false,
                defaultDataPresentation: {
                    $type$: 'ESP32DataPresentation',
                    format: 'json'
                } as ESP32DataPresentation
            };
            
            // Create save callback that uses propertyTree
            const saveCallback = async (settings: any) => {
                console.log('[SettingsModel] Saving device settings:', JSON.stringify(settings));
                try {
                    await this.propertyTree.setValue('deviceSettings', JSON.stringify(settings));
                    console.log('[SettingsModel] Saved device settings to propertyTree');
                } catch (error) {
                    console.error('[SettingsModel] Failed to save device settings:', error);
                    throw error;
                }
            };
            
            // Create device settings service
            this._deviceSettingsService = new DeviceSettingsService(defaultSettings, saveCallback);
            console.log('[SettingsModel] DeviceSettingsService initialized successfully');
            
        } catch (error) {
            console.error('[SettingsModel] Failed to initialize DeviceSettingsService:', error);
            // Don't throw - DeviceSettingsService is optional
        }
    }

    /**
     * Get the DeviceSettingsService instance
     */
    public getDeviceSettingsService(): DeviceSettingsServiceType | undefined {
        return this._deviceSettingsService;
    }

    /**
     * Get a setting value from PropertyTree
     */
    public async getSetting(key: string): Promise<string | null> {
        try {
            return await this.propertyTree.getValue(key);
        } catch (error) {
            console.error(`[SettingsModel] Error getting setting '${key}':`, error);
            return null;
        }
    }

    /**
     * Set a setting value in PropertyTree
     */
    public async setSetting(key: string, value: string): Promise<void> {
        try {
            await this.propertyTree.setValue(key, value);
            console.log(`[SettingsModel] Setting '${key}' updated`);
        } catch (error) {
            console.error(`[SettingsModel] Error setting '${key}':`, error);
            throw error;
        }
    }

    /**
     * Load device settings from storage
     */
    public async loadDeviceSettings(): Promise<DeviceSettingsGroup | null> {
        try {
            const settingsJson = await this.getSetting('deviceSettings');
            return settingsJson ? JSON.parse(settingsJson) : null;
        } catch (error) {
            console.error('[SettingsModel] Error loading device settings:', error);
            return null;
        }
    }

    /**
     * Check if SettingsModel is initialized
     */
    public isInitialized(): boolean {
        return this._isInitialized;
    }

    /**
     * Shutdown and cleanup
     */
    public async shutdown(): Promise<void> {
        console.log('[SettingsModel] Shutting down...');
        
        // Clean up resources if needed
        this._deviceSettingsService = undefined;
        this._isInitialized = false;
        
        console.log('[SettingsModel] Shutdown complete');
    }
} 