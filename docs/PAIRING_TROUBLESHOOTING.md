# Pairing Troubleshooting Guide

## Overview

This guide helps diagnose and resolve pairing issues between lama.one and edda.one devices.

## Common Issues and Solutions

### 1. Connection Stalls at "Phase 1.1: wait for communication_request"

**Symptoms:**
- ConnectionSetup logs show: `Phase 1.1: wait for communication_request`
- No further progress in pairing
- edda.one doesn't appear in contacts

**Cause:** 
The `communication_request` message is being consumed by CommunicationServerListener instead of reaching ConnectionSetup.

**Solution:**
Ensure the connection handover fix is properly applied. See `docs/CONNECTION_HANDOVER_FIX.md` for details.

**Verification:**
Look for these log messages:
```
🐛 [CommunicationServerListener] 1: Step 6: Connection ready for pairing - emitting for protocol
🐛 [CommunicationServerListener] 1: Emitting underlying connection object for pairing
```

### 2. Clipboard Contains Raw Token Data

**Symptoms:**
- Clipboard shows: `token;publicKey` format instead of invitation URL
- Cannot test pairing because invitation URL is corrupted

**Cause:**
Debug functions or timing issues are interfering with clipboard operations.

**Diagnosis:**
1. Check for automatic debug function calls in console
2. Look for multiple clipboard operations happening simultaneously
3. Verify invitation generation logs show proper URL format

**Solution:**
1. Ensure debug functions are not called automatically
2. Use QR code instead of clipboard for testing
3. Check for race conditions in clipboard operations

### 3. WebSocket Suspension Errors

**Symptoms:**
- Frequent "WebSocket is closed due to suspension" errors
- Connections fail during app backgrounding

**Cause:**
Normal mobile app lifecycle events being treated as errors.

**Solution:**
The NetworkPlugin fix handles this gracefully:
- 🟡 Normal suspensions are logged as info
- 🔴 Actual errors are logged as errors

**Verification:**
Look for appropriate log levels:
```
[NetworkPlugin] 🟡 Connection conn-xxx suspended (normal): WebSocket is closed due to suspension.
```

### 4. PromisePlugin Errors

**Symptoms:**
- Error: "promisePlugin() is not a function"
- Pairing fails after successful handover

**Cause:**
Wrong connection object being passed to pairing protocol.

**Solution:**
Ensure the underlying Connection object is emitted, not the wrapper:
```javascript
listenerInstance.onConnection.emit(connection.connection); // ✅ Correct
listenerInstance.onConnection.emit(connection);           // ❌ Wrong
```

### 5. Connection Handover Stuck (RESOLVED)

**Symptoms**:
- Connections receive `connection_handover` message but don't proceed
- Logs show "Step 5: Wait for connection_handover message" indefinitely
- No progression to access/chum protocol

**Diagnosis**:
```bash
# Check connection logs in app console
# Look for double consumption of communication_request
```

**Solution**: Fixed in CommunicationServerListener.js - removed double message consumption.

### 6. Person ID Shows All Zeros (RESOLVED)

**Symptoms**:
```
Remote Person: 0000000000000000000000000000000000000000000000000000000000000000
Unable to start chum because you are unknown
```

**Root Cause**: `knownPeerMap` in `LeuteConnectionsModule` not populated with newly paired peer.

**Diagnosis Steps**:
1. Check `connectionsInfo()` output after pairing
2. Look for person ID with all zeros instead of actual hash
3. Verify if `findAllOneInstanceEndpointsForOthers()` returns endpoints for paired person

**Technical Analysis**:
- `connectionsInfo()` returns `peerInfo ? peerInfo.personId : dummyPersonId`
- `dummyPersonId = '0'.repeat(64)` (all zeros)
- `knownPeerMap` populated only in `setupRoutesForOneInstanceEndpoint()`
- Called from `updateCache()` → `fetchOtherOneInstanceEndpointsFromLeute()` → `findAllOneInstanceEndpointsForOthers()`
- Issue: Profile created during pairing had empty contacts `[]` instead of OneInstanceEndpoint

**Solution Applied**:
Modified `LeuteAccessRightsManager.trustPairingKeys()` to include OneInstanceEndpoint in profile:

```typescript
const oneInstanceEndpoint = {
    $type$: 'OneInstanceEndpoint' as const,
    personId: remotePersonId,
    url: 'wss://commserver.edda.one',
    instanceId: _remoteInstanceId,
    instanceKeys: keys[0],
    personKeys: keys[0]
};

const profile = await ProfileModel.constructWithNewProfile(
    remotePersonId,
    localPersonId,
    'default',
    [oneInstanceEndpoint], // Include OneInstanceEndpoint
    [signKey]
);
```

**Verification**:
After fix, `connectionsInfo()` should show actual person ID instead of zeros.

### 7. Clipboard Corruption

**Symptoms**:
- Invitation URLs appear as raw token data
- Format: `token;publicKey` instead of proper URL

**Diagnosis**:
```bash
# Check debug.ts for combinedRaw format creation
grep -r "combinedRaw" src/config/
```

**Solution**: Remove debug code creating raw format, use clean invitation URL generation.

### 8. WebSocket Ping/Pong Errors

**Symptoms**:
```
SyntaxError: Unexpected token 'p', 'ping' is not valid JSON
```

**Diagnosis**:
- CommServer sends raw "ping" strings for keepalive
- WebSocketPlugin tries to parse as JSON

**Solution**: Filter ping/pong messages in WebSocketPlugin before JSON parsing.

### 9. Connection Spam

**Symptoms**:
- 47+ rapid connection attempts
- Connection refused errors
- Rate limiting issues

**Solution**: 
- Disable `establishOutgoingConnections` in ConnectionsModel config
- Use single managed connection through TransportManager

## Diagnostic Steps

### 1. Check Connection Flow

Monitor logs for this sequence:

1. **Connection Establishment:**
   ```
   🐛 [CommunicationServerListener] 1: Step 1: Send 'register' message
   🐛 [CommunicationServerListener] 1: Step 2: Wait for authentication_request
   🐛 [CommunicationServerListener] 1: Step 3: Send authentication_response message
   🐛 [CommunicationServerListener] 1: Step 4: Wait for authentication_success message
   🐛 [CommunicationServerListener] 1: Step 5: Wait for connection_handover message
   ```

2. **Handover Process:**
   ```
   🐛 [CommunicationServerListener] 1: Received connection_handover message
   🐛 [CommunicationServerListener] 1: Step 6: Connection ready for pairing - emitting for protocol
   ```

3. **Pairing Protocol:**
   ```
   🐛 [ConnectionSetup] 1: Phase 1.1: wait for communication_request
   🐛 [ConnectionSetup] 1: Phase 1.2: send communication_ready
   🐛 [ConnectionSetup] 1: Phase 2: exchange keys
   ```

4. **Success:**
   ```
   🔥 [PairingManager] 1: acceptInvitation: startPairingProtocol - success
   🔐 [LeuteAccessRightsManager] ✅ Pairing trust established
   [useNetworkSettings] Loaded Someone connections via LeuteModel: 1
   ```

### 2. Verify Configuration

Check ConnectionsModel configuration:
```
🔥 [ConnectionsModel] 🔍 PAIRING ROUTE GROUP ENABLED - pairing protocol will work
🔥 [ConnectionsModel] 🔧 ROUTE GROUPS CONFIGURED: chum, debug, pairing
```

### 3. Test Invitation Generation

Verify invitation creation:
```
🔍 [PUBLIC_KEY_DEBUG] Invitation created with publicKey: [key]
🔍 [PUBLIC_KEY_DEBUG] Invitation token: [token]
🔍 [PUBLIC_KEY_DEBUG] Invitation URL: wss://comm10.dev.refinio.one
```

## Debug Functions

Use these global debug functions for testing:

### Basic Diagnostics
```javascript
// Check initialization status
checkInitState()

// Quick invitation test
await quickInviteTest()

// Test raw invitation data
await testRawInvitation()
```

### Advanced Testing
```javascript
// Inspect pairing configuration
inspectPairing()

// Test pairing protocol
await testPairingProtocol(url)

// Test both directions
await testBothPairingDirections()
```

## Log Analysis

### Success Pattern
```
[CommunicationServerListener] Received connection_handover message
[CommunicationServerListener] Emitting connection for pairing protocol
[ConnectionSetup] Phase 1.1: wait for communication_request
[ConnectionSetup] Phase 1.2: send communication_ready
[ConnectionSetup] Phase 2: exchange keys
[PairingManager] acceptInvitation: startPairingProtocol - success
[LeuteAccessRightsManager] ✅ Pairing trust established
[useNetworkSettings] Loaded Someone connections via LeuteModel: 1
```

### Failure Pattern (Before Fix)
```
[CommunicationServerListener] Received connection_handover message
[CommunicationServerListener] Received communication_request - ready for pairing  ❌
[ConnectionSetup] Phase 1.1: wait for communication_request
[ConnectionSetup] ⏰ STALLS HERE - never receives message ❌
```

## Environment Variables

Useful debug environment variables:
```javascript
DEBUG=chum:*,pairing:*,communication:*,commserver:*
ONE_MODELS_DEBUG=true
ONE_PAIRING_DEBUG=true
PAIRING_TOKEN_DEBUG=true
ONE_MODELS_BUS_DEBUG=true
```

## Network Requirements

Ensure proper network configuration:
- CommServer URL: `wss://comm10.dev.refinio.one`
- WebSocket connections allowed
- No firewall blocking WebSocket traffic
- Stable network connection during pairing

## Recovery Steps

If pairing fails:

1. **Restart App**: Close and reopen both apps
2. **Clear State**: Log out and log back in
3. **Network Reset**: Switch networks or restart network connection
4. **Generate New Invitation**: Create fresh invitation URL
5. **Check Logs**: Look for specific error patterns above

## Prevention

To avoid pairing issues:

1. **Stable Network**: Ensure good network connectivity
2. **Foreground Apps**: Keep both apps in foreground during pairing
3. **Fresh Invitations**: Use recently generated invitations
4. **QR Codes**: Prefer QR codes over clipboard for reliability

## When to Seek Help

Contact development team if:
- Pairing consistently fails with same error pattern
- New error patterns not covered in this guide
- Performance degradation in pairing success rate
- Suspected infrastructure issues with CommServer

Include in your report:
- Complete log sequence from invitation generation to failure
- Device types and OS versions
- Network configuration details
- Steps to reproduce the issue 