#!/usr/bin/env node

/**
 * Connection Debug Script
 * 
 * Tests WebSocket connectivity to the communication server
 */

const WebSocket = require('ws');

console.log('🔍 Testing WebSocket Connection...\n');

const TEST_URL = 'wss://comm10.dev.refinio.one';
const TIMEOUT = 30000; // 30 seconds

console.log(`📡 Attempting connection to: ${TEST_URL}`);
console.log(`⏱️  Timeout set to: ${TIMEOUT / 1000} seconds\n`);

let connectionTimeout;
let isComplete = false;

const ws = new WebSocket(TEST_URL);

// Set up timeout
connectionTimeout = setTimeout(() => {
  if (!isComplete) {
    console.log('❌ Connection timeout after 30 seconds');
    console.log('   This matches the error seen in the app logs');
    console.log('   Possible causes:');
    console.log('   - Server is unavailable or overloaded');
    console.log('   - Network connectivity issues');
    console.log('   - Firewall blocking WebSocket connections');
    console.log('   - DNS resolution problems');
    isComplete = true;
    
    try {
      ws.close();
    } catch (e) {
      // Ignore close errors
    }
    
    process.exit(1);
  }
}, TIMEOUT);

ws.on('open', () => {
  if (isComplete) return;
  isComplete = true;
  
  clearTimeout(connectionTimeout);
  console.log('✅ WebSocket connection opened successfully!');
  console.log('   The server is reachable and accepting connections');
  console.log('   The app timeout might be due to other factors:');
  console.log('   - Authentication/handshake issues');
  console.log('   - one.models connection protocol problems');
  console.log('   - Race conditions in connection establishment');
  
  ws.close();
  process.exit(0);
});

ws.on('error', (error) => {
  if (isComplete) return;
  isComplete = true;
  
  clearTimeout(connectionTimeout);
  console.log('❌ WebSocket connection error:');
  console.log(`   ${error.message}`);
  console.log('   This indicates a connection-level problem');
  
  process.exit(1);
});

ws.on('close', (code, reason) => {
  if (isComplete) return;
  
  console.log(`🔒 WebSocket closed: ${code} ${reason}`);
  
  if (code === 1000) {
    console.log('   Normal closure - connection was established successfully');
  } else {
    console.log('   Abnormal closure - this may indicate server issues');
  }
}); 