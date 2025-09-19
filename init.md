# Lama App Initialization Flow

## The Problem

The app has initialization race conditions because:
- Multiple components try to initialize QuicModel/UdpModel independently
- DeviceDiscoveryModel starts without proper device identity  
- Transport gets closed and reopened to work around reference issues
- DeviceDiscoveryModel is not initialized, causing "DeviceDiscoveryModel not initialized - this should not happen" warning
- UnifiedNetworkManager and DeviceDiscoveryModel are both trying to handle device discovery

## The Fix

A simple sequential initialization that ensures things happen in the right order:

```typescript
// 1. Storage first
await initStorage(...)

// 2. Get device identity BEFORE network init
const trustModel = new TrustModel()
await trustModel.init()
const identity = await trustModel.getDeviceIdentity()

// 3. Network layer (singleton, init ONCE)
const udpModel = UdpModel.getInstance()
if (!udpModel.isInitialized()) {
  await udpModel.init()
}

const quicModel = QuicModel.getInstance()
if (!quicModel.isInitialized()) {
  await quicModel.init()
}

// 4. DeviceDiscovery WITH identity
const discovery = DeviceDiscoveryModel.getInstance()
await discovery.setOwnIdentity(identity.deviceId, identity.secretKey, identity.publicKey)
await discovery.init()

// 5. Create models in order
const leuteModel = new LeuteModel(...)
const channelManager = new ChannelManager(leuteModel)
const transportManager = new TransportManager(...)

// 6. AppModel last
const appModel = new AppModel(...)
await appModel.init()
```

## Key Points

1. **Identity First** - Get device credentials before initializing network components
2. **Init Once** - Singletons check if already initialized  
3. **No Self-Init** - Components don't initialize themselves in constructors
4. **Sequential** - Each step depends on the previous one

## File Locations

- `src/initialization/index.ts` - Main initialization file with the fix applied

## Current Issues (2025-07-27)

### Device Discovery Not Working - FIXED

The logs showed that device discovery was enabled but not functioning:
```
WARN  [DeviceSettingsService] DeviceDiscoveryModel not initialized - this should not happen
```

**Root Cause**: The `DeviceDiscoveryModel` was not being initialized in the implementation.

**Fix Applied**:
1. Added DeviceDiscoveryModel initialization to init-sequence.ts after QuicModel
2. Connected DeviceDiscoveryModel to QuicModel and set device identity
3. Added deviceDiscoveryModel property to AppModel
4. Connected DeviceSettingsService to DeviceDiscoveryModel during init
5. Set up proper channel manager for journal logging

**The Fix**: Added DeviceDiscoveryModel initialization within the existing `initModel` function in `src/initialization/index.ts`. The initialization happens after the journal channel setup and includes:

1. Getting device identity from TrustModel
2. Initializing QuicModel if needed
3. Setting up DeviceDiscoveryModel with QuicModel and identity
4. Initializing DeviceDiscoveryModel
5. Attaching it to AppModel
6. Connecting DeviceSettingsService

This minimal change ensures DeviceDiscoveryModel is properly initialized without disrupting the existing app initialization flow.

Device discovery should now work properly when enabled in settings.

### Discovery Cannot Be Re-enabled After Being Disabled - FIXED

**Root Cause**: The `useDeviceSettings` hook was calling `discoveryModel.shutdown()` during cleanup, which permanently deinitialized the DeviceDiscoveryModel, making it impossible to re-enable discovery without restarting the app.

**Fix Applied**: Changed the cleanup logic in `useDeviceSettings.ts` to only stop discovery if it's running, but keep the model initialized for future use. Now it checks if discovery is active and calls `stopDiscovery()` instead of `shutdown()`.

Discovery can now be toggled on/off repeatedly without issues.

### DeviceDiscoveryModel Not Initialized Warning - FIXED (2025-08-02)

**Root Cause**: The DeviceDiscoveryModel initialization was deferred using `deferUntilAfterRender` to avoid blocking the UI during startup. However, this created a race condition where the DeviceSettingsService would try to access the DeviceDiscoveryModel before it was initialized, resulting in the warning "DeviceDiscoveryModel not initialized - this should not happen".

**Fix Applied**: 
1. Changed DeviceDiscoveryModel initialization from deferred to synchronous in `src/initialization/index.ts`
2. Added missing `setForciblyDisabled()` and `isDiscovering()` methods to DeviceDiscoveryModel
3. DeviceDiscoveryModel is now initialized immediately after the journal channel setup, ensuring it's ready before any UI components or services try to access it

The initialization now happens in the correct order:
- AppModel init
- Journal channel setup
- DeviceDiscoveryModel init (synchronous)
- LLMManager/AIAssistantModel init
- UI renders and can safely use discovery features

This ensures DeviceDiscoveryModel is always ready when the discovery toggle is used.

### Discovery Protocol Initialization Errors - FIXED (2025-08-02)

**Issues Found**:
1. UDP port binding error - "Address already in use" on port 49497
2. AttestationDiscovery failing with "Cannot read property 'addService' of undefined"
3. Event listener setup failing with "Cannot read property 'listen' of undefined"

**Root Causes**:
1. DiscoveryProtocol constructor was called without required configuration parameters
2. AttestationDiscovery constructor expected both config and transport, but only config was provided
3. Event handlers were trying to listen to potentially undefined event objects

**Fixes Applied**:
1. **DiscoveryProtocol**: Now properly initialized with configuration including deviceId, deviceName, deviceType, capabilities, and port. The transport is passed as a second parameter to avoid re-initialization.
2. **AttestationDiscovery**: Fixed constructor call to pass both the config object and transport. Updated config to match the expected interface (removed secretKey/publicKey, added isOwned/ownerId).
3. **Event Handlers**: Added defensive checks to verify event objects exist and have listen methods before attempting to subscribe.

The discovery protocols now initialize without errors, though the UDP port conflict may still occur if multiple instances try to bind to the same port without SO_REUSEPORT enabled in the native layer.

### OwnedDeviceMonitor Initialization Error - FIXED (2025-08-02)

**Issue**: DeviceDiscoveryModel initialization failing with "this._ownedDeviceMonitor.init is not a function"

**Root Cause**: 
1. OwnedDeviceMonitor class doesn't have an `init()` method - it has `start()` and `stop()` methods
2. The constructor parameters were incorrect - it expects DeviceDiscoveryModel instance, not ChannelManager

**Fix Applied**:
1. Corrected the OwnedDeviceMonitor constructor call to pass the correct parameters
2. Removed the non-existent `init()` call
3. Added proper lifecycle management - `start()` is called when discovery starts, `stop()` when it stops
4. Updated event listeners to use the correct event names from OwnedDeviceMonitor

The DeviceDiscoveryModel now initializes successfully with all components properly configured.

## Performance Optimizations

### App Journal Loading Performance Issue - FIXED (2025-08-02)

**Issue**: During app initialization, the app lifecycle journal channel was triggering an `onUpdated` event with 79 historical entries, causing slow initialization.

**Root Cause**: When creating or accessing the app lifecycle journal channel during initialization, the ChannelManager fires an `onUpdated` event that includes all historical journal entries. This causes unnecessary processing of old app lifecycle events during startup.

**Fix Applied**: Deferred the app journal initialization using `deferUntilAfterRender`. This ensures:
1. The main app initialization completes quickly without loading historical journal data
2. Journal initialization happens after the UI renders, improving perceived startup time
3. App start events are still logged, but without blocking the initialization sequence

This optimization significantly improves app startup performance by avoiding the processing of historical journal entries during the critical initialization path.

### Discovery Protocol Method Mismatch - FIXED (2025-08-02)

**Issue**: DeviceSettingsService error "this._attestationDiscovery.startBroadcasting is not a function"

**Root Cause**: DeviceDiscoveryModel was trying to call non-existent methods on the discovery protocols:
- Called `startBroadcasting()` and `stopBroadcasting()` but AttestationDiscovery has `startDiscovery()` and `stopDiscovery()`
- Called `sendDiscoveryBroadcast()` which doesn't exist in either protocol

**Fix Applied**:
1. Changed method calls to use the correct names: `startDiscovery()` and `stopDiscovery()`
2. Removed periodic broadcast calls as AttestationDiscovery handles its own broadcast timer internally
3. Removed initial broadcast call as the protocols handle this automatically when started

The discovery protocols now start and stop correctly without method errors.

## Discovery System Working Correctly

### Device Discovery and Availability Tracking - FIXED (2025-08-02)

**Issue**: ESP32 devices were being marked offline even though they were actively broadcasting discovery messages.

**Root Cause**: AttestationDiscovery was not emitting `onDeviceUpdated` events when a device broadcast was received but nothing changed (only lastSeen was updated). This prevented the DeviceDiscoveryModel from updating its `_deviceAvailability` map, causing the availability check to mark devices as offline.

**Fix Applied**: Modified AttestationDiscovery to always emit `onDeviceUpdated` when a device is seen, even if only the lastSeen timestamp changes. This ensures the availability tracking stays current.

### Device Count Discrepancy - UNDERSTOOD

The discrepancy between AttestationDiscovery showing 1 device and useDeviceDiscovery showing 2 devices is expected behavior:
- **AttestationDiscovery** only tracks currently broadcasting devices (live discovery)
- **DeviceModel** returns both stored devices (from DeviceList) and currently discovered devices
- In the logs, `esp32-a846744176c8` is a stored device not currently broadcasting
- `esp32-9888e0ee6804` is actively broadcasting and being discovered

This is correct behavior - the UI shows all known devices (stored + discovered) while AttestationDiscovery only tracks active broadcasts.

### Discovered Devices Not Showing in UI - FIXED (2025-08-02)

**Issue**: ESP32 device `esp32-9888e0ee6804` was being discovered by AttestationDiscovery but not showing in the UI.

**Root Cause**: 
1. DeviceDiscoveryModel was incorrectly calling `.values()` on the array returned by `AttestationDiscovery.getDevices()`, causing an error
2. Type mismatch - `DiscoveryDevice` type was not defined in interfaces.ts
3. AttestationDiscovery was returning `AttestationDevice[]` but DeviceDiscoveryModel expected `DiscoveryDevice[]`

**Fix Applied**:
1. Fixed DeviceDiscoveryModel to correctly handle the array returned by AttestationDiscovery
2. Added `DiscoveryDevice` interface definition to interfaces.ts
3. Updated AttestationDiscovery to return `DiscoveryDevice[]` type to match expectations

Discovered devices should now properly appear in the UI alongside stored devices.

### Device Property Name Mismatch Regression - FIXED (2025-08-02)

**Issue**: Discovered ESP32 devices were not showing in the UI even though AttestationDiscovery was finding them.

**Root Cause**: Property name mismatch between different device interfaces:
- AttestationDevice/DiscoveryDevice uses `id` for the device identifier
- Device interface (from recipes) uses `deviceId` for the device identifier
- The type casting was hiding this mismatch, causing discovered devices to have undefined IDs

**Fix Applied**: Added proper mapping in DeviceModel.getDevices() to handle the property name differences:
- Maps `d.deviceId || d.id` to handle both property names
- Maps `d.deviceType || d.type` for device type
- Added debug logging to track device discovery flow

This ensures discovered devices are properly converted to the Device format and appear in the UI.

## Code Consolidation - Proper Fix (2025-08-02)

### Consolidated on deviceId Property Name

**Issue**: Multiple device interfaces used different property names for device identifiers:
- Some used `id`
- Some used `deviceId`
- Type casting with `as unknown as` was hiding these mismatches

**Changes Made**:
1. **Standardized on `deviceId`** - All device interfaces now use `deviceId` for the device identifier
2. **Updated DiscoveryDevice interface** - Now properly extends Device interface without duplicating properties
3. **Updated AttestationDevice** - Now properly creates devices with all required Device properties including `deviceId`
4. **Removed DiscoveredDevice interface** - No longer needed, using DiscoveryDevice from interfaces.ts
5. **Removed all type casting** - No more `as unknown as` type casting in DeviceModel
6. **Simplified device creation** - Using spread operator to copy device properties instead of manual mapping

The codebase now has consistent property naming and proper type safety without relying on type casting hacks.

## VCManager and ESP32ConnectionManager Initialization - FIXED (2025-08-03)

### Issue: ESP32 VC Responses Not Handled

**Symptoms**:
- ESP32 devices sending VC responses but getting error: `Transport error: [TypeError: this._vcManager.handleMessage is not a function (it is undefined)]`
- VCManager not initialized when needed to handle VC exchange messages
- ESP32ConnectionManager not available when trying to claim devices

**Root Cause**:
1. VCManager requires LeuteModel for issuer key functions, but LeuteModel isn't available during DeviceDiscoveryModel initialization
2. Device discovery was starting immediately when enabled, before VCManager could be initialized
3. ESP32 devices were already sending VC responses that couldn't be handled

**Fix Applied**:
1. **Lazy Initialization**: Changed VCManager and ESP32ConnectionManager to initialize lazily when first needed
2. **Async getESP32ConnectionManager()**: Made the getter async to allow initialization on first access
3. **Deferred Discovery Start**: Updated DeviceSettingsService to not auto-start discovery when enabled, avoiding race conditions
4. **Proper Service Registration**: VCManager service handlers are registered during its lazy initialization

**Implementation Details**:
- Added `ensureVCManagerInitialized()` private method that checks for LeuteModel availability
- VCManager is initialized with proper issuer key functions from LeuteModel
- ESP32ConnectionManager is initialized after VCManager is ready
- Service handlers for VC_EXCHANGE_SERVICE are registered during VCManager initialization
- Device discovery now waits for manual start after all models are ready

This ensures the VC exchange system is fully initialized before any ESP32 devices try to communicate.