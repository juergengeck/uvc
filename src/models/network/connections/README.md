# Lama ConnectionsModel Integration & Protocol Documentation

This directory provides lama-specific utilities and configurations for working with the one.models ConnectionsModel while maintaining full compatibility with the original implementation.

## Approach

Rather than copying the entire ConnectionsModel source code, this approach:

1. **Re-exports** the original ConnectionsModel from one.models
2. **Provides** lama-specific configuration presets
3. **Adds** utility functions for lama's multi-transport architecture
4. **Maintains** compatibility with existing TransportManager

## Benefits

- ✅ **No code duplication** - Uses original one.models implementation
- ✅ **Type safety** - Full TypeScript support without import issues
- ✅ **Maintainability** - Automatic updates when one.models is updated
- ✅ **Customization** - Lama-specific presets and utilities
- ✅ **Compatibility** - Works with existing TransportManager architecture

---

# Protocol Documentation

## CommServer Connection & Handover Protocol

### Phase 1: Initial Registration

```
1. Client connects to CommServer WebSocket
2. Client sends: {"command": "register", "publicKey": "..."}
3. CommServer sends: {"command": "authentication_request", "challenge": "..."}
4. Client signs challenge and sends: {"command": "authentication_response", "signature": "..."}
5. CommServer sends: {"command": "authentication_success"}
6. Client is now registered and listening for connections
```

### Phase 2: Invitation Creation

```
1. Invitation creator calls ConnectionsModel.pairing.createInvitation()
2. System generates invitation with:
   - token: random 32-byte hex string
   - publicKey: creator's public key
   - url: CommServer WebSocket URL
3. Invitation URL format: https://edda.dev.refinio.one/invites/invitePartner#data={...}
```

### Phase 3: Connection Handover Flow

When someone connects using an invitation:

```
INVITATION ACCEPTOR (edda.one):
1. Connects to CommServer WebSocket from invitation URL
2. Sends: {"command": "communication_request", "sourcePublicKey": "...", "targetPublicKey": "...", "token": "..."}

INVITATION CREATOR (lama):
3. Receives: {"command": "communication_request", ...}
4. Validates target public key matches own
5. Sends: {"command": "communication_ready", "sourcePublicKey": "...", "targetPublicKey": "..."}

COMMSERVER:
6. Receives communication_ready from creator
7. Sends to BOTH parties: {"command": "connection_handover"}
8. WebSocket connections are now "handed over" for direct peer communication
```

### Phase 4: Connection Object Creation

```
BOTH PARTIES:
1. Receive connection_handover message
2. Remove all WebSocket event listeners to prevent conflicts
3. Create one.models Connection object from handed-over WebSocket
4. Add required plugins (PromisePlugin for identity exchange)
5. Emit connection via onConnection event for chum protocol handling
```

## Chum Protocol & Identity Exchange

### Connection Lifecycle in one.models

```
1. Connection object created: "🔥 [ONE_MODELS_INTERNAL] [Connection Lifecycle] X: Opened connection."
2. NetworkPlugin attached: "🚀 NetworkPlugin constructor called - ID: conn-xxxxx"
3. Connection ready for protocol: "🟢 Connection conn-xxxxx opened"
4. Identity exchange begins automatically via chum protocol
5. LeuteAccessRightsManager handles pairing callbacks
```

### Identity Exchange Protocol

The chum protocol handles identity exchange between peers:

```
1. Connection established and emitted via onConnection
2. LeuteAccessRightsManager receives connection
3. Chum protocol starts identity exchange:
   - Exchange person IDs
   - Exchange instance IDs
   - Verify cryptographic signatures
   - Establish trust relationship
4. On success: onPairingSuccess event fired
5. Contact creation and topic setup
```

## Critical Debugging Insights

### Duplicate Connection Issue

**Problem**: Seeing duplicate "Connection Lifecycle" logs indicates multiple Connection objects being created from the same WebSocket.

**Root Cause**: WebSocket event handlers conflicting between our custom handlers and one.models Connection plugins.

**Solution**: Remove ALL WebSocket event handlers before creating Connection object:
```typescript
// Remove custom handlers
ws.removeEventListener('message', this._mainMessageHandler);
// Remove all other handlers
ws.onopen = null;
ws.onclose = null;
ws.onerror = null;
ws.onmessage = null;
// Now safe to create Connection
const connection = new Connection(ws);
```

### Ping/Pong Protocol

CommServer sends raw "ping" strings for keepalive. These must be filtered before JSON parsing:

```typescript
if (event.data === 'ping') {
  ws.send('pong');
  return;
}
if (event.data === 'pong') {
  return;
}
```

### Connection Timing Issues

**Critical**: Connection objects must be created ONLY after connection_handover is received. Creating them too early or too late breaks the protocol.

**Correct Sequence**:
1. Register with CommServer
2. Wait for communication_request (invitation creator)
3. Send communication_ready
4. Wait for connection_handover
5. Create Connection object
6. Emit for chum protocol

### Architecture Conflicts

**Issue**: Multiple ConnectionsModel instances can conflict when both try to handle the same CommServer connections.

**Solution**: Ensure only ONE ConnectionsModel has networking enabled:
- LamaConnectionsModel: acceptIncomingConnections: true
- Standard ConnectionsModel (if used): acceptIncomingConnections: false

---

# Configuration & Usage

## Usage

### Basic Import

```typescript
import { ConnectionsModel } from '../connections';
```

### Using Configuration Presets

```typescript
import { LamaConnectionsPresets, LamaConnectionsConfigBuilder } from '../connections';

// Use a preset
const config = LamaConnectionsConfigBuilder
    .fromPreset('FULL_NETWORKING')
    .withCommServerUrl('wss://comm.example.com')
    .build();

const connectionsModel = new ConnectionsModel(leuteModel, config);
```

### Factory Function

```typescript
import { createLamaConnectionsModel } from '../connections';

const connectionsModel = createLamaConnectionsModel(
    leuteModel,
    'PAIRING_ONLY',
    'wss://comm.example.com'
);
```

### Utility Functions

```typescript
import { LamaConnectionsUtils } from '../connections';

// Log connection statistics
LamaConnectionsUtils.logConnectionStats(connectionsModel, '[MyApp]');

// Check if a person is connected
const isConnected = LamaConnectionsUtils.isPersonConnected(connectionsModel, personId);
```

## Configuration Presets

### FULL_NETWORKING
- **Use case**: When ConnectionsModel handles all networking (like one.leute)
- **Features**: Full incoming/outgoing connections, pairing enabled
- **TransportManager**: Not used

### PAIRING_ONLY
- **Use case**: When TransportManager handles networking but pairing is needed
- **Features**: Pairing enabled, networking disabled
- **TransportManager**: Handles all networking

### MINIMAL
- **Use case**: Development/testing with minimal features
- **Features**: All networking disabled, debug only
- **TransportManager**: Optional

### DEVELOPMENT
- **Use case**: Development with enhanced debugging
- **Features**: All features enabled, unknown persons allowed
- **TransportManager**: Optional

## Integration with TransportManager

The lama architecture supports both standalone ConnectionsModel operation and TransportManager integration:

```typescript
// For TransportManager integration (current lama approach)
const config = LamaConnectionsUtils.createTransportManagerConfig(commServerUrl);

// For standalone operation (like one.leute)
const config = LamaConnectionsUtils.createStandaloneConfig(commServerUrl);
```

## Configuration Builder

The `LamaConnectionsConfigBuilder` provides a fluent API for creating custom configurations:

```typescript
const config = LamaConnectionsConfigBuilder
    .fromPreset('PAIRING_ONLY')
    .withCommServerUrl('wss://comm.example.com')
    .withPairingExpiration(60000 * 30) // 30 minutes
    .forTransportManager()
    .build();
```

## Debugging Tools

### Connection Logging

Enable comprehensive logging:
```typescript
// Environment variables for debugging
ONE_MODELS_DEBUG=true
ONE_MODELS_INTERNAL_DEBUG=true
COMMUNICATION_SERVER_DEBUG=true
DEBUG=chum:*,pairing:*,communication:*
```

### Protocol State Inspection

```typescript
// Check connection state
connectionsModel.connectionsInfo();

// Check online state
connectionsModel.onlineState;

// Debug dump
connectionsModel.debugDump('[Debug]');
```

### Common Issues & Solutions

1. **"connection.promisePlugin is not a function"**
   - Ensure PromisePlugin is added to Connection after creation
   - Check that Connection object has proper plugin structure

2. **"Received unexpected type 'person_id_object'"**
   - Race condition in identity exchange
   - Ensure proper role coordination (creator waits, acceptor initiates)

3. **Connection closes immediately**
   - Check ping/pong filtering
   - Verify WebSocket event handler cleanup
   - Ensure no competing ConnectionsModel instances

4. **Duplicate connections**
   - Multiple ConnectionsModel instances with networking enabled
   - Incomplete WebSocket event handler cleanup
   - Check for multiple Connection object creation

## Files

- `index.ts` - Main module with exports, presets, and utilities
- `README.md` - This documentation file

## Future Enhancements

This approach allows for easy extension without modifying the core one.models code:

1. **Custom protocols** - Add lama-specific protocol handlers
2. **Enhanced monitoring** - Add connection quality metrics
3. **Transport integration** - Deeper TransportManager integration
4. **Performance optimization** - Lama-specific optimizations

## Migration

Existing code using ConnectionsModel directly can be migrated gradually:

```typescript
// Before
import ConnectionsModel from '@refinio/one.models/lib/models/ConnectionsModel.js';

// After
import { ConnectionsModel } from '../connections';
// or
import { createLamaConnectionsModel } from '../connections';
```

The API remains identical, but now you have access to lama-specific presets and utilities. 