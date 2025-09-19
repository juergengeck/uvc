#!/usr/bin/env node

/**
 * Simple test to check if ESP32 is listening on QUICVC port
 * Run with: npx ts-node test-quicvc-port.ts
 */

import dgram from 'dgram';

const QUICVC_PORT = 49498;
const ESP32_IP = '192.168.178.83';

const socket = dgram.createSocket('udp4');

// Send a simple probe packet
const testPacket = Buffer.from([
    0x00, // QUICVC_INITIAL
    0x00, 0x00, 0x00, 0x01, // Version
    0x10, 0x10, // CID lengths
    ...Array(32).fill(0), // Dummy CIDs
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, // Packet number
    0x10, // VC_INIT frame type
    ...Buffer.from('{"test": "probe"}')
]);

console.log(`Testing QUICVC on ${ESP32_IP}:${QUICVC_PORT}...`);

socket.on('message', (msg, rinfo) => {
    console.log(`✅ Received response from ${rinfo.address}:${rinfo.port}`);
    console.log(`   Size: ${msg.length} bytes`);
    console.log(`   First bytes: ${Array.from(msg.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
    process.exit(0);
});

socket.on('error', (err) => {
    console.error('❌ Socket error:', err);
    process.exit(1);
});

socket.send(testPacket, QUICVC_PORT, ESP32_IP, (err) => {
    if (err) {
        console.error('❌ Send error:', err);
        process.exit(1);
    }
    console.log('📤 Test packet sent');
});

// Timeout after 5 seconds
setTimeout(() => {
    console.log('⏱️  No response received within 5 seconds');
    console.log('The ESP32 might not be running QUICVC service on port', QUICVC_PORT);
    process.exit(1);
}, 5000);