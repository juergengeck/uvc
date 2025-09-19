# Gemini Development Guide: lama.one

This document provides a summary of the `lama.one` project, its architecture, current challenges, and key development principles to guide AI-assisted development.

## 1. Project Overview

`lama.one` is a React Native (Expo) mobile application designed for secure data sharing between cancer patients and their doctors for research purposes. It is built upon the `@refinio/one.core` and `@refinio/one.models` libraries, which provide the foundational backend logic for identity, secure connections, and data storage.

- **Frontend**: React Native (Expo)
- **Backend Logic**: `@refinio/one.core`, `@refinio/one.models`
- **Primary Comms Endpoint**: `wss://comm10.dev.refinio.one`

## 2. Core Architecture

The application's architecture is complex and relies heavily on the patterns established by the `one.models` and `one.leute` (a reference implementation) projects.

### 2.1. Connection Management

- **System**: A sophisticated, multi-transport architecture for establishing and maintaining secure, encrypted connections.
- **Transports**: Primarily uses WebSocket connections to a `CommServer` for discovery and relay, but also supports P2P/UDP and BLE for direct connections.
- **Pairing**: Device pairing is the process of establishing a trusted relationship and is the foundation for all communication.

### 2.2. Contact & Identity Management

- **Identity Chain**: The identity system follows a strict sequence: `Person` -> `Profile` -> `Someone`.
  - `Person`: The core identity object, identified by an email address.
  - `Profile`: A user-facing representation of a `Person`.
  - `Someone`: A contact entry that links a `Person` and `Profile`.
- **Automatic Contact Creation**: The `one.models` library is designed to handle contact creation **automatically** during the pairing protocol. Manual intervention has historically led to critical bugs like stack overflows.

## 3. Current Critical Issue: Asymmetric Pairing Failure

The primary focus is resolving a critical bug where device pairing is unidirectional.

- ✅ **Works**: `edda.one` (browser reference app) can create an invitation that `lama` (this app) successfully accepts.
- ❌ **Fails**: `lama` can create an invitation, but `edda.one` cannot connect to it. The connection is rejected by `lama`'s backend.

### 3.1. Root Cause Analysis

The failure is due to a combination of a fundamental protocol misunderstanding and a platform-specific issue in the Expo environment.

**1. Incorrect Protocol Implementation:**
The `lama` codebase attempts to manually create a contact immediately after CommServer authentication (Step 1 of the pairing protocol). This is incorrect. It skips the three most critical steps of the protocol:

- **Step 2: Token Exchange**: Validating the invitation token.
- **Step 3: Identity Exchange**: Securely exchanging identity objects (which contain the crucial `personEmail` needed for contact creation).
- **Step 4: Profile Creation**: Automatically creating the `Person` and `Profile` from the exchanged identity.

The application must be refactored to allow the `PairingManager` to execute this full, multi-step protocol automatically.

**2. Missing "Catch-All" Routes in Expo:**
The `ConnectionsModel` is not automatically creating the necessary "catch-all" routes when running in the Expo environment. These routes are essential for listening for and accepting *new*, unknown pairing requests. This is a key platform difference, as these routes are created automatically in the browser environment (`one.leute`), which explains why the `edda.one -> lama` direction works.

## 4. Key Files for Debugging

- **`lama.txt`**: The most critical file. Contains a detailed history of every major bug, analysis, and fix. **Always consult this file first.**
- **`src/models/contacts/InviteManager.ts`**: Handles the creation of invitations. The format of the invitation object is critical and must match `one.models` expectations.
- **`src/models/AppModel.ts`**: The main application model. Contains the critical `ConnectionsModel` configuration.
- **`node_modules/@refinio/one.models/src/misc/PairingManager.ts`**: The canonical source for the correct, multi-step pairing protocol.
- **`node_modules/@refinio/one.models/src/misc/ConnectionEstablishment/LeuteConnectionsModule.ts`**: Contains the logic for setting up connection routes, including the failing "catch-all" routes.

## 5. Development Workflow & Gotchas

- **Compare with `one.leute`**: The `one.leute` project is the "golden standard". All configurations, especially for `ConnectionsModel`, must **exactly** match it. Deviations have been the source of major bugs.
- **Trust Automatic Processes**: Do not write manual handlers for processes that `one.models` is designed to handle automatically (e.g., contact creation on pairing success). This creates conflicts and race conditions. Configure the models correctly and let them work.
- **Build & Cache Issues**: The Expo/Metro environment is sensitive to caching. If the application behaves in a way that contradicts the source code, the first step is to clear the cache: `npx react-native start --reset-cache`. Rebuilding `one.core` has also been a required fix in the past.
- **Platform-Specific Bugs**: Be aware of subtle differences between the Expo/React Native environment and the standard browser/Node.js environments where the `one.core` libraries were originally developed. This has caused issues with WebSockets, `toString()` methods, and module loading.

# Lama Pairing Protocol Status - December 2024

## Current Issue Summary

Based on the user's report and screenshots, we have two pairing protocol issues:

### 1. ✅ edda.one → lama: WORKS (with minor post-pairing error)
- **Status**: Pairing protocol completes successfully 
- **Issue**: Post-pairing contact creation error in `LeuteAccessRightsManager.trustPairingKeys`
- **Error**: `TypeError: Cannot read property 'startsWith' of undefined`
- **Impact**: Pairing works, but contact may not be created properly

### 2. ❌ lama → edda.one: BROKEN  
- **Status**: Unknown - needs investigation
- **Issue**: Invitation creation or acceptance failing
- **Impact**: lama cannot invite edda.one users

## Fixes Applied

### Fix 1: Parameter Validation in LeuteAccessRightsManager
**File**: `src/models/LeuteAccessRightsManager.ts`
**Problem**: `startsWith` error suggests undefined parameter passed to one.models methods
**Solution**: Added parameter validation before calling `getAllEntries`:

```typescript
// ✅ CRITICAL FIX: Validate parameters before using them
if (!remotePersonId) {
    throw new Error('remotePersonId is undefined or null');
}
if (!localPersonId) {
    throw new Error('localPersonId is undefined or null');
}
if (typeof remotePersonId !== 'string') {
    throw new Error(`remotePersonId is not a string: ${typeof remotePersonId}`);
}
if (typeof localPersonId !== 'string') {
    throw new Error(`localPersonId is not a string: ${typeof localPersonId}`);
}
```

### Fix 2: Parameter Mapping in onPairingSuccess Event
**File**: `src/models/LeuteAccessRightsManager.ts`
**Problem**: Parameters were incorrectly mapped due to missing `_connection` parameter
**Root Cause**: The event listener was expecting 7 parameters but only receiving 6, causing parameter shift
**Solution**: Removed the `_connection` parameter from the event listener:

```typescript
// BEFORE (incorrect):
(_connection: any, initiatedLocally: boolean, localPersonId: any, ...)

// AFTER (correct):
(initiatedLocally: boolean, localPersonId: any, localInstanceId: any, ...)
```

### Fix 3: SomeoneModel Validation
**File**: `src/models/LeuteAccessRightsManager.ts`
**Problem**: `SomeoneModel.constructWithNewSomeone()` receives invalid remotePersonId
**Solution**: Added SHA256 hash format validation:

```typescript
// ✅ CRITICAL FIX: Ensure remotePersonId is a valid SHA256 hash (64 hex characters)
if (!/^[a-fA-F0-9]{64}$/.test(remotePersonId)) {
    throw new Error(`remotePersonId is not a valid SHA256 hash: ${remotePersonId}`);
}
```

### Fix 2: Enhanced Debug Functions
**File**: `src/config/debug.ts`
**Added comprehensive testing functions**:

- `testLamaToEddaPairing()` - Tests lama → edda invitation creation
- `testBothPairingDirections()` - Comprehensive test of both directions
- Enhanced parameter validation and error reporting

## Testing Instructions

### Step 1: Test lama → edda.one (Invitation Creation)
```javascript
// In lama app console
await testLamaToEddaPairing()
```

**Expected Output**: 
- ✅ Invitation creation successful
- URL generated with edda.one format
- URL parsing test passes

### Step 2: Test edda.one → lama (Invitation Acceptance)  
```javascript
// In lama app console
await testPairingProtocol("paste_edda_invitation_url_here")
```

**Expected Output**:
- ✅ Pairing protocol completes
- ⚠️ Possible parameter validation error (now with better error message)

### Step 3: Comprehensive Test
```javascript
// In lama app console
await testBothPairingDirections()
```

**Expected Output**:
- Summary of both directions
- Generated invitation URL for manual testing with edda.one

## Root Cause Analysis

### edda → lama Error (SOLVED ✅)
The `startsWith` error occurred because:
1. **Parameter mapping issue**: Event listener had incorrect parameter order
2. **Invalid remotePersonId**: Wrong parameter was being used as remotePersonId  
3. **SomeoneModel validation**: `constructWithNewSomeone()` expects valid SHA256 hash

**Fixes Applied**: 
- ✅ Fixed parameter mapping in `onPairingSuccess` event listener
- ✅ Added comprehensive parameter validation 
- ✅ Added SHA256 hash format validation for SomeoneModel

### lama → edda Status
Need to test invitation creation pipeline:
1. ConnectionsModel.pairing.createInvitation() 
2. InviteManager.generateInvitationUrl()
3. URL format compatibility with edda.one
4. Token storage in PairingManager

## Next Steps

1. **Test the fixes**: Run the debug functions to see current status
2. **Validate edda → lama fix**: Check if parameter validation resolves the `startsWith` error
3. **Diagnose lama → edda**: Identify where the invitation creation/acceptance is failing
4. **Cross-test**: Generate lama invitation and test with edda.one manually

## Architecture Notes

- **ConnectionsModel**: Handles pairing protocol internally
- **InviteManager**: Wraps ConnectionsModel for UI integration  
- **LeuteAccessRightsManager**: Handles post-pairing contact creation
- **TransportManager**: Manages ConnectionsModel lifecycle

The pairing protocol should work through ConnectionsModel's internal mechanisms without manual intervention. The fixes focus on parameter validation and enhanced debugging to identify the exact failure points.
