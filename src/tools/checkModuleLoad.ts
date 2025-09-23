/**
 * Check if UDP module is loaded at native level
 */

import { NativeModules, NativeEventEmitter } from 'react-native';
import UDPDirectModule from 'react-native-udp-direct';

export function checkModuleLoad() {
  console.log('=== MODULE LOAD CHECK ===');
  
  // Check what we get from the package
  console.log('\n1. Direct package import:');
  try {
    const pkg = require('react-native-udp-direct');
    console.log('Package exports:', Object.keys(pkg));
    console.log('Default export:', pkg.default);
    console.log('Default export type:', typeof pkg.default);
    
    if (pkg.default && typeof pkg.default === 'object') {
      // Try to access it as a plain object
      console.log('Trying Object.keys on default:');
      try {
        const keys = Object.keys(pkg.default);
        console.log('Keys:', keys);
      } catch (e) {
        console.log('Object.keys error:', (e as Error).message);
      }
      
      // Try Object.getOwnPropertyNames
      console.log('Trying Object.getOwnPropertyNames:');
      try {
        const props = Object.getOwnPropertyNames(pkg.default);
        console.log('Properties:', props);
      } catch (e) {
        console.log('getOwnPropertyNames error:', (e as Error).message);
      }
      
      // Check prototype
      console.log('Checking prototype:');
      try {
        const proto = Object.getPrototypeOf(pkg.default);
        console.log('Prototype:', proto);
        console.log('Prototype constructor:', proto?.constructor?.name);
      } catch (e) {
        console.log('Prototype error:', (e as Error).message);
      }
    }
  } catch (e) {
    console.log('Package import error:', e);
  }
  
  // Test imported module
  console.log('\n1a. Imported UDPDirectModule test:');
  console.log('Imported module exists:', !!UDPDirectModule);
  console.log('Imported module type:', typeof UDPDirectModule);
  if (UDPDirectModule) {
    try {
      console.log('Imported module properties:', Object.getOwnPropertyNames(UDPDirectModule));
    } catch (e) {
      console.log('Error getting properties:', (e as Error).message);
    }
  }
  
  // Try creating an event emitter
  console.log('\n2. Event Emitter test:');
  try {
    if (NativeModules.UDPDirectModule) {
      const emitter = new NativeEventEmitter(NativeModules.UDPDirectModule);
      console.log('Event emitter created successfully');
      
      // Check if we can add a listener
      const subscription = emitter.addListener('test', () => {});
      console.log('Listener added successfully');
      subscription.remove();
      console.log('Listener removed successfully');
    } else {
      console.log('UDPDirectModule not in NativeModules');
    }
  } catch (e) {
    console.log('Event emitter error:', (e as Error).message);
  }
  
  // Log module loading advice
  console.log('\n3. Native module loading checklist:');
  console.log('[ ] Check Xcode console for [UDPDirectModule] logs');
  console.log('[ ] Verify RCT_EXPORT_MODULE() is called in .mm file');
  console.log('[ ] Confirm module is included in app target');
  console.log('[ ] Check if getTurboModule method is implemented');
  console.log('[ ] Verify C++ implementation is linked');
  
  console.log('\n=== END MODULE LOAD CHECK ===');
}