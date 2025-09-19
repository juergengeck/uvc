# Lama Pairing Protocol Challenge

## Current Issue
The pairing protocol between lama and edda.one is failing. When an invitation URL is pasted into edda.one, no pairing messages are exchanged and the connection fails.

## What Works ✅
- **Invitation generation**: lama creates valid invitation URLs with tokens
- **CommServer connections**: WebSocket connections establish successfully
- **Connection handover**: Connection 1 receives handover message properly
- **ConnectionsModel infrastructure**: Online state, basic configuration all correct

## What Doesn't Work ❌
- **Pairing API mismatch**: `connectionsModel.connectUsingInvitation` is `undefined`
- **Missing pairing methods**: `connectionsModel.pairing.getActiveInvitations` is not a function
- **No pairing protocol messages**: No `communication_request` → `communication_ready` exchange

## Root Cause Analysis
The ConnectionsModel pairing API structure is different from what we expected:

```javascript
// EXPECTED (but doesn't exist):
connectionsModel.connectUsingInvitation(invitation)
connectionsModel.pairing.getActiveInvitations()

// ACTUAL (unknown structure):
connectionsModel.pairing = { /* unknown API */ }
```

## Evidence
- InviteManager successfully calls pairing methods, so they exist somewhere
- Debug shows `connectUsingInvitation: undefined` and `getActiveInvitations is not a function`
- ConnectionsModel has `pairing` property but wrong method structure

## Next Steps
1. **Inspect actual ConnectionsModel API** to find correct method paths
2. **Compare with one.leute reference** to see proper usage pattern
3. **Fix API calls** to use correct method structure
4. **Test pairing protocol** end-to-end

## Key Insight
The issue is **API structure mismatch**, not connection or infrastructure problems. All underlying systems work - we just need to call the right methods on the right objects. 

# Connection Protocol Reference

## Message Types

The communication server protocol defines the exact message format used between clients and the CommServer.

**Reference File:** `node_modules/@refinio/one.models/lib/misc/ConnectionEstablishment/communicationServer/CommunicationServerProtocol.d.ts`

### Client → Server Messages:
- `register` - Register with public key
- `authentication_response` - Response to challenge  
- `comm_pong` - Keep-alive response
- `communication_request` - Request to connect to another client

### Server → Client Messages:
- `authentication_request` - Challenge for authentication
- `authentication_success` - Confirms successful auth + ping interval
- `connection_handover` - Signals incoming connection handover
- `comm_ping` - Keep-alive ping

### Protocol Flow:
1. Client sends `register` with publicKey
2. Server responds with `authentication_request` + challenge
3. Client sends `authentication_response` with signed challenge
4. Server confirms with `authentication_success` + ping interval
5. Connection becomes a "spare connection" waiting for handover
6. When another client connects, server sends `connection_handover`

### Key Insight:
All messages are JSON with a `command` field. CommServer closes connections that send non-JSON messages with "Received message that does not conform to JSON" error. 