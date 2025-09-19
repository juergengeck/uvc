/**
 * UDP Test Script
 * 
 * This script provides a simple way to test UDP socket functionality.
 * It creates a UDP socket, binds to a port, and logs all incoming messages.
 * It can also send test messages to verify bidirectional communication.
 */

import { UdpModel } from '../models/network/UdpModel';
import { NetworkServiceType } from '../models/network/interfaces';
import { checkDirectBufferSupport } from '../models/network/DirectBuffer';
import Debug from 'debug';
import { Buffer } from '@refinio/one.core/lib/system/expo/index.js';

// Configuration
const TEST_PORT = 49497;
const TEST_ADDRESS = '0.0.0.0';
const DEBUG = true;

/**
 * Log a message with timestamp
 */
function log(message: string, ...args: any[]): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, ...args);
}

/**
 * Run the UDP test
 */
async function runUdpTest(): Promise<void> {
  log('Starting UDP test...');
  
  try {
    // Get QuicModel singleton instance
    const quicModel = QuicModel.getInstance();
    log('Initializing QuicModel...');
    await quicModel.init();
    log('QuicModel initialized successfully');
    
    // Create a UDP socket
    log('Creating UDP socket...');
    const socket = await quicModel.createUdpSocket({
      type: 'udp4',
      reuseAddr: true,
      broadcast: true
    });
    log('UDP socket created');
    
    // Set up message handler with detailed logging
    socket.on('message', (msg: Buffer, rinfo: any) => {
      log('Received UDP message:', {
        size: msg.length,
        from: rinfo.address,
        port: rinfo.port,
        family: rinfo.family,
        // Show first 32 bytes as hex for debugging
        hexData: [...msg.slice(0, 32)].map(b => b.toString(16).padStart(2, '0')).join(' '),
        // Try to interpret as string if possible
        stringData: msg.toString('utf8').replace(/[^\x20-\x7E]/g, '.') // Replace non-printable chars
      });
    });
    
    // Bind to test port
    log(`Binding UDP socket to ${TEST_ADDRESS}:${TEST_PORT}...`);
    try {
      await socket.bind(TEST_PORT, TEST_ADDRESS);
      log(`UDP socket bound to ${TEST_ADDRESS}:${TEST_PORT}`);
    } catch (error) {
      log('Failed to bind UDP socket:', error);
      throw error;
    }
    
    // Set broadcast mode
    log('Setting broadcast mode...');
    await socket.setBroadcast(true);
    log('Broadcast mode set');
    
    // Send a test broadcast message
    const testMessage = Buffer.from('LAMA_UDP_TEST_' + Date.now());
    log(`Sending test broadcast message: ${testMessage.toString()}`);
    await socket.send(testMessage, TEST_PORT, '255.255.255.255');
    log('Test message sent');
    
    // Keep the process running
    log('Listening for UDP messages. Press Ctrl+C to stop.');
    
    // Set up periodic test broadcasts
    setInterval(async () => {
      const periodicMsg = Buffer.from('LAMA_PERIODIC_' + Date.now());
      log(`Sending periodic broadcast: ${periodicMsg.toString()}`);
      try {
        await socket.send(periodicMsg, TEST_PORT, '255.255.255.255');
        log('Periodic message sent');
      } catch (err) {
        log('Error sending periodic message:', err);
      }
    }, 10000); // Every 10 seconds
    
  } catch (error) {
    log('UDP test failed:', error);
  }
}

// Run the test
runUdpTest().catch(err => {
  log('Unhandled error:', err);
}); 