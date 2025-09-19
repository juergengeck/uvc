/**
 * Test script to verify UDP JSI bindings are properly loaded
 */

export function testUDPJSI() {
  console.log('[UDP JSI Test] Starting test...');
  
  // Check for global udpSendDirect function
  if (typeof udpSendDirect !== 'undefined') {
    console.log('[UDP JSI Test] ✅ udpSendDirect function is available');
  } else {
    console.log('[UDP JSI Test] ❌ udpSendDirect function is NOT available');
  }
  
  // Check for global _udpJSI namespace
  const globalAny = global as any;
  if (typeof globalAny._udpJSI !== 'undefined') {
    console.log('[UDP JSI Test] ✅ _udpJSI namespace is available');
    
    // Check for required methods
    const requiredMethods = ['createSocket', 'bind', 'close', 'setEventHandler'];
    const availableMethods = Object.keys(globalAny._udpJSI);
    
    console.log('[UDP JSI Test] Available methods:', availableMethods);
    
    for (const method of requiredMethods) {
      if (typeof globalAny._udpJSI[method] === 'function') {
        console.log(`[UDP JSI Test] ✅ _udpJSI.${method} is available`);
      } else {
        console.log(`[UDP JSI Test] ❌ _udpJSI.${method} is NOT available`);
      }
    }
  } else {
    console.log('[UDP JSI Test] ❌ _udpJSI namespace is NOT available');
  }
  
  // Try to import and check JSI wrapper
  try {
    const { isJSIAvailable } = require('@lama/react-native-udp-direct');
    if (isJSIAvailable()) {
      console.log('[UDP JSI Test] ✅ JSI wrapper reports JSI is available');
    } else {
      console.log('[UDP JSI Test] ❌ JSI wrapper reports JSI is NOT available');
    }
  } catch (error) {
    console.log('[UDP JSI Test] ❌ Failed to import UDP module:', error);
  }
  
  console.log('[UDP JSI Test] Test complete');
}

// Export for global access
(global as any).testUDPJSI = testUDPJSI;