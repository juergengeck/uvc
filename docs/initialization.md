# Application Initialization Architecture

## Overview

The LAMA application follows a three-phase initialization pattern inspired by the ONE.leute reference implementation:

1. **Platform Setup** - Core platform and crypto initialization
2. **Authentication** - User login/registration
3. **Model Initialization** - User-dependent models and services

## Key Principles

### 1. Deferred User-Dependent Initialization
All user-dependent activities (models, networking, storage) MUST be deferred until after login completion. This ensures:
- Fast login experience
- Clear error boundaries
- Proper state management

### 2. Singleton Pattern for Critical Services
Services that manage global state use singleton patterns:
- `ChannelManager` - Message and channel management
- `ModelService` - AppModel instance management
- Authentication instance - Single MultiUser instance

### 3. Strict Initialization Order
Components must be initialized in dependency order to ensure proper event handler registration and state management.

## Initialization Flow

### Phase 1: Platform Setup

```typescript
// Happens once at app start
1. Platform initialization (crypto, storage base)
2. Create MultiUser authenticator instance
3. Attach login/logout event handlers
4. Ready for user interaction
```

### Phase 2: Authentication

```typescript
// User-triggered login
1. User provides credentials
2. loginOrRegisterWithKeys() called
3. Minimal work during login:
   - Verify credentials
   - Store in secure storage
   - Update auth state
4. Auth state changes to 'logged_in'
5. Login complete (fast)
```

### Phase 3: Model Initialization

```typescript
// Triggered by UI providers after detecting logged_in state
1. OneProvider detects auth state = 'logged_in'
2. Calls initModelAfterLogin()
3. Heavy initialization begins:
   
   a. Storage initialization
   b. ObjectEventDispatcher setup
   c. LeuteModel creation
   d. ChannelManager creation and initialization
   e. TransportManager creation
   f. Access control groups setup
   g. LeuteAccessRightsManager creation
   h. AppModel assembly
   i. Network layer activation
   
4. Model ready event emitted
5. UI updates with initialized model
```

## Component Initialization Order

The strict initialization order is critical for proper operation:

```
1. ObjectEventDispatcher
   └── Required by all event-driven models
   
2. LeuteModel
   └── Core identity and contact management
   
3. ChannelManager (create & initialize)
   ├── Depends on: LeuteModel, ObjectEventDispatcher
   └── Must be initialized BEFORE LeuteAccessRightsManager
   
4. TransportManager
   ├── Depends on: LeuteModel, ChannelManager
   └── Manages network connections
   
5. Access Control Groups
   └── Created via LeuteModel
   
6. LeuteAccessRightsManager
   ├── Depends on: ChannelManager (initialized), TransportManager, LeuteModel
   └── Registers event handlers in constructor
   
7. AppModel
   └── Aggregates all models and services
```

## Critical Implementation Details

### ChannelManager Initialization

```typescript
// CORRECT: Initialize before creating dependent components
const channelManager = createChannelManager(leuteModel);
await initializeChannelManager(); // Registers recipes
const leuteAccessRightsManager = new LeuteAccessRightsManager(channelManager, ...);

// WRONG: Would cause "registry cache" errors
const channelManager = createChannelManager(leuteModel);
const leuteAccessRightsManager = new LeuteAccessRightsManager(channelManager, ...);
await channelManager.init(); // Too late - constructor already used it
```

### Recipe Registration

Recipes are registered ONCE during MultiUser creation:
- `RecipesStable` - Core ONE platform recipes
- `RecipesExperimental` - Experimental platform recipes  
- `ALL_RECIPES` - Application-specific recipes

The "Populating the registry cache is only allowed if it is empty!" error occurs when:
- Multiple ChannelManager instances try to register recipes
- ChannelManager.init() is called multiple times
- MultiUser instance is recreated without clearing the global recipe registry

### Singleton Management

```typescript
// ChannelManager singleton ensures single instance
let channelManagerInstance: any = null;

export function createChannelManager(leuteModel: any): any {
  if (channelManagerInstance) {
    return channelManagerInstance; // Reuse existing
  }
  // Create new instance
}

// Clear on logout to allow fresh start
export function clearChannelManagerInstance(): void {
  channelManagerInstance = null;
  isInitialized = false;
}
```

### Authentication State Management

```typescript
// Global authenticator persists across app lifecycle
let authInstance: MultiUser | undefined = undefined;

// On logout, clear the instance to force recreation
auth.onLogout(async () => {
  // ... cleanup ...
  authInstance = undefined; // Critical for recipe registry
});
```

## Error Handling

### Common Initialization Errors

1. **"Populating the registry cache is only allowed if it is empty!"**
   - Cause: Attempting to register recipes multiple times
   - Fix: Ensure single initialization path, proper singleton usage

2. **"Cannot read property 'onPairingSuccess' of undefined"**
   - Cause: ConnectionsModel not initialized before use
   - Fix: Ensure TransportManager.init() completes

3. **"Model not available"**
   - Cause: Attempting to use model before initialization completes
   - Fix: Wait for onModelReady event or check model existence

### Initialization Safeguards

```typescript
// Prevent concurrent initialization
const existingModel = getModel();
if (existingModel) {
  return existingModel; // Already initialized
}

// Check auth state before proceeding
if (authenticator.authState.currentState !== 'logged_in') {
  throw new Error('Cannot initialize model - user not logged in');
}
```

## Testing Initialization

### Manual Testing

1. **Fresh Start**: Clear app data, login, verify initialization order in logs
2. **Logout/Login**: Logout, login again, verify no registry errors
3. **Fast Login**: Multiple rapid login attempts should not cause errors
4. **Network Issues**: Initialization should handle network failures gracefully

### Log Verification

Correct initialization produces logs in this order:
```
[Initialization] Creating authenticator instance...
[Login] Login successful
[OneProvider] No model available - initializing after login
[initModel] Starting model initialization...
[initModel] Creating LeuteModel...
[initModel] Creating ChannelManager...
[initModel] Initializing ChannelManager...
[initModel] Creating TransportManager...
[initModel] Creating LeuteAccessRightsManager...
[initModel] Model initialization completed successfully!
```

## Best Practices

1. **Never initialize user-dependent models during login**
2. **Always check model existence before initialization**
3. **Use singletons for global state managers**
4. **Clear singletons and global state on logout**
5. **Follow strict initialization order**
6. **Handle initialization errors gracefully**
7. **Emit events for UI synchronization**

## Future Improvements

1. **Lazy Model Loading**: Initialize models on-demand rather than all at once
2. **Parallel Initialization**: Identify independent components for parallel init
3. **Progressive Loading**: Show partial UI while models initialize
4. **Retry Logic**: Automatic retry for transient failures
5. **State Persistence**: Restore partial state after app restart