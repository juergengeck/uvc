/**
 * DeviceDiscoveryModel
 * 
 * Manages device discovery and ownership for IoT devices using QUIC transport.
 * This model handles the discovery protocol, device ownership tracking, and
 * credential management for devices on the local network.
 * 
 * Key responsibilities:
 * - Device discovery using UDP broadcasts
 * - Device ownership management
 * - Credential verification and storage
 * - Integration with ESP32ConnectionManager
 * - Journal logging of device events
 */

import createDebug from 'debug';
import { debugLog } from '@src/utils/debugLogger';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import type ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import { QuicModel } from './QuicModel';
import { QuicVCConnectionManager } from './QuicVCConnectionManager';
import type { UdpRemoteInfo } from '@src/platform/react-native/UDPModule';
import { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import { Person } from '@refinio/one.core/lib/recipes.js';
import { getInstanceOwnerIdHash } from '@refinio/one.core/lib/instance.js';
import { NetworkServiceType } from './interfaces';
import type { 
  DiscoveryDevice, 
  DiscoveryMessage, 
  DeviceState,
  CredentialStatus,
  DeviceOwnershipStatus,
  AttestationMessage,
  DeviceCredential,
  VerifiedVCInfo,
  Credential
} from './interfaces';
import { ESP32ConnectionManager } from './esp32/ESP32ConnectionManager';
import { OwnedDeviceMonitor } from './OwnedDeviceMonitor';
import type DeviceSettingsService from '@src/services/DeviceSettingsService';
import { DeviceModel } from '../device/DeviceModel';
import type { VCManager } from './vc/VCManager';
import { deviceOperationsQueue } from '@src/utils/deferredQueue';
import { ModelService } from '@src/services/ModelService';
// UniversalBTLEService imported dynamically to avoid module-load-time errors

const debug = createDebug('lama:device-discovery');

export class DeviceDiscoveryModel {
  private static instance: DeviceDiscoveryModel;
  
  // Core properties
  private _initialized = false;
  private _initializing = false;
  private _quicModel?: QuicModel;
  private _quicVCManager?: QuicVCConnectionManager;
  private _channelManager?: ChannelManager;
  private _personId?: SHA256IdHash<Person>;
  private _esp32ConnectionManager?: ESP32ConnectionManager;
  private _vcManager?: VCManager;
  
  // QUICVC port
  private readonly QUICVC_PORT = 49497;
  
  // BTLE discovery
  private _btleService?: any; // Will be imported dynamically
  private _btleInitialized = false;
  private _btleUpdateDebounce = new Map<string, NodeJS.Timeout>(); // deviceId -> debounce timer
  
  // Device tracking
  private _deviceList = new Map<string, DiscoveryDevice>();
  private _deviceAvailability = new Map<string, number>(); // deviceId -> lastSeen timestamp
  private _pendingCredentials = new Map<string, DeviceCredential>();
  private _pendingAuthentications = new Set<string>(); // Track devices being authenticated to prevent duplicates
  
  // Activity-based heartbeat tracking
  private _deviceLastActivity = new Map<string, number>(); // deviceId -> last activity timestamp
  private _heartbeatTimers = new Map<string, NodeJS.Timeout>(); // deviceId -> heartbeat timer
  private readonly HEARTBEAT_INACTIVITY_THRESHOLD = 30000; // 30 seconds - only send heartbeat after this inactivity
  
  // Discovery state
  private _isDiscovering = false;
  private _discoveryTimer?: NodeJS.Timeout;
  private _availabilityCheckTimer?: NodeJS.Timeout;
  private _forciblyDisabled = false;
  
  // Settings
  private _settingsService?: DeviceSettingsService;
  
  // Identity for attestation
  private _appOwnDeviceId?: string;
  private _appOwnHexPublicKey?: string;
  private _cryptoApi?: any; // Crypto API for signing operations
  
  // Device operations are deferred to avoid blocking UI
  
  // Monitor for owned devices
  private _ownedDeviceMonitor?: OwnedDeviceMonitor;
  
  // Events
  public readonly onInitialized = new OEvent<() => void>();
  public readonly onDiscoveryStarted = new OEvent<() => void>();
  public readonly onDiscoveryStopped = new OEvent<() => void>();
  public readonly onDeviceDiscovered = new OEvent<(device: DiscoveryDevice) => void>();
  public readonly onDeviceUpdated = new OEvent<(device: DiscoveryDevice) => void>();
  public readonly onDeviceLost = new OEvent<(deviceId: string) => void>();
  public readonly onDeviceUnclaimed = new OEvent<(deviceId: string, message: string) => void>();
  public readonly onCredentialVerified = new OEvent<(deviceId: string, credential: Credential) => void>();
  public readonly onCredentialRejected = new OEvent<(deviceId: string, reason: string) => void>();
  public readonly onVCVerified = new OEvent<(verifiedInfo: VerifiedVCInfo) => void>();
  public readonly onVCVerificationFailed = new OEvent<(deviceId: string, reason: string) => void>();
  public readonly onError = new OEvent<(error: Error) => void>();
  
  // Constants
  private readonly DISCOVERY_INTERVAL = 30000; // 30 seconds
  private readonly DISCOVERY_BROADCAST_INTERVAL = 5000; // 5 seconds - for app broadcasts
  private readonly AVAILABILITY_CHECK_INTERVAL = 10000; // 10 seconds
  private readonly DEVICE_TIMEOUT = 60000; // 1 minute

  // Deduplication for device updates
  private readonly updateThrottle = new Map<string, NodeJS.Timeout>();
  private readonly pendingUpdates = new Map<string, DiscoveryDevice>();
  private readonly UPDATE_THROTTLE_MS = 100; // 100ms throttle for device updates

  private constructor() {
    debug('DeviceDiscoveryModel instance created');
  }

  public static getInstance(): DeviceDiscoveryModel {
    if (!DeviceDiscoveryModel.instance) {
      DeviceDiscoveryModel.instance = new DeviceDiscoveryModel();
    }
    return DeviceDiscoveryModel.instance;
  }

  /**
   * Reset the singleton instance - useful for hot reloading
   * This will shut down the existing instance and clear the singleton reference
   */
  public static async resetInstance(): Promise<void> {
    if (DeviceDiscoveryModel.instance) {
      console.log('[DeviceDiscoveryModel] Resetting singleton instance...');
      try {
        if (DeviceDiscoveryModel.instance._isDiscovering) {
          await DeviceDiscoveryModel.instance.stopDiscovery();
        }
        // Clear all timers
        if (DeviceDiscoveryModel.instance._discoveryTimer) {
          clearInterval(DeviceDiscoveryModel.instance._discoveryTimer);
        }
        if (DeviceDiscoveryModel.instance._availabilityCheckTimer) {
          clearInterval(DeviceDiscoveryModel.instance._availabilityCheckTimer);
        }
        // Clear heartbeat timers
        DeviceDiscoveryModel.instance._heartbeatTimers.forEach(timer => clearTimeout(timer));
        DeviceDiscoveryModel.instance._heartbeatTimers.clear();
        
        // Reset initialized flag so init() can run again
        DeviceDiscoveryModel.instance._initialized = false;
        DeviceDiscoveryModel.instance._initializing = false;
      } catch (error) {
        console.error('[DeviceDiscoveryModel] Error during instance reset:', error);
      }
      DeviceDiscoveryModel.instance = null as any;
    }
  }

  public isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Set the ChannelManager for journal functionality
   * Note: Person ID is now obtained directly from the instance in init()
   */
  public async setChannelManager(channelManager: ChannelManager): Promise<void> {
    console.log('[DeviceDiscoveryModel] Setting channel manager for journal functionality');
    this._channelManager = channelManager;

    // Get person ID from instance if not already set (for backwards compatibility)
    if (!this._personId) {
      this._personId = getInstanceOwnerIdHash();
      console.log('[DeviceDiscoveryModel] Retrieved person ID from instance:', this._personId?.toString());
    }

    // Load owned devices
    if (this._personId) {
      console.log('[DeviceDiscoveryModel] Loading owned devices for person:', this._personId.toString());
      await this.loadOwnedDevices();
      console.log('[DeviceDiscoveryModel] Finished loading owned devices');
    }
  }

  /**
   * Set the own device identity for attestation
   */
  public async setOwnIdentity(deviceId: string, hexSecretKey: string, hexPublicKey: string): Promise<void> {
    console.log(`[DeviceDiscoveryModel] Setting own identity: ${deviceId}`);
    this._appOwnDeviceId = deviceId;
    // Ignore hexSecretKey - we'll use crypto API instead
    this._appOwnHexPublicKey = hexPublicKey;

    // QUICVC configuration updated with new identity
    console.log(`[DeviceDiscoveryModel] Updated identity configuration for QUICVC: ${deviceId}`);
  }

  /**
   * Set the crypto API for signing operations
   */
  public setCryptoApi(cryptoApi: any): void {
    console.log('[DeviceDiscoveryModel] Setting crypto API for signing operations');
    this._cryptoApi = cryptoApi;
  }

  /**
   * Set ESP32ConnectionManager reference
   */
  public setESP32ConnectionManager(manager: ESP32ConnectionManager): void {
    console.log('[DeviceDiscoveryModel] Setting ESP32ConnectionManager reference');
    this._esp32ConnectionManager = manager;
    
    // Set up the relationship after transport initialization
    if (this._transport) {
      console.log('[DeviceDiscoveryModel] Setting up ESP32 HEARTBEAT service handler');
      this._transport.addService(NetworkServiceType.HEARTBEAT_SERVICE, this.handleHeartbeatMessage.bind(this));
    }
  }

  /**
   * Set forcibly disabled state
   */
  public setForciblyDisabled(disabled: boolean): void {
    console.log(`[DeviceDiscoveryModel] Setting forcibly disabled to ${disabled}`);
    this._forciblyDisabled = disabled;
  }
  
  /**
   * Check if discovery is currently running
   */
  public isDiscovering(): boolean {
    return this._isDiscovering;
  }

  public async isBTLEAvailable(): Promise<boolean> {
    if (!this._btleService || !this._btleInitialized) {
      return false;
    }
    try {
      return await this._btleService.isBTLEAvailable();
    } catch {
      return false;
    }
  }

  public setQuicModel(quicModel: QuicModel): void {
    this._quicModel = quicModel;
    this._transport = this._quicModel.getTransport();
    debug('QuicModel set, transport obtained.');
  }

  public setSettingsService(settingsService: DeviceSettingsService): void {
    console.log('[DeviceDiscoveryModel] Setting up settings service listener');
    this._settingsService = settingsService;
    
    // Load saved devices into ESP32ConnectionManager
    this.loadSavedDevices().catch(error => {
      console.error('[DeviceDiscoveryModel] Error loading saved devices:', error);
    });
    
    settingsService.onSettingsChanged.listen(() => {
      const settings = settingsService.getSettings();
      if (settings) {
        console.log(`[DeviceDiscoveryModel] Settings changed: discoveryEnabled=${settings.discoveryEnabled}`);
        this.handleExternalSettingsChange(settings.discoveryEnabled);
        
        // Reload saved devices when settings change
        this.loadSavedDevices().catch(error => {
          console.error('[DeviceDiscoveryModel] Error reloading saved devices:', error);
        });
      }
    });
    const currentSettings = settingsService.getSettings();
    this._forciblyDisabled = !(currentSettings?.discoveryEnabled === true);
    console.log(`[DeviceDiscoveryModel] Initialized with discovery settings: enabled=${!this._forciblyDisabled}`);
    debug(`Initialized with discovery settings: enabled=${!this._forciblyDisabled}`);
  }
  
  /**
   * Load saved devices into ESP32ConnectionManager
   * This ensures saved devices can be controlled even when discovery is off
   */
  private async loadSavedDevices(): Promise<void> {
    if (!this._esp32ConnectionManager) {
      console.log('[DeviceDiscoveryModel] Cannot load saved devices - ESP32ConnectionManager not ready');
      return;
    }
    
    try {
      // Get devices from DeviceModel
      const deviceModel = DeviceModel.getInstance();
      if (!deviceModel.isInitialized()) {
        console.log('[DeviceDiscoveryModel] DeviceModel not initialized, cannot load saved devices');
        return;
      }
      
      const devices = await deviceModel.getDevices();
      console.log(`[DeviceDiscoveryModel] Loading ${devices.length} saved devices into ESP32ConnectionManager`);
      
      for (const device of devices) {
        if (device.deviceType === 'ESP32' && device.address) {
          console.log(`[DeviceDiscoveryModel] Adding saved ESP32 device ${device.deviceId} at ${device.address}:${device.port}, owner: ${device.owner || 'none'}`);
          
          // Convert owner SHA256IdHash to string if it exists
          const ownerPersonId = device.owner ? device.owner.toString() : undefined;
          
          this._esp32ConnectionManager.addDiscoveredDevice(
            device.deviceId,
            device.address,
            device.port,
            device.name || device.deviceId
            // Don't pass stale ownership - let device prove it with credentials
          );
          
          // Saved devices are loaded but not automatically authenticated
          // User must manually claim ownership via the UI toggle
          if (device.owner === this._personId) {
            console.log(`[DeviceDiscoveryModel] Saved device ${device.deviceId} is owned by current user but requires manual authentication`);
          }
        }
      }
    } catch (error) {
      console.error('[DeviceDiscoveryModel] Error loading saved devices:', error);
    }
  }
  
  private handleExternalSettingsChange(discoveryEnabled: boolean): void {
    debug(`Handling external settings change: discoveryEnabled = ${discoveryEnabled}`);
    console.log(`[DeviceDiscoveryModel] Handling external settings change: discoveryEnabled = ${discoveryEnabled}`);
    
    // IMPORTANT: Since PropertyTree is disabled, settings always return defaults
    // We should not stop discovery based on default values when other settings change
    // Only stop discovery if it was explicitly disabled by the user
    
    // If discovery is currently running and settings say it should be disabled,
    // check if this is an actual user action or just a side effect of settings reload
    if (this._isDiscovering && !discoveryEnabled) {
      console.log('[DeviceDiscoveryModel] WARNING: Settings show discoveryEnabled=false while discovery is running');
      console.log('[DeviceDiscoveryModel] This may be due to PropertyTree being disabled - ignoring this change');
      // Don't stop discovery unless explicitly requested by user through toggle
      return;
    }
    
    this._forciblyDisabled = !discoveryEnabled;
    
    if (discoveryEnabled && !this._isDiscovering) {
      console.log('[DeviceDiscoveryModel] Discovery enabled via settings, but not starting automatically');
      // Discovery needs to be started explicitly via UI
    } else if (!discoveryEnabled && this._isDiscovering) {
      console.log('[DeviceDiscoveryModel] Discovery disabled via settings, stopping discovery');
      this.stopDiscovery();
    }
  }

  /**
   * Initialize the DeviceDiscoveryModel
   */
  public async init(): Promise<boolean> {
    // Allow reinitialization if QuicModel is not ready (e.g. after hot reload)
    if (this._initialized) {
      // Check if QuicModel is still initialized
      if (this._quicModel && this._quicModel.isInitialized() && this._transport) {
        console.log('[DeviceDiscoveryModel] Already initialized and QuicModel is ready');
        return true;
      }
      console.log('[DeviceDiscoveryModel] Was marked as initialized but QuicModel is not ready, reinitializing...');
      this._initialized = false;
    }
    
    if (this._initializing) {
      console.log('[DeviceDiscoveryModel] Already initializing, skipping duplicate init');
      return false;
    }
    this._initializing = true;
    debug('Initializing DeviceDiscoveryModel...');
    console.log('[DeviceDiscoveryModel] Initializing...');

    try {
      // First get or initialize the QuicModel for transport
      if (!this._transport) {
        if (!this._quicModel) {
          console.log('[DeviceDiscoveryModel] Getting QuicModel instance');
          this._quicModel = QuicModel.getInstance(); 
        }
        
        // Check if QuicModel is already initialized before attempting to initialize it
        if (!this._quicModel.isInitialized()) {
          console.log('[DeviceDiscoveryModel] Initializing QuicModel');
          const quicInitialized = await this._quicModel.init();
          if (!quicInitialized) {
            console.error('[DeviceDiscoveryModel] Failed to initialize QuicModel');
            throw new Error('Failed to initialize QuicModel');
          }
          console.log('[DeviceDiscoveryModel] QuicModel initialized successfully');
        } else {
          console.log('[DeviceDiscoveryModel] QuicModel is already initialized');
        }
        
        this._transport = this._quicModel.getTransport();
        if (!this._transport) {
          this._initializing = false;
          const err = new Error('Failed to obtain QUIC transport for DeviceDiscoveryModel');
          this.onError.emit(err);
          console.error('[DeviceDiscoveryModel]', err.message);
          return false;
        }
        console.log('[DeviceDiscoveryModel] Got transport from QuicModel:', 
                   this._transport.isInitialized() ? 'initialized' : 'not initialized');
      }

      // Validate identity data
      if (!this._appOwnDeviceId || !this._appOwnHexPublicKey) {
        debug('[DeviceDiscoveryModel] Own identity not fully set yet. Will be configured later via setOwnIdentity().');
      }

      // Initialize QUICVC Connection Manager
      // Get person ID directly from the instance if not already set
      if (!this._personId) {
        this._personId = getInstanceOwnerIdHash();
      }

      if (this._personId) {
        try {
          console.log('[DeviceDiscoveryModel] Initializing QUICVC Connection Manager with personId:', this._personId.toString());

          this._quicVCManager = QuicVCConnectionManager.getInstance(this._personId);

          // Initialize with VCManager when available
          if (this._vcManager) {
            await this._quicVCManager.initialize(this._vcManager);
            console.log('[DeviceDiscoveryModel] QUICVC Connection Manager initialized');

            // Set up QUICVC discovery listener on port 49498
            this.setupQuicVCDiscovery();
          } else {
            console.log('[DeviceDiscoveryModel] VCManager not available, QUICVC partially initialized');
          }
        } catch (quicvcError) {
          console.error('[DeviceDiscoveryModel] Failed to initialize QUICVC:', quicvcError);
          // Continue without QUICVC - graceful degradation
        }
      } else {
        console.log('[DeviceDiscoveryModel] Instance not yet initialized, cannot get person ID for QUICVC');
      }

      // Set up event handlers
      this.setupEventHandlers();
      
      // Note: VCManager and ESP32ConnectionManager will be initialized lazily when needed
      // This avoids timing issues with LeuteModel availability
      
      // Set up ESP32 service handlers after transport is ready
      if (this._esp32ConnectionManager) {
        console.log('[DeviceDiscoveryModel] Setting up ESP32 HEARTBEAT service handler (post-init)');
        this._transport.addService(NetworkServiceType.HEARTBEAT_SERVICE, this.handleHeartbeatMessage.bind(this));
      }
      
      // VCManager service handler will be set up by setVCManager
      
      // Initialize owned device monitor
      if (this._channelManager && this._personId) {
        console.log('[DeviceDiscoveryModel] Initializing OwnedDeviceMonitor');
        // OwnedDeviceMonitor expects DeviceDiscoveryModel (this), personId, and optional config
        this._ownedDeviceMonitor = new OwnedDeviceMonitor(
          this, // Pass this DeviceDiscoveryModel instance
          this._personId,
          {
            pollingInterval: 10000,
            heartbeatInterval: 10000,
            verifyCredentials: true
          }
        );
        
        // OwnedDeviceMonitor doesn't have init(), it has start()
        // We'll start it when discovery is started, not during init
        console.log('[DeviceDiscoveryModel] OwnedDeviceMonitor created (will start when discovery starts)');
        
        // Listen for owned device updates
        if (this._ownedDeviceMonitor.onDeviceStatusUpdate) {
          this._ownedDeviceMonitor.onDeviceStatusUpdate.listen((device, checkType) => {
            console.log(`[DeviceDiscoveryModel] Owned device ${device.deviceId} status updated via ${checkType}`);
            // Update device availability based on status
            if (device.isReachable) {
              this._deviceAvailability.set(device.deviceId, Date.now());
            } else {
              this._deviceAvailability.delete(device.deviceId);
            }
          });
        }
        
        if (this._ownedDeviceMonitor.onDeviceUnreachable) {
          this._ownedDeviceMonitor.onDeviceUnreachable.listen((deviceId) => {
            console.log(`[DeviceDiscoveryModel] Owned device ${deviceId} became unreachable`);
            this._deviceAvailability.delete(deviceId);
          });
        }
        
        if (this._ownedDeviceMonitor.onDeviceReconnected) {
          this._ownedDeviceMonitor.onDeviceReconnected.listen((device) => {
            console.log(`[DeviceDiscoveryModel] Owned device ${device.deviceId} reconnected`);
            this._deviceAvailability.set(device.deviceId, Date.now());
          });
        }
      }

      // Don't load devices here - they're loaded in setChannelManager when personId is available

      this._initialized = true;
      this._initializing = false;
      this.onInitialized.emit();
      debug('DeviceDiscoveryModel initialized successfully');
      console.log('[DeviceDiscoveryModel] Initialized successfully');
      
      // Check if discovery should be automatically started based on settings
      const currentSettings = this._settingsService?.getSettings();
      if (currentSettings?.discoveryEnabled === true) {
        console.log('[DeviceDiscoveryModel] Discovery is enabled in settings but not starting automatically');
        // Don't auto-start discovery - let UI control it
      }
      
      return true;
    } catch (error) {
      this._initializing = false;
      this.onError.emit(error instanceof Error ? error : new Error(String(error)));
      debug('Failed to initialize DeviceDiscoveryModel:', error);
      console.error('[DeviceDiscoveryModel] Failed to initialize:', error);
      return false;
    }
  }

  /**
   * Set up QUICVC discovery listener
   */
  private _quicVCListenerSetup = false;
  
  private setupQuicVCDiscovery(): void {
    if (!this._quicModel) {
      console.error('[DeviceDiscoveryModel] Cannot setup QUICVC discovery without QuicModel');
      return;
    }

    // Prevent duplicate listeners
    if (this._quicVCListenerSetup) {
      console.log('[DeviceDiscoveryModel] QUICVC discovery listener already set up, skipping');
      return;
    }

    console.log('[DeviceDiscoveryModel] Setting up QUICVC discovery listener');
    
    // QuicModel is already listening on port 49497
    // Listen for QUICVC discovery events from QuicModel's OEvent
    this._quicModel.onQuicVCDiscovery.listen((data: Buffer, rinfo: any) => {
      // console.log(`[DeviceDiscoveryModel] Received QUICVC discovery event from ${rinfo.address}:${rinfo.port}`);
      this.handleQuicVCPacket(data as any as Uint8Array, rinfo);
    });
    
    this._quicVCListenerSetup = true;
    console.log('[DeviceDiscoveryModel] Listening for QUICVC discovery events from QuicModel');
  }

  /**
   * Handle incoming QUICVC packet
   */
  private handleQuicVCPacket(data: Uint8Array, rinfo: UdpRemoteInfo): void {
    if (data.length < 2) return;

    // Check if this is a long header packet (bit 7 = 1)
    const isLongHeader = (data[0] & 0x80) !== 0;
    if (!isLongHeader) {
      // console.log('[DeviceDiscoveryModel] Short header packet - not supported for discovery');
      return;
    }

    // For long header packets, packet type is in bits 0-1 (QUIC spec)
    const packetType = data[0] & 0x03;
    
    // QUICVC packet types
    const INITIAL = 0x00;
    const HANDSHAKE = 0x01;
    const PROTECTED = 0x02;
    const RETRY = 0x03;
    
    // console.log('[DeviceDiscoveryModel] Received QUICVC packet type', packetType, 'from', rinfo.address);
    
    // First, always forward to QuicVCConnectionManager for handshake processing
    if (this._quicVCManager) {
      // console.log(`[DeviceDiscoveryModel] Forwarding packet to QuicVCConnectionManager`);
      try {
        this._quicVCManager.handleQuicVCPacket(data, rinfo);
      } catch (error) {
        console.error('[DeviceDiscoveryModel] Error forwarding packet to QuicVCConnectionManager:', error);
      }
    } else {
      console.warn('[DeviceDiscoveryModel] QuicVCConnectionManager not available');
    }
    
    // Then check if it's also discovery data (ESP32 embeds discovery in some packets)
    if (packetType === INITIAL) {
      // Try to extract ESP32 discovery data from INITIAL packet
      // ESP32 sends discovery as INITIAL packets with DISCOVERY frame (0x01)
      const isEsp32Discovery = this.tryParseEsp32Discovery(data, rinfo);
      if (isEsp32Discovery) {
        // console.log('[DeviceDiscoveryModel] Extracted ESP32 discovery data from INITIAL packet');
      }
    }
  }

  /**
   * Try to parse ESP32 discovery data from QUIC INITIAL packet
   */
  private tryParseEsp32Discovery(data: Uint8Array, rinfo: UdpRemoteInfo): boolean {
    try {
      // Parse QUIC header to get payload
      // ESP32 format: type(1) + version(4) + dcid_len(1) + dcid + scid_len(1) + scid + packet_number(1)
      let offset = 0;

      // Skip type byte
      offset += 1;

      // Skip version (4 bytes)
      offset += 4;

      // Get DCID length and skip DCID
      const dcidLen = data[offset++];
      offset += dcidLen;

      // Get SCID length and skip SCID
      const scidLen = data[offset++];
      offset += scidLen;

      // ESP32 uses 1-byte packet number (not 8 bytes)
      offset += 1;

      if (offset >= data.length) {
        return false;
      }

      const payload = data.slice(offset);

      // ESP32 discovery format: frame_type(1) + frame_length(2) + JSON
      if (payload.length > 3 && payload[0] === 0x01) { // Frame type 0x01 = DISCOVERY
        const frameLength = (payload[1] << 8) | payload[2];
        const jsonStart = 3;

        if (payload.length >= jsonStart + frameLength) {
          const jsonBytes = payload.slice(jsonStart, jsonStart + frameLength);
          const jsonString = new TextDecoder().decode(jsonBytes);
          const discoveryData = JSON.parse(jsonString);

          // console.log('[DeviceDiscoveryModel] Parsed ESP32 discovery data:', discoveryData);

          // Map ESP32 discovery format to our internal format
          const mappedData = {
            device_id: discoveryData.device_id,  // ESP32 sends device_id not deviceId
            device_type: discoveryData.device_type === 'ESP32' ? 'ESP32' : 'Unknown',
            ownership: discoveryData.ownership,
            capabilities: discoveryData.capabilities,
            status: discoveryData.status,
            protocol: discoveryData.protocol,
            timestamp: discoveryData.timestamp
          };

          this.handleEsp32Discovery(mappedData, rinfo);
          return true;
        }
      }

      return false;
    } catch (error) {
      // Not ESP32 discovery format
      return false;
    }
  }

  /**
   * Handle ESP32 discovery data
   */
  private handleEsp32Discovery(discoveryData: any, rinfo: UdpRemoteInfo): void {
    try {
      const deviceId = discoveryData.device_id;
      const address = rinfo.address;
      const port = rinfo.port;

      // console.log(`[DeviceDiscoveryModel] Processing ESP32 discovery from ${deviceId} at ${address}:${port}`);

      // Create or update device entry
      const device = {
        deviceId,
        address,
        port,
        deviceType: discoveryData.device_type,
        ownership: discoveryData.ownership,
        status: discoveryData.status,
        protocol: discoveryData.protocol,
        capabilities: discoveryData.capabilities,
        lastSeen: Date.now(),
        transport: 'quicvc' as const,
        hasValidCredential: discoveryData.ownership === 'claimed',
        ownerId: discoveryData.ownership === 'claimed' ? this._personId : undefined,
      };

      // Add to device list
      this._deviceList.set(deviceId, device);
      // console.log(`[DeviceDiscoveryModel] Added ESP32 device ${deviceId} to device list`);

      // Emit discovery event
      this.onDeviceDiscovered.emit(device);
      // console.log(`[DeviceDiscoveryModel] Emitted device discovered event for ${deviceId}`);

      // If device is owned by us, mark it as authenticated immediately for ESP32ConnectionManager
      if (discoveryData.ownership === 'claimed' && discoveryData.owner === this._personId && this._esp32ConnectionManager) {
        console.log(`[DeviceDiscoveryModel] Device ${deviceId} is owned by us, marking as authenticated`);
        
        // First, ensure the device is added to ESP32ConnectionManager
        this._esp32ConnectionManager.addDiscoveredDevice(deviceId, address, port, deviceId, this._personId);
        
        // Get the device and mark it as authenticated since we own it
        const esp32Device = this._esp32ConnectionManager.getDevice(deviceId);
        if (esp32Device) {
          esp32Device.isAuthenticated = true;
          esp32Device.ownerPersonId = this._personId;
          console.log(`[DeviceDiscoveryModel] Marked ${deviceId} as authenticated for immediate LED control`);
        }
        
        // Also initiate proper authentication in background for full handshake
        this._esp32ConnectionManager.authenticateDevice(deviceId, address, port).then(success => {
          if (success) {
            console.log(`[DeviceDiscoveryModel] Full authentication completed for ${deviceId}`);
          } else {
            console.warn(`[DeviceDiscoveryModel] Full authentication failed for ${deviceId}`);
          }
        }).catch(error => {
          console.error(`[DeviceDiscoveryModel] Error during full authentication of ${deviceId}:`, error);
        });
      }

    } catch (error) {
      console.error('[DeviceDiscoveryModel] Error handling ESP32 discovery:', error);
    }
  }

  /**
   * Handle QUICVC discovery broadcast
   */
  private handleQuicVCDiscovery(data: Uint8Array, rinfo: UdpRemoteInfo): void {
    try {
      // Parse simplified QUICVC discovery packet
      // Format: [packet_type(1)] [frame_type(1)] [frame_length(2)] [json_payload]
      
      let offset = 0;
      
      // Skip packet type (already checked)
      offset++;
      
      // Skip frame type (already checked) 
      offset++;
      
      // Frame length (2 bytes, big-endian)
      const frameLength = (data[offset] << 8) | data[offset + 1];
      offset += 2;
      
      // Extract JSON payload
      const jsonPayload = data.slice(offset, offset + frameLength);
      const jsonStr = new TextDecoder().decode(jsonPayload);
      // console.log('[DeviceDiscoveryModel] Discovery JSON:', jsonStr);
      
      // Parse JSON discovery data
      const discoveryData = JSON.parse(jsonStr);
      
      // Extract device information from JSON
      const deviceId = discoveryData.device_id || '';
      const deviceType = discoveryData.device_type || 'ESP32';
      const ownership = discoveryData.ownership || 'unclaimed';
      const capabilities = discoveryData.capabilities || [];
      
      // console.log('[DeviceDiscoveryModel] Discovered device via QUICVC:', {
      //   deviceId,
      //   deviceType,
      //   ownership,
      //   address: rinfo.address,
      //   port: rinfo.port,
      //   capabilities
      // });
      
      // Create or update device record
      const device: DiscoveryDevice = {
        deviceId,
        name: `ESP32-${deviceId.substring(0, 8)}`,
        deviceType: 'ESP32',
        address: rinfo.address,
        port: rinfo.port,
        online: true,
        lastSeen: Date.now(),
        ownerId: ownership === 'claimed' ? 'claimed' : undefined,
        hasValidCredential: ownership === 'claimed'
      };
      
      // Check if device already exists
      const existing = this._deviceList.get(deviceId);
      if (existing) {
        // Update existing device
        debugLog.info('DeviceDiscoveryModel', 'Device already exists in list, updating:', deviceId);
        Object.assign(existing, device);
        this.emitDeviceUpdate(deviceId, existing);
      } else {
        // New device discovered
        // console.log('[DeviceDiscoveryModel] New device, adding to list:', deviceId);
        this._deviceList.set(deviceId, device);
        this.onDeviceDiscovered.emit(device);
        // console.log('[DeviceDiscoveryModel] Emitted onDeviceDiscovered for:', deviceId);
        // console.log('[DeviceDiscoveryModel] Added device to list, total devices:', this._deviceList.size);
      }
      
      // Track device availability
      this._deviceAvailability.set(deviceId, Date.now());
      
    } catch (error) {
      console.error('[DeviceDiscoveryModel] Error parsing QUICVC discovery:', error);
    }
  }

  /**
   * Set up event handlers for QUICVC events
   */
  private setupEventHandlers(): void {
    // Set up QUICVC connection events if manager is available
    if (this._quicVCManager) {
      this._quicVCManager.onConnectionEstablished.listen((deviceId, vcInfo) => {
        debugLog.info('DeviceDiscoveryModel', 'QUICVC connection established with', deviceId);
        const device = this._deviceList.get(deviceId);
        if (device) {
          device.hasValidCredential = true;
          device.ownerId = vcInfo.issuerPersonId;
          this.emitDeviceUpdate(deviceId, device);
        }
      });

      this._quicVCManager.onConnectionClosed.listen((deviceId, reason) => {
        console.log('[DeviceDiscoveryModel] QUICVC connection closed with', deviceId, 'reason:', reason);
      });

      this._quicVCManager.onError.listen((deviceId, error) => {
        console.error('[DeviceDiscoveryModel] QUICVC error for', deviceId, ':', error);
      });

      // Listen for device discovery events
      this._quicVCManager.onDeviceDiscovered.listen((event) => {
        // console.log('[DeviceDiscoveryModel] Device discovered via QUICVC:', event);
        if (event.deviceInfo) {
          // Merge event address/port into deviceInfo for handler
          const deviceInfoWithNetwork = {
            ...event.deviceInfo,
            address: event.address,
            port: event.port
          };
          this.handleDiscoveredDevice(deviceInfoWithNetwork);
        }
      });
    }

    // Using QUICVC discovery only - no legacy protocols
    console.log('[DeviceDiscoveryModel] Using QUICVC discovery protocol exclusively');

    // Event handling is now managed through QUICVC connection manager
    // QUICVC events come through the handleQuicVCDiscoveryMessage method
    console.log('[DeviceDiscoveryModel] Event handling configured for QUICVC protocol');
  }

  /**
   * Handle discovered device from QUICVC
   */
  private handleDiscoveredDevice(deviceInfo: any): void {
    const deviceId = deviceInfo.deviceId;
    if (!deviceId) {
      console.warn('[DeviceDiscoveryModel] Discovered device missing deviceId');
      return;
    }

    // Check if device already exists
    const existing = this._deviceList.get(deviceId);
    
    const device: DiscoveryDevice = {
      deviceId,
      name: deviceInfo.deviceType || 'ESP32 Device',
      deviceType: deviceInfo.deviceType || 'ESP32',
      address: deviceInfo.address,
      port: deviceInfo.port,
      status: deviceInfo.status || 'online',
      protocol: deviceInfo.protocol || 'quicvc/1.0',
      capabilities: deviceInfo.capabilities || [],
      lastSeen: deviceInfo.lastSeen || Date.now(),
      transport: 'quicvc' as const,
      hasValidCredential: deviceInfo.ownership === 'claimed',
      ownerId: deviceInfo.ownership === 'claimed' ? this._personId : undefined,
      online: true,
      connected: false,
      isAuthenticated: false
    };

    if (existing) {
      // Update existing device
      // console.log('[DeviceDiscoveryModel] Updating existing device:', deviceId);
      Object.assign(existing, device);
      this.emitDeviceUpdate(deviceId, existing);
    } else {
      // New device discovered
      // console.log('[DeviceDiscoveryModel] New device discovered:', deviceId);
      this._deviceList.set(deviceId, device);
      this.onDeviceDiscovered.emit(device);
    }

    // Update availability tracking
    this._deviceAvailability.set(deviceId, Date.now());
  }

  /**
   * Start device discovery
   */
  public async startDiscovery(): Promise<void> {
    if (this._forciblyDisabled) {
      console.log('[DeviceDiscoveryModel] Discovery is disabled in settings, cannot start');
      return;
    }
    
    if (this._isDiscovering) {
      debug('Discovery already in progress');
      console.log('[DeviceDiscoveryModel] Discovery already in progress');
      return;
    }
    
    console.log('[DeviceDiscoveryModel] Starting device discovery...');

    if (!this._initialized) {
      console.error('[DeviceDiscoveryModel] Cannot start discovery - not initialized');
      throw new Error('DeviceDiscoveryModel not initialized');
    }

    debug('Starting device discovery...');
    console.log('[DeviceDiscoveryModel] Starting device discovery...');
    
    // VCManager should already be initialized during app startup
    
    this._isDiscovering = true;

    try {
      // Ensure QuicModel is initialized before setting up discovery
      if (!this._quicModel) {
        console.log('[DeviceDiscoveryModel] Getting QuicModel instance for discovery');
        this._quicModel = QuicModel.getInstance();
      }
      
      console.log('[DeviceDiscoveryModel] QuicModel initialized status:', this._quicModel.isInitialized());
      
      if (!this._quicModel.isInitialized()) {
        console.log('[DeviceDiscoveryModel] QuicModel not initialized, initializing now with port 49497...');
        const initialized = await this._quicModel.init({ port: 49497, host: '0.0.0.0' });
        if (!initialized) {
          console.error('[DeviceDiscoveryModel] Failed to initialize QuicModel');
          throw new Error('Failed to initialize QuicModel for discovery');
        }
        console.log('[DeviceDiscoveryModel] QuicModel initialized successfully');
        
        // Get transport after initialization
        this._transport = this._quicModel.getTransport();
      } else {
        console.log('[DeviceDiscoveryModel] QuicModel already initialized, but may not have socket bound');
        this._transport = this._quicModel.getTransport();
        
        // Check if transport actually has a socket
        const transport = this._transport as any;
        console.log('[DeviceDiscoveryModel] Transport check:', { 
          transportType: transport.constructor?.name,
          hasPrivateSocket: transport.socket !== undefined,
          socketValue: transport.socket,
          isInitialized: transport.isInitialized?.(),
          hasInit: typeof transport.init === 'function',
          hasListen: typeof transport.listen === 'function'
        });
        
        // Check if socket exists and what port it's bound to
        if (transport.socket) {
          console.log('[DeviceDiscoveryModel] Socket exists, checking port binding...');
          
          // Try to get the actual bound address
          try {
            const boundAddress = transport.socket.address?.();
            if (boundAddress) {
              console.log(`[DeviceDiscoveryModel] Socket is bound to ${boundAddress.address}:${boundAddress.port}`);
              if (boundAddress.port !== 49497) {
                console.error(`[DeviceDiscoveryModel] ❌ Socket is bound to wrong port (${boundAddress.port} instead of 49497)`);
                console.error('[DeviceDiscoveryModel] ❌ Discovery will NOT work - devices broadcast to port 49497');
                console.error('[DeviceDiscoveryModel] ⚠️  App needs to be restarted to fix port binding');
              } else {
                console.log('[DeviceDiscoveryModel] ✅ Socket correctly bound to discovery port 49497');
              }
            } else {
              // Can't determine port - this might be OK if socket is initialized but address() not available
              console.log('[DeviceDiscoveryModel] Socket exists but cannot determine bound port (may be OK)');
            }
          } catch (error) {
            console.log('[DeviceDiscoveryModel] Could not check socket address:', error);
          }
        } else {
          console.log('[DeviceDiscoveryModel] No socket found - transport not properly initialized');
        }
      }
      
      // Set up QUICVC discovery listener if not already done
      if (this._quicModel) {
        console.log('[DeviceDiscoveryModel] Setting up QUICVC discovery listener');
        this.setupQuicVCDiscovery();
      }
      
      // QUICVC discovery is handled by QuicVCConnectionManager listening on port 49497
      console.log('[DeviceDiscoveryModel] Using QUICVC discovery on port 49497');

      // Start BTLE discovery for IoT devices and app-to-app discovery
      await this.initializeBTLEService();
      if (this._btleService && this._btleInitialized) {
        try {
          // Start scanning for other devices
          await this._btleService.startDiscovery();
          console.log('[DeviceDiscoveryModel] BTLE discovery started successfully');
          
          // Start advertising this app for peer discovery
          // TODO: Add advertising support to UniversalBTLEService
          // if (this._appOwnDeviceId && this._appOwnHexPublicKey) {
          //   const appIdentity = {
          //     deviceId: this._appOwnDeviceId,
          //     deviceName: 'LAMA.ONE',
          //     publicKey: this._appOwnHexPublicKey,
          //     capabilities: ['discovery', 'quic-vc', 'chat', 'file-sharing']
          //   };
          //   
          //   await this._btleService.startAdvertising(appIdentity);
          //   console.log('[DeviceDiscoveryModel] BTLE advertising started for app-to-app discovery');
          // } else {
          //   console.warn('[DeviceDiscoveryModel] App identity not available, skipping BTLE advertising');
          // }
        } catch (error) {
          console.error('[DeviceDiscoveryModel] Failed to start BTLE discovery/advertising:', error);
          // Don't fail the entire discovery process if BTLE fails
        }
      }

      // Start app discovery broadcasting
      console.log('[DeviceDiscoveryModel] Starting app discovery broadcasting on port 49497');
      await this.startAppDiscoveryBroadcast();
      
      // Send initial broadcast immediately
      console.log('[DeviceDiscoveryModel] Sending initial app discovery broadcast');
      await this.sendAppDiscoveryBroadcast();

      // Set up availability checking
      this._availabilityCheckTimer = setInterval(() => {
        this.checkDeviceAvailability();
      }, this.AVAILABILITY_CHECK_INTERVAL);
      
      // Start owned device monitor if available
      if (this._ownedDeviceMonitor) {
        try {
          await this._ownedDeviceMonitor.start();
          console.log('[DeviceDiscoveryModel] OwnedDeviceMonitor started');
        } catch (error) {
          console.error('[DeviceDiscoveryModel] Failed to start OwnedDeviceMonitor:', error);
          // Continue anyway - discovery can work without monitor
        }
      }

      this.onDiscoveryStarted.emit();
      debug('Device discovery started');
      console.log('[DeviceDiscoveryModel] Device discovery started with active broadcasting');
    } catch (error) {
      this._isDiscovering = false;
      this.onError.emit(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Stop device discovery
   */
  public async stopDiscovery(): Promise<void> {
    if (!this._isDiscovering) {
      debug('Discovery not in progress');
      console.log('[DeviceDiscoveryModel] Discovery not in progress');
      return;
    }

    debug('Stopping device discovery...');
    console.log('[DeviceDiscoveryModel] Stopping device discovery...');
    
    // Clear timers
    if (this._discoveryTimer) {
      clearInterval(this._discoveryTimer);
      this._discoveryTimer = undefined;
    }

    if (this._availabilityCheckTimer) {
      clearInterval(this._availabilityCheckTimer);
      this._availabilityCheckTimer = undefined;
    }

    // QUICVC discovery uses passive listening - no broadcasting to stop
    console.log('[DeviceDiscoveryModel] Stopped QUICVC discovery listening');

    // Stop BTLE discovery and advertising
    if (this._btleService && this._btleInitialized) {
      try {
        await this._btleService.stopDiscovery();
        console.log('[DeviceDiscoveryModel] BTLE discovery stopped');
        
        // Stop advertising if it's active
        // TODO: Add advertising support to UniversalBTLEService
        // if (this._btleService.isAdvertising()) {
        //   await this._btleService.stopAdvertising();
        //   console.log('[DeviceDiscoveryModel] BTLE advertising stopped');
        // }
      } catch (error) {
        console.error('[DeviceDiscoveryModel] Error stopping BTLE discovery/advertising:', error);
      }
    }
    
    // Stop owned device monitor if running
    if (this._ownedDeviceMonitor) {
      try {
        await this._ownedDeviceMonitor.stop();
        console.log('[DeviceDiscoveryModel] OwnedDeviceMonitor stopped');
      } catch (error) {
        console.error('[DeviceDiscoveryModel] Error stopping OwnedDeviceMonitor:', error);
      }
    }

    this._isDiscovering = false;
    this.onDiscoveryStopped.emit();
    debug('Device discovery stopped');
    console.log('[DeviceDiscoveryModel] Device discovery stopped');
  }

  /**
   * Get all discovered devices
   */
  public getDevices(): DiscoveryDevice[] {
    // Return devices from our internal device list
    return Array.from(this._deviceList.values());
  }

  /**
   * Start app discovery broadcasting
   */
  private async startAppDiscoveryBroadcast(): Promise<void> {
    // Get broadcast interval from settings or use default
    const settings = this._settingsService?.getSettings();
    const broadcastInterval = settings?.discoveryBroadcastInterval || this.DISCOVERY_BROADCAST_INTERVAL;
    
    console.log(`[DeviceDiscoveryModel] Starting app discovery broadcast with interval: ${broadcastInterval}ms`);
    
    // Send discovery broadcasts periodically
    this._discoveryTimer = setInterval(async () => {
      try {
        await this.sendAppDiscoveryBroadcast();
      } catch (error) {
        console.error('[DeviceDiscoveryModel] Error sending app discovery broadcast:', error);
      }
    }, broadcastInterval);
  }

  /**
   * Send app discovery broadcast packet
   */
  private async sendAppDiscoveryBroadcast(): Promise<void> {
    if (!this._transport || !this._quicModel) {
      console.log('[DeviceDiscoveryModel] Cannot send discovery - transport not ready');
      return;
    }

    try {
      // Create app discovery message
      const discoveryMessage = {
        type: 'app_discovery',
        deviceId: this._appOwnDeviceId || 'lama-app-' + Math.random().toString(36).substr(2, 9),
        deviceType: 'MobileApp',
        deviceName: 'LAMA.ONE',
        capabilities: ['discovery', 'quic-vc', 'chat', 'file-sharing'],
        timestamp: Date.now()
      };

      // Send as QUICVC discovery packet
      if (this._quicVCManager) {
        await this._quicVCManager.sendDiscoveryBroadcast({
          deviceId: discoveryMessage.deviceId,
          deviceType: 0x02, // MobileApp type
          capabilities: discoveryMessage.capabilities,
          ownerId: this._personId?.toString()
        });
        console.log('[DeviceDiscoveryModel] Sent QUICVC app discovery broadcast');
      } else {
        // Fallback to regular UDP broadcast
        const packet = Buffer.from(JSON.stringify(discoveryMessage));
        const udpPacket = Buffer.concat([Buffer.from([0x01]), packet]); // Type 1 for discovery
        
        // Broadcast to all interfaces
        await this._transport.send(udpPacket, '255.255.255.255', 49497);
        console.log('[DeviceDiscoveryModel] Sent UDP app discovery broadcast');
      }
    } catch (error) {
      console.error('[DeviceDiscoveryModel] Failed to send app discovery broadcast:', error);
    }
  }

  /**
   * Get ESP32 connection manager - lazy initialization
   */
  public async getESP32ConnectionManager(): Promise<ESP32ConnectionManager | undefined> {
    // If already initialized, return it
    if (this._esp32ConnectionManager) {
      return this._esp32ConnectionManager;
    }
    
    // Check prerequisites
    if (!this._transport || !this._personId) {
      console.log('[DeviceDiscoveryModel] Cannot initialize ESP32ConnectionManager - transport or personId not ready');
      return undefined;
    }
    
    try {
      // First ensure VCManager is initialized
      await this.ensureVCManagerInitialized();
      
      if (!this._vcManager) {
        console.error('[DeviceDiscoveryModel] Cannot initialize ESP32ConnectionManager without VCManager');
        return undefined;
      }
      
      console.log('[DeviceDiscoveryModel] Initializing ESP32ConnectionManager');
      this._esp32ConnectionManager = ESP32ConnectionManager.getInstance(
        this._transport,
        this._vcManager,
        this._personId
      );
      
      // Set up ESP32 service handler
      this._transport.addService(NetworkServiceType.HEARTBEAT_SERVICE, this.handleHeartbeatMessage.bind(this));
      
      // Listen for device authentication events
      this._esp32ConnectionManager.onDeviceAuthenticated.listen((device) => {
        // ESP32Device uses 'id' not 'deviceId'
        const deviceId = device.id || device.deviceId;
        console.log(`[DeviceDiscoveryModel] Device ${deviceId} authenticated`);
        
        // Update the device in our device list
        const existingDevice = this._deviceList.get(deviceId);
        if (existingDevice) {
          existingDevice.hasValidCredential = true;
          existingDevice.ownerId = device.ownerPersonId;
          // Emit device update to trigger UI refresh
          this.emitDeviceUpdate(deviceId, existingDevice);
        }
      });
      
      console.log('[DeviceDiscoveryModel] ESP32ConnectionManager initialized');
      return this._esp32ConnectionManager;
    } catch (error) {
      console.error('[DeviceDiscoveryModel] Failed to initialize ESP32ConnectionManager:', error);
      return undefined;
    }
  }

  /**
   * Initialize BTLE service for ESP32 device discovery
   */
  private async initializeBTLEService(): Promise<void> {
    if (this._btleInitialized) {
      return; // Already initialized
    }

    try {
      console.log('[DeviceDiscoveryModel] Initializing Universal BTLE service');
      
      // Dynamically import the BTLE service to avoid module-load-time errors
      const { RefactoredBTLEService } = await import('@src/services/RefactoredBTLEService');
      this._btleService = new RefactoredBTLEService();
      console.log('[DeviceDiscoveryModel] Created new BTLE service instance');
      
      // Initialize the BTLE service
      try {
        const initialized = await this._btleService.initialize();
        if (!initialized) {
          console.warn('[DeviceDiscoveryModel] BTLE service initialization failed');
          this._btleService = undefined;
          this._btleInitialized = false;
          return;
        }
        
        this._btleInitialized = true;
        console.log('[DeviceDiscoveryModel] BTLE service initialized successfully');
      } catch (initError) {
        // Check if this is a "Bluetooth unsupported" error
        const errorMessage = initError?.toString() || '';
        if (errorMessage.includes('unsupported') || errorMessage.includes('BluetoothLE')) {
          console.log('[DeviceDiscoveryModel] BluetoothLE not supported on this device - likely running on simulator');
        } else {
          console.warn('[DeviceDiscoveryModel] BTLE service initialization failed:', initError);
        }
        this._btleService = undefined;
        this._btleInitialized = false;
        return;
      }

      // Set up event listeners for BTLE discovered devices with debouncing
      this._btleService.on('deviceDiscovered', (device) => {
        // Debounce rapid BTLE discovery events (e.g., from advertisement packets)
        const existingDebounce = this._btleUpdateDebounce.get(device.id);
        if (existingDebounce) {
          clearTimeout(existingDebounce);
        }
        
        // Set a debounce timer to process this discovery after a short delay
        const debounceTimer = setTimeout(() => {
          this._btleUpdateDebounce.delete(device.id);
          this.handleBTLEDeviceDiscovered(device);
        }, 500); // 500ms debounce
        
        this._btleUpdateDebounce.set(device.id, debounceTimer);
      });

      this._btleService.on('esp32Connected', (device) => {
        console.log('[DeviceDiscoveryModel] ESP32 device connected via BTLE:', device.name);
        
        // Update device connectivity status
        const existingDevice = this._deviceList.get(device.id);
        if (existingDevice) {
          existingDevice.btleStatus = 'active';
          this.emitDeviceUpdate(deviceId, existingDevice);
        }
      });

      this._btleService.on('esp32Disconnected', (device) => {
        console.log('[DeviceDiscoveryModel] ESP32 device disconnected from BTLE:', device.name);
        
        // Update device connectivity status
        const existingDevice = this._deviceList.get(device.id);
        if (existingDevice) {
          existingDevice.btleStatus = 'inactive';
          this.emitDeviceUpdate(deviceId, existingDevice);
        }
      });

      console.log('[DeviceDiscoveryModel] ESP32 BTLE service initialized successfully');
    } catch (error) {
      console.warn('[DeviceDiscoveryModel] Failed to initialize ESP32 BTLE service:', error);
      console.log('[DeviceDiscoveryModel] BTLE service not available - continuing with QUICVC discovery only');
      // Don't throw - BTLE is optional
    }
  }
  
  /**
   * Handle BTLE device discovery with deduplication
   */
  private handleBTLEDeviceDiscovered(device: any): void {
    console.log('[DeviceDiscoveryModel] Processing BTLE device discovery:', device.name, `(${device.type})`);
    
    // Filter out random BTLE devices - only accept ESP32 or known device types
    const isKnownDeviceType = device.type === 'ESP32' || 
                             device.type === 'Ring' || 
                             device.type === 'LamaDevice' ||
                             device.name?.toLowerCase().includes('esp32') ||
                             device.name?.toLowerCase().includes('lama');
    
    if (!isKnownDeviceType) {
      console.log(`[DeviceDiscoveryModel] Ignoring unknown BTLE device: ${device.name} (${device.type})`);
      return;
    }
    
    // Check if device already exists
    const existingDevice = this._deviceList.get(device.id);
    
    if (existingDevice) {
      // Only update BTLE status and lastSeen, don't create duplicate
      const btleStatusChanged = existingDevice.btleStatus !== 'active';
      existingDevice.btleStatus = 'active';
      existingDevice.lastSeen = Date.now();
      
      // Only emit update if status actually changed
      if (btleStatusChanged) {
        console.log(`[DeviceDiscoveryModel] Updated existing device ${device.id} with BTLE connectivity`);
        this.emitDeviceUpdate(deviceId, existingDevice);
      } else {
        // Silent update - just refresh lastSeen
        console.log(`[DeviceDiscoveryModel] Device ${device.id} BTLE ping - refreshed lastSeen`);
      }
    } else {
      // Only create new device on first discovery if it's a known type
      console.log(`[DeviceDiscoveryModel] New ${device.type} device ${device.id} found via BTLE - creating entry`);
      
      const discoveryDevice: DiscoveryDevice = {
        deviceId: device.id,
        name: device.name,
        deviceType: device.type, // Use actual device type from BTLE service
        address: device.address,
        port: 0, // BTLE doesn't use ports
        online: true,
        lastSeen: Date.now(),
        ownerId: device.ownerId,
        wifiStatus: 'inactive', // Not discovered via WiFi yet
        btleStatus: 'active' // Device discovered via BTLE
      };

      this._deviceList.set(device.id, discoveryDevice);
      console.log(`[DeviceDiscoveryModel] New device ${device.id} registered via BTLE`);
      this.onDeviceDiscovered.emit(discoveryDevice);
    }
  }
  
  /**
   * Ensure VCManager is initialized
   */
  private async ensureVCManagerInitialized(): Promise<void> {
    if (this._vcManager) {
      return;
    }
    
    if (!this._transport || !this._personId) {
      console.log('[DeviceDiscoveryModel] Cannot initialize VCManager - transport or personId not ready');
      return;
    }
    
    try {
      console.log('[DeviceDiscoveryModel] Initializing VCManager');
      const { VCManager } = await import('./vc/VCManager');
      
      // Get LeuteModel instance for issuer functions
      const leuteModel = ModelService.getLeuteModel();
      if (!leuteModel) {
        console.log('[DeviceDiscoveryModel] LeuteModel not available yet, deferring VCManager initialization');
        return;
      }
      
      const vcConfig = {
        transport: this._transport,
        ownPersonId: this._personId,
        getIssuerPublicKey: async (issuerPersonId: SHA256IdHash<Person>) => {
          try {
            const someoneElse = await leuteModel.getSomeoneElse(issuerPersonId);
            if (someoneElse && someoneElse.person) {
              const signKeyHex = await leuteModel.getHexSignKey(someoneElse.person);
              return signKeyHex || null;
            }
            return null;
          } catch (error) {
            console.error('[DeviceDiscoveryModel] Error getting issuer public key:', error);
            return null;
          }
        },
        verifyVCSignature: async (vc: any, issuerPublicKeyHex: string) => {
          // For now, return true - actual verification would use crypto libs
          console.log('[DeviceDiscoveryModel] VC signature verification not yet implemented');
          return true;
        }
      };
      
      this._vcManager = new VCManager(vcConfig);
      await this._vcManager.init();
      
      // Use setVCManager to properly register handlers
      this.setVCManager(this._vcManager);
      
      console.log('[DeviceDiscoveryModel] VCManager initialized');
    } catch (error) {
      console.error('[DeviceDiscoveryModel] Failed to initialize VCManager:', error);
    }
  }

  /**
   * Get a specific device by ID
   */
  public getDevice(deviceId: string): DiscoveryDevice | undefined {
    return this._deviceList.get(deviceId);
  }
  
  /**
   * Helper to emit device updates with throttling to prevent duplicate events
   */
  private emitDeviceUpdate(deviceId: string, updates: Partial<DiscoveryDevice>): void {
    // Clear any existing throttle timer
    const existingTimer = this.updateThrottle.get(deviceId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Merge with any pending updates
    const pendingUpdate = this.pendingUpdates.get(deviceId) || {};
    const mergedUpdate = {
      deviceId,
      ...pendingUpdate,
      ...updates
    } as DiscoveryDevice;
    this.pendingUpdates.set(deviceId, mergedUpdate);

    // Set throttle timer
    const timer = setTimeout(() => {
      const finalUpdate = this.pendingUpdates.get(deviceId);
      if (finalUpdate) {
        this.pendingUpdates.delete(deviceId);
        this.updateThrottle.delete(deviceId);
        // Actually emit the update
        this.onDeviceUpdated.emit(finalUpdate);
      }
    }, this.UPDATE_THROTTLE_MS);

    this.updateThrottle.set(deviceId, timer);
  }

  /**
   * Update a device's information
   */
  public updateDevice(deviceId: string, updates: Partial<DiscoveryDevice>): void {
    const device = this.getDevice(deviceId);
    if (device) {
      Object.assign(device, updates);
      // Only emit the updates plus deviceId for identification
      this.emitDeviceUpdate(deviceId, updates);
    }
  }

  /**
   * Update a device's LED status
   */
  public updateDeviceLEDStatus(deviceId: string, status: 'on' | 'off'): void {
    const device = this.getDevice(deviceId);
    if (device) {
      device.blueLedStatus = status;
      console.log(`[DeviceDiscoveryModel] Updated LED status for ${deviceId} to ${status}`);
      // Only emit the changed fields, not the entire device object
      // This allows the UI to properly detect what changed
      this.onDeviceUpdated.emit({
        deviceId: device.deviceId,
        blueLedStatus: status
      });
    } else {
      console.warn(`[DeviceDiscoveryModel] Cannot update LED status - device ${deviceId} not found`);
    }
  }

  /**
   * Claim ownership of a device (app-initiated)
   * This is the main entry point for device ownership claims from the UI
   */
  public async claimDeviceOwnership(deviceId: string): Promise<boolean> {
    try {
      console.log(`[DeviceDiscoveryModel] 🔐 Claiming ownership of device ${deviceId}`);
      const device = this.getDevice(deviceId);
      
      if (!device) {
        console.error(`[DeviceDiscoveryModel] Device ${deviceId} not found in discovery list`);
        return false;
      }
      
      if (!this._personId) {
        console.error('[DeviceDiscoveryModel] Cannot claim ownership - no person ID set');
        return false;
      }
      
      // Log the claim attempt
      console.log(`[DeviceDiscoveryModel] Ownership claim attempt for ${deviceId}`);
      
      // For ESP32 devices, use ESP32ConnectionManager
      if (device.deviceType === 'ESP32' && this._esp32ConnectionManager) {
        console.log(`[DeviceDiscoveryModel] Using ESP32ConnectionManager to claim device ${deviceId}`);
        
        // Use the fast claimDevice method for ownership claiming
        const success = await this._esp32ConnectionManager.claimDevice(
          deviceId, 
          device.address || '', 
          device.port || 0
        );
        
        if (success) {
          console.log(`[DeviceDiscoveryModel] ✅ Successfully claimed ESP32 device ${deviceId}`);
          
          // Update device ownership locally
          device.ownerId = this._personId.toString();
          device.hasValidCredential = true;
          this._deviceList.set(deviceId, device);
          
          // Device record updated in internal device list
          console.log(`[DeviceDiscoveryModel] Device ownership updated for ${deviceId}`);
          
          // Register ownership
          await this.registerDeviceOwner(deviceId, this._personId.toString());
          
          this.emitDeviceUpdate(deviceId, { 
            hasValidCredential: device.hasValidCredential,
            ownerId: device.ownerId 
          });
          
          // Log successful claim
          await this.createDeviceOwnershipJournalEntry(
            deviceId,
            'ownership_established',
            this._personId.toString(),
            {
              deviceType: device.deviceType,
              deviceName: device.name,
              establishedBy: 'app-claim',
              claimMethod: 'esp32-protocol'
            }
          );
          
          return true;
        } else {
          console.error(`[DeviceDiscoveryModel] ❌ Failed to claim ESP32 device ${deviceId}`);
          
          // Log failed claim
          await this.createDeviceOwnershipJournalEntry(
            deviceId,
            'ownership_claim_failed',
            this._personId.toString(),
            {
              deviceType: device.deviceType,
              deviceName: device.name,
              reason: 'ESP32 claim protocol failed',
              claimMethod: 'esp32-protocol'
            }
          );
          
          return false;
        }
      }
      
      // For other device types, implement their specific claiming protocols
      console.warn(`[DeviceDiscoveryModel] Device type ${device.deviceType} claiming not implemented`);
      return false;
      
    } catch (error) {
      console.error(`[DeviceDiscoveryModel] Error claiming device ownership:`, error);
      
      // Log error
      if (this._personId) {
        await this.createDeviceOwnershipJournalEntry(
          deviceId,
          'ownership_claim_failed',
          this._personId.toString(),
          {
            error: error instanceof Error ? error.message : String(error),
            claimMethod: 'app-initiated'
          }
        );
      }
      
      return false;
    }
  }

  /**
   * Remove ownership of a device
   */
  public async removeDeviceOwnership(deviceId: string): Promise<boolean> {
    try {
      console.log(`[DeviceDiscoveryModel] 🔓 Removing ownership of device ${deviceId}`);
      const device = this.getDevice(deviceId);
      
      if (!device) {
        console.error(`[DeviceDiscoveryModel] Device ${deviceId} not found`);
        return false;
      }
      
      if (!this._personId) {
        console.error('[DeviceDiscoveryModel] Cannot remove ownership - no person ID set');
        return false;
      }
      
      // Log the removal attempt
      await this.createDeviceOwnershipJournalEntry(
        deviceId,
        'ownership_removal_initiated',
        this._personId.toString(),
        {
          deviceType: device.deviceType,
          deviceName: device.name,
          previousOwner: device.ownerId,
          initiatedBy: 'user'
        }
      );
      
      // For ESP32 devices, use ESP32ConnectionManager
      if (device.deviceType === 'ESP32' && this._esp32ConnectionManager) {
        console.log(`[DeviceDiscoveryModel] Using ESP32ConnectionManager to remove ownership of ${deviceId}`);
        
        const success = await this._esp32ConnectionManager.releaseDevice(deviceId, device.address, device.port);
        
        if (success) {
          console.log(`[DeviceDiscoveryModel] ✅ Successfully removed ownership of ESP32 device ${deviceId}`);
          
          // Update device ownership locally
          device.ownerId = undefined;
          device.hasValidCredential = false;
          this._deviceList.set(deviceId, device);
          
          // Cancel heartbeat timer since unowned devices don't need heartbeats
          const heartbeatTimer = this._heartbeatTimers.get(deviceId);
          if (heartbeatTimer) {
            clearTimeout(heartbeatTimer);
            this._heartbeatTimers.delete(deviceId);
            console.log(`[DeviceDiscoveryModel] Cancelled heartbeat timer for unowned device ${deviceId}`);
          }
          
          // Remove from persistent storage
          await this.removeOwnedDeviceFromStorage(deviceId);
          
          // Device record updated in internal device list
          console.log(`[DeviceDiscoveryModel] Device ownership removed for ${deviceId}`);
          
          // Remove from DeviceModel
          const deviceModel = DeviceModel.getInstance();
          if (deviceModel.isInitialized()) {
            await deviceModel.removeDeviceOwnership(deviceId);
          }
          
          this.emitDeviceUpdate(deviceId, { 
            hasValidCredential: device.hasValidCredential,
            ownerId: device.ownerId 
          });
          
          // Log successful removal
          await this.createDeviceOwnershipJournalEntry(
            deviceId,
            'ownership_removed',
            this._personId.toString(),
            {
              deviceType: device.deviceType,
              deviceName: device.name,
              removedBy: 'user-action'
            }
          );
          
          return true;
        } else {
          console.error(`[DeviceDiscoveryModel] ❌ Failed to remove ownership of ESP32 device ${deviceId}`);
          
          // Log failed removal
          await this.createDeviceOwnershipJournalEntry(
            deviceId,
            'ownership_removal_failed',
            this._personId.toString(),
            {
              deviceType: device.deviceType,
              deviceName: device.name,
              reason: 'ESP32 removal protocol failed'
            }
          );
          
          return false;
        }
      }
      
      // For other device types, implement their specific removal protocols
      console.warn(`[DeviceDiscoveryModel] Device type ${device.deviceType} ownership removal not implemented`);
      return false;
      
    } catch (error) {
      console.error(`[DeviceDiscoveryModel] Error removing device ownership:`, error);
      
      // Log error
      if (this._personId) {
        await this.createDeviceOwnershipJournalEntry(
          deviceId,
          'ownership_removal_failed',
          this._personId.toString(),
          {
            error: error instanceof Error ? error.message : String(error)
          }
        );
      }
      
      return false;
    }
  }

  /**
   * Register a device owner
   */
  public async registerDeviceOwner(deviceId: string, ownerPersonId: string): Promise<void> {
    // Update discovery records
    const device = this.getDevice(deviceId);
    if (device) {
      device.ownerId = ownerPersonId;
      device.hasValidCredential = true;
      device.isAuthenticated = true; // Mark as authenticated since we just registered ownership
      this._deviceList.set(deviceId, device);
      
      // Persist owned device to storage - convert DiscoveryDevice to Device format
      const deviceToStore: Device = {
        id: device.deviceId,
        name: device.name,
        type: device.deviceType,
        deviceType: device.deviceType,
        address: device.address,
        port: device.port,
        ownerId: device.ownerId,
        hasValidCredential: device.hasValidCredential,
        isAuthenticated: device.isAuthenticated,
        lastSeen: typeof device.lastSeen === 'number' ? new Date(device.lastSeen).toISOString() : device.lastSeen
      };
      await this.persistOwnedDevice(deviceToStore);
      
      // Update ESP32ConnectionManager if this is an ESP32 device
      if (device.deviceType === 'ESP32' && this._esp32ConnectionManager) {
        const esp32Device = this._esp32ConnectionManager.getDevice(deviceId);
        if (esp32Device) {
          esp32Device.ownerPersonId = ownerPersonId;
          esp32Device.isAuthenticated = true;
          console.log(`[DeviceDiscoveryModel] Synchronized authentication state for ${deviceId} after ownership registration`);
        }
      }
      
      // Persist to DeviceModel - defer to avoid blocking UI
      // Skip this for now to avoid circular dependency - DeviceModel will pick it up from discovery
      
      this.emitDeviceUpdate(deviceId, { 
        hasValidCredential: true,
        ownerId: ownerPersonId 
      });
    } else {
      console.warn(`[DeviceDiscoveryModel] Device ${deviceId} not found for owner registration`);
    }
  }

  /**
   * Get device ownership status
   */
  public getDeviceOwnershipStatus(deviceId: string): DeviceOwnershipStatus {
    const device = this.getDevice(deviceId);
    if (!device) {
      return DeviceOwnershipStatus.Unknown;
    }

    if (device.ownerId === this._personId?.toString()) {
      return device.hasValidCredential 
        ? DeviceOwnershipStatus.OwnedByMe 
        : DeviceOwnershipStatus.PendingVerification;
    } else if (device.ownerId) {
      return DeviceOwnershipStatus.OwnedByOther;
    } else {
      return DeviceOwnershipStatus.Unclaimed;
    }
  }

  /**
   * Send a credential to a device
   */
  public async sendCredentialToDevice(deviceId: string, credential: DeviceCredential): Promise<void> {
    const device = this.getDevice(deviceId);
    if (!device || !device.address) {
      throw new Error(`Device ${deviceId} not found or has no address`);
    }

    debug(`Sending credential to device ${deviceId}`);
    console.log(`[DeviceDiscoveryModel] Sending credential to device ${deviceId}`);
    
    // Store pending credential
    this._pendingCredentials.set(deviceId, credential);

    // Credentials are now sent via QUICVC connection manager
    console.log(`[DeviceDiscoveryModel] Credential ready for device ${deviceId}, will be sent via QUICVC`);
  }
  
  /**
   * Set VCManager reference
   */
  public setVCManager(vcManager: VCManager): void {
    console.log('[DeviceDiscoveryModel] Setting VCManager reference');
    this._vcManager = vcManager;
    
    // VCManager registers its own service handler in its init() method
    // We just need to listen for VC verification events
    if (this._vcManager) {
      console.log('[DeviceDiscoveryModel] Setting up VC event listeners');
      
      // Listen for VC verification events
      this._vcManager.onVCVerified.listen((verifiedInfo) => {
        this.handleVCVerified(verifiedInfo);
      });
      
      this._vcManager.onVCVerificationFailed.listen((deviceId: string, reason: string) => {
        this.handleVCVerificationFailed(deviceId, reason);
      });
      
      this._vcManager.onDeviceUnclaimed.listen((deviceId: string, message: string) => {
        console.log(`[DeviceDiscoveryModel] Device ${deviceId} is unclaimed: ${message}`);
        // This is not an error - it means the device can be claimed
        this.onDeviceUnclaimed.emit(deviceId, message);
      });
    }
  }

  /**
   * Check device availability and mark offline devices
   */
  private checkDeviceAvailability(): void {
    const now = Date.now();
    const devices = this.getDevices();

    for (const device of devices) {
      const lastSeen = this._deviceAvailability.get(device.deviceId) || 0;
      if (now - lastSeen > this.DEVICE_TIMEOUT) {
        // Device hasn't been seen recently
        if (device.online) {
          device.online = false;
          this.emitDeviceUpdate(deviceId, { 
            hasValidCredential: device.hasValidCredential,
            ownerId: device.ownerId 
          });
          debug(`Device ${device.deviceId} marked as offline`);
          console.log(`[DeviceDiscoveryModel] Device ${device.deviceId} marked as offline`);
        }
      }
    }
  }

  /**
   * Handle device discovered event
   */
  private async handleDeviceDiscovered(device: DiscoveryDevice): Promise<void> {
    debug(`Device discovered: ${device.deviceId}, ${device.name}`);
    console.log(`[DeviceDiscoveryModel] Device discovered via WiFi: ${device.deviceId} (${device.name}, ${device.deviceType})`);
    
    // Check if device already exists (discovered via BTLE)
    const existingDevice = this._deviceList.get(device.deviceId);
    
    if (existingDevice) {
      // Merge WiFi status with existing BTLE-discovered device
      existingDevice.wifiStatus = 'active';
      existingDevice.lastSeen = Date.now();
      // Update address/port from WiFi discovery
      existingDevice.address = device.address;
      existingDevice.port = device.port;
      console.log(`[DeviceDiscoveryModel] Updated existing device ${device.deviceId} with WiFi connectivity`);
      
      // Check if this is a rediscovery of an owned device
      const savedDevice = await this.getSavedDevice(device.deviceId);
      if (savedDevice && savedDevice.owner === this._personId) {
        console.log(`[DeviceDiscoveryModel] Rediscovered owned device ${device.deviceId}`);
        existingDevice.ownerId = this._personId?.toString();
      }
      
      this.emitDeviceUpdate(deviceId, existingDevice);
    } else {
      // New device discovered via WiFi
      console.log(`[DeviceDiscoveryModel] New device ${device.deviceId} discovered via WiFi`);
      
      // Check if this is a rediscovery of an owned device
      const savedDevice = await this.getSavedDevice(device.deviceId);
      if (savedDevice && savedDevice.owner === this._personId) {
        console.log(`[DeviceDiscoveryModel] Rediscovered owned device ${device.deviceId}`);
        device.ownerId = this._personId?.toString();
        // Don't automatically set hasValidCredential - device needs to prove it
      }
      
      // Add to our device list
      this._deviceList.set(device.deviceId, device);
      
      // Emit discovery event
      this.onDeviceDiscovered.emit(device);
    }
    
    // Update device availability
    this._deviceAvailability.set(device.deviceId, Date.now());
    
    // For ESP32 devices, notify ESP32ConnectionManager
    if (device.deviceType === 'ESP32' && this._esp32ConnectionManager && device.address && device.port) {
      console.log(`[DeviceDiscoveryModel] Notifying ESP32ConnectionManager about discovered device ${device.deviceId}`);
      this._esp32ConnectionManager.addDiscoveredDevice(device.deviceId, device.address, device.port, device.name);
    }
    
    // Create journal entry for new device discovery
    await this.createDeviceStateJournalEntry(
      device.deviceId,
      'offline',
      'discovered',
      'discovery_broadcast',
      {
        deviceType: device.deviceType,
        deviceName: device.name,
        address: device.address,
        capabilities: device.capabilities
      }
    );
  }

  /**
   * Get saved device from DeviceModel
   */
  private async getSavedDevice(deviceId: string): Promise<any> {
    try {
      const deviceModel = DeviceModel.getInstance();
      if (!deviceModel.isInitialized()) {
        return null;
      }
      
      const devices = await deviceModel.getDevices();
      return devices.find(d => d.deviceId === deviceId);
    } catch (error) {
      console.error(`[DeviceDiscoveryModel] Error getting saved device:`, error);
      return null;
    }
  }

  /**
   * Handle device updated event
   */
  private async handleDeviceUpdated(device: DiscoveryDevice): Promise<void> {
    debug(`Device updated: ${device.deviceId}, ${device.name}`);
    console.log(`[DeviceDiscoveryModel] Device updated: ${device.deviceId} (${device.name}, ${device.deviceType})`);
    
    // Update our device list
    const existingDevice = this._deviceList.get(device.deviceId);

    // CRITICAL: Discovery packets do not contain ownership information
    // Only update fields that are actually present in discovery packets
    // Preserve ownership fields from existing device
    const updatedDevice = {
      ...(existingDevice || {}),
      // Discovery packet fields only
      deviceId: device.deviceId,
      name: device.name,
      deviceType: device.deviceType,
      address: device.address,
      port: device.port,
      online: true,
      lastSeen: Date.now(),
      // Preserve ownership - discovery packets never have this
      ownerId: existingDevice?.ownerId,
      hasValidCredential: existingDevice?.hasValidCredential
    };
    this._deviceList.set(device.deviceId, updatedDevice);
    
    // Only mark dirty if this is a new device or significant properties changed
    // Note: Discovery packets don't contain ownership info, so we only check discovery fields
    const isNewDevice = !existingDevice;
    const hasSignificantChange = existingDevice && (
      existingDevice.online !== updatedDevice.online ||
      existingDevice.address !== updatedDevice.address ||
      existingDevice.port !== updatedDevice.port
    );
    
    // DeviceModel automatically listens to our update events, no need to call it directly
    
    // Track device availability
    this._deviceAvailability.set(device.deviceId, Date.now());

    // Emit the device update event so UI can refresh
    // CRITICAL: Discovery packets NEVER contain ownership information
    // However, we MUST preserve and emit ownership data from our internal state
    // Otherwise UI updates will clear the ownership when discovery packets arrive
    const updateFields: Partial<DiscoveryDevice> = {
      deviceId: device.deviceId,
      name: device.name,
      deviceType: device.deviceType,
      online: true,
      lastSeen: updatedDevice.lastSeen,
      address: device.address,
      port: device.port,
      // CRITICAL: Include preserved ownership from internal state
      // Discovery packets don't have this, but we must emit it to preserve in UI
      ownerId: updatedDevice.ownerId,
      hasValidCredential: updatedDevice.hasValidCredential
    };

    this.emitDeviceUpdate(device.deviceId, updateFields);
    
    // For ESP32 devices, ensure authentication is attempted if not already authenticated
    if (device.deviceType === 'ESP32' && this._esp32ConnectionManager && device.address && device.port) {
      const esp32Device = this._esp32ConnectionManager.getDevice(device.deviceId);
      if (!esp32Device) {
        console.log(`[DeviceDiscoveryModel] ESP32 device ${device.deviceId} not in connection manager, adding it`);
        this._esp32ConnectionManager.addDiscoveredDevice(device.deviceId, device.address, device.port, device.name);
      }

      // Discovery packets do not contain ownership information
      // Ownership is determined separately through:
      // 1. claimDevice() -> creates credential
      // 2. credential_message handler -> validates and stores ownership
      // 3. DeviceModel persistence -> persists ownership to storage
      //
      // Discovery packets only announce unowned devices looking for pairing
    }

    // Do NOT emit ownership fields from discovery packets - they don't contain this information
    // The credential flow handles ownership updates separately
  }

  private async handleDeviceLost(deviceId: string): Promise<void> {
    debug(`Device lost: ${deviceId}`);
    console.log(`[DeviceDiscoveryModel] Device lost via WiFi: ${deviceId}`);
    
    // Mark device as WiFi-inactive but don't remove it completely
    const device = this._deviceList.get(deviceId);
    if (device) {
      device.wifiStatus = 'inactive';
      device.lastSeen = Date.now();
      
      // If device has no active transports, mark as offline
      if (device.btleStatus === 'inactive') {
        device.online = false;
        device.connected = false;
        console.log(`[DeviceDiscoveryModel] Device ${deviceId} offline on all transports`);
      } else {
        console.log(`[DeviceDiscoveryModel] Device ${deviceId} still reachable via BTLE`);
      }
      
      this._deviceList.set(deviceId, device);
      this.emitDeviceUpdate(deviceId, device);
    }
    
    // Remove from availability tracking
    this._deviceAvailability.delete(deviceId);
    
    // Create journal entry for device going offline
    await this.createDeviceStateJournalEntry(
      deviceId,
      'wifi_connection',
      'inactive',
      'timeout',
      {
        reason: 'No WiFi discovery broadcast received within timeout period'
      }
    );
    
    this.onDeviceLost.emit(deviceId);
  }

  private async handleCredentialVerified(deviceId: string, credentialToken: Credential): Promise<void> { 
    debug(`Credential verified for device: ${deviceId}`);
    console.log(`[DeviceDiscoveryModel] Credential verified for device: ${deviceId}`);
    // Update the device record with credential status
    const device = this._deviceList.get(deviceId);
    if (device) {
      device.hasValidCredential = true;
      
      // If device has an owner, log the verification event
      if (device.ownerId) {
        await this.createDeviceOwnershipJournalEntry(
          deviceId,
          'ownership_verified',
          device.ownerId,
          {
            deviceType: device.deviceType,
            deviceName: device.name,
            verificationMethod: 'credential',
            verifiedBy: this._personId?.toString() || 'unknown'
          }
        );
      }
      
      this.emitDeviceUpdate(device.deviceId || deviceId, { 
      hasValidCredential: device.hasValidCredential,
      ownerId: device.ownerId 
    });
    }
  }

  private handleCredentialRejected(deviceId: string, reason: string): void {
    debug(`Credential rejected for device: ${deviceId}, reason: ${reason}`);
    console.log(`[DeviceDiscoveryModel] Credential rejected for device: ${deviceId}, reason: ${reason}`);
    // Update the device record with credential status
    const device = this._deviceList.get(deviceId);
    if (device) {
      device.hasValidCredential = false;
      this.emitDeviceUpdate(device.deviceId || deviceId, { 
      hasValidCredential: device.hasValidCredential,
      ownerId: device.ownerId 
    });
    }
  }

  private handleVCVerified(verifiedInfo: VerifiedVCInfo): void {
    debug(`VC verified for device: ${verifiedInfo.subjectDeviceId}`);
    console.log(`[DeviceDiscoveryModel] VC verified for device: ${verifiedInfo.subjectDeviceId}`);
    console.log(`[DeviceDiscoveryModel] Subject public key: ${verifiedInfo.subjectPublicKeyHex}`);
    console.log(`[DeviceDiscoveryModel] Issuer: ${verifiedInfo.issuerPersonId}`);
    
    // Update the device record with VC verification status
    const device = this._deviceList.get(verifiedInfo.subjectDeviceId);
    if (device) {
      device.hasValidCredential = true;
      this.emitDeviceUpdate(device.deviceId || deviceId, { 
      hasValidCredential: device.hasValidCredential,
      ownerId: device.ownerId 
    });
      
      // VC verification is complete - no additional credential verification needed
    }
    
    // CRITICAL: Notify ESP32ConnectionManager about successful authentication
    if (this._esp32ConnectionManager) {
      console.log(`[DeviceDiscoveryModel] Notifying ESP32ConnectionManager about VC verification for ${verifiedInfo.subjectDeviceId}`);
      this._esp32ConnectionManager.handleVCVerified(verifiedInfo);
    }
  }

  private handleVCVerificationFailed(deviceId: string, reason: string): void {
    debug(`VC verification failed for device: ${deviceId}, reason: ${reason}`);
    console.log(`[DeviceDiscoveryModel] VC verification failed for device: ${deviceId}, reason: ${reason}`);
    
    // Update the device record
    const device = this._deviceList.get(deviceId);
    if (device) {
      device.hasValidCredential = false;
      this.emitDeviceUpdate(device.deviceId || deviceId, { 
      hasValidCredential: device.hasValidCredential,
      ownerId: device.ownerId 
    });
    }
  }


  /**
   * Create a device ownership journal entry
   */
  private async createDeviceOwnershipJournalEntry(
    deviceId: string,
    event: string,
    ownerPersonId: string,
    metadata?: any
  ): Promise<void> {
    // Journal functionality temporarily disabled
    return;
  }

  /**
   * Create a device state journal entry
   */
  private async createDeviceStateJournalEntry(
    deviceId: string,
    fromState: string,
    toState: string,
    trigger: string,
    metadata?: any
  ): Promise<void> {
    // Journal functionality temporarily disabled
    return;
  }

  /**
   * Test device availability by sending a ping
   */
  public async testDeviceAvailability(deviceId: string): Promise<boolean> {
    const device = this.getDevice(deviceId);
    if (!device || !device.address) {
      return false;
    }
    
    // For ESP32 devices, check with ESP32ConnectionManager
    if (device.deviceType === 'ESP32' && this._esp32ConnectionManager) {
      const esp32Device = this._esp32ConnectionManager.getDevice(deviceId);
      if (esp32Device && esp32Device.lastHeartbeat) {
        // Consider device available if we received a heartbeat in the last minute
        const timeSinceLastHeartbeat = Date.now() - esp32Device.lastHeartbeat;
        return timeSinceLastHeartbeat < 60000;
      }
    }
    
    // Check our availability tracking
    const lastSeen = this._deviceAvailability.get(deviceId);
    if (lastSeen) {
      const timeSinceLastSeen = Date.now() - lastSeen;
      return timeSinceLastSeen < this.DEVICE_TIMEOUT;
    }
    
    return false;
  }

  /**
   * Load device credentials from storage
   */
  public async loadDeviceCredentials(): Promise<DeviceCredential[]> {
    const credentials: DeviceCredential[] = [];
    
    // TODO: Load from storage
    
    return credentials;
  }

  /**
   * Save device credential to storage
   */
  public async saveDeviceCredential(credential: DeviceCredential): Promise<void> {
    // TODO: Save to storage
  }

  /**
   * Track device activity and reset heartbeat timer
   * This should be called whenever ANY packet is received from a device
   */
  public trackDeviceActivity(deviceId: string, packetType?: string): void {
    const now = Date.now();
    const previousActivity = this._deviceLastActivity.get(deviceId);
    
    // Update last activity timestamp
    this._deviceLastActivity.set(deviceId, now);
    
    // Also update availability tracking for backward compatibility
    this._deviceAvailability.set(deviceId, now);
    
    // Clear existing heartbeat timer for this device
    const existingTimer = this._heartbeatTimers.get(deviceId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    // Only schedule heartbeat if this is an owned device that we should monitor
    const device = this.getDevice(deviceId);
    if (device && device.ownerId === this._personId?.toString()) {
      // Schedule heartbeat to be sent only after inactivity threshold
      const heartbeatTimer = setTimeout(() => {
        this.sendHeartbeatToDevice(deviceId).catch(error => {
          console.error(`[DeviceDiscoveryModel] Error sending heartbeat to ${deviceId}:`, error);
        });
      }, this.HEARTBEAT_INACTIVITY_THRESHOLD);
      
      this._heartbeatTimers.set(deviceId, heartbeatTimer);
      
      // Log only significant activity changes, not every packet
      if (!previousActivity || (now - previousActivity) > 5000) {
        console.log(`[DeviceDiscoveryModel] Device ${deviceId} activity tracked${packetType ? ` (${packetType})` : ''}, heartbeat scheduled in ${this.HEARTBEAT_INACTIVITY_THRESHOLD}ms`);
      }
    }
  }

  /**
   * Send heartbeat to a specific device
   */
  private async sendHeartbeatToDevice(deviceId: string): Promise<void> {
    const device = this.getDevice(deviceId);
    if (!device || !device.address || !device.port) {
      console.warn(`[DeviceDiscoveryModel] Cannot send heartbeat to ${deviceId} - device not found or missing address`);
      return;
    }
    
    // Check if there has been recent activity - if so, don't send heartbeat
    const lastActivity = this._deviceLastActivity.get(deviceId);
    if (lastActivity && (Date.now() - lastActivity) < this.HEARTBEAT_INACTIVITY_THRESHOLD) {
      console.log(`[DeviceDiscoveryModel] Skipping heartbeat to ${deviceId} - recent activity detected`);
      return;
    }
    
    console.log(`[DeviceDiscoveryModel] Considering keepalive heartbeat to ${deviceId} after ${this.HEARTBEAT_INACTIVITY_THRESHOLD}ms of inactivity`);

    try {
      // For ESP32 devices, send through ESP32ConnectionManager if available AND device is owned
      // Unowned devices don't need heartbeats as they broadcast discovery messages
      if (device.deviceType === 'ESP32' && this._esp32ConnectionManager && device.ownerId) {
        // Check if device has an established QUIC-VC connection
        // Heartbeats require an active connection - without it, the device will continue
        // broadcasting discovery packets anyway
        const esp32Device = this._esp32ConnectionManager.getDevice(deviceId);
        if (!esp32Device) {
          console.log(`[DeviceDiscoveryModel] Skipping heartbeat - device ${deviceId} not registered in connection manager`);
          return;
        }

        // Skip heartbeat if no active connection - ownership claim doesn't establish QUIC-VC connection
        // Commands require QUIC-VC connection which is established separately
        if (!esp32Device.isAuthenticated) {
          console.log(`[DeviceDiscoveryModel] Skipping heartbeat - device ${deviceId} not authenticated yet`);
          return;
        }

        console.log(`[DeviceDiscoveryModel] Sending heartbeat to ${deviceId}`);

        // Send a lightweight ping command
        await this._esp32ConnectionManager.sendCommand(deviceId, {
          type: 'ping',
          command: 'ping',
          deviceId: deviceId,
          timestamp: Date.now(),
          data: { reason: 'keepalive_after_inactivity' }
        });
      }
      
      // Reschedule next heartbeat
      const heartbeatTimer = setTimeout(() => {
        this.sendHeartbeatToDevice(deviceId).catch(error => {
          console.error(`[DeviceDiscoveryModel] Error sending heartbeat to ${deviceId}:`, error);
        });
      }, this.HEARTBEAT_INACTIVITY_THRESHOLD);
      
      this._heartbeatTimers.set(deviceId, heartbeatTimer);
      
    } catch (error) {
      console.error(`[DeviceDiscoveryModel] Failed to send heartbeat to ${deviceId}:`, error);
      
      // Reschedule with longer delay on error
      const heartbeatTimer = setTimeout(() => {
        this.sendHeartbeatToDevice(deviceId).catch(error => {
          console.error(`[DeviceDiscoveryModel] Error sending heartbeat to ${deviceId}:`, error);
        });
      }, this.HEARTBEAT_INACTIVITY_THRESHOLD * 2);
      
      this._heartbeatTimers.set(deviceId, heartbeatTimer);
    }
  }

  /**
   * Handle incoming heartbeat messages from ESP32 devices
   */
  private async handleHeartbeatMessage(data: Uint8Array, rinfo: UdpRemoteInfo): Promise<void> {
    try {
      // QUICVC data is processed directly from UDP packets
      // Convert Uint8Array to string
      const decoder = new TextDecoder();
      const rawStr = decoder.decode(data);
      
      // Quick validation before heavy processing
      if (!rawStr.includes('heartbeat')) {
        return;
      }
      
      // Parse directly
      const message = JSON.parse(rawStr);
      
      // Validate heartbeat message - support both formats
      const isHeartbeat = message.type === 'heartbeat' || message.type === 'heartbeat_response';
      const deviceId = message.device_id || message.deviceId;
      
      if (!isHeartbeat || !deviceId) {
        return;
      }
      
      // Track device activity - this resets heartbeat timer for ANY packet
      this.trackDeviceActivity(deviceId, 'heartbeat');
      
      // Defer processing to avoid blocking UI thread
      deviceOperationsQueue.enqueue(async () => {
        // Only log first heartbeat or significant changes, not every 10 seconds
        
        const timestamp = message.timestamp || Date.now();
        const uptime = message.uptime || 0;
        
        // Update device availability
        this._deviceAvailability.set(deviceId, Date.now());
        
        // Get or update device info
        let device = this.getDevice(deviceId);
        
        // If device exists in AttestationDiscovery and has credentials in heartbeat,
        // it means we (the issuer) own this device
        if (device && message.credential && message.credential.issuer === this._personId) {
          // Only log ownership change, not every heartbeat
          if (!device.ownerId) {
            console.log(`[DeviceDiscoveryModel] Device ${deviceId} ownership confirmed from credential`);
            device.ownerId = this._personId;
            
            // Device record updated in internal list during handleDeviceDiscovered
            console.log(`[DeviceDiscoveryModel] Heartbeat confirmed ownership for ${deviceId}`);
          }
        }
        
        if (!device) {
          // Device not in discovery list, check if it's an owned device
          const esp32Device = this._esp32ConnectionManager?.getDevice(deviceId);
          
          // According to ESP32 protocol:
          // - Unowned devices send discovery messages
          // - Owned devices send heartbeats via QUIC-VC with credentials
          // If app loses state, it recovers devices from authenticated heartbeats
          
          if (message.credential) {
            // Device has credentials - check if they're issued by us
            console.log(`[DeviceDiscoveryModel] Received heartbeat from device ${deviceId} with credential`);
            
            const credential = message.credential;
            const issuerPersonId = credential.issuer;
            
            if (issuerPersonId === this._personId) {
              // We issued this credential - we own this device
              console.log(`[DeviceDiscoveryModel] Device ${deviceId} has our credential - recovering owned device from heartbeat`);
              
              // This is our owned device - recover it
              // Create a DiscoveryDevice object (not a ONE Device object yet)
              // The Device recipe object will be created by DeviceModel.persistDeviceOwnership
              device = {
                deviceId: deviceId,
                deviceType: 'ESP32',
                name: message.device_name || deviceId,
                address: rinfo.address,
                port: rinfo.port,
                lastSeen: Date.now(),
                capabilities: message.capabilities || ['heartbeat', 'led_control', 'sensor_data'],
                hasValidCredential: true,
                ownerId: this._personId,
                owner: this._personId as any, // Will be properly typed when stored
                online: true,
                blueLedStatus: 'off', // Initialize LED status
                firstSeen: Date.now()
              } as DiscoveryDevice;
              
              // Device added to internal device list only
              console.log(`[DeviceDiscoveryModel] Added new device to internal list: ${deviceId}`);
              
              // Also add to our local device list so getDevice() can find it
              this._deviceList.set(deviceId, device);
              
              // Update ESP32ConnectionManager
              if (this._esp32ConnectionManager) {
                this._esp32ConnectionManager.updateDevice(deviceId, device);
              }
              
              // Register device ownership to persist it
              await this.registerDeviceOwner(deviceId, this._personId);
              
              console.log(`[DeviceDiscoveryModel] Device ${deviceId} acknowledged ownership - recovered from authenticated heartbeat`);
              
              // Emit discovery event only once after everything is set up
              this.onDeviceDiscovered.emit(device);
            } else {
              // Device has credentials from someone else - ignore it
              console.log(`[DeviceDiscoveryModel] Device ${deviceId} has credentials from ${issuerPersonId}, not us (${this._personId}) - ignoring`);
              return;
            }
          } else {
            // No credential = unowned device sending heartbeat - protocol violation
            console.error(`[DeviceDiscoveryModel] Protocol violation: Device ${deviceId} is sending heartbeats without credentials`);
            console.error(`[DeviceDiscoveryModel] According to ESP32 protocol, only owned devices (with credentials) send heartbeats`);
            return;
          }
        }
        
        // Update device info
        device.address = rinfo.address;
        device.port = rinfo.port;
        device.lastSeen = Date.now();
        device.online = true;
        
        // Update device status if available
        if (message.device_status) {
          device.status = message.device_status;
          
          // Update LED status if provided
          if (message.device_status.blue_led !== undefined) {
            const ledStatus = message.device_status.blue_led;
            device.blueLedStatus = ledStatus === 'on' ? 'on' : 
                                  ledStatus === 'blink' ? 'blink' : 
                                  ledStatus === 'off' ? 'off' : 'unknown';
            // Only log if status actually changed
            const previousDevice = this.getDevice(deviceId);
            const previousStatus = previousDevice?.blueLedStatus;
            if (previousStatus !== device.blueLedStatus) {
              console.log(`[DeviceDiscoveryModel] LED status changed for ${deviceId}: ${previousStatus} -> ${device.blueLedStatus}`);
            }
          }
        }
        
        // Calculate latency if device sent its IP info
        // Don't log device IP on every heartbeat
        
        // Check authentication status before emitting update
        let hasValidCredential = false;
        if (this._esp32ConnectionManager && device.ownerId === this._personId) {
          const esp32Device = this._esp32ConnectionManager.getDevice(deviceId);
          if (esp32Device) {
            hasValidCredential = esp32Device.isAuthenticated;
            // Keep the device connection alive by updating heartbeat time
            this._esp32ConnectionManager.updateDevice(deviceId, {
              ...device,
              lastHeartbeat: Date.now()
            });
            // Only log auth state changes, not every heartbeat
            
            // If device is not authenticated but sending heartbeats with credentials, trigger authentication
            // Check if we're already authenticating this device to prevent duplicate attempts
            const authKey = `auth_${deviceId}`;
            
            // Also check if the device is already marked as owned in our discovery model
            // This can happen right after provisioning_ack but before ESP32ConnectionManager updates
            const isAlreadyOwned = device.ownerId === this._personId && device.hasValidCredential;
            
            if (!esp32Device.isAuthenticated && message.credential && !this._pendingAuthentications.has(authKey) && !isAlreadyOwned) {
              console.log(`[DeviceDiscoveryModel] Device ${deviceId} is sending authenticated heartbeats but not authenticated in ESP32ConnectionManager`);
              console.log(`[DeviceDiscoveryModel] Triggering authentication for device ${deviceId}`);
              
              // Mark as pending to prevent duplicate attempts
              this._pendingAuthentications.add(authKey);
              
              // Trigger authentication - this will request the device's VC and verify it
              this._esp32ConnectionManager.authenticateDevice(deviceId, device.address, device.port)
                .then(success => {
                  if (success) {
                    console.log(`[DeviceDiscoveryModel] Successfully triggered authentication for ${deviceId}`);
                  } else {
                    console.log(`[DeviceDiscoveryModel] Failed to authenticate ${deviceId}`);
                  }
                })
                .catch(error => {
                  console.error(`[DeviceDiscoveryModel] Error authenticating ${deviceId}:`, error);
                })
                .finally(() => {
                  // Remove from pending after completion
                  this._pendingAuthentications.delete(authKey);
                });
            } else if (isAlreadyOwned && !esp32Device.isAuthenticated) {
              // Device is already owned in discovery model but ESP32ConnectionManager doesn't know yet
              // Update ESP32ConnectionManager directly without triggering authentication
              console.log(`[DeviceDiscoveryModel] Device ${deviceId} already owned, updating ESP32ConnectionManager`);
              esp32Device.isAuthenticated = true;
              esp32Device.ownerPersonId = device.ownerId;
            }
          } else {
            // Device not in ESP32ConnectionManager but we own it - add it
            console.log(`[DeviceDiscoveryModel] Adding owned device ${deviceId} to ESP32ConnectionManager`);
            this._esp32ConnectionManager.updateDevice(deviceId, {
              ...device,
              lastHeartbeat: Date.now()
            });
            
            // Trigger authentication for the newly added device only if not already owned
            // Check if device is already marked as owned (e.g., after provisioning_ack)
            const isOwned = device.ownerId === this._personId && device.hasValidCredential;
            if (message.credential && !isOwned) {
              this._esp32ConnectionManager.authenticateDevice(deviceId, device.address, device.port)
                .catch(error => {
                  console.error(`[DeviceDiscoveryModel] Error authenticating newly added device ${deviceId}:`, error);
                });
            } else if (isOwned) {
              console.log(`[DeviceDiscoveryModel] Device ${deviceId} already owned, skipping authentication`);
              // Mark device as authenticated in ESP32ConnectionManager
              const esp32Device = this._esp32ConnectionManager.getDevice(deviceId);
              if (esp32Device) {
                esp32Device.isAuthenticated = true;
                esp32Device.ownerPersonId = device.ownerId;
              }
            }
          }
        }
        
        // Emit device update with authentication status - only emit changed fields
        this.onDeviceUpdated.emit({
          deviceId: device.deviceId,
          hasValidCredential,
          lastSeen: device.lastSeen
        });
        
        // If owned device monitor is active, update device address
        if (this._ownedDeviceMonitor) {
          await this._ownedDeviceMonitor.updateDeviceAddress(deviceId, rinfo.address, rinfo.port);
        }
        
        // Update device heartbeat metrics
        const heartbeatMetrics = {
          timestamp: new Date(timestamp),
          uptime: uptime,
          status: message.status || 'unknown',
          freeHeap: message.device_status?.free_heap,
          wifiConnected: message.device_status?.wifi_connected,
          blueLed: message.device_status?.blue_led
        };
        
        // Don't log routine heartbeat metrics - they come every 10 seconds
        
        // NOTE: We no longer send an immediate heartbeat_ack to the ESP32.
        // Sending an ACK for every heartbeat created a feedback-loop where the
        // ESP32 replied to our ACK instantly, resulting in an uncontrolled
        // burst of traffic (hundreds of packets per second) and ultimately
        // breaking LED control / connection stability.
        //
        // If future firmware requires an acknowledgement it should set an
        // explicit `ack_requested` flag in the heartbeat payload so we can
        // respond selectively, or we should gate the ACK with a debounce.

      });
      
    } catch (error) {
      console.error('[DeviceDiscoveryModel] Error handling heartbeat message:', error);
    }
  }

  /**
   * Send an LED control command to a device
   */
  public async sendLedCommand(deviceId: string, state: 'on' | 'off' | 'blink'): Promise<boolean> {
    console.log(`[DeviceDiscoveryModel] Sending LED command to ${deviceId}: ${state}`);
    
    const device = this.getDevice(deviceId);
    if (!device || !device.address || !device.port) {
      console.error(`[DeviceDiscoveryModel] Device ${deviceId} not found or has no address`);
      return false;
    }
    
    // Check if we own this device
    if (device.ownerId !== this._personId?.toString()) {
      console.error(`[DeviceDiscoveryModel] Cannot control device ${deviceId} - not owned by us`);
      return false;
    }
    
    // For ESP32 devices, use ESP32ConnectionManager
    if (device.deviceType === 'ESP32' && this._esp32ConnectionManager) {
      return await this._esp32ConnectionManager.sendCommand(deviceId, 'led', { state });
    }
    
    // For other device types, implement their specific command protocols
    console.warn(`[DeviceDiscoveryModel] LED control for device type ${device.deviceType} not implemented`);
    return false;
  }

  /**
   * Get device LED status
   */
  public getDeviceLedStatus(deviceId: string): 'on' | 'off' | 'blink' | 'unknown' {
    const device = this.getDevice(deviceId);
    return device?.blueLedStatus || 'unknown';
  }
  
  /**
   * Get supported device types
   */
  public getSupportedDeviceTypes(): string[] {
    return ['ESP32', 'ESP8266', 'RaspberryPi'];
  }
  
  /**
   * Get device capabilities
   */
  public getDeviceCapabilities(deviceId: string): string[] {
    const device = this.getDevice(deviceId);
    return device?.capabilities || [];
  }

  /**
   * Initialize device data from storage
   */
  public async initializeDeviceData(): Promise<void> {
    console.log('[DeviceDiscoveryModel] Loading device data from storage...');
    
    try {
      const credentials = await this.loadDeviceCredentials();
      
      for (const credential of credentials) {
        console.log(`[DeviceDiscoveryModel] Found credential for device ${credential.deviceId}`);
        
        // Check if device is currently discovered
        const device = this.getDevice(credential.deviceId);
        if (device) {
          // Only update ownership if we actually own this device according to the credential
          // The credential issuer is the owner
          const credentialOwner = credential.issuer || credential.subject;
          if (credentialOwner === this._personId?.toString()) {
            device.ownerId = this._personId?.toString();
            device.hasValidCredential = true;
            console.log(`[DeviceDiscoveryModel] Device ${credential.deviceId} is owned by us, updated ownership`);
          } else {
            console.log(`[DeviceDiscoveryModel] Device ${credential.deviceId} has credential but owned by ${credentialOwner}, not updating ownership`);
          }
          
          // Test availability
          const isAvailable = await this.testDeviceAvailability(credential.deviceId);
          if (isAvailable) {
            this._deviceAvailability.set(credential.deviceId, Date.now());
          }
          
          this.emitDeviceUpdate(deviceId, { 
            hasValidCredential: device.hasValidCredential,
            ownerId: device.ownerId 
          });
        } else {
          console.log(`[DeviceDiscoveryModel] Device ${credential.deviceId} not currently discovered`);
        }
      }
      
      console.log(`[DeviceDiscoveryModel] Completed loading data for ${credentials.length} devices`);
    } catch (error) {
      console.error('[DeviceDiscoveryModel] Error initializing device data:', error);
    }
  }

  /**
   * Verify device ownership with the device itself
   * This sends a challenge to the device to confirm it agrees we own it
   */
  public async verifyDeviceOwnership(deviceId: string): Promise<boolean> {
    console.log(`[DeviceDiscoveryModel] Verifying ownership with device ${deviceId}...`);
    
    // Check if we have a credential for this device
    const credentials = await this.loadDeviceCredentials();
    const deviceCredential = credentials.find(cred => cred.claims.get('device_id') === deviceId);
    
    if (!deviceCredential) {
      console.log(`[DeviceDiscoveryModel] No credential found for device ${deviceId}`);
      return false;
    }
    
    const device = this.getDevice(deviceId);
    if (!device || !device.address || !device.port) {
      console.error(`[DeviceDiscoveryModel] Device ${deviceId} not found or has no address`);
      return false;
    }
    
    // For ESP32 devices, verify through ESP32ConnectionManager
    if (device.deviceType === 'ESP32' && this._esp32ConnectionManager) {
      const esp32Device = this._esp32ConnectionManager.getDevice(deviceId);
      if (esp32Device && esp32Device.isAuthenticated) {
        console.log(`[DeviceDiscoveryModel] Device ${deviceId} is already authenticated`);
        return true;
      }
      
      // Trigger authentication which will verify ownership
      const success = await this._esp32ConnectionManager.authenticateDevice(deviceId, device.address, device.port);
      if (success) {
        console.log(`[DeviceDiscoveryModel] Successfully verified ownership of ${deviceId}`);
        device.hasValidCredential = true;
        this.emitDeviceUpdate(device.deviceId || deviceId, { 
      hasValidCredential: device.hasValidCredential,
      ownerId: device.ownerId 
    });
        return true;
      } else {
        console.log(`[DeviceDiscoveryModel] Failed to verify ownership of ${deviceId}`);
        return false;
      }
    }
    
    // For other device types, implement verification
    console.warn(`[DeviceDiscoveryModel] Ownership verification for device type ${device.deviceType} not implemented`);
    return false;
  }
  
  /**
   * Clean up and destroy the model
   */
  public async destroy(): Promise<void> {
    console.log('[DeviceDiscoveryModel] Destroying DeviceDiscoveryModel...');
    
    // Stop discovery if running
    if (this._isDiscovering) {
      await this.stopDiscovery();
    }
    
    // No need to clean up global queue - it's shared
    
    // Clean up timers
    if (this._discoveryTimer) {
      clearInterval(this._discoveryTimer);
      this._discoveryTimer = undefined;
    }
    
    if (this._availabilityCheckTimer) {
      clearInterval(this._availabilityCheckTimer);
      this._availabilityCheckTimer = undefined;
    }
    
    // QUICVC connection manager cleanup handled by QuicModel
    console.log('[DeviceDiscoveryModel] QUICVC discovery cleanup complete');
    
    // Clean up owned device monitor
    if (this._ownedDeviceMonitor) {
      try {
        await this._ownedDeviceMonitor.stop();
        this._ownedDeviceMonitor = undefined;
      } catch (error) {
        console.error('[DeviceDiscoveryModel] Error stopping OwnedDeviceMonitor during destroy:', error);
      }
    }
    
    // Clean up heartbeat timers
    for (const [deviceId, timer] of this._heartbeatTimers) {
      clearTimeout(timer);
    }
    this._heartbeatTimers.clear();
    
    // Clear device lists
    this._deviceList.clear();
    this._deviceAvailability.clear();
    this._pendingCredentials.clear();
    this._deviceLastActivity.clear();
    
    // Reset state
    this._initialized = false;
    this._initializing = false;
    
    console.log('[DeviceDiscoveryModel] DeviceDiscoveryModel destroyed');
  }
  
  /**
   * Persist owned device to storage
   */
  private async persistOwnedDevice(device: Device): Promise<void> {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      
      // Load existing owned devices
      const storedDevices = await AsyncStorage.getItem('owned_devices');
      const ownedDevices: Record<string, Device> = storedDevices ? JSON.parse(storedDevices) : {};
      
      // Add or update this device
      ownedDevices[device.id] = {
        id: device.id,
        name: device.name,
        type: device.type,
        deviceType: device.deviceType,
        address: device.address,
        port: device.port,
        ownerId: device.ownerId,
        hasValidCredential: true,
        isAuthenticated: true,
        capabilities: device.capabilities || [],
        lastSeen: device.lastSeen || new Date().toISOString()
      };
      
      // Save back to storage
      const dataToSave = JSON.stringify(ownedDevices);
      console.log(`[DeviceDiscoveryModel] Saving owned devices to storage:`, dataToSave);
      await AsyncStorage.setItem('owned_devices', dataToSave);
      console.log(`[DeviceDiscoveryModel] Persisted owned device ${device.id} to storage, total devices: ${Object.keys(ownedDevices).length}`);
    } catch (error) {
      console.error(`[DeviceDiscoveryModel] Failed to persist owned device:`, error);
    }
  }
  
  /**
   * Remove owned device from storage
   */
  private async removeOwnedDeviceFromStorage(deviceId: string): Promise<void> {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      
      // Load existing owned devices
      const storedDevices = await AsyncStorage.getItem('owned_devices');
      if (storedDevices) {
        const ownedDevices: Record<string, Device> = JSON.parse(storedDevices);
        
        // Remove this device
        delete ownedDevices[deviceId];
        
        // Save back to storage
        await AsyncStorage.setItem('owned_devices', JSON.stringify(ownedDevices));
        console.log(`[DeviceDiscoveryModel] Removed device ${deviceId} from persistent storage`);
      }
    } catch (error) {
      console.error(`[DeviceDiscoveryModel] Failed to remove device from storage:`, error);
    }
  }
  
  /**
   * Load owned devices from storage
   */
  public async loadOwnedDevices(): Promise<void> {
    console.log('[DeviceDiscoveryModel] loadOwnedDevices() called');
    console.log('[DeviceDiscoveryModel] Current personId:', this._personId?.toString());
    
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const storedDevices = await AsyncStorage.getItem('owned_devices');
      console.log('[DeviceDiscoveryModel] AsyncStorage query completed, found data:', !!storedDevices);
      
      if (storedDevices) {
        console.log(`[DeviceDiscoveryModel] Raw stored devices data:`, storedDevices);
        const ownedDevices: Record<string, Device> = JSON.parse(storedDevices);
        let loadedCount = 0;
        console.log(`[DeviceDiscoveryModel] Loading owned devices, current personId: ${this._personId?.toString()}`);
        console.log(`[DeviceDiscoveryModel] Found ${Object.keys(ownedDevices).length} stored devices`);
        console.log(`[DeviceDiscoveryModel] Device keys:`, Object.keys(ownedDevices));
        
        for (const deviceKey in ownedDevices) {
          const storedDevice = ownedDevices[deviceKey];
          console.log(`[DeviceDiscoveryModel] Checking stored device ${deviceKey}: ownerId=${storedDevice.ownerId}`);
          
          // Only load devices we own - compare as strings
          if (storedDevice.ownerId && this._personId && storedDevice.ownerId === this._personId.toString()) {
            // Convert stored Device back to DiscoveryDevice format
            const discoveryDevice: DiscoveryDevice = {
              deviceId: storedDevice.id,
              name: storedDevice.name,
              deviceType: storedDevice.deviceType || storedDevice.type,
              address: storedDevice.address,
              port: storedDevice.port,
              ownerId: storedDevice.ownerId,
              hasValidCredential: storedDevice.hasValidCredential !== false, // Default to true for owned devices
              isAuthenticated: false, // Will be updated when device comes online
              connected: false, // Will be updated when device connects
              online: false, // Will be updated when device is discovered
              lastSeen: typeof storedDevice.lastSeen === 'string' ? new Date(storedDevice.lastSeen).getTime() : storedDevice.lastSeen || Date.now(),
              firstSeen: Date.now(),
              capabilities: storedDevice.capabilities || []
            };
            
            // Add to device list using the deviceId
            this._deviceList.set(discoveryDevice.deviceId, discoveryDevice);
            loadedCount++;
            
            // Emit discovery event so UI updates
            this.onDeviceDiscovered.emit(discoveryDevice.deviceId);
            console.log(`[DeviceDiscoveryModel] Loaded owned device: ${discoveryDevice.deviceId} with ownerId: ${discoveryDevice.ownerId}`);
            
            // For ESP32 devices, mark them as needing authentication
            if (discoveryDevice.deviceType === 'ESP32') {
              console.log(`[DeviceDiscoveryModel] ESP32 device ${discoveryDevice.deviceId} loaded from storage - will authenticate when discovered`);
            }
          }
        }
        
        if (loadedCount > 0) {
          console.log(`[DeviceDiscoveryModel] Loaded ${loadedCount} owned devices from storage`);
        } else if (Object.keys(ownedDevices).length > 0) {
          console.log(`[DeviceDiscoveryModel] Found ${Object.keys(ownedDevices).length} devices in storage but none matched current personId`);
          console.log(`[DeviceDiscoveryModel] Stored device owners:`, Object.values(ownedDevices).map(d => d.ownerId));
        }
      } else {
        console.log('[DeviceDiscoveryModel] No owned devices found in storage');
      }
    } catch (error) {
      console.error(`[DeviceDiscoveryModel] Failed to load owned devices:`, error);
    }
  }
}

// Export as default too for backward compatibility
export default DeviceDiscoveryModel;