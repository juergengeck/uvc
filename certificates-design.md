# Certificate System Design for Lama App

## Overview

This document outlines the design for implementing a proper certificate system that aligns with the ONE platform architecture while enabling future W3C Verifiable Credentials.

## Current State Analysis

### ONE Platform Certificate Architecture

The ONE platform implements certificates as a three-part structure:
1. **License** - Describes what the certificate grants/affirms
2. **Certificate** - References the data being certified and the license
3. **Signature** - Cryptographic proof from the issuer

Key certificate types in ONE:
- `AffirmationCertificate` - Affirms data accuracy
- `TrustKeysCertificate` - Verifies key ownership
- `AccessUnversionedObjectCertificate` - Grants access rights
- `RelationCertificate` - Establishes relationships

### Our Current Implementation

We created a `MessageSignature` type that stores:
- Ed25519 signature
- Timestamp
- Previous message hash (for chaining)
- Signature type (system/user/ai)

This is stored in message attachments but doesn't follow the ONE certificate pattern.

## Proposed Design

### Phase 1: Align with ONE Certificate System

1. **Use AffirmationCertificate for Messages**
   - Messages remain unchanged (standard ChatMessage objects)
   - Create AffirmationCertificates that reference the message hash
   - Store certificate hash in a dedicated message metadata field (not attachments)

2. **Certificate Creation Flow**
   ```typescript
   // When sending a message
   const message = createChatMessage(text, sender);
   const messageHash = await storeMessage(message);
   
   // Create affirmation certificate
   const certificate = await trustedKeysManager.certify(
     'AffirmationCertificate',
     { data: messageHash },
     senderPersonId
   );
   
   // Store certificate reference with message metadata
   await storeMessageMetadata(messageHash, {
     certificateHash: certificate.certificateHash,
     inReplyTo: previousMessageHash
   });
   ```

3. **Message Types via Metadata**
   - System messages: Add metadata flag `isSystem: true`
   - AI messages: Add metadata flag `isAI: true`
   - User messages: Default (no special flags)

### Phase 2: Enable Verifiable Credentials

1. **Extend Certificate with VC Data**
   - Create custom certificate type: `VerifiableCredentialCertificate`
   - Include W3C VC context in the license
   - Map ONE certificate fields to VC structure

2. **VC Reconstruction**
   ```typescript
   async function reconstructVC(certificateHash: SHA256Hash): VerifiableCredential {
     const cert = await getCertificate(certificateHash);
     const license = await getLicense(cert.licenseHash);
     const signature = await getSignature(cert.signatureHash);
     
     return {
       '@context': ['https://www.w3.org/2018/credentials/v1'],
       type: ['VerifiableCredential', 'ChatMessageCredential'],
       issuer: signature.issuer,
       issuanceDate: new Date(signature.timestamp).toISOString(),
       credentialSubject: {
         messageHash: cert.data,
         ...license.additionalData
       },
       proof: {
         type: 'Ed25519Signature2020',
         created: new Date(signature.timestamp).toISOString(),
         verificationMethod: `did:one:${signature.issuer}#keys-1`,
         proofValue: signature.signature
       }
     };
   }
   ```

### Phase 3: Migration Strategy

1. **Support Both Systems During Transition**
   - Check for both MessageSignature attachments and certificate metadata
   - New messages use certificates
   - Old messages display with legacy indicator

2. **Gradual Migration**
   - Update message creation to use certificates
   - Update SignaturesScreen to show both types
   - Eventually deprecate MessageSignature

## Benefits of This Approach

1. **Alignment with ONE Platform**
   - Uses existing TrustedKeysManager infrastructure
   - Follows established certificate patterns
   - Leverages existing trust chains

2. **Future-Ready for VCs**
   - Certificate structure maps cleanly to W3C VCs
   - Maintains cryptographic properties
   - Enables interoperability

3. **Backward Compatibility**
   - Messages remain unchanged
   - Certificates are separate objects
   - Can support legacy messages

4. **Proper Separation of Concerns**
   - Messages contain content
   - Certificates provide trust assertions
   - Metadata links them together

## Implementation Steps

1. Import and initialize TrustedKeysManager in AppModel
2. Create message metadata storage system
3. Update message creation functions to create certificates
4. Update UI to show certificate status
5. Implement VC reconstruction utilities
6. Migrate SignaturesScreen to show certificates

## Key Differences from Current Implementation

| Aspect | Current (MessageSignature) | Proposed (Certificates) |
|--------|---------------------------|------------------------|
| Storage | In message attachments | Separate certificate objects |
| Structure | Single object | License + Certificate + Signature |
| Trust | Direct signature | Trust chain via TrustedKeysManager |
| Standards | Custom format | ONE platform standard |
| VC Support | Manual reconstruction | Native mapping |

## Next Steps

1. Review with team for feedback
2. Create proof of concept with single message type
3. Test certificate creation and verification
4. Plan phased rollout