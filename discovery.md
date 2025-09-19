# Device Discovery Documentation

## Recent Debug Session (2025-08-03)

### Issue: Discovered ESP32 device not showing in UI

**Symptoms:**
- ESP32 device being discovered (esp32-9888e0ee6804)
- AttestationDiscovery receiving and parsing messages correctly
- Device not appearing in UI device list
- Logs showing duplicate devices with undefined properties

**Root Cause Analysis:**
1. Property name mismatch between backend (deviceId/deviceType) and UI (id/type)
2. Inconsistent interface definitions across the codebase
3. Type casting hiding compilation errors

**Debug Log Analysis:**
```
LOG  [AttestationDiscovery] getDevices called, returning 1 devices
LOG  [AttestationDiscovery] Device IDs: ["esp32-9888e0ee6804"]
LOG  [DeviceModel] Discovered devices: 1
LOG  [DeviceModel] Returning devices: [{"id": "esp32-9888e0ee6804", ...}, {"id": undefined, ...}]
```

**Fixes Applied:**
1. Standardized all device interfaces to use `deviceId` and `deviceType`
2. Fixed AttestationDiscovery to emit updates even for lastSeen changes
3. Added debug logging to trace device object structure
4. Fixed DeviceDiscoveryModel event emissions
5. Updated useDeviceDiscovery hook to map backend properties to UI format

**Current Status:**
- Fixed missing event emission in DeviceDiscoveryModel.handleDeviceUpdated
- Fixed property mapping in useDeviceDiscovery (DeviceModel returns deviceId/deviceType)
- Added extensive debug logging to trace device flow
- Issue resolved: Device should now appear in UI after discovery

## Overview

The LAMA app uses a multi-layered device discovery system that combines UDP broadcast discovery with WebSocket relay (CommServer) connectivity. This hybrid approach ensures devices can find each other both on local networks and across the internet.

## Architecture

### Core Components

1. **DeviceDiscoveryModel** - Main orchestrator for device discovery
2. **DiscoveryProtocol** - Handles UDP broadcast discovery on local networks
3. **CommServerManager** - Manages WebSocket connections for relay-based discovery
4. **CredentialVerifier** - Handles device authentication and trust establishment
5. **VCManager** - Manages Verifiable Credential exchange for QUIC-VC authentication
6. **ESP32ConnectionManager** - Manages authenticated ESP32 device connections
7. **UdpModel** - Provides UDP socket functionality with zero-copy performance

### Discovery Flow

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Local Discovery │    │ Relay Discovery  │    │ Trust Exchange  │
│   (UDP Bcast)   │    │  (CommServer)    │    │ (Credentials)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Device Connection                            │
│              (Direct P2P or Relay-based)                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Discovery Session Management

Each discovery session is uniquely identified using a SHA256 hash generated from:
- A random nonce
- The device's instance ID
- A timestamp

The session ID is stored as a `DiscoveryID` unversioned object in the ONE system and logged to the journal for audit trails.

## Local Network Discovery (UDP Broadcast)

### DiscoveryProtocol

The `DiscoveryProtocol` class handles device discovery on local networks using UDP broadcasts.

#### Key Features
- **UDP Broadcast**: Sends discovery requests to `255.255.255.255:49497`
- **Zero-copy UDP**: Uses the optimized `@lama/react-native-udp-direct` module
- **Automatic Port Fallback**: Tries alternative ports (49498-49502) if primary port is busy
- **Device Aging**: Automatically removes devices that haven't responded recently
- **Error Recovery**: Handles socket errors and transport failures gracefully

#### Configuration
```typescript
interface DiscoveryConfig {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  capabilities: string[];
  version: string;
  discoveryPort: number;     // Default: 49497
  discoveryInterval: number; // Default: 5000ms
  maxAge: number;           // Default: 30000ms
  broadcastAddress: string; // Default: '255.255.255.255'
}
```

#### Discovery Message Format
```typescript
interface DiscoveryMessage {
  type: 'discovery_request' | 'discovery_response';
  deviceId: string;
  deviceName: string;
  deviceType: string;
  capabilities: string[];
  version: string;
  timestamp: number;
}
```

#### Socket Lifecycle Management

The protocol properly manages UDP socket lifecycle to prevent "Socket not found" errors:

1. **Creation**: Socket IDs are generated incrementally by `UDPSocketManager`
2. **Cleanup**: Old sockets are closed when `stopDiscovery()` or `shutdown()` is called
3. **Re-initialization**: Existing protocols are properly shut down before creating new ones
4. **Timer Management**: Discovery and pruning intervals are cleared on shutdown
5. **Session Tracking**: Each discovery session is tracked with a unique DiscoveryID object

#### Common Issues and Fixes

**Socket Not Found Errors**: Fixed by implementing proper cleanup in `DeviceDiscoveryModel`:
- Old `DiscoveryProtocol` instances are shut down before creating new ones
- Interval timers are cleared to prevent stale socket usage
- Async cleanup is properly awaited

**Recipe Not Found Errors**: The `DiscoveryID` recipe must be registered at runtime:
- Recipe is included in `ALL_RECIPES` array
- Runtime registration using `addRecipeToRuntime()` before storing objects
- Proper declaration in `@OneObjectInterfaces` ambient module

## Relay Discovery (CommServer)

### CommServerManager

The `CommServerManager` handles WebSocket connections to relay servers for internet-wide device discovery.

#### Key Features
- **WebSocket Relay**: Connects to CommServer instances for device relay
- **Multi-server Support**: Can connect to multiple CommServer instances simultaneously
- **Automatic Reconnection**: Handles connection drops and automatically reconnects
- **Message Routing**: Routes messages between devices through the relay
- **Spare Connections**: Maintains spare connections for quick device pairing

#### CommServer Protocol
- **Connection Handshake**: Establishes secure WebSocket connection
- **Device Registration**: Registers device with relay for discovery
- **Message Relay**: Forwards messages between connected devices
- **Connection Handover**: Facilitates transition from relay to direct P2P

## Trust and Authentication

### CredentialVerifier

The `CredentialVerifier` class handles device authentication and trust establishment.

#### Key Features
- **Challenge-Response Authentication**: Uses cryptographic challenges to verify devices
- **Public Key Verification**: Validates device public keys against known credentials
- **Trust Establishment**: Manages trust relationships between devices
- **TTL Management**: Handles credential expiration and renewal

#### Credential Flow
1. **Discovery**: Device found via UDP broadcast or CommServer relay
2. **Challenge**: Verifier sends cryptographic challenge to device
3. **Response**: Device signs challenge with private key
4. **Verification**: Verifier validates signature with device's public key
5. **Trust**: Device marked as trusted and added to contacts

## Port Handling and Service Communication

### Discovery Port Configuration

The discovery system uses a fixed port for all services:

```typescript
// Fixed port for all ESP32 services
const UNIFIED_SERVICE_PORT = 49497; // All services: discovery, credentials, LED, data
```

### ESP32 Device Port Behavior

ESP32 devices use a FIXED port model - no fallbacks:

1. **Discovery Phase**:
   - ESP32 sends discovery broadcasts FROM port 49497
   - App receives discovery message and records the source port
   - This port is stored in the Device object as `device.port`

2. **Service Communication**:
   - ESP32 ALWAYS listens on port 49497 for all services
   - If app doesn't know the port, it MUST NOT send - no guessing
   - The service type byte (first byte) determines message routing

### Port Handling Best Practices

```typescript
// Correct: Only send if we have a valid port
if (device.port && device.port > 0) {
  const success = await credentialModel.sendCredentialToDevice(
    credential,
    device.address,
    device.port  // Must be 49497 for ESP32
  );
} else {
  console.error('Cannot send credential - no valid port for device');
  // DO NOT attempt to send with a guessed port
}

// Incorrect: Using fallbacks or guessing
const port = device.port || 49497;  // NO! Don't guess
```

### Service Message Format

All service messages to ESP32 devices follow this format:

```
[Service Type Byte][JSON Payload]
```

Service Types:
- `0x01` - Discovery
- `0x02` - Credentials
- `0x03` - LED Control
- `0x04` - Data Transfer

### Credential Transfer Protocol

The credential transfer to ESP32 devices follows this flow:

1. **App Sends Credential**:
   ```typescript
   // Service packet structure
   const packet = {
     type: 'credential_transfer',
     credential: credential, // Direct object, not base64
     source: 'lama-app',
     timestamp: Date.now()
   };
   
   // Send to discovered port with service type 2
   // IMPORTANT: Use proper ArrayBuffer allocation to prevent crashes
   const buffer = new ArrayBuffer(1 + jsonBytes.length);
   const servicePacket = new Uint8Array(buffer);
   servicePacket[0] = 2; // Credentials service type
   servicePacket.set(jsonBytes, 1);
   ```

2. **ESP32 Receives Credential**:
   - Listens on port 49497 for service messages
   - Routes service type 2 to `handle_credential_packet`
   - Parses credential object (supports both 'credential_transfer' and 'credential_flash')
   - Extracts owner ID from credential.sub (or credential.iss as fallback)
   - Stores owner via `quicvc_auth_set_owner()`
   - Sends acknowledgment back

3. **ESP32 Sends Acknowledgment**:
   ```c
   // After successful storage
   cJSON *ack = cJSON_CreateObject();
   cJSON_AddStringToObject(ack, "type", "credential_ack");
   cJSON_AddStringToObject(ack, "status", "success");
   
   // Create service packet with type 2
   uint8_t *packet = malloc(len + 1);
   packet[0] = SERVICE_TYPE_CREDENTIALS;
   memcpy(packet + 1, ackStr, len);
   
   // Send back to app
   sendto(socket_fd, packet, len + 1, 0, client_addr, sizeof(*client_addr));
   ```

4. **App Handles Response**:
   - CredentialServiceHandler receives ACK on service type 2
   - Validates response type and status
   - Updates device ownership status on success
   - Cleans up pending transfer tracking

### Common Port Issues and Solutions

1. **Issue**: Device has no valid port
   - **Symptom**: Cannot send credentials or commands
   - **Cause**: Device not properly discovered or port not saved
   - **Solution**: Device must be discovered first - no sending without valid port

2. **Issue**: Port 0 in saved devices
   - **Symptom**: Credential sending fails with "Invalid port" error
   - **Cause**: Legacy saved devices without port information
   - **Solution**: Re-discover device to get valid port (49497)

3. **Issue**: ESP32 not receiving messages
   - **Symptom**: No response to any service messages
   - **Cause**: ESP32 not listening on port 49497
   - **Solution**: ESP32 firmware must bind to port 49497 for all services

## Integration with Transport Layer

### UdpModel Integration

The discovery system integrates with the high-performance UDP transport:

#### Zero-Copy UDP Module
- **JSI Integration**: Direct JavaScript-to-native calls without bridge overhead
- **ArrayBuffer Support**: True zero-copy data transfer with offset/length support
- **Thread Safety**: Proper marshaling between JavaScript and native threads
- **Memory Management**: Automatic cleanup of native buffers

#### Socket Management
```typescript
// Creating a UDP socket for discovery
const socket = await UdpModel.getInstance().createSocket({
  type: 'udp4',
  reuseAddr: true,
  broadcast: true
});

// Zero-copy sending with offset/length support
const message = new TextEncoder().encode(JSON.stringify(discoveryMessage));
await socket.send(message, port, address);
```

### QuicModel Integration

Discovery integrates with the QUIC transport layer for high-performance P2P connections:

#### Transport Handover
1. **Initial Discovery**: Device found via UDP broadcast or relay
2. **Capability Exchange**: Devices negotiate supported transports
3. **Connection Establishment**: Direct QUIC connection established
4. **Relay Disconnect**: CommServer relay connection closed (if used)

## Discovery Session Tracking

### DiscoveryID Object

Discovery sessions are tracked using a `DiscoveryID` unversioned object stored in the ONE system:

```typescript
interface DiscoveryID {
  $type$: 'DiscoveryID';
  nonce: string;              // Random value for uniqueness
  timestamp: number;          // Session start time
  sessionType: 'device_discovery';
}
```

### Recipe Registration

The DiscoveryID recipe must be registered at runtime before use:

```typescript
// Check if recipe is registered
if (!hasRecipe('DiscoveryID')) {
  addRecipeToRuntime(DiscoveryIDRecipe);
}

// Store the DiscoveryID object
const result = await storeUnversionedObject(discoveryID);
const sessionId = result.idHash.toString();
```

### Journal Integration

Discovery sessions are logged to the journal for audit trails:
- Session start events with session ID and nonce
- Session stop events with duration
- Error events with failure reasons

## Configuration and Settings

### DeviceDiscoveryModel Configuration

The discovery system can be configured through the `DeviceSettingsService`:

```typescript
interface DiscoverySettings {
  discoveryEnabled: boolean;    // Enable/disable discovery
  ownDeviceId?: string;        // Device ID
  ownDeviceName?: string;      // Display name
  ownDeviceType?: string;      // Device type
  discoveryPort?: number;      // UDP discovery port
  discoveryInterval?: number;  // Broadcast interval
  maxAge?: number;            // Device expiration time
}
```

### Settings Integration
- **Dynamic Updates**: Settings changes trigger discovery restart
- **Persistent State**: Settings are persisted across app restarts
- **Validation**: Settings are validated before applying

## Error Handling and Recovery

### Common Error Scenarios

1. **Port Conflicts**: Discovery port already in use
   - **Recovery**: Try alternative ports (49498-49502)
   - **Fallback**: Use different transport if UDP fails

2. **Socket Lifecycle Errors**: "Socket not found" during send
   - **Cause**: Stale socket references after re-initialization
   - **Fix**: Proper cleanup of old protocol instances

3. **Network Changes**: WiFi disconnect/reconnect
   - **Recovery**: Automatic transport re-initialization
   - **Fallback**: Switch to cellular/relay discovery

4. **Transport Failures**: UDP or QUIC transport errors
   - **Recovery**: Fresh transport creation with fallback ports
   - **Logging**: Detailed error logging for debugging

5. **Transport Initialization Errors**: "Transport not initialized" when toggling discovery
   - **Cause**: Shared transport being closed by DiscoveryProtocol when it should remain open
   - **Fix**: Track transport ownership - only close self-created transports, not externally provided ones
   - **Implementation**: Use `wasTransportProvided` flag to determine cleanup behavior

6. **Socket Not Found Errors**: "Socket X not found for sending" when discovery is off
   - **Cause**: Trying to send credentials using a socket that was closed when discovery stopped
   - **Fix**: Ensure transport is re-initialized before sending credentials
   - **Recovery Strategy**: 
     - Check transport state before sending
     - Reset QuicModel instance if transport is invalid
     - Wrap send operations in try-catch for graceful error handling
   - **Implementation**: Added recovery logic in `VerifiableCredentialModel.sendCredentialToESP32()`

### Error Recovery Strategies

```typescript
// Graceful error handling in DiscoveryProtocol
try {
  await this.transport.send(packet, address, port);
} catch (error) {
  console.error('[DiscoveryProtocol] Send error:', error);
  // Don't throw to avoid crashing discovery
  this.onError.emit(error);
}
```

### Transport Management Best Practices

1. **Shared Transport Handling**: When a transport is provided externally (e.g., from QuicModel):
   ```typescript
   // In DiscoveryProtocol constructor
   if (transport) {
     this.transport = transport;
     this.wasTransportProvided = true; // Track that we didn't create it
   }
   
   // In stopDiscovery() - only close self-created transports
   if (!this.wasTransportProvided && this.transport) {
     await this.transport.close();
   }
   ```

2. **Transport Re-validation**: Before starting discovery, verify transport is still valid:
   ```typescript
   // Check if transport is still valid before starting discovery
   if (!this._transport || !this._transport.isInitialized()) {
     // Try to get it from QuicModel if available
     if (this._quicModel && this._quicModel.isInitialized()) {
       this._transport = this._quicModel.getTransport();
     }
   }
   ```

## Performance Optimizations

### Zero-Copy Data Path

The discovery system uses zero-copy optimizations for UDP communication:

#### Benefits
- **No Data Copying**: Direct memory access between JavaScript and native
- **Reduced Memory Usage**: No intermediate base64 strings
- **Lower Latency**: Direct JSI calls bypass React Native bridge
- **Higher Throughput**: Optimized for high-frequency discovery broadcasts

#### Implementation
```typescript
// Zero-copy UDP send with offset/length support
const buffer = message.buffer;
const offset = message.byteOffset;
const length = message.byteLength;

// Direct JSI call for maximum performance
(global as any).udpSendDirect(socketId, buffer, offset, length, port, address);
```

### Memory Management

- **Automatic Cleanup**: Native buffers cleaned up when JavaScript objects are GC'd
- **Reference Counting**: Shared pointers manage native memory lifecycle
- **Thread Safety**: Safe memory access across JavaScript and native threads

## Debugging and Monitoring

### Debug Logging

Enable detailed discovery logging:

```bash
# Enable discovery debug logs
DEBUG=one:discovery:* npm start
```

### Key Log Messages

- `[DeviceDiscoveryModel] Initializing...` - Model startup
- `[DeviceDiscoveryModel] Registering DiscoveryID recipe` - Recipe registration
- `[DeviceDiscoveryModel] Generated discovery session ID using ONE.core: X` - Session ID creation
- `[DiscoveryProtocol] Starting discovery process...` - UDP discovery start
- `[UDPDirectJSI] Zero-copy send X bytes` - UDP packet transmission
- `[DiscoveryProtocol] Device discovered: X` - Device found
- `[CredentialVerifier] Challenge sent to device X` - Authentication start

### Common Debug Scenarios

1. **No Devices Found**: Check UDP broadcast functionality
2. **Socket Errors**: Verify port availability and permissions
3. **Authentication Failures**: Check device credentials and keys
4. **Connection Issues**: Verify network connectivity and firewall settings
5. **Recipe Not Found**: Ensure DiscoveryID recipe is registered at runtime

## Future Enhancements

### Planned Improvements

1. **Android Support**: Extend UDP module to Android platform
2. **IPv6 Support**: Add support for IPv6 discovery
3. **Multicast Discovery**: Use multicast instead of broadcast
4. **Performance Metrics**: Add throughput and latency measurements
5. **Better Error Recovery**: Enhanced error handling and retry logic

### Scalability Considerations

- **Discovery Frequency**: Balance between responsiveness and network load
- **Device Limit**: Consider maximum devices per network
- **Memory Usage**: Monitor discovery data structure growth
- **Battery Impact**: Optimize for mobile device battery life

## Persistent Device Ownership

### Overview

Device ownership is persisted using DeviceCredential objects stored in a dedicated channel, following the chat message storage pattern. This ensures device ownership survives app restarts.

### Storage Architecture

```typescript
// Separate channels for different object types
const journalChannelId = `device-ownership-journal-${personId}`;    // JournalEntry objects
const credentialsChannelId = `device-credentials-${personId}`;      // DeviceCredential objects
```

### DeviceCredential Object

```typescript
interface DeviceCredential {
  $type$: 'DeviceCredential';
  id: string;                    // Unique credential ID (isID field)
  issuer: string;                // Person ID who issued the credential
  issuedAt: number;              // Timestamp when issued
  expiresAt: number;             // Expiration timestamp
  deviceId: string;              // ID of the device
  deviceType: string;            // Type of device (ESP32, etc.)
  ownerId: SHA256IdHash<Person>; // Owner's Person ID
  type: string;                  // Credential type (ownership, access, etc.)
  permissions: string;           // Permissions granted
  proof: string;                 // Cryptographic proof
  revoked: boolean;              // Whether credential is revoked
}
```

### Credential Lifecycle

1. **Creation**: When device ownership is established
   - Created when ESP32 device authenticates via QUIC-VC
   - Created when user manually registers device ownership
   - Stored as unversioned object in ONE system
   - Posted to credentials channel for persistence

2. **Loading**: On app startup
   ```typescript
   // Load credentials from storage (following chat pattern)
   const credentials = await channelManager.getObjectsWithType('DeviceCredential', {
     channelId: credentialsChannelId
   });
   ```

3. **Ownership Testing**: At specific points
   - **On Boot**: Test all stored credentials are still valid
   - **After Creation**: Verify ownership immediately after credential creation
   - **On Request**: Manual verification when requested by user

4. **Revocation**: When removing device ownership
   - Mark credential as revoked (not deleted)
   - Post updated credential to channel
   - Remove ownership from device object

### Device Availability Tracking

#### Real-time Availability
- Track last seen timestamp for each device
- Update on discovery broadcasts and responses
- Provide availability status for UI display

#### Availability States
- **"Just now"**: Device seen < 1 minute ago
- **Exact time**: Device seen > 1 minute ago (e.g., "2:34 PM")
- **"Never seen"**: Device has credential but never discovered

#### Periodic Availability Testing
- Test device availability every 2 minutes
- Send ping commands to ESP32 devices
- Log significant events only (reduce journal noise):
  - Always log when device becomes unavailable
  - Occasionally log "just now" status (10% sampling)
  - Skip routine "still available" entries

### Journal Integration

#### Separate Channels
- **Journal Channel**: Device ownership events, discovery sessions, availability changes
- **Credentials Channel**: DeviceCredential objects only

#### Journal Entry Types
- **DeviceOwnership**: Ownership established/removed/verified events
- **DeviceDiscovery**: Discovery session start/stop events
- **DeviceAvailability**: Device availability status changes

#### Noise Reduction
- Filter journal entries to reduce noise
- Only log significant availability changes
- Sample periodic "still available" events

### ESP32 Device Integration

#### Authentication Flow
1. ESP32 device discovered via UDP broadcast
2. QUIC-VC authentication initiated
3. Device presents verifiable credential
4. App verifies credential and establishes ownership
5. DeviceCredential created and stored
6. Ownership tested immediately after creation

#### Journal Synchronization
- ESP32 devices can sync their journal entries
- Journal entries from devices stored with prefix "ESP32_"
- Synced entries include device ID and sync timestamp

## Security Considerations

### Network Security
- **Broadcast Visibility**: Discovery messages visible on local network
- **Authentication Required**: All devices must authenticate before trust
- **Encryption**: All data encrypted after initial discovery
- **Key Management**: Secure handling of cryptographic keys

### Privacy Protection
- **Minimal Information**: Discovery messages contain minimal device info
- **Opt-in Discovery**: Users can disable discovery entirely
- **Trust Control**: Users control which devices to trust
- **Data Isolation**: Discovery data isolated from application data

### Credential Security
- **Cryptographic Proof**: Credentials include cryptographic proof of ownership
- **Expiration**: Credentials have expiration timestamps
- **Revocation**: Credentials can be revoked without deletion
- **Channel Isolation**: Credentials stored in dedicated channel