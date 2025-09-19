# Channel Management and CHUM Protocol Guide

## Overview

This document comprehensively analyzes channel management and CHUM protocol implementation in the Refinio ONE system, covering message synchronization, access rights, and P2P communication patterns based on the one.leute reference implementation.

## ONE Platform Channel Architecture

Based on analysis of the one.leute source code, this section explains the exact channel architecture used in the ONE platform.

### Core Concepts

#### 1. Channel Ownership Model

Each device/identity can have its own channel for a topic. The channel is identified by:
- **channelId**: A string identifier (e.g., "topic", "questionnaire", etc.)
- **owner**: A SHA256IdHash<Person> representing the channel owner, or null for ownerless channels

```typescript
// Channel creation with owner
await channelManager.createChannel(channelId, owner);

// Channel creation without owner (null owner)
await channelManager.createChannel(channelId, null);
```

#### 2. Channel Discovery

When retrieving messages, the system discovers all matching channels for a given channelId:

```typescript
const channelInfos = await channelManager.getMatchingChannelInfos({channelId});
```

This returns an array of ChannelInfo objects, each representing a different device's channel for the same logical topic.

#### 3. Owner Priority System

When multiple channels exist for the same channelId, the system uses an owner priority system:

```typescript
// From useChatMessages.ts
// determine owner priority
// 1. myPersonId
// 2. any not undefined
// 3. undefined, meaning that there is no owner
let owner: SHA256IdHash<Person> | undefined = undefined;
for (const channelInfo of channelInfos) {
    if (channelInfo.owner === myPersonId) {
        owner = myPersonId;
        break;
    } else if (owner === undefined) {
        owner = channelInfo.owner;
    }
}
```

#### 4. Message Posting

When sending messages, the owner parameter determines which channel to post to:

```typescript
// Post to my own channel (owner = undefined)
await topicRoom.sendMessage(message, undefined, undefined);

// Post to a specific owner's channel
await topicRoom.sendMessage(message, undefined, channelOwner);

// Post to an ownerless channel (owner = null)
await topicRoom.sendMessage(message, undefined, null);
```

**Important**: There's a critical distinction:
- `undefined` owner = use my main identity
- `null` owner = no owner (shared channel)

#### 5. Access Rights System

The LeuteAccessRightsManager handles granting access to channels:

```typescript
type ChannelAccessRights = {
    owner: SHA256IdHash<Person> | null;  // The owner of the channels
    persons: SHA256IdHash<Person>[];     // The persons who should gain access
    groups: SHA256IdHash<Group>[];       // Groups who should gain access
    channels: string[];                  // The channel IDs
};
```

Access is granted by creating access objects:

```typescript
await createAccess([{
    id: channelInfoIdHash,
    person: accessInfo.persons,
    group: accessInfo.groups,
    mode: SET_ACCESS_MODE.ADD
}]);
```

#### 6. Message Synchronization Flow

**Sending Messages:**
1. User sends a message in a topic
2. Message is posted to the appropriate channel based on owner
3. Channel update events are emitted
4. CHUM protocol synchronizes the channel entry to connected peers

**Receiving Messages:**
1. CHUM protocol receives channel updates from peers
2. ChannelManager emits onUpdated events
3. RawChannelEntriesCache updates its cache
4. UI components re-render with new messages

#### 7. Topic Types and Channel Creation

Different topic types create channels differently:

```typescript
// One-to-one topic (between two persons)
await topicModel.createOneToOneTopic(myPersonId, otherPersonId);

// Group topic
await topicModel.createGroupTopic(groupName);

// Everyone topic (special shared topic)
await topicModel.createEveryoneTopic();

// Glue topic (for glue.one integration)
await topicModel.createGlueTopic();
```

#### 8. Multi-Channel Message Aggregation

The chat system aggregates messages from multiple channels:

1. **Channel Discovery**: Find all channels with matching channelId
2. **Iterator Creation**: Create iterators for each discovered channel
3. **Message Merging**: Use `ChannelManager.mergeIteratorMostCurrent` to merge messages by timestamp
4. **Cache Management**: RawChannelEntriesCache maintains ordered message cache

#### 9. Channel Settings

Channels can have specific settings applied:

```typescript
// Set maximum channel size
channelManager.setChannelSettingsMaxSize(channel, 1024 * 1024 * 100);

// Append sender profile to messages
channelManager.setChannelSettingsAppendSenderProfile(channel, true);

// Register sender profile at Leute
channelManager.setChannelSettingsRegisterSenderProfileAtLeute(channel, true);
```

### Complete Flow Example

**Creating a One-to-One Chat:**

1. **Topic Creation**:
   ```typescript
   const topic = await topicModel.createOneToOneTopic(myId, otherId);
   // This creates a channelId like: "idA<->idB" (sorted)
   ```

2. **Channel Creation**:
   - Each participant creates their own channel with the same channelId
   - Channel A: owner = myId
   - Channel B: owner = otherId

3. **Access Rights**:
   - Grant access to both participants for both channels
   - This allows cross-reading of messages

4. **Sending Messages**:
   - User A posts to their channel (owner = myId)
   - User B posts to their channel (owner = otherId)

5. **Message Display**:
   - Both users see messages from both channels
   - Messages are merged and sorted by timestamp
   - UI shows unified conversation

### Key Insights

1. **Decentralized Design**: Each participant owns their message history
2. **Access Control**: Fine-grained control over who can read which channels
3. **Flexibility**: Supports various communication patterns (1:1, group, broadcast)
4. **CHUM Integration**: Channels are synchronized via CHUM protocol
5. **Offline Support**: Each device maintains its own channel copy

This architecture enables true peer-to-peer messaging without central servers while maintaining message ordering and access control.

## CHUM Protocol Architecture

### Channel Types and Ownership

**1-to-1 Chat Channels:**
- Channel ID format: `<personAHash><-><personBHash>`
- Deterministic ownership: Channel owner chosen by priority rules
- Both devices must use the SAME channel for message consistency

**Group Channels:**
- Channel ID: Group-specific identifier
- Multiple participants with shared access rights
- Owner typically the group creator

**System Channels:**
- `EveryoneTopic`: Broadcast channel for all contacts
- `GlueOneTopic`: System integration channel
- `llm`: AI assistant channel

### Message Synchronization Flow

**1. Local Message Creation**
```
ChatModel.sendMessage() 
  → TopicRoom.sendMessage() 
  → ChannelManager.postToChannel() 
  → ChannelManager.internalChannelPost()
  → storeVersionedObject(ChannelInfo) // Creates new ChannelInfo version
```

**2. Event Propagation & Access Rights**
```
storeVersionedObject(ChannelInfo) 
  → one.core storage layer triggers onVersionedObj event
  → ObjectEventDispatcher.appendToBufferIfNew()
  → ObjectEventDispatcher dispatch loop
  → ChannelManager.processNewVersion() // via onNewVersion listener
  → ChannelManager.onUpdated.emit()
  → Access rights creation & CHUM sync
```

**3. CHUM Sync & Remote Delivery**
```
ChannelManager.onUpdated.emit()
  → CommServerManager.onChannelUpdated()
  → createAccess() for all participants
  → ConnectionsModel.triggerChumSync()
  → Remote devices download accessible objects
  → Remote ChannelManager.processNewVersion()
  → Remote message display
```

## Channel Creation and Ownership Resolution

### Deterministic Channel Ownership

**Channel Ownership Rules (from one.leute):**
```typescript
// ChatModel.determineChannelOwner()
determineChannelOwner(topicId: string, participantIds: string[]): string {
  const myPersonId = this.leuteModel.myMainIdentity();
  
  // Priority 1: Use my own channel if I own one
  const myChannel = this.findChannelByOwner(topicId, myPersonId);
  if (myChannel) return myPersonId;
  
  // Priority 2: Use existing channel with valid owner
  const existingChannel = this.findAnyChannelForTopic(topicId);
  if (existingChannel?.owner) return existingChannel.owner;
  
  // Priority 3: For 1-to-1 chats, create new channel with my ownership
  if (participantIds.length === 2) return myPersonId;
  
  // Priority 4: For group chats, use first participant as owner
  return participantIds[0];
}
```

**Critical Pattern**: Both devices must resolve to the SAME channel owner to avoid creating duplicate channels.

### Channel Discovery and Validation

**Channel Discovery Process:**
```typescript
// ChatModel.findChannelForTopic()
findChannelForTopic(topicId: string): ChannelInfo[] {
  const allChannels = this.channelManager.getAllChannels();
  
  // 1. Exact match by topic ID
  const exactMatch = allChannels.filter(ch => ch.id === topicId);
  if (exactMatch.length > 0) return exactMatch;
  
  // 2. Pattern match for 1-to-1 chats
  const myPersonId = this.leuteModel.myMainIdentity();
  const participants = this.extractParticipants(topicId);
  
  if (participants.length === 2 && participants.includes(myPersonId)) {
    return allChannels.filter(ch => 
      ch.id.includes(participants[0]) && ch.id.includes(participants[1])
    );
  }
  
  return [];
}
```

### Access Rights Management

**Comprehensive Access Rights Strategy:**
```typescript
// CommServerManager.createAccessGrants()
async createAccessGrants(channelInfoIdHash: string, channelId: string, data: any[]) {
  const participantIds = this.extractParticipants(channelId);
  const accessPersons = participantIds.length === 2 ? participantIds : [];
  const everyoneGroup = this.leuteModel.everyoneGroup;
  
  // Build access for all message-related objects
  const allHashesToGrant = [channelInfoIdHash]; // Channel itself
  
  for (const entry of data) {
    allHashesToGrant.push(entry.channelEntryHash);     // Linked-list entry
    if (entry.dataHash) allHashesToGrant.push(entry.dataHash);           // Message data
    if (entry.creationTimeHash) allHashesToGrant.push(entry.creationTimeHash); // Timestamp
    if (entry.metaDataHashes) allHashesToGrant.push(...entry.metaDataHashes);  // Attachments
  }
  
  // Create access grants for all objects
  const uniqueGrants = [...new Set(allHashesToGrant)].map(hash => ({
    id: hash,
    person: accessPersons,  // Specific participants for 1-to-1
    group: [everyoneGroup.groupIdHash], // Everyone group for discoverability
    mode: 'add'
  }));
  
  await createAccess(uniqueGrants);
  
  // Refresh connections cache for immediate discovery
  await this.connectionsModel.leuteConnectionsModule.updateCache();
}
```

## CHUM Protocol Implementation

### Connection Management

**ConnectionsModel Configuration:**
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

// Explicitly trigger CHUM connections after initialization
const connectionsInfo = this.connectionsModel.connectionsInfo();
for (const connInfo of connectionsInfo) {
  await this.connectionsModel.leuteConnectionsModule.connectToInstance(
    connInfo.remotePersonId,
    connInfo.remoteInstanceId,
    'chum' // Explicit CHUM protocol request
  );
}
```

### CHUM Sync Triggers

**Automatic Sync Triggers:**
```typescript
// 1. New channel entries via channelManager.onUpdated
channelManager.onUpdated.listen(async (channelInfoIdHash, channelId, channelOwner, timeOfEarliestChange, data) => {
  await this.createAccessGrants(channelInfoIdHash, channelId, data);
  await this.triggerChumSync();
});

// 2. New access grants via createAccess()
await createAccess(accessGrants);
await this.connectionsModel.leuteConnectionsModule.updateCache();

// 3. Connection establishment via connectToInstance()
await this.connectionsModel.leuteConnectionsModule.connectToInstance(
  remotePersonId, remoteInstanceId, 'chum'
);

// 4. Periodic sync via updateCache()
setInterval(async () => {
  await this.connectionsModel.leuteConnectionsModule.updateCache();
}, 30000); // Every 30 seconds
```

### Message Delivery Assurance

**Multi-layer Verification:**
```typescript
// 1. Local Storage Verification
const localMessage = await this.channelManager.getObjectsWithType(channelId, 'ChatMessage');
console.log(`Local message count: ${localMessage.length}`);

// 2. Access Rights Verification
const accessRights = await this.leuteModel.getAccessRights(messageHash);
console.log(`Access granted to: ${accessRights.persons.length} persons`);

// 3. Connection Status Verification
const activeConnections = this.connectionsModel.connectionsInfo()
  .filter(conn => conn.connectionStatus === 'connected');
console.log(`Active CHUM connections: ${activeConnections.length}`);

// 4. Remote Sync Confirmation
const remoteMessages = await this.channelManager.downloadObjects(channelId);
console.log(`Remote message count: ${remoteMessages.length}`);
```

## Common CHUM Protocol Issues

### Issue 1: Channel Ownership Conflicts

**Problem**: Multiple devices creating separate channels for the same conversation
**Solution**: Implement deterministic channel ownership resolution
**Fix**: Use consistent channel discovery and owner selection logic

### Issue 2: Access Rights Not Propagating

**Problem**: Messages created locally but not accessible to remote devices
**Solution**: Grant access to ALL message-related objects (entry, data, metadata)
**Fix**: Comprehensive access rights creation with connection cache refresh

### Issue 3: CHUM Sync Not Triggering

**Problem**: Access rights created but remote devices not downloading objects
**Solution**: Explicitly trigger CHUM connections and periodic sync
**Fix**: Active connection management with sync monitoring

### Issue 4: ObjectEventDispatcher Not Firing

**Problem**: ChannelManager.onUpdated events not firing after message creation
**Solution**: Ensure proper ObjectEventDispatcher initialization
**Fix**: Verify event registration and object event propagation chain

### Technical Deep Dive

#### ObjectEventDispatcher Event System

The ObjectEventDispatcher in `@refinio/one.models` manages all object change events:

1. **Initialization** (ObjectEventDispatcher.init):
   ```typescript
   const d1 = onVersionedObj.addListener((result) => {
       return this.appendToBufferIfNew(result);
   });
   ```

2. **Event Registration** (ChannelManager.init):
   ```typescript
   this.disconnectOnVersionedObjListener = objectEvents.onNewVersion(
       this.processNewVersion.bind(this),
       'ChannelManager: processNewVersion',
       'ChannelInfo'
   );
   ```

3. **Event Filtering**: Events are filtered by object type ('ChannelInfo') and idHash

#### The processNewVersion Method

When properly triggered, `processNewVersion` should:

1. **Update channel cache** with new ChannelInfo version
2. **Calculate differences** between old and new channel states
3. **Emit onUpdated events** for new channel entries
4. **Trigger access rights creation** via the onUpdated event
5. **Enable CHUM sync** for message replication

```typescript
private async processNewVersion(caughtObject: VersionedObjectResult<ChannelInfo>): Promise<void> {
    // ... processing logic ...
    
    if (changedElements.length > 0) {
        return () => {
            this.onUpdated.emit(
                caughtObject.idHash,
                newChannelInfo.id,
                newChannelInfo.owner || null,
                new Date(changedElements[changedElements.length - 1].creationTime),
                changedElements
            );
        };
    }
}
```

## Debugging Evidence

### MessageTransferDebugger Output
```
[MessageTransferDebug] 📊 TRACE REPORT for message: msg_1752173129057_x8bu27eqe
[MessageTransferDebug] 🔍 Step Analysis:
  - ChatModel.sendMessage: ✅ 2025-07-10T18:45:29.058Z
  - TopicRoom.sendMessage: ✅ 2025-07-10T18:45:29.643Z  
  - ChannelManager.postToChannel: ✅ 2025-07-10T18:45:29.071Z
  - ChannelManager.onUpdated: ❌ NOT COMPLETED
  - Access grants created: ❌ NOT COMPLETED
  - CHUM sync triggered: ❌ NOT COMPLETED
[MessageTransferDebug] 🎯 FAILURE POINT: ChannelManager.onUpdated event never fires
```

### Missing Event Initialization

The root cause was traced to missing initialization of the MessageTransferDebugger:

1. **AppModel.init()** called `debugMessageTransfer()` on line 216
2. **Function `debugMessageTransfer()` did not exist**
3. **MessageTransferDebugger.init() was never called**
4. **No hooks were established on ChannelManager methods**

## Investigation Methods

### 1. Module Resolution Verification

Verified that TopicRoom.sendMessage was calling the correct ChannelManager instance:
- Added diagnostic logging to `node_modules/@refinio/one.models/lib/models/Chat/TopicRoom.js`
- Confirmed TopicRoom was calling `postToChannel` successfully
- Confirmed the logs showed "postToChannel completed successfully"

### 2. Event Hook Verification  

Created MessageTransferDebugger to hook into ChannelManager methods:
- Hooked `postToChannel` method ✅ (fired correctly)
- Hooked `onUpdated` event ❌ (never fired)
- This isolated the issue to the event propagation chain

### 3. ObjectEventDispatcher Analysis

Examined the source code in `@refinio/one.models/src/misc/ObjectEventDispatcher.ts`:
- Confirmed event registration pattern in ChannelManager.init()
- Verified processNewVersion should be triggered by onNewVersion events
- Identified that onNewVersion events are filtered by type ('ChannelInfo')

## Next Steps for Resolution

### 1. Verify ObjectEventDispatcher Initialization

Check if the global `objectEvents` instance is properly initialized:
```typescript
// In AppModel or similar initialization code
await objectEvents.init();
```

### 2. Debug Event Registration

Add logging to verify ChannelManager's event listener registration:
```typescript
// In ChannelManager.init()
console.log('[CHANNEL] Registering onNewVersion listener for ChannelInfo');
this.disconnectOnVersionedObjListener = objectEvents.onNewVersion(
    this.processNewVersion.bind(this),
    'ChannelManager: processNewVersion', 
    'ChannelInfo'
);
console.log('[CHANNEL] onNewVersion listener registered successfully');
```

### 3. Debug ObjectEventDispatcher Event Flow

Add logging to ObjectEventDispatcher to trace event propagation:
```typescript
// In ObjectEventDispatcher.appendToBufferIfNew()
if (result.obj.$type$ === 'ChannelInfo') {
    console.log('[OBJECT_EVENTS] ChannelInfo event received:', result.idHash);
}
```

### 4. Verify Event Filtering

Ensure that ChannelInfo events are not being filtered out by:
- Checking `enableEnqueueFiltering` setting
- Verifying no handlers are registered for ChannelInfo type
- Confirming idHash matching logic

## Conclusion

The asymmetric messaging issue is caused by a broken event propagation chain in the ObjectEventDispatcher system. While message posting completes successfully at the storage layer, the ChannelManager never receives the `onNewVersion` events needed to trigger access rights creation and CHUM sync.

The fix requires ensuring that:
1. ObjectEventDispatcher is properly initialized
2. ChannelManager's event listeners are correctly registered  
3. ChannelInfo events are not being filtered or dropped
4. The processNewVersion method is called for each new ChannelInfo version

Once this event chain is restored, messages should properly sync across all connected clients via the CHUM protocol. 