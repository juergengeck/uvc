# EP-KEYMISSMATCH Issue Analysis & Solution

## 🎯 **Confirmed Root Cause: Key Verification Failure**

After extensive debugging, the issue is confirmed to be at the **ONE protocol key verification level**, not WebSocket connectivity.

### 📊 **Evidence**

**Lama (mobile) logs:**
```
[PairingService] Default keys hash exists: true
[PairingService] Keys are available for person d27f0ef1dd9e2588e283496bda4984d846ac777a86c6fa4337f357f28fa945df
[PairingService] Connection attempt timed out after 30 seconds
```

**one.leute (web) error:**
```
Error: EP-KEYMISSMATCH: Key does not match your previous visit
    at verifyAndExchangePersonId
    at async LeuteConnectionsModule.acceptConnectionViaCatchAll
```

### 🔍 **What This Means**

1. **WebSocket connection succeeds** ✅
2. **ONE protocol handshake begins** ✅
3. **Key exchange during `verifyAndExchangePersonId` fails** ❌
4. **one.leute recognizes the Person ID but rejects the keys** ❌
5. **Lama times out waiting for response** ❌

## 🧩 **The Problem: "Previous Visit" Key Mismatch**

The error "Key does not match your previous visit" indicates:

- **one.leute has seen this Person ID before** with different cryptographic keys
- **Lama is presenting new/different keys** for the same Person ID
- **The key verification logic rejects the connection**

## 🔧 **Potential Causes & Solutions**

### **1. Key Regeneration on App Restart**
**Problem**: Lama regenerates keys on each app restart/login
**Solution**: Ensure key persistence across sessions

**Check**: In `src/services/PairingService.ts` around line 227:
```typescript
// CURRENT (potentially problematic)
const keysHash = await getDefaultKeys(myPersonId);

// NEEDS VERIFICATION: Are these keys persistent across sessions?
```

### **2. Person ID vs Key Consistency**
**Problem**: Same Person ID with different keys generated
**Solution**: Ensure deterministic key generation for same Person ID

**Investigation needed**:
```typescript
// Check if Person ID is consistent across sessions
console.log('Person ID:', myPersonId);

// Check if keys are derived consistently
const keyInfo = await getObject(keysHash);
console.log('Key details:', keyInfo);
```

### **3. Platform-Specific Key Generation**
**Problem**: Different key generation between Expo and web platforms
**Solution**: Ensure consistent crypto implementation

**Check**: 
- Are `getDefaultKeys()` implementations identical?
- Do both platforms use the same crypto libraries?
- Are keys stored/retrieved consistently?

## 🚀 **Immediate Action Plan**

### **Step 1: Enable Comprehensive Logging**
Add detailed key logging to identify the mismatch:

```typescript
// In PairingService.ts, before connection attempt:
console.log('[PairingService] DETAILED KEY INFO:');
console.log('  Person ID:', myPersonId);
console.log('  Keys Hash:', keysHash);

const keyObject = await getObject(keysHash);
console.log('  Key Object:', {
  encryptionKey: keyObject?.encryptionKey ? 'present' : 'missing',
  signKey: keyObject?.signKey ? 'present' : 'missing',
  // Log actual key values (ONLY for debugging - remove in production)
  encryptionKeyValue: keyObject?.encryptionKey,
  signKeyValue: keyObject?.signKey
});
```

### **Step 2: Check Key Persistence**
Verify if keys change between sessions:

```typescript
// Add to AppModel initialization:
console.log('[AppModel] SESSION KEY CHECK:');
const personId = this.leuteModel.myMainIdentity.objectId;
const currentKeys = await getDefaultKeys(personId);
console.log('Session keys for person:', personId);
console.log('Current session key hash:', currentKeys);

// Store in app state to compare on next session
```

### **Step 3: Compare with one.leute**
**For one.leute team**: Add similar logging to see what keys are expected:

```javascript
// In verifyAndExchangePersonId function:
console.log('[one.leute] EXPECTED vs RECEIVED KEYS:');
console.log('  Person ID:', receivedPersonId);
console.log('  Expected keys for this person:', expectedKeys);
console.log('  Received keys from Lama:', receivedKeys);
console.log('  Key match result:', keysMatch);
```

## 🎯 **Expected Solutions**

### **Option A: Force Key Regeneration on one.leute**
If Lama's keys are correct but one.leute has stale keys:
```javascript
// Clear stored keys for this Person ID and accept new ones
clearStoredKeysForPerson(personId);
```

### **Option B: Fix Key Persistence in Lama**
If Lama should reuse existing keys:
```typescript
// Ensure keys are loaded from persistent storage, not regenerated
const existingKeys = await loadPersistedKeys(personId);
if (existingKeys) {
  return existingKeys;
} else {
  const newKeys = await generateKeys(personId);
  await persistKeys(personId, newKeys);
  return newKeys;
}
```

### **Option C: Implement Key Rotation Protocol**
If key changes are legitimate:
```typescript
// Implement proper key rotation with version numbers
const keyVersion = await getKeyVersion(personId);
const keysWithVersion = { ...keys, version: keyVersion };
```

## 🔍 **Next Steps for Debugging**

1. **Add the detailed logging above** to both Lama and one.leute
2. **Attempt connection again** and compare the logs
3. **Identify which keys differ** (encryption vs signing keys)
4. **Determine if the difference is legitimate** (new device) or a bug (key regeneration)
5. **Implement the appropriate solution** based on findings

## 💡 **Key Insight**

The issue is **NOT**:
- WebSocket connectivity ✅ (fixed)
- Basic authentication ✅ (working)
- Network timeouts ✅ (not the root cause)

The issue **IS**:
- **Cryptographic key consistency** between Lama and one.leute
- **Key verification logic** expecting different keys than presented
- **Possible key regeneration** instead of key persistence

This is a **data consistency issue** at the cryptographic identity layer. 