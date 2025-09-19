#!/usr/bin/env node

const dgram = require('dgram');
const crypto = require('crypto');

// QUICVC constants
const QUICVC_PORT = 49497;
const QUICVC_VERSION = 0x00000001;

// Packet types
const PACKET_TYPE_PROTECTED = 0x02;

// Frame types  
const FRAME_TYPE_STREAM = 0x08;

// Create a mock ESP32 response
function createMockESP32Response(requestId) {
    // Create LED response data
    const responseData = {
        type: 'led_response',
        requestId: requestId,
        status: 'success',
        blue_led: 'on',
        manual_control: true,
        device_id: 'esp32_b8f86239de24'
    };
    
    // Create STREAM frame with LED response
    const streamFrame = {
        type: FRAME_TYPE_STREAM,
        streamId: 0x01, // LED control stream
        data: responseData
    };
    
    // Create PROTECTED packet header
    const packet = Buffer.alloc(1024);
    let offset = 0;
    
    // Flags (long header, PROTECTED type)
    packet[offset++] = 0x80 | PACKET_TYPE_PROTECTED;
    
    // Version (4 bytes)
    packet.writeUInt32BE(QUICVC_VERSION, offset);
    offset += 4;
    
    // DCID length and value (8 bytes of zeros - what ESP32 sends)
    packet[offset++] = 8;
    for (let i = 0; i < 8; i++) {
        packet[offset++] = 0;
    }
    
    // SCID length and value (MAC address + padding)
    packet[offset++] = 8;
    const mac = [0xb8, 0xf8, 0x62, 0x39, 0xde, 0x24, 0x00, 0x00];
    for (let i = 0; i < 8; i++) {
        packet[offset++] = mac[i];
    }
    
    // Packet number (1 byte)
    packet[offset++] = 1;
    
    // Frame data (JSON)
    const frameJson = JSON.stringify(streamFrame);
    const frameData = Buffer.from(frameJson, 'utf8');
    frameData.copy(packet, offset);
    offset += frameData.length;
    
    return packet.slice(0, offset);
}

// Send mock response
const client = dgram.createSocket('udp4');

// Generate a test requestId
const requestId = crypto.randomBytes(16).toString('hex');
console.log(`Sending mock ESP32 LED response with requestId: ${requestId}`);

const packet = createMockESP32Response(requestId);

// Send to localhost where the app is listening
client.send(packet, QUICVC_PORT, 'localhost', (err) => {
    if (err) {
        console.error('Error sending packet:', err);
    } else {
        console.log('Mock ESP32 response sent successfully');
        console.log('Packet details:');
        console.log('  - DCID: 00 00 00 00 00 00 00 00');
        console.log('  - SCID: b8 f8 62 39 de 24 00 00 (MAC-based)');
        console.log('  - Device ID in response: esp32_b8f86239de24');
    }
    
    client.close();
    
    // Keep process alive for a bit to see any responses
    setTimeout(() => {
        console.log('Test complete');
        process.exit(0);
    }, 2000);
});