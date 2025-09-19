# ONE Core Architecture Memory

## Core Concepts

### Object Types and Recipes
ONE core uses a recipe-based system for object definitions:

- **Recipes**: Define object structure, properties, and validation rules
- **Object Types**: Divided into versioned and unversioned objects
- **Type Safety**: TypeScript interfaces merged through declaration merging
- **Microdata**: Objects are serialized as HTML microdata for hashing

### Key Object Types

#### Access Control Objects
- **Access**: Points to immutable objects, grants access to specific persons/groups
- **IdAccess**: Points to versioned object IDs, grants access to all versions (current and future)
- **Group**: Collections of persons for group-based access control

#### CHUM (Connection Handshake and User Management)
- **Chum Objects**: Define filters for exchanging data between instances
- Track transfer records: AtoBObjects, BtoAObjects, AtoBIdObjects, etc.
- Include statistics and error tracking
- Filter by persons - determines what gets synchronized

#### Core Identity Objects
- **Person**: Identity objects with encryption/signing keys
- **Instance**: Application instance with its own key pairs
- **Group**: Collections of persons for access control

### Object Storage Architecture

#### Hashing System
- **SHA256Hash**: Content-based addressing for immutable objects
- **SHA256IdHash**: Identity-based addressing for versioned objects
- **Microdata Conversion**: Objects → HTML microdata → SHA256 hash
- **ID Objects**: Virtual objects containing only ID properties

#### Object Relationships
```
Versioned Object ←→ ID Object (virtual)
     ↓                    ↓
SHA256Hash           SHA256IdHash
(content hash)       (identity hash)
```

#### Access Grant System
The access control system works through:

1. **Access Objects**: Grant access to specific object hashes
2. **IdAccess Objects**: Grant access to all versions of a versioned object
3. **Person Arrays**: Direct person-to-object access grants
4. **Group Arrays**: Group-based access (all group members get access)
5. **Reverse Maps**: Enable efficient lookup of "who has access to what"

### CHUM Synchronization Protocol

#### Core Mechanism
```
Device A ←→ CHUM Protocol ←→ Device B
    ↓                             ↓
Exporter                    Importer
    ↓                             ↓
Query accessible objects    Request objects
    ↓                             ↓
Transfer objects           Store objects
```

#### Object Discovery Process
1. **Accessible Object Query**: Find all objects accessible to remote person
2. **Filtering**: Apply CHUM filters (person-based)
3. **Transfer**: Send object hashes and data
4. **Import**: Receive and store objects locally

#### Critical Components
- **ChumExporter**: Determines what objects to share based on access grants
- **ChumImporter**: Receives and stores objects from remote instances
- **Object Discovery**: The function that finds objects accessible to a person
- **Access Grant Resolution**: How access grants are converted to accessible objects

### TypeScript Integration

#### Declaration Merging
ONE core uses sophisticated TypeScript features:
- **Ambient Module Namespace**: `@OneObjectInterfaces`
- **Declaration Merging**: Allows extending object types across modules
- **Interface Maps**: `OneUnversionedObjectInterfaces`, `OneVersionedObjectInterfaces`

#### Type Safety
- Objects have strict TypeScript interfaces
- Recipe validation ensures runtime type safety
- Hash types are opaque for type safety

### Storage System

#### Platform Abstraction
- **Filesystem**: Node.js with directory-based storage
- **IndexedDB**: Browser with database storage
- **React Native**: Platform-specific storage
- **Hierarchical Storage**: Objects stored in subdirectories by hash prefix

#### Reverse Maps
- **Purpose**: Enable efficient "reverse" queries (who has access to what)
- **Storage**: Separate files for each person/object type combination
- **Format**: `${personId}.Object.${type}` contains list of accessible objects
- **Critical for CHUM**: Object discovery relies on reverse maps

## CHUM Synchronization Deep Dive

### The Root Problem
Based on the debugging session, the core issue is that **CHUM object discovery is failing**:

1. **Access grants are created correctly** ✅
2. **CHUM protocol connections are established** ✅
3. **Object discovery returns zero objects** ❌
4. **No objects are transferred between devices** ❌

### Object Discovery Mechanism
The CHUM exporter needs to find objects accessible to a remote person:

```typescript
// Pseudo-code for object discovery
function getAccessibleObjects(remotePersonId: SHA256IdHash<Person>): Set<SHA256Hash> {
    // 1. Find all Access objects referencing this person
    const directAccess = reverseMap.get(`${remotePersonId}.Object.Access`);
    
    // 2. Find all groups this person belongs to
    const groups = reverseMap.get(`${remotePersonId}.Object.Group`);
    
    // 3. Find all Access objects referencing these groups
    const groupAccess = groups.flatMap(group => 
        reverseMap.get(`${group}.Object.Access`)
    );
    
    // 4. Combine and return all accessible object hashes
    return new Set([...directAccess, ...groupAccess]);
}
```

### Likely Root Causes
1. **Reverse Map Not Populated**: Access grants created but reverse maps not updated
2. **Query Function Broken**: Object discovery function has bugs
3. **Access Grant Format**: Wrong access grant structure (Access vs IdAccess)
4. **Person ID Mismatch**: Access grants target wrong person IDs

### Storage Architecture Impact
- Each device has **separate object storage**
- CHUM synchronization is the **only way** objects move between devices
- If CHUM object discovery fails, devices remain **completely isolated**
- This explains why both devices see different message sets

## Memory Summary

The ONE core architecture uses:
- **Recipe-based object definitions** with TypeScript integration
- **Content-addressed storage** with SHA256 hashing
- **Sophisticated access control** via Access/IdAccess objects
- **CHUM protocol** for P2P object synchronization
- **Reverse maps** for efficient access queries

The current CHUM sync failure is likely in the **object discovery mechanism** that determines which objects are accessible to a remote person based on access grants. This is the critical bottleneck preventing message synchronization between devices.