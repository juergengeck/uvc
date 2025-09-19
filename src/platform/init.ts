import { debugCriticalModules } from '../utils/nativeModuleDebug';
import { initializeQuicTransport } from '../models/network/setup';
import { Platform } from 'react-native';
import { init as initCryptoHelpers } from '@refinio/one.core/lib/system/expo/crypto-helpers';
import { UdpModel } from '../models/network/UdpModel';
import { RefactoredBTLEService } from '../services/RefactoredBTLEService';

/**
 * Initialize platform services in the correct order:
 * 1. Crypto (required by everything)
 * 2. UDP (transport layer)
 * 3. BTLE (transport layer)
 * 4. QUIC (uses UDP as transport)
 */
export async function initializePlatform(): Promise<void> {
  console.log('[Platform] Initializing for', Platform.OS);
  
  // Debug modules in dev
  if (__DEV__) {
    const moduleResults = debugCriticalModules();
    console.log('[Platform] Module debug:', moduleResults.length, 'modules checked');
    
    // Log BTLE module status specifically
    const btleModule = moduleResults.find(r => r.name === 'NativeBTLEModule');
    if (btleModule) {
      console.log('[Platform] BTLE module status:', btleModule.status);
      if (btleModule.status === 'available') {
        console.log('[Platform] BTLE module available - Native:', btleModule.nativeAvailable, 'Turbo:', btleModule.turboAvailable);
      }
    }
  }
  
  // 1. Crypto helpers (includes PRNG)
  console.log('[Platform] Initializing crypto...');
  try {
    await initCryptoHelpers();
    console.log('[Platform] ✅ Crypto initialized');
  } catch (error) {
    console.error('[Platform] ❌ Crypto init failed:', error);
    throw error;
  }
  
  // 2. UDP transport
  console.log('[Platform] Initializing UDP...');
  try {
    const udpModel = UdpModel.getInstance();
    if (!udpModel.isInitialized()) {
      await udpModel.init();
      console.log('[Platform] ✅ UDP initialized');
    } else {
      console.log('[Platform] UDP already initialized');
    }
  } catch (error) {
    console.error('[Platform] ❌ UDP init failed:', error);
    throw error; // UDP is required for QUIC
  }
  
  // 3. BTLE transport
  console.log('[Platform] Initializing BTLE...');
  try {
    // Dynamically import to avoid module-load-time errors
    const btleService = new RefactoredBTLEService();
    const initialized = await btleService.initialize();
    if (initialized) {
      const state = await btleService.getState();
      console.log('[Platform] ✅ BTLE initialized, state:', state);
      
      // Check actual BTLE availability (PoweredOn state)
      try {
        const available = await btleService.isBTLEAvailable();
        if (available) {
          console.log('[Platform] ✅ BTLE is available and powered on');
        } else {
          console.log('[Platform] ⚠️ BTLE is initialized but not available (likely powered off or unsupported)');
        }
      } catch (availError) {
        console.warn('[Platform] ⚠️ Could not check BTLE availability:', availError);
      }
    } else {
      console.warn('[Platform] ⚠️ BTLE init returned false');
    }
  } catch (error) {
    // Check if this is a "Bluetooth unsupported" error using same logic as DeviceDiscoveryModel
    const errorMessage = error?.toString() || '';
    if (errorMessage.includes('unsupported') || errorMessage.includes('BluetoothLE') || 
        errorMessage.includes('Native BTLE module not available')) {
      console.log('[Platform] BluetoothLE not supported on this device - likely running on simulator');
    } else {
      console.warn('[Platform] ⚠️ BTLE init failed (non-critical):', error);
    }
  }
  
  // 4. QUIC (uses UDP)
  console.log('[Platform] Initializing QUIC...');
  await initializeQuicTransport();
  
  console.log('[Platform] ✅ Platform initialization complete');
}