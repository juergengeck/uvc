# Critical Architecture Fix: Duplicate Connection Issue Resolved

## Problem Analysis

The lama app was failing during pairing with the error "No listening connection for the specified publicKey" because of a **fundamental architecture flaw**: we were creating **two separate WebSocket connections** to the CommServer with the same identity.

### Root Cause: Duplicate Connections

1. **CommServerManager** was creating its own WebSocket connection
2. **ConnectionsModel** was creating its own WebSocket connection  
3. Both used the same `publicKey` and `instanceId`
4. CommServer got confused and only sent handover to one connection (ConnectionsModel)
5. When edda.one tried to pair back, CommServer couldn't route to the correct listening connection

### Wire Protocol Evidence

From the logs, we could see:
- **Connection 1 (CommServerManager)**: ✅ Authenticated successfully, ❌ Never received handover
- **Connection 2 (ConnectionsModel)**: ✅ Authenticated successfully, ✅ Received handover

The CommServer was treating both as the same client and only sending handover messages to one.

## Architecture Fix

### Before (BROKEN)
```
CommServerManager ──┐
                    ├─── CommServer (confused by duplicate identity)
ConnectionsModel ───┘
```

### After (FIXED)
```
CommServerManager ──manages──> ConnectionsModel ──── CommServer
                                    │
                                    └── Handles ALL protocol
```

### Implementation Changes

1. **CommServerManager**: Converted from WebSocket connection creator to configuration/management layer
2. **ConnectionsModel**: Remains the single source of truth for CommServer protocol
3. **TransportManager**: Properly connects CommServerManager to ConnectionsModel

### Key Code Changes

**CommServerManager.ts**: Removed all WebSocket connection code, now purely manages ConnectionsModel
**TransportManager.ts**: Added `commServerManager.setConnectionsModel(connectionsModel)` to establish proper relationship

## Result

✅ **Single Connection**: Only ConnectionsModel creates CommServer connections
✅ **Proper Handover**: CommServer sends handover to the correct connection  
✅ **Working Pairing**: "No listening connection for the specified publicKey" error eliminated
✅ **Clean Architecture**: CommServerManager manages, ConnectionsModel executes

## Protocol Flow (Fixed)

1. ConnectionsModel connects to CommServer
2. ConnectionsModel authenticates 
3. ConnectionsModel receives handover
4. ConnectionsModel sets up listening for pairing connections
5. Pairing protocol works correctly

The fix eliminates the architectural conflict that was causing the CommServer to reject pairing connections. 