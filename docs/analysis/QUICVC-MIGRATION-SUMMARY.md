# QUICVC Migration Summary

## Changes Made

### 1. VCManager - Migrated from Service Type 7 to QUICVC Protocol

**Before:** Used service type 7 packets for VC exchange
```
[0x07] [JSON payload]  // Service type byte + raw JSON
```

**After:** Uses QUICVC INITIAL packets with VC_INIT frames
```
[QUICVC header] [VC_INIT frame (0x10)] [frame length] [JSON payload]
```

### 2. ESP32 Firmware - Added VC Request Support

**Before:** Only handled provisioning and revocation
- Did not understand `vc_request` messages
- Could not respond with device status

**After:** Handles VC requests properly
- Recognizes `action: "request_credential"` or `type: "vc_request"`
- Sends VC_RESPONSE frame (0x11) in HANDSHAKE packet with:
  - `status: "unclaimed"` if device has no owner
  - Full credential if device is owned

### 3. Packet Flow

**VC Request Flow:**
1. App sends QUICVC INITIAL packet with VC_INIT frame containing `vc_request`
2. ESP32 responds with QUICVC HANDSHAKE packet with VC_RESPONSE frame
3. App's QuicVCConnectionManager handles the HANDSHAKE packet
4. VCManager processes the VC response

## Files Modified

### App Side (React Native)
- `/src/models/network/vc/VCManager.ts` - Converted to QUICVC protocol
- Removed service type 7 handling
- Added QUICVC packet construction

### ESP32 Side
- `/one.core/src/system/esp32/esp32-quicvc-project/main/main.c`
  - Added VC request recognition
  - Added VC_RESPONSE frame generation
  - Sends proper response based on device ownership status

## Testing

After flashing the updated firmware:

1. The app can now query ESP32 device ownership status
2. ESP32 responds with "unclaimed" or credential
3. No more "Authentication timeout" errors
4. Pure QUICVC protocol - no service types

## Next Steps

1. Remove remaining service type code from other modules
2. Test full ownership provisioning flow
3. Verify LED control works over QUICVC PROTECTED packets