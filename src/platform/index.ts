// Disable all debug output as early as possible - MUST be before any imports
process.env.ONE_CORE_DEBUG = 'false';
process.env.ONE_CORE_PROMISE_DEBUG = 'false';
process.env.ONE_CORE_SERIALIZE_DEBUG = 'false';
process.env.ONE_MODELS_DEBUG = 'false';
process.env.ONE_CORE_LOCK_DEBUG = 'false';
process.env.ONE_CORE_VERSION_DEBUG = 'false';
process.env.ONE_CORE_STORAGE_DEBUG = 'false';
process.env.ONE_CORE_PLATFORM_DEBUG = 'false';
process.env.ONE_CORE_TRANSPORT_DEBUG = 'false';
process.env.ONE_CORE_NETWORK_DEBUG = 'false';
process.env.ONE_CORE_PROMISE_IMPL_DEBUG = 'false';
process.env.ONE_CORE_SERIALIZE_IMPL_DEBUG = 'false';
process.env.DEBUG = '-*';  // Disable all debug output
process.env.NODE_DEBUG = ''; // Disable Node.js internal debug

/**
 * Platform-specific code initialization
 * 
 * This file initializes all platform-specific implementations and integrates with one.core.
 * It follows the principle of using one.core implementations whenever available,
 * while providing custom implementations only when necessary.
 * 
 * Key architectural decisions:
 * 1. For QUIC transport: 
 *    - QUIC transport is initialized in the root index.js file
 *    - We don't handle QUIC transport in this file to avoid initialization issues
 * 
 * 2. For UDP Direct Buffer: We import our Turbo Module implementation
 *    - Uses native UDPDirectModule for zero-copy buffer handling
 *    - Provides efficient memory management for UDP communication
 */

import { NativeModules, TurboModuleRegistry, AppState } from 'react-native';
import { 
  initializeUdpDirectInternals, 
  getDirectBufferManager,
  isDirectBufferSupported,
  resetDirectBufferManager
} from './udp-direct';
import Debug from 'debug';

const debug = Debug('one:platform:index');

let platformServicesInitialized = false;
let resolvedNativeUdpModule: any = null;

/**
 * Resolves the native UDP module.
 * This can be called safely multiple times, but resolution only happens once.
 */
function resolveNativeUdpModule(): any {
  if (resolvedNativeUdpModule) {
    return resolvedNativeUdpModule;
  }

  const module = TurboModuleRegistry.get('UDPDirectModule');
  if (!module) {
    debug('CRITICAL: UDPDirectModule not found via TurboModuleRegistry.');
    // This error will be caught by initializePlatformServices if it occurs during its execution.
    throw new Error('UDPDirectModule native module not found. UDP support is unavailable.');
  }
  debug('UDPDirectModule native instance resolved successfully.');
  resolvedNativeUdpModule = module;
  return resolvedNativeUdpModule;
}

/**
 * Initializes platform-specific services, currently focusing on UDP.
 * This function MUST be called after user login and before any UDP operations are attempted.
 * It's safe to call this multiple times; initialization will only occur once.
 */
export async function initializePlatformServices(): Promise<void> {
  if (platformServicesInitialized) {
    debug('Platform services already initialized.');
    return;
  }

  debug('Initializing platform services...');
  try {
    const nativeUdpModule = resolveNativeUdpModule(); // Step 1: Get the native module instance
    
    initializeUdpDirectInternals(nativeUdpModule); // Step 2: Initialize udp-direct.ts internals

    // Step 3: Initialize and verify the DirectBufferManager
    // getDirectBufferManager internally calls manager.init() which waits for methods.
    const manager = await getDirectBufferManager(); 
    
    if (!manager.isManagerInitialized() || !isDirectBufferSupported()) {
      debug('Failed to initialize DirectBufferManager or UDP is not fully ready after explicit init.');
      throw new Error('UDP Platform services failed to initialize correctly.');
    }

    platformServicesInitialized = true;
    debug('Platform services (including UDP) initialized successfully.');

    // TODO: Initialize other deferred platform services here (e.g., Bluetooth)

  } catch (error) {
    debug('Error during platform services initialization:', error);
    // Propagate the error to be handled by the calling context (e.g., login flow)
    throw error;
  }
}

/**
 * Checks if the core platform services have been initialized.
 * @returns {boolean} True if initializePlatformServices has completed successfully.
 */
export function arePlatformServicesInitialized(): boolean {
  return platformServicesInitialized;
}

/**
 * Retrieves the raw native UDP module.
 * Note: Prefer using abstractions from `udp-direct.ts` where possible.
 * This function does not guarantee that `initializePlatformServices` has been called,
 * only that the native module reference is available.
 * For operational readiness, check `arePlatformServicesInitialized()`.
 * @returns The native UDP module instance, or throws if not resolvable.
 */
export function getRawUdpModule(): any {
  return resolveNativeUdpModule();
}

// Re-export key UDP functionalities for convenience using proper ESM syntax
// Consumers should ensure initializePlatformServices() is called before using these.
export * from './udp-direct';

// Register app lifecycle event handlers for cleanup
// Handle app state changes for proper resource cleanup
AppState.addEventListener('change', async (nextAppState) => {
  if (nextAppState === 'background' || nextAppState === 'inactive') {
    console.log('[Platform] App going to background, cleaning up resources');
    
    // Clean up DirectBuffer resources using the already imported function
    try {
      await resetDirectBufferManager();
      console.log('[Platform] DirectBuffer resources cleaned up successfully');
    } catch (error) {
      console.error('[Platform] Error cleaning up DirectBuffer resources:', error);
      // Don't rethrow because we're in a background callback
    }
  }
}); 