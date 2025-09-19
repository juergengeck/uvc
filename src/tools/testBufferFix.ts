/**
 * Test if the Buffer.from() fix in one.core resolves the stack overflow issue
 */

// Import Buffer from one.core
import { Buffer } from '@refinio/one.core/lib/system/expo/buffer.js';

export function testBufferFix() {
  console.log('[testBufferFix] Starting Buffer.from() test after one.core fix...');
  
  try {
    // Test 1: Simple string to Buffer
    const str = 'Hello, World!';
    const buf1 = Buffer.from(str, 'utf8');
    console.log('[testBufferFix] ✅ Test 1 passed: Buffer.from(string) works');
    console.log('[testBufferFix] Result:', buf1.toString('base64'));
    
    // Test 2: Uint8Array to Buffer (this was causing stack overflow)
    const uint8Array = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const buf2 = Buffer.from(uint8Array);
    console.log('[testBufferFix] ✅ Test 2 passed: Buffer.from(Uint8Array) works');
    console.log('[testBufferFix] Result:', buf2.toString('base64'));
    
    // Test 3: Base64 string to Buffer
    const base64 = 'SGVsbG8gV29ybGQh';
    const buf3 = Buffer.from(base64, 'base64');
    console.log('[testBufferFix] ✅ Test 3 passed: Buffer.from(base64) works');
    console.log('[testBufferFix] Result:', buf3.toString('utf8'));
    
    // Test 4: Complex data for UDP discovery packet
    const discoveryData = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
    const buf4 = Buffer.from(discoveryData);
    const base64Result = buf4.toString('base64');
    console.log('[testBufferFix] ✅ Test 4 passed: Buffer.from(discovery packet) works');
    console.log('[testBufferFix] Result:', base64Result);
    
    console.log('[testBufferFix] 🎉 All tests passed! Buffer.from() is working correctly');
    return true;
  } catch (error) {
    console.error('[testBufferFix] ❌ Buffer.from() test failed:', error);
    if (error instanceof Error && error.stack) {
      console.error('[testBufferFix] Stack trace:', error.stack);
    }
    return false;
  }
}

// Also test if the LamaBuffer is properly initialized
export function checkBufferInitialization() {
  try {
    const LamaBuffer = (Buffer as any).LamaBuffer;
    console.log('[testBufferFix] LamaBuffer available:', !!LamaBuffer);
    console.log('[testBufferFix] LamaBuffer.from available:', typeof LamaBuffer?.from);
    console.log('[testBufferFix] LamaBuffer.isBuffer available:', typeof LamaBuffer?.isBuffer);
    console.log('[testBufferFix] LamaBuffer.concat available:', typeof LamaBuffer?.concat);
    console.log('[testBufferFix] LamaBuffer.alloc available:', typeof LamaBuffer?.alloc);
  } catch (error) {
    console.error('[testBufferFix] Error checking LamaBuffer:', error);
  }
}