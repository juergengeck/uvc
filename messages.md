# Message Signature System (Verifiable Credentials)

## Important Distinction

This document covers **Message Signatures** - verifiable credentials for individual messages. This is separate from the ONE platform's **Certificate System** used for trust management (see one-certificates-to-vc.md).

## Overview
This document describes the verifiable credentials system for chat messages in our app, which extends the one.leute reference implementation with cryptographic message signatures.

## Architecture Overview

### Base ONE Platform Security
- **Identity chain of trust**: Person objects with Ed25519 signing keys
- **Channel authentication**: Only authorized participants can post
- **Object storage integrity**: Private keys required to store objects
- **P2P trust network**: CHUM protocol ensures trusted message sync

### Why Not Per-Message Signatures?
The ONE platform already provides authentication through:
1. Secure channel establishment during pairing
2. Trust relationships between Person identities
3. Object-level security in the storage layer

Per-message signatures would be wasteful due to:
- Redundant cryptography (channel already authenticated)
- Storage overhead (~64 bytes per signature)
- Computational cost and battery drain

## Verifiable Credentials Implementation

### Message Verifiable Credential Structure
For cases where verifiable credentials are needed, we implement efficient signature storage:

```typescript
// Claims for a chat message VC
const messageClaims = {
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  type: ['VerifiableCredential', 'ChatMessageCredential'],
  issuer: senderPersonIdHash,
  issuanceDate: timestamp,
  credentialSubject: {
    // Core claims
    inReplyTo: previousMessageHash,  // Links to previous message
    messageHash: currentMessageHash, // SHA256 of ChatMessage
    author: senderPersonIdHash,
    
    // Context
    channel: channelIdHash,
    topic: topicIdHash,
    timestamp: Date.now()
  }
};
```

### Efficient Storage Approach
Instead of storing the entire VC, we store only the signature:

```typescript
// MessageSignature object (stored in ONE)
interface MessageSignature {
  $type$: 'MessageSignature';
  sig: string;              // Base64 Ed25519 signature
  timestamp: number;        // Message timestamp
  previousHash?: string;    // Previous message hash (for chain)
  signatureType: 'system' | 'user' | 'ai';
}
```

### VC Reconstruction
The full verifiable credential can be reconstructed when needed:
1. Load the message and its signature attachment
2. Rebuild the claims from message data
3. Attach the stored signature as proof
4. Verify using sender's public key

## Implementation Details

### Message Creation Flow
```typescript
// 1. Create message
const message = {
  $type$: 'ChatMessage',
  text: messageText,
  sender: senderIdHash,
  attachments: []
};

// 2. Create signature for VC claims
const claims = {
  issuer: senderIdHash,
  credentialSubject: {
    inReplyTo: previousMessageHash,
    messageHash: sha256(message),
    timestamp: Date.now()
  }
};

// 3. Sign and store
const signature = nacl.sign.detached(
  sha256(canonicalize(claims)), 
  signKey.privateKey
);

const sigObject = {
  $type$: 'MessageSignature',
  sig: base64(signature),
  timestamp: claims.credentialSubject.timestamp,
  previousHash: previousMessageHash,
  signatureType: 'user'
};

const sigHash = await storeUnversionedObject(sigObject);
message.attachments.push(sigHash);

// 4. Post message to channel
await channelManager.postToChannel(channelIdHash, message);
```

### Signature Verification Flow
```typescript
// 1. Load message and signature
const message = await getObject(messageHash);
const sigObject = await getObject(message.attachments[0]);

// 2. Reconstruct claims
const claims = {
  issuer: message.sender,
  credentialSubject: {
    inReplyTo: sigObject.previousHash,
    messageHash: messageHash,
    timestamp: sigObject.timestamp
  }
};

// 3. Verify signature
const person = await Person.getById(message.sender);
const isValid = nacl.sign.detached.verify(
  sha256(canonicalize(claims)),
  base64Decode(sigObject.sig),
  person.signKey.publicKey
);
```


## Key Differences

| Aspect | one.leute | Our App |
|--------|-----------|---------|
| Certificate Creation | Post-message, optional | During message creation |
| Certificate Storage | Separate trust system | In message attachments |
| Certificate Types | Generic certificates | System/User/AI specific |
| Implementation | No MessageSignature type | Custom MessageSignature type |
| Attachment Usage | File/image attachments only | Mixed certificates and files |

## Root Cause of SignaturesScreen Error

The `FileNotFoundError` occurs because:
1. Messages are created with fake certificate hashes in their attachments
2. SignaturesScreen tries to load these hashes as real objects using `getObject()`
3. Since these hashes don't correspond to any stored objects, the load fails

## Recommendations

### Option 1: Remove Certificate System
Align with one.leute by removing the certificate system entirely. Messages would be sent without certificates.

### Option 2: Fix Certificate Implementation
1. Always use `createMessageWithCertificate()` variants that store real MessageSignature objects
2. Ensure MessageSignature recipe is properly registered before use
3. Update all message creation code to use the proper approach
4. Add migration for existing messages with fake certificates

### Option 3: Simplify Certificate Detection
Instead of trying to load certificates as objects, treat them as identifiers:
1. Check if attachment hash matches known certificate patterns
2. Display certificate type based on hex prefix
3. Don't attempt to load non-existent objects

## Technical Details

### Message Storage Flow
1. ChatMessage object is created
2. Message is posted to channel via `channelManager.postToChannel()`
3. Message gets wrapped in CreationTime object
4. CreationTime object gets wrapped in LinkedListEntry
5. Entry is added to the channel's linked list
6. The message's content hash (dataHash) is used as its identifier

### Why Messages Can Be Loaded
When navigating to SignaturesScreen with a message hash:
- The hash is the content hash of the ChatMessage object
- This object exists in ONE storage and can be retrieved with `getObject(hash)`
- However, the certificate hashes in attachments are fake and can't be loaded

## Conclusion

Our app has diverged from the one.leute reference implementation by adding an automatic certificate system that creates fake certificate hashes. This causes the SignaturesScreen to fail when trying to load these non-existent objects. We need to either properly implement certificate storage or simplify the system to not require loading certificate objects.