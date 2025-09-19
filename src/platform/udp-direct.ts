/**
 * UDP Direct Buffer Platform Interface
 *
 * Provides efficient, zero-copy UDP communication using direct buffer access.
 * This module interfaces with the native UDPDirectModule through multiple mechanisms:
 * 
 * 1. JSI Global Objects (preferred): Uses the global.UDPDirectModule object for direct, 
 *    synchronous communication with native code
 * 
 * 2. TurboModule System (fallback): Falls back to NativeModules.UDPDirectModule when
 *    JSI bindings aren't available
 * 
 * Key design features:
 * - Unified module access with automatic detection of available implementations
 * - Resilient initialization with retry mechanism for asynchronous module loading
 * - Reference counting for proper lifecycle management
 * - Zero-copy buffer operations for maximum performance
 * 
 * Usage example:
 * ```typescript
 * import { createDirectBuffer, sendWithDirectBuffer, releaseDirectBuffer } from './platform/udp-direct';
 * 
 * async function sendUdpData(data: Uint8Array, address: string, port: number) {
 *   // Create a direct buffer
 *   const buffer = await createDirectBuffer(data.length);
 *   
 *   // Write data to the buffer
 *   await buffer.write(data);
 *   
 *   // Send data
 *   await sendWithDirectBuffer(buffer, data.length, port, address);
 *   
 *   // Release buffer when done
 *   await releaseDirectBuffer(buffer);
 * }
 * ```
 */

import { checkDirectBufferSupport, createDirectBuffer as createBuffer, releaseDirectBuffer as releaseBuffer, DirectBuffer } from '../models/network/DirectBuffer';
import { NativeModules } from 'react-native';
import Debug from 'debug';

// Setup debug logging
const debug = Debug('one:platform:udp-direct');

// Stores the native module once resolved by src/platform/index.ts
let ResolvedUDPModuleNative: any = null;
let isUdpDirectInitialized = false;

// Define a function to get the most appropriate module implementation
// This will be called by the proxy *after* initializeUdpDirectInternals has run.
function getUDPDirectModuleInternal() {
  if (!isUdpDirectInitialized || !ResolvedUDPModuleNative) {
    // This should ideally not happen if used correctly after initialization.
    debug('CRITICAL: getUDPDirectModuleInternal called before initialization or ResolvedUDPModuleNative is null.');
    throw new Error('UDPDirectModule internals not initialized. Call initializeUdpDirectInternals from platform/index.ts first.');
  }
  // In this refactored version, ResolvedUDPModuleNative is already the chosen one (JSI or TurboModule)
  // The original logic for choosing between global.UDPDirectModule and NativeModules.UDPDirectModule
  // will now reside in src/platform/index.ts's initializeUdpPlatform function.
  return ResolvedUDPModuleNative;
}

// Proxy to handle module method access. It relies on getUDPDirectModuleInternal.
// This proxy is created immediately, but getUDPDirectModuleInternal will throw if not initialized.
const UDPDirectModule = new Proxy({}, {
  get: function(target, prop) {
    // No try-catch here for immediate errors; getUDPDirectModuleInternal will handle it.
    const module = getUDPDirectModuleInternal(); // This now uses the resolved module
    
    // Alias createDirectBuffer to createUdpBuffer if available, otherwise fallback to legacy names
    if (prop === 'createDirectBuffer') {
      if (typeof module.createUdpBuffer === 'function') {
        debug("Proxying 'createDirectBuffer' to 'createUdpBuffer'");
        return module.createUdpBuffer;
      }
      if (typeof module.createSharedArrayBuffer === 'function') {
        debug("Proxying 'createDirectBuffer' to legacy 'createSharedArrayBuffer'");
      return module.createSharedArrayBuffer;
      }
    }

    if (typeof module[prop] !== 'function') {
      // Existing fallback for createDirectBuffer -> createBuffer (less ideal but keep for now if createSharedArrayBuffer also doesn't exist)
      if (prop === 'createDirectBuffer' && typeof module.createBuffer === 'function') {
        debug("Using alternate method 'createBuffer' instead of 'createDirectBuffer' as createSharedArrayBuffer was not found either");
        return module.createBuffer;
      }
      if (prop === 'releaseDirectBuffer' && typeof module.releaseUdpBuffer === 'function') {
        debug("Using 'releaseUdpBuffer' for 'releaseDirectBuffer'");
        return module.releaseUdpBuffer;
      }
      if (prop === 'releaseDirectBuffer' && typeof module.releaseBuffer === 'function') {
        debug("Using alternate method 'releaseBuffer' instead of 'releaseDirectBuffer'");
        return module.releaseBuffer;
      }
      debug(`Warning: UDPDirectModule.${String(prop)} is not a function. Available methods: ${
        Object.getOwnPropertyNames(module)
          .filter(name => typeof module[name] === 'function')
          .join(', ')
      }`);
      return undefined;
    }
    
    return function(...args: any[]) {
      try {
        return module[prop](...args);
      } catch (error) {
        debug(`Error calling UDPDirectModule.${String(prop)}: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    };
  }
});


export function initializeUdpDirectInternals(nativeModule: any) {
  if (isUdpDirectInitialized) {
    debug('UDP Direct internals already initialized.');
    return;
  }
  if (!nativeModule) {
    debug('CRITICAL: initializeUdpDirectInternals called with no nativeModule.');
    throw new Error('Failed to initialize UDP Direct internals: Native module is null.');
  }
  ResolvedUDPModuleNative = nativeModule;
  isUdpDirectInitialized = true;
  debug('UDP Direct internals initialized successfully.');
  logModuleDiagnostics(); // Log diagnostics after we have the module.
}

// Add comprehensive diagnostics
function logModuleDiagnostics() {
  debug('--- UDPDirectModule Diagnostics (post-init) ---');
  debug('ResolvedUDPModuleNative available:', !!ResolvedUDPModuleNative);
  
  if (ResolvedUDPModuleNative) {
    const methods = Object.getOwnPropertyNames(ResolvedUDPModuleNative)
      .filter(prop => typeof ResolvedUDPModuleNative[prop] === 'function');
    debug('ResolvedUDPModuleNative methods:', methods.join(', '));
    debug('createDirectBuffer is function:', typeof ResolvedUDPModuleNative.createDirectBuffer === 'function' || typeof ResolvedUDPModuleNative.createBuffer === 'function');
    debug('releaseDirectBuffer is function:', typeof ResolvedUDPModuleNative.releaseDirectBuffer === 'function' || typeof ResolvedUDPModuleNative.releaseBuffer === 'function');
  }
  debug('----------------------------------');
}


// REMOVE OLD IMMEDIATE CHECKS:
// const UDPTurboModule = NativeModules.UDPDirectModule;
// const moduleAvailable = (typeof global.UDPDirectModule !== 'undefined') || !!UDPTurboModule;
// if (!moduleAvailable) {
//   throw new Error('UDPDirectModule not available - direct buffer support is required');
// }
// logModuleDiagnostics(); // Moved into initializeUdpDirectInternals


// Wait for the module to be fully available before proceeding
// This checking logic might need to adapt or be primarily handled by DirectBufferManager.init
let moduleCheckAttempts = 0;
const maxModuleCheckAttempts = 50; // Approx 5 seconds if 100ms interval

function checkRequiredMethod(methodName: string): boolean {
  if (!isUdpDirectInitialized || !ResolvedUDPModuleNative) {
    return false; // Not initialized yet
  }
  const module = ResolvedUDPModuleNative;
  
  if (methodName === 'createDirectBuffer' && typeof module.createBuffer === 'function') {
    return true;
  }
  if (methodName === 'releaseDirectBuffer' && typeof module.releaseBuffer === 'function') {
    return true;
  }
  return typeof module[methodName] === 'function';
}

const requiredMethods = [
  'createDirectBuffer',
  'releaseDirectBuffer',
  'sendWithDirectBuffer',
  // 'receiveWithDirectBuffer' // This was in your original list, ensure it exists or remove
  // Assuming these methods are expected on the native module:
  'createSocket',
  'closeSocket',
  'bind',
  'sendFromArrayBuffer',
  'getReceivedDataBuffer', // If used by your DirectBuffer implementation for receives
  'getDiagnostics'
];

// Reference counting for proper lifecycle management
let globalInstanceRefCount = 0;
// let isInitialized = false; // Replaced by isUdpDirectInitialized for module readiness
let shutdownPromise: Promise<void> | null = null;
let isShuttingDown = false;

class DirectBufferManager {
  private static instance: DirectBufferManager | null = null;
  
  private constructor() {
    // Original checkDirectBufferSupport() might be too early if it relies on the module.
    // We'll rely on initializeUdpDirectInternals having been called.
    if (!isUdpDirectInitialized) {
        // This constructor should ideally only be called after outer initialization.
        debug("DirectBufferManager constructor called before UDP Direct internals initialized. This might lead to issues.");
        // Consider throwing an error or ensuring getInstance() is only called after global init.
    }
    debug('DirectBufferManager constructed');
  }
  
  public static getInstance(): DirectBufferManager {
    if (!DirectBufferManager.instance) {
      debug('Creating new DirectBufferManager instance');
      DirectBufferManager.instance = new DirectBufferManager();
    }
    return DirectBufferManager.instance;
  }
  
  public isSupported(): boolean {
    return isUdpDirectInitialized && !!ResolvedUDPModuleNative && checkDirectBufferSupport(); // checkDirectBufferSupport might need ResolvedUDPModuleNative
  }
  
  public isManagerInitialized(): boolean { // Renamed to avoid clash with module-level isInitialized
    return isUdpDirectInitialized; // Manager is initialized if the underlying module is.
  }
  
  public async init(): Promise<void> {
    if (!isUdpDirectInitialized) {
        debug('Cannot init DirectBufferManager: UDP Direct internals not yet initialized.');
        throw new Error('UDP Direct internals must be initialized before DirectBufferManager.init()');
    }
    if (DirectBufferManager.instance?.isManagerInitialized() && globalInstanceRefCount > 0) { // Check specific instance
        debug('DirectBufferManager already effectively initialized and in use.');
        globalInstanceRefCount++;
        return;
    }
    
    try {
      debug('Initializing DirectBufferManager');
      const methodsAvailable = await this.waitForRequiredMethods();
      if (!methodsAvailable) {
        throw new Error('DirectBufferManager initialization failed: Not all required native methods are available.');
      }
      // Original UDPDirectModule.init() call if it existed; now native module is init'd by OS.
      // JS-side initialization/setup if any for the manager itself.
      globalInstanceRefCount = 1; // First proper init
      isShuttingDown = false;
      shutdownPromise = null;
      debug('DirectBufferManager initialized successfully');
    } catch (error) {
      debug('Error initializing DirectBufferManager:', error);
      throw error;
    }
  }

  private async waitForRequiredMethods(timeoutMs = 5000): Promise<boolean> {
    const checkInterval = 100;
    let elapsedTime = 0;
    return new Promise((resolve) => {
      const intervalId = setInterval(() => {
        if (!isUdpDirectInitialized) {
          elapsedTime += checkInterval;
          if (elapsedTime >= timeoutMs) {
            clearInterval(intervalId);
            debug('Timeout waiting for UDP direct internals to initialize.');
            resolve(false);
          }
          return;
        }
        const missing = requiredMethods.filter(method => !checkRequiredMethod(method));
        if (missing.length === 0) {
          clearInterval(intervalId);
          debug('All required methods are available.');
          resolve(true);
        } else {
          elapsedTime += checkInterval;
          if (elapsedTime >= timeoutMs) {
            clearInterval(intervalId);
            debug(`Timeout waiting for required methods. Missing: ${missing.join(', ')}`);
            resolve(false);
          } else {
            debug(`Still waiting for methods: ${missing.join(', ')}. Elapsed: ${elapsedTime}ms`);
          }
        }
      }, checkInterval);
    });
  }
  
  public async shutdown(): Promise<void> {
    globalInstanceRefCount--;
    if (globalInstanceRefCount > 0) {
      debug(`DirectBufferManager shutdown: ${globalInstanceRefCount} references remaining.`);
      return;
    }
    if (globalInstanceRefCount < 0) globalInstanceRefCount = 0; // Safety

    if (!isUdpDirectInitialized || !DirectBufferManager.instance) { // Check specific instance
      debug('DirectBufferManager not initialized or already shut down.');
      return;
    }
    if (isShuttingDown && shutdownPromise) {
      debug('DirectBufferManager shutdown already in progress.');
      return shutdownPromise;
    }
    isShuttingDown = true;
    
    debug('Shutting down DirectBufferManager');
    shutdownPromise = (async () => {
      try {
        if (ResolvedUDPModuleNative && typeof ResolvedUDPModuleNative.onManagerShutdown === 'function') {
          // await ResolvedUDPModuleNative.onManagerShutdown(); // If native side needs notification
        }
        debug('DirectBufferManager shutdown complete.');
      } catch (error) {
        debug('Error during DirectBufferManager shutdown:', error);
        // Potentially log error, but don't prevent shutdown
      } finally {
        DirectBufferManager.instance = null; 
        // isUdpDirectInitialized = false; // DO NOT RESET THIS - it's for the lifetime of the native module being resolved
        isShuttingDown = false;
      }
    })();
    return shutdownPromise;
  }
  
  // Wrapper for createBuffer, ensuring manager is initialized
  public async createBuffer(size: number): Promise<DirectBuffer> {
    if (!isUdpDirectInitialized || !ResolvedUDPModuleNative) throw new Error("UDP Direct not initialized");
    // UDPDirectModule.createDirectBuffer will be resolved by the proxy
    const alloc = (UDPDirectModule as any).createUdpBuffer ?? (UDPDirectModule as any).createSharedArrayBuffer;
    if (typeof alloc !== 'function') throw new Error('UDPDirectModule.createUdpBuffer/createSharedArrayBuffer missing');
    const bufferId = await alloc(size);
    if (typeof bufferId !== 'number') { // Or however your native module returns it
        throw new Error('Failed to create direct buffer, invalid bufferId received.');
    }
    // The DirectBuffer class likely needs the native module or specific functions from it.
    // This part needs careful review based on DirectBuffer's implementation.
    // For now, assuming DirectBuffer can be instantiated and then uses global/proxied methods.
    return new DirectBuffer(bufferId, size, UDPDirectModule); // Pass the proxy
  }

  public async send(
    buffer: DirectBuffer,
    length: number,
    port: number,
    address: string
  ): Promise<void> {
    if (!isUdpDirectInitialized) throw new Error("UDP Direct not initialized");
    if (!buffer.id) throw new Error("Invalid buffer for send");
    return UDPDirectModule.sendFromArrayBuffer(buffer.socketId || buffer.id, buffer.id, 0, length, port, address); // Assuming socketId is managed or buffer.id is okay
  }

  public async receive(
    buffer: DirectBuffer,
    timeout?: number // Timeout not directly supported by all native send/receive patterns
  ): Promise<{ bytesRead: number; address: string; port: number }> {
    if (!isUdpDirectInitialized) throw new Error("UDP Direct not initialized");
    // Native receive logic is often event-based or requires a bound socket + explicit receive call.
    // This is a placeholder and needs to match your actual native module's API.
    // For example, it might involve:
    // 1. Ensuring socket is bound and listening (managed outside this simple receive)
    // 2. Calling something like UDPDirectModule.receiveOnSocket(buffer.socketId, buffer.id, buffer.size)
    // 3. Or, handling an event emitted from native.
    // The current UDPDirectModule.receiveWithDirectBuffer seems more of a placeholder or needs specific context.
    debug("receive() called, ensure native implementation matches. Timeout not implemented in this shim.");
    // This is a guess based on original requiredMethods list
    // return UDPDirectModule.receiveWithDirectBuffer(buffer.id, buffer.size, timeout);
    throw new Error("receiveWithDirectBuffer not fully implemented in this refactoring step, depends on native eventing or specific receive calls.");
  }

  public async releaseBuffer(buffer: DirectBuffer): Promise<boolean> {
    if (!isUdpDirectInitialized) {
        debug("UDP Direct not initialized, cannot release buffer.");
        return false;
    }
    if (!buffer.id) {
        debug("Invalid buffer, cannot release.");
        return false;
    }
    try {
        // UDPDirectModule.releaseDirectBuffer will be resolved by the proxy
        const release = (UDPDirectModule as any).releaseUdpBuffer ?? (UDPDirectModule as any).releaseSharedArrayBuffer;
        await release(buffer.id);
        return true;
    } catch (error) {
        debug("Error releasing buffer:", error);
        return false;
    }
  }
}

// Exported functions that use the DirectBufferManager
export async function getDirectBufferManager(): Promise<DirectBufferManager> {
  if (!isUdpDirectInitialized) {
    // This function is now problematic if called before initializeUdpPlatform -> initializeUdpDirectInternals
    // It implies an attempt to use UDP before it's declared ready by the app's logic (post-login).
    throw new Error("Cannot get DirectBufferManager: UDP system not initialized. Call after login via platform's init sequence.");
  }
  const manager = DirectBufferManager.getInstance();
  await manager.init(); // Ensures it's internally ready and increments ref count
  return manager;
}

export async function releaseDirectBufferManager(): Promise<void> {
  if (DirectBufferManager.getInstance()) {
    await DirectBufferManager.getInstance().shutdown(); // Decrements ref count
  }
}

export async function resetDirectBufferManager(): Promise<void> {
  debug('Resetting DirectBufferManager...');
  if (DirectBufferManager.getInstance()) {
    // Force shutdown regardless of ref count for a hard reset
    globalInstanceRefCount = 0; 
    await DirectBufferManager.getInstance().shutdown();
  }
  // isUdpDirectInitialized = false; // Do not reset this, as native module is still loaded.
  // ResolvedUDPModuleNative = null; // Do not reset this.
  // Re-initializing the manager instance if needed, but typically reset implies full stop.
  // If a subsequent getDirectBufferManager is called, it will create a new one.
  debug('DirectBufferManager reset.');
}


export function isDirectBufferSupported(): boolean {
  // This check is now more about whether the system has been initialized
  // and less about initial module presence.
  return isUdpDirectInitialized && !!ResolvedUDPModuleNative && checkDirectBufferSupport();
}

export async function createDirectBuffer(size: number): Promise<DirectBuffer> {
  const manager = await getDirectBufferManager();
  // The original 'createBuffer' was imported and aliased.
  // Now, we use the manager's method which should internally call the proxied native function.
  return manager.createBuffer(size);
}

export async function sendWithDirectBuffer(
  buffer: DirectBuffer,
  length: number,
  port: number,
  address: string
): Promise<void> {
  const manager = await getDirectBufferManager();
  return manager.send(buffer, length, port, address);
}

export async function receiveWithDirectBuffer(
  buffer: DirectBuffer,
  timeout?: number
): Promise<{ bytesRead: number; address: string; port: number }> {
  const manager = await getDirectBufferManager();
  return manager.receive(buffer, timeout);
}

export async function releaseDirectBuffer(buffer: DirectBuffer): Promise<boolean> {
  const manager = await getDirectBufferManager();
  // The original 'releaseBuffer' was imported and aliased.
  // Now, use the manager's method.
  return manager.releaseBuffer(buffer);
}

export function getDirectBufferManagerState(): Record<string, any> {
  return {
    isUdpDirectInitialized,
    globalInstanceRefCount,
    isShuttingDown: isShuttingDown,
    managerInstanceExists: !!DirectBufferManager.getInstance(), // Be careful with getInstance if it auto-creates
    requiredMethodsMissing: requiredMethods.filter(method => !checkRequiredMethod(method))
  };
}

// Default export could be the manager instance or key functions,
// but named exports are generally clearer.
// For now, let's keep it to named exports as it was.
export default {
  isDirectBufferSupported,
  createDirectBuffer,
  sendWithDirectBuffer,
  receiveWithDirectBuffer,
  releaseDirectBuffer,
  getDirectBufferManager,
  releaseDirectBufferManager,
  resetDirectBufferManager,
  getDirectBufferManagerState,
  // Expose the new initializer for platform/index.ts
  initializeUdpDirectInternals 
};

// The DirectBuffer class itself might need access to the resolved native module
// or specific functions. If it was previously importing from this file and using
// the global/proxied UDPDirectModule, it should continue to work as long as
// initializeUdpDirectInternals is called before DirectBuffer instances are heavily used.
// The DirectBuffer class was imported from '../models/network/DirectBuffer.ts'
// Its constructor was: constructor(public id: number, public size: number, private nativeModule: any)
// The change to `manager.createBuffer` passes `UDPDirectModule` (the proxy) to the DirectBuffer constructor.
// This should be compatible.

// One final check: The original checkDirectBufferSupport() from '../models/network/DirectBuffer.ts'
// needs to be reviewed to see if it can run *before* ResolvedUDPModuleNative is set.
// If it tries to access methods on the native module, it will fail.
// For now, I've put it inside isSupported() which is guarded by isUdpDirectInitialized. 