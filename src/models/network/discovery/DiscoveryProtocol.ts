/**
 * Discovery Protocol Implementation
 * 
 * Handles device discovery and peer communication over UDP.
 */

import { IQuicTransport, DeviceIdentityCredential, VCPresentationMessage, NetworkServiceType, QuicTransportOptions, Device, DiscoveryMessage } from '../interfaces';
import { UdpModel, UdpRemoteInfo } from '../UdpModel';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import Debug from 'debug';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';

// Initialize debug but don't enable it - controlled by message bus
const debug = Debug('one:discovery:protocol');

// Debug is now controlled by DEBUG env var, not force-enabled
debug.enabled = false;

/**
 * Discovery protocol configuration
 */
export interface DiscoveryConfig {
  // Device information
  deviceId: string;
  deviceName: string;
  deviceType: string;
  capabilities: string[];
  version: string;
  
  // Network configuration
  discoveryPort: number;
  discoveryInterval: number;
  maxAge: number;
  broadcastAddress: string;
}

/**
 * Discovery Protocol
 * 
 * Implements device discovery using the transport interface
 */
export class DiscoveryProtocol {
  // Transport layer
  private transport: IQuicTransport;
  private wasTransportProvided: boolean; // New flag
  
  // Discovery state
  private discovering: boolean = false;
  private discoveryTimer: NodeJS.Timeout | null = null;
  private pruneTimer: NodeJS.Timeout | null = null;
  private broadcastCount: number = 0;
  
  // Device registry
  private devices: Map<string, Device> = new Map();
  
  // Events
  public readonly onDeviceDiscovered = new OEvent<(device: Device) => void>();
  public readonly onDeviceUpdated = new OEvent<(device: Device) => void>();
  public readonly onDeviceLost = new OEvent<(deviceId: string) => void>();
  public readonly onDeviceActivity = new OEvent<(deviceId: string, activityType: string) => void>();
  public readonly onError = new OEvent<(error: Error) => void>();
  
  // Discovery configuration
  private config: DiscoveryConfig;
  
  /**
   * Create a discovery protocol instance
   */
  constructor(
    configOptions: Partial<DiscoveryConfig>,
    transport?: IQuicTransport // Optional transport
  ) {
    // Create config by combining defaults with provided options
    const defaultConfig: Partial<DiscoveryConfig> = {
      discoveryPort: 49497,
      discoveryInterval: 5000,
      maxAge: 30000,
      broadcastAddress: '255.255.255.255'
    };
    
    // Merge defaults with provided options
    this.config = { ...defaultConfig, ...configOptions } as DiscoveryConfig;
    
    // Ensure deviceId is a string
    if (this.config.deviceId && typeof this.config.deviceId !== 'string') {
      console.error('[DiscoveryProtocol] WARNING: deviceId in config is not a string:', this.config.deviceId);
      this.config.deviceId = String(this.config.deviceId);
    }
    
    // Use provided transport or create a new one
    if (transport) {
      this.transport = transport;
      this.wasTransportProvided = true;
    } else {
      // Lazy load ExpoQuicTransport to avoid platform mismatch errors
      this.transport = null as any; // Will be created lazily in init()
      this.wasTransportProvided = false;
    }
    
    debug('Created DiscoveryProtocol with config:', this.config, `Transport provided: ${this.wasTransportProvided}`);
  }
  
  /**
   * Create a fresh transport with proper error handling and diagnostics
   * This method is used to create or recreate the transport when needed
   * @param options Transport options to use
   * @param retryCount Current retry count (for internal use)
   * @returns true if successful, false otherwise
   */
  private async createFreshTransport(options?: QuicTransportOptions, retryCount = 0): Promise<boolean> {
    // If transport was externally provided, this method should not be creating new ones.
    if (this.wasTransportProvided) {
      console.warn('[DiscoveryProtocol] createFreshTransport called, but transport was externally provided. Aborting fresh transport creation.');
      return false; 
    }
    
    // Maximum number of retries
    const MAX_RETRIES = 1; // Only one retry to avoid infinite loops
    
    try {
      console.log(`[DiscoveryProtocol] Creating fresh transport (retry ${retryCount}/${MAX_RETRIES})...`);
      
      // Create new transport instance (lazy load to avoid platform mismatch)
      const { UdpServiceTransport } = await import('../transport/UdpServiceTransport');
      this.transport = new UdpServiceTransport() as IQuicTransport;
      
      // Initialize the transport
      await this.transport.init();
      
      // Re-register handlers
      this.transport.addService(NetworkServiceType.DISCOVERY_SERVICE, this.handleDiscoveryMessage.bind(this));
      
      this.transport.on('message', (data: Buffer, rinfo: UdpRemoteInfo) => {
        console.log(`[DiscoveryProtocol] Received unhandled message from ${rinfo.address}:${rinfo.port}, size=${data.length}`);
      });
      
      this.transport.on('error', (error) => {
        debug('Transport error:', error);
        console.error(`[DiscoveryProtocol] Transport error:`, error);
        this.onError.emit(error instanceof Error ? error : new Error(String(error)));
      });
      
      console.log(`[DiscoveryProtocol] Fresh transport created and initialized successfully`);
      return true;
    } catch (error: any) {
      console.error(`[DiscoveryProtocol] Error creating fresh transport:`, error);
      
      // If we haven't exceeded the maximum number of retries, try with a different port
      if (retryCount < MAX_RETRIES) {
        const newPort = this.config.discoveryPort + 1 + retryCount;
        console.log(`[DiscoveryProtocol] Retrying with port ${newPort}...`);
        
        // Update config to use new port
        this.config.discoveryPort = newPort;
        
        // Retry with new port
        return this.createFreshTransport({
          port: newPort,
          host: '0.0.0.0'
        }, retryCount + 1);
      }
      
      return false;
    }
  }

  /**
   * Initialize the discovery protocol
   */
  public async init(): Promise<boolean> {
    debug('Initializing discovery protocol');
    debug(`Initializing with config: port=${this.config.discoveryPort}, broadcastAddress=${this.config.broadcastAddress}`);
    
    try {
      // Create transport if it was not provided externally
      if (!this.transport && !this.wasTransportProvided) {
        debug('Creating transport instance');
        const { UdpServiceTransport } = await import('../transport/UdpServiceTransport');
        this.transport = new UdpServiceTransport() as IQuicTransport;
      }
      
      // Check if transport needs initialization
      const transportInitialized = this.transport.isInitialized();
      debug(`Transport initialized state: ${transportInitialized}, was provided: ${this.wasTransportProvided}`);
      
      // If transport was provided externally, we should NOT try to initialize it
      // The external provider (QuicModel) is responsible for its initialization
      if (this.wasTransportProvided) {
        if (!transportInitialized) {
          console.warn('[DiscoveryProtocol] External transport provided but not initialized. This is the responsibility of the provider.');
          // Continue anyway - the transport might still work
        }
        debug('Using externally provided transport as-is');
      } else if (!transportInitialized) {
        // Only initialize if we created the transport ourselves
        debug('Transport not initialized, initializing now');
        debug('Transport not initialized, initializing now');
        
        const initOptions: QuicTransportOptions = {
          port: this.config.discoveryPort,
          host: '0.0.0.0' // Force binding to all interfaces
        };
        
        debug(`Initializing transport with options: port=${initOptions.port}, host=${initOptions.host}`);
        
        try {
          await this.transport.init(initOptions);
          debug('Transport initialized successfully');
        } catch (transportError: any) {
          console.error('[DiscoveryProtocol] Failed to initialize transport:', transportError);

          // If binding failed due to port already in use, discovery cannot proceed because
          // all participants MUST share the same port to interoperate. We surface a clear
          // error and abort so the developer can fix the underlying socket option (e.g.
          // ensure SO_REUSEPORT is enabled in the native UDP module).
          if (transportError.message && transportError.message.includes('Address already in use')) {
            const err = new Error(`Discovery failed: UDP port ${this.config.discoveryPort} already in use. All instances must share the same port – please enable SO_REUSEPORT/ADDR in the native layer.`);
            this.onError.emit(err);
            throw err;
          } else if (this.wasTransportProvided) {
            // If transport was provided externally, don't try to fix it here.
            console.error('[DiscoveryProtocol] External transport failed to initialize. Propagating error.');
            const err = new Error(`Externally provided transport failed to initialize: ${transportError.message || String(transportError)}`);
            this.onError.emit(err);
            throw err;
          } else if (transportError.message && (
              transportError.message.includes('Socket not found') || 
              transportError.message.includes('bind') || 
              transportError.message.includes('socket')
          )) {
            console.error('[DiscoveryProtocol] Socket-related error detected during initialization');
            
            // Try creating a fresh transport as a last resort
            console.log('[DiscoveryProtocol] Attempting to create a fresh transport...');
            const freshTransportSuccess = await this.createFreshTransport(initOptions);
            
            if (freshTransportSuccess) {
              console.log('[DiscoveryProtocol] Fresh transport created successfully');
              // Continue with initialization
            } else {
              throw new Error(`Failed to initialize transport after retry: ${transportError.message || String(transportError)}`);
            }
          } else {
            throw new Error(`Failed to initialize transport: ${transportError.message || String(transportError)}`);
          }
        }
      } else {
        debug('Transport already initialized');
      }
      
      // Register discovery service handler
      debug(`Registering discovery service handler for service type ${NetworkServiceType.DISCOVERY_SERVICE}`);
      this.transport.addService(NetworkServiceType.DISCOVERY_SERVICE, this.handleDiscoveryMessage.bind(this));
      
      // Register error handler
      this.transport.on('error', (error) => {
        debug('Transport error:', error);
        console.error(`[DiscoveryProtocol] Transport error:`, error);
        this.onError.emit(error instanceof Error ? error : new Error(String(error)));
      });
      
      debug('Discovery protocol initialized successfully');
      debug('Discovery protocol initialized successfully');
      return true;
    } catch (error) {
      debug('Error initializing discovery protocol:', error);
      console.error('[DiscoveryProtocol] Error initializing discovery protocol:', error);
      this.onError.emit(error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }
  
  /**
   * Start discovery process
   */
  public async startDiscovery(): Promise<void> {
    if (this.discovering) {
      debug('Discovery already in progress');
      return;
    }
    
    // Ensure transport is initialized before starting discovery
    if (!this.transport || !this.transport.isInitialized()) {
      console.error('[DiscoveryProtocol] Cannot start discovery - transport not initialized');
      throw new Error('Transport not initialized. Call init() before startDiscovery()');
    }
    
    debug('Starting discovery');
    debug('Starting discovery process...');
    this.discovering = true;
    
    // Start periodic discovery
    try {
      // Send initial discovery request
      debug('Sending initial discovery request...');
      await this.sendDiscoveryRequest();
      
      // Set up discovery and pruning intervals
      debug(`Setting up discovery interval (every ${this.config.discoveryInterval}ms)`);
      this.discoveryTimer = setInterval(async () => {
        try {
          debug('Sending periodic discovery request...');
          await this.sendDiscoveryRequest();
        } catch (error) {
          console.error('[DiscoveryProtocol] Error sending periodic discovery request:', error);
          debug('Error sending periodic discovery request:', error);
          this.onError.emit(error instanceof Error ? error : new Error(String(error)));
        }
      }, this.config.discoveryInterval);
      
      this.pruneTimer = setInterval(() => {
        this.pruneOldDevices();
      }, this.config.maxAge / 2);
      
      debug('Discovery started successfully - will broadcast every ' + this.config.discoveryInterval + 'ms');
      debug('Discovery started successfully');
    } catch (error) {
      debug('Error starting discovery:', error);
      this.stopDiscovery().catch(e => debug('Error stopping discovery after start failure:', e));
      this.onError.emit(error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  /**
   * Stop discovery process
   */
  public async stopDiscovery(): Promise<void> {
    if (!this.discovering) {
      debug('Discovery not in progress');
      return;
    }
    
    debug('Stopping discovery');

    // 1. Cancel timers **first** so no further sendDiscoveryRequest() can run
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }

    // 2. Mark as stopped *before* touching the transport so external callers
    //    won't attempt to restart while close is in-flight.
    this.discovering = false;

    // 3. Do NOT close the transport if it was provided externally
    //    The transport may be shared with other services
    if (!this.wasTransportProvided && this.transport) {
      try {
        debug('Closing self-created transport');
        await this.transport.close();
      } catch (err) {
        debug('Error closing discovery transport: %o', err);
      }
    } else {
      debug('Not closing externally provided transport');
    }

    debug('Discovery stopped');
  }
  
  /**
   * Get all discovered devices
   */
  public getDevices(): Device[] {
    // Devices already have both id/deviceId and type/deviceType fields
    return Array.from(this.devices.values());
  }
  
  /**
   * Get a specific device by ID
   */
  public getDevice(deviceId: string): Device | undefined {
    return this.devices.get(deviceId);
  }
  
  /**
   * Check if discovery is currently running
   */
  public get isDiscovering(): boolean {
    return this.discovering;
  }
  
  /**
   * Update the device ID in the configuration
   * This is needed when the device ID changes after initialization
   */
  public updateDeviceId(deviceId: string): void {
    if (typeof deviceId !== 'string') {
      console.error('[DiscoveryProtocol] updateDeviceId called with non-string:', deviceId);
      deviceId = String(deviceId);
    }
    
    this.config.deviceId = deviceId;
    debug('Updated deviceId to:', deviceId);
  }
  
  /**
   * Send a discovery request
   */
  private async sendDiscoveryRequest(): Promise<void> {
    debug('Sending discovery request');
    debug('Sending discovery request broadcast');
    
    // Debug logging for deviceId - removed for performance
    
    try {
      // Ensure deviceId is a string before creating the message
      let safeDeviceId = this.config.deviceId;
      if (typeof safeDeviceId !== 'string') {
        console.error('[DiscoveryProtocol] deviceId is not a string at send time:', safeDeviceId);
        // Try to convert it
        safeDeviceId = safeDeviceId?.toString?.() || `unknown-${Math.random().toString(36).substring(2, 8)}`;
        // Update config to prevent future issues
        this.config.deviceId = safeDeviceId;
      }
      
      // Create discovery message
      const message: DiscoveryMessage = {
        type: 'discovery_request',
        deviceId: safeDeviceId,
        deviceName: this.config.deviceName,
        deviceType: this.config.deviceType,
        capabilities: this.config.capabilities,
        version: this.config.version,
        timestamp: Date.now()
      };
      
      // Serialize message - first byte is NetworkServiceType.DISCOVERY_SERVICE
      const serviceTypeByte = new Uint8Array([NetworkServiceType.DISCOVERY_SERVICE]);
      const messageBytes = new TextEncoder().encode(JSON.stringify(message));
      
      // Concatenate the arrays
      const packetUint8Array = new Uint8Array(serviceTypeByte.length + messageBytes.length);
      packetUint8Array.set(serviceTypeByte, 0);
      packetUint8Array.set(messageBytes, serviceTypeByte.length);

      // Send to broadcast address
      // Reduce discovery broadcast logging - only log every 10th broadcast
      this.broadcastCount = (this.broadcastCount || 0) + 1;
      if (this.broadcastCount % 10 === 1) {
        debug(`Sending discovery broadcast #${this.broadcastCount} to ${this.config.broadcastAddress}:${this.config.discoveryPort}`);
      }
      
      await this.transport.send(packetUint8Array, this.config.broadcastAddress, this.config.discoveryPort);
      debug('Discovery request sent successfully');
    } catch (error) {
      console.error(`[DiscoveryProtocol] Error sending discovery request:`, error);
      debug('Error sending discovery request:', error);
      // Don't throw to avoid crashing discovery
    }
  }
  
  /**
   * Handle incoming discovery messages
   */
  private handleDiscoveryMessage(data: Uint8Array, rinfo: UdpRemoteInfo): void {
    debug(`Received discovery message from ${rinfo.address}:${rinfo.port} (${data.length} bytes)`);
    debug(`Processing message from ${rinfo.address}:${rinfo.port} (${data.length} bytes)`);
    
    try {
      let jsonData: Uint8Array;
      
      // ESP32 Discovery Protocol Format:
      // [Service Type Byte (0x01)][JSON Payload]
      // No length byte - just service type + JSON
      
      if (data.length > 1 && data[0] === NetworkServiceType.DISCOVERY_SERVICE) {
        // This is a properly formatted discovery message from ESP32
        jsonData = data.slice(1); // Skip the service type byte
        debug(`ESP32 discovery message - skipping service type byte (0x01), parsing ${jsonData.length} bytes of JSON`);
      } else {
        // Fallback for direct JSON (shouldn't happen with ESP32)
        jsonData = data;
        debug(`Raw JSON message without service type byte`);
      }
      
      // Parse message
      let message: DiscoveryMessage;
      try {
        // Decode and clean the JSON string
        let jsonString = new TextDecoder().decode(jsonData);
        
        // Remove any null bytes or control characters at the end
        jsonString = jsonString.replace(/\0+$/, '').trim();
        
        // Find the last valid JSON character (closing brace)
        const lastBrace = jsonString.lastIndexOf('}');
        if (lastBrace !== -1 && lastBrace < jsonString.length - 1) {
          jsonString = jsonString.substring(0, lastBrace + 1);
        }
        
        debug(`JSON string to parse (${jsonString.length} chars): ${jsonString.substring(0, 150)}${jsonString.length > 150 ? '...' : ''}`);
        
        // Validate JSON structure
        if (!jsonString.startsWith('{') || !jsonString.endsWith('}')) {
          throw new Error(`Invalid JSON structure - must start with '{' and end with '}'`);
        }
        
        message = JSON.parse(jsonString);
        debug(`Successfully parsed message:`, message);
      } catch (parseError) {
        console.warn(`[DiscoveryProtocol] Invalid discovery message from ${rinfo.address}:${rinfo.port} - expected JSON format`);
        debug('Parse error:', parseError);
        
        // Log minimal debug info without throwing
        if (jsonData.length < 100) {
          debug(`Raw data (hex): ${Array.from(jsonData).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
        }
        
        // Simply return without processing - don't crash the app
        return;
      }
      
      // Validate message
      if (!message.deviceId || !message.type) {
        console.warn(`[DiscoveryProtocol] Invalid discovery message - missing deviceId or type:`, message);
        debug('Invalid discovery message:', message);
        return;
      }
      
      debug(`Valid ${message.type} from device ${message.deviceId}`);
      
      // Track device activity to reset heartbeat timers
      this.onDeviceActivity.emit(message.deviceId, `discovery_${message.type}`);
      
      // Handle based on message type
      if (message.type === 'discovery_request') {
        this.handleDiscoveryRequest(message, rinfo).catch(err => {
          debug('Error handling discovery request:', err);
        });
      } else if (message.type === 'discovery_response') {
        this.handleDiscoveryResponse(message, rinfo);
      } else {
        console.warn(`[DiscoveryProtocol] Unknown discovery message type: ${message.type}`);
        debug(`Unknown discovery message type: ${message.type}`);
      }
    } catch (error) {
      console.error(`[DiscoveryProtocol] Error handling discovery message:`, error);
      debug('Error handling discovery message:', error);
    }
  }
  
  /**
   * Handle discovery request
   * Respond with device information
   */
  private async handleDiscoveryRequest(request: DiscoveryMessage, rinfo: UdpRemoteInfo): Promise<void> {
    // Don't respond to our own requests
    if (request.deviceId === this.config.deviceId) {
      debug(`Ignoring our own discovery request from ${rinfo.address}:${rinfo.port}`);
      debug(`Ignoring our own discovery request (deviceId: ${this.config.deviceId})`);
      return;
    }
    
    debug(`Handling discovery request from ${request.deviceId} (${rinfo.address}:${rinfo.port})`);
    debug(`Handling discovery request from device ${request.deviceId} at ${rinfo.address}:${rinfo.port}`);
    
    // Register/update the device from its discovery request broadcast
    // This is how devices announce themselves on the network
    const device: any = {
      // Use both old and new field names for compatibility
      id: request.deviceId,
      deviceId: request.deviceId, // Required by Device interface
      name: request.deviceName || 'Unknown Device',
      type: request.deviceType || 'Unknown',
      deviceType: request.deviceType || 'Unknown', // Required by Device interface
      address: rinfo.address,
      port: rinfo.port,
      lastSeen: Date.now(),
      capabilities: request.capabilities || [],
      online: true,
      blueLedStatus: request.deviceStatus?.blue_led === 'on' ? 'on' :
                     request.deviceStatus?.blue_led === 'blink' ? 'blink' :
                     request.deviceStatus?.blue_led === 'off' ? 'off' : (request.deviceType === 'ESP32' ? 'off' : undefined),
      status: request.deviceStatus,
      // Transport status - discovered via WiFi (UDP), so WiFi is active
      wifiStatus: 'active' as const,
      btleStatus: 'inactive' as const
    };
    
    // Check if device already exists
    const existingDevice = this.devices.get(device.id);
    
    if (existingDevice) {
      // Update existing device, preserving ownership and credential status
      this.devices.set(device.id, {
        ...existingDevice,
        ...device,
        lastSeen: Date.now(),
        // Preserve ownership and credential status from existing device
        ownerId: existingDevice.ownerId,
        hasValidCredential: existingDevice.hasValidCredential,
        // Update LED status if provided, otherwise keep existing
        blueLedStatus: device.blueLedStatus || existingDevice.blueLedStatus || (device.deviceType === 'ESP32' ? 'off' : undefined)
      });
      debug(`Updated device from discovery broadcast: ${device.id} (${device.name})`);
      this.onDeviceUpdated.emit(this.devices.get(device.id)!);
    } else {
      // Add new device discovered from its broadcast
      this.devices.set(device.id, device);
      debug(`Discovered device from broadcast: ${device.id} (${device.name})`);
      debug(`Discovered device from broadcast: ${device.id} (${device.name}), type=${device.deviceType}`);
      this.onDeviceDiscovered.emit(device);
    }
    
    // Check if transport is still valid
    if (!this.transport || !this.transport.isInitialized()) {
      console.warn('[DiscoveryProtocol] Transport not available or not initialized, cannot send discovery response');
      return;
    }
    
    try {
      // Ensure deviceId is a string before creating the response
      let safeDeviceId = this.config.deviceId;
      if (typeof safeDeviceId !== 'string') {
        console.error('[DiscoveryProtocol] deviceId is not a string in response:', safeDeviceId);
        safeDeviceId = safeDeviceId?.toString?.() || `unknown-${Math.random().toString(36).substring(2, 8)}`;
        this.config.deviceId = safeDeviceId;
      }
      
      // Create discovery response
      const response: DiscoveryMessage = {
        type: 'discovery_response',
        deviceId: safeDeviceId,
        deviceName: this.config.deviceName,
        deviceType: this.config.deviceType,
        capabilities: this.config.capabilities,
        version: this.config.version,
        timestamp: Date.now()
      };
      
      // Serialize message with service type byte
      const serviceTypeByte = new Uint8Array([NetworkServiceType.DISCOVERY_SERVICE]);
      const messageBytes = new TextEncoder().encode(JSON.stringify(response));
      
      // Concatenate the arrays
      const packetUint8Array = new Uint8Array(serviceTypeByte.length + messageBytes.length);
      packetUint8Array.set(serviceTypeByte, 0);
      packetUint8Array.set(messageBytes, serviceTypeByte.length);

      // Send response directly to requester
      try {
        await this.transport.send(packetUint8Array, rinfo.address, rinfo.port);
        debug(`Discovery response sent to ${rinfo.address}:${rinfo.port}`);
        debug(`Discovery response sent to ${rinfo.address}:${rinfo.port}`);
      } catch (sendError) {
        console.error(`[DiscoveryProtocol] Failed to send discovery response to ${rinfo.address}:${rinfo.port}:`, sendError);
        // Don't throw - just log the error to prevent crash
      }
    } catch (error) {
      debug('Error sending discovery response:', error);
      this.onError.emit(error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  /**
   * Handle discovery response
   * Update device registry
   */
  private handleDiscoveryResponse(response: DiscoveryMessage, rinfo: UdpRemoteInfo): void {
    // Don't process our own responses
    if (response.deviceId === this.config.deviceId) {
      debug(`Ignoring our own discovery response from ${rinfo.address}:${rinfo.port}`);
      return;
    }
    
    debug(`Handling discovery response from ${response.deviceId} (${rinfo.address}:${rinfo.port})`);
    debug(`Received response from device ${response.deviceId} (${response.deviceName || 'Unknown'}) at ${rinfo.address}:${rinfo.port}`);
    
    // Create or update device
    const device: any = {
      // Use both old and new field names for compatibility
      id: response.deviceId,
      deviceId: response.deviceId, // Required by Device interface
      name: response.deviceName || 'Unknown Device',
      type: response.deviceType || 'Unknown',
      deviceType: response.deviceType || 'Unknown', // Required by Device interface
      address: rinfo.address,
      port: rinfo.port,
      lastSeen: Date.now(),
      capabilities: response.capabilities || [],
      online: true,
      blueLedStatus: response.deviceStatus?.blue_led === 'on' ? 'on' :
                     response.deviceStatus?.blue_led === 'blink' ? 'blink' :
                     response.deviceStatus?.blue_led === 'off' ? 'off' : (response.deviceType === 'ESP32' ? 'off' : undefined),
      status: response.deviceStatus,
      // Transport status - discovered via WiFi (UDP), so WiFi is active
      wifiStatus: 'active' as const,
      btleStatus: 'inactive' as const
    };
    
    // Check if device already exists
    const existingDevice = this.devices.get(device.id);
    
    if (existingDevice) {
      // Update existing device, preserving ownership and credential status
      this.devices.set(device.id, {
        ...existingDevice,
        ...device,
        lastSeen: Date.now(),
        // Preserve ownership and credential status from existing device
        ownerId: existingDevice.ownerId,
        hasValidCredential: existingDevice.hasValidCredential,
        // Update LED status if provided, otherwise keep existing
        blueLedStatus: device.blueLedStatus || existingDevice.blueLedStatus || (device.deviceType === 'ESP32' ? 'off' : undefined)
      });
      
      debug(`Updated device: ${device.id} (${device.name})`);
      debug(`Updated existing device: ${device.id} (${device.name}), type=${device.type}, capabilities=${device.capabilities.join(',')}`);
      this.onDeviceUpdated.emit(this.devices.get(device.id)!);
    } else {
      // Add new device
      this.devices.set(device.id, device);
      
      debug(`Discovered new device: ${device.id} (${device.name})`);
      debug(`Discovered NEW device: ${device.id} (${device.name}), type=${device.type}, capabilities=${device.capabilities.join(',')}`);
      this.onDeviceDiscovered.emit(device);
    }
  }
  
  /**
   * Remove devices that haven't been seen in a while
   */
  private pruneOldDevices(): void {
    const now = Date.now();
    const lostDevices: string[] = [];
    
    // Check each device - use Array.from to avoid iterator issues
    for (const [deviceId, device] of Array.from(this.devices.entries())) {
      if (now - device.lastSeen > this.config.maxAge) {
        debug(`Pruning device ${deviceId} (${device.name})`);
        this.devices.delete(deviceId);
        lostDevices.push(deviceId);
      }
    }
    
    // Emit events for lost devices
    for (const deviceId of lostDevices) {
      this.onDeviceLost.emit(deviceId);
    }
    
    if (lostDevices.length > 0) {
      debug(`Pruned ${lostDevices.length} stale devices`);
    }
  }
  
  /**
   * Shutdown discovery protocol
   */
  public async shutdown(): Promise<void> {
    debug('Shutting down discovery protocol');
    
    // Stop discovery
    await this.stopDiscovery();
    
    // Clear device list
    this.devices.clear();
    
    // Close transport only if we created it
    if (!this.wasTransportProvided && this.transport) {
      try {
        debug('Closing self-created transport during shutdown');
        await this.transport.close();
      } catch (error) {
        debug('Error closing transport during shutdown:', error);
      }
    } else {
      debug('Not closing externally provided transport during shutdown');
    }
    
    debug('Discovery protocol shutdown complete');
  }
} 