/**
 * QuicModel - Manages QUIC transport
 * 
 * This model centralizes the initialization and management of QUIC transport,
 * now using the new refactored QuicTransport for underlying operations.
 */

import { Model } from '@refinio/one.models/lib/models/Model';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import type { UdpRemoteInfo, UdpSocketOptions, UdpSocket } from './UdpModel';
import { UdpModel } from './UdpModel';
import type { IQuicTransport, QuicTransportOptions, TransportStats } from './interfaces';
import { UdpServiceTransport } from './transport/UdpServiceTransport';
import { Buffer } from '@refinio/one.core/lib/system/expo/index.js';
import Debug from 'debug';

const debug = Debug('one:quic:model');

// Define service types for QUIC messages (can be shared or defined in interfaces.ts too)
export enum QuicServiceType {
  DISCOVERY = 1,
  CREDENTIAL = 2, // Assuming credential service type
  DATA = 3,
  FILE_TRANSFER = 4,
  CONTROL = 5
}

export { QuicTransportOptions, TransportStats }; // Re-export for convenience

// Use React Native's EventEmitter instead of Node.js events
class EventEmitter {
  private listeners: Map<string, Function[]> = new Map();
  
  emit(event: string, ...args: any[]): boolean {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => listener(...args));
      return true;
    }
    return false;
  }
  
  on(event: string, listener: Function): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
    return this;
  }
  
  addListener = this.on;
  
  once(event: string, listener: Function): this {
    const onceWrapper = (...args: any[]) => {
      this.removeListener(event, onceWrapper);
      listener(...args);
    };
    return this.on(event, onceWrapper);
  }
  
  removeListener(event: string, listener: Function): this {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
    return this;
  }
  
  removeAllListeners(event?: string): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }
}

/**
 * QuicModel - Manages QUIC transport
 * 
 * Refactored to use the new pure QuicTransport.
 * It acts as a wrapper or manager for this transport if needed,
 * or could be simplified further depending on application structure.
 */
export class QuicModel extends Model {
  private _transport: IQuicTransport;
  private _initialized: boolean = false;
  private _initializing: boolean = false;
  private _ready: boolean = false;
  private _isIntentionalClose: boolean = false;
  // Add initialization promise tracking
  private _initPromise: Promise<boolean> | null = null;
  private _initAttempts: number = 0;
  
  // Events - these will now mostly relay events from the underlying transport
  public readonly onQuicReady = new OEvent<() => void>();
  public readonly onQuicError = new OEvent<(error: Error) => void>();
  // Add initialization complete event
  public readonly onInitComplete = new OEvent<(success: boolean) => void>();
  // QUICVC discovery event
  public readonly onQuicVCDiscovery = new OEvent<(data: Buffer, rinfo: any) => void>();
  // Specific message events can be handled by services registered directly with the transport
  // For example, DeviceDiscoveryModel will register its discovery service.
  // QuicModel itself might not need to emit onDiscoveryMessage etc. unless it's providing an abstraction.
  
  // Singleton instance
  private static _instance: QuicModel | null = null;
  
  private constructor(options?: QuicTransportOptions) {
    super();

    // Create transport and verify it's properly instantiated
    try {
      this._transport = new UdpServiceTransport(options); // Use local implementation
      console.log('[QuicModel] Created UdpServiceTransport instance:', {
        hasTransport: !!this._transport,
        transportType: this._transport?.constructor?.name,
        hasOnMethod: typeof (this._transport as any)?.on === 'function'
      });
      debug('Created QuicModel with new UdpServiceTransport instance');
    } catch (error) {
      console.error('[QuicModel] FATAL: Failed to create UdpServiceTransport:', error);
      throw new Error(`Failed to create transport: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Set up event listeners
    this.setupTransportEventListeners();
  }

  private setupQuicVCHandler(): void {
    console.log('[QuicModel] Setting up QUICVC packet handler');

    // Handle raw UDP messages for QUICVC packets
    console.log('[QuicModel] Setting up UDP message handler');
    this._transport.on('message', (data: Buffer, rinfo: any) => {
      console.log(`[QuicModel] 📡 Received UDP packet from ${rinfo.address}:${rinfo.port}, size: ${data.length} bytes`);
      
      // Check if this is a QUICVC packet
      if (data.length > 0) {
        const packetType = data[0] & 0x03; // Lower 2 bits contain packet type
        console.log(`[QuicModel] Packet type: ${packetType} (0x${packetType.toString(16)})`);
        
        // Log first 20 bytes for debugging
        const hexBytes = Array.from(data.slice(0, Math.min(20, data.length)))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(' ');
        console.log(`[QuicModel] First bytes: ${hexBytes}`);
        
        // Route QUIC-VC packets appropriately
        if (packetType === 0x00) { // INITIAL packet
          console.log(`[QuicModel] ✅ Detected QUICVC INITIAL packet`);
          
          // Emit discovery event for DeviceDiscoveryModel
          // DeviceDiscoveryModel will forward to QuicVCConnectionManager as needed
          console.log('[QuicModel] Emitting QUICVC discovery event');
          this.onQuicVCDiscovery.emit(data, rinfo);
        } else if (packetType === 0x01 || packetType === 0x02) { // HANDSHAKE or PROTECTED
          console.log(`[QuicModel] ℹ️ Detected QUICVC ${packetType === 0x01 ? 'HANDSHAKE' : 'PROTECTED'} packet`);
          
          // These need to go to QuicVCConnectionManager, emit them too
          // DeviceDiscoveryModel will forward them
          this.onQuicVCDiscovery.emit(data, rinfo);
        } else {
          console.log(`[QuicModel] ⚠️ Unknown packet type ${packetType}`);
        }
      } else {
        console.log(`[QuicModel] ⚠️ Received empty UDP packet from ${rinfo.address}:${rinfo.port}`);
      }
    });
    
    console.log('[QuicModel] QUICVC handler setup complete');
  }

  private setupTransportEventListeners(): void {
    // Remove any existing listeners first
    // Some transport implementations (e.g. UdpServiceTransport) expose removeAllListeners(),
    // but it is not part of the IQuicTransport interface.  Use optional chaining to avoid
    // TypeScript errors when the method is not present.
    (this._transport as any).removeAllListeners?.();

    // Relay events from the transport
    this._transport.on('ready', () => {
      this._ready = true;
      this.onQuicReady.emit();
      debug('[QuicModel] Underlying transport reported ready.');
      console.log('[QuicModel] Transport emitted ready event - QuicModel is now ready');
    });
    
    // Handle socket invalidation event (clean solution to socket 1 not found)
    this._transport.on('socket-invalidated', async (error: Error) => {
      console.log('[QuicModel] Socket invalidation detected, initiating clean recovery...');
      
      // Mark as not ready/initialized
      this._ready = false;
      this._initialized = false;
      
      // Try to reinitialize the transport
      console.log('[QuicModel] Attempting automatic transport reinitialization...');
      try {
        const success = await this.init();
        if (success) {
          console.log('[QuicModel] ✅ Successfully recovered from socket invalidation');
        } else {
          console.error('[QuicModel] ❌ Failed to recover from socket invalidation');
        }
      } catch (reinitError) {
        console.error('[QuicModel] ❌ Exception during socket invalidation recovery:', reinitError);
      }
    });
    
    this._transport.on('error', (error: Error) => {
      this.onQuicError.emit(error);
      // Also emit on general onError if this model has one (duck typing)
      const modelWithError = this as unknown as { onError?: { emit: (error: Error) => void } };
      if (modelWithError.onError && typeof modelWithError.onError.emit === 'function') {
        modelWithError.onError.emit(error);
      }
      debug('[QuicModel] Underlying transport error:', error);
    });
    this._transport.on('close', () => {
      this._ready = false;
      this._initialized = false; // Transport closed, so model is no longer initialized/ready
      debug('[QuicModel] Underlying transport reported close.');
      
      // Only warn if this wasn't an intentional close
      if (!this._isIntentionalClose) {
        console.warn('[QuicModel] WARNING: Transport closed unexpectedly - QuicModel marked as not initialized/ready');
        console.warn('[QuicModel] WARNING: This may indicate improper shutdown or transport lifecycle issues');
      }
      
      // Reset the flag
      this._isIntentionalClose = false;
    });
  }

  public static getInstance(options?: QuicTransportOptions): QuicModel {
    if (!QuicModel._instance) {
      // ALWAYS use port 49497 for discovery unless explicitly overridden
      const defaultOptions: QuicTransportOptions = {
        port: 49497,
        host: '0.0.0.0',
        ...options // Allow override if needed
      };
      console.log(`[QuicModel] Creating singleton with port ${defaultOptions.port}`);
      QuicModel._instance = new QuicModel(defaultOptions);
    }
    // If options are provided and instance exists, consider if/how to apply them.
    // For now, options are only used at first instantiation.
    return QuicModel._instance;
  }
  
  /**
   * Reset the singleton instance - useful for recovery from port conflicts
   * This will shut down the existing instance and clear the singleton reference
   */
  public static async resetInstance(): Promise<void> {
    if (QuicModel._instance) {
      console.log('[QuicModel] Resetting singleton instance...');
      try {
        // Shutdown the instance properly
        await QuicModel._instance.shutdown();
        
        // Reset UdpModel to clear all socket references
        const udpModel = UdpModel.getInstance();
        if (udpModel.isInitialized()) {
          console.log('[QuicModel] Shutting down UdpModel...');
          await udpModel.shutdown();
        }
        
        await QuicModel._instance.shutdown();
      } catch (error) {
        console.error('[QuicModel] Error during instance reset:', error);
      }
      QuicModel._instance = null;
    }
  }
  
  /**
   * Ensures that the QuicModel is initialized
   * @param options Optional transport options
   * @returns Promise resolving to the initialized QuicModel instance
   */
  public static async ensureInitialized(options?: QuicTransportOptions): Promise<QuicModel> {
    const instance = QuicModel.getInstance(options);
    if (!instance.isInitialized() || !instance.isReady()) {
      await instance.init(options);
    }
    return instance;
  }
  
  public async init(options?: QuicTransportOptions): Promise<boolean> {
    // If already initialized and ready, return success immediately
    if (this._initialized && this._ready) {
      debug('QuicModel already initialized and ready.');
      return true;
    }
    
    // If initialization already in progress, return existing promise
    if (this._initializing && this._initPromise) {
      console.log('[QuicModel] Initialization already in progress. Returning existing promise.');
      return this._initPromise;
    }
    
    // Before starting a new initialization, ensure any existing transport is properly cleaned up
    if (this._transport && !this._initialized) {
      console.log('[QuicModel] Cleaning up existing transport before re-initialization...');
      try {
        // Mark this as an intentional close to suppress warnings
        this._isIntentionalClose = true;
        
        // Gracefully close the existing transport **but keep the same instance** so that
        // any external references (e.g. DeviceDiscoveryModel, DiscoveryProtocol) remain valid.
        // UdpServiceTransport.close() will clear its socket and mark itself as un-initialized
        // which allows us to call listen() on the same object again.
        await this._transport.close().catch(err => {
          console.warn('[QuicModel] Error closing existing transport:', err);
        });

        // IMPORTANT: Do **NOT** replace the transport instance here!  Reusing the same
        // object preserves the reference held by other modules that were given the
        // transport earlier.  Creating a fresh instance breaks those references and
        // leads to hard-to-trace message loss.

        // Re-wire event listeners that were detached by close()
        this.setupTransportEventListeners();
      } catch (cleanupError) {
        console.warn('[QuicModel] Exception during pre-init cleanup:', cleanupError);
      }
    }
    
    // Start initialization
    this._initializing = true;
    this._ready = false;
    this._initialized = false;
    this._initAttempts++;
    console.log(`[QuicModel] Initializing (attempt ${this._initAttempts})...`);

    // Create initialization promise
    this._initPromise = (async () => {
      try {
        // UdpModel MUST be initialized before QuicModel
        const udpModel = UdpModel.getInstance();
        if (!udpModel.isInitialized()) {
          throw new Error('[QuicModel] FATAL: UdpModel must be initialized before QuicModel. Check platform initialization.');
        }
        console.log('[QuicModel] UdpModel is initialized (correct)');
        
        // Initialize the transport (ExpoQuicTransport uses listen instead of init)
        // ALWAYS use port 49497 for discovery unless explicitly overridden
        const listenOptions = {
          port: options?.port !== undefined ? options.port : 49497,
          host: options?.host || '0.0.0.0'
        };
        
        console.log(`[QuicModel] Attempting to bind transport to ${listenOptions.host}:${listenOptions.port}`);
        
        try {
          await this._transport.listen(listenOptions);
          console.log(`[QuicModel] ✅ Transport successfully bound to port ${listenOptions.port}`);
        } catch (bindError: any) {
          // If we get an "Address already in use" error, try with port 0 to let the OS assign a port
          if (bindError?.message?.includes('Address already in use') || bindError?.message?.includes('bind socket')) {
            console.warn(`[QuicModel] ⚠️ Port ${listenOptions.port} is already in use. Trying with OS-assigned port...`);
            listenOptions.port = 0; // Let OS assign an available port
            await this._transport.listen(listenOptions);
            console.log('[QuicModel] ✅ Successfully bound to OS-assigned port (not 49497!)');
          } else {
            console.error('[QuicModel] ❌ Failed to bind transport:', bindError);
            throw bindError;
          }
        }
        
        this._initialized = true;
        console.log('[QuicModel] Underlying transport init() successfully called.');
        
        // Set up QUICVC handler after transport is initialized
        this.setupQuicVCHandler();
        
        // Check if transport is already ready (might have emitted ready event synchronously)
        // Note: UdpServiceTransport now has isReady() method
        const transport = this._transport as any;
        if (this._transport.isInitialized() && typeof transport.isReady === 'function' && transport.isReady()) {
          console.log('[QuicModel] Transport is already ready, setting QuicModel ready state');
          this._ready = true;
          this.onQuicReady.emit();
        } else {
          console.log('[QuicModel] Waiting for ready event from transport...');
        }
        
        // Return true to indicate initialization process was started successfully
        return true;
      } catch (error) {
        this._initializing = false;
        this._ready = false;
        this._initialized = false;
        const err = error instanceof Error ? error : new Error(String(error));
        console.error('[QuicModel] Initialization failed:', err.message);
        
        // Explicitly ensure transport is closed to clean up any resources
        try {
          console.log('[QuicModel] Ensuring transport resources are cleaned up after initialization failure');
          await this._transport.close().catch(cleanupErr => {
            console.warn('[QuicModel] Error during transport cleanup:', cleanupErr);
          });
        } catch (cleanupError) {
          console.warn('[QuicModel] Exception during transport cleanup:', cleanupError);
        }
        
        // Emit error events
        this.onQuicError.emit(err);
        const modelWithError = this as unknown as { onError?: { emit: (error: Error) => void } };
        if (modelWithError.onError && typeof modelWithError.onError.emit === 'function') {
          modelWithError.onError.emit(err);
        }
        
        return false;
      } finally {
        this._initializing = false;
        this.onInitComplete.emit(this._initialized);
        this._initPromise = null;
      }
    })();
    
    return this._initPromise;
  }
  
  /**
   * Retry initialization after a failure
   * Useful for recovery after network changes or errors
   */
  public async retryInit(options?: QuicTransportOptions): Promise<boolean> {
    if (!this._initializing) {
      debug('No initialization in progress, calling init() instead of retryInit()');
      return this.init(options);
    }
    
    debug('Retrying QuicModel initialization...');
    this._transport = new UdpServiceTransport(options);
    return this.init(options);
  }
  
  /**
   * Exposes the underlying transport instance for direct use (e.g., by services).
   * This is also aliased as getTransport() for backward compatibility
   */
  public getTransport(): IQuicTransport {
    // No longer returns null, as an instance is created in constructor.
    // Readiness should be checked by the caller if operations depend on it.
    console.log('[QuicModel] getTransport() called, transport initialized:', this._transport.isInitialized());
    return this._transport;
  }
  
  /**
   * Provides direct access to the transport's send method.
   * Prefer registering services with the transport for typed message handling.
   */
  public async send(data: Buffer | Uint8Array | string, address: string, port: number): Promise<void> {
    // Check if we're ready
    if (!this.isReady()) {
      console.warn('[QuicModel] WARNING: Transport not ready for sending - this indicates an unexpected state');
      console.log('[QuicModel] Attempting to reinitialize transport...');
      
      // Try to reinitialize
      const initialized = await this.init();
      if (!initialized || !this.isReady()) {
        throw new Error('QuicModel (and its transport) is not ready for sending.');
      }
      
      console.warn('[QuicModel] WARNING: Transport had to be reinitialized - this should not happen in normal operation');
    }
    
    try {
      return await this._transport.send(data, address, port);
    } catch (error: any) {
      // If we get a socket not found error, it means the UDP layer was reset
      // The clean solution is to mark our transport as invalid and reinitialize
      if (error?.message?.includes('Socket') && error?.message?.includes('not found')) {
        console.log('[QuicModel] Socket invalidated (UDP layer was reset), reinitializing transport...');
        this._ready = false;
        this._initialized = false;
        
        const reinitialized = await this.init();
        if (reinitialized) {
          return this._transport.send(data, address, port);
        } else {
          throw new Error('Transport reinitialization failed after socket invalidation');
        }
      }
      
      // Re-throw the error
      throw error;
    }
  }

  /**
   * Adds a service handler directly to the underlying transport.
   * @param serviceType The service type identifier.
   * @param handler The handler function for incoming messages of this service type.
   */
  public addService(serviceType: number, handler: (data: any, rinfo: UdpRemoteInfo) => void): void {
    this._transport.addService(serviceType, handler);
    debug(`[QuicModel] Service ${serviceType} added to underlying transport.`);
  }

  public removeService(serviceType: number): void {
    this._transport.removeService(serviceType);
    debug(`[QuicModel] Service ${serviceType} removed from underlying transport.`);
  }

  public async shutdown(): Promise<void> {
    debug('[QuicModel] Shutting down...');
    if (this._transport) {
      this._isIntentionalClose = true;
      await this._transport.close();
    }
    this._ready = false;
    this._initialized = false;
    this._initializing = false;
    
    // Release our reference to UdpModel
    UdpModel.releaseInstance();
    
    debug('[QuicModel] Shutdown complete.');
  }

  public isInitialized(): boolean {
    // Check both our internal flag and the transport's status if possible
    if (this._transport && typeof this._transport.isInitialized === 'function') {
      // If the transport has an isInitialized method, use that as the source of truth
      return this._initialized && this._transport.isInitialized();
    }
    // Fall back to just our internal flag if transport doesn't expose isInitialized
    return this._initialized;
  }

  public isReady(): boolean {
    return this._ready;
  }

  /**
   * Helper method to create a UDP socket directly
   * This method was marked for removal, but apparently is still used by some code
   * Keeping it as a compatibility layer
   */
  public async createUdpSocket(options: UdpSocketOptions): Promise<UdpSocket> {
    debug('[QuicModel] Creating UDP socket via UdpModel');
    
    const udpModel = UdpModel.getInstance();
    if (!udpModel.isInitialized()) {
      const initialized = await udpModel.init();
      if (!initialized) {
        throw new Error('Failed to initialize UdpModel');
      }
    }
    
    try {
      return await udpModel.createSocket(options);
    } catch (error) {
      console.error('[QuicModel] Error creating UDP socket:', error);
      throw error;
    }
  }

  /**
   * Run diagnostics on the underlying transport
   */
  public async runDiagnostics(): Promise<string> {
    if (!this._transport) {
      return '❌ No transport available';
    }
    
    try {
      const transportDiagnostics = await this._transport.runDiagnostics();
      return `QuicModel Status:
- Initialized: ${this._initialized}
- Ready: ${this._ready}
- Initializing: ${this._initializing}

Transport Diagnostics:
${transportDiagnostics}`;
    } catch (error) {
      return `Error running diagnostics: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
} 