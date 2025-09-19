/**
 * Simple UDP module check without triggering errors
 */

import { NativeModules } from 'react-native';
import UDPDirectModule from '@lama/react-native-udp-direct';

export function simpleUDPCheck() {
  console.log('=== SIMPLE UDP MODULE CHECK ===');
  
  // Check if UDPDirectModule exists in NativeModules
  console.log('\n1. Checking NativeModules for UDP-related modules:');
  const allModules = Object.keys(NativeModules);
  const udpModules = allModules.filter(name => 
    name.toLowerCase().includes('udp') || 
    name.toLowerCase().includes('socket') ||
    name.toLowerCase().includes('direct')
  );
  
  console.log('Total modules:', allModules.length);
  console.log('UDP-related modules found:', udpModules);
  
  // Check specific module
  console.log('\n2. Checking UDPDirectModule specifically:');
  const hasUDPDirectModule = 'UDPDirectModule' in NativeModules;
  console.log('UDPDirectModule exists:', hasUDPDirectModule);
  
  // Try to access it safely
  if (hasUDPDirectModule) {
    try {
      const module = NativeModules.UDPDirectModule;
      console.log('Module type:', typeof module);
      console.log('Module is null:', module === null);
      console.log('Module is undefined:', module === undefined);
      
      if (module && typeof module === 'object') {
        console.log('Module properties:', Object.getOwnPropertyNames(module));
      }
    } catch (e) {
      console.log('Error accessing module:', (e as Error).message);
    }
  }
  
  // Check imported module
  console.log('\n2a. Checking imported UDPDirectModule:');
  console.log('Imported UDPDirectModule exists:', !!UDPDirectModule);
  console.log('Imported module type:', typeof UDPDirectModule);
  if (UDPDirectModule && typeof UDPDirectModule === 'object') {
    console.log('Imported module properties:', Object.getOwnPropertyNames(UDPDirectModule));
  }
  
  // Check TurboModule without accessing it
  console.log('\n3. Checking TurboModule registry:');
  try {
    // Just check if TurboModuleRegistry exists
    const { TurboModuleRegistry } = require('react-native');
    console.log('TurboModuleRegistry exists:', !!TurboModuleRegistry);
    console.log('TurboModuleRegistry.get is a function:', typeof TurboModuleRegistry.get === 'function');
  } catch (e) {
    console.log('TurboModuleRegistry not available:', (e as Error).message);
  }
  
  // Try dynamic import of the package
  console.log('\n4. Checking package availability:');
  try {
    const hasPackage = require.resolve('@lama/react-native-udp-direct');
    console.log('Package @lama/react-native-udp-direct found at:', hasPackage);
  } catch (e) {
    console.log('Package not found:', (e as Error).message);
  }
  
  console.log('\n=== END SIMPLE CHECK ===');
}