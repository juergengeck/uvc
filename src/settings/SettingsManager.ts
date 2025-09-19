import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import type { DeviceSettingsGroup } from '@src/types/device';
import type { NetworkSettingsGroup } from './types';
import type { SettingStoreApi } from '@refinio/one.core/lib/storage-base-common.js';

/**
 * Settings manager interface
 */
export interface ISettingsManager {
  /**
   * Get a setting by key
   * @param key The setting key
   * @returns The setting value or undefined if not found
   */
  get<T>(key: string): T | undefined;

  /**
   * Set a setting
   * @param key The setting key
   * @param value The setting value
   */
  set<T>(key: string, value: T): void;

  /**
   * Check if a setting exists
   * @param key The setting key
   * @returns True if the setting exists
   */
  has(key: string): boolean;

  /**
   * Delete a setting
   * @param key The setting key
   * @returns True if the setting was deleted
   */
  delete(key: string): boolean;

  /**
   * Clear all settings
   */
  clear(): void;

  /**
   * Get all settings
   * @returns All settings
   */
  getAll(): Record<string, unknown>;

  /**
   * Load settings from storage
   */
  load(): Promise<void>;

  /**
   * Save settings to storage
   */
  save(): Promise<void>;

  /**
   * Event emitted when a setting changes
   */
  readonly onChange: OEvent<(key: string, value: unknown) => void>;
}

/**
 * Settings manager implementation
 * Handles persistent settings storage using PropertyTreeStore
 */
export class SettingsManager implements ISettingsManager {
  private settings: Record<string, unknown> = {};
  private readonly storageKey: string;
  private readonly propertyTree?: SettingStoreApi;
  public readonly onChange = new OEvent<(key: string, value: unknown) => void>();

  constructor(storageKey = 'app_settings', propertyTree?: SettingStoreApi) {
    this.storageKey = storageKey;
    this.propertyTree = propertyTree;
  }

  /**
   * Get a setting by key
   * @param key The setting key
   * @returns The setting value or undefined if not found
   */
  public get<T>(key: string): T | undefined {
    return this.settings[key] as T | undefined;
  }

  /**
   * Set a setting
   * @param key The setting key
   * @param value The setting value
   */
  public set<T>(key: string, value: T): void {
    this.settings[key] = value;
    this.onChange.emit(key, value);
  }

  /**
   * Check if a setting exists
   * @param key The setting key
   * @returns True if the setting exists
   */
  public has(key: string): boolean {
    return key in this.settings;
  }

  /**
   * Delete a setting
   * @param key The setting key
   * @returns True if the setting was deleted
   */
  public delete(key: string): boolean {
    if (this.has(key)) {
      delete this.settings[key];
      this.onChange.emit(key, undefined);
      return true;
    }
    return false;
  }

  /**
   * Clear all settings
   */
  public clear(): void {
    this.settings = {};
    this.onChange.emit('*', undefined);
  }

  /**
   * Get all settings
   * @returns All settings
   */
  public getAll(): Record<string, unknown> {
    return { ...this.settings };
  }

  /**
   * Load settings from storage
   */
  public async load(): Promise<void> {
    try {
      if (this.propertyTree) {
        // Use PropertyTreeStore if available
        const storedSettings = await this.propertyTree.getItem(this.storageKey);
        if (storedSettings && typeof storedSettings === 'string') {
          this.settings = JSON.parse(storedSettings);
        } else {
          // Initialize with default settings
          this.initializeDefaultSettings();
        }
      } else {
        console.warn('[SettingsManager] PropertyTreeStore not available, settings will not persist');
        // Initialize with default settings
        this.initializeDefaultSettings();
      }
    } catch (error) {
      console.error('[SettingsManager] Failed to load settings:', error);
      // Initialize with default settings on error
      this.initializeDefaultSettings();
    }
  }

  /**
   * Save settings to storage
   */
  public async save(): Promise<void> {
    try {
      if (this.propertyTree) {
        // Use PropertyTreeStore if available
        await this.propertyTree.setItem(this.storageKey, JSON.stringify(this.settings));
      } else {
        console.warn('[SettingsManager] PropertyTreeStore not available, settings will not persist');
      }
    } catch (error) {
      console.error('[SettingsManager] Failed to save settings:', error);
      throw error;
    }
  }

  /**
   * Initialize default settings
   */
  private initializeDefaultSettings(): void {
    // Initialize device settings
    const deviceSettings: DeviceSettingsGroup = {
      $type$: 'Settings.device',
      devices: {},
      discoveryEnabled: false, // DISABLED by default for privacy, security and battery conservation
      discoveryPort: 49497,
      autoConnect: false,
      addOnlyConnectedDevices: false,
      defaultDataPresentation: {
        $type$: 'ESP32DataPresentation',
        format: 'json'
      }
    };

    // Initialize network settings
    const networkSettings: NetworkSettingsGroup = {
      $type$: 'Settings.network',
      eddaDomain: 'https://edda.dev.refinio.one', // Test against development instance
      autoConnect: false
    };

    this.settings.device = deviceSettings;
    this.settings.network = networkSettings;
  }

  /**
   * Get default device settings - the single source of truth for device defaults
   * @returns Default device settings group
   */
  public static getDefaultDeviceSettings(): DeviceSettingsGroup {
    // THIS IS THE SINGLE SOURCE OF TRUTH for device default settings
    // Any code creating default device settings should use this method
    // rather than defining its own defaults
    return {
      $type$: 'Settings.device',
      devices: {}, // @deprecated - devices should be stored in DeviceModel as ONE objects, not in settings
      // IMPORTANT: Discovery is DISABLED by default for:
      // 1. Privacy: Prevents broadcasting device presence on untrusted networks
      // 2. Security: Minimizes attack surface until explicitly enabled by user
      // 3. Battery conservation: Reduces power consumption on mobile devices
      discoveryEnabled: false,
      discoveryPort: 49497,
      discoveryBroadcastInterval: 5000, // 5 seconds default
      autoConnect: false,
      addOnlyConnectedDevices: false,
      defaultDataPresentation: {
        $type$: 'ESP32DataPresentation',
        format: 'json'
      }
    };
  }

  /**
   * Get device settings
   * @returns Device settings
   */
  public getDeviceSettings(): DeviceSettingsGroup {
    return this.get<DeviceSettingsGroup>('device') || SettingsManager.getDefaultDeviceSettings();
  }

  /**
   * Set device settings
   * @param settings Device settings
   */
  public setDeviceSettings(settings: DeviceSettingsGroup): void {
    this.set('device', settings);
  }

  /**
   * Update device settings
   * @param settings Partial device settings
   */
  public updateDeviceSettings(settings: Partial<DeviceSettingsGroup>): void {
    const currentSettings = this.getDeviceSettings();
    this.setDeviceSettings({
      ...currentSettings,
      ...settings
    });
  }

  /**
   * Get default network settings
   * @returns Default network settings
   */
  public static getDefaultNetworkSettings(): NetworkSettingsGroup {
    return {
      $type$: 'Settings.network',
      eddaDomain: 'https://edda.dev.refinio.one', // Test against development instance
      autoConnect: false
    };
  }

  /**
   * Get network settings
   * @returns Network settings or default if not found
   */
  public getNetworkSettings(): NetworkSettingsGroup {
    const settings = this.get<NetworkSettingsGroup>('network');
    return settings || SettingsManager.getDefaultNetworkSettings();
  }

  /**
   * Set network settings
   * @param settings Network settings to set
   */
  public setNetworkSettings(settings: NetworkSettingsGroup): void {
    this.set('network', settings);
  }

  /**
   * Update network settings
   * @param settings Partial network settings to update
   */
  public updateNetworkSettings(settings: Partial<NetworkSettingsGroup>): void {
    const currentSettings = this.getNetworkSettings();
    const updatedSettings = { ...currentSettings, ...settings };
    this.setNetworkSettings(updatedSettings);
  }

  /**
   * Get edda domain from settings
   * @returns Edda domain URL
   */
  public getEddaDomain(): string {
    const networkSettings = this.getNetworkSettings();
    return networkSettings.eddaDomain;
  }

  /**
   * Set edda domain in settings
   * @param domain Edda domain URL
   */
  public setEddaDomain(domain: string): void {
    this.updateNetworkSettings({ eddaDomain: domain });
  }
} 