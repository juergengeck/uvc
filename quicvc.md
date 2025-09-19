# QUICVC Protocol: QUIC with Verifiable Credentials

## Overview
QUICVC is a transport protocol based on QUIC (RFC 9000) that replaces TLS with Verifiable Credentials for authentication and security. This document outlines the architecture and implementation of the QUICVC stack, with initial focus on local device communications and ESP32 integration.

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
```json
{
  "id": "unique-credential-id",
  "iss": "issuer-id",
  "sub": "subject-id",
  "dev": "device-id",
  "typ": "device-type",
  "mac": "device-mac",
  "iat": 1234567890,
  "exp": 1234567890,
  "own": "ownership-type",
  "prm": "permissions",
  "prf": "cryptographic-proof"
}
```

#### Authentication Flow

1. **Initial Exchange**
   - Client sends Initial packet with VC_INIT frame containing client credentials
   - Server validates credential and responds with VC_RESPONSE frame
   - Both parties derive shared secrets from credentials

2. **Packet Protection Keys**
   - Initial keys: Derived from credential data
   - Handshake keys: Derived from DH exchange embedded in credentials
   - 1-RTT keys: Derived from combined secrets

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
   ```json
   {
     "type": "VC_INIT",
     "credential": { /* DeviceIdentityCredential */ },
     "challenge": "random-32-byte-hex",
     "timestamp": 1234567890
   }
   ```

2. **Server Responds** (HANDSHAKE packet)
   ```json
   {
     "type": "VC_RESPONSE",
     "credential": { /* Server's DeviceIdentityCredential */ },
     "challenge": "server-challenge",
     "ackChallenge": "client-challenge-ack",
     "timestamp": 1234567891
   }
   ```

3. **Secure Communication** (PROTECTED packets)
   - All subsequent packets use derived application keys
   - Heartbeats maintain connection liveness
   - Stream frames carry application data

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

// Initialize QUICVC
const quicVC = QuicVCConnectionManager.getInstance(ownPersonId);
await quicVC.initialize(vcManager, myDeviceCredential);

// Connect to a device
await quicVC.connect('esp32-device-001', '192.168.1.100', 49498);

// Listen for events
quicVC.onConnectionEstablished.listen((deviceId, vcInfo) => {
    console.log(`Connected to ${deviceId}, owner: ${vcInfo.issuerPersonId}`);
});

// Send data
const command = { type: 'led_control', state: 'on' };
await quicVC.sendData('esp32-device-001', 
    new TextEncoder().encode(JSON.stringify(command))
);

// Handle incoming data
quicVC.onPacketReceived.listen((deviceId, data) => {
    const message = new TextDecoder().decode(data);
    console.log(`Received from ${deviceId}: ${message}`);
});
```

### ESP32 Integration (Planned)
```c
// Initialize QUICVC
quicvc_config_t config = {
    .port = 49498,
    .device_id = "esp32-device-001",
    .credential = &my_device_credential
};
quicvc_init(&config);

// Accept connections
quicvc_connection_t conn;
if (quicvc_accept(&conn) == ESP_OK) {
    // Connection established after VC verification
    printf("Connected to owner: %s\n", conn.remote_vc.issuer);
}

// Receive and process commands
uint8_t buffer[1024];
size_t len = sizeof(buffer);
if (quicvc_recv(&conn, buffer, &len, 1000) == ESP_OK) {
    // Process received data
    process_command(buffer, len);
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