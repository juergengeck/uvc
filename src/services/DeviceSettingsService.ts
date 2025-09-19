import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import type { DeviceSettingsGroup, ESP32DeviceSettings } from '@src/types/device';
import { DeviceDiscoveryModel } from '@src/models/network/DeviceDiscoveryModel';
import { QuicModel } from '@src/models/network/QuicModel';

/**
 * Device settings service
 * Provides methods for managing device settings
 */
export class DeviceSettingsService {
  private settings: DeviceSettingsGroup;
  private saveCallback: (settings: DeviceSettingsGroup) => Promise<void>;
  private explicitChange = false; // Flag to indicate explicit user changes that should not be preserved
  
  // Event emitters
  public readonly onDeviceAdded = new OEvent<(deviceId: string, device: ESP32DeviceSettings) => void>();
  public readonly onDeviceUpdated = new OEvent<(deviceId: string, device: ESP32DeviceSettings) => void>();
  public readonly onDeviceRemoved = new OEvent<(deviceId: string) => void>();
  public readonly onSettingsChanged = new OEvent<(settings: DeviceSettingsGroup) => void>();

  private settingsEventCounter = 0;
  
  // Debounce-related properties
  private saveDebounceTimeout: NodeJS.Timeout | null = null;
  private pendingSave = false;
  private changesSinceLastSave = false;
  private readonly SAVE_DEBOUNCE_MS = 200; // reduced debounce to 200 ms
  private readonly BATCH_SETTINGS_CHANGE_EVENT = true; // Use a single event for batched changes

  /**
   * Create a new DeviceSettingsService
   * @param initialSettings Initial device settings
   * @param saveCallback Callback to save settings
   */
  constructor(
    initialSettings: DeviceSettingsGroup,
    saveCallback: (settings: DeviceSettingsGroup) => Promise<void>
  ) {
    this.settings = initialSettings;
    this.saveCallback = saveCallback;
  }

  /**
   * Handle settings change
   * Emits the onSettingsChanged event and saves settings with debouncing
   */
  private async handleSettingsChange(immediate = false): Promise<void> {
    this.settingsEventCounter++;
    const eventId = this.settingsEventCounter;
    
    console.log(`[DeviceSettingsService] handleSettingsChange called (event #${eventId})`);
    
    if (this.BATCH_SETTINGS_CHANGE_EVENT) {
      // Batch event emission - just mark that we have pending changes
      this.changesSinceLastSave = true;
    } else {
      // Immediate event emission
      try {
        console.log(`[DeviceSettingsService] Event #${eventId} - Emitting onSettingsChanged event`);
        this.onSettingsChanged.emit(this.settings);
        console.log(`[DeviceSettingsService] Event #${eventId} - Successfully emitted onSettingsChanged event`);
      } catch (error) {
        console.error(`[DeviceSettingsService] Event #${eventId} - Error emitting onSettingsChanged event:`, error);
      }
    }
    
    // If an immediate save is requested, clear any pending debounced save
    if (immediate && this.saveDebounceTimeout !== null) {
      clearTimeout(this.saveDebounceTimeout);
      this.saveDebounceTimeout = null;
    }
    
    // If we're already saving or we have a debounce timeout set, just mark that we need another save
    if (this.pendingSave || (this.saveDebounceTimeout !== null && !immediate)) {
      console.log(`[DeviceSettingsService] Event #${eventId} - Save already pending, will save when current operation completes`);
      return;
    }
    
    // For a non-immediate save, set up a debounce timer
    if (!immediate) {
      console.log(`[DeviceSettingsService] Event #${eventId} - Setting up debounced save (${this.SAVE_DEBOUNCE_MS}ms)`);
      this.saveDebounceTimeout = setTimeout(() => {
        this.saveDebounceTimeout = null;
        this.executeSave(eventId);
      }, this.SAVE_DEBOUNCE_MS);
      return;
    }
    
    // For immediate saves, execute right away
    await this.executeSave(eventId);
  }
  
  /**
   * Execute the save operation
   */
  private async executeSave(eventId: number): Promise<void> {
    // If we have batched event emissions, emit now before saving
    if (this.BATCH_SETTINGS_CHANGE_EVENT && this.changesSinceLastSave) {
      try {
        console.log(`[DeviceSettingsService] Event #${eventId} - Emitting batched onSettingsChanged event`);
        this.onSettingsChanged.emit(this.settings);
        console.log(`[DeviceSettingsService] Event #${eventId} - Successfully emitted batched event`);
      } catch (error) {
        console.error(`[DeviceSettingsService] Event #${eventId} - Error emitting batched onSettingsChanged event:`, error);
      }
    }

    this.pendingSave = true;
    this.changesSinceLastSave = false;
    
    // Save settings when they change
    console.log(`[DeviceSettingsService] Event #${eventId} - Saving settings to persistent storage`);
    try {
      await this.saveSettings();
      console.log(`[DeviceSettingsService] Event #${eventId} - Successfully saved settings to persistent storage`);
    } catch (error) {
      console.error(`[DeviceSettingsService] Event #${eventId} - Failed to save settings:`, error);
      throw error;
    } finally {
      this.pendingSave = false;
      
      // If changes happened while we were saving, schedule another save
      if (this.changesSinceLastSave) {
        console.log(`[DeviceSettingsService] Event #${eventId} - Changes occurred during save, scheduling another save`);
        this.handleSettingsChange();
      }
    }
    
    console.log(`[DeviceSettingsService] Event #${eventId} - handleSettingsChange completed`);
  }

  /**
   * Save settings to persistent storage
   */
  private async saveSettings(): Promise<void> {
    console.log('[DeviceSettingsService] saveSettings called with settings:', JSON.stringify(this.settings));
    
    try {
      console.log('[DeviceSettingsService] Calling saveCallback with settings');
      // Pass a copy of the settings with an explicit change flag
      const settingsWithFlag = { ...this.settings, __explicitChange: this.explicitChange };
      await this.saveCallback(settingsWithFlag as any);
      console.log('[DeviceSettingsService] saveCallback completed successfully');
    } catch (error) {
      console.error('[DeviceSettingsService] Failed to save settings:', error);
      throw error;
    }
  }

  /**
   * Get all device settings
   */
  public getSettings(): DeviceSettingsGroup {
    return this.settings;
  }

  /**
   * Update device settings
   * @param settings Partial device settings
   */
  public async updateSettings(settings: Partial<DeviceSettingsGroup>, immediate = false): Promise<void> {
    this.settings = {
      ...this.settings,
      ...settings
    };
    
    await this.handleSettingsChange(immediate);
  }

  /**
   * Get all devices
   * @deprecated Use DeviceModel.getDevices() instead - devices should be stored as ONE objects, not in settings
   */
  public getDevices(): Record<string, ESP32DeviceSettings> {
    return this.settings.devices;
  }

  /**
   * Get a device by ID
   * @param deviceId Device ID
   * @deprecated Use DeviceModel.getDevice() instead - devices should be stored as ONE objects, not in settings
   */
  public getDevice(deviceId: string): ESP32DeviceSettings | undefined {
    return this.getDevices()[deviceId];
  }

  /**
   * Add a device
   * @param device Device settings
   * @deprecated Use DeviceModel.persistDeviceOwnership() instead - devices should be stored as ONE objects, not in settings
   */
  public async addDevice(device: ESP32DeviceSettings): Promise<void> {
    this.settings.devices[device.id] = device;
    await this.handleSettingsChange();
    this.onDeviceAdded.emit(device.id, device);
  }

  /**
   * Update a device
   * @param deviceId Device ID
   * @param device Device settings
   * @deprecated Use DeviceModel.updateDeviceSettings() instead - devices should be stored as ONE objects, not in settings
   */
  public async updateDevice(deviceId: string, device: Partial<ESP32DeviceSettings>): Promise<void> {
    const existingDevice = this.settings.devices[deviceId];
    
    if (!existingDevice) {
      throw new Error(`Device ${deviceId} not found`);
    }

    this.settings.devices[deviceId] = {
      ...existingDevice,
      ...device
    };

    await this.handleSettingsChange();
    this.onDeviceUpdated.emit(deviceId, this.settings.devices[deviceId]);
  }

  /**
   * Remove a device
   * @param deviceId Device ID
   * @deprecated Use DeviceModel.removeDeviceOwnership() instead - devices should be stored as ONE objects, not in settings
   */
  public async removeDevice(deviceId: string): Promise<void> {
    if (!this.settings.devices[deviceId]) {
      throw new Error(`Device ${deviceId} not found`);
    }

    delete this.settings.devices[deviceId];
    await this.handleSettingsChange();
    this.onDeviceRemoved.emit(deviceId);
  }

  /**
   * Enable/disable discovery
   * @param enabled Whether discovery should be enabled
   */
  public async setDiscoveryEnabled(enabled: boolean): Promise<void> {
    console.log(`[DeviceSettingsService] ===== SET DISCOVERY ENABLED START (${enabled}) =====`);
    console.log(`[DeviceSettingsService] Setting discovery enabled called at: ${new Date().toISOString()}`);
    console.log(`[DeviceSettingsService] Current settings before update:`, JSON.stringify(this.settings));
    
    // Check if value is actually changing
    if (this.settings.discoveryEnabled === enabled) {
      console.log(`[DeviceSettingsService] Discovery already ${enabled ? 'enabled' : 'disabled'}, no change needed`);
      console.log(`[DeviceSettingsService] ===== SET DISCOVERY ENABLED END (NO CHANGE) =====`);
      return;
    }
    
    try {
      console.log(`[DeviceSettingsService] Setting discovery enabled to ${enabled} (was: ${this.settings.discoveryEnabled})`);
      
      // Mark this as an explicit change to prevent preservation logic from overriding it
      this.explicitChange = true;
      this.settings.discoveryEnabled = enabled;
      
      console.log(`[DeviceSettingsService] Calling handleSettingsChange to emit event and save settings`);
      await this.handleSettingsChange();
      
      // Ensure we try to update the actual discovery model state
      await this.notifyDiscoveryStateChanged(enabled);
      
      // Double-check that setting was actually applied
      if (this.settings.discoveryEnabled !== enabled) {
        console.error(`[DeviceSettingsService] CRITICAL ERROR: Setting did not take effect! Value is still ${this.settings.discoveryEnabled} after update`);
        throw new Error(`Failed to update discoveryEnabled setting`);
      }
      
      console.log(`[DeviceSettingsService] Settings after update:`, JSON.stringify(this.settings));
      console.log(`[DeviceSettingsService] Discovery ${enabled ? 'enabled' : 'disabled'}, settings change event emitted`);
      console.log(`[DeviceSettingsService] ===== SET DISCOVERY ENABLED END (${enabled}) =====`);
    } catch (error) {
      console.error(`[DeviceSettingsService] ERROR in setDiscoveryEnabled:`, error);
      console.error(`[DeviceSettingsService] ===== SET DISCOVERY ENABLED END (ERROR) =====`);
      throw error;
    } finally {
      // Reset the explicit change flag
      this.explicitChange = false;
    }
  }
  
  /**
   * Notify the DeviceDiscoveryModel about discovery state change
   */
  private async notifyDiscoveryStateChanged(enabled: boolean): Promise<void> {
    try {
      const globalContext = window as any;
      
      // Get DeviceDiscoveryModel - prefer from AppModel to ensure we use the initialized instance
      let discoveryModel = globalContext.appModel?.deviceDiscoveryModel;
      
      if (!discoveryModel) {
        // No fallback - must be initialized through AppModel after login
        console.warn('[DeviceSettingsService] DeviceDiscoveryModel not available - app not fully initialized');
      } else {
        console.log('[DeviceSettingsService] Using DeviceDiscoveryModel from AppModel');
      }
      
      // Don't try to initialize - the model should already be initialized by AppModel
      if (!discoveryModel) {
        console.warn('[DeviceSettingsService] DeviceDiscoveryModel not available');
        return;
      }
      
      if (!discoveryModel.isInitialized()) {
        console.warn('[DeviceSettingsService] DeviceDiscoveryModel not initialized - this should not happen');
        return;
      }
      
      if (discoveryModel) {
        console.log(`[DeviceSettingsService] Found DeviceDiscoveryModel, updating forciblyDisabled=${!enabled}`);
        
        // Update the model directly
        if (typeof discoveryModel.setForciblyDisabled === 'function') {
          discoveryModel.setForciblyDisabled(!enabled);
          console.log(`[DeviceSettingsService] Updated discoveryModel.forciblyDisabled=${!enabled}`);
        }
        
        // Also directly start/stop discovery based on new state
        if (enabled) {
          // If enabling discovery, start it directly
          if (typeof discoveryModel.startDiscovery === 'function' && !discoveryModel.isDiscovering()) {
            console.log('[DeviceSettingsService] Discovery not running, starting it');
            await discoveryModel.startDiscovery();
            console.log('[DeviceSettingsService] Discovery started successfully');
          } else {
            console.log('[DeviceSettingsService] Discovery already running, skipping start');
          }
        } else {
          // If disabling discovery, stop it directly
          if (typeof discoveryModel.stopDiscovery === 'function' && discoveryModel.isDiscovering()) {
            console.log('[DeviceSettingsService] Discovery running, stopping it');
            await discoveryModel.stopDiscovery();
            console.log('[DeviceSettingsService] Discovery stopped successfully');
          } else {
            console.log('[DeviceSettingsService] Discovery already stopped, skipping stop');
          }
        }
        
        // Broadcast discovery state for anyone listening
        if (enabled && typeof discoveryModel.onDiscoveryStarted?.emit === 'function') {
          console.log('[DeviceSettingsService] Broadcasting discovery started event');
          discoveryModel.onDiscoveryStarted.emit();
        } else if (!enabled && typeof discoveryModel.onDiscoveryStopped?.emit === 'function') {
          console.log('[DeviceSettingsService] Broadcasting discovery stopped event');
          discoveryModel.onDiscoveryStopped.emit();
        }
      } else {
        console.log(`[DeviceSettingsService] DeviceDiscoveryModel not found or could not be created`);
      }
    } catch (error) {
      console.error(`[DeviceSettingsService] Error notifying DeviceDiscoveryModel:`, error);
    }
  }

  /**
   * Set discovery port
   * @param port Discovery port
   */
  public async setDiscoveryPort(port: number): Promise<void> {
    this.settings.discoveryPort = port;
    await this.handleSettingsChange();
  }

  /**
   * Enable/disable auto-connect
   * @param enabled Whether auto-connect is enabled
   */
  public async setAutoConnect(enabled: boolean): Promise<void> {
    this.settings.autoConnect = enabled;
    await this.handleSettingsChange();
  }

  /**
   * Enable/disable adding only connected devices
   * @param enabled Whether to add only connected devices
   */
  public async setAddOnlyConnectedDevices(enabled: boolean): Promise<void> {
    this.settings.addOnlyConnectedDevices = enabled;
    await this.handleSettingsChange();
  }

  /**
   * Associate a device with a person
   * @param deviceId Device ID
   * @param personId Person ID
   * @deprecated Use DeviceModel.persistDeviceOwnership() instead - devices should be stored as ONE objects, not in settings
   */
  public async associateDeviceWithPerson(deviceId: string, personId: SHA256IdHash<Person>): Promise<void> {
    const device = this.getDevice(deviceId);
    
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    await this.updateDevice(deviceId, {
      personId
    });
  }

  /**
   * Disassociate a device from a person
   * @param deviceId Device ID
   * @deprecated Use DeviceModel.removeDeviceOwnership() instead - devices should be stored as ONE objects, not in settings
   */
  public async disassociateDeviceFromPerson(deviceId: string): Promise<void> {
    const device = this.getDevice(deviceId);
    
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    await this.updateDevice(deviceId, {
      personId: undefined
    });
  }

  /**
   * Get devices associated with a person
   * @param personId Person ID
   * @deprecated Use DeviceModel.getDevices() with filtering instead - devices should be stored as ONE objects, not in settings
   */
  public getDevicesForPerson(personId: SHA256IdHash<Person>): ESP32DeviceSettings[] {
    const devices = this.getDevices();
    return Object.values(devices).filter(device => device.personId === personId);
  }
} 