# QUIC-VC Implementation in LAMA

## Overview

LAMA implements QUIC with Verifiable Credentials (QUIC-VC) instead of traditional QUIC-TLS. This approach provides decentralized authentication and authorization for peer-to-peer mobile networks without relying on Certificate Authorities.

## Architecture

### Components

1. **QUIC Transport Layer** (`QuicModel`, `UdpServiceTransport`)
   - Provides reliable, multiplexed transport over UDP
   - No TLS handshake - operates as plain QUIC
   - Manages socket lifecycle and service routing

2. **Discovery Layer** (`DeviceDiscoveryModel`, `DiscoveryProtocol`)
   - UDP broadcast for local device discovery
   - Generates unique session IDs using SHA256 hashes
   - Triggers VC exchange upon device discovery

3. **VC Exchange Layer** (`VCManager`)
   - Handles Verifiable Credential presentation and verification
   - Implements request/response protocol for VC exchange
   - Caches verified credentials with TTL

4. **Authentication Layer** (`CredentialVerifier`)
   - Challenge-response authentication after VC verification
   - Additional security layer using Ed25519 signatures
   - Maintains credential validity state

## QUIC-VC Flow

```
Device A                           Device B
   |                                  |
   |------ UDP Discovery Broadcast -->|
   |                                  |
   |<----- UDP Discovery Response ----|
   |                                  |
   |===== QUIC Connection Setup ======|
   |         (No TLS)                 |
   |                                  |
   |------ VC Request --------------->|
   |  (NetworkServiceType.VC_EXCHANGE)|
   |                                  |
   |<----- VC Presentation -----------|
   |  (DeviceIdentityCredential)      |
   |                                  |
   |------ VC Verification ---------->|
   |  (Signature & Trust Check)       |
   |                                  |
   |------ Challenge Request -------->|
   |  (CredentialVerifier)            |
   |                                  |
   |<----- Challenge Response --------|
   |  (Signed with Private Key)       |
   |                                  |
   |====== Secure Channel Ready ======|
   |       (Encrypted Data)           |
```

## Implementation Details

### 1. Device Discovery
When a device is discovered via UDP broadcast:
```typescript
private handleDeviceDiscovered(device: Device): void {
  // First, try to get VC from the device
  if (this._vcManager && device.address && device.port) {
    this._vcManager.fetchAndVerifyVC(device.id, device.address, device.port);
  }
}
```

### 2. VC Request
VCManager sends a request for the device's Verifiable Credential:
```typescript
const requestMessage: VCRequestMessage = { type: 'request_vc' };
await this.transport.send(packet, remoteAddress, remotePort);
```

### 3. VC Presentation
The remote device responds with its DeviceIdentityCredential:
```typescript
interface DeviceIdentityCredential {
  $type$: 'DeviceIdentityCredential';
  id: string;                    // SHA256 hash
  credentialSubject: {
    id: string;                  // Device ID
    publicKeyHex: string;        // Ed25519 public key
    type?: string;               // Device type
    capabilities?: string[];     // Device capabilities
  };
  issuer: string;                // Issuer's Person ID
  issuanceDate: string;          // ISO 8601
  expirationDate?: string;       // ISO 8601
  proof: VCProof;                // Cryptographic signature
}
```

### 4. VC Verification
The VCManager verifies:
- Issuer is trusted (self-signed or in trust list)
- Signature is valid
- Credential hasn't expired
- Subject's public key is extracted for future use

### 5. Challenge-Response Authentication
After successful VC verification, CredentialVerifier performs challenge-response:
- Generates random challenge
- Remote device signs challenge with private key
- Verifies signature matches VC's public key
- Establishes authenticated session

## Security Properties

### Decentralized Trust
- No Certificate Authorities required
- Trust based on cryptographic proofs
- Self-sovereign identity for each device

### Cryptographic Security
- Ed25519 signatures for authentication
- SHA256 hashes for identity
- Challenge-response prevents replay attacks

### Flexible Authorization
- VCs can encode capabilities and permissions
- Time-bound credentials with expiration
- Revocation through trust list updates

## Current Implementation Status

### Completed
- ✅ Basic QUIC transport without TLS
- ✅ UDP discovery protocol
- ✅ VCManager integration in DeviceDiscoveryModel
- ✅ VC request/response protocol
- ✅ Challenge-response authentication
- ✅ Error handling for failed exchanges

### TODO
- ⚠️ Implement proper VC signature verification (currently returns true)
- ⚠️ Implement getIssuerPublicKey from TrustModel
- ⚠️ Add VC issuance/creation functionality
- ⚠️ Implement trust list management
- ⚠️ Add VC revocation checking
- ⚠️ Implement session key derivation from VC exchange

## Configuration

### VCManager Configuration
```typescript
const vcManagerConfig: VCManagerConfig = {
  transport: IQuicTransport,
  ownPersonId: SHA256IdHash<Person>,
  getIssuerPublicKey: async (issuerPersonId) => string | null,
  verifyVCSignature: async (data, sig, pubKey, type) => boolean,
  trustedIssuers?: SHA256IdHash<Person>[]
};
```

### Trust Model
- Self-signed VCs are trusted by default
- Additional trusted issuers can be configured
- Trust verification happens at VC exchange time

## Benefits Over QUIC-TLS

1. **No CA Dependency**: Eliminates single points of failure
2. **Mobile-Native**: Works with dynamic IPs and NAT traversal
3. **Rich Identity**: Encodes device capabilities and permissions
4. **Offline Capable**: VCs can be verified without internet
5. **P2P Optimized**: Natural fit for federated architectures

## Future Enhancements

1. **Zero-Knowledge Proofs**: Present credentials without revealing all details
2. **Threshold Signatures**: Multi-party trust for critical operations
3. **Blockchain Integration**: Anchoring trust roots on-chain
4. **Anonymous Credentials**: Privacy-preserving authentication
5. **Delegated Credentials**: Temporary permission delegation

## References

- W3C Verifiable Credentials Data Model
- DID (Decentralized Identifiers) Specification
- Ed25519 Signature Scheme
- QUIC Protocol RFC 9000