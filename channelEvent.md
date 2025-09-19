# Channel Event System Documentation

## Overview

The Channel Event System provides a robust mechanism for reacting to changes in channel data stored in the application. It follows an event-driven architecture where updates to channels in the storage layer trigger events that can be listened to by various components of the application.

## Event Flow Architecture

1. **Storage Layer Events**: The underlying storage system emits low-level events when objects are created, updated, or deleted.
2. **ObjectEventDispatcher**: Collects and serializes all storage events, providing a more controlled interface.
3. **ChannelManager**: Listens for specific 'ChannelInfo' object changes and processes them.
4. **Application Components**: Subscribe to the ChannelManager's `onUpdated` event to react to channel changes.

## Configuration

The event system is automatically configured during the ChannelManager's initialization:

```typescript
public async init(): Promise<void> {
    registerCrdtAlgorithm(new LinkedListCrdtAlgorithm());
    
    // Load the cache from the registry
    await this.loadRegistryCacheFromOne();
    
    // Register event handlers
    this.disconnectOnVersionedObjListener = objectEvents.onNewVersion(
        this.processNewVersion.bind(this),
        'ChannelManager: processNewVersion',
        'ChannelInfo'
    );
}
```

This registration ensures that whenever a 'ChannelInfo' object is updated in storage, the ChannelManager's `processNewVersion` method is called, which then emits higher-level events through the `onUpdated` event emitter.

## Listening for Channel Events

To receive notifications when channels are updated:

```typescript
// Create a listener for channel updates
const disconnect = channelManager.onUpdated((
    channelInfoIdHash,
    channelId,
    channelOwner,
    timeOfEarliestChange,
    data
) => {
    // Handle the channel update event
    console.log(`Channel ${channelId} was updated at ${timeOfEarliestChange}`);
    
    // Process the data array which contains the changed elements
    for (const entry of data) {
        if (entry.isNew) {
            console.log(`New entry: ${entry.dataHash}`);
        }
    }
});

// When component is unmounted or no longer needs updates
disconnect();
```

## Event Data Structure

The `onUpdated` event emits the following parameters:

```typescript
channelManager.onUpdated = new OEvent<
    (
        channelInfoIdHash: SHA256IdHash<ChannelInfo>,  // Unique hash of the channel info
        channelId: string,                             // Human-readable channel ID
        channelOwner: SHA256IdHash<Person> | null,     // Owner of the channel
        timeOfEarliestChange: Date,                    // Timestamp of the update
        data: Array<RawChannelEntry & {isNew: boolean}> // Array of changed entries
    ) => void
>();
```

The `data` parameter contains an array of channel entries with the following structure:

```typescript
type RawChannelEntry = {
    channelInfo: ChannelInfo;              // Channel info object
    channelInfoIdHash: SHA256IdHash<ChannelInfo>; // Hash of the channel info
    channelEntryHash: SHA256Hash<LinkedListEntry>; // Hash of the entry in the linked list
    creationTimeHash: SHA256Hash<CreationTime>; // Hash of the creation time
    creationTime: number;                  // Creation timestamp
    dataHash: SHA256Hash;                  // Hash of the data
    metaDataHashes?: Array<SHA256Hash>;    // Optional metadata hashes
    author?: SHA256IdHash<Person>;         // Optional author
    isNew: boolean;                        // Whether this entry is new
};
```

## Internal Event Processing

When a ChannelInfo object is updated in storage, the following sequence occurs:

1. The storage layer emits an event for the updated object
2. The ObjectEventDispatcher captures this event and calls the registered handlers
3. The ChannelManager's `processNewVersion` method is called with the updated object
4. The method:
   - Updates the channel info cache
   - Calculates the changed elements
   - Processes any metadata (like profiles)
   - Emits the `onUpdated` event with the processed data

```typescript
private async processNewVersion(caughtObject: VersionedObjectResult<ChannelInfo>): Promise<void> {
    // Process updates and calculate changes
    // ...
    
    // Emit event with processed data
    this.onUpdated.emit(
        caughtObject.idHash,
        newChannelInfo.id,
        newChannelInfo.owner || null,
        new Date(changedElements[changedElements.length - 1].creationTime),
        changedElements
    );
}
```

## Race Condition Prevention

The event system includes mechanisms to prevent race conditions:

1. **Serialized Processing**: Events are processed in sequence to prevent concurrent modifications.
2. **Double Locking Mechanism**: Uses both post locks and cache locks to ensure atomic updates.
3. **Synchronous Cache Updates**: The cache is updated before emitting events to ensure consistency.
4. **Event Synchronization**: Events include complete and accurate data about the changes.

## Best Practices

1. **Always disconnect event listeners** when they are no longer needed to prevent memory leaks:
   ```typescript
   const disconnect = channelManager.onUpdated(handleUpdate);
   // Later when no longer needed:
   disconnect();
   ```

2. **Check the `isNew` flag** when processing updates to determine if an entry is newly added:
   ```typescript
   for (const entry of data) {
       if (entry.isNew) {
           // Process new entry
       } else {
           // Process existing entry
       }
   }
   ```

3. **Filter updates by channel ID** if you're only interested in specific channels:
   ```typescript
   channelManager.onUpdated((infoHash, id, owner, time, data) => {
       if (id === 'mySpecificChannel') {
           // Process only updates to 'mySpecificChannel'
       }
   });
   ```

4. **Consider using debounce** for high-frequency updates to avoid overwhelming the UI:
   ```typescript
   const debouncedHandler = debounce((infoHash, id, owner, time, data) => {
       // Update UI after updates settle
   }, 100);
   channelManager.onUpdated(debouncedHandler);
   ```

5. **Handle errors gracefully** as network conditions may cause event processing issues:
   ```typescript
   channelManager.onUpdated((infoHash, id, owner, time, data) => {
       try {
           // Process update
       } catch (error) {
           console.error('Error processing channel update:', error);
           // Implement recovery strategy
       }
   });
   ```

## Example Use Cases

1. **Chat Application**:
   ```typescript
   channelManager.onUpdated((infoHash, id, owner, time, data) => {
       if (id === 'chatChannel') {
           for (const entry of data) {
               if (entry.isNew) {
                   // Fetch and display new message
                   getObject(entry.dataHash).then(message => {
                       chatInterface.displayMessage(message);
                   });
               }
           }
       }
   });
   ```

2. **File Synchronization**:
   ```typescript
   channelManager.onUpdated((infoHash, id, owner, time, data) => {
       if (id === 'fileSync') {
           for (const entry of data) {
               if (entry.isNew) {
                   // Update file list with new file
                   syncFileList();
               }
           }
       }
   });
   ```

3. **Real-time Dashboard**:
   ```typescript
   channelManager.onUpdated((infoHash, id, owner, time, data) => {
       if (id === 'metrics') {
           // Update dashboard with latest metrics
           updateDashboard(data);
       }
   });
   ``` 