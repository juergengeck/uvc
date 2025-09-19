/**
 * Owned Device Monitor
 * 
 * Manages device monitoring with alternating polling and heartbeat pattern.
 * - Polling: Full status check with credential verification
 * - Heartbeat: Lightweight ping to check connectivity
 */

import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import type { Device } from './interfaces';
import type { DeviceDiscoveryModel } from './DeviceDiscoveryModel';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import { DeviceType } from './deviceTypes';
import Debug from 'debug';

const debug = Debug('one:device:monitor');

export interface MonitoredDevice extends Device {
  lastPolled?: number;
  lastHeartbeat?: number;
  nextCheckType: 'poll' | 'heartbeat';
  nextCheckTime: number;
  failures: number;
  isReachable: boolean;
}

export interface MonitorConfig {
  // Timing configuration (in milliseconds)
  pollingInterval: number;      // Time between poll and next heartbeat (default: 10s)
  heartbeatInterval: number;    // Time between heartbeat and next poll (default: 10s)
  failureRetryDelay: number;    // Delay after failure before retry (default: 30s)
  maxFailures: number;          // Max failures before marking unreachable (default: 3)
  
  // Features
  verifyCredentials: boolean;   // Verify ownership during polling (default: true)
  autoReconnect: boolean;       // Auto-reconnect on failure (default: true)
  
  // Heartbeat configuration
  heartbeatTimeout: number;     // Timeout for heartbeat response (default: 5s)
}

const DEFAULT_CONFIG: MonitorConfig = {
  pollingInterval: 10000,       // 10 seconds
  heartbeatInterval: 10000,     // 10 seconds  
  failureRetryDelay: 30000,     // 30 seconds
  maxFailures: 3,
  verifyCredentials: true,
  autoReconnect: true,
  heartbeatTimeout: 5000        // 5 seconds
};

export class OwnedDeviceMonitor {
  private config: MonitorConfig;
  private discoveryModel: DeviceDiscoveryModel;
  private ownPersonId: SHA256IdHash<Person>;
  private monitoredDevices: Map<string, MonitoredDevice> = new Map();
  private checkTimers: Map<string, NodeJS.Timeout> = new Map();
  private isActive: boolean = false;
  
  // Events
  public readonly onDeviceStatusUpdate = new OEvent<(device: MonitoredDevice, checkType: 'poll' | 'heartbeat') => void>();
  public readonly onDeviceUnreachable = new OEvent<(deviceId: string) => void>();
  public readonly onDeviceReconnected = new OEvent<(device: MonitoredDevice) => void>();
  public readonly onCredentialVerificationFailed = new OEvent<(deviceId: string) => void>();
  public readonly onHeartbeat = new OEvent<(deviceId: string, latency: number) => void>();
  public readonly onError = new OEvent<(error: Error, deviceId?: string) => void>();
  
  constructor(
    discoveryModel: DeviceDiscoveryModel,
    ownPersonId: SHA256IdHash<Person>,
    config?: Partial<MonitorConfig>
  ) {
    this.discoveryModel = discoveryModel;
    this.ownPersonId = ownPersonId;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    debug('Created OwnedDeviceMonitor with config:', this.config);
  }
  
  /**
   * Start monitoring owned devices
   */
  public async start(): Promise<void> {
    if (this.isActive) {
      debug('Monitor already active');
      return;
    }
    
    debug('Starting owned device monitoring...');
    this.isActive = true;
    
    // Load owned devices from storage
    const ownedDevices = await this.loadOwnedDevices();
    
    // Start monitoring each device
    for (const device of ownedDevices) {
      this.addDevice(device);
    }
    
    debug(`Started monitoring ${ownedDevices.length} owned devices`);
  }
  
  /**
   * Stop monitoring all devices
   */
  public stop(): void {
    if (!this.isActive) {
      return;
    }
    
    debug('Stopping owned device monitoring...');
    this.isActive = false;
    
    // Clear all timers
    for (const [deviceId, timer] of this.checkTimers) {
      clearTimeout(timer);
    }
    this.checkTimers.clear();
    
    debug('Stopped monitoring all devices');
  }
  
  /**
   * Add a device to monitoring
   */
  public addDevice(device: Device): void {
    if (!this.isActive) {
      debug('Cannot add device - monitor not active');
      return;
    }
    
    // Create monitored device entry
    const monitoredDevice: MonitoredDevice = {
      ...device,
      lastPolled: 0,
      lastHeartbeat: 0,
      nextCheckType: 'poll', // Start with full poll
      nextCheckTime: Date.now(),
      failures: 0,
      isReachable: true
    };
    
    this.monitoredDevices.set(device.id, monitoredDevice);
    
    // Start monitoring immediately
    this.scheduleNextCheck(device.id, 0);
    
    debug(`Added device ${device.id} to monitoring`);
  }
  
  /**
   * Remove a device from monitoring
   */
  public removeDevice(deviceId: string): void {
    // Clear timer
    const timer = this.checkTimers.get(deviceId);
    if (timer) {
      clearTimeout(timer);
      this.checkTimers.delete(deviceId);
    }
    
    // Remove from monitored devices
    this.monitoredDevices.delete(deviceId);
    
    debug(`Removed device ${deviceId} from monitoring`);
  }
  
  /**
   * Perform next check (poll or heartbeat) for a device
   */
  private async performNextCheck(deviceId: string): Promise<void> {
    const device = this.monitoredDevices.get(deviceId);
    if (!device) {
      debug(`Device ${deviceId} not found in monitoring list`);
      return;
    }
    
    const checkType = device.nextCheckType;
    debug(`Performing ${checkType} for device ${deviceId}...`);
    
    try {
      if (checkType === 'poll') {
        await this.pollDevice(device);
      } else {
        await this.heartbeatDevice(device);
      }
      
      // Success - reset failures and schedule next check
      device.failures = 0;
      device.isReachable = true;
      
      // Update next check type (alternate between poll and heartbeat)
      device.nextCheckType = checkType === 'poll' ? 'heartbeat' : 'poll';
      
      // Schedule next check
      const nextDelay = checkType === 'poll' 
        ? this.config.pollingInterval 
        : this.config.heartbeatInterval;
      
      this.scheduleNextCheck(deviceId, nextDelay);
      
    } catch (error) {
      debug(`${checkType} failed for device ${deviceId}:`, error);
      
      // Increment failure count
      device.failures++;
      
      // Check if device should be marked unreachable
      if (device.failures >= this.config.maxFailures) {
        if (device.isReachable) {
          device.isReachable = false;
          debug(`Device ${deviceId} marked as unreachable after ${device.failures} failures`);
          this.onDeviceUnreachable.emit(deviceId);
        }
      }
      
      // Emit error
      this.onError.emit(
        error instanceof Error ? error : new Error(String(error)),
        deviceId
      );
      
      // Schedule retry with failure delay
      this.scheduleNextCheck(deviceId, this.config.failureRetryDelay);
      
      // Attempt reconnection if enabled
      if (this.config.autoReconnect && device.type === DeviceType.ESP32) {
        this.attemptReconnection(deviceId).catch(err => {
          debug(`Reconnection attempt failed for ${deviceId}:`, err);
        });
      }
    }
  }
  
  /**
   * Perform full status poll
   */
  private async pollDevice(device: MonitoredDevice): Promise<void> {
    debug(`Polling device ${device.id}...`);
    
    // 1. Send status request based on device type
    let statusResponse;
    
    if (device.type === DeviceType.ESP32) {
      // For ESP32, send status command
      statusResponse = await this.discoveryModel.sendESP32Command(device.id, {
        type: 'status',
        command: 'get_status',
        deviceId: device.id,
        timestamp: Date.now()
      });
    } else if (device.type === DeviceType.APPLICATION) {
      // For app instances, send a status request
      // TODO: Implement app-to-app status check
      statusResponse = { status: 'success', data: { online: true } };
    } else {
      // Unknown device type - basic status
      statusResponse = { status: 'success', data: { online: true } };
    }
    
    // 2. Verify credentials if enabled
    if (this.config.verifyCredentials) {
      const isOwner = await this.discoveryModel.verifyDeviceOwnership(device.id);
      if (!isOwner) {
        debug(`Credential verification failed for device ${device.id}`);
        this.onCredentialVerificationFailed.emit(device.id);
        // Don't continue monitoring if we're not the owner
        this.removeDevice(device.id);
        return;
      }
    }
    
    // 3. Update device state
    device.lastPolled = Date.now();
    device.lastSeen = Date.now();
    
    // 4. Handle reconnection if device was previously unreachable
    const wasUnreachable = !device.isReachable;
    if (wasUnreachable) {
      debug(`Device ${device.id} reconnected`);
      this.onDeviceReconnected.emit(device);
    }
    
    // 5. Emit status update
    this.onDeviceStatusUpdate.emit(device, 'poll');
  }
  
  /**
   * Perform lightweight heartbeat
   */
  private async heartbeatDevice(device: MonitoredDevice): Promise<void> {
    debug(`Sending heartbeat to device ${device.id}...`);
    
    const startTime = Date.now();
    
    // Send lightweight ping based on device type
    if (device.type === DeviceType.ESP32) {
      // For ESP32, send a simple ping command
      const response = await this.discoveryModel.sendESP32Command(device.id, {
        type: 'ping',
        command: 'ping',
        deviceId: device.id,
        timestamp: startTime,
        data: { sequence: startTime }
      });
      
      if (response.status !== 'success') {
        throw new Error(`Heartbeat failed: ${response.message || 'Unknown error'}`);
      }
    } else if (device.type === DeviceType.APPLICATION) {
      // For app instances, send a lightweight ping
      // TODO: Implement app-to-app heartbeat
    }
    
    // Calculate latency
    const latency = Date.now() - startTime;
    
    // Update device state
    device.lastHeartbeat = Date.now();
    device.lastSeen = Date.now();
    
    // Handle reconnection if device was previously unreachable
    const wasUnreachable = !device.isReachable;
    if (wasUnreachable) {
      debug(`Device ${device.id} reconnected via heartbeat`);
      this.onDeviceReconnected.emit(device);
    }
    
    // Emit heartbeat event
    this.onHeartbeat.emit(device.id, latency);
    
    // Emit status update
    this.onDeviceStatusUpdate.emit(device, 'heartbeat');
    
    debug(`Heartbeat successful for ${device.id}, latency: ${latency}ms`);
  }
  
  /**
   * Schedule the next check for a device
   */
  private scheduleNextCheck(deviceId: string, delay: number): void {
    if (!this.isActive) {
      return;
    }
    
    const device = this.monitoredDevices.get(deviceId);
    if (!device) {
      return;
    }
    
    // Clear existing timer
    const existingTimer = this.checkTimers.get(deviceId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Update next check time
    device.nextCheckTime = Date.now() + delay;
    
    // Schedule new check
    const timer = setTimeout(() => {
      this.performNextCheck(deviceId).catch(err => {
        console.error(`[OwnedDeviceMonitor] Unhandled error checking device ${deviceId}:`, err);
      });
    }, delay);
    
    this.checkTimers.set(deviceId, timer);
    
    debug(`Scheduled ${device.nextCheckType} for ${deviceId} in ${delay}ms`);
  }
  
  /**
   * Attempt to reconnect to a device
   */
  private async attemptReconnection(deviceId: string): Promise<void> {
    const device = this.monitoredDevices.get(deviceId);
    if (!device) {
      return;
    }
    
    debug(`Attempting to reconnect to device ${deviceId}...`);
    
    try {
      // For ESP32 devices, try to re-authenticate
      if (device.type === DeviceType.ESP32 && device.address && device.port) {
        const esp32Device = this.discoveryModel.getESP32Device(deviceId);
        if (!esp32Device || !esp32Device.isAuthenticated) {
          // Re-authenticate with known address
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
   * Get monitoring status for a device
   */
  public getDeviceStatus(deviceId: string): MonitoredDevice | undefined {
    return this.monitoredDevices.get(deviceId);
  }
  
  /**
   * Get all monitored devices
   */
  public getMonitoredDevices(): MonitoredDevice[] {
    return Array.from(this.monitoredDevices.values());
  }
  
  /**
   * Force check a specific device immediately
   */
  public async forceCheck(deviceId: string, checkType?: 'poll' | 'heartbeat'): Promise<void> {
    const device = this.monitoredDevices.get(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} not in monitoring list`);
    }
    
    // Set check type if specified
    if (checkType) {
      device.nextCheckType = checkType;
    }
    
    // Cancel existing timer
    const timer = this.checkTimers.get(deviceId);
    if (timer) {
      clearTimeout(timer);
      this.checkTimers.delete(deviceId);
    }
    
    // Perform check immediately
    await this.performNextCheck(deviceId);
  }
  
  /**
   * Update device address (for when it changes)
   */
  public updateDeviceAddress(deviceId: string, address: string, port: number): void {
    const device = this.monitoredDevices.get(deviceId);
    if (device) {
      device.address = address;
      device.port = port;
      debug(`Updated address for device ${deviceId}: ${address}:${port}`);
    }
  }
  
  /**
   * Get next check info for a device
   */
  public getNextCheckInfo(deviceId: string): { type: 'poll' | 'heartbeat', timeRemaining: number } | null {
    const device = this.monitoredDevices.get(deviceId);
    if (!device) {
      return null;
    }
    
    const timeRemaining = Math.max(0, device.nextCheckTime - Date.now());
    return {
      type: device.nextCheckType,
      timeRemaining
    };
  }
}