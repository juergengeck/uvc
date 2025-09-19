# Audit Trail Architecture for Device Management

## Overview

This document describes how the audit trail works in our device management system, combining Verifiable Credentials (VCs), Journal Entries, and Device Credentials to provide a complete audit history.

## Components

### 1. Verifiable Credentials (VCs)
- **Model**: `VerifiableCredentialModel`
- **Purpose**: Cryptographic proof of device ownership
- **Storage**: Local credential store + sent to ESP32 devices
- **Key Fields**:
  - `id`: Unique credential identifier
  - `sub`: Subject (user Person ID)
  - `dev`: Device ID
  - `iat`/`exp`: Issue/expiry timestamps
  - `prf`: Cryptographic proof

### 2. Journal Entries
- **Types**:
  - `DEVICE_OWNERSHIP_*`: Ownership events
  - `DEVICE_CONTROL_*`: Control actions (LED, config)
  - `ESP32_*`: Device-originated events
- **Storage**: Versioned objects in journal channel
- **Distribution**: Synced across all channel participants

### 3. Device Credentials
- **Model**: `DeviceCredential` (ONE object)
- **Purpose**: Persistent record of device ownership in ONE storage
- **Links**: References VC through `credentialId`

## Audit Trail Flow

### Device Ownership Establishment
1. **VC Creation**: `VerifiableCredentialModel.createDeviceOwnershipCredential()`
   - Creates cryptographically signed credential
   - Stores locally and sends to device

2. **Device Credential**: `DeviceDiscoveryModel.createDeviceCredential()`
   - Creates ONE object recording ownership
   - Links to VC via `credentialId`

3. **Journal Entry**: `createDeviceOwnershipJournalEntry()`
   - Type: `DEVICE_OWNERSHIP_ESTABLISHED`
   - Records: timestamp, device info, owner, credential ID

### Device Control Actions
1. **LED Control Command**: `sendESP32Command()`
   - Sends authenticated command to device
   
2. **Journal Entry**: `createDeviceControlJournalEntry()`
   - Type: `DEVICE_CONTROL_LED_CONTROL`
   - Records: command, previous/new state, manual flag, timestamp

### Device Removal
1. **Credential Removal**: `sendCredentialRemovalToDevice()`
   - Sends removal command to device
   - Removes local credential

2. **Journal Entry**: `createDeviceOwnershipJournalEntry()`
   - Type: `DEVICE_OWNERSHIP_REMOVED`
   - Records: previous owner, removal method, timestamp

## Complete Audit Trail

For any device, we can reconstruct:

### From Journal Entries
- **Ownership History**: Who owned the device and when
- **Control Actions**: All LED toggles, config changes
- **Authentication Events**: When device was authenticated
- **Sync Events**: ESP32 journal entries synced to app

### From VCs
- **Cryptographic Proof**: Signed credentials proving ownership
- **Permission Grants**: What permissions were granted
- **Validity Period**: When credentials were valid

### From Device Credentials
- **Persistent Record**: ONE objects linking all components
- **Device Metadata**: Type, capabilities, network info

## Missing Components for Complete Audit

### Currently Missing:
1. **VC Revocation List**: No formal revocation mechanism
2. **Credential Chain**: No linking between old/new credentials
3. **Cross-Device Audit**: No correlation between related devices
4. **Signature Verification Log**: Not logging VC verification attempts

### Recommended Additions:

#### 1. Device State Change Journal
```typescript
// When device goes online/offline
createDeviceStateJournalEntry('DEVICE_STATE_CHANGED', {
  deviceId: device.id,
  previousState: 'offline',
  newState: 'online',
  trigger: 'discovery', // or 'heartbeat', 'timeout', 'authentication'
  timestamp: Date.now()
});
```

#### 2. Authentication Journal
```typescript
// When device authenticates with VC
createAuthJournalEntry('DEVICE_AUTHENTICATED', {
  deviceId: device.id,
  method: 'QUIC-VC',
  personId: authenticatedAs,
  sessionId: sessionId,
  timestamp: Date.now()
});

// When authentication fails
createAuthJournalEntry('DEVICE_AUTHENTICATION_FAILED', {
  deviceId: device.id,
  reason: 'invalid_credential', // or 'expired', 'revoked', etc
  attemptedBy: personId,
  timestamp: Date.now()
});
```

#### 3. VC Verification Events (not creation)
```typescript
// When VC verification is attempted
createVCVerificationJournalEntry('VC_VERIFICATION', {
  deviceId: device.id,
  verificationResult: 'success' | 'failed',
  failureReason?: 'expired' | 'invalid_signature' | 'revoked',
  verifiedBy: personId,
  timestamp: Date.now()
});
```

## Querying the Audit Trail

### Get Complete Device History
```typescript
async function getDeviceAuditTrail(deviceId: string) {
  // 1. Get all journal entries for device
  const journalEntries = await channelManager.getJournalEntries({
    filter: entry => entry.data.deviceId === deviceId
  });
  
  // 2. Get device credentials
  const deviceCredentials = await getDeviceCredentials(deviceId);
  
  // 3. Get VCs for device
  const vcs = credentialModel.getCredentialsForDevice(deviceId);
  
  // 4. Combine and sort by timestamp
  return combineAuditData(journalEntries, deviceCredentials, vcs);
}
```

### Generate Audit Report
```typescript
function generateAuditReport(auditData: AuditData[]) {
  return {
    ownership: auditData.filter(d => d.type.includes('OWNERSHIP')),
    control: auditData.filter(d => d.type.includes('CONTROL')),
    authentication: auditData.filter(d => d.type.includes('AUTH')),
    credentials: auditData.filter(d => d.type.includes('CREDENTIAL'))
  };
}
```

## Security Considerations

1. **Journal Integrity**: Journal entries are immutable once created
2. **VC Verification**: Always verify VC signatures before trusting
3. **Time Synchronization**: Ensure accurate timestamps across devices
4. **Access Control**: Only device owners can access full audit trail

## Implementation Status

✅ **Implemented**:
- Device ownership journal entries
- LED control journal entries with manual flag
- Basic VC creation and storage
- Device credential objects
- Device state change tracking (online/offline)
- Authentication event logging (success/failure)
- Heartbeat-triggered state changes

❌ **Not Implemented**:
- VC lifecycle tracking (verification attempts)
- Comprehensive audit queries
- Cross-device audit correlation

## Next Steps

1. Implement VC lifecycle journal entries
2. Add device state change tracking
3. Create audit query APIs
4. Build audit report generation
5. Add credential chain tracking