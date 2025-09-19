# Contact and Identity Management in Lama

## Core Principles

The contact and identity management in Lama follows the Refinio ONE object relationship model and implements the complete pairing protocol compatible with the one.leute reference implementation.

## ID Handling and Common Issues

### ID Types in the System

1. **SHA256IdHash Objects**
   - Format: 64-character hexadecimal strings when converted
   - Used for: Person IDs, Channel IDs, Object hashes
   - Type: `SHA256IdHash<T>` from `@refinio/one.core`

2. **Device IDs**
   - SHA256 format: `a1b2c3d4e5f6789012345678901234567890123456789012345678901234567890`
   - Prefixed format: `esp32-5c013b678d30`, `mobile-abc123def456`
   - Used in: Device discovery, networking, ownership

### Common ID Conversion Issues

#### The "[object Object]" Problem
When SHA256IdHash objects are passed where strings are expected, JavaScript's default conversion produces `"[object Object]"`, causing:
- Invalid device IDs in discovery broadcasts
- Failed device identification
- Broken pairing protocols

**Solution**: Use the shared ID utility functions from `@src/utils/ids`:

```typescript
import { requireStringId, toStringId } from '@src/utils/ids';

// Safe conversion that throws on failure
const deviceId = requireStringId(personIdHash, 'deviceId');

// Safe conversion that returns empty string on failure
const deviceIdOrEmpty = toStringId(personIdHash);
```

### ID Utility Functions

Located in `src/utils/ids.ts`:

- **`requireStringId(id, context)`**: Converts IDs to strings, throws on failure
- **`toStringId(id)`**: Converts IDs to strings, returns empty on failure  
- **`isValidSHA256String(value)`**: Validates 64-char hex strings
- **`isValidDeviceId(value)`**: Validates device ID formats
- **`formatDeviceId(id)`**: Formats long IDs for display (first...last)

## Architecture Overview

### Identity Management System

The identity system handles multiple types of identities and contacts:

1. **Human Identities**: Real users via pairing protocol
2. **AI/LLM Identities**: Local AI models as conversational contacts  
3. **System Identities**: Built-in system contacts and topics
4. **Profile Management**: User profile sharing and access control

### Contact Types and Creation

#### Human Contacts (Primary)
- Created via pairing protocol in `LeuteAccessRightsManager`
- Full trust establishment and profile sharing
- Real-time communication and synchronization

#### AI/LLM Contacts (Specialized)
- Created via `AIContactManager` in `AIAssistantModel`
- Local AI models appearing as conversational contacts
- Enables chat interface with AI models

```typescript
// AI Contact Architecture (subset of identity management)
AppModel
├── LeuteAccessRightsManager (human contacts, pairing, trust)
├── AIAssistantModel (AI conversations + AI contact creation)
│   ├── AIContactManager (dedicated AI contact creation)
│   └── uses LLMManager (LLM model functionality only)
└── LLMManager (LLM model storage/functionality only)
```



## Current Implementation Status ✅

### Human Identity Management - FULLY WORKING
- ✅ **Connection Handover**: Spare connections properly managed
- ✅ **Encrypted Handshake**: PromisePlugin compatibility fixed
- ✅ **Trust Establishment**: Keys certified using one.leute pattern
- ✅ **Profile Sharing**: Main profile shared with everyone group
- ✅ **Contact Creation**: ContactCreationService creates Someone objects
- ✅ **Security**: acceptUnknownPersons=false (only known persons, like one.leute)

### AI Identity Management - FULLY WORKING
- ✅ **Model Loading**: LLMManager loads and manages local AI models
- ✅ **Contact Creation**: AIContactManager creates contacts for AI models  
- ✅ **Chat Integration**: AI models appear as contacts in chat interface
- ✅ **Separation of Concerns**: Clean architecture with dedicated managers

### Profile Sharing Mechanism ✅
Following one.leute pattern exactly:
- **During Init**: `giveAccessToMainProfileForEverybody()` shares profile with everyone group
- **During Pairing**: Remote users can access our profile through group permissions
- **After Identity Switch**: `afterMainIdSwitch` event re-shares profile automatically
- **Profile Access**: Uses `mainProfileLazyLoad()` like one.leute (not `mainProfile()`)

## Object Relationship Hierarchy

The core objects in the identity system have the following relationship:

1. **Person**: The foundational identity object
2. **Profile**: Contains descriptive information about a Person (name, display info)
3. **Someone**: Represents a contact in the system
4. **Contacts List**: Collection of Someone objects accessible via LeuteModel

## Pairing Protocol Flow

### Complete Pairing Sequence (lama ↔ edda.one)

1. **Invitation Generation** ✅
   ```typescript
   const invitation = await connectionsModel.pairing.createInvitation();
   // Creates token and public key for pairing
   ```

2. **Connection Establishment** ✅
   ```typescript
   // Two connections created: one for pairing, one for chum
   // Connection handover works correctly
   ```

3. **Trust Establishment** ✅
   ```typescript
   // In LeuteAccessRightsManager.trustPairingKeys()
   await trust.certify('TrustKeysCertificate', {profile: profile.loadedVersion});
   ```

4. **Profile Sharing** ✅
   ```typescript
   // Automatic via giveAccessToMainProfileForEverybody()
   // Remote user can access our profile name/info
   ```

5. **Contact Creation** ✅
   ```typescript
   // Via ContactCreationService.createContactFromPairing()
   const contactCreated = await contactCreationService.createContactFromPairing(remotePersonId);
   ```

6. **Chum Protocol** ✅
   ```typescript
   // acceptUnknownPersons: false (security: only known persons)
   // Access granted through trust relationship
   ```

## Implementation Guidelines

### Contact Creation (Updated)

**Contact creation is now properly separated by type:**

#### Human Contact Creation ✅
Human contacts are created automatically during pairing via `LeuteAccessRightsManager`:

```typescript
// Automatic during pairing via LeuteAccessRightsManager
private async trustPairingKeys(...) {
    // 1. Get remote keys
    const keys = await getAllEntries(remotePersonId, 'Keys');
    
    // 2. Create profile with sign keys
    const profile = await ProfileModel.constructWithNewProfile(
        remotePersonId, localPersonId, 'default', [], [signKey]
    );
    
    // 3. Establish trust
    await trust.certify('TrustKeysCertificate', {profile: profile.loadedVersion});
    
    // 4. Create human contact automatically
    const contactCreationService = new ContactCreationService(this.leuteModel);
    await contactCreationService.createContactFromPairing(remotePersonId);
}
```

#### AI/LLM Contact Creation ✅
AI contacts are created automatically when models are loaded via `AIContactManager`:

```typescript
// Automatic during model loading in AIAssistantModel
private async updateAvailableLLMModels(): Promise<LLM[]> {
    const models = await this.llmManager.listModels();
    
    // Create contacts for all AI models
    if (this.contactManager && models.length > 0) {
        const contactsCreated = await this.contactManager.ensureContactsForModels(models);
        console.log(`✅ Created/verified ${contactsCreated} contacts for LLM models`);
    }
    
    return models;
}
```

### Profile Sharing (New)

Profile sharing is automatic and follows one.leute pattern:

```typescript
// In LeuteAccessRightsManager constructor
this.leuteModel.afterMainIdSwitch(() => {
    this.giveAccessToMainProfileForEverybody().catch(console.error);
});

// In init() method
await this.giveAccessToMainProfileForEverybody();

// Implementation
private async giveAccessToMainProfileForEverybody(): Promise<void> {
    const me = await this.leuteModel.me();
    const mainProfile = me.mainProfileLazyLoad(); // ✅ CRITICAL: Use mainProfileLazyLoad()
    
    await createAccess([{
        id: mainProfile.idHash,
        person: [],
        group: this.groups('everyone'),
        mode: SET_ACCESS_MODE.ADD
    }]);
}
```

### Contact Retrieval

```typescript
// Get all contacts
const contacts = await leuteModel.others();

// Get the current user
const me = await leuteModel.me();

// Get a specific contact
const someone = await leuteModel.getSomeone(personId);
```

## Key Architecture Decisions

### TransportManager Architecture ✅
- **ConnectionsModel**: Real one.models instance for protocol compatibility
- **Configuration**: `acceptUnknownPersons: false` (security: only known persons)
- **Networking**: Full networking enabled for pairing protocol
- **Access Control**: Group-based permissions through LeuteAccessRightsManager

### Access Rights Management ✅
Following one.leute pattern exactly:
- **Group Configuration**: iom, leuteReplicant, glueReplicant, everyone
- **Profile Sharing**: Main profile accessible to everyone group
- **Channel Access**: Questionnaire and chat channels shared appropriately
- **Trust Management**: TrustKeysCertificate for pairing keys

## Debugging and Troubleshooting

### Common Issues Fixed ✅

1. **"connection.promisePlugin is not a function"** 
   - Fixed: Added PromisePlugin check in acceptWithEncryption
   - Root cause: Connection wrapper objects missing plugin

2. **"Cannot read property 'addListener' of undefined"**
   - Fixed: Deferred initAccessManager() to break circular dependency
   - Root cause: chum-sync.js self-import cycle

3. **"No Set of accessible hashes found"**
   - Fixed: Set acceptUnknownPersons: false (following one.leute reference)
   - Root cause: Trust ≠ Contact, chum needs trust not contact list

4. **"Failed to append connections log"**
   - Fixed: Handle fresh connections gracefully in ConnectionRouteManager
   - Root cause: No prior connection history for new pairing connections

### Current Status
- ✅ **Pairing Protocol**: Complete end-to-end functionality
- ✅ **Profile Sharing**: Names and info shared automatically
- ✅ **Contact Creation**: Automatic during pairing
- ✅ **Chum Protocol**: Ready for message/topic synchronization
- ✅ **Error Handling**: All major issues resolved

## Compatibility with one.leute

The implementation now matches one.leute exactly:

1. ✅ **Same pairing event handlers**: `onPairingSuccess()` method call
2. ✅ **Same trust method**: `trust.certify()` not `trust.trust()`
3. ✅ **Same profile creation**: With sign keys, not empty profile
4. ✅ **Same profile sharing**: `mainProfileLazyLoad()` and everyone group
5. ✅ **Same access patterns**: Group-based permissions
6. ✅ **Same initialization**: `afterMainIdSwitch` event handling

## Next Steps

With the pairing protocol fully working, the next development focuses are:

1. **Message Synchronization**: Implement topic and message sync over chum
2. **UI Integration**: Connect pairing protocol to app UI
3. **Contact Management**: Enhance contact list and profile display
4. **Topic Creation**: Enable federated topic creation and sharing

The foundation is now solid and follows the one.leute reference implementation exactly.

## Recent ID Handling Fixes

### UDP Buffer Allocation Fix (Credential Sending Crash)
**Problem**: Creating Uint8Array without proper buffer alignment caused native crashes when sending credentials.

**Root Cause**: 
```typescript
// Old code - dangerous
const servicePacket = new Uint8Array(1 + jsonBytes.length);
servicePacket[0] = serviceType;
servicePacket.set(jsonBytes, 1);
```

**Fix**:
```typescript
// New code - safe
const buffer = new ArrayBuffer(1 + jsonBytes.length);
const servicePacket = new Uint8Array(buffer);
servicePacket[0] = serviceType;
servicePacket.set(jsonBytes, 1);
```

### Device ID "[object Object]" Fix
**Problem**: SHA256IdHash objects were being stringified to "[object Object]" in discovery broadcasts.

**Root Cause**: Direct String() conversion or implicit toString() on objects.

**Fix**: 
1. Created shared ID utility in `src/utils/ids.ts`
2. Updated DeviceDiscoveryModel to use `requireStringId()`
3. Made invalid IDs throw errors instead of silent failures

### Verification Checklist
- ✅ No crashes when sending credentials
- ✅ Device IDs in discovery are valid hex strings
- ✅ No "[object Object]" in network logs
- ✅ Failed ID conversions throw clear errors 