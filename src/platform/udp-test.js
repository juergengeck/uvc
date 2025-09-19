/**
 * UDP Test Script (JavaScript version)
 * 
 * This script provides a simple way to test UDP socket functionality.
 * It creates a UDP socket, binds to a port, and logs all incoming messages.
 * It can also send test messages to verify bidirectional communication.
 */

const dgram = require('dgram');

// Configuration
const TEST_PORT = 49497;
const TEST_ADDRESS = '0.0.0.0';
const DEBUG = true;

/**
 * Log a message with timestamp
 */
function log(message, ...args) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, ...args);
}

/**
 * Run the UDP test
 */
async function runUdpTest() {
  log('Starting UDP test...');
  
  try {
    // Create a UDP socket
    log('Creating UDP socket...');
    const socket = dgram.createSocket({
      type: 'udp4',
      reuseAddr: true
    });
    log('UDP socket created');
    
    // Set up message handler with detailed logging
    socket.on('message', (msg, rinfo) => {
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
    
    // Handle errors
    socket.on('error', (error) => {
      log('Socket error:', error);
    });
    
    // Handle socket close
    socket.on('close', () => {
      log('Socket closed');
    });
    
    // Bind to test port
    log(`Binding UDP socket to ${TEST_ADDRESS}:${TEST_PORT}...`);
    await new Promise((resolve, reject) => {
      socket.bind(TEST_PORT, TEST_ADDRESS, (error) => {
        if (error) {
          log('Failed to bind UDP socket:', error);
          reject(error);
        } else {
          log(`UDP socket bound to ${TEST_ADDRESS}:${TEST_PORT}`);
          resolve();
        }
      });
    });
    
    // Set broadcast mode
    log('Setting broadcast mode...');
    socket.setBroadcast(true);
    log('Broadcast mode set');
    
    // Send a test broadcast message
    const testMessage = Buffer.from('LAMA_UDP_TEST_' + Date.now());
    log(`Sending test broadcast message: ${testMessage.toString()}`);
    await new Promise((resolve, reject) => {
      socket.send(testMessage, 0, testMessage.length, TEST_PORT, '255.255.255.255', (error) => {
        if (error) {
          log('Failed to send test message:', error);
          reject(error);
        } else {
          log('Test message sent');
          resolve();
        }
      });
    });
    
    // Keep the process running
    log('Listening for UDP messages. Press Ctrl+C to stop.');
    
    // Set up periodic test broadcasts
    setInterval(async () => {
      const periodicMsg = Buffer.from('LAMA_PERIODIC_' + Date.now());
      log(`Sending periodic broadcast: ${periodicMsg.toString()}`);
      try {
        await new Promise((resolve, reject) => {
          socket.send(periodicMsg, 0, periodicMsg.length, TEST_PORT, '255.255.255.255', (error) => {
            if (error) {
              log('Failed to send periodic message:', error);
              reject(error);
            } else {
              log('Periodic message sent');
              resolve();
            }
          });
        });
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