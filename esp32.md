# ESP32 Software Architecture Documentation

## Overview
The ESP32 firmware implements the QUICVC (QUIC with Verifiable Credentials) protocol for secure device communication with the React Native mobile app. The firmware runs on ESP32-C3 boards and provides LED control, device ownership management, and secure credential exchange.

## Architecture Components

### 1. Core Protocol Implementation

#### QUICVC Protocol Stack
- **Port**: 49497 (all QUICVC communication)
- **Version**: 0x00000001 (QUICVC v1)
- **Packet Types**: 
  - INITIAL (0x00) - Connection establishment and VC exchange
  - HANDSHAKE (0x01) - Key exchange and authentication
  - PROTECTED (0x02) - Encrypted application data
  - RETRY (0x03) - Connection retry mechanism

#### Frame Types
```c
QUICVC_FRAME_VC_INIT = 0x10       // Client credential presentation
QUICVC_FRAME_VC_RESPONSE = 0x11   // Device credential response
QUICVC_FRAME_VC_ACK = 0x12        // Acknowledge VC exchange
QUICVC_FRAME_STREAM = 0x08        // Application data (LED control)
QUICVC_FRAME_ACK = 0x02           // Packet acknowledgment
QUICVC_FRAME_HEARTBEAT = 0x20     // Connection keepalive
QUICVC_FRAME_DISCOVERY = 0x01     // Device discovery broadcast
```

### 2. Connection Management

#### Connection State Machine
```
IDLE -> WAIT_INITIAL -> WAIT_HANDSHAKE -> ESTABLISHED -> CLOSING -> CLOSED
```

#### Connection Structure
```c
typedef struct {
    uint32_t connection_id;        // Random ID for this connection
    struct sockaddr_in peer_addr;  // Peer IP and port
    quicvc_connection_state_t state;
    uint64_t tx_packet_num;        // Outgoing packet number
    uint64_t rx_packet_num;        // Incoming packet number
    uint64_t last_activity;        // Timestamp for timeout
    bool is_authenticated;         // Auth status
    char owner_person_id[65];      // SHA256 hash of owner
    uint8_t session_key[32];       // Encryption key
    bool is_active;               // Connection slot active
} quicvc_connection_t;
```

### 3. Device Ownership

#### Ownership States
1. **Unclaimed**: Device broadcasts discovery, accepts any valid credential
2. **Owned**: Device only accepts commands from owner, stores owner ID in NVS
3. **Revocation**: Owner can revoke ownership, returning device to unclaimed

#### Persistent Storage (NVS)
- **Namespace**: "device_state"
- **Keys**:
  - "owned" (uint8_t): 1 if owned, 0 if not
  - "owner_id" (string): SHA256 hash of owner's Person ID
  - "device_id" (string): Device unique identifier

### 4. LED Control System

#### Command Processing Flow
1. Receive PROTECTED packet with STREAM frame
2. Verify connection is authenticated
3. Check issuer matches device owner
4. Validate timestamp (5-minute window)
5. Process LED command (on/off/toggle)
6. Send response with current state

#### LED States
- **Manual Control**: Set when controlled via QUICVC
- **Discovery Blink**: 2Hz blink during discovery
- **Heartbeat**: Slow pulse when idle
- **State Feedback**: Visual confirmation of commands

### 5. Discovery System

#### Discovery Broadcast
- **Interval**: 5 seconds (unclaimed), stopped when owned
- **Content**: Device ID, MAC, IP, ownership status
- **Format**: INITIAL packet with DISCOVERY frame

#### Discovery Response
- Sent when receiving discovery requests
- Includes device capabilities and current state
- Allows app to find devices on network

### 6. Security Features

#### Time Synchronization
- Synchronized during ownership claim
- Used to validate command timestamps
- Prevents replay attacks (5-minute window)

#### Credential Validation
- Verifies credential signatures
- Checks issuer authority
- Validates expiration dates
- Stores trusted owner ID

#### Connection Security
- Per-connection session keys (planned)
- Packet number tracking
- Idle timeout (2 minutes)
- Heartbeat keepalive (30 seconds owned, 10 seconds unclaimed)

## Known Issues and Fixes

### Issue 1: Connection ID Tracking
**Problem**: ESP32 doesn't properly track DCID/SCID from handshake
- Always sends DCID as zeros
- Uses MAC address as SCID
- Causes "connection not found" errors in app

**Root Cause**: 
```c
// In send_quicvc_packet() - lines 1255-1266
// Always uses zeros for DCID:
memset(packet + packet_len, 0, 8);

// Always uses MAC for SCID:
memcpy(packet + packet_len, device_mac, 6);
```

**Fix Required**:
1. Store DCID/SCID during handshake in connection struct
2. Use stored IDs when sending PROTECTED packets
3. Properly swap DCID/SCID for responses

### Issue 2: LED State Response
**Status**: Working correctly
- ESP32 sends "blue_led" field in response
- App expects and processes "blue_led" field
- No mixing of state information detected

## Communication Flows

### 1. Device Discovery
```
App                          ESP32
 |                             |
 |  INITIAL + DISCOVERY -----> |
 |                             |
 | <----- INITIAL + DISCOVERY  |
 |       (device_info)         |
```

### 2. Ownership Claim
```
App                          ESP32
 |                             |
 | INITIAL + VC_INIT --------> |
 |  (credential)               |
 |                             |
 | <---- INITIAL + VC_RESPONSE |
 |      (provisioned/rejected) |
 |                             |
 | HANDSHAKE + VC_ACK -------> |
 |                             |
 | <---- HANDSHAKE + ACK       |
```

### 3. LED Control
```
App                          ESP32
 |                             |
 | PROTECTED + STREAM -------> |
 |  (led_control command)      |
 |                             |
 | <---- PROTECTED + STREAM    |
 |      (led_response)         |
```

## File Structure

```
esp32-quicvc-project/
├── main/
│   ├── main.c                 # Main QUICVC implementation
│   ├── quicvc_demo.c          # Demo/test code
│   └── main_attestation.c     # Attestation support
├── components/
│   ├── quicvc/
│   │   ├── quicvc_transport.c # Transport layer
│   │   ├── quicvc_auth.c      # Authentication
│   │   ├── quicvc_cert.c      # Certificate handling
│   │   ├── quicvc_credential.c # Credential management
│   │   ├── quicvc_crypto.c    # Crypto operations
│   │   └── display.c          # OLED display driver
│   └── attestation/
│       ├── attestation.c      # Device attestation
│       └── html_encoding.c    # Web interface
└── sdkconfig                  # Build configuration
```

## Build Configuration

### WiFi Settings (sdkconfig)
```
CONFIG_ESP_WIFI_SSID="YourSSID"
CONFIG_ESP_WIFI_PASSWORD="YourPassword"
```

### Hardware Configuration
- **LED GPIO**: Pin 8 (ESP32-C3 onboard)
- **LED Logic**: Active-low (0 = ON, 1 = OFF)
- **Display**: SSD1306 OLED (optional)
  - I2C Address: 0x3C
  - SCL: Pin 9
  - SDA: Pin 8

## Debugging

### Log Tags
- `esp32-quicvc-native` - Main protocol handler
- `quicvc_transport` - Transport layer
- `display` - OLED display operations

### Common Log Patterns
```
📶 WiFi events
📡 Discovery broadcasts
🔌 Socket operations
📤 Packet sending
📥 Packet receiving
💡 LED control
🔐 Security/auth events
✅ Success operations
❌ Error conditions
⚠️ Warnings
```

### Packet Analysis
Monitor UDP port 49497 for all QUICVC traffic. Packet format:
```
[Flags(1)] [Version(4)] [DCID_len(1)] [DCID(n)] [SCID_len(1)] [SCID(n)] [PacketNum(1)] [Frames...]
```

## Testing

### Manual Testing
1. **Discovery**: Device should broadcast every 5s when unclaimed
2. **Ownership**: Claim device, verify NVS persistence across reboots  
3. **LED Control**: Send on/off/toggle commands, verify responses
4. **Revocation**: Revoke ownership, verify return to unclaimed

### Network Testing
```bash
# Monitor QUICVC traffic
sudo tcpdump -i any -n port 49497 -X

# Check device discovery
nc -u -l 49497  # Listen for broadcasts
```

## Future Improvements

1. **Encryption**: Implement full packet encryption using session keys
2. **Certificate Chain**: Add X.509 certificate validation
3. **Multi-owner**: Support for multiple authorized users
4. **Firmware Updates**: OTA update capability via QUICVC
5. **Connection ID Fix**: Properly track and use DCID/SCID from handshake
6. **Rate Limiting**: Prevent DoS attacks on UDP socket
7. **Persistent Connections**: Maintain connection state across discovery