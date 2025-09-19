/**
 * UDP Broadcast Test Utility
 * 
 * Simple utility to send UDP broadcast packets for testing ESP32 discovery.
 * This file can be executed directly from the command line using:
 * npx ts-node src/platform/udp-broadcast-test.ts
 */

import { createSocket } from './udp';
import { Buffer } from '@refinio/one.core/lib/system/expo/index.js';
import { UdpModel } from '../models/network/UdpModel';
import { NetworkServiceType } from '../models/network/interfaces';
import Debug from 'debug';

const PORT = 49497;
const BROADCAST_ADDRESS = '255.255.255.255';
const INTERVAL_MS = 1000;
const MESSAGE_COUNT = 10;

/**
 * Send a series of UDP broadcast packets
 */
async function sendBroadcastPackets() {
  console.log(`🔍 Starting UDP broadcast test (port ${PORT})...`);
  
  try {
    // Create a socket for sending
    console.log('🔌 Creating UDP socket...');
    const socket = await createSocket({ 
      type: 'udp4', 
      reuseAddr: true
    });
    console.log('✅ Socket created');
    
    // Enable broadcast mode
    console.log('📡 Enabling broadcast mode...');
    await new Promise<void>((resolve, reject) => {
      socket.setBroadcast(true, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
    console.log('✅ Broadcast mode enabled');
    
    // Bind to a port
    console.log(`🔌 Binding to port...`);
    await new Promise<void>((resolve, reject) => {
      socket.bind(0, '0.0.0.0', (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
    console.log('✅ Socket bound successfully');
    
    // Send packets at regular intervals
    console.log(`📣 Sending ${MESSAGE_COUNT} broadcast packets...`);
    
    for (let i = 1; i <= MESSAGE_COUNT; i++) {
      // Create a test message
      const message = {
        type: 'discovery-test',
        messageId: i,
        timestamp: Date.now(),
        source: 'udp-broadcast-test'
      };
      
      const messageBuffer = Buffer.from(JSON.stringify(message));
      
      // Send the message
      console.log(`📤 [${i}/${MESSAGE_COUNT}] Sending broadcast packet (${messageBuffer.length} bytes)...`);
      
      await new Promise<void>((resolve, reject) => {
        socket.send(messageBuffer, BROADCAST_ADDRESS, PORT, (error) => {
          if (error) {
            console.error(`❌ Failed to send packet: ${error.message}`);
            reject(error);
          } else {
            console.log(`✅ Packet sent successfully`);
            resolve();
          }
        });
      });
      
      // Wait before sending the next packet
      if (i < MESSAGE_COUNT) {
        await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
      }
    }
    
    // Close the socket
    console.log('👋 Closing socket...');
    await new Promise<void>((resolve) => {
      socket.close(() => resolve());
    });
    console.log('✅ Socket closed');
    
    console.log('🎉 UDP broadcast test completed successfully');
  } catch (error) {
    console.error('❌ UDP broadcast test failed:', error);
  }
}

// Auto-execute if this file is run directly
// In React Native context, this won't execute automatically
// We're keeping this logic for direct execution in Node.js environments
try {
  // @ts-ignore - This is for Node.js environments only
  if (typeof require !== 'undefined' && require.main === module) {
    sendBroadcastPackets().catch(console.error);
  }
} catch (error) {
  // Ignore errors in React Native environment
}

export { sendBroadcastPackets }; 