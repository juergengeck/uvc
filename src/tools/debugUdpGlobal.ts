/**
 * Debug script to check UDP global functions
 */

export function debugUdpGlobals() {
  const globalAny = global as any;
  
  console.log('[DEBUG UDP] Checking global UDP functions...');
  console.log('[DEBUG UDP] typeof global.udpSendDirect:', typeof globalAny.udpSendDirect);
  console.log('[DEBUG UDP] typeof global._udpJSI:', typeof globalAny._udpJSI);
  
  if (globalAny.udpSendDirect) {
    console.log('[DEBUG UDP] udpSendDirect exists');
    console.log('[DEBUG UDP] udpSendDirect.toString():', globalAny.udpSendDirect.toString());
    console.log('[DEBUG UDP] udpSendDirect.name:', globalAny.udpSendDirect.name);
    console.log('[DEBUG UDP] udpSendDirect.length (param count):', globalAny.udpSendDirect.length);
    
    // Check if it's a native function
    const isNative = globalAny.udpSendDirect.toString().includes('[native code]');
    console.log('[DEBUG UDP] Is native function:', isNative);
  }
  
  if (globalAny._udpJSI) {
    console.log('[DEBUG UDP] _udpJSI exists');
    console.log('[DEBUG UDP] _udpJSI keys:', Object.keys(globalAny._udpJSI));
  }
  
  // Check for any circular references in global
  try {
    const seen = new WeakSet();
    function checkCircular(obj: any, path: string): void {
      if (obj === null || typeof obj !== 'object') return;
      
      if (seen.has(obj)) {
        console.warn(`[DEBUG UDP] Circular reference detected at path: ${path}`);
        return;
      }
      
      seen.add(obj);
      
      for (const key in obj) {
        if (key.includes('udp') || key.includes('UDP')) {
          console.log(`[DEBUG UDP] Found UDP-related key: ${path}.${key}`);
        }
        
        try {
          checkCircular(obj[key], `${path}.${key}`);
        } catch (e) {
          // Skip inaccessible properties
        }
      }
    }
    
    checkCircular(globalAny, 'global');
  } catch (error) {
    console.error('[DEBUG UDP] Error checking circular references:', error);
  }
}

// Export for use in other files
export default debugUdpGlobals;