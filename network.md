# Network Architecture

## Overview

The Lama app implements **QUIC-VC (QUIC with Verifiable Credentials)** - a novel approach that replaces traditional QUIC-TLS with decentralized, credential-based authentication. This provides:

- **Full QUIC transport** - reliable, multiplexed, stream-oriented communication over UDP
- **Decentralized authentication** - no Certificate Authorities, using Verifiable Credentials instead
- **Rich authorization** - credentials encode device capabilities, permissions, and trust relationships
- **P2P optimized** - designed for mobile devices with dynamic IPs and NAT traversal

## Architecture

```
┌─────────────────────────────────────────────┐
│          UnifiedNetworkManager              │
│  (Single API for all network operations)    │
└─────────────────┬───────────────────────────┘
                  │
    ┌─────────────┴─────────────┬─────────────┐
    │                           │             │
┌───▼──────────┐  ┌────────────▼──────┐  ┌───▼──────────┐
│NetworkCoordinator│  │   QuicVCLayer    │  │DiscoveryService│
│ (UDP Socket)     │  │ (Authentication) │  │  (Discovery)    │
└──────────────────┘  └─────────────────┘  └─────────────────┘
        │                      │                    │
        └──────────┬───────────┴────────────────────┘
                   │
           ┌───────▼────────┐
           │ Service Router │
           │ (By Type Byte) │
           └───────┬────────┘
    ┌──────────────┼──────────────┬─────────────┬──────────────┐
    │              │              │             │              │
┌───▼────┐  ┌─────▼──────┐  ┌───▼──────┐  ┌───▼────┐  ┌──────▼─────┐
│Discovery│  │Credentials │  │VC Exchange│  │ESP32   │  │Journal Sync│
│Handler  │  │Handler     │  │Handler    │  │Control │  │Handler     │
│(Type 1) │  │(Type 2)    │  │(Type 3)   │  │(Type 4)│  │(Type 5)    │
└─────────┘  └────────────┘  └───────────┘  └────────┘  └────────────┘
```

## Components

### NetworkCoordinator
- **Single UDP socket** for all network operations
- **Automatic reconnection** on failure
- **Service-based routing** (discovery, credentials, LED control, data)
- **Health monitoring** with self-healing
- **Retry logic** for resilience

### QuicVCLayer (QUIC-VC Implementation)
- **QUIC transport** without TLS - provides reliable, multiplexed streams
- **Verifiable Credential exchange** - replaces TLS handshake
- **Challenge-response authentication** - additional security layer
- **Stream multiplexing** - multiple data streams per connection
- **Connection caching** - reuse authenticated connections
- **Congestion control** - QUIC's built-in flow control

### DiscoveryService
- **UDP broadcast** for device discovery
- **Periodic announcements** (configurable interval)
- **Device timeout** handling
- **Event-driven** updates

### UnifiedNetworkManager
- **Single entry point** for network operations
- **Identity-first** initialization
- **High-level APIs**:
  - `sendCredential()` - Send ownership credentials
  - `sendLEDCommand()` - Control device LEDs
  - `sendData()` - Send data to authenticated devices
  - `getDevices()` - Get discovered devices
  - `getStatus()` - Network health status

## Initialization

```typescript
// 1. Get device identity first
const trustModel = new TrustModel();
await trustModel.init();
const identity = await trustModel.getDeviceIdentity();

// 2. Initialize network with identity
const network = UnifiedNetworkManager.getInstance({
  port: 49497,
  discoveryEnabled: true,
  deviceName: 'Lama App',
  deviceType: 'mobile',
  capabilities: ['messaging', 'file-transfer', 'quic-vc']
});

await network.initialize({
  deviceId: identity.deviceId,
  secretKey: identity.secretKey,
  publicKey: identity.publicKey
});
```

### Service Handler Registration

Service handlers are registered during model initialization:

```typescript
// In DeviceDiscoveryModel.init()
this._discoveryProtocol = new DiscoveryProtocol(config, transport);
// Registers handler for service type 1 (Discovery)

// In DeviceDiscoveryModel.setOwnIdentity()
this._credentialVerifier = new CredentialVerifier(config, transport);
// Registers handler for service type 2 (Credentials)

this._vcManager = new VCManager(config);
// Registers handler for service type 3 (VC Exchange)

this._esp32ConnectionManager = new ESP32ConnectionManager(transport, vcManager, personId);
// Registers handler for service type 4 (ESP32 Control)

this._esp32JournalSync = new ESP32JournalSync(transport, connectionManager, personId);
// Registers handler for service type 5 (Journal Sync)
```

**Important**: Each service type can only have ONE handler. The transport's `addService()` method should be called only once per service type.

## Service Types

| Service | Type | Description |
|---------|------|-------------|
| Discovery | 1 | Device discovery broadcasts |
| Credentials | 2 | Ownership credential transfer (legacy) |
| VC Exchange | 3 | Verifiable Credential exchange (QUIC-VC) |
| ESP32 Control | 4 | ESP32 device control commands |
| Journal Sync | 5 | Journal-based data synchronization |
| Health Check | 0xFF | Internal health monitoring |

## Message Flow

### Device Discovery
```
App → Broadcast discovery message (every 5s)
ESP32 → Receives and responds with its info
App → Updates device list, emits 'deviceDiscovered'
```

### Credential Transfer
```
App → Send credential packet to ESP32
ESP32 → Validate and store credential
ESP32 → Send acknowledgment
App → Update device ownership on ACK
```

### QUIC-VC Authentication Flow
```
Device A                           Device B
   |                                  |
   |------ UDP Discovery Broadcast -->|
   |<----- UDP Discovery Response ----|
   |                                  |
   |===== QUIC Connection Setup ======|
   |         (No TLS)                 |
   |                                  |
   |------ VC Request --------------->|
   |  (Service Type 3)                |
   |                                  |
   |<----- VC Presentation -----------|
   |  (DeviceIdentityCredential)      |
   |                                  |
   |------ VC Verification ---------->|
   |  (Signature & Trust Check)       |
   |                                  |
   |------ Challenge Request -------->|
   |  (Service Type 2)                |
   |                                  |
   |<----- Challenge Response --------|
   |  (Signed with Private Key)       |
   |                                  |
   |====== Secure Channel Ready ======|
   |    (Multiplexed QUIC Streams)    |
```

### QUIC Transport Features

After QUIC-VC authentication establishes a secure channel, the full QUIC transport provides:

#### Stream Multiplexing
Multiple independent data streams over a single connection:
```typescript
// Open a new stream for file transfer
const stream = await quicConnection.openStream();
await stream.write(fileData);

// Simultaneously open another stream for control messages
const controlStream = await quicConnection.openStream();
await controlStream.write(controlMessage);
```

#### Reliable Delivery
QUIC ensures reliable, ordered delivery of data with automatic retransmission:
```typescript
// Send large data reliably
await quicStream.write(largeDataBuffer);
// QUIC handles packet loss, reordering, and retransmission
```

#### Flow Control
Built-in congestion control and flow control prevent overwhelming receivers:
```typescript
// QUIC automatically manages flow control
// No manual buffering needed
for (const chunk of dataChunks) {
  await stream.write(chunk); // Blocks if receiver is slow
}
```

### Data Transfer via Service Types

The QUIC-VC transport supports various application-level services:

#### ESP32 Control (Service Type 4)
Used for sending commands to authenticated ESP32 devices:
```typescript
// Send LED control command
const command: ESP32Command = {
  type: 'led_control',
  action: 'set',
  color: { r: 255, g: 0, b: 0 },
  brightness: 100
};
await network.sendESP32Command(deviceId, command);
```

#### Journal Synchronization (Service Type 5)
Used for syncing journal entries between devices:
```typescript
// Sync journal entries
const entries = await network.syncESP32Journal(deviceId);
```

#### Verifiable Credential Exchange (Service Type 3)
Used for exchanging verifiable credentials:
```typescript
// Request VC from device
await vcManager.requestVCFromDevice(deviceAddress, port);
```

## Resilience Features

1. **Automatic Reconnection**
   - Socket errors trigger reconnection with exponential backoff
   - Preserves service handlers across reconnections

2. **Retry Logic**
   - Failed operations retry up to 3 times
   - Exponential backoff between retries

3. **Health Monitoring**
   - Periodic health checks when idle
   - Automatic recovery on detection of issues

4. **Connection Caching**
   - Authenticated connections cached for 10 minutes
   - Reduces authentication overhead

5. **Timeout Handling**
   - All operations have configurable timeouts
   - Clean cleanup on timeout

## Performance Optimizations

1. **Single Socket** - All services share one UDP socket
2. **Fast Routing** - First byte determines service type
3. **Connection Cache** - Skip re-authentication when possible
4. **Efficient Broadcasts** - Single packet for discovery
5. **Minimal Overhead** - Lean protocol design

## Error Handling

All network operations follow consistent error handling:

```typescript
try {
  const success = await network.sendCredential(deviceId, credential);
  if (success) {
    console.log('Credential accepted');
  } else {
    console.log('Credential rejected');
  }
} catch (error) {
  console.error('Network error:', error);
  // Network will automatically attempt recovery
}
```

## Monitoring

Get comprehensive network status:

```typescript
const status = network.getStatus();
console.log(status);
// {
//   initialized: true,
//   coordinator: {
//     connected: true,
//     stats: { packetsSent: 150, packetsReceived: 145 }
//   },
//   discovery: { enabled: true, deviceCount: 3 },
//   connections: [...]
// }
```

## Best Practices

1. **Initialize Once** - Network manager is a singleton
2. **Provide Identity Early** - Initialize with full identity
3. **Handle Events** - Listen for device discovery/authentication events
4. **Check Status** - Monitor network health regularly
5. **Clean Shutdown** - Call `shutdown()` when done
6. **Avoid Duplicate Handlers** - Each service type must have only ONE handler registered. Multiple handlers for the same service type will cause crashes.

## Security Benefits of QUIC-VC

### Advantages Over QUIC-TLS
1. **No CA Dependency** - Eliminates single points of failure and CA compromise risks
2. **Self-Sovereign Identity** - Devices control their own credentials
3. **Rich Authorization** - VCs encode capabilities, not just identity
4. **Offline Verification** - No OCSP/CRL checks needed
5. **Mobile Optimized** - Works with dynamic IPs and NAT traversal

### Cryptographic Security
- **Ed25519 signatures** for authentication
- **SHA256 hashes** for identity
- **Challenge-response** prevents replay attacks
- **Time-bound credentials** with expiration
- **Revocation** through trust list updates

## Migration from Old System

See [network-migration.md](network-migration.md) for detailed migration guide from the old QuicModel/DeviceDiscoveryModel system.

## See Also

- [quicvc-lama.md](quicvc-lama.md) - Detailed QUIC-VC implementation documentation
- [discovery.md](discovery.md) - Device discovery protocol details
- [vc_instead_of_tls.md](vc_instead_of_tls.md) - Rationale for using VCs instead of TLS