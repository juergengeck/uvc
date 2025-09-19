# Complete EP-KEYMISSMATCH Debugging Guide

## 🎯 **Objective**
Resolve EP-KEYMISSMATCH errors between Lama mobile app and one.baypass desktop app using comprehensive debugging on both sides.

## 🔧 **Setup Complete**

### ✅ **Lama Side (Mobile)**
- Enhanced key logging in `PairingService.ts`
- Session key tracking in `AppModel.ts` 
- Force-enabled WebSocket monitoring
- Comprehensive error analysis

### ✅ **one.baypass Side (Desktop)**
- Detailed EP-KEYMISSMATCH debugging in `ExchangePersonIds.ts`
- Key comparison logging with fingerprints
- Utility function to clear stored keys
- React debugging component `EPKeyMismatchDebugger.tsx`

## 📋 **Complete Testing Workflow**

### **Step 1: Start one.baypass Desktop App**
```bash
cd ../flexibel.electron
npm start  # or however you start the desktop app
```

**Add the debugging component to your app:**
1. Import `EPKeyMismatchDebugger` in your main component
2. Add `<EPKeyMismatchDebugger />` to your UI (temporarily for debugging)
3. The debugger will appear as a red-bordered panel

### **Step 2: Start Lama Mobile App**
```bash
cd lama
npx expo start --clear
```

**Look for session key tracking logs:**
```
[AppModel] ===== SESSION KEY TRACKING =====
  ⚠️  myMainIdentity not available yet - will retry after full initialization
[AppModel] ===== END SESSION KEY TRACKING =====

... (during initialization) ...

[AppModel] ===== RETRY SESSION KEY TRACKING AFTER FULL INIT =====
  📱 Final Session Person ID: d27f0ef1dd9e2588e283496bda4984d846ac777a86c6fa4337f357f28fa945df
  🔑 Final session keys hash: <hash>
  🔑 Final Key Object Analysis:
    Has encryptionKey: true
    Has signKey: true
    🔐 Final encryption key fingerprint: <16chars>...
    ✍️  Final sign key fingerprint: <16chars>...
  💡 IMPORTANT: Record these values for EP-KEYMISSMATCH debugging!
     Person ID: d27f0ef1dd9e2588e283496bda4984d846ac777a86c6fa4337f357f28fa945df
     Test this Person ID in one.baypass when connection fails
[AppModel] ===== END RETRY SESSION KEY TRACKING =====
```

**📝 Record these values:**
- Person ID: `________________`
- Encryption fingerprint: `________________`
- Sign fingerprint: `________________`

**⚠️ If Person ID shows as `undefined`:**
This indicates the LeuteModel identity isn't fully loaded. Wait for the "RETRY" logs after full initialization.

### **Step 3: Generate Test Invitation**
In the one.baypass debugging component:
1. Click "🔗 Generate Test Invitation"
2. Copy the generated URL
3. Use this URL in Lama to test connection

### **Step 4: Attempt Connection from Lama**
Navigate to connection screen in Lama and try connecting.

**Monitor Lama logs for:**
```
[PairingService] ===== DETAILED KEY ANALYSIS =====
  🔑 Person ID: d27f0ef1dd9e2588e283496bda4984d846ac777a86c6fa4337f357f28fa945df
  🔑 Keys Hash: <hash>
  🔑 Key Object Analysis:
    Has encryptionKey: true/false
    Has signKey: true/false
    🔐 Encryption key fingerprint: <16chars>...
    ✍️  Sign key fingerprint: <16chars>...
```

**Monitor one.baypass browser console for:**
```
[one.baypass] ===== EP-KEYMISSMATCH DEBUGGING =====
  🔑 Remote Person ID: d27f0ef1dd9e2588e283496bda4984d846ac777a86c6fa4337f357f28fa945df
  🔑 Received Key (first 16 chars): <16chars>...
  ✅ Person ID found in storage - this is a KNOWN person
  📋 Found X stored endpoints for this person
  🔍 Checking endpoint 1/X
    🔑 Stored key (first 16 chars): <16chars>...
    🔍 Key comparison result: NO MATCH ❌
    ❌ Key mismatch on endpoint 1
      Expected: <16chars>...
      Received: <16chars>...
```

### **Step 5: Analyze Results**

#### **Scenario A: Key Regeneration Issue** 
If Lama's key fingerprints **change between app restarts**:

**Problem**: Lama regenerates keys each session
**Evidence**: Different fingerprints in session tracking logs
**Solution**: Fix key persistence in Lama

#### **Scenario B: one.baypass Has Stale Keys**
If Lama's key fingerprints **stay consistent** but one.baypass rejects them:

**Problem**: one.baypass has cached old keys for this Person ID
**Evidence**: 
- Consistent Lama fingerprints across sessions
- one.baypass logs show "KNOWN person" with different stored keys
**Solution**: Clear stored keys in one.baypass

**Use the debugging component:**
1. Copy the Person ID from Lama logs
2. Paste it in the one.baypass debugger
3. Click "🧹 Clear Stored Keys"
4. Try connecting from Lama again

#### **Scenario C: Protocol Format Issue**
If keys are consistent but still mismatch:

**Problem**: Key format incompatibility
**Evidence**: Same logical keys but different binary representation
**Solution**: Investigate key encoding/format differences

## 🔍 **Detailed Log Analysis**

### **Successful Connection Logs**
**Lama:**
```
[PairingService] ✅ Connection established successfully
```

**one.baypass:**
```
[one.baypass] 🎉 KEY MATCH FOUND! Using endpoint 1
[one.baypass] 📊 Will throw EP-KEYMISSMATCH error: false
```

### **Failed Connection Logs**
**Lama:**
```
[PairingService] Connection attempt timed out: [Error: Connection attempt timeout after 30 seconds]
```

**one.baypass:**
```
[one.baypass] 🚨 EP-KEYMISSMATCH ERROR ABOUT TO BE THROWN!
[one.baypass] 💡 DIAGNOSIS: Person is known but keys do not match stored keys
```

## 🚀 **Resolution Steps**

### **For Key Regeneration (Scenario A):**
1. **Investigate Lama's key persistence**:
   - Check if `getDefaultKeys()` loads existing vs creates new
   - Verify keychain storage across app sessions
   - Implement proper key persistence

2. **Test fix**:
   - Restart Lama multiple times
   - Verify fingerprints stay consistent
   - Test connection after restart

### **For Stale Keys (Scenario B):**
1. **Clear one.baypass stored keys**:
   - Use debugging component to clear keys
   - Or manually clear via browser dev tools
   
2. **Test connection**:
   - Should succeed as "new person"
   - Verify logs show "NEW person" instead of "KNOWN person"

### **For Protocol Issues (Scenario C):**
1. **Compare key formats**:
   - Log full key objects (temporarily)
   - Check encoding differences (hex vs base64 vs binary)
   - Verify key derivation methods

2. **Align implementations**:
   - Ensure both sides use same crypto libraries
   - Verify key generation parameters
   - Test with known good key pairs

## 💡 **Success Criteria**

The issue is resolved when:
1. ✅ **Consistent key fingerprints** across Lama sessions
2. ✅ **Successful WebSocket connection** (already working)
3. ✅ **Successful ONE protocol handshake** (currently failing)
4. ✅ **No EP-KEYMISSMATCH errors** from one.baypass
5. ✅ **Bidirectional communication** established

## 🔧 **Advanced Debugging**

### **Enable Additional Logging**
In one.baypass, add to browser console:
```javascript
// Enable verbose connection logging
localStorage.setItem('debug', 'one:*');
```

### **Manual Key Inspection**
In one.baypass browser console:
```javascript
// Get stored endpoints for a person
const personId = 'your-person-id-here';
const endpoints = await window.appModel.leuteModel.findAllOneInstanceEndpointsForPerson(personId);
console.log('Stored endpoints:', endpoints);
```

### **Force Key Clearing**
In one.baypass browser console:
```javascript
// Clear all stored keys for a person
const { clearStoredKeysForPerson } = await import('./packages/package/src/misc/ConnectionEstablishment/protocols/ExchangePersonIds');
const cleared = await clearStoredKeysForPerson(window.appModel.leuteModel, 'your-person-id');
console.log(`Cleared ${cleared} endpoints`);
```

## 📞 **Team Coordination**

### **Information to Share**
1. **Person ID** causing issues
2. **Key fingerprints** from both sides
3. **Session consistency** results
4. **Detailed logs** from both applications

### **Next Steps Based on Findings**
- **Key regeneration**: Fix Lama key persistence
- **Stale keys**: Clear one.baypass cache and implement key rotation
- **Protocol issues**: Align key formats and crypto implementations

This comprehensive setup provides full visibility into the EP-KEYMISSMATCH issue and tools to resolve it from both sides! 🔍✨ 