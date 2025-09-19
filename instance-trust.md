# Instance Trust Model for ONE Platform

## Overview

This document describes the trust model for app-to-app communication in the ONE platform, which differs fundamentally from the asymmetric ESP32 device ownership model.

## Trust Models Comparison

### ESP32 Devices (Asymmetric Trust)
- **Owner → Device** relationship
- App issues credentials TO the device
- Device uses app's credential to prove ownership
- Simple unidirectional trust chain
- No mutual authentication needed

### App Instances (Symmetric Trust)
- **Peer ↔ Peer** relationship  
- Both apps have Person identities
- Mutual authentication required
- Bidirectional trust establishment
- Multiple trust sources

## App-to-App Trust Establishment

### 1. Identity Exchange via CommServer

When two app instances discover each other, they exchange identities through the CommServer:

```
App A                    CommServer                    App B
  |                          |                          |
  |------ Discovery -------->|                          |
  |                          |<------ Discovery --------|
  |                          |                          |
  |<--- Available Peers -----|---- Available Peers ---->|
  |                          |                          |
  |---- Identity Proof ----->|                          |
  |                          |---- Identity Proof ----->|
  |                          |                          |
  |<--- Identity Proof ------|<--- Identity Proof ------|
```

### 2. Trust Verification Sources

#### Pre-existing Trust (Contacts)
```javascript
// Check if peer is already in contacts
const isInContacts = await leuteModel.isSomeoneElse(peerPersonId);
if (isInContacts) {
    // Automatically trust known contacts
    return { trusted: true, reason: 'existing_contact' };
}
```

#### Domain/Organizational Rules
```javascript
// Apply organizational trust rules
const orgRules = await getOrganizationalTrustRules();
if (orgRules.trustSameDomain && isSameDomain(peerIdentity)) {
    return { trusted: true, reason: 'organizational_policy' };
}
```

#### User Consent
```javascript
// Ask user for trust decision
const userDecision = await promptUserForTrust({
    peerName: peerIdentity.name,
    peerPublicKey: peerIdentity.publicKey,
    peerMetadata: peerIdentity.metadata
});
```

### 3. Authentication Protocol via CommServer

The CommServer facilitates mutual authentication without seeing the encrypted content:

#### Phase 1: Identity Advertisement
```json
// App A sends to CommServer
{
    "type": "identity_advertisement",
    "personId": "SHA256IdHash<Person>",
    "publicKey": "Ed25519PublicKey",
    "capabilities": ["chat", "file_transfer", "sync"],
    "timestamp": "ISO8601"
}
```

#### Phase 2: Challenge-Response
```json
// CommServer relays challenge from App B
{
    "type": "auth_challenge",
    "from": "App B PersonId",
    "challenge": "random_nonce",
    "timestamp": "ISO8601"
}

// App A responds with proof
{
    "type": "auth_response",
    "to": "App B PersonId",
    "signature": "Ed25519_Sign(challenge + timestamp)",
    "timestamp": "ISO8601"
}
```

#### Phase 3: Trust Establishment
```json
// After mutual authentication
{
    "type": "trust_established",
    "peer": "PersonId",
    "trustLevel": "full|limited|temporary",
    "permissions": ["chat", "file_read", "presence"],
    "validUntil": "ISO8601"
}
```

### 4. Connection Upgrade Path

After trust establishment, connections can upgrade from CommServer relay to direct P2P:

```
1. Initial: App A <-> CommServer <-> App B
2. Discovery: Exchange local network info via relay
3. Attempt: Try direct P2P connection
4. Upgrade: Switch to direct connection if successful
5. Fallback: Maintain relay as backup
```

## Trust Levels and Permissions

### Trust Levels

1. **Full Trust** - Complete access, typically for:
   - Same user's devices
   - Close contacts
   - Verified organizational members

2. **Limited Trust** - Restricted access for:
   - Acquaintances
   - Temporary collaborations
   - Public interactions

3. **Temporary Trust** - Time-bound access for:
   - One-time file transfers
   - Meeting participants
   - Guest access

### Permission Model

```typescript
interface TrustPermissions {
    // Communication
    chat: boolean;
    voiceCall: boolean;
    videoCall: boolean;
    
    // Data access
    fileRead: boolean;
    fileWrite: boolean;
    syncData: boolean;
    
    // Presence
    seeOnlineStatus: boolean;
    seeLocation: boolean;
    seeActivity: boolean;
    
    // Administrative
    addToGroups: boolean;
    shareContacts: boolean;
}
```

## Implementation Guidelines

### 1. Trust Establishment Flow

```typescript
async function establishTrust(peerIdentity: PeerIdentity): Promise<TrustResult> {
    // Step 1: Check existing trust
    const existingTrust = await checkExistingTrust(peerIdentity.personId);
    if (existingTrust) {
        return existingTrust;
    }
    
    // Step 2: Apply automatic rules
    const ruleBasedTrust = await applyTrustRules(peerIdentity);
    if (ruleBasedTrust.trusted) {
        await saveTrustDecision(peerIdentity.personId, ruleBasedTrust);
        return ruleBasedTrust;
    }
    
    // Step 3: Request user consent
    const userConsent = await requestUserConsent(peerIdentity);
    if (userConsent.trusted) {
        await saveTrustDecision(peerIdentity.personId, userConsent);
        return userConsent;
    }
    
    return { trusted: false, reason: 'user_rejected' };
}
```

### 2. Mutual Authentication

```typescript
async function mutualAuthenticate(peerConnection: Connection): Promise<boolean> {
    // Send our identity proof
    const ourProof = await createIdentityProof();
    await peerConnection.send({
        type: 'identity_proof',
        proof: ourProof
    });
    
    // Wait for peer's identity proof
    const peerProof = await peerConnection.waitForMessage('identity_proof');
    
    // Verify peer's proof
    const isValid = await verifyIdentityProof(peerProof);
    if (!isValid) {
        return false;
    }
    
    // Exchange challenges for liveness
    const challenge = crypto.randomBytes(32);
    await peerConnection.send({
        type: 'auth_challenge',
        challenge: challenge
    });
    
    // Verify challenge response
    const response = await peerConnection.waitForMessage('auth_response');
    return verifyChallenge(response, challenge, peerProof.publicKey);
}
```

### 3. Trust Persistence

```typescript
interface PersistedTrust {
    personId: SHA256IdHash<Person>;
    trustLevel: 'full' | 'limited' | 'temporary';
    permissions: TrustPermissions;
    establishedAt: Date;
    validUntil?: Date;
    reason: string;
    // Crypto proof of trust establishment
    trustProof: {
        ourSignature: string;
        theirSignature: string;
        agreedPermissions: string;
    };
}
```

## Security Considerations

### 1. Man-in-the-Middle Protection
- CommServer cannot decrypt end-to-end encrypted messages
- Direct identity verification through challenge-response
- Optional out-of-band verification (QR codes, verbal confirmation)

### 2. Trust Revocation
- Either party can revoke trust at any time
- Revocation is immediate and irreversible
- Blocked list prevents re-establishment

### 3. Permission Boundaries
- Permissions are enforced at protocol level
- Cannot exceed granted permissions even if compromised
- Regular permission audits recommended

### 4. Privacy Preservation
- Minimal metadata exposure to CommServer
- No trust relationships visible to third parties
- Optional anonymous discovery modes

## User Experience Guidelines

### 1. Trust Request UI
```
┌─────────────────────────────────────┐
│  Alice wants to connect             │
│                                     │
│  👤 Alice Smith                     │
│  🔑 Public Key: 3a4f...9b2c        │
│  📧 alice@example.com               │
│                                     │
│  Requested permissions:             │
│  ✓ Send messages                   │
│  ✓ See when you're online          │
│  ✓ Share files                     │
│                                     │
│  How do you know Alice?            │
│  ○ Personal friend                 │
│  ○ Work colleague                  │
│  ○ Don't know them                 │
│                                     │
│  [Decline]  [Limited]  [Accept]     │
└─────────────────────────────────────┘
```

### 2. Trust Management UI
- Clear visualization of trust relationships
- Easy permission modification
- Trust audit log
- Bulk trust operations

## Migration and Compatibility

### 1. Legacy Contact Import
- Import existing contacts as "full trust"
- Prompt for permission refinement
- Gradual migration to new model

### 2. Cross-Version Compatibility
- Fallback to basic trust for older clients
- Forward compatibility through capability negotiation
- Graceful degradation of features

## Conclusion

The instance trust model provides a flexible, secure foundation for peer-to-peer communication in the ONE platform. Unlike the simple ownership model for ESP32 devices, app instances require sophisticated mutual authentication and consent-based trust establishment, reflecting the symmetric nature of human-to-human communication.