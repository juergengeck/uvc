/**
 * Utilities for debugging native module loading issues
 */
import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';

/**
 * Checks if a native module is available and returns detailed information
 * about its loading status and available methods.
 */
export function checkNativeModule(moduleName: string) {
  // Check if it's available through NativeModules
  const nativeModule = NativeModules[moduleName];
  const nativeAvailable = !!nativeModule;
  
  // Check if it's available through TurboModuleRegistry (New Architecture)
  let turboAvailable = false;
  try {
    turboAvailable = !!TurboModuleRegistry.get(moduleName);
  } catch (error) {
    // Ignore errors
  }
  
  // Get available methods if module exists
  const methods = nativeAvailable ? Object.keys(nativeModule).filter(
    key => typeof nativeModule[key] === 'function'
  ) : [];
  
  return {
    name: moduleName,
    nativeAvailable,
    turboAvailable,
    methods,
    isNewArchitecture: turboAvailable,
    platform: Platform.OS,
    platformVersion: Platform.Version,
    status: nativeAvailable || turboAvailable ? 'available' : 'missing'
  };
}

/**
 * Checks all specified modules and logs their status to the console
 */
export function checkAllModules(moduleNames: string[]) {
  console.log('[NativeModuleDebug] Checking modules:', moduleNames.join(', '));
  
  const results = moduleNames.map(checkNativeModule);
  const available = results.filter(r => r.status === 'available');
  const missing = results.filter(r => r.status === 'missing');
  
  console.log(`[NativeModuleDebug] Results: ${available.length} available, ${missing.length} missing`);
  
  results.forEach(result => {
    console.log(`[NativeModuleDebug] ${result.name}: ${result.status}`);
    if (result.status === 'available') {
      console.log(`  - Native: ${result.nativeAvailable}, Turbo: ${result.turboAvailable}`);
      console.log(`  - Methods: ${result.methods.join(', ')}`);
    }
  });
  
  return results;
}

/**
 * Checks all the critical modules required by our app
 */
export function debugCriticalModules() {
  return checkAllModules([
    'RNLlama',     // llama.rn TurboModule
    'UDPDirectModule', // Direct UDP buffer implementation (replaces old UDPModule)
    'NativeBTLEModule' // BTLE TurboModule for Bluetooth Low Energy
  ]);
}

/**
 * Automatically check critical modules when this file is imported
 * with NODE_ENV=development
 */
if (__DEV__) {
  // Delay check to ensure modules have time to load
  setTimeout(() => {
    console.log('[NativeModuleDebug] Running automatic module check in development');
    debugCriticalModules();
  }, 1000);
} 