# QUICVC Protocol: QUIC with Verifiable Credentials

## Overview
QUICVC is a transport protocol based on QUIC (RFC 9000) that replaces TLS with Verifiable Credentials for authentication and security. This document outlines the architecture and implementation of the QUICVC stack, with initial focus on local device communications and ESP32 integration.

### Key Design Principle: Microdata for Everything

**All data in QUIC-VC is transmitted as ONE microdata** (HTML format with `itemscope`, `itemtype`, `itemprop` attributes):
- **Credentials**: DeviceIdentityCredential objects in microdata format
- **Commands**: Device commands (LED control, etc.) as microdata
- **Responses**: Device status and responses as microdata
- **Not JSON**: We do not use JSON for any protocol payloads

**Why Microdata?**
- Content-addressable: SHA-256 hash of microdata string uniquely identifies the object
- Cryptographically verifiable: Deterministic format enables signing and verification
- ONE platform native: Commands and credentials are first-class ONE objects
- Type-safe: Recipe-based validation at both TypeScript and C levels

This approach makes device communication fully integrated with the ONE platform's verifiable data model, enabling immutable audit trails, cryptographic proof of commands, and seamless storage/versioning of all device interactions.

## Implementation Status
- ✅ **Phase 1 Complete**: Basic QUICVC implementation in TypeScript/React Native
- ✅ VC-based handshake protocol
- ✅ Key derivation from credentials
- ✅ Packet structure and framing
- ✅ Connection state management
- ✅ Heartbeat mechanism over secure channel
- 🚧 **In Progress**: AEAD encryption, ESP32 C implementation
- 📋 **Planned**: Connection migration, advanced flow control

## Core Architecture

### 1. Protocol Layers

```
+----------------------------------+
| Application Data                 |
+----------------------------------+
| Streams & Flow Control           |
+----------------------------------+
| Connection Management            |
+----------------------------------+
| VC Authentication & Encryption   | <- Replaces TLS 1.3
+----------------------------------+
| Packet Protection & Framing      |
+----------------------------------+
| UDP                              |
+----------------------------------+
```

### 2. Packet Structure

QUICVC maintains QUIC's packet format with modifications to the crypto layer:

```
+--------------------------------------------------+
| UDP Header                                       |
+--------------------------------------------------+
| QUICVC Header                                    |
| - Version                                        |
| - Destination Connection ID                      |
| - Source Connection ID                           |
+--------------------------------------------------+
| VC Authentication Header (replaces TLS headers)  |
+--------------------------------------------------+
| Protected Payload                                |
| - Frames                                         |
|   - STREAM                                       |
|   - ACK                                          |
|   - CREDENTIAL (New frame type)                  |
|   - Other control frames                         |
+--------------------------------------------------+
```

### 3. Verifiable Credential Integration

#### Credential Structure

Credentials are ONE objects in microdata format. All credential data is stored and transmitted as HTML microdata strings, making them content-addressable and verifiable:

```html
<div itemscope itemtype="//refin.io/DeviceIdentityCredential">
  <span itemprop="id">unique-credential-id</span>
  <a itemprop="issuer" data-type="id">dd005c5a25fac365f2d72a113a754a561a9a587530b5a2f1d1ae0ec3874cf5c3</a>
  <a itemprop="subject" data-type="id">a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890</a>
  <span itemprop="deviceId">device-id</span>
  <span itemprop="deviceType">device-type</span>
  <span itemprop="deviceMAC">device-mac</span>
  <span itemprop="issuedAt">1234567890</span>
  <span itemprop="expiresAt">1234567890</span>
  <span itemprop="ownership">ownership-type</span>
  <span itemprop="permissions">permissions</span>
  <span itemprop="proof">cryptographic-proof</span>
</div>
```

The microdata string's SHA-256 hash serves as the credential's unique identifier. Use `convertObjToMicrodata()` from `one.core` to convert JavaScript objects to microdata, and `convertMicrodataToObject()` to parse microdata strings back to objects.

#### Authentication Flow

1. **Initial Exchange**
   - Client sends Initial packet with VC_INIT frame containing client credentials
   - Server validates credential and responds with VC_RESPONSE frame
   - Both parties derive shared secrets from credentials

2. **Packet Protection Keys**
   - Initial keys: Derived from credential data
   - Handshake keys: Derived from DH exchange embedded in credentials
   - 1-RTT keys: Derived from combined secrets

#### ESP32 Device Ownership Flow

For unclaimed ESP32 devices, the ownership claim happens during connection establishment:

1. **Discovery**: ESP32 broadcasts DISCOVERY frames (0x30) containing device information
2. **Connection Initiation**: App initiates QUIC-VC connection by sending INITIAL packet with VC_INIT frame containing DeviceIdentityCredential
3. **Ownership Processing**: ESP32 receives VC_INIT, validates it's unclaimed, stores the credential issuer as owner
4. **Connection Response**: ESP32 responds with HANDSHAKE packet containing VC_RESPONSE frame
5. **Connection Established**: Both parties have authenticated, connection is ready for encrypted communication
6. **Subsequent Commands**: All device operations (LED control, etc.) use the established QUIC-VC connection

For already-owned devices:
1. **Discovery**: ESP32 broadcasts DISCOVERY frames (no longer anonymous, shows owned status)
2. **Connection Attempt**: App sends VC_INIT with DeviceIdentityCredential
3. **Ownership Verification**: ESP32 verifies credential issuer matches stored owner
4. **Connection Authorized**: If issuer matches owner, ESP32 responds with VC_RESPONSE
5. **Connection Established**: Connection proceeds for authenticated owner

This unified flow ensures all device communication happens over secure QUIC-VC connections, whether for initial ownership claim or subsequent authenticated access.

## Phase 1: ESP32 Local Implementation

### Target Capabilities

- Basic packet structure and processing
- Simplified handshake with verifiable credentials
- Single bidirectional stream per connection
- Stateless design for resource-constrained devices
- Reliable delivery with basic acknowledgments

### Implementation Components

1. **UDP Socket Layer**
   - Non-blocking socket operations
   - Port management for discovery and data

2. **Packet Engine**
   - Header encoding/decoding
   - Frame processing
   - Basic loss detection

3. **Credential Manager**
   - Storage and retrieval
   - Validation logic
   - Key derivation

4. **Connection State Machine**
   ```
   Uninitialized -> Credential Exchange -> Connected -> Shutdown
   ```

5. **Basic Stream Implementation**
   - Ordered delivery
   - Flow control (simplified)
   - Data buffering

### Security Model

For Phase 1:
- Authentication through verifiable credentials
- Symmetric encryption using keys derived from credentials
- Message integrity with HMAC
- Replay protection with packet numbers

## Phase 2: Enhanced Capabilities

### Network Enhancements
- Address validation for non-local networks
- NAT traversal techniques
- Connection migration foundation

### Protocol Enhancements
- Multiple streams support
- 0-RTT connection establishment
- Improved congestion control
- Connection migration

### Security Enhancements
- Perfect forward secrecy using ephemeral keys
- Enhanced credential revocation
- Quantum-resistant options

## Phase 3: Full Protocol Implementation

### Advanced Features
- Connection migration across network changes
- Full congestion control
- Advanced loss recovery
- Quality of service handling

### Interoperability
- Protocol negotiation with standard QUIC
- Proxy capabilities for non-QUICVC endpoints
- Protocol version management

## Protocol Abstraction Layer

### @refinio/quicvc-protocol Package

Located at `packages/quicvc-protocol/`, this package provides RFC 9000 compliant packet and frame abstractions for QUIC-VC, ensuring consistency between TypeScript and ESP32 C implementations.

#### Architecture

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

#### Key Features

1. **Single Source of Truth**: Protocol defined once in TypeScript, used everywhere
2. **RFC 9000 Compliance**: Proper QUIC packet structure with variable-length integers
3. **QUIC-VC Extensions**: VC-specific frames (VC_INIT, VC_RESPONSE, etc.)
4. **C Header Generation**: TypeScript definitions automatically generate matching C headers
5. **Cross-platform**: Works on React Native, ESP32, Node.js, Web

#### Constants and Types

##### Packet Types (RFC 9000)
```typescript
export const QUIC_VERSION_1 = 0x00000001;

export enum QuicPacketType {
  INITIAL = 0x00,      // Initial packet (VC handshake)
  HANDSHAKE = 0x02,    // Handshake packet
  ONE_RTT = 0x04       // Protected 1-RTT packet (short header)
}
```

##### QUIC-VC Frame Types
```typescript
export enum QuicVCFrameType {
  // QUIC-VC specific frames
  VC_INIT = 0x10,      // Replaces CRYPTO+TLS ClientHello
  VC_RESPONSE = 0x11,  // Replaces CRYPTO+TLS ServerHello
  VC_ACK = 0x12,       // VC handshake acknowledgment
  DISCOVERY = 0x01,    // Device discovery (uses PING semantics)
  HEARTBEAT = 0x20     // Keep-alive with optional status
}

export enum QuicFrameType {
  // Standard QUIC frames (RFC 9000)
  PADDING = 0x00,
  PING = 0x01,
  ACK = 0x02,
  STREAM = 0x08,
  CONNECTION_CLOSE = 0x1c
}
```

#### Variable-Length Integers (RFC 9000 Section 16)

QUIC uses variable-length encoding for integers to save space:

```typescript
// Encode integer to 1, 2, 4, or 8 bytes
export function encodeVarint(value: bigint): Uint8Array

// Decode variable-length integer
export function decodeVarint(data: Uint8Array, offset: number): {
  value: bigint;
  bytesRead: number
}

// Get required size for encoding
export function getVarintSize(value: bigint): number
```

**Encoding Format**:
- First 2 bits indicate length: `00`=1 byte, `01`=2 bytes, `10`=4 bytes, `11`=8 bytes
- Remaining bits encode the value in network byte order (big-endian)
- Maximum values: 63, 16383, 1073741823, 4611686018427387903

#### Packet Builders

##### Long Header Packet (INITIAL, HANDSHAKE)

```typescript
export interface QuicLongHeader {
  type: 'long';
  packetType: number;        // INITIAL, HANDSHAKE, etc.
  version: number;           // QUIC version (0x00000001)
  dcid: Uint8Array;          // Destination Connection ID
  scid: Uint8Array;          // Source Connection ID
  packetNumber: bigint;      // Packet number
  packetNumberLength: number; // 1, 2, or 4 bytes
  token?: Uint8Array;        // Optional token (INITIAL packets only)
}

export function buildLongHeaderPacket(
  header: QuicLongHeader,
  payload: Uint8Array
): Uint8Array
```

**Long Header Format** (RFC 9000 Section 17.2):
```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+
|1|1|T T|X X X X|
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                         Version (32)                          |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| DCID Len (8)  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|               Destination Connection ID (0..160)            ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| SCID Len (8)  |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                 Source Connection ID (0..160)               ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

**Packet Type-Specific Fields** (RFC 9000):

**INITIAL Packets** (Section 17.2.2):
```
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    Token Length (i)                         ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                          Token (*)                          ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                         Length (i)                          ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    Packet Number (8..32)                    ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        Packet Payload (*)                   ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

**HANDSHAKE Packets** (Section 17.2.4):
```
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                         Length (i)                          ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                    Packet Number (8..32)                    ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        Packet Payload (*)                   ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

**Key Differences**:
- **INITIAL** has Token Length + Token fields (for address validation)
- **HANDSHAKE** has no Token fields
- **Both** have Length field (varint encoding packet number + payload length)
- **Both** have Packet Number field (1-4 bytes, length encoded in first byte bits 0-1)

##### Short Header Packet (PROTECTED, 1-RTT)

```typescript
export interface QuicShortHeader {
  type: 'short';
  dcid: Uint8Array;          // Destination Connection ID
  packetNumber: bigint;      // Packet number
  packetNumberLength: number; // 1, 2, or 4 bytes
}

export function buildShortHeaderPacket(
  header: QuicShortHeader,
  payload: Uint8Array
): Uint8Array
```

**Short Header Format** (RFC 9000 Section 17.3):
```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+
|0|1|S|R|R|K|P P|
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|               Destination Connection ID (0..160)            ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                     Packet Number (8/16/32)                 ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                     Protected Payload (*)                   ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

#### Packet Parser

```typescript
export function parsePacketHeader(packet: Uint8Array): {
  header: QuicLongHeader | QuicShortHeader;
  headerLength: number;
  payload: Uint8Array;
}
```

Parses QUIC-VC packets according to RFC 9000 format, distinguishing between long and short headers based on the first bit.

#### Frame Classes

##### STREAM Frame (RFC 9000 Section 19.8)

```typescript
export class StreamFrame {
  constructor(
    public streamId: bigint,
    public data: Uint8Array,
    public offset: bigint = 0n,
    public fin: boolean = false
  ) {}

  serialize(): Uint8Array;
  static parse(data: Uint8Array, offset: number): StreamFrame;
}
```

**STREAM Frame Format**:
```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+
|0|0|0|0|1|F|L|O|
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                         Stream ID (i)                       ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                         [Offset (i)]                        ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                         [Length (i)]                        ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|                        Stream Data (*)                      ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

Flags: `F`=FIN, `L`=Length present, `O`=Offset present

##### VC_INIT Frame (QUIC-VC Extension)

The VC_INIT frame carries credential microdata. Instead of JSON, it transmits the microdata string representing the ONE object:

```typescript
export class VCInitFrame {
  constructor(
    public credentialMicrodata: string,  // HTML microdata string
    public challenge: string,
    public timestamp: number
  ) {}

  serialize(): Uint8Array {
    // Serialize microdata string to UTF-8 bytes
    const microdataBytes = new TextEncoder().encode(this.credentialMicrodata);
    const challengeBytes = new TextEncoder().encode(this.challenge);

    // Frame format: [frame_type(1)] [microdata_len(varint)] [microdata] [challenge_len(varint)] [challenge] [timestamp(8)]
    // ...
  }

  static parse(data: Uint8Array, offset: number): VCInitFrame {
    // Parse frame to extract microdata string
    // Use convertMicrodataToObject() to validate and extract credential
    // ...
  }
}

// TypeScript object representation (for convenience)
export interface DeviceIdentityCredential {
  $type$: 'DeviceIdentityCredential';
  id: string;           // Credential ID
  issuer: string;       // Issuer person ID (SHA256IdHash)
  subject: string;      // Subject person ID (SHA256IdHash)
  deviceId: string;     // Device identifier
  deviceType: string;   // Device type
  deviceMAC: string;    // Device MAC address
  issuedAt: number;     // Unix timestamp
  expiresAt: number;    // Unix timestamp
  ownership: string;    // Ownership type
  permissions: string;  // Permission string
  proof: string;        // Cryptographic proof
}
```

##### VC_RESPONSE Frame (QUIC-VC Extension)

The VC_RESPONSE frame also carries credential microdata:

```typescript
export class VCResponseFrame {
  constructor(
    public credentialMicrodata: string,  // HTML microdata string
    public challenge: string,            // Server's challenge
    public ackChallenge: string,         // Acknowledgment of client's challenge
    public timestamp: number
  ) {}

  serialize(): Uint8Array {
    // Serialize microdata string and response data to UTF-8 bytes
    const microdataBytes = new TextEncoder().encode(this.credentialMicrodata);
    const challengeBytes = new TextEncoder().encode(this.challenge);
    const ackChallengeBytes = new TextEncoder().encode(this.ackChallenge);

    // Frame format: [frame_type(1)] [microdata_len(varint)] [microdata] [challenge_len(varint)] [challenge] [ack_challenge_len(varint)] [ack_challenge] [timestamp(8)]
    // ...
  }

  static parse(data: Uint8Array, offset: number): VCResponseFrame {
    // Parse frame to extract microdata string
    // Use convertMicrodataToObject() to validate and extract credential
    // ...
  }
}
```

##### Other Frames

- `AckFrame`: Acknowledge received packets (RFC 9000)
- `ConnectionCloseFrame`: Graceful connection termination (RFC 9000)
- `PingFrame`: Connection keep-alive (RFC 9000)
- `PaddingFrame`: Packet padding (RFC 9000)
- `VCAckFrame`: Acknowledge VC handshake (QUIC-VC)
- `DiscoveryFrame`: Device discovery (QUIC-VC)
- `HeartbeatFrame`: Connection heartbeat with status (QUIC-VC)

#### C Header Generation

The protocol definitions are automatically converted to C headers for ESP32:

```bash
cd packages/quicvc-protocol
npm run build
node codegen/generate-c-headers.ts
```

**Generated C Constants** (matching TypeScript):
```c
// Packet Types
#define QUICVC_PACKET_TYPE_INITIAL    0x00
#define QUICVC_PACKET_TYPE_HANDSHAKE  0x02
#define QUICVC_PACKET_TYPE_ONE_RTT    0x04

// Frame Types
#define QUICVC_FRAME_VC_INIT      0x10
#define QUICVC_FRAME_VC_RESPONSE  0x11
#define QUICVC_FRAME_STREAM       0x08
#define QUICVC_FRAME_HEARTBEAT    0x20

// Variable-length integer functions
uint8_t quicvc_encode_varint(uint64_t value, uint8_t *out, size_t out_size);
quicvc_varint_result_t quicvc_decode_varint(const uint8_t *data, size_t data_len);
```

#### Usage Example

##### TypeScript (React Native)

```typescript
import {
  buildShortHeaderPacket,
  StreamFrame,
  VCInitFrame,
  QuicShortHeader
} from '@refinio/quicvc-protocol';
import { convertObjToMicrodata } from '@refinio/one.core';

// Convert credential object to microdata
const credentialMicrodata = convertObjToMicrodata(myDeviceCredential);

// Create VC handshake packet with microdata
const vcInitFrame = new VCInitFrame(
  credentialMicrodata,  // Pass microdata string
  challenge,
  Date.now()
);

const header: QuicLongHeader = {
  type: 'long',
  packetType: QuicPacketType.INITIAL,
  version: QUIC_VERSION_1,
  dcid: destinationConnId,
  scid: sourceConnId,
  packetNumber: 0n,
  packetNumberLength: 2
};

const packet = buildLongHeaderPacket(header, vcInitFrame.serialize());
await udpSocket.send(packet, address, port);

// Create device command as ONE object
const ledControlCommand = {
  $type$: 'LEDControlCommand',
  deviceId: 'esp32-device-001',
  action: 'set_state',
  state: 'on',
  timestamp: Date.now()
};

// Convert command to microdata
const commandMicrodata = convertObjToMicrodata(ledControlCommand);

// Create STREAM packet with microdata payload
const streamFrame = new StreamFrame(
  3n, // Stream ID
  new TextEncoder().encode(commandMicrodata)  // Send microdata string
);

const protectedHeader: QuicShortHeader = {
  type: 'short',
  dcid: destinationConnId,
  packetNumber: 1n,
  packetNumberLength: 2
};

const protectedPacket = buildShortHeaderPacket(protectedHeader, streamFrame.serialize());
await udpSocket.send(protectedPacket, address, port);
```

##### C (ESP32)

```c
#include "quicvc_protocol.h"
#include "microdata_helpers.h"  // ESP32 microdata utilities

// Build microdata for LED control command
// Microdata format: <div itemscope itemtype="//refin.io/LEDControlCommand">...
char microdata[512];
int microdata_len = snprintf(microdata, sizeof(microdata),
    "<div itemscope itemtype=\"//refin.io/LEDControlCommand\">"
    "<span itemprop=\"deviceId\">%s</span>"
    "<span itemprop=\"action\">%s</span>"
    "<span itemprop=\"state\">%s</span>"
    "<span itemprop=\"timestamp\">%lld</span>"
    "</div>",
    device_id, "set_state", "on", timestamp);

// Build STREAM frame with microdata payload
uint8_t frame[QUICVC_MAX_PACKET_SIZE];
size_t frame_len = 0;

// Frame type with LEN flag
frame[frame_len++] = QUICVC_FRAME_STREAM | QUICVC_STREAM_LEN_BIT;

// Stream ID (varint)
frame_len += quicvc_encode_varint(3, &frame[frame_len], sizeof(frame) - frame_len);

// Length (varint) - length of microdata string
frame_len += quicvc_encode_varint(microdata_len, &frame[frame_len], sizeof(frame) - frame_len);

// Payload - microdata string as UTF-8
memcpy(&frame[frame_len], microdata, microdata_len);
frame_len += microdata_len;

// Build short header packet
uint8_t packet[QUICVC_MAX_PACKET_SIZE];
size_t offset = 0;

// Short header flags: fixed bit + 2-byte packet number
packet[offset++] = QUICVC_FIXED_BIT | 0x01;

// DCID (8 bytes for ESP32)
memcpy(&packet[offset], connection_id, 8);
offset += 8;

// Packet number (2 bytes, big-endian)
packet[offset++] = 0x00;
packet[offset++] = 0x01;

// Frame payload
memcpy(&packet[offset], frame, frame_len);
offset += frame_len;

// Send packet
sendto(sock, packet, offset, 0, (struct sockaddr*)&dest_addr, sizeof(dest_addr));

// On receive, parse microdata:
// char *received_microdata = (char *)payload;
// Parse microdata to extract command fields
// const char *action = extract_itemprop(received_microdata, "action");
// const char *state = extract_itemprop(received_microdata, "state");
```

#### Benefits of Protocol Abstraction

1. **No More Magic Numbers**: Self-documenting code with named constants
2. **Type Safety**: TypeScript catches errors at compile time
3. **Consistency**: TypeScript and C use identical packet formats
4. **RFC 9000 Compliance**: Proper QUIC structure enables future interoperability
5. **Maintainability**: Change protocol in one place, regenerate C headers
6. **Testability**: Protocol logic can be unit tested independently

### Benefits of Microdata for Device Communication

#### Why Microdata Instead of JSON?

QUIC-VC uses ONE microdata format (HTML with `itemscope`, `itemtype`, `itemprop` attributes) for all device communication instead of JSON. This provides several critical advantages:

1. **Content Addressability**
   - The SHA-256 hash of the microdata string uniquely identifies the object
   - Commands, responses, and credentials can be referenced by their hash
   - Enables immutable audit trails and verifiable command history
   - Example: LED command hash = SHA256(microdata string)

2. **Cryptographic Verification**
   - Microdata format is deterministic - identical data always produces identical hash
   - No ambiguity from JSON formatting (whitespace, key ordering, number representation)
   - Commands can be signed and verified using the content hash
   - Prevents tampering: any modification changes the hash

3. **Type Safety and Validation**
   - Object types are embedded in the microdata (`itemtype="//refin.io/LEDControlCommand"`)
   - Recipe-based validation ensures correct structure
   - Schema evolution without breaking changes
   - Type checking at both TypeScript and C levels

4. **ONE Platform Integration**
   - Device commands, credentials, and responses are all ONE objects
   - Can be stored in ONE storage using their content hash
   - Full integration with ONE's versioning and identity system
   - Credentials become first-class verifiable objects

5. **Interoperability**
   - Microdata is a W3C standard (HTML5 microdata)
   - Human-readable for debugging (unlike binary formats)
   - Language-agnostic: parseable in any language with string operations
   - Future-proof: standard HTML parsing tools work

6. **Security Benefits**
   - Credentials cannot be modified without detection (hash changes)
   - Command replay attacks are detectable (timestamp in content hash)
   - Provenance tracking: who issued what command, when
   - Non-repudiation: commands are signed with content hash

#### Trade-offs

**Size**: Microdata is ~3-5x larger than minimal JSON
- LED command JSON: ~100 bytes
- LED command microdata: ~400 bytes
- Mitigation: Local network traffic, not bandwidth-constrained
- ESP32 has sufficient flash (~600 KB free) for template strings

**Parsing Complexity**: Microdata parsing is more complex than JSON
- React Native: Use `convertMicrodataToObject()` from `one.core`
- ESP32: Lightweight C parser using simple string operations
- No need for full HTML parser - ONE microdata has strict format
- Reference: `packages/one.core.expo/src/microdata-to-object.ts`

**Performance**: Slightly slower than binary protocols
- Local network latency dominates (WiFi ~1-2ms)
- Parse time negligible compared to network time
- Benefit: Deterministic hashing enables caching

#### Example Comparison

**JSON Approach (What We Don't Do)**:
```json
{"type":"led","state":"on","device":"esp32-001"}
```
- Not content-addressable
- No built-in verification
- Ambiguous encoding (key order, whitespace)
- Not a ONE object

**Microdata Approach (What We Use)**:
```html
<div itemscope itemtype="//refin.io/LEDControlCommand"><span itemprop="deviceId">esp32-001</span><span itemprop="action">set_state</span><span itemprop="state">on</span><span itemprop="timestamp">1234567890</span></div>
```
- Content hash: `SHA256(microdata) = a3f5b8c...`
- Verifiable, immutable, and typed
- Seamlessly integrates with ONE platform
- Can be stored, versioned, and referenced by hash

**Conclusion**: The size and parsing overhead are acceptable trade-offs for the security, verifiability, and ONE platform integration that microdata provides.

## Current Implementation (TypeScript/React Native)

### QuicVCConnectionManager
Located at `src/models/network/QuicVCConnectionManager.ts`, this implementation provides:

#### Connection Management
```typescript
// Initiate QUICVC connection
await quicVCManager.connect(deviceId, address, port);

// Check connection status
const isConnected = quicVCManager.isConnected(deviceId);

// Send data over secure channel
await quicVCManager.sendData(deviceId, data);

// Graceful disconnect
quicVCManager.disconnect(deviceId);
```

#### Security Features
- **VC Handshake**: 2-RTT handshake with mutual credential verification
- **Key Derivation**: HKDF-based key derivation from credential attributes
- **Packet Protection**: Structured for AEAD encryption (implementation pending)
- **Replay Protection**: Packet numbers prevent replay attacks

#### Integration Points
- **VCManager**: Handles credential verification and trust evaluation
- **QuicModel**: Provides UDP transport layer
- **Network Service**: Uses HEARTBEAT_SERVICE (type 8) for QUICVC packets

### Packet Format Implementation

#### Header Structure
```typescript
QuicVCPacketHeader {
    type: QuicVCPacketType;      // INITIAL, HANDSHAKE, PROTECTED
    version: number;              // 0x00000001 for v1
    dcid: Uint8Array;            // Destination Connection ID (16 bytes)
    scid: Uint8Array;            // Source Connection ID (16 bytes)
    packetNumber: bigint;        // For ordering and replay protection
}
```

#### Frame Types
```typescript
enum QuicVCFrameType {
    VC_INIT = 0x10,      // Client credential presentation
    VC_RESPONSE = 0x11,  // Server credential response
    VC_ACK = 0x12,       // Acknowledge VC exchange
    STREAM = 0x08,       // Stream data (QUIC standard)
    ACK = 0x02,          // Acknowledgment (QUIC standard)
    HEARTBEAT = 0x20     // Custom heartbeat frame
}
```

### Connection Flow Implementation

1. **Client Initiates** (INITIAL packet)
   - VC_INIT frame contains:
     - `credentialMicrodata`: Full HTML microdata string of DeviceIdentityCredential
     - `challenge`: Random 32-byte hex string
     - `timestamp`: Unix timestamp
   - Example credential microdata (compacted to single line for transmission):
     ```html
     <div itemscope itemtype="//refin.io/DeviceIdentityCredential"><span itemprop="id">cred-123</span><a itemprop="issuer" data-type="id">dd005c5a25...</a>...</div>
     ```

2. **Server Responds** (HANDSHAKE packet)
   - VC_RESPONSE frame contains:
     - `credentialMicrodata`: Server's DeviceIdentityCredential as microdata
     - `challenge`: Server's challenge
     - `ackChallenge`: Server's acknowledgment of client's challenge
     - `timestamp`: Unix timestamp
   - Server validates client credential using `convertMicrodataToObject()` and credential verification

3. **Secure Communication** (PROTECTED packets)
   - All subsequent packets use derived application keys
   - Heartbeats maintain connection liveness
   - Stream frames carry application data as microdata strings
   - Device commands and responses are ONE objects in microdata format

## Implementation Timeline

| Phase | Status | Key Deliverables |
|-------|--------|------------------|
| 1     | ✅ Complete | Basic credential exchange, single stream, local communication, TypeScript implementation |
| 2     | 🚧 In Progress | AEAD encryption, ESP32 C implementation, multiple streams |
| 3     | 📋 Planned | Full feature parity with QUIC, migration, advanced congestion control |

## ESP32 Specific Considerations

### Memory Constraints
- Optimize packet buffer sizes
- Minimize connection state storage
- Credential caching strategies

### Processing Power
- Simplified cryptographic operations
- Batch processing where possible
- Offload to hardware acceleration where available

### Current Limitations
- Limited to local network communication initially
- Simplified congestion control
- Focus on reliability over throughput optimization

## Testing and Validation

1. **Functional Testing**
   - Credential exchange correctness
   - Stream data integrity
   - Connection establishment reliability

2. **Security Analysis**
   - Authentication verification
   - Encryption strength
   - Protocol vulnerabilities

3. **Performance Metrics**
   - Memory usage
   - CPU utilization
   - Latency and throughput

## Next Steps for ESP32 Implementation

### 1. Port TypeScript Implementation to C

The TypeScript implementation provides a reference for the ESP32 C implementation. Key components to port:

```c
// Connection state structure matching TypeScript
typedef struct quicvc_connection {
    // Connection identifiers
    char device_id[64];
    uint8_t dcid[16];
    uint8_t scid[16];
    
    // Network info
    struct sockaddr_in remote_addr;
    
    // Connection state
    enum { INITIAL, HANDSHAKE, ESTABLISHED, CLOSED } state;
    bool is_server;
    
    // Packet tracking
    uint64_t next_packet_number;
    uint64_t highest_received_packet;
    
    // Credentials
    verifiable_credential_t local_vc;
    verifiable_credential_t remote_vc;
    char challenge[65]; // 32 bytes hex + null
    
    // Crypto keys
    struct {
        uint8_t encryption_key[32];
        uint8_t decryption_key[32];
        uint8_t send_iv[16];
        uint8_t receive_iv[16];
        uint8_t send_hmac[32];
        uint8_t receive_hmac[32];
    } app_keys;
    
    // Timers
    esp_timer_handle_t heartbeat_timer;
    esp_timer_handle_t idle_timer;
    
    // Metadata
    int64_t created_at;
    int64_t last_activity;
} quicvc_connection_t;
```

### 2. Packet Format Implementation

Define the binary packet format:

```c
typedef struct {
    uint8_t flags;               // Packet type and flags
    uint32_t version;            // Protocol version
    uint8_t dcid_len;            // Destination Connection ID length
    uint8_t scid_len;            // Source Connection ID length
    uint8_t dcid[20];            // Destination Connection ID (variable length)
    uint8_t scid[20];            // Source Connection ID (variable length)
    uint64_t packet_number;      // Packet number
    // Followed by protected payload
} quicvc_packet_header_t;

typedef struct {
    uint8_t frame_type;          // Frame type
    uint16_t length;             // Length of frame payload
    uint8_t payload[];           // Frame payload (variable length)
} quicvc_frame_t;
```

### 3. Key Derivation from Credentials

```c
esp_err_t derive_keys_from_credential(const verifiable_credential_t *credential,
                                     uint8_t *initial_key,
                                     uint8_t *initial_iv) {
    // Create a context with credential values
    mbedtls_md_context_t ctx;
    mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 0);
    mbedtls_md_starts(&ctx);
    
    // Add credential fields to the key material
    mbedtls_md_update(&ctx, (const unsigned char*)credential->id, strlen(credential->id));
    mbedtls_md_update(&ctx, (const unsigned char*)credential->issuer, strlen(credential->issuer));
    mbedtls_md_update(&ctx, (const unsigned char*)credential->subject, strlen(credential->subject));
    
    // Initial salt - could be fixed for initial keys
    const uint8_t initial_salt[16] = {
        0x38, 0x76, 0x2c, 0xf7, 0xf5, 0x59, 0x34, 0xb3,
        0x4d, 0x17, 0x9a, 0xe6, 0xa4, 0xc8, 0x0c, 0xad
    };
    mbedtls_md_update(&ctx, initial_salt, sizeof(initial_salt));
    
    // Finish HMAC and get initial key
    uint8_t key_material[64];  // SHA-256 output is 32 bytes
    mbedtls_md_finish(&ctx, key_material);
    
    // Derive separate keys for encryption and IV
    memcpy(initial_key, key_material, 32);
    
    // For IV, use a different context
    mbedtls_md_starts(&ctx);
    mbedtls_md_update(&ctx, key_material, 32);
    mbedtls_md_update(&ctx, (const unsigned char*)"quicvc_iv", 8);
    mbedtls_md_finish(&ctx, key_material);
    
    memcpy(initial_iv, key_material, 16);  // Use first 16 bytes for IV
    
    mbedtls_md_free(&ctx);
    return ESP_OK;
}
```

### 4. API Design

```c
// Connection context
typedef struct {
    int socket_fd;
    uint8_t dcid[20];
    uint8_t scid[20];
    uint8_t dcid_len;
    uint8_t scid_len;
    uint64_t next_packet_number;
    verifiable_credential_t local_credential;
    verifiable_credential_t remote_credential;
    uint8_t tx_key[32];
    uint8_t rx_key[32];
    uint8_t tx_iv[16];
    uint8_t rx_iv[16];
    // ... other state
} quicvc_connection_t;

// API functions
esp_err_t quicvc_init(quicvc_connection_t *conn, uint16_t port);
esp_err_t quicvc_connect(quicvc_connection_t *conn, const char *addr, uint16_t port);
esp_err_t quicvc_accept(quicvc_connection_t *conn);
esp_err_t quicvc_send(quicvc_connection_t *conn, const void *data, size_t len);
esp_err_t quicvc_recv(quicvc_connection_t *conn, void *data, size_t *len, uint32_t timeout_ms);
esp_err_t quicvc_close(quicvc_connection_t *conn);
```

### 5. Packet Construction and Parsing

```c
// Construction
esp_err_t quicvc_construct_packet(quicvc_connection_t *conn, 
                                 uint8_t packet_type,
                                 const uint8_t *payload, 
                                 size_t payload_len,
                                 uint8_t *packet_buffer,
                                 size_t *packet_len);

// Parsing
esp_err_t quicvc_parse_packet(quicvc_connection_t *conn,
                             const uint8_t *packet,
                             size_t packet_len,
                             uint8_t *payload,
                             size_t *payload_len);
```

## Key Differences from Standard QUIC

### Authentication & Trust Model

| Aspect | Standard QUIC (TLS 1.3) | QUICVC |
|--------|-------------------------|---------|
| **Trust Root** | Certificate Authorities | Self-sovereign credentials |
| **Identity** | Domain/server identity | Device/user/organization identity |
| **Verification** | Online OCSP/CRL checks | Offline credential verification |
| **Attributes** | Limited to subject/SAN | Rich attribute encoding |
| **Revocation** | Centralized lists | Time-bound credentials |

### Technical Comparison

| Feature | Standard QUIC | QUICVC Current | QUICVC Target |
|---------|---------------|----------------|---------------|
| **Transport** | UDP | UDP | UDP |
| **Handshake RTTs** | 1-RTT (0-RTT replay) | 2-RTT | 1-RTT (0-RTT planned) |
| **Key Exchange** | TLS 1.3 (ECDHE) | VC-based HKDF | VC + ephemeral keys |
| **Encryption** | AEAD (AES-GCM/ChaCha20) | Planned AEAD | AEAD with PFS |
| **Packet Protection** | Header protection | Basic structure | Full header protection |
| **Streams** | Multiple bidirectional | Single bidirectional | Multiple bidirectional |
| **Flow Control** | Stream & connection level | Basic | Full flow control |
| **Congestion Control** | NewReno/Cubic/BBR | None | Pluggable CC |
| **Connection Migration** | Yes | No | Planned |
| **0-RTT Data** | Yes (with replay risk) | No | Planned with anti-replay |

### Implementation Architecture

| Component | Standard QUIC | QUICVC |
|-----------|---------------|---------|
| **Crypto Layer** | TLS 1.3 library | VC verification + HKDF |
| **Trust Store** | CA certificates | Credential wallet |
| **Session Resumption** | TLS session tickets | Credential caching |
| **API Model** | Stream-based | Stream + VC management |

## Security Considerations

### Credential Security

1. **Storage Protection**
   - Credentials must be stored securely using hardware encryption when available
   - ESP32 implementation uses NVS with optional encryption

2. **Revocation Mechanism**
   - Credentials include expiration dates
   - Future: implement revocation checking mechanism for compromised credentials

3. **Key Rotation**
   - Regular key rotation through credential updates
   - Implement timely credential refresh before expiration

### Attack Vectors

1. **Replay Attacks**
   - Mitigated by packet numbers and timestamps
   - Current implementation vulnerable to long-term replay

2. **Man-in-the-Middle**
   - Protected by credential verification
   - Credential binding to device MAC/ID

3. **Denial of Service**
   - Resource constraints make DoS a concern
   - Implement connection attempt limits and blacklisting

## Usage Example

### React Native App Integration
```typescript
import { QuicVCConnectionManager } from '@src/models/network/QuicVCConnectionManager';
import { VCManager } from '@src/models/network/vc/VCManager';
import { convertObjToMicrodata, convertMicrodataToObject } from '@refinio/one.core';

// Initialize QUICVC with credential as microdata
const quicVC = QuicVCConnectionManager.getInstance(ownPersonId);
const credentialMicrodata = convertObjToMicrodata(myDeviceCredential);
await quicVC.initialize(vcManager, credentialMicrodata);

// Connect to a device
await quicVC.connect('esp32-device-001', '192.168.1.100', 49498);

// Listen for events
quicVC.onConnectionEstablished.listen((deviceId, vcInfo) => {
    console.log(`Connected to ${deviceId}, owner: ${vcInfo.issuerPersonId}`);
});

// Send device command as ONE object
const ledCommand = {
    $type$: 'LEDControlCommand',
    deviceId: 'esp32-device-001',
    action: 'set_state',
    state: 'on',
    timestamp: Date.now()
};

// Convert to microdata and send
const commandMicrodata = convertObjToMicrodata(ledCommand);
await quicVC.sendData('esp32-device-001',
    new TextEncoder().encode(commandMicrodata)
);

// Handle incoming data - parse microdata
quicVC.onPacketReceived.listen((deviceId, data) => {
    const microdataString = new TextDecoder().decode(data);

    // Parse microdata to ONE object
    const responseObj = convertMicrodataToObject(microdataString);
    console.log(`Received ${responseObj.$type$} from ${deviceId}:`, responseObj);
});
```

### ESP32 Integration (Planned)
```c
// Initialize QUICVC with credential microdata
quicvc_config_t config = {
    .port = 49498,
    .device_id = "esp32-device-001",
    .credential_microdata = my_device_credential_microdata  // Microdata string
};
quicvc_init(&config);

// Accept connections
quicvc_connection_t conn;
if (quicvc_accept(&conn) == ESP_OK) {
    // Connection established after VC verification
    // Parse remote credential microdata to extract issuer
    const char *issuer = extract_itemprop(conn.remote_credential_microdata, "issuer");
    printf("Connected to owner: %s\n", issuer);
}

// Receive and process commands (microdata payload)
char microdata_buffer[1024];
size_t len = sizeof(microdata_buffer);
if (quicvc_recv(&conn, microdata_buffer, &len, 1000) == ESP_OK) {
    // Parse microdata to extract command
    const char *cmd_type = extract_itemtype(microdata_buffer);
    const char *action = extract_itemprop(microdata_buffer, "action");
    const char *state = extract_itemprop(microdata_buffer, "state");

    // Process command
    if (strcmp(cmd_type, "LEDControlCommand") == 0) {
        process_led_command(action, state);
    }

    // Send response as microdata
    char response_microdata[256];
    snprintf(response_microdata, sizeof(response_microdata),
        "<div itemscope itemtype=\"//refin.io/LEDStatusResponse\">"
        "<span itemprop=\"deviceId\">%s</span>"
        "<span itemprop=\"state\">%s</span>"
        "<span itemprop=\"timestamp\">%lld</span>"
        "</div>",
        config.device_id, state, get_timestamp_ms());

    quicvc_send(&conn, response_microdata, strlen(response_microdata));
}
```

## Benefits of QUICVC

### For IoT/Edge Devices
- **No CA Dependencies**: Works offline without certificate authorities
- **Device Identity**: First-class support for device credentials
- **Low Overhead**: Minimal handshake for resource-constrained devices
- **Flexible Trust**: Programmable trust relationships

### For Mobile/P2P Applications  
- **Dynamic Networking**: Handles changing IPs and NAT traversal
- **User-Centric**: Credentials tied to users, not domains
- **Rich Permissions**: Fine-grained access control in credentials
- **Offline-First**: Full functionality without internet connectivity

### For Enterprise/Federation
- **Decentralized Trust**: No single point of failure
- **Compliance**: Auditable credential-based access
- **Interoperability**: Standards-based VC format
- **Migration Path**: Can coexist with TLS infrastructure

## Conclusion

QUICVC provides a modern transport protocol that combines QUIC's performance benefits with the flexibility of Verifiable Credentials. By replacing TLS with VCs, it enables:

1. **Self-Sovereign Security**: Devices and users control their own identity and trust relationships
2. **Offline Operation**: No dependency on online certificate authorities or OCSP responders  
3. **Rich Identity Model**: Credentials can encode complex attributes, permissions, and relationships
4. **IoT-Optimized**: Designed for resource-constrained devices with minimal overhead

The current TypeScript implementation demonstrates the viability of the approach, with the ESP32 C implementation providing a path to production deployment on embedded devices. The phased development approach ensures immediate usability while building toward a complete QUIC-compatible transport protocol. 