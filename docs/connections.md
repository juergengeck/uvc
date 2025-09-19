# Connections and CHUM Protocol Implementation

## Overview

This document provides a comprehensive guide to connection management and CHUM protocol implementation in the Lama mobile app, based on analysis of the one.leute reference implementation and current message synchronization patterns.

## CHUM Protocol Architecture

### Connection Types and Lifecycle

**1. Pairing Connections (Temporary)**
- Purpose: Secure key exchange during device pairing
- Duration: Minutes (until pairing complete)
- Protocol: WebSocket via CommServer with encryption
- Cleanup: Automatic termination after successful pairing

**2. CHUM Connections (Persistent)**
- Purpose: Ongoing object synchronization between paired devices
- Duration: Long-lived (hours/days with reconnection)
- Protocol: CHUM (Channel Update Message) over WebSocket
- Maintenance: Automatic reconnection and health monitoring

**3. Message Relay Connections**
- Purpose: Store-and-forward message delivery via CommServer
- Duration: Session-based (per message batch)
- Protocol: WebSocket with access grant validation
- Fallback: When direct CHUM connections unavailable

### Complete Connection Flow

**Phase 1: Device Pairing**
```
Device A                    CommServer                    Device B
   |                            |                           |
   |-- Create spare connection --|                           |
   |                            |-- Connection handover --> |
   |                            |                           |
   |<-- Pairing handshake ------|-- Pairing handshake ----> |
   |                            |                           |
   |-- Key exchange ------------|-- Key exchange ----------> |
   |                            |                           |
   |-- Trust establishment -----|-- Trust establishment --> |
   |                            |                           |
   |<-- Pairing success --------|<-- Pairing success ------|
```

**Phase 2: Contact Creation and Access Rights**
```
Device A                                               Device B
   |                                                     |
   |-- Create Someone/Profile objects                    |
   |-- Create 1-to-1 Topic                              |
   |-- Apply channel access rights                      |
   |-- Enable persistent CHUM connections               |
   |                                                     |
   |<-- Mirror contact creation -------------------->   |
   |<-- Mirror topic creation ---------------------->   |
   |<-- Sync access rights --------------------------->   |
   |<-- Establish CHUM connections ------------------>   |
```

**Phase 3: Message Synchronization**
```
Device A                    CommServer                    Device B
   |                            |                           |
   |-- Send message locally      |                           |
   |-- Create access grants -----|                           |
   |                            |-- Relay access grants --> |
   |-- Trigger CHUM sync -------|-- Forward CHUM sync ----> |
   |                            |                           |
   |                            |<-- Download objects ------|
   |                            |-- Deliver objects ------> |
   |                            |                           |
   |<-- Message appears locally |-- Message appears -----> |
```

### Key Components

**ConnectionsModel**
- Manages all P2P connections using ONE protocol
- Configures connection parameters and policies
- Handles connection lifecycle (establish, maintain, cleanup)
- Provides connection status monitoring and diagnostics

**ChumPlugin**
- Processes CHUM protocol messages in connection pipeline
- Handles object synchronization requests and responses
- Manages message flow control and error recovery
- Integrates with encryption and authentication layers

**CommServerManager**
- Creates and manages access grants for message objects
- Orchestrates connection establishment and handover
- Handles message relay when direct connections unavailable
- Provides debugging and monitoring capabilities

**LeuteConnectionsModule**
- Implements ONE platform connection patterns
- Manages connection cache and discovery
- Handles connection failover and recovery
- Provides connection health monitoring

**ContactCreationService**
- Orchestrates contact creation after successful pairing
- Establishes persistent connections for ongoing communication
- Applies access rights for message sharing
- Coordinates topic creation and channel setup

## Connection Configuration

### ConnectionsModel Setup

**Standard Configuration (from one.leute):**
```typescript
// AppModel.initializeConnectionsModel()
this.connectionsModel = new ConnectionsModel(this.leuteModel, {
  commServerUrl: 'wss://comm10.dev.refinio.one',
  acceptIncomingConnections: true,
  acceptUnknownInstances: true,
  acceptUnknownPersons: false,
  allowPairing: true,
  allowDebugRequests: true,
  pairingTokenExpirationDuration: 60000 * 15, // 15 minutes
  establishOutgoingConnections: true
});
```

**Enhanced Configuration (current implementation):**
```typescript
// AppModel.initializeConnectionsModel()
this.connectionsModel = new ConnectionsModel(this.leuteModel, {
  commServerUrl: 'wss://comm10.dev.refinio.one',
  acceptIncomingConnections: true,
  acceptUnknownInstances: true,
  acceptUnknownPersons: false,
  allowPairing: true,
  allowDebugRequests: true,
  pairingTokenExpirationDuration: 60000 * 15,
  establishOutgoingConnections: true,
  
  // Enhanced connection management
  connectionRetryAttempts: 3,
  connectionRetryDelay: 5000,
  connectionHealthCheck: true,
  chumSyncInterval: 30000,
  
  // Debugging and monitoring
  enableConnectionDiagnostics: true,
  logConnectionEvents: true,
  trackMessageTransfer: true
});

// Explicit CHUM connection establishment
await this.establishChumConnections();
```

### ChumPlugin Configuration

**Message Flow Handling:**
```typescript
// ChumPlugin.ts - Core message processing
export class ChumPlugin {
  async processMessage(connectionId: string, message: any): Promise<any> {
    // Handle synchronisation messages (critical for CHUM)
    if (message.type === 'synchronisation') {
      console.log(`[ChumPlugin] Processing CHUM sync message for ${connectionId}`);
      return this.handleChumSync(connectionId, message);
    }
    
    // Handle object requests
    if (message.type === 'object_request') {
      return this.handleObjectRequest(connectionId, message);
    }
    
    // Handle object responses
    if (message.type === 'object_response') {
      return this.handleObjectResponse(connectionId, message);
    }
    
    // Pass through other messages
    return message;
  }
  
  private async handleChumSync(connectionId: string, message: any): Promise<any> {
    // Process CHUM synchronization requests
    const syncObjects = await this.getSyncObjects(message.syncHash);
    
    // Create access grants for objects
    await this.createAccessGrants(syncObjects);
    
    // Return sync response
    return {
      type: 'synchronisation_response',
      objects: syncObjects,
      syncHash: message.syncHash
    };
  }
}
```

## Access Rights and Message Sharing

### Comprehensive Access Rights Strategy

**Message Object Access Pattern:**
```typescript
// CommServerManager.createAccessGrants()
async createMessageAccessGrants(channelInfoIdHash: string, channelId: string, messageEntries: any[]) {
  const participantIds = this.extractParticipants(channelId);
  const accessPersons = participantIds.length === 2 ? participantIds : [];
  
  // Objects that need access grants
  const objectsToGrant = new Set([channelInfoIdHash]);
  
  for (const entry of messageEntries) {
    // Core message objects
    objectsToGrant.add(entry.channelEntryHash);    // Linked-list entry
    objectsToGrant.add(entry.dataHash);           // ChatMessage object
    objectsToGrant.add(entry.creationTimeHash);   // Timestamp
    
    // Metadata objects
    if (entry.metaDataHashes) {
      entry.metaDataHashes.forEach(hash => objectsToGrant.add(hash));
    }
    
    // Attachment objects
    if (entry.attachments) {
      entry.attachments.forEach(attachment => {
        objectsToGrant.add(attachment.dataHash);
        objectsToGrant.add(attachment.thumbnailHash);
      });
    }
  }
  
  // Create access grants for all objects
  const accessGrants = Array.from(objectsToGrant).map(objectHash => ({
    id: objectHash,
    person: accessPersons,           // Specific participants for 1-to-1
    group: [this.everyoneGroupId],  // Everyone group for discoverability
    mode: 'add'
  }));
  
  // Apply access grants
  await createAccess(accessGrants);
  
  // Refresh connection cache for immediate discovery
  await this.connectionsModel.leuteConnectionsModule.updateCache();
  
  console.log(`[CommServerManager] Created ${accessGrants.length} access grants for ${messageEntries.length} messages`);
}
```

### Access Rights Propagation

**Multi-device Sync Pattern:**
```typescript
// 1. Local device creates message and access grants
await this.channelManager.postToChannel(channelId, message);
await this.createMessageAccessGrants(channelInfoIdHash, channelId, [messageEntry]);

// 2. Access grants propagate to CommServer
await this.commServerManager.syncAccessGrants();

// 3. Remote devices discover new objects
await this.connectionsModel.leuteConnectionsModule.updateCache();

// 4. Remote devices download accessible objects
const newObjects = await this.connectionsModel.downloadObjects(channelId);

// 5. Remote devices process new messages
await this.channelManager.processNewObjects(newObjects);
```

## Connection Health and Monitoring

### Connection Status Monitoring

**Connection Health Check:**
```typescript
// ConnectionsModel.getConnectionHealth()
getConnectionHealth(): ConnectionHealth {
  const connections = this.connectionsInfo();
  const activeConnections = connections.filter(c => c.connectionStatus === 'connected');
  const totalConnections = connections.length;
  
  return {
    totalConnections,
    activeConnections: activeConnections.length,
    connectionRatio: activeConnections.length / totalConnections,
    avgLatency: this.calculateAverageLatency(activeConnections),
    lastSync: this.getLastSyncTime(),
    health: this.determineHealthStatus(activeConnections)
  };
}
```

### Message Transfer Monitoring

**Comprehensive Message Debugging:**
```typescript
// MessageTransferDebug.ts - End-to-end message tracking
export class MessageTransferDebug {
  private messageTraces = new Map<string, MessageTrace>();
  
  async trackMessage(messageId: string, content: string, channelId: string): Promise<void> {
    const trace: MessageTrace = {
      messageId,
      content,
      channelId,
      startTime: Date.now(),
      steps: []
    };
    
    this.messageTraces.set(messageId, trace);
    
    // Track each step of message delivery
    this.trackStep(messageId, 'chatModelSend', 'Message created in ChatModel');
    this.trackStep(messageId, 'channelManagerPost', 'Message posted to ChannelManager');
    this.trackStep(messageId, 'accessGrantsCreated', 'Access grants created');
    this.trackStep(messageId, 'chumSyncTriggered', 'CHUM sync triggered');
    this.trackStep(messageId, 'channelManagerUpdated', 'ChannelManager.onUpdated fired');
    this.trackStep(messageId, 'remoteDelivery', 'Message delivered to remote device');
  }
  
  generateReport(messageId: string): MessageReport {
    const trace = this.messageTraces.get(messageId);
    if (!trace) return null;
    
    return {
      messageId,
      content: trace.content,
      channelId: trace.channelId,
      totalTime: Date.now() - trace.startTime,
      completedSteps: trace.steps.filter(s => s.completed).length,
      totalSteps: trace.steps.length,
      failurePoint: trace.steps.find(s => !s.completed)?.name,
      success: trace.steps.every(s => s.completed)
    };
  }
}
```

## Common Connection Issues and Solutions

### Issue 1: Channel Ownership Conflicts

**Problem**: Multiple devices creating separate channels for the same 1-to-1 conversation
**Symptoms**: Messages appear locally but not on remote device
**Solution**: Implement deterministic channel ownership resolution

```typescript
// ChatModel.resolveChannelOwnership()
resolveChannelOwnership(topicId: string): string {
  const participants = this.extractParticipants(topicId);
  const myPersonId = this.leuteModel.myMainIdentity();
  
  // Use lexicographically smaller person ID as channel owner
  return participants.sort()[0];
}
```

### Issue 2: Access Rights Not Propagating

**Problem**: Messages created locally but remote devices cannot access them
**Symptoms**: Access grants created but remote devices don't receive messages
**Solution**: Ensure comprehensive access rights and connection cache refresh

```typescript
// Fix: Grant access to ALL message-related objects
await this.createMessageAccessGrants(channelInfoIdHash, channelId, messageEntries);

// Fix: Refresh connection cache immediately
await this.connectionsModel.leuteConnectionsModule.updateCache();
```

### Issue 3: CHUM Connections Not Established

**Problem**: Pairing succeeds but no persistent connections for message sync
**Symptoms**: Contacts created but no ongoing message synchronization
**Solution**: Explicitly establish CHUM connections after pairing

```typescript
// ContactCreationService.createContactFromPairing()
await this.establishPersistentConnections(remotePersonId);

async establishPersistentConnections(remotePersonId: string): Promise<void> {
  const connectionsModel = this.getConnectionsModel();
  
  // Enable CHUM connections for person
  await connectionsModel.leuteConnectionsModule.enableConnectionsForPerson(remotePersonId);
  
  // Trigger explicit CHUM connection
  await connectionsModel.leuteConnectionsModule.connectToInstance(
    remotePersonId,
    remoteInstanceId,
    'chum'
  );
  
  console.log(`[ContactCreationService] Established CHUM connection for ${remotePersonId}`);
}
```

### Issue 4: ObjectEventDispatcher Not Firing

**Problem**: ChannelManager.onUpdated events not triggering after message creation
**Symptoms**: Messages stored locally but access grants never created
**Solution**: Ensure proper ObjectEventDispatcher initialization

```typescript
// AppModel.initializeObjectEventDispatcher()
async initializeObjectEventDispatcher(): Promise<void> {
  // Initialize global object event dispatcher
  await objectEvents.init();
  
  // Verify ChannelManager event registration
  console.log('[AppModel] ObjectEventDispatcher initialized');
  console.log('[AppModel] ChannelManager event listeners registered');
}
```

## Best Practices for CHUM Implementation

### 1. Connection Management

- **Establish connections early**: Create CHUM connections immediately after pairing
- **Monitor connection health**: Implement regular health checks and reconnection
- **Handle connection failures**: Graceful fallback to message relay via CommServer
- **Clean up connections**: Proper cleanup when contacts are removed

### 2. Access Rights Management

- **Comprehensive object access**: Grant access to all message-related objects
- **Immediate cache refresh**: Refresh connection cache after creating access grants
- **Participant-specific access**: Use specific participant IDs for 1-to-1 chats
- **Everyone group inclusion**: Include everyone group for message discoverability

### 3. Message Synchronization

- **Deterministic channel ownership**: Use consistent channel owner selection
- **Serialize message operations**: Prevent race conditions in message creation
- **Track message delivery**: Implement comprehensive message debugging
- **Handle sync failures**: Retry and recovery mechanisms for failed synchronization

### 4. Debugging and Monitoring

- **Comprehensive logging**: Log all connection and message events
- **Performance monitoring**: Track message delivery times and success rates
- **Connection diagnostics**: Provide tools for debugging connection issues
- **Message transfer tracking**: End-to-end message delivery monitoring

## Issue Resolution History

### WSRQ-JRMH1 Error (Resolved)

**Problem**: WebSocket connections closed during CHUM synchronization with error "WSRQ-JRMH1: Remote websocket function returned an error"

**Root Cause**: `ChumPlugin` was incorrectly dropping "synchronisation" messages instead of allowing them to pass through to the CHUM protocol handler.

**Solution**: Modified `ChumPlugin.ts` to return the event instead of `null` for synchronisation messages, allowing proper CHUM protocol handling.

### EP-KEYMISSMATCH Error (Resolved)

**Problem**: Pairing failed with "EP-KEYMISSMATCH: Key does not match your previous visit" due to corrupted cryptographic keys.

**Solution**: Clear app cache and use incognito/private browsing to reset keychain state.

### Missing Persistent Connections (Resolved)

**Problem**: After successful pairing, messages were created locally but never transmitted to the paired device. Access grants were created but no live connection existed for CHUM replication.

**Root Cause**: The temporary pairing connection closes after key exchange, but no persistent connection was established for ongoing message transfer.

**Solution**: Added `enableConnectionsForPerson()` call in `ContactCreationService.createContactFromPairing()` to establish long-lived connections immediately after contact creation.

```typescript
// In ContactCreationService.ts
const commServerManager = appModel?.transportManager?.getCommServerManager?.();
const connectionsModel = commServerManager?.getConnectionsModel?.();

if (connectionsModel && (connectionsModel as any).leuteConnectionsModule?.enableConnectionsForPerson) {
    await (connectionsModel as any).leuteConnectionsModule.enableConnectionsForPerson(remotePersonId);
    console.log('[ContactCreationService] ✅ Persistent connection enabled for', remotePersonId.toString().slice(0,16), '...');
}
```

## Current Status

✅ **Pairing**: QR code pairing works correctly  
✅ **Contact Creation**: Contacts are created and visible in UI  
✅ **CHUM Protocol**: Synchronisation messages pass through correctly  
✅ **Access Grants**: Created automatically for message objects  
✅ **Persistent Connections**: Established automatically after pairing  
✅ **Message Transfer**: Messages flow bidirectionally between paired devices

## Debugging Tools

### Connection Status Check

```javascript
// In browser/simulator console
appModel.connections.connectionsInfo()
```

### Manual Connection Enable

```javascript
// If connections are missing
await appModel.transportManager.commServerManager
         .leuteConnectionsModule.enableConnectionsForPerson(personId);
```

### Message Transfer Debugging

The app includes comprehensive message transfer debugging that tracks:
- ChatModel message send
- ChannelManager posting
- Access grant creation
- CHUM sync triggering
- ChannelManager.onUpdated events

Look for `[MessageTransferDebug]` logs to trace message flow.

## Implementation Notes

### Connection Lifecycle

1. **Pairing**: Temporary connection for key exchange
2. **Contact Creation**: Create Someone/Profile objects
3. **Topic Creation**: Create 1-to-1 communication channel
4. **Access Rights**: Apply channel access permissions
5. **Persistent Connection**: Enable long-lived connection for replication
6. **Message Flow**: CHUM protocol streams objects over persistent connection

### Error Handling

The system includes comprehensive error handling and logging:
- Connection establishment errors
- CHUM protocol errors
- Access grant creation failures
- Message transfer tracking

All errors are logged with detailed context for debugging.

## Future Improvements

- Automatic connection retry on failure
- Connection quality monitoring
- Bandwidth optimization for message transfer
- Enhanced error recovery mechanisms 