# CHUM Protocol Version 9 Documentation

## Overview

CHUM Protocol Version 9 introduces backward compatibility with Version 8, allowing instances running different versions to communicate seamlessly. This document describes the version negotiation mechanism and new features introduced in Version 9.

## Version Negotiation

### Protocol Version Constants

- **Current Version**: 9
- **Minimum Supported Version**: 8

### Negotiation Process

1. **Version Exchange**: During connection establishment, the importer requests the protocol version from the exporter
2. **Compatibility Check**: The importer checks if the remote version is within the supported range (8-9)
3. **Version Selection**: The negotiated version is the minimum of local and remote versions
4. **Feature Availability**: Features are enabled based on the negotiated version

### Example Negotiation Scenarios

| Local Version | Remote Version | Result | Negotiated Version |
|--------------|----------------|--------|-------------------|
| 9 | 9 | Success | 9 |
| 9 | 8 | Success | 8 |
| 8 | 9 | Success | 8 |
| 9 | 7 | Failure | - |
| 9 | 10 | Failure | - |

## New Features in Version 9

### 1. Extended Metadata (Message Type 11)
- **Purpose**: Request additional metadata with extended options
- **Availability**: Only when both sides support v9

### 2. Batch Operations (Message Type 12)
- **Purpose**: Fetch multiple objects in a single request for improved performance
- **Availability**: Only when both sides support v9
- **Fallback**: Automatically falls back to individual requests when v8 is negotiated

### 3. Transfer Progress (Message Type 13)
- **Purpose**: Provide progress notifications during large file transfers
- **Availability**: Only when both sides support v9

### 4. Push Notifications for Content Changes (Message Types 14-16)
- **Purpose**: Replace polling with efficient push-based notifications when new content is available
- **Message Types**:
  - `SUBSCRIBE_TO_CHANGES` (14): Subscribe to content change notifications
  - `UNSUBSCRIBE_FROM_CHANGES` (15): Unsubscribe from notifications
  - `CONTENT_CHANGED_NOTIFICATION` (16): Notification sent when new content is available
- **Availability**: Only when both sides support v9
- **Fallback**: Automatically falls back to polling (v8 behavior) when v8 is negotiated
- **Benefits**:
  - Reduced network traffic (no constant polling)
  - Immediate notifications when content changes
  - Lower latency for content synchronization
  - Reduced server load

## Implementation Details

### Version Check in Importer

```typescript
// Check if the remote version is supported
if (remoteVersion < MIN_SUPPORTED_PROTOCOL_VERSION || remoteVersion > PROTOCOL_VERSION) {
    throw createError('CS-MISMATCH', {
        connId: client.connId,
        local: PROTOCOL_VERSION,
        remote: remoteVersion,
        minSupported: MIN_SUPPORTED_PROTOCOL_VERSION
    });
}

// Return the negotiated version (minimum of local and remote)
return Math.min(PROTOCOL_VERSION, remoteVersion);
```

### Feature Compatibility Check

```typescript
// Check if a feature is available in the negotiated version
if (isMessageTypeSupported(MESSAGE_TYPES.GET_OBJECTS_BATCH, negotiatedVersion)) {
    // Use v9 batch operation
} else {
    // Fall back to v8 individual operations
}
```

### Example: Batch Fetch with Fallback

```typescript
async fetchObjectsBatch(hashes: SHA256Hash[]): Promise<AnyObjectCreation[]> {
    if (this.negotiatedProtocolVersion && 
        isMessageTypeSupported(MESSAGE_TYPES.GET_OBJECTS_BATCH, this.negotiatedProtocolVersion)) {
        // Use v9 batch operation
        return await this.ws.send(MESSAGE_TYPES.GET_OBJECTS_BATCH, hashes);
    } else {
        // Fall back to v8 individual fetches
        const results = [];
        for (const hash of hashes) {
            results.push(await this.fetchObject(hash));
        }
        return results;
    }
}
```

### Push Notifications Implementation

#### Importer Side (Subscriber)

```typescript
if (keepRunning) {
    // In v9, use push notifications instead of polling
    if (negotiatedVersion >= 9 && isMessageTypeSupported(MESSAGE_TYPES.SUBSCRIBE_TO_CHANGES, negotiatedVersion)) {
        // Subscribe to changes if not already subscribed
        if (!exporterClient.isSubscribedToChanges) {
            await exporterClient.subscribeToChanges();
            exporterClient.isSubscribedToChanges = true;
        }
        
        // Wait for notification or timeout
        await Promise.race([
            exporterClient.waitForContentChange(),
            wait(pollInterval * 10) // Less frequent checks as backup
        ]);
    } else {
        // Fall back to v8 polling
        await wait(pollInterval);
    }
}
```

#### Exporter Side (Publisher)

```typescript
// When new content becomes available
async notifySubscribers() {
    if (this.isSubscribedToChanges && this.negotiatedProtocolVersion >= 9) {
        await this.sendContentChangedNotification();
    }
}
```

## Migration Guide

### For Version 8 Instances

Version 8 instances can continue to operate without modification. When connecting to a Version 9 instance:
- The connection will negotiate to use Version 8 features only
- All existing functionality will work as before
- No code changes required

### For Version 9 Instances

Version 9 instances should:
1. Check the negotiated protocol version before using v9-specific features
2. Implement fallback logic for v8 compatibility
3. Use the `isMessageTypeSupported()` helper function to check feature availability

## Testing

Run the test suite to verify version negotiation:

```bash
npm test -- test/src/chum-protocol-v9-test.ts
```

## Future Versions

The architecture supports future protocol versions by:
- Extending the message type range
- Updating the `isMessageTypeSupported()` function
- Maintaining backward compatibility within the supported version range