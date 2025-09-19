# Channel Investigation Plan

## Problem Statement
Objects stored in channels (specifically LLM objects) cannot be retrieved, indicating a divergence between in-memory channel state and storage. This is particularly evident when:
1. The LLMManager stores models in the 'llm' channel but fails to retrieve them later
2. Channel events don't properly trigger when new objects are added
3. System behaves inconsistently after initialization

## Architecture Context
1. **Channels use time-sorted Merkle trees**, a historical predecessor to CRDTs
2. **Must maintain compatibility with one.leute** - the reference implementation
3. **Storage layer (expo port)** could have implementation issues
4. **Initialization sequence** is critical for proper channel state

## Diagnostic Approach

### Phase 1: Monitor Without Modifying
1. **Add diagnostic logging** around critical points
   - Channel creation (`createChannel`)
   - Object storage (`postToChannel`)
   - Object retrieval (`getObjects`)
   - Channel event emission
   - Cache updates
   
2. **Create snapshot comparison tools**
   - Log the state of in-memory channel cache
   - Log the state of storage (ONE objects)
   - Compare hashes to identify inconsistencies

3. **Trace initialization sequence**
   - Log exact initialization order of components
   - Verify object creation lifecycle
   - Check reference passing between components

### Phase 2: Identify Specific Failure Points

1. **Channel ID consistency**
   - Verify `_llmChannelId` isn't changing unexpectedly
   - Check all storage/retrieval uses the same ID consistently
   - Trace channel ID through component interactions

2. **Cache synchronization**
   - Monitor `channelInfoCache` updates
   - Track `saveRegistryCacheToOne` calls
   - Verify cache consistency with storage state

3. **Event propagation**
   - Check if `onUpdated` events are properly triggered
   - Verify all listeners are registered
   - Measure event propagation timing

4. **Merkle tree integrity**
   - Check head references in ChannelInfo objects
   - Verify proper entry linking
   - Validate time ordering

### Phase 3: Targeted Fixes

1. **Channel ID stabilization**
   - Enforce consistent channel ID
   - Remove dynamic channel switching
   - Add verification checks

2. **Synchronization enforcement**
   - Ensure memory-to-storage sync
   - Add verification after operations
   - Implement retry mechanisms

3. **Initialization sequence**
   - Enforce strict order of operations
   - Add checkpoint verification
   - Prevent premature access

4. **CRDT compliance**
   - Remove any time-based workarounds
   - Respect Merkle tree ordering
   - Follow one.leute reference implementation

## Implementation Plan

### Diagnostic Tools
1. Create a `ChannelDiagnostic` class that can:
   - Capture snapshots of channel state
   - Compare in-memory vs storage state
   - Log details of operations

2. Add trace points in:
   - `LLMManager.ts`: All channel operations
   - `ChannelManager.js`: All critical methods
   - `AppModel.ts`: Initialization sequence

3. Add verification tools:
   - Check channel exists after creation
   - Verify object exists after storage
   - Confirm events trigger properly

### Validation Tests
1. Create simple test scripts for:
   - Channel creation and validation
   - Object storage and retrieval
   - Event propagation

2. Compare with one.leute:
   - Run the same operations
   - Record and compare behaviors
   - Identity divergence points

### Possible Fixes

#### Initial approach (no architectural changes):
1. Stabilize channel ID usage
2. Add verification of channel operations
3. Enforce initialization sequence
4. Remove conflicting workarounds

#### If simple fixes don't resolve:
1. Consider direct port from one.leute
2. Investigate storage layer issues
3. Re-implement channel event system

## Success Criteria
1. LLM objects consistently retrievable after storage
2. Channel events trigger appropriately
3. No divergence between memory and storage state
4. System behavior matches one.leute reference 