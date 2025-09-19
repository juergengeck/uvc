# Channels in ONE

Channels are a fundamental part of the ONE system, providing a way to store and share objects between users. This document explains how channels work, their structure, and how to use them.

## Channel Structure

### Channel Creation
Channels are created using the `ChannelManager` class:

```typescript
// Create a new channel
await channelManager.createChannel(channelId, owner);
```

The channel owner can be:
- A Person ID (for owned channels)
- null (for public channels)

### Channel Entry Structure
Each entry in a channel contains:
- `dataHash`: The hash of the actual object data
- `channelInfoIdHash`: The hash of the channel info
- `channelEntryHash`: The hash of the channel entry itself
- `creationTimeHash`: The hash of the creation time
- `isNew`: A flag indicating if this is a new entry

## Access Control

Access to channels is managed through the `LeuteAccessRightsManager`. Access rights are specified using:

```typescript
type ChannelAccessRights = {
    owner: SHA256IdHash<Person> | null;  // The owner of the channels
    persons: SHA256IdHash<Person>[];     // The persons who should gain access
    groups: SHA256IdHash<Group>[];       // The groups that should gain access
    channels: string[];                  // The channels that should gain access
}
```

### Applying Access Rights
```typescript
// Example of applying access rights
await applyAccessRights([
    {
        owner: mainId,
        persons: [],
        groups: ['iom', 'leuteReplicant', 'glueReplicant'],
        channels: [channelId]
    }
]);
```

## Data Storage and Retrieval

### Storage Process
- Objects are stored directly in channels without manual pre-storage
- The `ChannelManager` handles storage automatically
- Each object is stored as a `RawChannelEntry`

### Data Retrieval
Objects in channels are retrieved using iterators and caching:

```typescript
// Using RawChannelEntriesCache for efficient retrieval
const cache = new RawChannelEntriesCache(
    channelManager,
    channelId,
    owner,
    batchSize
);

// Load next batch of entries
cache.loadNextBatch();
```

### Caching System
The `RawChannelEntriesCache` provides:
- Batch loading of channel entries
- Efficient caching of retrieved data
- Automatic updates when channel content changes
- Memory-efficient iteration through channel entries

## Signatures and Certificates

Signatures and certificates are a critical part of the trust system in ONE, particularly for topics and messages in channels.

### Certificate Types
The system supports several types of certificates:
- `AffirmationCertificate`: Used to affirm the authenticity of an object
- `TrustKeysCertificate`: Used to certify trust in a profile's cryptographic keys
- `RightToDeclareTrustedKeysForEverybodyCertificate`: Grants global trust declaration rights
- `SignupCertificate`: Validates user registration
- `RelationCertificate`: Establishes relationships between entities (e.g., physician-patient)

### Message Signing and Verification

When messages are sent in a topic:

1. **Signing Process**:
   ```typescript
   // Message is automatically signed with the sender's private key
   await topicRoom.sendMessage(message, attachments, channelOwner);
   ```

2. **Verification**:
   - Messages can be verified using the `TrustedKeysManager`:
   ```typescript
   // Check if a message is signed by a specific person
   const isSigned = await trustedKeysManager.isAffirmedBy(messageHash, personId);
   ```

3. **Certificate Viewing**:
   - Users can view certificates attached to messages:
   ```typescript
   // Get certificates view for a message
   function getCertificatesView(msg: CachedChatMessage) {
     return (
       <CertificatePopup
         leuteModel={leuteModel}
         hashes={[msg.messageHash, msg.channelEntryHash, msg.creationTimeHash]}
         createOnlyHashes={[msg.messageHash]}
       />
     );
   }
   ```

### Trust Management

The `TrustedKeysManager` provides methods for:

1. **Creating Certificates**:
   ```typescript
   // Affirm a data hash (simple certificate)
   await trustedKeysManager.affirm(dataHash);
   
   // Create specific types of certificates
   await trustedKeysManager.certify('TrustKeysCertificate', {
     profile: profileHash
   });
   ```

2. **Verifying Certificates**:
   ```typescript
   // Get certificates of a specific type
   const certificates = await trustedKeysManager.getCertificatesOfType(
     objectHash,
     'AffirmationCertificate'
   );
   
   // Check certificate validity
   const trust = await trustedKeysManager.findKeyThatVerifiesSignature(signature);
   ```

3. **Role-Based Trust**:
   - Special roles like Clinics, Physicians, and Administrators use certificates to establish trust relationships
   - For example, a Physician certificate must be issued by a trusted Clinic

### Certificate Events

The system listens for new certificate events:
```typescript
objectEvents.onUnversionedObject(
  handleNewSignature,
  'Handler description',
  'Signature'  // Filter by object type
);
```

## Verifiable Credentials Support

The ONE system can be extended to support W3C Verifiable Credentials, leveraging the existing signature and certificate infrastructure.

### Verifiable Credential Data Model

Extend the system with a new certificate type that follows the W3C standard:

```typescript
type VerifiableCredential = {
    $type$: 'VerifiableCredential';
    '@context': string[];  // Standard contexts plus app-specific ones
    id: string;            // Unique identifier
    issuer: SHA256IdHash<Person>;
    issuanceDate: string;  // ISO format date
    expirationDate?: string;
    credentialSubject: {
        id: SHA256IdHash<Person>;
        [key: string]: any; // Claims about the subject
    };
    credentialSchema?: {
        id: string;
        type: string;
    };
};
```

### Credential Management

Extend the `TrustedKeysManager` to handle verifiable credentials:

```typescript
// Issue a new verifiable credential
async function issueCredential(
    subjectId: SHA256IdHash<Person>,
    claims: Record<string, any>,
    schema?: { id: string; type: string },
    expirationDate?: Date
): Promise<SHA256Hash<VerifiableCredential>> {
    // Create, sign and store the credential
}

// Verify a credential's authenticity and validity
async function verifyCredential(
    credentialHash: SHA256Hash<VerifiableCredential>
): Promise<{
    isValid: boolean;
    isExpired: boolean;
    issuer: SHA256IdHash<Person>;
    subject: SHA256IdHash<Person>;
}> {
    // Verify signature, expiration, and schema conformance
}
```

### Channel-Based Storage

Store credentials in dedicated channels:

```typescript
// Create a credential registry channel
async function createCredentialRegistry(owner: SHA256IdHash<Person>): Promise<string> {
    const channelId = `vc-registry-${randomUUID()}`;
    await channelManager.createChannel(channelId, owner);
    
    // Set up access rights for the registry
    await applyAccessRights([{
        owner,
        persons: [],
        groups: ['trustedIssuers'],
        channels: [channelId]
    }]);
    
    return channelId;
}

// Store a credential in a subject's personal credential channel
async function storeCredential(
    subjectId: SHA256IdHash<Person>,
    credentialHash: SHA256Hash<VerifiableCredential>
): Promise<void> {
    const channelId = `vc-store-${subjectId}`;
    await channelManager.createChannel(channelId, subjectId);
    await channelManager.postToChannel(channelId, credentialHash);
}
```

### Schema and Status Management

Implement schema validation and revocation:

```typescript
// Validate a credential against its schema
async function validateAgainstSchema(
    credential: VerifiableCredential
): Promise<boolean> {
    // Retrieve schema and validate credential structure
}

// Check if a credential is revoked
async function isRevoked(
    credentialHash: SHA256Hash<VerifiableCredential>
): Promise<boolean> {
    // Find newer versions of the same certificate
    const versions = await findAllVersionsOfCredential(credentialHash);
    // Sort by timestamp, newest first
    versions.sort((a, b) => new Date(b.issuanceDate).getTime() - new Date(a.issuanceDate).getTime());
    
    // If the newest version has different rights than the checked version,
    // or has an explicit revocation flag, consider it revoked
    if (versions.length > 0 && versions[0].hash !== credentialHash) {
        return true;
    }
    return false;
}

// Revoke a credential (issuer only)
async function revokeCredential(
    credentialHash: SHA256Hash<VerifiableCredential>,
    issuerId: SHA256IdHash<Person>
): Promise<SHA256Hash<VerifiableCredential>> {
    // Get the existing credential
    const credential = await getObject(credentialHash);
    
    // Create a new version with revoked status or modified rights
    const revokedCredential: VerifiableCredential = {
        ...credential,
        issuanceDate: new Date().toISOString(),
        credentialStatus: {
            type: "RevocationStatus",
            status: "revoked",
            revocationDate: new Date().toISOString(),
            previousVersion: credentialHash
        }
    };
    
    // Sign and store the new version
    const newCredentialHash = await trustedKeysManager.signAndStore(revokedCredential, issuerId);
    
    // Store in the same channels as the original credential
    const channelIds = await findChannelsContainingObject(credentialHash);
    for (const channelId of channelIds) {
        await channelManager.postToChannel(channelId, newCredentialHash);
    }
    
    return newCredentialHash;
}
```

### Integration with Existing UI

Add UI components for credential management:

```typescript
// React component for credential visualization and verification
function VerifiableCredentialViewer(props: {
    credential: VerifiableCredential;
    leuteModel: LeuteModel;
}): ReactElement {
    // Display credential details with verification status
}

// Create a credential inspector in the certificate popup
function getCredentialView(credential: VerifiableCredential) {
    return (
        <CertificatePopup
            leuteModel={leuteModel}
            verifiableCredential={credential}
            onClose={onClose}
            isOpened={true}
        />
    );
}
```

### Example Usage

```typescript
// Issue a qualification credential to a person
async function issueQualificationCredential(
    recipientId: SHA256IdHash<Person>,
    qualification: string
) {
    const credentialHash = await trustedKeysManager.issueCredential(
        recipientId,
        {
            type: "QualificationCredential",
            qualification: qualification,
            issueDate: new Date().toISOString()
        },
        { id: "qualification-schema-v1", type: "JsonSchema" },
        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // Valid for 1 year
    );
    
    // Store in recipient's credential store
    await storeCredential(recipientId, credentialHash);
    
    return credentialHash;
}

// Verify a person has a specific qualification
async function verifyQualification(
    personId: SHA256IdHash<Person>,
    expectedQualification: string
): Promise<boolean> {
    // Get credentials from the person's store
    const credentialChannel = `vc-store-${personId}`;
    const credentialEntries = await channelManager.iterateChannel(credentialChannel);
    
    // Find and verify matching credentials
    for await (const entry of credentialEntries) {
        const credential = await getObject(entry.dataHash);
        if (credential.$type$ !== 'VerifiableCredential') continue;
        
        const verification = await trustedKeysManager.verifyCredential(entry.dataHash);
        if (!verification.isValid || verification.isExpired) continue;
        
        if (credential.credentialSubject.qualification === expectedQualification) {
            return true;
        }
    }
    
    return false;
}
```

## ESP32 Device Journal Sync

ESP32 devices can sync their journal entries with the app through the journal sync protocol:

### Journal Entry Types from ESP32

ESP32 devices can send various types of journal entries:

```typescript
// ESP32 journal entry types
type ESP32JournalType = 'sensor_data' | 'config_change' | 'command' | 'event';

// Example sensor data entry
{
  id: 'esp32-sensor-1234567890',
  timestamp: 1234567890000,
  type: 'sensor_data',
  data: {
    temperature: 23.5,
    humidity: 45.2,
    pressure: 1013.25
  },
  deviceId: 'esp32-device-001'
}
```

### Syncing ESP32 Journal

To sync journal entries from an ESP32 device:

```typescript
// Sync journal with an authenticated ESP32 device
const deviceId = 'esp32-device-001';
const entries = await deviceDiscoveryModel.syncESP32Journal(deviceId);

console.log(`Synced ${entries.length} journal entries from ${deviceId}`);

// Check last sync timestamp
const lastSync = deviceDiscoveryModel.getESP32LastSyncTimestamp(deviceId);
console.log(`Last synced at: ${new Date(lastSync)}`);
```

### Automatic Journal Storage

When ESP32 journal entries are synced, they are automatically:
1. Prefixed with `ESP32_` in the type field
2. Stored as JournalEntry objects in the device ownership journal channel
3. Include additional metadata like `syncedAt` timestamp

Example of stored ESP32 journal entry:

```typescript
{
  $type$: 'JournalEntry',
  id: 'esp32-sensor-1234567890',
  timestamp: 1234567890000,
  type: 'ESP32_sensor_data',  // Prefixed with ESP32_
  data: {
    temperature: 23.5,
    humidity: 45.2,
    pressure: 1013.25,
    deviceId: 'esp32-device-001',
    syncedAt: 1234567900000  // When it was synced to the app
  },
  userId: 'person-id-123'
}

## Channel Events

The system provides event handling for channel updates:

```typescript
channelManager.onUpdated(
    async (
        channelInfoIdHash: SHA256IdHash<ChannelInfo>,
        channelId: string,
        channelOwner: SHA256IdHash<Person> | null,
        timeOfEarliestChange: Date,
        data: Array<RawChannelEntry & {isNew: boolean}>
    ) => {
        // Handle channel updates
    }
);
```

## Best Practices

1. **Channel Creation**
   - Always specify an owner when creating private channels
   - Use null owner for public channels
   - Set appropriate access rights after creation

2. **Access Control**
   - Define clear access rights for each channel
   - Use groups for managing access to multiple users
   - Regularly review and update access rights

3. **Data Management**
   - Use the caching system for efficient data retrieval
   - Implement proper error handling for channel operations
   - Monitor channel size and performance

4. **Event Handling**
   - Implement proper event listeners for channel updates
   - Clean up event listeners when components unmount
   - Handle errors in event callbacks

5. **Trust and Signatures**
   - Verify message signatures for sensitive communications
   - Use appropriate certificate types for different trust scenarios
   - Regularly refresh certificate caches with `trustedKeysManager.refreshCaches()`

6. **Verifiable Credentials**
   - Follow W3C standards for credential format
   - Implement proper revocation mechanisms
   - Store credentials in dedicated channels with appropriate access control
   - Validate credentials against schemas before accepting them
   - Check expiration dates and revocation status during verification

## Example Usage

```typescript
// Creating and using a channel
async function setupChannel() {
    // Create channel
    await channelManager.createChannel('myChannel', ownerId);
    
    // Set up access rights
    await applyAccessRights([{
        owner: ownerId,
        persons: [userId1, userId2],
        groups: ['myGroup'],
        channels: ['myChannel']
    }]);
    
    // Set up event listener
    channelManager.onUpdated((channelInfoIdHash, channelId, owner, time, data) => {
        // Handle updates
    });
    
    // Set up cache for efficient retrieval
    const cache = new RawChannelEntriesCache(
        channelManager,
        'myChannel',
        ownerId,
        25
    );
    cache.init();
}
```

## Device Ownership Journal

The system uses channels to maintain a journal of device ownership events for ESP32 and other IoT devices.

### Journal Channel Creation

Each user has their own device ownership journal channel:

```typescript
// Create a device ownership journal channel
const channelId = `device-ownership-journal-${personId}`;
await channelManager.createChannel(channelId, personId);
```

### Journal Entry Structure

Device ownership journal entries follow this structure:

```typescript
interface JournalEntry {
    $type$: 'JournalEntry';
    id: string;  // Unique ID for the entry
    timestamp: number;  // Unix timestamp
    type: 'DeviceOwnership' | 'DeviceDiscovery';
    data: {
        action: 'ownership_established' | 'ownership_removed' | 'ownership_verified' | 'started' | 'stopped';
        deviceId?: string;
        ownerPersonId?: string;
        establishedBy?: string;
        establishedAt?: number;
        deviceType?: string;
        deviceName?: string;
        deviceAddress?: string;
        devicePort?: number;
        authenticationMethod?: string;
        registrationMethod?: string;
        previousOwner?: string;
        removedBy?: string;
        removalMethod?: string;
        verificationMethod?: string;
        verifiedBy?: string;
        sessionId?: string;
        reason?: string;
    };
    userId: string;  // Person who created the entry
}
```

### Creating Journal Entries

```typescript
// Create a device ownership journal entry
const journalEntry: JournalEntry = {
    $type$: 'JournalEntry',
    id: `device-ownership-established-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    type: 'DeviceOwnership',
    data: {
        action: 'ownership_established',
        deviceId: device.id,
        ownerPersonId: owner.id,
        establishedBy: currentUser.id,
        establishedAt: Date.now(),
        deviceType: 'ESP32',
        deviceName: device.name,
        deviceAddress: device.address,
        devicePort: device.port,
        authenticationMethod: 'QUIC-VC',
        registrationMethod: 'manual'
    },
    userId: currentUser.id
};

// Store as unversioned object
const journalHash = await storeUnversionedObject(journalEntry);

// Post to channel - pass the object, not the hash
await channelManager.postToChannel(channelId, journalEntry, personId);
```

### Retrieving Journal Entries

```typescript
// Iterate through journal entries
const cache = new RawChannelEntriesCache(
    channelManager,
    `device-ownership-journal-${personId}`,
    personId,
    25  // batch size
);

await cache.init();

// Process entries
cache.onUpdate.listen(() => {
    const entries = cache.getEntries();
    for (const entry of entries) {
        const journalEntry = await getObject(entry.dataHash);
        if (journalEntry.$type$ === 'JournalEntry') {
            // Process journal entry
            console.log(`${journalEntry.data.action} for device ${journalEntry.data.deviceId}`);
        }
    }
});
```

### Journal Entry Types

1. **Device Ownership Established**
   - Created when a device receives and acknowledges an ownership credential
   - Contains device details and authentication method

2. **Device Ownership Removed**
   - Created when ownership is revoked or transferred
   - Includes who removed it and why

3. **Device Ownership Verified**
   - Created when an existing ownership is re-verified
   - Used for periodic credential checks

4. **Discovery Started/Stopped**
   - Tracks when device discovery sessions begin and end
   - Helps with debugging connectivity issues 