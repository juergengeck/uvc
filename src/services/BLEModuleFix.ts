/**
 * Simple check for BLE module availability
 * NO MOCKS - just return availability status
 */

import { NativeModules, Platform } from 'react-native';

export function checkBLEModuleAvailable(): boolean {
  if (Platform.OS === 'web') {
    return false;
  }

  const hasNativeModule = NativeModules.BlePlx !== undefined && NativeModules.BlePlx !== null;
  
  if (!hasNativeModule) {
    console.log('[BLEModuleFix] Native BLE module not available');
    return false;
  }
  
  console.log('[BLEModuleFix] Native BLE module is available');
  return true;
}