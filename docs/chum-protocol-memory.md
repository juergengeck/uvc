# CHUM Protocol Deep Dive Memory

## CHUM Protocol Overview

CHUM (Connection Handshake and User Management) is the P2P synchronization protocol in ONE core that enables object sharing between devices.

## Protocol Components

### 1. CHUM Object Structure
```typescript
interface Chum {
    $type$: 'Chum';
    name: string;
    instance: [string, string];  // Pair of instance names
    person: [SHA256IdHash<Person>, SHA256IdHash<Person>];  // Local and remote person IDs
    highestRemoteTimestamp: number;  // Cutoff for object synchronization
    
    // Transfer records
    AtoBObjects: SHA256Hash[];     // Objects sent A→B
    AtoBIdObjects: SHA256IdHash[]; // ID objects sent A→B
    AtoBBlob: SHA256Hash<BLOB>[];  // Blobs sent A→B
    AtoBClob: SHA256Hash<CLOB>[];  // CLOBs sent A→B
    
    BtoAObjects: SHA256Hash[];     // Objects sent B→A
    BtoAIdObjects: SHA256IdHash[]; // ID objects sent B→A
    BtoABlob: SHA256Hash<BLOB>[];  // Blobs sent B→A
    BtoAClob: SHA256Hash<CLOB>[];  // CLOBs sent B→A
    
    BtoAExists: number;           // Objects already present (not transferred)
    errors: ErrorWithCode[];      // Synchronization errors
    statistics?: WebsocketStatistics;
}
```

### 2. CHUM Synchronization Flow
```
Device A                          Device B
--------                          --------
1. startChumProtocol()     ←→     startChumProtocol()
2. Send 'synchronisation'  ←→     Send 'synchronisation'
3. createChum()           ←→     createChum()
4. ChumExporter           ←→     ChumImporter
5. Query accessible objects      Request objects
6. Transfer object hashes        Receive hashes
7. Transfer object data          Store objects
8. Update Chum record           Update Chum record
```

## Critical Components

### CHUM Exporter
**Purpose**: Determines what objects to share with remote instance
**Key Function**: Object discovery based on access grants

```typescript
// The core object discovery mechanism
async function getAccessibleObjectsForPerson(
    remotePersonId: SHA256IdHash<Person>
): Promise<Set<SHA256Hash>> {
    // This is where the magic happens - or fails!
    // Must find all objects accessible to remotePersonId
}
```

### CHUM Importer  
**Purpose**: Receives and stores objects from remote instance
**Process**: 
1. Receive object hashes
2. Check which objects are missing locally
3. Request missing objects
4. Store received objects

### Object Discovery Algorithm
The critical bottleneck - how CHUM determines what to share:

1. **Direct Access**: Find Access objects targeting the person directly
2. **Group Access**: Find groups the person belongs to, then Access objects targeting those groups  
3. **IdAccess Resolution**: Handle versioned object access grants
4. **Timestamp Filtering**: Only include objects newer than `highestRemoteTimestamp`

## Access Grant Resolution

### Access Types
- **Access**: Points to specific object hash (immutable)
- **IdAccess**: Points to versioned object ID (includes all versions)

### Grant Targets
- **person[]**: Array of person IDs who get access
- **group[]**: Array of group IDs whose members get access

### Resolution Process
```typescript
// Pseudo-code for access resolution
function resolveAccessGrants(personId: SHA256IdHash<Person>): Set<SHA256Hash> {
    const accessibleHashes = new Set<SHA256Hash>();
    
    // 1. Find direct Access grants
    const directAccess = reverseMap[`${personId}.Object.Access`] || [];
    directAccess.forEach(accessObj => {
        accessibleHashes.add(accessObj.object);
    });
    
    // 2. Find group memberships
    const groups = reverseMap[`${personId}.Object.Group`] || [];
    
    // 3. Find group-based Access grants
    groups.forEach(groupId => {
        const groupAccess = reverseMap[`${groupId}.Object.Access`] || [];
        groupAccess.forEach(accessObj => {
            accessibleHashes.add(accessObj.object);
        });
    });
    
    return accessibleHashes;
}
```

## Current Issue Analysis

### Symptoms
1. **Access grants created correctly** ✅ (LeuteAccessRightsManager working)
2. **CHUM connections established** ✅ (WebSocket connections active)
3. **CHUM sync triggered** ✅ (Events firing)
4. **Zero objects transferred** ❌ (Complete isolation between devices)

### Root Cause Hypotheses
1. **Object Discovery Failure**: `getAccessibleObjects()` returns empty set
2. **Reverse Map Issues**: Access grants not reflected in reverse maps
3. **Access Grant Format**: Using wrong grant type (Access vs IdAccess)
4. **Person ID Mismatch**: Grants target wrong person IDs
5. **Timestamp Issues**: `highestRemoteTimestamp` filtering out all objects

### Investigation Points
1. **Reverse Map Files**: Check if files exist for remote person IDs
2. **Access Grant Structure**: Verify correct person/group targeting
3. **Object Discovery Function**: Test what `getAllEntries()` returns
4. **CHUM Object State**: Check if CHUM records show any transfer attempts

## Key Files and Functions

### Core CHUM Implementation
- `one.core/src/chum-sync.ts` - Main CHUM protocol
- `one.core/src/chum-exporter.ts` - Object discovery and export
- `one.core/src/chum-importer.ts` - Object import and storage

### Access System
- `one.core/src/access.js` - Access grant functions
- `one.core/src/reverse-map-query.js` - Reverse map queries
- `LeuteAccessRightsManager.ts` - Access grant creation

### Critical Functions
- `getAllEntries(personId)` - Get all objects accessible to person
- `getAccessibleRootHashes(personId)` - CHUM object discovery
- `createAccess()` - Create access grants
- `hasAccess(objectHash, personId)` - Check access permission

## Debugging Strategy

### 1. Verify Access Grant Creation
```typescript
// Check if access grants exist
const grants = await getOnlyLatestReferencingObjsHashAndId(remotePersonId, 'Access');
console.log(`Access grants for ${remotePersonId}: ${grants.length}`);
```

### 2. Test Object Discovery
```typescript  
// Test what CHUM can discover
const accessible = await getAllEntries(remotePersonId);
console.log(`Accessible objects: ${accessible.length}`);
```

### 3. Check Reverse Maps
```typescript
// Verify reverse map population
const mapFile = `${remotePersonId}.Object.Access`;
// Check if file exists and has content
```

### 4. Validate CHUM State
```typescript
// Check CHUM transfer records
const chum = await getChumObject(localPersonId, remotePersonId);
console.log(`Objects transferred: ${chum.AtoBObjects.length + chum.BtoAObjects.length}`);
```

## Next Steps

The investigation should focus on **object discovery mechanism** - specifically why `getAllEntries(remotePersonId)` returns zero objects despite access grants being created. This is the critical bottleneck preventing CHUM synchronization.