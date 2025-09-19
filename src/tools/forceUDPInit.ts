/**
 * Force UDP module initialization
 */

import UDPDirectModule from '@lama/react-native-udp-direct';

export function forceUDPInit() {
  console.log('=== FORCING UDP MODULE INIT ===');
  
  try {
    // Direct require to force module loading
    const { NativeModules, TurboModuleRegistry } = require('react-native');
    
    console.log('\n1. Attempting TurboModuleRegistry.getEnforcing...');
    try {
      // This should force the module to load and throw if it fails
      const module = TurboModuleRegistry.getEnforcing('UDPDirectModule');
      console.log('TurboModule loaded:', !!module);
      console.log('Module type:', typeof module);
    } catch (e) {
      console.log('TurboModuleRegistry.getEnforcing error:', (e as Error).message);
    }
    
    console.log('\n2. Direct NativeModules access...');
    const nativeModule = NativeModules.UDPDirectModule;
    console.log('NativeModule exists:', !!nativeModule);
    
    console.log('\n2a. Imported module check...');
    console.log('Imported UDPDirectModule exists:', !!UDPDirectModule);
    console.log('Imported module type:', typeof UDPDirectModule);
    
    console.log('\n3. Check native logs in Xcode console NOW for:');
    console.log('   [UDPDirectModule] Initialized...');
    console.log('   [UDPDirectModuleCxxImpl] Creating TurboModule...');
    
  } catch (e) {
    console.log('Force init error:', e);
  }
  
  console.log('\n=== END FORCE INIT ===');
}