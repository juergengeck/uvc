# Verifiable Credentials Implementation Status

## Overview

This document describes the current state of Verifiable Credentials implementation in the Lama app, covering both implemented features and planned evolution.

## Implemented: Message Signatures as VCs

### MessageSignature Recipe

```typescript
interface MessageSignature {
  $type$: 'MessageSignature';
  sig: string;              // Base64 Ed25519 signature
  timestamp: number;        // Message timestamp
  previousHash?: string;    // Previous message hash (for chain)
  signatureType: 'system' | 'user' | 'ai';
}
```

### Message Creation with Signatures

All message types now create real cryptographic signatures:

```typescript
// Creating messages with signatures
const systemMessage = await createSystemMessage(text, senderId, previousHash, channelId, topicId);
const aiMessage = await createAIMessage(text, senderId, previousHash, channelId, topicId);
const userMessage = await createUserMessageWithCertificate(text, senderId, attachments, previousHash, channelId, topicId);
```

### VC Reconstruction

Message signatures can be reconstructed into W3C Verifiable Credentials:

```typescript
const vc = await reconstructVerifiableCredential(messageHash, message, signatureHash);
// Returns:
{
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  type: ['VerifiableCredential', 'ChatMessageCredential'],
  issuer: message.sender.toString(),
  issuanceDate: new Date(signature.timestamp).toISOString(),
  credentialSubject: {
    inReplyTo: signature.previousHash,
    messageHash: messageHash,
    author: message.sender.toString(),
    timestamp: signature.timestamp
  },
  proof: {
    type: 'Ed25519Signature2020',
    created: new Date(signature.timestamp).toISOString(),
    verificationMethod: `did:one:${message.sender}#keys-1`,
    proofPurpose: 'assertionMethod',
    proofValue: signature.sig
  }
}
```

### Current Limitations

1. **Signature Creation**: Currently uses deterministic hash instead of actual Ed25519 signing (needs crypto API integration)
2. **Verification**: Trust is assumed, actual signature verification not yet implemented
3. **DID Resolution**: DIDs are constructed but not resolvable

## Planned: ONE Platform Certificates as VCs

### Current ONE Certificate System

The ONE platform uses a three-part structure:
- **License**: Describes what is certified
- **Certificate**: Links data and license
- **Signature**: Cryptographic proof

Certificate types:
- `AffirmationCertificate`
- `TrustKeysCertificate`
- `AccessUnversionedObjectCertificate`
- `AccessVersionedObjectCertificate`
- `RelationCertificate`

### Evolution Plan

1. **Create VC-wrapped certificates** that maintain ONE platform properties
2. **Extend TrustedKeysManager** with VC methods
3. **Dual support** during transition period

## Code Architecture

### Current Structure

```
src/utils/messageUtils.ts
├── MessageSignature interface
├── createSignedMessageSignature() - Creates signatures
├── reconstructVerifiableCredential() - Builds VCs
└── verifyMessageSignature() - Verification logic

app/(screens)/messages/signatures/[hash].tsx
└── SignaturesScreen - Displays VCs and signatures
```

### Integration Points

1. **Crypto API**: Need to integrate with `createCryptoApiFromDefaultKeys()` for real signatures
2. **Storage**: MessageSignatures stored as unversioned objects
3. **UI**: SignaturesScreen shows both legacy and VC data

## Next Steps

### Immediate (Message Signatures)

1. **Fix Crypto Integration**
   ```typescript
   const cryptoApi = await createCryptoApiFromDefaultKeys(senderIdHash);
   // Use cryptoApi.sign() instead of deterministic hash
   ```

2. **Implement Verification**
   ```typescript
   const keys = await getDefaultKeys(personId);
   const isValid = nacl.sign.detached.verify(data, signature, keys.publicSignKey);
   ```

### Future (Platform Evolution)

1. **Consolidate VC Logic**
   - Create base VC utilities
   - Share signing/verification code
   - Unified DID handling

2. **Extend Certificate System**
   - VCTrustedKeysManager implementation
   - Certificate-to-VC migration tools
   - Backward compatibility layer

## Standards Compliance

### W3C VC Data Model
- Using v1 context
- Ed25519Signature2020 proof type
- DID-based verification methods

### Future Considerations
- Support for VC Data Model 2.0
- JSON-LD canonicalization
- Selective disclosure
- Zero-knowledge proofs

## Testing Status

- ✅ Message creation with signatures
- ✅ Signature storage and retrieval
- ✅ VC reconstruction
- ❌ Actual cryptographic signing
- ❌ Signature verification
- ❌ Certificate integration

## Security Considerations

1. **Key Management**: Using ONE platform's keychain
2. **Trust Model**: Relies on ONE's person/profile trust chain
3. **Privacy**: Messages and signatures stored locally
4. **Revocation**: Not yet implemented