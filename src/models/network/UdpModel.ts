/**
 * UdpModel - Provides UDP socket functionality for React Native
 * 
 * This model wraps the native UDPDirectModule to provide a TypeScript interface
 * for working with UDP sockets in a cross-platform way.
 */

import { NativeModules, Platform, NativeEventEmitter, TurboModuleRegistry, DeviceEventEmitter } from 'react-native';
import Debug from 'debug';
import { createError } from '@refinio/one.core/lib/errors.js';

// Import the TurboModule via the package index
import UDPDirectModule from 'react-native-udp-direct';

// Event types for the new RCTEventEmitter architecture
export type UdpMessageEvent = {
  socketId: string;
  data: string;
  address: string;
  port: number;
  family: string;
  bufferId?: number; // For DirectBuffer support
};

export type UdpErrorEvent = {
  socketId: string;
  message?: string; // For backward compatibility
  error?: string;   // From TurboModule events
  tag?: number;     // For send errors
};

export type UdpCloseEvent = {
  socketId: string;
};

// Enable debug logging
const debug = Debug('one:udp:model');

// Socket options interface
export interface UdpSocketOptions {
  type: 'udp4' | 'udp6';
  reuseAddr?: boolean;
  reusePort?: boolean;
  broadcast?: boolean;
  debug?: boolean;
  debugLabel?: string;
}

// Socket binding options interface
export interface UdpBindOptions {
  address?: string;
  port: number;
}

// Remote socket information
export interface UdpRemoteInfo {
  address: string;
  port: number;
  family: string;
  size?: number;
}

// UDP Socket interface
export interface UdpSocket extends EventEmitter {
  id: number | string;
  
  // Socket operations
  bind(port: number, address?: string): Promise<void>;
  close(): Promise<void>;
  send(data: Uint8Array | string, port: number, address: string): Promise<void>;
  
  // Socket options
  setBroadcast(flag: boolean): Promise<void>;
  setReuseAddr(flag: boolean): Promise<void>;
  setReusePort?(flag: boolean): Promise<void>; // Optional for platforms that don't support it
  
  // Multicast operations - optional because not all platforms implement these
  addMembership?(multicastAddress: string, interfaceAddress?: string): Promise<void>;
  dropMembership?(multicastAddress: string, interfaceAddress?: string): Promise<void>;
  setMulticastTTL?(ttl: number): Promise<void>;
  setMulticastLoopback?(flag: boolean): Promise<void>;

  // Additional socket option for unicast TTL (supported on some platforms)
  setTTL?(ttl: number): Promise<void>;

  // Socket information
  address(): { address: string; port: number; family: string } | null;
}

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
 * UdpModel - Singleton model for UDP networking
 * 
 * This is a singleton class that wraps the native UDPDirectModule
 */
export class UdpModel {
  private static instance: UdpModel;
  private static referenceCount: number = 0;
  // Change to false initially - will be initialized after login
  private initialized: boolean = false;
  // Use timestamp-based counter to avoid socket ID reuse after native reset
  private socketCounter: number = Math.floor(Date.now() / 1000) % 100000;
  private sockets: Map<number | string, UdpSocket> = new Map();
  private nativeModule: any = null; // Initialize to null
  private eventListeners: any[] = []; // Array to hold DeviceEventEmitter listeners
  private moduleCreationTime: number | null = null; // Track native module creation time
  
  // CRITICAL: Add destruction safety flags to prevent crashes
  private isShuttingDown: boolean = false;
  private isDestroyed: boolean = false;
  private shutdownPromise: Promise<void> | null = null;
  
  // Add initialization promise
  private initPromise: Promise<boolean> | null = null;
  
  /**
   * Get the singleton instance with reference counting
   */
  public static getInstance(): UdpModel {
    if (!UdpModel.instance) {
      UdpModel.instance = new UdpModel();
    }
    UdpModel.referenceCount++;
    console.log(`[UdpModel] Reference count increased to: ${UdpModel.referenceCount}`);
    return UdpModel.instance;
  }
  
  /**
   * Release a reference to the singleton
   */
  public static releaseInstance(): void {
    if (UdpModel.referenceCount > 0) {
      UdpModel.referenceCount--;
      console.log(`[UdpModel] Reference count decreased to: ${UdpModel.referenceCount}`);
    }
  }
  
  /**
   * Reset the singleton instance - only if no references exist
   */
  public static async resetInstance(): Promise<void> {
    if (UdpModel.instance) {
      if (UdpModel.referenceCount > 0) {
        console.warn(`[UdpModel] Cannot reset instance - ${UdpModel.referenceCount} references still exist`);
        return;
      }
      
      console.log('[UdpModel] Resetting singleton instance (no references)...');
      try {
        await UdpModel.instance.shutdown();
      } catch (error) {
        console.error('[UdpModel] Error during instance reset:', error);
      }
      UdpModel.instance = null;
      UdpModel.referenceCount = 0;
    }
  }
  
  /**
   * Force reset the singleton instance - only for emergency cleanup
   */
  public static async forceReset(): Promise<void> {
    if (UdpModel.instance) {
      console.warn(`[UdpModel] Force resetting instance (had ${UdpModel.referenceCount} references)`);
      try {
        await UdpModel.instance.shutdown();
      } catch (error) {
        console.error('[UdpModel] Error during force reset:', error);
      }
      UdpModel.instance = null;
      UdpModel.referenceCount = 0;
    }
  }
  
  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    debug('Creating UdpModel instance - will be initialized after login via init()');
  }
  
  /**
   * Clear all socket references when native module is reset
   * This prevents "Socket not found" crashes
   */
  private clearAllSockets(): void {
    console.log('[UdpModel] Clearing all socket references due to native module reset');
    this.sockets.forEach(socket => {
      socket.removeAllListeners();
    });
    this.sockets.clear();
    this.socketCounter = 0;
  }
  
  /**
   * Check if the model is in a safe state for operations
   */
  private checkSafeState(): boolean {
    if (this.isDestroyed) {
      console.warn('[UdpModel] Operation attempted on destroyed instance');
      return false;
    }
    if (this.isShuttingDown) {
      console.warn('[UdpModel] Operation attempted during shutdown');
      return false;
    }
    return true;
  }
  
  private _logResolvedNativeModuleDetails(moduleInstance: any, source: string): void {
    if (!moduleInstance) {
      debug(`[${source}] Native module instance is null or undefined. Cannot log details.`);
      console.warn(`[UdpModel][${source}] UDPDirectModule native instance is not available for detailed logging.`);
      return;
    }

    debug(`[${source}] Logging details for resolved UDPDirectModule instance:`, moduleInstance);
    console.log(`[UdpModel][${source}] --- Start UDPDirectModule Details ---`);

    const allProps: Record<string, string> = {};
    for (const key in moduleInstance) {
      try {
        allProps[key] = typeof moduleInstance[key];
      } catch (e) {
        allProps[key] = 'Error accessing property type';
      }
    }
    console.log(`[UdpModel][${source}] All enumerable properties (name: type):`, JSON.stringify(allProps, null, 2));

    // Check for specific key methods based on NativeUdpModule.ts spec
    const expectedMethods: string[] = [
      'createSocket', 'bind', 'close', 'closeAllSockets', 'send',
      'getLocalIPAddresses', 'address', 'setBroadcast', 'setTTL',
      'setMulticastTTL', 'setMulticastLoopback', 'addMembership', 'dropMembership',
      'setDataEventHandler', 'addListener', 'removeListeners', 'getConstants'
    ];

    console.log(`[UdpModel][${source}] Checking for key method presence and type:`);
    expectedMethods.forEach(methodName => {
      if (methodName in moduleInstance) {
        console.log(`[UdpModel][${source}]   - ${methodName}: vorhanden (Typ: ${typeof moduleInstance[methodName]})`);
      } else {
        console.log(`[UdpModel][${source}]   - ${methodName}: NICHT vorhanden`);
      }
    });
    console.log(`[UdpModel][${source}] --- End UDPDirectModule Details ---`);
  }
  
  /**
   * Initialize the UDP model
   * This is called during the post-login model initialization flow
   */
  public async init(): Promise<boolean> {
    if (!this.checkSafeState()) {
      throw new Error('UdpModel is not in a safe state for initialization');
    }
    
    if (this.initPromise) {
      debug('UdpModel initialization already in progress, waiting...');
      return this.initPromise;
    }
    
    debug('Initializing UdpModel...');
    
    this.initPromise = (async () => {
      try {
        // Get the TurboModule directly
        const globalAny = global as any;
        this.nativeModule = UDPDirectModule;
        
        if (!this.nativeModule) {
          console.warn('[UdpModel] Native UDPDirectModule not found. UDP functionality will be disabled.');
          this.initialized = false;
          return false;
        }
        
        // Debug: Check what methods are available on the native module
        console.log('[UdpModel] Native module methods:', Object.keys(this.nativeModule));
        console.log('[UdpModel] setBroadcast type:', typeof this.nativeModule.setBroadcast);

        // Force TurboModule initialization by calling methods that trigger JSI
        // First try getConstants
        if (typeof this.nativeModule.getConstants === 'function') {
          debug('Triggering TurboModule initialization via getConstants...');
          try {
            const constants = this.nativeModule.getConstants();
            debug('TurboModule constants:', constants);
          } catch (e) {
            console.warn('[UdpModel] Failed to get constants from TurboModule:', e);
          }
        }
        
        // Also call addListener to ensure JSI gets installed (this has runtime access)
        if (typeof this.nativeModule.addListener === 'function') {
          debug('Calling addListener to trigger JSI installation...');
          try {
            // Add a dummy listener to trigger JSI installation
            this.nativeModule.addListener('onMessage');
            this.nativeModule.addListener('onError');
            this.nativeModule.addListener('onClose');
          } catch (e) {
            console.warn('[UdpModel] Failed to add listeners:', e);
          }
        }
        
        // Give JSI bindings a moment to install
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Check if JSI bindings are available
        if (globalAny._udpJSI) {
          console.log('[UdpModel] ✅ JSI bindings installed successfully');
        } else {
          console.warn('[UdpModel] ⚠️ JSI bindings not available after initialization attempts');
        }

        // Remove old event listeners before adding new ones
        this.eventListeners.forEach(sub => sub.remove());
        this.eventListeners = [];

        // Set up event listeners using DeviceEventEmitter
        debug('Setting up global event listeners via DeviceEventEmitter');

        // Subscribe to events
        const messageSubscription = DeviceEventEmitter.addListener('onMessage', (event: UdpMessageEvent) => {
          const socket = this.sockets.get(event.socketId);
          if (socket) {
            // Decode base64 to Uint8Array without Buffer
            const binaryString = atob(event.data);
            const dataBuffer = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              dataBuffer[i] = binaryString.charCodeAt(i);
            }
            socket.emit('message', dataBuffer, { address: event.address, port: event.port, family: event.family, size: dataBuffer.length });
          }
        });
        this.eventListeners.push(messageSubscription);
        debug('Subscribed to onMessage events');

        const errorSubscription = DeviceEventEmitter.addListener('onError', (event: UdpErrorEvent) => {
          const socket = this.sockets.get(event.socketId);
          if (socket) {
            socket.emit('error', createError('EUDP', { message: event.message || 'Unknown native UDP error' }));
          }
        });
        this.eventListeners.push(errorSubscription);
        debug('Subscribed to onError events');

        const closeSubscription = DeviceEventEmitter.addListener('onClose', (event: UdpCloseEvent) => {
          const socket = this.sockets.get(event.socketId);
          if (socket) {
            socket.emit('close');
          }
        });
        this.eventListeners.push(closeSubscription);
        debug('Subscribed to onClose events');
          
          this.initialized = true;
        debug('UdpModel initialized successfully with DeviceEventEmitter.');
          return true;

      } catch (error) {
        console.error('[UdpModel] CRITICAL: Initialization failed:', error);
        this.initialized = false;
        this.nativeModule = null;
        return false;
      } finally {
        this.initPromise = null;
      }
    })();
    
    return this.initPromise;
  }
  
  /**
   * Check if the UDP model is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }
  
  /**
   * Check if the native module is available
   */
  public isNativeModuleAvailable(): boolean {
    if (this.nativeModule) {
        debug('Native module reference is available in UdpModel instance (checked via this.nativeModule).');
        return true;
    }
    // Check if the TurboModule is available
    try {
      if (UDPDirectModule) {
          debug('Native module resolved on-the-fly by isNativeModuleAvailable().');
          return true;
      }
    } catch (e) {
      debug('Error checking native module availability: %s', (e as Error).message);
    }
    debug('Native module is NOT available (checked by isNativeModuleAvailable).');
    return false;
  }
  
  /**
   * Create a new UDP socket
   */
  public async createSocket(options: UdpSocketOptions): Promise<UdpSocket> {
    if (!this.initialized) {
      throw createError('EUDP', { message: 'UdpModel is not initialized, cannot create socket.' });
    }
    
    const globalAny = global as any;
    
    // Check if JSI is available
    if (!globalAny._udpJSI || typeof globalAny._udpJSI.createSocket !== 'function') {
      throw createError('EUDP', { message: 'UDP JSI bindings not available. Native module not properly initialized.' });
    }
    
    // Use JSI to create socket
    console.log('[UdpModel] Calling _udpJSI.createSocket with options:', {
      type: options.type || 'udp4',
      reuseAddr: options.reuseAddr || false,
      reusePort: options.reusePort || false,
      broadcast: options.broadcast || false
    });
    
    let socketId: string;
    let moduleTime: number | undefined;
    
    try {
      const result = globalAny._udpJSI.createSocket({
        type: options.type || 'udp4',
        reuseAddr: options.reuseAddr || false,
        reusePort: options.reusePort || false,
        broadcast: options.broadcast || false
      });
      
      // Handle both old (string) and new (object with moduleCreationTime) formats
      if (typeof result === 'string') {
        socketId = result;
        console.log('[UdpModel] _udpJSI.createSocket returned string ID:', socketId);
      } else {
        socketId = result.socketId;
        moduleTime = result.moduleCreationTime;
        console.log('[UdpModel] _udpJSI.createSocket returned object with ID:', socketId, 'moduleTime:', moduleTime);
        
        // Check for module recreation
        if (moduleTime !== undefined) {
          if (this.moduleCreationTime !== null && Math.abs(moduleTime - this.moduleCreationTime) > 1) {
            console.error('[UdpModel] NATIVE MODULE WAS RECREATED! Old time:', this.moduleCreationTime, 'New time:', moduleTime);
            console.log('[UdpModel] Clearing all stale socket references...');
            
            // Clear all existing sockets as they're now invalid
            this.sockets.forEach((socket, id) => {
              console.log(`[UdpModel] Invalidating stale socket: ${id}`);
              socket.removeAllListeners();
            });
            this.sockets.clear();
            
            // Update module creation time
            this.moduleCreationTime = moduleTime;
          } else if (this.moduleCreationTime === null) {
            // First socket creation
            this.moduleCreationTime = moduleTime;
            console.log('[UdpModel] Recording initial module creation time:', moduleTime);
          }
        }
      }
    } catch (error) {
      console.error('[UdpModel] _udpJSI.createSocket threw error:', error);
      throw error;
    }
    
    if (!socketId || typeof socketId !== 'string') {
      throw createError('EUDP', { message: `Failed to create JSI socket. Got ${typeof socketId}: ${socketId}` });
    }

    const socketWrapper = this.createSocketWrapper(socketId, options);
    this.sockets.set(socketId, socketWrapper);

    debug(`Socket created with ID: ${socketId} using JSI`);
    return socketWrapper;
  }
  
  private createSocketWrapper(socketId: string, options: UdpSocketOptions): UdpSocket {
    const socketWrapperInstance = new EventEmitter() as UdpSocket;
    socketWrapperInstance.id = socketId;
    
    // Track socket creation time to detect stale sockets
    const createdAt = Date.now();
        
    // Socket state
    let addressInfo: { address: string; port: number; family: string } | null = null;
    
    // Bind the socket to a port and address
    socketWrapperInstance.bind = async (port: number, address: string = '0.0.0.0'): Promise<void> => {
      const globalAny = global as any;
      if (!globalAny._udpJSI || typeof globalAny._udpJSI.bind !== 'function') {
        throw createError('EUDP', { message: 'JSI bind function not available' });
      }
      
      // Use JSI to bind
      try {
        // NOTE: bind() returns a Promise<BindInfoSpec>, so we must await it to properly handle
        // binding errors (e.g., EADDRINUSE) instead of letting an unhandled promise rejection
        // crash the JS runtime.
        await globalAny._udpJSI.bind(socketId, port, address);
        debug(`Socket ${socketId} bound to ${address}:${port} via JSI`);
      } catch (error) {
        console.error(`[UdpModel] JSI bind failed for socket ${socketId}:`, error);
        const errMsg = (typeof error === 'object' && error && 'message' in error)
          ? (error as any).message
          : String(error);
        throw createError('EUDP', { message: `JSI bind failed: ${errMsg}` });
      }
      
      // Set up event handlers using JSI
      console.log(`[UdpModel] Setting up JSI event handlers for socket ${socketId}`);
      
      // Check for iOS version to apply workarounds
      const iosVersion = Platform.OS === 'ios' ? parseInt(Platform.Version, 10) : 0;
      console.log(`[UdpModel] Platform: ${Platform.OS}, Version: ${Platform.Version}, Parsed iOS version: ${iosVersion}`);
      
      // Temporary: Skip event handlers on iOS 18.5+ to test if this prevents crash
      const SKIP_EVENT_HANDLERS = Platform.OS === 'ios' && iosVersion >= 18.5;
      
      if (SKIP_EVENT_HANDLERS) {
        console.warn(`[UdpModel] SKIPPING JSI event handlers on iOS ${Platform.Version} due to crash issue`);
        // Don't register event handlers - we can still send but won't receive
      } else if (globalAny._udpJSI.setEventHandler) {
        console.log(`[UdpModel] _udpJSI.setEventHandler is available, registering handlers`);
        try {
          globalAny._udpJSI.setEventHandler(socketId, {
            onMessage: (event: any) => {
              // Wrap in try-catch for iOS 26 beta compatibility
              try {
                console.log(`[UdpModel] JSI onMessage triggered for socket ${socketId} from ${event.address}:${event.port}`);
                debug(`JSI onMessage for socket ${socketId}`);
                
                // Check if event.data is an ArrayBuffer
                if (event.data instanceof ArrayBuffer) {
                  console.log(`[UdpModel] Received ArrayBuffer of size ${event.data.byteLength}`);
                  const dataBuffer = new Uint8Array(event.data);
                  
                  // Defer emit to next tick to avoid potential iOS 18.5+ threading issues
                  setImmediate(() => {
                    try {
                      socketWrapperInstance.emit('message', dataBuffer, { 
                        address: event.address, 
                        port: event.port, 
                        family: 'IPv4',
                        size: dataBuffer.length 
                      });
                      console.log(`[UdpModel] Message event emitted successfully`);
                    } catch (emitError) {
                      console.error(`[UdpModel] Error emitting message event:`, emitError);
                    }
                  });
                } else {
                  console.warn(`[UdpModel] Unexpected data type in onMessage: ${typeof event.data}`);
                }
              } catch (error) {
                console.error(`[UdpModel] Error in JSI onMessage handler:`, error);
              }
            },
            onError: (event: any) => {
              try {
                debug(`JSI onError for socket ${socketId}: ${event.error}`);
                socketWrapperInstance.emit('error', createError('EUDP', { message: event.error || 'Unknown JSI error' }));
              } catch (error) {
                console.error(`[UdpModel] Error in JSI onError handler:`, error);
              }
            },
            onClose: (event: any) => {
              try {
                debug(`JSI onClose for socket ${socketId}`);
                socketWrapperInstance.emit('close');
              } catch (error) {
                console.error(`[UdpModel] Error in JSI onClose handler:`, error);
              }
            }
          });
          debug(`Socket ${socketId} JSI event handlers registered`);
        } catch (error) {
          console.error(`[UdpModel] Failed to set JSI event handler:`, error);
          // Don't throw - we can still use the socket for sending
        }
      }
    };
    
    // Close the socket
    socketWrapperInstance.close = async (): Promise<void> => {
      const globalAny = global as any;
      if (globalAny._udpJSI && typeof globalAny._udpJSI.close === 'function') {
        try {
          globalAny._udpJSI.close(socketId);
        } catch (error) {
          console.warn('[UdpModel] Error closing socket via JSI:', error);
        }
      }
      this.sockets.delete(socketId);
    };

    // Add recursion guard
    let sendInProgress = false;
    
    socketWrapperInstance.send = async (data: Uint8Array | string, port: number, address: string): Promise<void> => {
      // Check for recursion
      if (sendInProgress) {
        console.error('[UdpModel.send] RECURSION DETECTED! Send already in progress');
        throw createError('EUDP', { message: 'Recursive send detected - possible infinite loop' });
      }
      
      sendInProgress = true;
      
      try {
        // Use zero-copy JSI interface
        const globalAny = global as any;
        if (!globalAny.udpSendDirect || typeof globalAny.udpSendDirect !== 'function') {
          throw createError('EUDP', { message: 'JSI udpSendDirect not available. Native module not properly initialized.' });
        }
        
        // Validate socket still exists - if native layer was reset, socket won't exist
        // This prevents crashes from "Socket X not found for sending"
        if (!this.sockets.has(socketId)) {
          throw createError('EUDP', { message: `Socket ${socketId} no longer exists in JavaScript layer` });
        }
        
        try {
        let bufferToSend: ArrayBuffer;
        let debugInfo: any = {};
        
        // Try to detect if native module was reset by checking if our socket ID makes sense
        // Native module starts socket IDs at 1 and increments
        // If we have socket "1" but native was reset, it won't exist
        const socketIdNum = parseInt(socketId);
        if (socketIdNum === 1) {
          // Socket ID 1 is the first socket created after native module init
          // If we're trying to use it, but native was reset, this will crash
          console.warn(`[UdpModel] WARNING: Attempting to use socket ID 1 - this often crashes after native reset`);
          
          // Try a test to see if native module is responsive
          try {
            // If JSI is not available, native was definitely reset
            if (!globalAny._udpJSI || !globalAny.udpSendDirect) {
              console.error('[UdpModel] Native module was reset! JSI functions not available');
              this.clearAllSockets();
              throw new Error('Native UDP module was reset - all sockets invalidated');
            }
          } catch (testError) {
            console.error('[UdpModel] Native module test failed:', testError);
            this.clearAllSockets();
            throw new Error('Native UDP module is not responding');
          }
        }
        
        if (data instanceof Uint8Array) {
          // Always use zero-copy with offset and length
          console.log(`[UdpModel] Attempting send on socket ${socketId} to ${address}:${port}`);
          
          try {
            globalAny.udpSendDirect(socketId, data.buffer, data.byteOffset, data.byteLength, port, address);
          } catch (nativeError: any) {
            console.error(`[UdpModel] Native send error for socket ${socketId}:`, nativeError);
            if (nativeError?.message?.includes('not found')) {
              console.error('[UdpModel] Socket was not found in native layer, clearing JavaScript reference');
              this.sockets.delete(socketId);
            }
            throw nativeError;
          }
        } else if (typeof data === 'string') {
          // Convert string to Uint8Array then send
          const encoder = new TextEncoder();
          const uint8Array = encoder.encode(data);
          
          try {
            globalAny.udpSendDirect(socketId, uint8Array.buffer, uint8Array.byteOffset, uint8Array.byteLength, port, address);
          } catch (nativeError: any) {
            console.error(`[UdpModel] Native send error for socket ${socketId}:`, nativeError);
            if (nativeError?.message?.includes('not found')) {
              console.error('[UdpModel] Socket was not found in native layer, clearing JavaScript reference');
              this.sockets.delete(socketId);
            }
            throw nativeError;
          }
        } else {
          throw createError('EUDP', { message: 'Invalid data type for send' });
        }
        
      } catch (error) {
        const errMsg = (typeof error === 'object' && error && 'message' in error)
          ? (error as any).message
          : String(error);
        
        // Check if it's a socket not found error from native layer
        if (errMsg.includes('Socket') && errMsg.includes('not found')) {
          console.error('[UdpModel] Socket was invalidated by native module reset:', socketId);
          // Remove this invalid socket from our tracking
          this.sockets.delete(socketId);
          throw createError('EUDP', { 
            message: `Socket ${socketId} invalidated - native module was reset`,
            code: 'SOCKET_INVALIDATED'
          });
        }
        
        throw createError('EUDP', { 
          message: `Failed to send UDP packet: ${errMsg}`,
          originalError: error as any 
        });
      }
      } finally {
        // Always reset the flag
        sendInProgress = false;
      }
    };

    socketWrapperInstance.setBroadcast = async (flag: boolean): Promise<void> => {
      const globalAny = global as any;
      if (globalAny._udpJSI && typeof globalAny._udpJSI.setBroadcast === 'function') {
        // Use JSI to set broadcast mode
        try {
          globalAny._udpJSI.setBroadcast(socketId, flag);
          debug(`Socket ${socketId} broadcast mode set to ${flag} via JSI`);
        } catch (error) {
          console.error(`[UdpModel] Failed to set broadcast mode for socket ${socketId}:`, error);
          throw createError('EUDP', { message: `Failed to set broadcast: ${error}` });
        }
      } else {
        // Fallback if JSI not available
        console.warn(`[UdpModel] JSI setBroadcast not available for socket ${socketId}`);
      }
    };

    socketWrapperInstance.addMembership = async (multicastAddress: string, interfaceAddress?: string): Promise<void> => {
        if (!this.nativeModule || typeof this.nativeModule.addMembership !== 'function') {
            throw createError('EUDP', { message: 'addMembership not supported by native module' });
        }
        await this.nativeModule.addMembership(socketId, multicastAddress, interfaceAddress || '');
    };

    socketWrapperInstance.dropMembership = async (multicastAddress: string, interfaceAddress?: string): Promise<void> => {
        if (!this.nativeModule || typeof this.nativeModule.dropMembership !== 'function') {
            throw createError('EUDP', { message: 'dropMembership not supported by native module' });
        }
        await this.nativeModule.dropMembership(socketId, multicastAddress, interfaceAddress || '');
    };
    
    socketWrapperInstance.setTTL = async (ttl: number): Promise<void> => {
        if (!this.nativeModule || typeof this.nativeModule.setTTL !== 'function') {
            throw createError('EUDP', { message: 'setTTL not supported by native module' });
        }
        await this.nativeModule.setTTL(socketId, ttl);
    };
    
    socketWrapperInstance.setMulticastTTL = async (ttl: number): Promise<void> => {
        if (!this.nativeModule || typeof this.nativeModule.setMulticastTTL !== 'function') {
            throw createError('EUDP', { message: 'setMulticastTTL not supported by native module' });
        }
        await this.nativeModule.setMulticastTTL(socketId, ttl);
    };
    
    socketWrapperInstance.setMulticastLoopback = async (flag: boolean): Promise<void> => {
        if (!this.nativeModule || typeof this.nativeModule.setMulticastLoopback !== 'function') {
            throw createError('EUDP', { message: 'setMulticastLoopback not supported by native module' });
        }
        await this.nativeModule.setMulticastLoopback(socketId, flag);
    };
    
    socketWrapperInstance.setReuseAddr = async (flag: boolean): Promise<void> => {
        // Reuse address is set during socket creation, this is a no-op for compatibility
        debug('setReuseAddr called but is handled during socket creation');
        return Promise.resolve();
    };
    
    socketWrapperInstance.setReusePort = async (flag: boolean): Promise<void> => {
        // Reuse port is set during socket creation, this is a no-op for compatibility
        debug('setReusePort called but is handled during socket creation');
        return Promise.resolve();
    };
    
    socketWrapperInstance.address = (): { address: string; port: number; family: string } | null => {
        return addressInfo;
    };
    
    // All listeners are now handled globally by DeviceEventEmitter, so no need to add per-socket listeners here.

    return socketWrapperInstance;
  }

  /**
   * Get a socket by ID
   */
  public getSocket(socketId: number | string): UdpSocket | undefined {
    return this.sockets.get(socketId);
  }

  /**
   * Shutdown the UDP model
   * Closes all open sockets and releases resources
   */
  public async shutdown(): Promise<void> {
    if (!this.checkSafeState()) {
      debug('Shutdown called on an unsafe or already destroyed instance');
      return this.shutdownPromise || Promise.resolve();
    }
    
      if (this.shutdownPromise) {
      debug('Shutdown already in progress, waiting for completion');
        return this.shutdownPromise;
    }
    
    this.isShuttingDown = true;
    debug('Shutting down UdpModel...');
    
    this.shutdownPromise = (async () => {
      try {
        if (this.nativeModule && typeof this.nativeModule.closeAllSockets === 'function') {
          debug('Closing all native sockets...');
          await this.nativeModule.closeAllSockets();
          debug('All native sockets closed.');
        }

        // Clear local socket references
        this.sockets.forEach(sock => sock.removeAllListeners());
        this.sockets.clear();
        
        // Clean up event listeners
        if (this.eventListeners.length > 0) {
          this.eventListeners.forEach(sub => {
            if (sub && typeof sub.remove === 'function') {
              sub.remove();
            }
          });
          this.eventListeners = [];
        }
        
        this.initialized = false;
        
      } catch (error) {
        debug('Error during UdpModel shutdown: %o', error);
        console.warn('[UdpModel] Error during shutdown:', error);
      } finally {
        this.isDestroyed = true;
        this.isShuttingDown = false;
        debug('UdpModel shutdown complete.');
      }
    })();
    
    return this.shutdownPromise;
  }

  /**
   * Get the count of active sockets
   */
  public getSocketCount(): number {
    return this.sockets.size;
  }

  /**
   * Get local IP addresses
   */
  public async getLocalIPAddresses(): Promise<string[]> {
    if (!this.initialized || !this.nativeModule) {
      throw new Error('UdpModel not initialized');
    }

    try {
      if (typeof this.nativeModule.getLocalIPAddresses === 'function') {
        const addresses = await this.nativeModule.getLocalIPAddresses();
        debug('Retrieved local IP addresses:', addresses);
        return Array.isArray(addresses) ? addresses : [];
      } else {
        console.warn('[UdpModel] getLocalIPAddresses not available in native module');
        return [];
      }
    } catch (error) {
      debug('Error getting local IP addresses: %o', error);
      console.error('[UdpModel] Error getting local IP addresses:', error);
      return [];
    }
  }

  /**
   * Diagnose socket issues - useful for debugging
   */
  public diagnoseSocket(socketId: number | string): Promise<string> {
    if (!this.nativeModule || typeof this.nativeModule.diagnoseSocket !== 'function') {
      return Promise.resolve('Socket diagnostics not supported');
    }
    
    try {
      return this.nativeModule.diagnoseSocket(socketId);
    } catch (error) {
      return Promise.resolve(`Error diagnosing socket: ${String(error)}`);
    }
  }

  /**
   * Force release a port from registry
   * This is a static method to ensure it can be called even if model initialization fails
   */
  public static async forceReleasePort(port: number): Promise<{ released: boolean; closedCount: number }> {
    // Get the module instance for this static method using the wrapper
    let nativeModule: any = null;
    try {
      nativeModule = UDPDirectModule;
    } catch (error) {
      console.warn(`[UdpModel] Could not get module for forceReleasePort:`, error);
      return { released: false, closedCount: 0 };
    }
    
    if (nativeModule && typeof nativeModule.forciblyReleasePort === 'function') {
      try {
        debug(`Calling native forciblyReleasePort for port ${port}`);
        const result = await nativeModule.forciblyReleasePort(port);
        debug(`Native forciblyReleasePort for port ${port} result: ${JSON.stringify(result)}`);
        
        // The native module returns { released: boolean, closedCount: number }
        if (result && typeof result === 'object' && 
            typeof result.released === 'boolean' && 
            typeof result.closedCount === 'number') {
          return result;
        }
        
        console.warn(`[UdpModel] Native forciblyReleasePort for port ${port} returned unexpected result format:`, result);
        return { released: false, closedCount: 0 };
      } catch (error) {
        console.warn(`[UdpModel] Error calling native forciblyReleasePort for port ${port}:`, error);
        return { released: false, closedCount: 0 };
      }
    }
    debug(`Native forciblyReleasePort function not found for port ${port}.`);
    return { released: false, closedCount: 0 };
  }
}

// Export singleton instance accessor
export default UdpModel.getInstance;