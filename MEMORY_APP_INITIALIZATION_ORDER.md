# App Initialization Order Memory

## Critical Understanding: Proper Initialization Sequence

Based on the error logs and examination of the codebase, here's the correct initialization order and timing requirements:

### 1. Current Initialization Flow

**Phase 1: Module Loading (Immediate)**
```
src/initialization/index.ts imported
↓
Debug helpers imported (debugHelpers.ts)
↓
Global functions registered on window/global
↓
initStartupDiagnostics() called immediately
↓
setTimeout(3000) set for diagnostic check
```

**Phase 2: App Component Lifecycle**
```
RootLayout component mounts
↓ 
[RootLayout] Starting initial setup using singleton...
↓
SingletonInitializer.initialize() called
↓
getAuthenticator() called (may be undefined initially)
↓
createInstance() called if needed
```

**Phase 3: ONE Platform Initialization (Async)**
```
MultiUser authenticator created
↓
Authentication/login flow
↓
AppModel created and initialized
↓
Models become available (leuteModel, channelManager, etc.)
↓
Transport connections established
```

### 2. Problem: Premature Function Calls

**The Issue:**
- `initStartupDiagnostics()` runs immediately when debugHelpers.ts is imported
- Sets setTimeout(3000) to check AppModel
- But AppModel creation happens AFTER authentication, which can take much longer
- Results in "AppModel not ready yet" message

**The Error:**
```
ERROR  ReferenceError: Property 'enableMessageSyncLogging' doesn't exist
```
This happened because I tried to call `enableAutoMessageDiagnostics()` before the function was defined.

### 3. Correct Diagnostic Timing

**Safe Timing Points:**

1. **Module Import Time** (immediate):
   - ✅ Register global functions
   - ✅ Set up event listeners for future use
   - ❌ Don't call functions that need AppModel

2. **After Authentication** (variable timing):
   - ✅ AppModel is available
   - ✅ Can call diagnostic functions
   - ✅ Can set up auto-monitoring

3. **After Connection Establishment** (user action dependent):
   - ✅ Transport connections exist
   - ✅ Can test access grants
   - ✅ Can monitor message sync

### 4. Initialization Lifecycle Events

**Key Lifecycle Hooks:**

1. `authInstance` becomes available → MultiUser ready
2. `isLoggedIn` becomes true → AppModel can be created  
3. `AppModel.state` reaches `Initialised` → Models are ready
4. Transport connections established → Can test access grants

### 5. Diagnostic Integration Strategy

**Safe Approaches:**

**Option A: Event-Driven Setup**
```typescript
// Register listeners that activate when conditions are met
function waitForAppModel(callback: () => void) {
  const check = () => {
    const appModel = (global as any).appModel;
    if (appModel) {
      callback();
    } else {
      setTimeout(check, 1000);
    }
  };
  check();
}
```

**Option B: Hook into Existing Events**
```typescript
// Hook into AppModel initialization completion
// Or RootLayout state changes
// Or authentication success events
```

**Option C: Manual Activation**
```typescript
// Provide functions for manual activation
// Let user call when ready: enableAutoMessageDiagnostics()
// Show guidance in startup logs
```

### 6. Fixed Implementation Strategy

**1. Remove Premature Auto-Activation:**
- Don't auto-enable diagnostics in startup
- Only register functions for manual use
- Show helpful guidance messages

**2. Increase Startup Diagnostic Delay:**
- Change from 3 seconds to 10+ seconds
- Or use event-driven approach
- Or disable automatic startup diagnostics

**3. Add Proper Error Handling:**
- Wrap all diagnostic functions in try-catch
- Check prerequisites before calling
- Fail gracefully if models not ready

### 7. Implementation Rules

**DO:**
- Register functions on window/global at import time
- Use long delays (10+ seconds) for automatic checks
- Check prerequisites before calling functions
- Provide manual activation options
- Show helpful guidance messages

**DON'T:**
- Call functions that need AppModel during import
- Assume any timing for AppModel availability  
- Auto-enable complex features during startup
- Use short delays for automatic activation

### 8. Timing Dependencies

**Functions by Readiness Level:**

**Level 1 - Import Time (immediate):**
- Function registration
- Global variable setup
- Event listener registration

**Level 2 - Authentication Complete (~5-15 seconds):**
- AppModel access
- Basic model queries
- Device info logging

**Level 3 - Models Initialized (~10-30 seconds):**
- Channel management
- Access grant queries
- Transport status

**Level 4 - Connections Established (user dependent):**
- Remote person testing
- CHUM sync monitoring
- Message sync diagnostics

### 9. Error Recovery

**If Initialization Fails:**
1. Don't crash the entire app
2. Provide manual recovery options
3. Show clear error messages
4. Allow retry mechanisms
5. Gracefully degrade functionality

### 10. Best Practices

**Defensive Programming:**
```typescript
// Always check prerequisites
const appModel = (global as any).appModel;
if (!appModel) {
  console.log('AppModel not ready - try again later');
  return;
}

// Use proper error boundaries
try {
  await enableAutoMessageDiagnostics();
} catch (error) {
  console.log('Failed to enable diagnostics:', error);
}
```

**User Guidance:**
```typescript
// Show what's available and when
console.log('Available now: createTestSummary()');
console.log('Available after pairing: enableAutoMessageDiagnostics()');
```

This memory captures the critical understanding that AppModel availability is asynchronous and user-dependent, not just time-dependent. Diagnostic functions must be designed with this in mind.