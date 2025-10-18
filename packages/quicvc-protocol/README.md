# @refinio/quicvc-protocol

QUIC-VC Protocol Abstractions - QUIC packet/frame structure with Verifiable Credentials instead of TLS.

## What is QUIC-VC?

**QUIC-VC** is a variant of QUIC (RFC 9000) that replaces TLS-based authentication with Verifiable Credential based authentication:

- ✅ **QUIC packet structure** (long/short headers, connection IDs, packet numbers)
- ✅ **QUIC frame types** (STREAM, ACK, CONNECTION_CLOSE, etc.)
- ✅ **RFC 9000 variable-length integers**
- ❌ **No TLS handshake** - replaced with VC exchange
- ✅ **VC_INIT/VC_RESPONSE frames** instead of CRYPTO+TLS
- ✅ **Session keys derived from VCs** instead of TLS key derivation

## Why This Package?

### Before (Hardcoded Byte Manipulation)

**React Native (ESP32ConnectionManager.ts:728-745)**:
```typescript
// Manual STREAM frame construction with magic offsets
const frame = new Uint8Array(4 + jsonBytes.length);
frame[0] = 0x08; // What's 0x08? Who knows without reading comments
frame[1] = (jsonBytes.length >> 8) & 0xFF; // Hope you got the endianness right
frame[2] = jsonBytes.length & 0xFF;
frame[3] = 3; // Magic number
frame.set(jsonBytes, 4);
```

**ESP32 C (quicvc_transport.c:966-984)**:
```c
// Same magic numbers, different language
response_packet[packet_len++] = 0x40; // What's 0x40?
for (int i = 0; i < 8; i++) {
    response_packet[packet_len++] = esp_random() & 0xFF;
}
response_packet[packet_len++] = 0x00;
response_packet[packet_len++] = 0x01;
response_packet[packet_len++] = FRAME_STREAM;
response_packet[packet_len++] = (wrapped_len >> 8) & 0xFF;
response_packet[packet_len++] = wrapped_len & 0xFF;
```

### After (Protocol Abstraction)

**React Native**:
```typescript
import { StreamFrame, buildShortHeaderPacket, generateConnectionId } from '@refinio/quicvc-protocol';

// Create STREAM frame semantically
const streamFrame = new StreamFrame(
  3n, // streamId
  jsonBytes,
  0n, // offset
  false // fin
);

// Build packet with proper QUIC header
const packet = buildShortHeaderPacket(
  {
    type: 'short',
    dcid: connection.dcid,
    packetNumber: connection.nextPacketNumber++,
    packetNumberLength: 2
  },
  streamFrame.serialize()
);

await transport.send(packet);
```

**ESP32 C** (using generated headers):
```c
#include "quicvc_protocol.h"

// Build STREAM frame using protocol functions
uint8_t frame[QUICVC_MAX_PACKET_SIZE];
size_t frame_len = 0;

// Frame type with flags
frame[frame_len++] = QUICVC_FRAME_STREAM | QUICVC_STREAM_LEN_BIT;

// Stream ID (varint)
frame_len += quicvc_encode_varint(3, &frame[frame_len], sizeof(frame) - frame_len);

// Length (varint)
frame_len += quicvc_encode_varint(json_len, &frame[frame_len], sizeof(frame) - frame_len);

// Payload
memcpy(&frame[frame_len], json_data, json_len);
frame_len += json_len;
```

## Installation

```bash
cd packages/quicvc-protocol
npm install
npm run build
```

## Usage

### TypeScript/React Native

```typescript
import {
  // Constants
  QuicPacketType,
  QuicFrameType,
  QuicVCFrameType,

  // Packet handling
  buildLongHeaderPacket,
  buildShortHeaderPacket,
  parsePacketHeader,
  generateConnectionId,

  // Standard QUIC frames
  StreamFrame,
  AckFrame,
  ConnectionCloseFrame,
  PingFrame,
  parseFrame,

  // QUIC-VC specific frames
  VCInitFrame,
  VCResponseFrame,
  VCAckFrame,
  DiscoveryFrame,
  HeartbeatFrame,

  // Variable-length integers
  encodeVarint,
  decodeVarint,
} from '@refinio/quicvc-protocol';

// Example: Send LED command over QUIC-VC
const command = { type: 'led_control', action: 'on' };
const jsonBytes = new TextEncoder().encode(JSON.stringify(command));

// Create STREAM frame
const streamFrame = new StreamFrame(
  3n, // LED control stream
  jsonBytes
);

// Build PROTECTED packet (short header)
const packet = buildShortHeaderPacket(
  {
    type: 'short',
    dcid: deviceConnectionId,
    packetNumber: 1n,
    packetNumberLength: 2
  },
  streamFrame.serialize()
);

await udpSocket.send(packet, deviceAddress, devicePort);
```

### ESP32 C

```c
#include "quicvc_protocol.h"

// Parse incoming QUIC-VC packet
void handle_packet(const uint8_t *data, size_t len) {
    // Check packet type
    uint8_t first_byte = data[0];

    if (first_byte & QUICVC_LONG_HEADER_BIT) {
        // Long header packet
        uint8_t packet_type = (first_byte & QUICVC_PACKET_TYPE_MASK) >> 4;

        if (packet_type == QUICVC_PACKET_TYPE_INITIAL) {
            // Handle VC_INIT frame in INITIAL packet
            handle_vc_init(data, len);
        }
    } else {
        // Short header (PROTECTED packet)
        handle_protected_packet(data, len);
    }
}

// Build STREAM frame response
size_t build_led_response(uint8_t *packet, size_t packet_size) {
    size_t offset = 0;

    // Short header
    packet[offset++] = QUICVC_FIXED_BIT | 0x01; // 2-byte packet number

    // Connection ID (8 bytes)
    memcpy(&packet[offset], connection_id, 8);
    offset += 8;

    // Packet number (2 bytes)
    packet[offset++] = 0x00;
    packet[offset++] = 0x01;

    // STREAM frame
    packet[offset++] = QUICVC_FRAME_STREAM | QUICVC_STREAM_LEN_BIT;

    // Stream ID (varint)
    offset += quicvc_encode_varint(3, &packet[offset], packet_size - offset);

    // Frame length (varint)
    const char *json = "{\"status\":\"success\",\"blue_led\":\"on\"}";
    size_t json_len = strlen(json);
    offset += quicvc_encode_varint(json_len, &packet[offset], packet_size - offset);

    // JSON payload
    memcpy(&packet[offset], json, json_len);
    offset += json_len;

    return offset;
}
```

## Shared Constants

All constants are defined once and shared between TypeScript and C:

| TypeScript | C | Value | Meaning |
|------------|---|-------|---------|
| `QuicPacketType.INITIAL` | `QUICVC_PACKET_TYPE_INITIAL` | `0x00` | Initial packet (VC handshake) |
| `QuicPacketType.ONE_RTT` | `QUICVC_PACKET_TYPE_ONE_RTT` | `0x04` | Protected 1-RTT packet |
| `QuicFrameType.STREAM` | `QUICVC_FRAME_STREAM` | `0x08` | STREAM frame |
| `QuicVCFrameType.VC_INIT` | `QUICVC_FRAME_VC_INIT` | `0x10` | VC handshake init |
| `QuicVCFrameType.VC_RESPONSE` | `QUICVC_FRAME_VC_RESPONSE` | `0x11` | VC handshake response |

## Generated C Headers

C headers are auto-generated from TypeScript definitions:

```bash
cd packages/quicvc-protocol
npm run build
node codegen/generate-c-headers.ts
```

Output files in `c-headers/`:
- `quicvc_protocol.h` - Constants and function prototypes
- `quicvc_protocol.c` - Variable-length integer implementation

Copy to ESP32 project:
```bash
cp c-headers/* ../one.core.expo/src/system/esp32/esp32-quicvc-project/components/quicvc/include/
```

## RFC 9000 Compliance

This package implements these sections of RFC 9000:

- **Section 16**: Variable-Length Integer Encoding
- **Section 17**: Packet Formats (Long/Short Headers)
- **Section 19**: Frame Types and Formats
  - PADDING, PING, ACK, STREAM, CONNECTION_CLOSE

**Extensions for QUIC-VC**:
- `VC_INIT` (0x10) - Replaces CRYPTO frame + TLS ClientHello
- `VC_RESPONSE` (0x11) - Replaces CRYPTO frame + TLS ServerHello
- `VC_ACK` (0x12) - VC handshake acknowledgment
- `DISCOVERY` (0x01) - Device discovery (uses PING semantics)
- `HEARTBEAT` (0x20) - Keep-alive with optional status

## Architecture

```
@refinio/quicvc-protocol
├── src/
│   ├── constants.ts       # QUIC & QUIC-VC constants
│   ├── varint.ts          # RFC 9000 variable-length integers
│   ├── packet.ts          # Packet header builders/parsers
│   ├── frames.ts          # Standard QUIC frames
│   ├── vc-frames.ts       # QUIC-VC specific frames
│   └── index.ts           # Public API
├── codegen/
│   └── generate-c-headers.ts  # C header generator
└── c-headers/             # Generated C files
    ├── quicvc_protocol.h
    └── quicvc_protocol.c
```

## Development

```bash
# Build TypeScript
npm run build

# Watch mode
npm run watch

# Generate C headers
npm run build && node codegen/generate-c-headers.ts

# Clean
npm run clean
```

## Benefits

1. **Single source of truth** - Protocol defined once, used everywhere
2. **Type safety** - TypeScript catches errors at compile time
3. **RFC 9000 compliance** - Proper QUIC packet/frame structure
4. **Maintainability** - Change protocol in one place
5. **No more magic numbers** - Self-documenting code
6. **ESP32 ↔ React Native consistency** - Guaranteed matching packet formats

## Migration Path

1. ✅ **Phase 1**: Create protocol abstractions (this package)
2. **Phase 2**: Refactor React Native code to use abstractions
3. **Phase 3**: Refactor ESP32 C code to use generated headers
4. **Phase 4**: Add comprehensive protocol documentation

## License

MIT
