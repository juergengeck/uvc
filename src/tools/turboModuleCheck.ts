/**
 * Check TurboModule loading in New Architecture
 */

export function turboModuleCheck() {
  console.log('=== TURBO MODULE CHECK (New Architecture) ===');
  
  // Check if we're in New Architecture
  console.log('\n1. Architecture check:');
  const isBridgeless = global.__turboModuleProxy != null;
  console.log('Bridgeless mode (New Architecture):', isBridgeless);
  
  // Try to access the module through the package
  console.log('\n2. Trying package import:');
  try {
    // This should trigger the TurboModule loading
    const UDPDirectModule = require('@lama/react-native-udp-direct').default;
    console.log('Package import successful');
    console.log('Module type:', typeof UDPDirectModule);
    
    if (UDPDirectModule) {
      // Check if it's a Proxy (common for TurboModules)
      console.log('Is Proxy:', UDPDirectModule.constructor.name === 'Proxy');
      
      // Try to list properties without triggering the proxy
      try {
        console.log('Attempting to check module...');
        // Just check if specific methods exist by trying to access them
        const methods = ['createSocket', 'bind', 'send', 'close', 'getConstants'];
        for (const method of methods) {
          try {
            const hasMethod = method in UDPDirectModule;
            console.log(`  ${method}: ${hasMethod}`);
          } catch (e) {
            console.log(`  ${method}: Error - ${e.message}`);
          }
        }
      } catch (e) {
        console.log('Error checking methods:', e.message);
      }
      
      // Try calling getConstants which should be safe
      console.log('\n3. Trying getConstants():');
      try {
        if (UDPDirectModule.getConstants) {
          const constants = UDPDirectModule.getConstants();
          console.log('Constants:', constants);
        } else {
          console.log('getConstants not available');
        }
      } catch (e) {
        console.log('Error calling getConstants:', e.message);
      }
    }
  } catch (e) {
    console.log('Package import error:', e.message);
    console.log('Error stack:', e.stack);
  }
  
  // Check native side logging
  console.log('\n4. Module registration check:');
  console.log('Check Xcode console for native logs like:');
  console.log('  [UDPDirectModule] Initialized as TurboModule provider');
  console.log('  [UDPDirectModule] Creating TurboModule with C++ implementation');
  
  console.log('\n=== END TURBO MODULE CHECK ===');
}