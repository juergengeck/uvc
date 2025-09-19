/**
 * Debug script to test VCManager packet creation and identify truncation point
 * 
 * This script reproduces the exact packet creation logic from VCManager
 * to identify where the truncation from full packet to 4 bytes occurs.
 */

// Simulate the VCManager packet creation process
console.log('=== VCManager Packet Creation Debug ===');

// 1. Create the request message (same as VCManager line 102-107)
const requestMessage = { 
  type: 'vc_request',
  requesterPersonId: 'test-person-id-12345',
  timestamp: Date.now(),
  nonce: 'test-nonce-12345'
};

console.log('1. Request message object:');
console.log(JSON.stringify(requestMessage, null, 2));

// 2. JSON stringify (same as VCManager line 108)
const jsonString = JSON.stringify(requestMessage);
console.log('\n2. JSON string:');
console.log('Length:', jsonString.length, 'characters');
console.log('Content:', jsonString);

// 3. TextEncoder encode (same as VCManager line 108)
const messageData = new TextEncoder().encode(jsonString);
console.log('\n3. TextEncoder result:');
console.log('Type:', messageData.constructor.name);
console.log('Length:', messageData.length, 'bytes');
console.log('byteLength:', messageData.byteLength);
console.log('First 20 bytes:', Array.from(messageData.slice(0, 20)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

// 4. Create packet array (same as VCManager line 109-111)
const packet = new Uint8Array(1 + messageData.length);
packet[0] = 7; // NetworkServiceType.VC_EXCHANGE_SERVICE
packet.set(messageData, 1);

console.log('\n4. Final packet:');
console.log('Type:', packet.constructor.name);
console.log('Total length:', packet.length, 'bytes');
console.log('byteLength:', packet.byteLength);
console.log('buffer.byteLength:', packet.buffer.byteLength);
console.log('byteOffset:', packet.byteOffset);

// Check for buffer view issues
console.log('\n5. Buffer analysis:');
console.log('Is packet same size as underlying buffer?', packet.byteLength === packet.buffer.byteLength);
console.log('Is packet at start of buffer?', packet.byteOffset === 0);

// 6. Test first 8 bytes (what ESP32 should receive)
console.log('\n6. First 8 bytes that should be sent:');
const first8 = Array.from(packet.slice(0, 8)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
console.log('Hex:', first8);
const first8Chars = Array.from(packet.slice(1, 5)).map(b => String.fromCharCode(b)).join('');
console.log('Text after service type:', first8Chars);

// 7. Test what would happen if only 4 bytes are sent
console.log('\n7. If only 4 bytes sent (what ESP32 receives):');
const only4bytes = Array.from(packet.slice(0, 4)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ');
console.log('Would be:', only4bytes);
const text = Array.from(packet.slice(1, 4)).map(b => String.fromCharCode(b)).join('');
console.log('Text portion:', text, '(should be \'{"t\')');

// 8. Test buffer view scenario that might cause issues
console.log('\n8. Buffer view simulation:');
const largerBuffer = new ArrayBuffer(1000);
const view = new Uint8Array(largerBuffer, 10, packet.length); // offset=10, length=packet.length
view.set(packet);

console.log('View length:', view.length);
console.log('View byteLength:', view.byteLength);  
console.log('View byteOffset:', view.byteOffset);
console.log('Underlying buffer size:', view.buffer.byteLength);
console.log('Is view different size than buffer?', view.byteLength !== view.buffer.byteLength);

console.log('\n=== Analysis Complete ===');
console.log('Expected behavior: ESP32 should receive', packet.length, 'bytes starting with 0x07 {"type":"vc_request"...');
console.log('Actual behavior: ESP32 receives only 4 bytes: 0x07 0x7b 0x22 0x74');
console.log('This indicates truncation in the native send path, not in packet creation.');