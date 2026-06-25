# Using ONE.core Crypto API

## Overview

**Don't use OneCryptoPlan** - ONE.core already provides complete crypto functionality via **CryptoApi** class and low-level crypto functions.

## CryptoApi Class (Recommended)

**Purpose**: High-level crypto wrapper that **never exposes private keys**

This is what the keychain uses - it provides crypto operations without exposing secret keys.

### Getting CryptoApi Instance

```typescript
import { CryptoApi } from '@refinio/one.core/lib/crypto/CryptoApi.js';
import { createKeyPair } from '@refinio/one.core/lib/crypto/encryption.js';
import { createSignKeyPair } from '@refinio/one.core/lib/crypto/sign.js';

// From keychain (recommended - keys never exposed)
const crypto = await keychain.getCryptoApi();

// Or create manually (for testing)
const encryptionKeys = createKeyPair();
const signKeys = createSignKeyPair();
const crypto = new CryptoApi(encryptionKeys, signKeys);
```

### Encryption

```typescript
import { createRandomNonce } from '@refinio/one.core/lib/crypto/encryption.js';

// Encrypt for another person
const nonce = createRandomNonce();
const encrypted = crypto.encrypt(data, otherPersonPublicKey, nonce);

// Or with embedded nonce (simpler)
const encrypted = crypto.encryptAndEmbedNonce(data, otherPersonPublicKey);

// Decrypt
const decrypted = crypto.decryptWithEmbeddedNonce(encrypted, otherPersonPublicKey);
```

### Signing

```typescript
// Sign data
const signature = crypto.sign(data);

// Verify signature (use low-level function)
import { signatureVerify } from '@refinio/one.core/lib/crypto/sign.js';

const isValid = signatureVerify(data, signature, otherPersonPublicSignKey);
```

### Person-to-Person Crypto

```typescript
// Create dedicated API for communication with specific person
const personCrypto = crypto.createEncryptionApiWithPerson(otherPersonPublicKey);

// Now encrypt/decrypt without specifying keys each time
const encrypted = personCrypto.encryptAndEmbedNonce(data);
const decrypted = personCrypto.decryptWithEmbeddedNonce(encrypted);
```

## Low-Level Crypto Functions

### Encryption (`@refinio/one.core/lib/crypto/encryption.js`)

```typescript
import {
  createKeyPair,
  createRandomNonce,
  encrypt,
  decrypt,
  encryptAndEmbedNonce,
  decryptWithEmbeddedNonce,
  symmetricEncrypt,
  symmetricDecrypt,
  createSymmetricKey,
  deriveSymmetricKeyFromKeypair,
  deriveSymmetricKeyFromSecret
} from '@refinio/one.core/lib/crypto/encryption.js';

// Asymmetric encryption
const keyPair = createKeyPair();
const nonce = createRandomNonce();
const encrypted = encrypt(data, mySecretKey, otherPublicKey, nonce);
const decrypted = decrypt(encrypted, mySecretKey, otherPublicKey, nonce);

// Symmetric encryption
const symmetricKey = createSymmetricKey();
const encrypted = symmetricEncrypt(data, symmetricKey, nonce);
const decrypted = symmetricDecrypt(encrypted, symmetricKey, nonce);

// Derive symmetric key from password
const salt = createRandomSalt();
const key = await deriveSymmetricKeyFromSecret('password', salt);
```

### Signing (`@refinio/one.core/lib/crypto/sign.js`)

```typescript
import {
  createSignKeyPair,
  sign,
  signatureVerify
} from '@refinio/one.core/lib/crypto/sign.js';

// Create key pair
const signKeys = createSignKeyPair();

// Sign
const signature = sign(data, signKeys.secretKey);

// Verify
const isValid = signatureVerify(data, signature, signKeys.publicKey);
```

## Common Patterns

### Keychain Integration

```typescript
// Get crypto API from keychain (most common pattern)
const crypto = await keychain.getCryptoApi();

// Use without ever exposing private keys
const signature = crypto.sign(messageData);
const encrypted = crypto.encryptAndEmbedNonce(data, recipientPublicKey);
```

### Instance-to-Instance Communication

```typescript
// Get remote instance's public keys
const remoteInstance = await getObjectByIdHash(remoteInstanceId);
const remoteEncryptionKey = remoteInstance.keys[0].publicKey;

// Create dedicated crypto API for this instance
const instanceCrypto = crypto.createEncryptionApiWithPerson(remoteEncryptionKey);

// Encrypt messages
const encryptedMessage = instanceCrypto.encryptAndEmbedNonce(messageData);

// Decrypt responses
const decryptedResponse = instanceCrypto.decryptWithEmbeddedNonce(responseData);
```

### Signing Objects

```typescript
// Sign ONE object
const objectBytes = serializeObject(myObject);
const signature = crypto.sign(objectBytes);

// Store signature with object
const signedObject = {
  ...myObject,
  signature: base64Encode(signature)
};
```

### Verifying Certificates

```typescript
import { signatureVerify } from '@refinio/one.core/lib/crypto/sign.js';

// Verify AffirmationCertificate signature
const certificate = await getObject(certificateHash);
const issuerPerson = await getObjectByIdHash(certificate.issuer);
const issuerSignKey = issuerPerson.keys[0].publicKey;

const certificateData = serializeCertificateForSigning(certificate);
const isValid = signatureVerify(
  certificateData,
  certificate.signature,
  issuerSignKey
);
```

## Type Safety

ONE.core uses **branded types** for crypto primitives:

```typescript
import type {
  PublicKey,
  SecretKey,
  Nonce,
  Salt,
  SymmetricKey
} from '@refinio/one.core/lib/crypto/encryption.js';

import type {
  PublicSignKey,
  SecretSignKey
} from '@refinio/one.core/lib/crypto/sign.js';

// These are Uint8Array with type branding for safety
const nonce: Nonce = createRandomNonce();
const key: SymmetricKey = createSymmetricKey();
```

## Security Best Practices

### ✅ DO

- **Use CryptoApi from keychain** - Never handle raw private keys
- **Use embedded nonce** - Simpler and safer (`encryptAndEmbedNonce`)
- **Verify signatures** - Always verify before trusting
- **Use random nonces** - Never reuse nonces
- **Derive keys properly** - Use `deriveSymmetricKeyFromSecret` with salt

### ❌ DON'T

- **Don't expose private keys** - Use CryptoApi wrapper
- **Don't reuse nonces** - Each encryption needs new nonce
- **Don't skip verification** - Always verify signatures
- **Don't store secrets in code** - Use keychain
- **Don't use weak passwords** - If deriving keys from passwords

## Why Not OneCryptoPlan?

**OneCryptoPlan was excluded because**:
1. ONE.core already has complete crypto API
2. CryptoApi is better designed (doesn't expose keys)
3. OneCryptoPlan had import path mismatches
4. No value in wrapping what's already perfect

**Use CryptoApi directly instead** - it's the intended API.

## Examples from Codebase

### Keychain Usage

```typescript
// From src/initialization/index.ts
const keychain = await initializeKeychain();
const crypto = await keychain.getCryptoApi();

// Now crypto operations never expose private keys
const signature = crypto.sign(data);
```

### Person Key Management

```typescript
// Get person's public keys
const person = await leuteModel.myMainIdentity();
const personObj = await getObjectByIdHash(person);
const publicEncryptionKey = personObj.keys[0].publicKey;
const publicSignKey = personObj.keys[0].publicSignKey;

// Use for verification
import { signatureVerify } from '@refinio/one.core/lib/crypto/sign.js';
const isValid = signatureVerify(data, signature, publicSignKey);
```

## Summary

✅ **Use CryptoApi** for all crypto operations
✅ **Get it from keychain** to never expose private keys
✅ **Use low-level functions** when you need fine control
❌ **Don't use OneCryptoPlan** - use ONE.core crypto directly
