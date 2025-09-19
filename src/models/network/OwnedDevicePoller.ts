/**
 * Owned Device Polling Service
 * 
 * Manages regular status polling and credential verification for owned devices.
 * Owned devices should be silent (not broadcasting) and polled directly.
 */

import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import type { Device } from './interfaces';
import type { DeviceDiscoveryModel } from './DeviceDiscoveryModel';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import { DeviceType } from './deviceTypes';
import Debug from 'debug';

const debug = Debug('one:device:poller');

export interface PolledDevice extends Device {
  lastPolled?: number;
  pollFailures: number;
  isReachable: boolean;
}

export interface PollingConfig {
  // Polling intervals in milliseconds
  normalInterval: number;      // Regular polling interval (default: 30s)
  failureInterval: number;     // Interval after failure (default: 60s)
  maxFailures: number;         // Max failures before marking unreachable (default: 3)
  
  // Features
  verifyCredentials: boolean;  // Verify ownership on each poll (default: true)
  autoReconnect: boolean;      // Auto-reconnect on failure (default: true)
}

const DEFAULT_CONFIG: PollingConfig = {
  normalInterval: 30000,       // 30 seconds
  failureInterval: 60000,      // 60 seconds
  maxFailures: 3,
  verifyCredentials: true,
  autoReconnect: true
};

export class OwnedDevicePoller {
  private config: PollingConfig;
  private discoveryModel: DeviceDiscoveryModel;
  private ownPersonId: SHA256IdHash<Person>;
  private polledDevices: Map<string, PolledDevice> = new Map();
  private pollingTimers: Map<string, NodeJS.Timeout> = new Map();
  private isActive: boolean = false;
  
  // Events
  public readonly onDeviceStatusUpdate = new OEvent<(device: PolledDevice) => void>();
  public readonly onDeviceUnreachable = new OEvent<(deviceId: string) => void>();
  public readonly onDeviceReconnected = new OEvent<(device: PolledDevice) => void>();
  public readonly onCredentialVerificationFailed = new OEvent<(deviceId: string) => void>();
  public readonly onError = new OEvent<(error: Error, deviceId?: string) => void>();
  
  constructor(
    discoveryModel: DeviceDiscoveryModel,
    ownPersonId: SHA256IdHash<Person>,
    config?: Partial<PollingConfig>
  ) {
    this.discoveryModel = discoveryModel;
    this.ownPersonId = ownPersonId;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    debug('Created OwnedDevicePoller with config:', this.config);
  }
  
  /**
   * Start polling owned devices
   */
  public async start(): Promise<void> {
    if (this.isActive) {
      debug('Poller already active');
      return;
    }
    
    debug('Starting owned device polling...');
    this.isActive = true;
    
    // Load owned devices from storage
    const ownedDevices = await this.loadOwnedDevices();
    
    // Start polling each device
    for (const device of ownedDevices) {
      this.addDevice(device);
    }
    
    debug(`Started polling ${ownedDevices.length} owned devices`);
  }
  
  /**
   * Stop polling all devices
   */
  public stop(): void {
    if (!this.isActive) {
      return;
    }
    
    debug('Stopping owned device polling...');
    this.isActive = false;
    
    // Clear all polling timers
    for (const [deviceId, timer] of this.pollingTimers) {
      clearTimeout(timer);
    }
    this.pollingTimers.clear();
    
    debug('Stopped polling all devices');
  }
  
  /**
   * Add a device to the polling list
   */
  public addDevice(device: Device): void {
    if (!this.isActive) {
      debug('Cannot add device - poller not active');
      return;
    }
    
    // Create polled device entry
    const polledDevice: PolledDevice = {
      ...device,
      lastPolled: 0,
      pollFailures: 0,
      isReachable: true
    };
    
    this.polledDevices.set(device.id, polledDevice);
    
    // Start polling immediately
    this.scheduleNextPoll(device.id, 0);
    
    debug(`Added device ${device.id} to polling list`);
  }
  
  /**
   * Remove a device from polling
   */
  public removeDevice(deviceId: string): void {
    // Clear timer
    const timer = this.pollingTimers.get(deviceId);
    if (timer) {
      clearTimeout(timer);
      this.pollingTimers.delete(deviceId);
    }
    
    // Remove from polled devices
    this.polledDevices.delete(deviceId);
    
    debug(`Removed device ${deviceId} from polling list`);
  }
  
  /**
   * Poll a specific device
   */
  private async pollDevice(deviceId: string): Promise<void> {
    const device = this.polledDevices.get(deviceId);
    if (!device) {
      debug(`Device ${deviceId} not found in polling list`);
      return;
    }
    
    debug(`Polling device ${deviceId}...`);
    
    try {
      // 1. Send status request based on device type
      let statusResponse;
      
      if (device.type === DeviceType.ESP32) {
        // For ESP32, send status command
        statusResponse = await this.discoveryModel.sendESP32Command(deviceId, {
          type: 'status',
          command: 'get_status',
          deviceId: deviceId,
          timestamp: Date.now()
        });
      } else if (device.type === DeviceType.APPLICATION) {
        // For app instances, send a different status request
        // TODO: Implement app-to-app status check
        statusResponse = { status: 'success', data: { online: true } };
      } else {
        // Unknown device type - basic ping
        statusResponse = { status: 'success', data: { online: true } };
      }
      
      // 2. Verify credentials if enabled
      if (this.config.verifyCredentials) {
        const isOwner = await this.discoveryModel.verifyDeviceOwnership(deviceId);
        if (!isOwner) {
          debug(`Credential verification failed for device ${deviceId}`);
          this.onCredentialVerificationFailed.emit(deviceId);
          // Don't continue polling if we're not the owner
          this.removeDevice(deviceId);
          return;
        }
      }
      
      // 3. Update device state
      device.lastPolled = Date.now();
      device.pollFailures = 0;
      device.isReachable = true;
      device.lastSeen = Date.now();
      
      // 4. Handle reconnection if device was previously unreachable
      if (!device.isReachable) {
        debug(`Device ${deviceId} reconnected`);
        this.onDeviceReconnected.emit(device);
      }
      
      // 5. Emit status update
      this.onDeviceStatusUpdate.emit(device);
      
      // Schedule next poll with normal interval
      this.scheduleNextPoll(deviceId, this.config.normalInterval);
      
    } catch (error) {
      debug(`Failed to poll device ${deviceId}:`, error);
      
      // Increment failure count
      device.pollFailures++;
      device.lastPolled = Date.now();
      
      // Check if device should be marked unreachable
      if (device.pollFailures >= this.config.maxFailures) {
        device.isReachable = false;
        debug(`Device ${deviceId} marked as unreachable after ${device.pollFailures} failures`);
        this.onDeviceUnreachable.emit(deviceId);
      }
      
      // Emit error
      this.onError.emit(
        error instanceof Error ? error : new Error(String(error)),
        deviceId
      );
      
      // Schedule next poll with failure interval
      this.scheduleNextPoll(deviceId, this.config.failureInterval);
      
      // Attempt reconnection if enabled
      if (this.config.autoReconnect && device.type === DeviceType.ESP32) {
        this.attemptReconnection(deviceId).catch(err => {
          debug(`Reconnection attempt failed for ${deviceId}:`, err);
        });
      }
    }
  }
  
  /**
   * Schedule the next poll for a device
   */
  private scheduleNextPoll(deviceId: string, delay: number): void {
    if (!this.isActive) {
      return;
    }
    
    // Clear existing timer
    const existingTimer = this.pollingTimers.get(deviceId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Schedule new poll
    const timer = setTimeout(() => {
      this.pollDevice(deviceId).catch(err => {
        console.error(`[OwnedDevicePoller] Unhandled error polling device ${deviceId}:`, err);
      });
    }, delay);
    
    this.pollingTimers.set(deviceId, timer);
  }
  
  /**
   * Attempt to reconnect to a device
   */
  private async attemptReconnection(deviceId: string): Promise<void> {
    const device = this.polledDevices.get(deviceId);
    if (!device) {
      return;
    }
    
    debug(`Attempting to reconnect to device ${deviceId}...`);
    
    try {
      // For ESP32 devices, try to re-authenticate
      if (device.type === DeviceType.ESP32 && device.address && device.port) {
        const esp32Device = this.discoveryModel.getESP32Device(deviceId);
        if (!esp32Device || !esp32Device.isAuthenticated) {
          // Re-add to connection manager and authenticate
          await this.discoveryModel['_esp32ConnectionManager']?.authenticateDevice(
            deviceId,
            device.address,
            device.port
          );
        }
      }
    } catch (error) {
      debug(`Reconnection failed for device ${deviceId}:`, error);
      throw error;
    }
  }
  
  /**
   * Load owned devices from storage
   */
  private async loadOwnedDevices(): Promise<Device[]> {
    try {
      // Get devices from discovery model's credential storage
      const credentials = await this.discoveryModel.loadDeviceCredentials();
      
      // Convert credentials to devices
      const devices: Device[] = [];
      
      for (const credential of credentials) {
        // Get current device info if available
        const currentDevice = this.discoveryModel.getDevice(credential.deviceId);
        
        if (currentDevice) {
          // Use current device info
          devices.push(currentDevice);
        } else {
          // Create device entry from credential
          devices.push({
            id: credential.deviceId,
            name: credential.deviceId,
            type: credential.deviceType,
            address: 'unknown', // Will be updated when device comes online
            port: 0,
            lastSeen: 0,
            capabilities: [],
            hasValidCredential: true,
            ownerId: this.ownPersonId
          });
        }
      }
      
      debug(`Loaded ${devices.length} owned devices from storage`);
      return devices;
      
    } catch (error) {
      debug('Error loading owned devices:', error);
      this.onError.emit(
        error instanceof Error ? error : new Error('Failed to load owned devices')
      );
      return [];
    }
  }
  
  /**
   * Get polling status for a device
   */
  public getDeviceStatus(deviceId: string): PolledDevice | undefined {
    return this.polledDevices.get(deviceId);
  }
  
  /**
   * Get all polled devices
   */
  public getPolledDevices(): PolledDevice[] {
    return Array.from(this.polledDevices.values());
  }
  
  /**
   * Force poll a specific device immediately
   */
  public async forcePoll(deviceId: string): Promise<void> {
    const device = this.polledDevices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not in polling list`);
    }
    
    // Cancel existing timer
    const timer = this.pollingTimers.get(deviceId);
    if (timer) {
      clearTimeout(timer);
      this.pollingTimers.delete(deviceId);
    }
    
    // Poll immediately
    await this.pollDevice(deviceId);
  }
  
  /**
   * Update device address (for when it changes)
   */
  public updateDeviceAddress(deviceId: string, address: string, port: number): void {
    const device = this.polledDevices.get(deviceId);
    if (device) {
      device.address = address;
      device.port = port;
      debug(`Updated address for device ${deviceId}: ${address}:${port}`);
    }
  }
}