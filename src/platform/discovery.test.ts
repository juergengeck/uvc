/**
 * ESP32 Discovery Test Script
 * 
 * This script tests the ESP32 discovery listener by:
 * 1. Starting the discovery listener
 * 2. Sending a test discovery packet
 * 3. Logging any discovered devices
 */

import { createSocket } from './udp';
import { discoveryListener, DiscoveryEvent } from './discovery';

// Test configuration
const TEST_PORT = 49497; // Standard discovery port
const BROADCAST_ADDRESS = '255.255.255.255';
const LOCAL_PORT = 12345;

/**
 * Send a test discovery packet
 */
async function sendTestDiscoveryPacket(): Promise<void> {
  console.log('🔍 Sending test discovery packet...');
  
  // Create a socket for sending
  const socket = createSocket({ 
    type: 'udp4', 
    debug: true,
    debugLabel: 'TestDiscovery' 
  });
  
  // Bind to a local port
  await socket.bind(LOCAL_PORT);
  
  // Enable broadcasting
  await socket.setBroadcast(true);
  
  // Create a test discovery packet (similar to what an ESP32 might send)
  const testPacket = {
    deviceId: 'test-esp32-device',
    mac: '12:34:56:78:90:AB',
    type: 'ESP32',
    version: '1.0.0',
    capabilities: ['wifi', 'ble', 'gpio'],
    timestamp: Date.now()
  };
  
  // Convert to JSON string
  const message = JSON.stringify(testPacket);
  
  // Send the packet
  await socket.send(message, TEST_PORT, BROADCAST_ADDRESS);
  console.log(`🔍 Sent test discovery packet to ${BROADCAST_ADDRESS}:${TEST_PORT}`);
  
  // Close the socket after a delay
  setTimeout(async () => {
    await socket.close();
    console.log('🔍 Test socket closed');
  }, 1000);
}

/**
 * Log discovered devices
 */
function logDiscoveredDevices(): void {
  const devices = discoveryListener.getDevices();
  
  console.log(`🔍 Discovered ${devices.length} devices:`);
  
  devices.forEach((device: DiscoveryEvent) => {
    console.log(`🔍 Device: ${device.deviceId}`);
    console.log(`🔍   Address: ${device.address}:${device.port}`);
    console.log(`🔍   Timestamp: ${new Date(device.timestamp).toISOString()}`);
    console.log(`🔍   Data:`, typeof device.data === 'object' ? JSON.stringify(device.data, null, 2) : device.data);
    console.log('---');
  });
}

/**
 * Run the test
 */
async function runTest(): Promise<void> {
  console.log('🔍 Starting ESP32 discovery test...');
  
  // Listen for discovery events
  discoveryListener.on('discovery', (event: DiscoveryEvent) => {
    console.log(`🔍 DISCOVERY EVENT: Device ${event.deviceId} from ${event.address}:${event.port}`);
  });
  
  // Wait a moment for the listener to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Send a test discovery packet
  await sendTestDiscoveryPacket();
  
  // Wait a moment for discovery to happen
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Log discovered devices
  logDiscoveredDevices();
  
  console.log('🔍 Test complete!');
}

// Export functions for external use
export { runTest, sendTestDiscoveryPacket };

// Automatically run the test when imported
// This can be controlled by environment variables in a real implementation
runTest().catch(err => {
  console.error('Test failed:', err);
}); 