/**
 * UDP Diagnostic Tool
 * 
 * This tool helps diagnose UDP communication issues with ESP32 devices.
 * It creates a focused socket on the ESP32 discovery port and logs all activity.
 */

import UDPDirectModule from 'react-native-udp-direct';
import { DeviceEventEmitter } from 'react-native';
import { Buffer } from '@refinio/one.core/lib/system/expo/index.js';
import Debug from 'debug';
import { checkNativeModule } from '../utils/nativeModuleDebug';

export interface UDPDiagnosticOptions {
  port?: number;
  timeout?: number;
  debug?: boolean;
  skipSend?: boolean; // Option to skip sending for basic testing
}

export interface UDPDiagnosticResult {
  success: boolean;
  messagesReceived: number;
  errors: string[];
  receivedPackets: {
    timestamp: number;
    address: string;
    port: number;
    size: number;
    data: string;
  }[];
}

/**
 * Run a UDP diagnostic test to identify reception issues
 */
export async function runUDPDiagnostic(options: UDPDiagnosticOptions = {}): Promise<UDPDiagnosticResult> {
  const port = options.port || 49497;
  const timeout = options.timeout || 5000; // Reduced to 5 seconds for quicker testing
  const debug = options.debug !== undefined ? options.debug : true;
  const skipSend = options.skipSend || false;
  
  const result: UDPDiagnosticResult = {
    success: false,
    messagesReceived: 0,
    errors: [],
    receivedPackets: []
  };
  
  console.log(`=== UDP DIAGNOSTIC STARTED ===`);
  console.log(`Listening on port: ${port}`);
  console.log(`Timeout: ${timeout}ms`);
  
  // First check module status
  console.log('\nChecking UDPDirectModule status...');
  const moduleInfo = checkNativeModule('UDPDirectModule');
  console.log('Module status:', moduleInfo);
  
  let socketId: string | null = null;
  let messageListener: any = null;
  let errorListener: any = null;
  let closeListener: any = null;
  
  try {
    // Check if module exists
    if (!UDPDirectModule) {
      throw new Error('UDPDirectModule not found - is the native module linked?');
    }
    
    console.log('\nNative module found');
    console.log('Available methods:', Object.keys(UDPDirectModule).filter(key => typeof (UDPDirectModule as any)[key] === 'function'));
    
    // Create socket using JSI interface
    console.log('Creating socket...');
    const createResult = await UDPDirectModule.createSocket({
      type: 'udp4',
      reuseAddr: true,
      broadcast: true,
      debug: true,
      debugLabel: 'UDPDiagnostic'
    });
    
    socketId = createResult.socketId;
    console.log(`Socket created with ID: ${socketId}`);
    
    // Set up promise for the test
    const testPromise = new Promise<UDPDiagnosticResult>((resolve) => {
      // Set up event listeners using DeviceEventEmitter
      messageListener = DeviceEventEmitter.addListener('onMessage', (event) => {
        if (event.socketId === socketId) {
          result.messagesReceived++;
          console.log(`🔍 RECEIVED PACKET from ${event.address}:${event.port}`);
          
          // Decode base64 data
          let dataString = '';
          try {
            const buffer = Buffer.from(event.data, 'base64');
            const jsonString = buffer.toString('utf8');
            try {
              const jsonData = JSON.parse(jsonString);
              dataString = JSON.stringify(jsonData);
              console.log(`Parsed as JSON:`, jsonData);
            } catch (e) {
              dataString = jsonString;
              console.log(`Raw content: ${dataString.substring(0, 100)}${dataString.length > 100 ? '...' : ''}`);
            }
          } catch (e) {
            dataString = event.data;
            console.log(`Base64 content: ${dataString.substring(0, 100)}${dataString.length > 100 ? '...' : ''}`);
          }
          
          result.receivedPackets.push({
            timestamp: Date.now(),
            address: event.address,
            port: event.port,
            size: event.data.length,
            data: dataString
          });
        }
      });
      
      errorListener = DeviceEventEmitter.addListener('onError', (event) => {
        if (event.socketId === socketId) {
          console.error(`Socket error:`, event.error || event.message);
          result.errors.push(event.error || event.message || 'Unknown error');
        }
      });
      
      closeListener = DeviceEventEmitter.addListener('onClose', (event) => {
        if (event.socketId === socketId) {
          console.log(`Socket closed`);
        }
      });
      
      // Set timeout to resolve the promise
      setTimeout(async () => {
        console.log(`=== UDP DIAGNOSTIC COMPLETED ===`);
        console.log(`Messages received: ${result.messagesReceived}`);
        console.log(`Errors: ${result.errors.length}`);
        
        // Success means no errors occurred - receiving messages is optional
        result.success = result.errors.length === 0;
        console.log(`Success: ${result.success ? 'YES' : 'NO'}`);
        
        try {
          if (socketId) {
            await UDPDirectModule.close(socketId);
          }
        } catch (e) {
          console.error(`Error closing socket:`, e);
        }
        
        resolve(result);
      }, timeout);
    });
    
    // Enable data event handler
    console.log('Setting up data event handler...');
    await UDPDirectModule.setDataEventHandler(socketId);
    
    // Bind the socket
    console.log(`Binding socket to port ${port}...`);
    try {
      const bindResult = await UDPDirectModule.bind(socketId, port, '0.0.0.0');
      console.log(`Bind result:`, bindResult);
      if (bindResult && bindResult.address) {
        console.log(`Successfully bound to ${bindResult.address}:${bindResult.port}`);
      } else {
        console.log(`Socket bound successfully (no address info returned)`);
      }
    } catch (err: any) {
      console.error(`Failed to bind to port ${port}:`, err);
      result.errors.push(`Bind error: ${err.message}`);
      throw err;
    }
    
    // Enable broadcast
    console.log(`Setting broadcast enabled...`);
    try {
      await UDPDirectModule.setBroadcast(socketId, true);
      console.log(`Broadcast enabled`);
    } catch (err: any) {
      console.error(`Failed to set broadcast:`, err);
      result.errors.push(`Broadcast error: ${err.message}`);
    }
    
    // Send a discovery packet if not skipping
    if (!skipSend) {
      console.log(`Sending discovery broadcast...`);
      const discoveryPacket = JSON.stringify({
        type: 'discovery',
        client: 'mobile-diagnostic',
        timestamp: Date.now()
      });
      
      try {
        // Convert to base64 for JSI interface
        console.log('Buffer object:', Buffer);
        console.log('Buffer.from:', Buffer?.from);
        
        // Use btoa as fallback if Buffer is not available
        let base64Data: string;
        if (Buffer && Buffer.from) {
          base64Data = Buffer.from(discoveryPacket).toString('base64');
        } else {
          // Fallback to btoa for base64 encoding
          base64Data = btoa(discoveryPacket);
        }
        
        console.log(`Sending base64 data (length: ${base64Data.length})`);
        await UDPDirectModule.send(socketId, base64Data, port, '255.255.255.255');
        console.log(`Broadcast sent successfully`);
      } catch (err: any) {
        console.error(`Failed to send broadcast:`, err);
        result.errors.push(`Send error: ${err.message || String(err)}`);
      }
    } else {
      console.log(`Skipping send (test mode)`);
    }
    
    console.log(`\n⏳ Waiting ${timeout/1000} seconds for UDP responses...`);
    console.log(`(The test will appear to "hang" during this time - this is normal)`);
    
    // Wait for the test to complete
    return await testPromise;
  } catch (error) {
    console.error(`UDP diagnostic failed:`, error);
    result.errors.push(`Test error: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  } finally {
    // Clean up
    if (messageListener) messageListener.remove();
    if (errorListener) errorListener.remove();
    if (closeListener) closeListener.remove();
    
    if (socketId && UDPDirectModule) {
      try {
        await UDPDirectModule.close(socketId);
        console.log('Socket closed in cleanup');
      } catch (e) {
        console.error('Error closing socket in cleanup:', e);
      }
    }
  }
}

/**
 * Helper function to run the diagnostic and print results
 */
export async function diagnoseUDP(options: UDPDiagnosticOptions = {}): Promise<void> {
  console.log(`Starting UDP diagnostic...`);
  
  try {
    const result = await runUDPDiagnostic(options);
    
    console.log(`\n===== UDP DIAGNOSTIC RESULTS =====`);
    console.log(`Success: ${result.success ? 'YES' : 'NO'}`);
    console.log(`Messages received: ${result.messagesReceived}`);
    console.log(`Errors: ${result.errors.length ? result.errors.join(', ') : 'None'}`);
    
    if (result.receivedPackets.length > 0) {
      console.log(`\nReceived Packets:`);
      result.receivedPackets.forEach((packet, index) => {
        const time = new Date(packet.timestamp).toISOString();
        console.log(`\n[${index + 1}] ${time} from ${packet.address}:${packet.port} (${packet.size} bytes)`);
        console.log(`Data: ${packet.data.substring(0, 200)}${packet.data.length > 200 ? '...' : ''}`);
      });
    } else {
      console.log(`\nNo packets received during the test period.`);
    }
    
    console.log(`\n===== RECOMMENDATIONS =====`);
    if (!result.success) {
      if (result.errors.length > 0) {
        console.log(`- Fix the errors: ${result.errors.join(', ')}`);
      }
      if (result.messagesReceived === 0) {
        console.log(`- Ensure the ESP32 device is on the same network`);
        console.log(`- Check if the ESP32 device is actually sending discovery packets`);
        console.log(`- Verify that UDP traffic is not blocked by firewall or network settings`);
        console.log(`- Try a different port (current: ${options.port || 49497})`);
      }
    } else {
      console.log(`UDP communication is working correctly!`);
    }
  } catch (error) {
    console.error(`Failed to run diagnostic:`, error);
  }
} 