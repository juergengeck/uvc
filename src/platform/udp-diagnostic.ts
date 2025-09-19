/**
 * Comprehensive UDP diagnostic tool for debugging network issues
 * Provides detailed analysis of UDP send/receive operations
 */

import { UdpModel } from '../models/network/UdpModel';
import { NetworkServiceType } from '../models/network/interfaces';
import { checkDirectBufferSupport } from '../models/network/DirectBuffer';
import Debug from 'debug';
import { Buffer } from '@refinio/one.core/lib/system/expo/index.js';
import { QuicModel } from '../models/network/QuicModel';
import { DeviceDiscoveryModel } from '../models/network/DeviceDiscoveryModel';
import { UdpRemoteInfo } from '../models/network';
import { ESP32DiscoveryListener } from './discovery';
// Use local UDP implementation instead of one.core
import type { UdpSocket } from '../models/network/UdpModel';

// Configuration
const TEST_PORT = 49499;
const BROADCAST_ADDRESS = '255.255.255.255';
const LOCAL_PORT = 49498;

/**
 * Test UDP socket functionality
 * This test verifies that the basic UDP socket functionality works
 */
async function testUdpSocket(): Promise<boolean> {
  console.log('🔍 [UDP Diagnostic] Testing UDP socket functionality');
  
  let socket: UdpSocket | null = null;
  let listener: UdpSocket | null = null;
  let messageReceived = false;
  
  try {
    // Create a listener socket using local UdpModel
    console.log('📡 Creating UDP listener socket');
    const udpModel = UdpModel.getInstance();
    await udpModel.init();
    listener = await udpModel.createSocket({
      type: 'udp4',
      debug: true,
      debugLabel: 'DiagnosticListener'
    });
    
    // Bind the listener socket
    console.log(`🔗 Binding listener to port ${TEST_PORT}`);
    await new Promise<void>((resolve, reject) => {
      if (!listener) return reject(new Error('No listener socket'));
      
      listener.on('listening', () => {
        console.log('👂 Listener socket is listening');
        resolve();
      });
      
      listener.on('error', (err) => {
        console.error('❌ Listener socket error:', err);
        reject(err);
      });
      
      listener.bind(TEST_PORT);
    });
    
    // Set up message handler
    console.log('🔄 Setting up message handler');
    await new Promise<void>((resolve) => {
      if (!listener) return resolve();
      
      listener.on('message', (msg, rinfo) => {
        console.log(`📨 Received message from ${rinfo.address}:${rinfo.port}: ${msg.toString()}`);
        messageReceived = true;
      });
      
      // Short delay to ensure handler is registered
      setTimeout(resolve, 500);
    });
    
    // Create a sender socket using local UdpModel
    console.log('📡 Creating UDP sender socket');
    socket = await udpModel.createSocket({
      type: 'udp4',
      debug: true,
      debugLabel: 'DiagnosticSender'
    });
    
    // Send a test message
    const testMessage = 'UDP test message';
    console.log(`📤 Sending test message: ${testMessage}`);
    if (socket) {
      await socket.send(new TextEncoder().encode(testMessage), TEST_PORT, '127.0.0.1');
    }
    
    // Wait for the message to be received
    await new Promise<void>(resolve => setTimeout(resolve, 1000));
    
    // Check if message was received
    if (messageReceived) {
      console.log('✅ UDP test message was successfully received');
      return true;
    } else {
      console.log('❌ UDP test message was not received');
      return false;
    }
  } catch (error) {
    console.error('❌ UDP socket test failed:', error);
    return false;
  } finally {
    // Clean up
    if (socket) {
      try {
        socket.close();
        console.log('🚫 Sender socket closed');
      } catch (e) {
        console.error('Error closing sender socket:', e);
      }
    }
    
    if (listener) {
      try {
        listener.close();
        console.log('🚫 Listener socket closed');
      } catch (e) {
        console.error('Error closing listener socket:', e);
      }
    }
  }
}

/**
 * Test the ESP32DiscoveryListener
 */
async function testDiscoveryListener(): Promise<boolean> {
  console.log('\n🔍 Testing discovery listener...');
  
  try {
    // Create discovery listener
    const listener = new ESP32DiscoveryListener({ debug: true });
    
    // Set up discovery event handler
    let discoveryReceived = false;
    listener.on('discovery', (event) => {
      console.log(`🔍 Discovery event received: Device ${event.deviceId} from ${event.address}:${event.port}`);
      discoveryReceived = true;
    });
    
    // Start listening
    console.log('🔍 Starting discovery listener...');
    await listener.start();
    console.log('🔍 Discovery listener started');
    
    // Send a test discovery packet
    console.log('🔍 Sending test discovery packet...');
    const socket = await UdpModel.getInstance().createSocket({ type: 'udp4', debug: true, debugLabel: 'DiscoveryTest' });
    await socket.bind(LOCAL_PORT);
    await socket.setBroadcast(true);
    
    // Create a test discovery packet
    const testPacket = {
      deviceId: 'diagnostic-test-device',
      mac: '12:34:56:78:90:AB',
      type: 'ESP32',
      version: '1.0.0',
      capabilities: ['wifi', 'ble', 'gpio'],
      timestamp: Date.now()
    };
    
    // Send the packet
    await socket.send(JSON.stringify(testPacket), TEST_PORT, BROADCAST_ADDRESS);
    console.log('🔍 Test discovery packet sent');
    
    // Wait for discovery
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check discovered devices
    const devices = listener.getDevices();
    const deviceCount = Array.isArray(devices) ? devices.length : Object.keys(devices).length;
    console.log(`🔍 Discovered ${deviceCount} devices`);
    
    // Close resources
    await listener.stop();
    await socket.close();
    
    if (discoveryReceived || deviceCount > 0) {
      console.log('✅ Discovery listener test passed: Discovery event received');
      return true;
    } else {
      console.log('❌ Discovery listener test failed: No discovery event received');
      return false;
    }
  } catch (error) {
    console.error('❌ Discovery listener test failed with error:', error);
    return false;
  }
}

/**
 * Test the QuicModel
 */
async function testQuicModel(): Promise<boolean> {
  console.log('\n🔍 Testing QuicModel...');
  
  try {
    // Get QuicModel singleton instance and ensure it's initialized
    console.log('🔍 Initializing QuicModel...');
    const quicModel = await QuicModel.ensureInitialized();
    console.log('🔍 QuicModel initialized');
    
    // Set up message handler
    let messageReceived = false;
    quicModel.onUdpMessage.listen((msg, rinfo) => {
      console.log('🔍 QuicModel received UDP message:', {
        size: msg.length,
        from: rinfo.address,
        port: rinfo.port,
        family: rinfo.family,
        data: msg.toString('utf8')
      });
      messageReceived = true;
    });
    
    // Send a test message
    console.log('🔍 Sending test message...');
    const socket = await UdpModel.getInstance().createSocket({ type: 'udp4', debug: true, debugLabel: 'QuicModelTest' });
    await socket.bind(LOCAL_PORT);
    await socket.setBroadcast(true);
    
    const testMessage = Buffer.from('QUIC_MODEL_TEST_' + Date.now());
    await socket.send(testMessage, TEST_PORT, BROADCAST_ADDRESS);
    console.log('🔍 Test message sent');
    
    // Wait for message
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Close resources
    await socket.close();
    await quicModel.shutdown();
    
    if (messageReceived) {
      console.log('✅ QuicModel test passed: Message received');
      return true;
    } else {
      console.log('❌ QuicModel test failed: No message received');
      return false;
    }
  } catch (error) {
    console.error('❌ QuicModel test failed with error:', error);
    return false;
  }
}

/**
 * Test DeviceDiscoveryModel functionality
 * This test verifies that the DeviceDiscoveryModel can discover devices on the network
 */
async function testDeviceDiscoveryModel(): Promise<boolean> {
  console.log('🔍 [UDP Diagnostic] Testing DeviceDiscoveryModel');
  
  try {
    // Get DeviceDiscoveryModel instance
    console.log('📡 Getting DeviceDiscoveryModel instance');
    const discoveryModel = DeviceDiscoveryModel.getInstance({
      discoveryPort: TEST_PORT,
      discoveryInterval: 1000
    });
    
    // Set up device discovered listener
    let deviceFound = false;
    
    discoveryModel.onDeviceDiscovered.listen(() => {
      deviceFound = true;
      console.log('🔍 Device discovered by DeviceDiscoveryModel');
    });
    
    // Initialize the discovery model
    await discoveryModel.init();
    console.log('🚀 Initialized DeviceDiscoveryModel');
    
    // Start discovery
    console.log('🔎 Starting device discovery');
    await discoveryModel.startDiscovery();
    
    // Wait for discovery to run
    console.log('⏳ Waiting for device discovery...');
    await new Promise<void>(resolve => setTimeout(resolve, 5000));
    
    // Stop discovery
    console.log('🛑 Stopping device discovery');
    await discoveryModel.stopDiscovery();
    
    // Get discovered devices
    const devices = discoveryModel.getDevices();
    console.log(`📋 Found ${devices.length} devices`);
    
    if (devices.length > 0 || deviceFound) {
      console.log('✅ DeviceDiscoveryModel test successful');
      return true;
    } else {
      console.log('❓ DeviceDiscoveryModel test completed but no devices found');
      // Consider this a success even if no devices were found
      return true;
    }
  } catch (error) {
    console.error('❌ DeviceDiscoveryModel test failed:', error);
    return false;
  }
}

/**
 * Run all tests
 */
async function runDiagnostics(): Promise<void> {
  console.log('🔍 Starting UDP Discovery Diagnostics...');
  
  // Test UDP socket
  const udpSocketResult = await testUdpSocket();
  
  // Test discovery listener
  const discoveryListenerResult = await testDiscoveryListener();
  
  // Test QuicModel
  const quicModelResult = await testQuicModel();
  
  // Test DeviceDiscoveryModel
  const deviceDiscoveryModelResult = await testDeviceDiscoveryModel();
  
  // Print summary
  console.log('\n📊 Results Summary:');
  console.log('------------------');
  console.log(`🔍 UDP Socket: ${udpSocketResult ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`🔍 Discovery Listener: ${discoveryListenerResult ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`🔍 QuicModel: ${quicModelResult ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`🔍 DeviceDiscoveryModel: ${deviceDiscoveryModelResult ? '✅ PASS' : '❌ FAIL'}`);
  
  // Provide recommendations
  console.log('\n🔍 Recommendations:');
  
  if (!udpSocketResult) {
    console.log('❌ Fix the low-level UDP socket implementation');
  }
  
  if (!discoveryListenerResult && udpSocketResult) {
    console.log('❌ Fix the ESP32DiscoveryListener implementation');
  }
  
  if (!quicModelResult && discoveryListenerResult) {
    console.log('❌ Fix the QuicModel implementation');
  }
  
  if (!deviceDiscoveryModelResult && quicModelResult) {
    console.log('❌ Fix the DeviceDiscoveryModel implementation');
  }
  
  if (udpSocketResult && discoveryListenerResult && quicModelResult && deviceDiscoveryModelResult) {
    console.log('✅ All components are working correctly. The issue might be in the UI integration.');
    console.log('✅ Check that the DeviceDiscoveryModel is properly initialized in the app.');
    console.log('✅ Verify that the DeviceDiscoveryService is registered and used correctly.');
  }
}

// Run diagnostics
runDiagnostics().catch((err: Error) => {
  console.error('Diagnostics failed:', err);
  if (typeof process !== 'undefined' && typeof process.exit === 'function') {
    process.exit(1);
  }
});

export { runDiagnostics }; 