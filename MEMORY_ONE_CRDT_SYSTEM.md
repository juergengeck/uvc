# ONE Platform CRDT System Memory

## Understanding ONE's Conflict-Free Replicated Data Types

### 1. CRDT Architecture Overview

ONE core implements a sophisticated CRDT system designed for distributed object synchronization without coordination. The system consists of several layers:

**Core Components:**
- **CrdtAlgorithmRegistry**: Manages different CRDT algorithms for different data types
- **VersionTree**: Implements conflict resolution using version graphs and DAG structures  
- **LinkedList CRDT**: Specialized algorithm for message sequences (what channels use)
- **AccessManager**: Controls object visibility during CRDT synchronization

### 2. Channel System as LinkedList CRDT

#### What Our Chat Channels Actually Are

**Channels ARE CRDTs** - specifically they implement the **LinkedList CRDT Algorithm**:

```typescript
// From LinkedListCrdtAlgorithm.ts
interface LinkedListEntry {
  $type$: 'LinkedListEntry',
  data: SHA256Hash<CreationTime>,           // Message timestamp
  metadata: SHA256Hash[],                   // Additional data
  previous: SHA256Hash<LinkedListEntry>     // Linked list pointer
}
```

**Key Properties:**
- **Conflict-Free**: Multiple devices can add messages concurrently without conflicts
- **Eventually Consistent**: All devices converge to same message order
- **Time-Ordered**: Uses CreationTime for deterministic ordering
- **Append-Optimized**: Optimized for chat-like append-heavy workloads

#### Channel vs Full CRDT System

| Aspect | Channel System (LinkedList CRDT) | Full CRDT System |
|--------|-----------------------------------|------------------|
| **Use Case** | Optimized for messaging/chat | General purpose objects |
| **Algorithm** | LinkedList with time-ordering | Multiple algorithms (Set, Register, etc.) |
| **Conflict Resolution** | Merge based on CreationTime | Version Tree with DAG resolution |
| **Performance** | Fast for append operations | More overhead for complex objects |
| **Complexity** | Simpler, specialized | More sophisticated, general |

### 3. Message Ordering and Conflict Resolution

#### How Message Ordering Works

**1. CreationTime Determinism:**
```
Message A: CreationTime = 1645123456789
Message B: CreationTime = 1645123456790
→ Message A always comes before Message B regardless of delivery order
```

**2. LinkedList Merge Algorithm:**
```
Device 1: [Msg1] → [Msg2] → [Msg4]
Device 2: [Msg1] → [Msg3] → [Msg5]

After CRDT merge:
Both devices: [Msg1] → [Msg2] → [Msg3] → [Msg4] → [Msg5]
(Ordered by CreationTime)
```

**3. Conflict Resolution Process:**
1. Receive conflicting LinkedList versions from remote devices
2. Extract all LinkedListEntry objects from both versions
3. Sort all entries by CreationTime (deterministic total ordering)
4. Rebuild linked list maintaining chronological sequence
5. Update all devices to converged state

### 4. CRDT Synchronization via CHUM Protocol

#### How CHUM Enables CRDT Synchronization

**1. Object Discovery Phase:**
```
getAccessibleRootHashes(remotePersonId) 
→ Returns all objects remote person can access
→ Includes: ChatMessage, LinkedListEntry, CreationTime, metadata
```

**2. Object Transfer Phase:**
```
CHUM exports all accessible objects to remote device
→ Remote device imports objects into local storage
→ Triggers CRDT merge algorithms for modified channels
```

**3. CRDT Merge Phase:**
```
LinkedList CRDT detects new entries
→ Runs merge algorithm with local state
→ Produces new consistent channel state
→ Updates UI with new message ordering
```

#### Critical Dependencies

**For CRDT sync to work properly:**
1. **Complete Access Grants**: All related objects must be accessible
   - ChatMessage objects
   - LinkedListEntry objects  
   - CreationTime objects
   - Metadata objects
   - ChannelInfo objects

2. **Proper Object References**: Objects must correctly reference each other
   - LinkedListEntry.data → CreationTime hash
   - LinkedListEntry.metadata → additional object hashes
   - LinkedListEntry.previous → previous entry hash

3. **Access Grant Correctness**: Must use proper object types
   - **Versioned objects** (ChatMessage, LinkedListEntry) → Use `IdAccess`
   - **Unversioned objects** (CreationTime) → Use `Access`

### 5. Why Access Grants Are Critical for CRDT Sync

#### The Access-CRDT Coupling

**CRDT algorithms can only merge objects they have access to:**

```typescript
// Pseudo-code for LinkedList merge
async function mergeLinkedLists(localList, remoteObjects) {
  // Can only merge objects included in remoteObjects
  const accessibleEntries = remoteObjects.filter(obj => obj.$type$ === 'LinkedListEntry');
  const mergedList = mergeSortedByCreationTime(localList, accessibleEntries);
  return mergedList;
}
```

**If access grants are missing:**
- Remote device can't see some LinkedListEntry objects
- CRDT merge operates on incomplete data
- Results in inconsistent channel state
- Messages appear missing on some devices

#### Access Grant Requirements for Channels

**Complete object graph must be accessible:**

```
ChannelInfo (IdAccess to everyone group)
    ↓
LinkedListEntry objects (IdAccess to channel participants)  
    ↓
ChatMessage objects (IdAccess to channel participants)
    ↓
CreationTime objects (Access to channel participants)
    ↓
Metadata objects (Access to channel participants)
```

### 6. Debugging CRDT Issues

#### Version Tree Analysis

```typescript
// Debug CRDT version trees
import { VersionTree } from '@refinio/one.core/lib/crdts/VersionTree.js';

const tree = await VersionTree.constructCurrentVersionTree(channelIdHash);
console.log('Version Tree:', tree.getStringRepresentation());
console.log('Merge nodes:', tree.mergeNodes);
console.log('Change nodes:', tree.changeNodes);
```

#### LinkedList State Inspection

```typescript
// Debug LinkedList CRDT state
import { LinkedListCrdtAlgorithm } from '@refinio/one.models/lib/models/LinkedList/LinkedListCrdtAlgorithm.js';

const algorithm = new LinkedListCrdtAlgorithm();
const state = await algorithm.getCurrentState(channelIdHash);
console.log('LinkedList entries:', state);
```

### 7. Root Cause Analysis for Chat Sync Issues

#### Most Likely CRDT-Related Causes

**1. Incomplete Access Grants:**
- Missing IdAccess for LinkedListEntry objects
- Missing Access for CreationTime objects  
- Missing metadata object access

**2. Wrong Access Grant Types:**
- Using Access instead of IdAccess for versioned objects
- Using IdAccess instead of Access for unversioned objects

**3. Group Membership Issues:**
- Remote person not actually member of target groups
- Group objects don't reference remote person correctly

**4. Object Reference Corruption:**
- LinkedListEntry objects don't properly reference ChatMessage
- CreationTime objects missing or corrupted
- Metadata references broken

#### Why one.leute Works

**one.leute's simpler approach:**
- Only creates access grants for ChannelInfo objects
- Relies on CRDT algorithms to handle message discovery through channel access
- Uses group-based access (everyone group) with proper group membership
- Lets LinkedList CRDT handle message-level synchronization

### 8. Recommended Fix Strategy

#### Align with one.leute Patterns

**1. Simplify Access Grants:**
- Create access grants ONLY for ChannelInfo objects (using IdAccess)
- Use group-based access (everyone group) 
- Let CRDT algorithms handle message discovery

**2. Ensure Group Membership:**
- Verify remote person is member of everyone group
- Check Group objects properly reference remote person
- Verify reverse maps exist for group membership

**3. Trust CRDT Algorithms:**
- LinkedList CRDT is designed to handle message synchronization
- Don't try to micro-manage access to individual messages
- Focus on channel-level access control

#### Verification Steps

**1. Check ChannelInfo Access:**
```typescript
const channelAccess = await getAccessibleRootHashes(remotePersonId);
const hasChannelAccess = channelAccess.some(obj => obj.hash === channelInfoIdHash);
```

**2. Verify Group Membership:**
```typescript
const groups = await getOnlyLatestReferencingObjsHashAndId(remotePersonId, 'Group');
const isInEveryoneGroup = groups.some(g => g.idHash === everyoneGroupId);
```

**3. Test CRDT Merge:**
```typescript
// Trigger manual CRDT merge to test if sync works
await channelManager.refreshChannel(channelId);
```

### 9. Key Insight: Channels ARE the CRDT System

The most important realization is that **channels are not a "parallel version" of CRDT - they ARE the CRDT system for messaging**. The LinkedList CRDT is the production implementation used by one.leute and is specifically designed for this use case.

The synchronization issue is likely in the access grant layer, not the CRDT layer. The CRDT algorithms are robust and well-tested. Focus on ensuring complete and correct access grants for ChannelInfo objects and proper group membership for remote persons.