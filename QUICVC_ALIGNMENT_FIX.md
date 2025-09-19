# QUICVC Protocol Alignment Fixes

## Issues Identified

### 1. INITIAL Packet Header Format Mismatch
**Problem**: ESP32 and App have different expectations for INITIAL packet header structure
- ESP32: `flags(1) + version(4) + dcid_len(1) + dcid(N) + scid_len(1) + scid(N) + packet_number(1)`
- App expects: Same format but sometimes looks for token length field

**Fix**: Both sides should follow QUIC RFC 9000 format consistently

### 2. Discovery Frame Type Inconsistency
**Problem**: Different frame type codes for DISCOVERY
- ESP32: Uses `0x30` 
- App: Expects `0x01`

**Fix**: Standardize on `0x30` for DISCOVERY frames

### 3. VC_RESPONSE Packet Type Confusion
**Problem**: ESP32 correctly sends VC_RESPONSE in HANDSHAKE packets, but app expects them in INITIAL packets
- ESP32: VC_RESPONSE in HANDSHAKE (0x01) packets - correct
- App: Looks for VC_RESPONSE in INITIAL (0x00) packets - incorrect

**Fix**: App should handle VC_RESPONSE in HANDSHAKE packets

### 4. Packet Type Flag Encoding
**Problem**: Inconsistent packet type encoding in header flags
- ESP32: `0xC0 | ((packet_type & 0x03) << 4)` 
- App: Different interpretation

**Fix**: Standardize on QUIC RFC format

## Implementation Fixes

### ESP32 Firmware Fix (main.c)

```c
// Line 385-399: Add explicit comment about no token field
// Build discovery packet manually with correct format
uint8_t packet[MAX_PACKET_SIZE];
size_t packet_len = 0;

// QUICVC header - INITIAL packet type (0xC0)
packet[packet_len++] = 0xC0;  // Long header, INITIAL type (bits 4-5 = 00)
// Version (4 bytes)
packet[packet_len++] = 0x00;
packet[packet_len++] = 0x00; 
packet[packet_len++] = 0x00;
packet[packet_len++] = 0x01;
// DCID length and DCID
packet[packet_len++] = 8;
memset(packet + packet_len, 0, 8);
packet_len += 8;
// SCID length and SCID
packet[packet_len++] = 8;
memcpy(packet + packet_len, device_mac, 6);
packet[packet_len + 6] = 0;
packet[packet_len + 7] = 0;
packet_len += 8;
// NO TOKEN LENGTH FIELD for INITIAL packets in our implementation
// Packet number
packet[packet_len++] = 0x00;
```

### React Native App Fixes

#### 1. Fix ESP32ConnectionManager.ts (lines 1326-1329)
```typescript
// OLD CODE:
} else if (frameType === 0x01) { // DISCOVERY frame (as per spec)
  // Skip discovery frames in INITIAL packets
  debug(`Skipping DISCOVERY frame in INITIAL packet`);
}

// FIXED CODE:
} else if (frameType === 0x30) { // DISCOVERY frame - match ESP32 
  // Skip discovery frames in INITIAL packets
  debug(`Skipping DISCOVERY frame (0x30) in INITIAL packet`);
}
```

#### 2. Fix packet type extraction (ESP32ConnectionManager.ts)
```typescript
// Add proper packet type extraction from flags
private parseQuicVCPacketType(flags: number): number {
  // Extract packet type from bits 4-5 of flags byte
  return (flags >> 4) & 0x03;
}
```

#### 3. Fix VC_RESPONSE handling to accept HANDSHAKE packets
```typescript
// In ESP32ConnectionManager constructor, also listen for HANDSHAKE packets
if (this.quicModel) {
  // Listen for both INITIAL and HANDSHAKE packets from ESP32
  this.quicModel.onQuicVCInitial.listen((data: Buffer, rinfo: any) => {
    this.handleQuicVCInitial(data, rinfo);
  });
  
  this.quicModel.onQuicVCHandshake.listen((data: Buffer, rinfo: any) => {
    this.handleQuicVCHandshake(data, rinfo);  // This already exists!
  });
}
```

#### 4. Fix QuicVCConnectionManager.ts parsePacketHeader (lines 723-745)
```typescript
private parsePacketHeader(data: Uint8Array): QuicVCPacketHeader | null {
    if (data.length < 15) return null;
    
    let offset = 0;
    
    // Parse flags and extract packet type
    const flags = data[offset++];
    const longHeader = (flags & 0x80) !== 0;
    const packetType = (flags >> 4) & 0x03; // Extract from bits 4-5
    
    // Version (4 bytes)
    const version = (data[offset] << 24) | (data[offset+1] << 16) | 
                    (data[offset+2] << 8) | data[offset+3];
    offset += 4;
    
    // DCID length and DCID
    const dcidLen = data[offset++];
    if (offset + dcidLen > data.length) return null;
    const dcid = data.slice(offset, offset + dcidLen);
    offset += dcidLen;
    
    // SCID length and SCID  
    const scidLen = data[offset++];
    if (offset + scidLen > data.length) return null;
    const scid = data.slice(offset, offset + scidLen);
    offset += scidLen;
    
    // NOTE: No token length field - matches ESP32
    // Packet number (simplified to 1 byte)
    if (offset >= data.length) return null;
    const packetNumber = BigInt(data[offset]);
    
    return { 
        type: packetType as QuicVCPacketType,
        version, 
        dcid, 
        scid, 
        packetNumber 
    };
}
```

## Testing Steps

1. **Test Discovery**:
   ```bash
   # Monitor ESP32 discovery broadcasts
   python3 monitor-esp32-simple.py
   
   # Check app receives them
   npm run ios
   ```

2. **Test VC Exchange**:
   - Provision ESP32 from app
   - Verify VC_RESPONSE in HANDSHAKE packet
   - Check ownership status

3. **Test LED Control**:
   - After provisioning, send LED commands
   - Verify PROTECTED packets work

## Summary

The main issues were:
1. Token length field presence/absence in INITIAL packets
2. Discovery frame type code mismatch (0x30 vs 0x01)  
3. VC_RESPONSE packet type confusion (INITIAL vs HANDSHAKE)
4. Packet type flag encoding differences

These fixes ensure both ESP32 and app follow the same QUICVC packet format consistently.