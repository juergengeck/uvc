# EP-KEYMISSMATCH Debugging Guide

## 🎯 **Objective**
Identify why Lama's keys don't match one.leute's expectations during connection

## 🔧 **Setup Complete**

✅ **Enhanced key logging in PairingService.ts**
✅ **Session key tracking in AppModel.ts** 
✅ **Force-enabled WebSocket monitoring**
✅ **Comprehensive error analysis**

## 📋 **Testing Steps**

### **Step 1: Restart Lama & Capture Session Keys**
```bash
npx expo start --clear
```

**Look for these logs:**
```
[AppModel] ===== SESSION KEY TRACKING =====
  📱 Session Person ID: d27f0ef1dd9e2588e283496bda4984d846ac777a86c6fa4337f357f28fa945df
  🔑 Current session keys hash: <hash>
  🔐 Session encryption key fingerprint: <16chars>...
  ✍️  Session sign key fingerprint: <16chars>...
```

**📝 Record the fingerprints** - we'll compare these between sessions.

### **Step 2: Attempt Connection & Capture Key Details**
Navigate to connection screen and try connecting.

**Look for these logs:**
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

**Also look for WebSocket monitoring:**
```
[WebSocket Monitor] 🔗 NEW CONNECTION: ws_xxx to wss://comm10.dev.refinio.one
[WebSocket Monitor] ✅ CONNECTED: ws_xxx (took Xms)
[WebSocket Monitor] 📤 SENDING: ws_xxx (ONE protocol message)
[WebSocket Monitor] 📥 RECEIVED: ws_xxx (response or rejection)
```

### **Step 3: Compare Results**

#### **Scenario A: Key Regeneration Issue**
If fingerprints **change between app restarts**:
- **Problem**: Lama regenerates keys each session
- **Impact**: one.leute remembers old keys, rejects new ones
- **Solution**: Fix key persistence in Lama

#### **Scenario B: Protocol Format Issue**  
If fingerprints **stay consistent** but still get EP-KEYMISSMATCH:
- **Problem**: Key format incompatibility between Lama and one.leute
- **Impact**: Same keys presented differently
- **Solution**: Align key exchange protocol format

#### **Scenario C: one.leute Stale Keys**
If Lama keys are correct but one.leute has outdated expectations:
- **Problem**: one.leute cached old keys for this Person ID
- **Impact**: Legitimate key changes rejected
- **Solution**: one.leute team needs to clear cached keys

## 🔍 **Key Questions to Answer**

1. **Do the fingerprints change between app restarts?**
   - 📝 Session 1 encryption: `________________`
   - 📝 Session 2 encryption: `________________`
   - 📝 Session 1 sign: `________________`
   - 📝 Session 2 sign: `________________`

2. **Does the Person ID stay consistent?**
   - 📝 Person ID: `________________`

3. **What WebSocket monitoring shows:**
   - 📝 Connection established: `Yes/No`
   - 📝 Messages exchanged: `Yes/No`
   - 📝 Connection closed abruptly: `Yes/No`

## 🎯 **Expected Outcomes**

### **If keys are consistent across sessions:**
```
✅ Same fingerprints = Key persistence working
❌ EP-KEYMISSMATCH = Protocol format issue
→ Need to compare actual key exchange format with one.leute
```

### **If keys change between sessions:**
```
❌ Different fingerprints = Key regeneration bug
✅ Fix: Implement proper key persistence
→ Keys should be deterministic for same Person ID
```

## 🚀 **Next Steps Based on Results**

### **For Key Regeneration (changing fingerprints):**
1. Investigate keychain storage persistence
2. Check if `getDefaultKeys()` creates new keys vs loads existing
3. Implement proper key persistence across sessions

### **For Protocol Format Issues (consistent fingerprints):**
1. Share logs with one.leute team
2. Compare key exchange message format
3. Identify format discrepancies

### **For one.leute Stale Keys:**
1. Ask one.leute team to clear stored keys for this Person ID
2. Verify if connection succeeds after clearing
3. Implement proper key rotation protocol

## 💡 **Success Criteria**

The issue will be resolved when:
1. ✅ **Consistent key fingerprints** across Lama sessions
2. ✅ **Successful WebSocket connection** (already working)
3. ✅ **Successful ONE protocol handshake** (currently failing)
4. ✅ **No EP-KEYMISSMATCH errors** from one.leute
5. ✅ **Bidirectional communication** established

## 📞 **Coordination with one.leute Team**

**Share with one.leute team:**
1. The Person ID that's causing issues
2. The key fingerprints from our logs
3. Request they log what keys they expect vs receive
4. Ask them to check if they have cached keys for this Person ID

**Request from one.leute team:**
1. Add similar logging in `verifyAndExchangePersonId` function
2. Share their expected key format/structure  
3. Confirm if they support key rotation/updates 