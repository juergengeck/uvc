# Device Ownership Journal Logging

## Overview
Added comprehensive journal logging for device ownership events in the React Native app. All ownership changes are now tracked with timestamps and metadata.

## Journal Entry Types

### 1. Device Ownership Established
Logged when:
- ESP32 device is authenticated via QUIC-VC
- Manual device registration via `registerDeviceOwner()`

Journal entry includes:
- `action`: "ownership_established"
- `deviceId`: ID of the device
- `ownerPersonId`: Person ID of the new owner
- `establishedBy`: Person ID who established ownership
- `establishedAt`: Timestamp when ownership was established
- `deviceType`: Type of device (e.g., "ESP32")
- `deviceAddress`: IP address of device
- `devicePort`: Port number
- `authenticationMethod`: Method used (e.g., "QUIC-VC", "manual")

### 2. Device Ownership Removed
Logged when:
- Device ownership is explicitly removed via `removeDeviceOwner()`

Journal entry includes:
- `action`: "ownership_removed"
- `deviceId`: ID of the device
- `ownerPersonId`: Previous owner's Person ID
- `removedBy`: Person ID who removed ownership
- `removalMethod`: How it was removed (e.g., "manual")

### 3. Device Ownership Verified
Logged when:
- Credentials are verified for an owned device

Journal entry includes:
- `action`: "ownership_verified"
- `deviceId`: ID of the device
- `ownerPersonId`: Current owner's Person ID
- `verifiedBy`: Person ID who verified
- `verificationMethod`: Method used (e.g., "credential")

## Implementation Details

### Journal Entry Structure
```typescript
{
  $type$: 'JournalEntry',
  id: `device-ownership-${action}-${timestamp}-${random}`,
  timestamp: Date.now(),
  type: 'DeviceOwnership',
  data: {
    action: string,
    deviceId: string,
    ownerPersonId: string,
    establishedBy/removedBy/verifiedBy: string,
    establishedAt: number,
    // Additional metadata
  },
  userId: string
}
```

### Storage and Distribution
- Journal entries are stored as unversioned objects in ONE.core
- Posted to the configured journal channel for synchronization
- Accessible across all devices sharing the channel

## Side Effects

### Discovery Management
- When device ownership is established: Discovery automatically stops
- When last owned device is removed: Discovery automatically restarts
- Prevents unnecessary network traffic when devices are paired

### Future Enhancements
1. Query journal for device ownership history
2. Export ownership timeline for audit purposes
3. Sync ownership state across multiple app instances
4. Add ownership transfer events (from one user to another)