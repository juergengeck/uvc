/**
 * Force load UDP module for testing
 */

import { NativeModules, TurboModuleRegistry } from 'react-native';
import UDPDirectModule from '@lama/react-native-udp-direct';

export function forceLoadUDPModule() {
  console.log('=== FORCE LOADING UDP MODULE ===');
  
  // Try direct TurboModuleRegistry access
  console.log('\n1. Trying TurboModuleRegistry.get("UDPDirectModule")...');
  try {
    const turboModule = TurboModuleRegistry.get('UDPDirectModule');
    console.log('TurboModule result:', turboModule);
    if (turboModule) {
      console.log('TurboModule type:', typeof turboModule);
      console.log('TurboModule keys:', Object.keys(turboModule));
      
      // Try to call getConstants
      if (typeof turboModule.getConstants === 'function') {
        try {
          const constants = turboModule.getConstants();
          console.log('Constants:', constants);
        } catch (e) {
          console.log('Error calling getConstants:', e);
        }
      }
    }
  } catch (e) {
    console.log('TurboModuleRegistry error:', e);
  }
  
  // Try NativeModules access
  console.log('\n2. Trying NativeModules.UDPDirectModule...');
  const nativeModule = NativeModules.UDPDirectModule;
  console.log('NativeModule result:', nativeModule);
  if (nativeModule) {
    console.log('NativeModule type:', typeof nativeModule);
    console.log('NativeModule keys:', Object.keys(nativeModule));
  }
  
  // List all available native modules
  console.log('\n3. All available NativeModules:');
  const moduleNames = Object.keys(NativeModules).filter(name => 
    name.includes('UDP') || name.includes('Direct') || name.includes('Socket')
  );
  console.log('Filtered modules:', moduleNames);
  
  // Try the package import
  console.log('\n4. Trying package import...');
  try {
    const UDPDirectModuleLocal = require('@lama/react-native-udp-direct').default;
    console.log('Package import result:', UDPDirectModuleLocal);
    if (UDPDirectModuleLocal) {
      console.log('Package module type:', typeof UDPDirectModuleLocal);
      console.log('Package module keys:', Object.keys(UDPDirectModuleLocal));
    }
  } catch (e) {
    console.log('Package import error:', e);
  }
  
  // Check the imported module from top
  console.log('\n5. Imported UDPDirectModule from top:');
  console.log('Imported module exists:', !!UDPDirectModule);
  console.log('Imported module type:', typeof UDPDirectModule);
  if (UDPDirectModule) {
    try {
      console.log('Imported module keys:', Object.keys(UDPDirectModule));
    } catch (e) {
      console.log('Error getting keys:', (e as Error).message);
    }
  }
  
  console.log('\n=== END FORCE LOAD TEST ===');
}

// Export for use in console
global.forceLoadUDPModule = forceLoadUDPModule;