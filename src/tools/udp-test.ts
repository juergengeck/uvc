/**
 * UDP Testing Utility
 * 
 * This script tests the UDP functionality in the app.
 * It can be run with:
 * 
 * ```
 * npx ts-node src/tools/udp-test.ts
 * ```
 */

import * as udp from '../platform/udp';
import Debug from 'debug';

// Enable all debug output
Debug.enable('one:*');

const debug = Debug('one:tools:udp-test');

async function runTests() {
  console.log('===== UDP API Test =====');
  
  // Check if UDP is supported
  const isSupported = await udp.isUdpSupported();
  console.log(`UDP Support: ${isSupported ? 'Available' : 'Not Available'}`);
  
  if (!isSupported) {
    console.log('UDP is not supported, skipping tests.');
    return;
  }

  // Check UDP capabilities
  const capabilities = await udp.getUdpCapabilities();
  console.log('UDP Capabilities:', capabilities);

  try {
    // Create a receiver socket
    console.log('\n--- Creating receiver socket ---');
    const receiverSocket = await udp.createSocket({
      type: 'udp4',
      reuseAddr: true
    });
    
    // Bind to a port
    const PORT = 44444;
    console.log(`Binding to port ${PORT}...`);
    await receiverSocket.bind(PORT);
    
    // Set up message handler
    receiverSocket.on('message', (data, rinfo) => {
      let message: string;
      if (data instanceof Uint8Array) {
        message = new TextDecoder().decode(data);
      } else {
        message = data.toString();
      }
      console.log(`Received message: "${message}" from ${rinfo.address}:${rinfo.port}`);
    });
    
    console.log(`Receiver socket listening on port ${PORT}`);

    // Create sender socket
    console.log('\n--- Creating sender socket ---');
    const senderSocket = await udp.createSocket({
      type: 'udp4'
    });
    
    // Send a message
    const message = 'Hello UDP!';
    console.log(`Sending message: "${message}" to localhost:${PORT}...`);
    await senderSocket.send(message, PORT, '127.0.0.1');
    console.log('Message sent!');
    
    // Test broadcast
    console.log('\n--- Testing broadcast ---');
    console.log('Sending broadcast message...');
    await udp.sendBroadcast('Broadcast message', PORT);
    console.log('Broadcast sent!');

    // Wait a bit for the message to be received
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Close sockets
    console.log('\n--- Cleanup ---');
    console.log('Closing sender socket...');
    await senderSocket.close();
    console.log('Closing receiver socket...');
    await receiverSocket.close();
    
    console.log('\n===== UDP Test Complete =====');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the tests
runTests().catch(console.error);

export {}; 