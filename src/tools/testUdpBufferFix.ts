/**
 * Test script to verify UDP buffer fix
 */
import { UdpModel } from '../models/network/UdpModel';

async function testUdpBufferFix() {
  console.log('[TEST] Starting UDP buffer fix test...');
  
  try {
    // Initialize UdpModel
    const udpModel = UdpModel.getInstance();
    await udpModel.init();
    
    // Create a test socket
    const socket = await udpModel.createSocket({
      type: 'udp4',
      broadcast: true,
      debugLabel: 'BufferTest'
    });
    
    // Bind to a test port
    await socket.bind(0, '0.0.0.0');
    await socket.setBroadcast(true);
    
    // Test Case 1: Simple Uint8Array
    console.log('[TEST] Test Case 1: Simple Uint8Array');
    const simpleData = new Uint8Array([1, 2, 3, 4, 5]);
    await socket.send(simpleData, 49497, '255.255.255.255');
    console.log('[TEST] ✓ Simple Uint8Array sent successfully');
    
    // Test Case 2: Uint8Array with concatenation (like DiscoveryProtocol)
    console.log('[TEST] Test Case 2: Concatenated Uint8Array');
    const part1 = new Uint8Array([1]); // Service type byte
    const part2 = new TextEncoder().encode(JSON.stringify({ test: 'data' }));
    const concatenated = new Uint8Array(part1.length + part2.length);
    concatenated.set(part1, 0);
    concatenated.set(part2, part1.length);
    
    console.log(`[TEST] Concatenated array info:`);
    console.log(`  - byteLength: ${concatenated.byteLength}`);
    console.log(`  - byteOffset: ${concatenated.byteOffset}`);
    console.log(`  - buffer.byteLength: ${concatenated.buffer.byteLength}`);
    
    await socket.send(concatenated, 49497, '255.255.255.255');
    console.log('[TEST] ✓ Concatenated Uint8Array sent successfully');
    
    // Test Case 3: String data
    console.log('[TEST] Test Case 3: String data');
    await socket.send('Hello UDP!', 49497, '255.255.255.255');
    console.log('[TEST] ✓ String data sent successfully');
    
    // Clean up
    await socket.close();
    console.log('[TEST] All tests passed! Buffer fix appears to be working.');
    
  } catch (error) {
    console.error('[TEST] Test failed:', error);
    console.error('[TEST] Stack trace:', error.stack);
  }
}

// Run the test
testUdpBufferFix().catch(console.error);