# ESP32 Ownership Removal Protocol

## Overview
The ownership removal protocol allows device owners to release ownership of their ESP32 devices, returning them to an unclaimed state. This uses service type 2 (CREDENTIALS) which is no longer needed for credential provisioning.

## Protocol Flow

### 1. App Initiates Removal
```typescript
const removalPacket = {
  type: 'ownership_remove',
  deviceId: device.id,
  senderPersonId: currentUserPersonId,
  timestamp: Date.now()
};

// Send via service type 2
const packet = Buffer.concat([
  Buffer.from([2]), // SERVICE_TYPE_CREDENTIALS
  Buffer.from(JSON.stringify(removalPacket))
]);
```

### 2. ESP32 Validates Request
- Parses JSON from service type 2 message
- Verifies sender matches stored owner_id
- Rejects if sender is not the owner

### 3. ESP32 Creates Journal Entries
The ESP32 creates verifiable credentials for audit trail:

```json
{
  "$type$": "DeviceJournalCredential",
  "issuer": "esp32_device_id",
  "credentialSubject": {
    "action": "ownership_removed",
    "actor": "owner_person_id",
    "message": "Device is now unclaimed"
  }
}
```

### 4. ESP32 Clears Ownership
- Erases `device_vc` from NVS
- Erases `owner_id` from NVS
- Clears runtime ownership state
- Updates display to show unclaimed status

### 5. ESP32 Responds & Restarts
- Sends acknowledgment to app
- Restarts after 3 seconds for clean state

## Journal Entry Types

### App Side
- `ownership_removal_requested` - Initial removal request
- `ownership_removed` - Local removal completed

### ESP32 Side (Verifiable)
- `ownership_removal_started` - Processing removal
- `ownership_removed` - Ownership cleared
- `ownership_takeover` - New owner claims previously owned device

## Error Handling

1. **Device Already Unclaimed**: App clears local state only
2. **Network Timeout**: App removes local ownership anyway
3. **Invalid Sender**: ESP32 rejects and logs attempt

## Security Considerations

- Only current owner can remove ownership
- All actions create verifiable journal entries
- Device restarts to ensure clean state
- Journal entries can be synced for audit trail