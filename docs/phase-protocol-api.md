# Lama Protocol API Reference

This document provides a comprehensive reference for the network protocol implementation in Lama, tracing the exact message flow and API calls.

## Protocol Stack Overview

```
Application Layer (UI/Components)
    ↓
Transport Manager (connection coordination)
    ↓
Comm-Server Transport (WebSocket wrapper)
    ↓
Network Plugin (encryption/fragmentation)
    ↓
WebSocket Connection (to edda.one comm-server)
```

## Phase 1: Comm-Server Protocol

### 1.1 Registration Phase
**Purpose:** Register instance with comm-server

**Message Flow:**
```
Lama → Comm-Server: registration_request
{
  "command": "registration_request",
  "publicKey": "<instance-public-key-hex>",
  "signature": "<registration-signature>"
}

Comm-Server → Lama: registration_response
{
  "command": "registration_response", 
  "success": true
}
```

**Implementation:** `RegistrationPhase.execute()`

### 1.2 Authentication Phase  
**Purpose:** Authenticate with comm-server using instance keys

**Message Flow:**
```
Lama → Comm-Server: authentication_request
{
  "command": "authentication_request",
  "publicKey": "<instance-public-key-hex>",
  "challenge": "<encrypted-challenge>"
}

Comm-Server → Lama: authentication_response
{
  "command": "authentication_response",
  "success": true,
  "sessionToken": "<session-token>"
}
```

**Implementation:** `AuthenticationPhase.execute()`

### 1.3 Encryption Phase
**Purpose:** Establish encrypted WebSocket connection

**API Calls:**
```typescript
// Add encryption plugin to connection
const encryptionPlugin = new EncryptionPlugin(instanceKeys);
networkPlugin.addPlugin(encryptionPlugin);
```

**Result:** All subsequent messages are automatically encrypted/decrypted

## Phase 2: Communication Handshake

### 2.1 Communication Request (Browser → Lama)
**Trigger:** Browser scans QR code and connects

**Message Flow:**
```
Browser → Lama: communication_request
{
  "command": "communication_request",
  "sourcePublicKey": "<browser-instance-key>",
  "targetPublicKey": "<lama-instance-key>"
}

Lama → Browser: communication_ready  
{
  "command": "communication_ready"
}
```

**Implementation:** `ProtocolFlowManager.handleCommunicationRequest()`

## Phase 3: Person/Instance Exchange

### 3.1 Person ID Exchange
**Purpose:** Exchange and verify person identities

**API Call:**
```typescript
const personInfo = await verifyAndExchangePersonId(
  appModel.leuteModel,
  connectionWrapper, 
  myPersonId,
  true, // initiatedLocally = true (respond to challenge first)
  null  // matchRemotePersonId = null (unknown person)
);
```

**Internal Message Flow:**
```
1. Lama → Browser: person_id_object (JSON)
   {
     "command": "person_id_object",
     "obj": { /* Person object */ }
   }

2. Browser → Lama: person_id_object (JSON)
   {
     "command": "person_id_object", 
     "obj": { /* Person object */ }
   }

3. Lama → Browser: keys_object (JSON)
   {
     "command": "keys_object",
     "obj": { /* Keys object */ }
   }

4. Browser → Lama: keys_object (JSON)
   {
     "command": "keys_object",
     "obj": { /* Keys object */ }
   }

5. Browser → Lama: <72-byte binary challenge>
   (encrypted challenge using person keys)

6. Lama → Browser: <binary response>
   (decrypted challenge with bits negated, re-encrypted)

7. Lama → Browser: <binary challenge>
   (our challenge to browser)

8. Browser → Lama: <binary response>
   (browser's response to our challenge)
```

**Key Details:**
- `initiatedLocally = true` means we respond to challenge first, then send our challenge
- Binary challenges use person keys, not instance keys
- Challenge/response uses `tweetnacl.randomBytes(64)` with bit negation

### 3.2 Instance ID Exchange
**Purpose:** Exchange instance information

**API Call:**
```typescript
const instanceInfo = await exchangeInstanceIdObjects(connectionWrapper, myInstanceId);
```

**Internal Message Flow:**
```
Lama → Browser: instance_id_object (JSON)
{
  "command": "instance_id_object",
  "obj": { /* Instance object */ }
}

Browser → Lama: instance_id_object (JSON)
{
  "command": "instance_id_object",
  "obj": { /* Instance object */ }
}
```

## Phase 4: Pairing Protocol

### 4.1 Handoff to ConnectionsModel
**Purpose:** Route connection to one.models pairing system

**API Call:**
```typescript
await appModel.connections.onUnknownConnection(
  connectionWrapper,
  myPersonId,
  myInstanceId, 
  personInfo.personId,        // resolved from person exchange
  instanceInfo.remoteInstanceId, // resolved from instance exchange
  false, // isOutgoing = false (incoming connection)
  'pairing' // connectionRoutesGroupName
);
```

**Internal Flow:**
1. `ConnectionsModel.onUnknownConnection()` routes to pairing based on `connectionRoutesGroupName`
2. Calls `PairingManager.acceptInvitation()`
3. PairingManager performs remaining pairing protocol

### 4.2 PairingManager Protocol
**Purpose:** Complete pairing with authentication tokens and identity exchange

**Message Flow (handled by one.models):**
```
Browser → Lama: authentication_token
{
  "command": "authentication_token",
  "token": "<pairing-token>"  
}

Lama → Browser: identity
{
  "command": "identity",
  "identity": { /* identity object */ }
}

Browser → Lama: identity  
{
  "command": "identity",
  "identity": { /* identity object */ }
}

// Additional pairing messages as defined by one.models PairingManager
```

## Connection Wrapper Interface

The `connectionWrapper` implements the interface expected by one.models:

```typescript
interface ConnectionWrapper {
  id: string;
  send: (data: any) => Promise<void>;
  close: (reason?: string) => void;
  remoteAddress: string;
  isConnected: boolean;
  
  // Required by one.models protocols
  promisePlugin: () => {
    waitForJSONMessageWithType: (command: string, typeField?: string) => Promise<any>;
    waitForBinaryMessage: () => Promise<ArrayBuffer>;
  };
  
  // Event handling
  on: (event: string, callback: Function) => void;
  off: (event: string, callback: Function) => void;
}
```

## Error Handling

### Common Errors and Solutions

1. **"Received message that is not a binary message"**
   - **Cause:** Browser expects binary response but receives JSON
   - **Solution:** Ensure `initiatedLocally` parameter is correct in `verifyAndExchangePersonId()`

2. **"No raw connection available"**
   - **Cause:** Connection closed before handoff to ConnectionsModel
   - **Solution:** Check connection state and ensure proper error handling

3. **"Cannot read property 'listen' of undefined"**
   - **Cause:** ConnectionsModel not properly initialized
   - **Solution:** Ensure `allowPairing: true` in ConnectionsModel config

## Future: Chum Sync Protocol

After successful pairing, ongoing data sync uses:

```typescript
// For known connections (already paired)
await appModel.connections.onKnownConnection(
  connectionWrapper,
  myPersonId,
  myInstanceId,
  knownPersonId,
  knownInstanceId, 
  false, // isOutgoing
  'chum'  // connectionRoutesGroupName = 'chum'
);
```

This routes to chum sync protocols instead of pairing protocols.

## Reference Implementations

- **Browser (edda.one):** `one.core/src/system/browser/`
- **LeuteConnectionsModule:** `one.models/lib/misc/ConnectionEstablishment/LeuteConnectionsModule.js`
- **Person ID Exchange:** `one.models/lib/misc/ConnectionEstablishment/protocols/ExchangePersonIds.js`
- **Instance ID Exchange:** `one.models/lib/misc/ConnectionEstablishment/protocols/ExchangeInstanceIds.js`
- **PairingManager:** `one.models/lib/misc/ConnectionEstablishment/PairingManager.js`

---

*Last updated: 2025-01-15* 