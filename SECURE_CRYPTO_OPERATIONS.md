# 🔐 Secure Crypto Operations in lama.one

## **FUNDAMENTAL SECURITY PRINCIPLE**

**❌ NEVER expose private keys to JavaScript**  
**✅ ALWAYS use secure crypto operations through one.core's CryptoApi**

## **🏗️ one.core Security Architecture**

### **Two-Layer Security Model**

1. **🔒 Secure Keychain Layer**
   - Private keys stored encrypted in platform-specific secure storage
   - Master key derived from user secret (password/biometric)
   - Private keys NEVER exposed to JavaScript runtime
   - Accessed only through secure crypto operations

2. **🔧 CryptoApi Interface Layer**
   - Provides crypto operations WITHOUT exposing private keys
   - Methods: `encrypt()`, `decrypt()`, `sign()`, `verify()`
   - Public keys accessible for sharing/verification
   - Private keys remain protected in keychain

### **Key Storage Structure**

```
Keychain Storage:
├── Public Keys (Keys object in database)
│   ├── $type$: "Keys"
│   ├── owner: SHA256IdHash<Person>
│   ├── publicKey: Uint8Array (encryption)
│   └── publicSignKey: Uint8Array (signing)
└── Private Keys (encrypted files in secure storage)
    ├── <keysHash>.encrypt (encrypted private encryption key)
    └── <keysHash>.sign (encrypted private signing key)
```

## **✅ CORRECT Pattern: Secure Crypto Operations**

### **1. Get Secure Crypto API**

```typescript
import { createCryptoApiFromDefaultKeys } from '@refinio/one.core/lib/keychain/keychain.js';

// ✅ CORRECT: Get secure crypto operations
const cryptoApi = await createCryptoApiFromDefaultKeys(personId);

// ✅ CORRECT: Access public keys for sharing
const publicEncryptionKey = cryptoApi.publicEncryptionKey;
const publicSignKey = cryptoApi.publicSignKey;

// ✅ CORRECT: Perform crypto operations securely
const signature = cryptoApi.sign(data);
const encrypted = cryptoApi.encrypt(data, otherPublicKey, nonce);
const decrypted = cryptoApi.decrypt(encrypted, otherPublicKey, nonce);
```

### **2. Verify Crypto Operations Work**

```typescript
// ✅ CORRECT: Test crypto operations without exposing private keys
try {
  const testData = new Uint8Array([1, 2, 3, 4]);
  const signature = cryptoApi.sign(testData);
  console.log('✅ Crypto operations verified, signature length:', signature.length);
} catch (error) {
  throw new Error('Crypto operations not working properly');
}
```

### **3. Handle Keychain Lock State**

```typescript
try {
  const cryptoApi = await createCryptoApiFromDefaultKeys(personId);
  // Use cryptoApi for operations
} catch (error) {
  if (error.code === 'KEYCH-LOCKED') {
    // Keychain is locked - need to unlock first
    await unlockOrCreateKeyChain(userSecret);
    // Retry operation
  }
  throw error;
}
```

## **❌ INCORRECT Patterns: Security Violations**

### **❌ NEVER Access Raw Private Keys**

```typescript
// ❌ WRONG: Trying to access private keys directly
const keys = await getDefaultKeys(personId);
const keyObject = await getObject(keys);
// keyObject only contains PUBLIC keys - private keys are NOT exposed!

// ❌ WRONG: Expecting private keys in key object
if (!keyObject.encryptionKey) {  // This will ALWAYS fail!
  throw new Error('Private keys missing');
}
```

### **❌ NEVER Try to Recreate Existing Keys**

```typescript
// ❌ WRONG: Trying to recreate keys that already exist
try {
  await createDefaultKeys(personId, encryptionKeyPair, signKeyPair);
} catch (error) {
  if (error.code === 'KEYCH-HASDEFKEYS') {
    // This error is EXPECTED and CORRECT behavior!
    // Keys already exist - use them instead of recreating
  }
}
```

### **❌ NEVER Store Private Keys in JavaScript Variables**

```typescript
// ❌ WRONG: Exposing private keys to JavaScript
const secretKeys = await getDefaultSecretKeysAsBase64(personId);
const privateKey = secretKeys.secretEncryptionKey; // Security violation!

// ❌ WRONG: Passing private keys around
function unsafeFunction(privateKey: string) {
  // Private keys should never be parameters!
}
```

## **🔧 Implementation Examples**

### **Invitation Generation (Secure Pattern)**

```typescript
export class InviteManager {
  async generateInvitationUrl(): Promise<string> {
    // ✅ Get person ID securely
    const myPersonId = await this.leuteModel.myMainIdentity();
    
    // ✅ Verify crypto operations work (without exposing private keys)
    const cryptoApi = await createCryptoApiFromDefaultKeys(myPersonId);
    if (!cryptoApi || !cryptoApi.publicEncryptionKey) {
      throw new Error('Crypto operations not available');
    }
    
    // ✅ Test crypto operations
    const testData = new Uint8Array([1, 2, 3, 4]);
    const signature = cryptoApi.sign(testData);
    
    // ✅ Create invitation using secure pattern
    const invitation = await this.appModel.connections.pairing.createInvitation(myPersonId);
    
    return `${INVITE_CONFIG.BASE_URL}${INVITE_CONFIG.INVITE_PATH}${INVITE_CONFIG.INVITE_PARAMS}#${encodeURIComponent(JSON.stringify(invitation))}`;
  }
}
```

### **Pairing Process (Secure Pattern)**

```typescript
export class PairingManager {
  async createInvitation(personId: SHA256IdHash<Person>): Promise<Invitation> {
    // ✅ one.core handles all crypto operations internally
    // ✅ Private keys never exposed to JavaScript
    // ✅ Secure encrypted handshake handled by one.core
    
    // Internal one.core process:
    // 1. Get secure crypto API for personId
    // 2. Generate invitation token
    // 3. Create encrypted handshake parameters
    // 4. Return invitation object (no private keys included)
    
    return {
      token: 'secure_token',
      publicKey: 'hex_public_key',
      url: 'wss://comm.server.url'
    };
  }
}
```

## **🚨 Common Security Mistakes**

### **1. Expecting Private Keys in Key Objects**
- **Problem**: Key objects only contain PUBLIC keys
- **Solution**: Use CryptoApi for operations, not raw key access

### **2. Trying to Recreate Existing Keys**
- **Problem**: `KEYCH-HASDEFKEYS` error when keys exist
- **Solution**: Check if keys exist first, use existing keys

### **3. Storing Private Keys in Variables**
- **Problem**: Security violation, keys exposed to JavaScript
- **Solution**: Use CryptoApi operations, never store private keys

### **4. Bypassing Keychain Security**
- **Problem**: Trying to access encrypted key files directly
- **Solution**: Use one.core's secure keychain APIs

## **🔍 Debugging Crypto Issues**

### **Check Keychain State**

```typescript
import { hasDefaultKeys, createCryptoApiFromDefaultKeys } from '@refinio/one.core/lib/keychain/keychain.js';

// ✅ Check if keys exist
const hasKeys = await hasDefaultKeys(personId);
console.log('Has default keys:', hasKeys);

// ✅ Check if crypto operations work
try {
  const cryptoApi = await createCryptoApiFromDefaultKeys(personId);
  console.log('Crypto API available:', !!cryptoApi);
  console.log('Public encryption key:', !!cryptoApi.publicEncryptionKey);
  console.log('Public sign key:', !!cryptoApi.publicSignKey);
} catch (error) {
  console.log('Crypto API error:', error.code, error.message);
}
```

### **Common Error Codes**

- `KEYCH-LOCKED`: Keychain is locked, need to unlock
- `KEYCH-HASDEFKEYS`: Keys already exist (normal, not an error)
- `KEYCH-NODEFKEYS`: No default keys found, need to create
- `CYAPI-SIGN`: Signing operation failed
- `CYAPI-PUBSK`: Public sign key not available

## **📋 Security Checklist**

- [ ] ✅ Use `createCryptoApiFromDefaultKeys()` for crypto operations
- [ ] ✅ Never access private keys directly in JavaScript
- [ ] ✅ Test crypto operations to verify keychain is working
- [ ] ✅ Handle keychain lock state properly
- [ ] ✅ Use existing keys instead of recreating them
- [ ] ❌ Never store private keys in JavaScript variables
- [ ] ❌ Never pass private keys as function parameters
- [ ] ❌ Never expect private keys in key objects
- [ ] ❌ Never bypass one.core's security mechanisms

## **🎯 Key Takeaway**

**The security model is designed to keep private keys COMPLETELY ISOLATED from JavaScript. Any code that tries to access private keys directly is fundamentally wrong and will fail. Always use one.core's secure crypto operations instead.** 