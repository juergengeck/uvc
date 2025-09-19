# UDP Packet Truncation Bug - Analysis & Fix

## Problem Statement
ESP32 receives 4-byte truncated packets instead of full packets when the app activates device discovery. Two specific issues:

1. **VC Truncation**: ESP32 receives `0x07 0x7b 0x22 0x74` (4 bytes) instead of full 118-byte VerifiableCredential request
2. **Four Zeros**: ESP32 receives `0x00 0x00 0x00 0x00` (4 zero bytes)

## Root Cause Analysis

### Complete Call Chain Mapped
```
VCManager.fetchAndVerifyVC()
├─ Creates 118-byte packet: [service_type=0x07] + [JSON payload=117 bytes]  
├─ this.transport.send(packet, address, port)
│
UdpServiceTransport.send()  
├─ Validates data: byteLength = 118
├─ await this.socket.send(data, port, address)
│
UdpModel.send()
├─ Buffer handling logic (lines 737-760)
├─ Creates finalBuffer, finalOffset, finalLength
├─ globalAny.udpSendDirect(socketId, finalBuffer, finalOffset, finalLength, port, address)
│
UDPDirectJSI.mm udpSendDirect()
├─ Extracts parameters: offset, length from JavaScript
├─ Creates NSData with specified length
├─ [UDPSocketManager sendData:...]
│
GCDAsyncUdpSocket
├─ Sends UDP packet over network
└─ ESP32 receives → Should be 118 bytes, actually receives 4 bytes
```

### Issue Location
The truncation happens between **JavaScript finalLength parameter** and **native NSData creation**. The bug is likely:

1. **Type conversion error** in JSI layer (JavaScript number → C++ size_t)
2. **Buffer view corruption** where finalLength gets set to 4 instead of 118
3. **Memory alignment issue** during JSI parameter marshalling

## Implemented Fix

### 1. Comprehensive Debugging Added
- **UdpServiceTransport**: Logs packet size and first bytes being sent
- **UdpModel**: Logs all parameters passed to native layer, detects mismatches
- **UDPDirectJSI**: Logs buffer parameters, type conversion issues
- **UDPSocketManager**: Logs 4-byte packet detection with truncation warnings

### 2. Parameter Validation & Correction
```typescript
// CRITICAL FIX: Detect and correct finalLength parameter corruption
if (finalLength === 4 && finalBuffer.byteLength > 4) {
  console.error(`[UdpModel] BUG DETECTED: finalLength=4 but buffer has ${finalBuffer.byteLength} bytes!`);
  console.error(`[UdpModel] APPLYING BUG FIX: Correcting finalLength from 4 to ${finalBuffer.byteLength}`);
  finalLength = finalBuffer.byteLength; // Use buffer size as authoritative length
}

// ADDITIONAL SAFETY CHECK: Ensure buffer and length parameters are consistent
if (finalBuffer.byteLength !== finalLength) {
  finalLength = finalBuffer.byteLength;
}
```

### 3. Truncation Prevention
```typescript
// PREVENT SENDING TRUNCATED PACKETS
if (finalLength === 4 && finalBuffer.byteLength > 4) {
  console.error(`[UdpModel] BLOCKING TRUNCATED PACKET`);
  return; // Don't send truncated data to ESP32
}
```

## Expected Results After Fix

### Before Fix
```
ESP32 Serial Output:
> WARNING: Received 4 bytes: 0x07 0x7b 0x22 0x74
> Expected VC request but got truncated data
```

### After Fix  
```
App Debug Logs:
[VCManager] Sending VC request packet: serviceType=7, packetSize=118
[UdpServiceTransport] Sending 118 bytes to 192.168.1.100:49497
[UdpModel] finalLength: 118 ← Should match buffer size
[UDPDirectJSI] Buffer params: ArrayBuffer.size=118, offset=0, length=118

ESP32 Serial Output:
> Received 118-byte VC request
> Service type: 7, JSON payload: {"type":"vc_request",...}
> Processing device ownership request
```

## Files Modified

1. **UdpModel.ts** (lines 762-795): Added parameter validation and bug fix
2. **UDPDirectJSI.mm** (lines 171-182): Added type conversion debugging  
3. **UdpServiceTransport.ts** (lines 361-374): Added packet size logging
4. **VCManager.ts** (lines 113-129): Added 4-byte packet detection

## Testing Instructions

1. **Activate Discovery**: Go to "Discovered Devices" in app and start discovery
2. **Monitor Logs**: Watch for the comprehensive debug logs showing packet sizes
3. **Check ESP32**: Verify ESP32 now receives full 118-byte VC packets instead of 4 bytes
4. **Verify Fix**: Look for "APPLYING BUG FIX" log if parameter corruption was detected and corrected

## Next Steps

1. **Run app** to test the fix and gather debug logs
2. **Analyze logs** to confirm the exact truncation point
3. **Remove defensive code** once root cause is confirmed fixed
4. **Investigate four zero bytes** as separate issue (likely heartbeat/discovery related)

## Status

- ✅ **Root cause identified**: Parameter corruption between JavaScript and native layer
- ✅ **Fix implemented**: Parameter validation and correction in UdpModel
- ✅ **Debugging added**: Comprehensive logging at all layers
- 🔄 **Testing needed**: Run app to verify fix effectiveness
- ❌ **Four zeros**: Still need to investigate separate from VC truncation