/**
 * Direct UDP module test
 */

import { TurboModuleRegistry } from 'react-native';

export function testDirectUDP() {
  console.log('=== DIRECT UDP TEST ===');
  
  try {
    // Get the module directly from TurboModuleRegistry
    const UDPModule = TurboModuleRegistry.getEnforcing('UDPDirectModule');
    console.log('Module loaded:', !!UDPModule);
    
    // Try to access methods directly
    console.log('\n1. Checking method existence:');
    console.log('createSocket exists:', 'createSocket' in UDPModule);
    console.log('typeof createSocket:', typeof UDPModule.createSocket);
    
    // Try to call createSocket with minimal options
    console.log('\n2. Attempting to create socket...');
    const options = {
      type: 'udp4',
      reuseAddr: true,
      broadcast: true
    };
    
    console.log('Calling createSocket with:', options);
    
    UDPModule.createSocket(options)
      .then((result: any) => {
        console.log('✅ Socket created successfully!');
        console.log('Result:', result);
        
        // Try to close it
        if (result && result.socketId) {
          console.log('\n3. Attempting to close socket...');
          return UDPModule.close(result.socketId);
        }
      })
      .then(() => {
        console.log('✅ Socket closed successfully!');
      })
      .catch((error: any) => {
        console.error('❌ Error:', error);
        console.error('Error type:', error.constructor.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      });
    
  } catch (error: any) {
    console.error('Failed to get module:', error);
  }
  
  console.log('\n=== END DIRECT TEST ===');
}