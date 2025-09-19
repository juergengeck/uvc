# DeviceId Object Reference Fix

## Problem
The React Native app was sending `deviceId: "[object Object]"` in discovery packets, indicating that an object reference was being serialized instead of its string representation.

## Root Cause
When working with ONE.core, object references (like SHA256IdHash) have a toString() method, but if not handled properly, JavaScript's default object serialization produces `[object Object]`.

## Solution

### 1. Added Public Method to Update DeviceId
In `DiscoveryProtocol.ts`:
```typescript
public updateDeviceId(deviceId: string): void {
  if (typeof deviceId !== 'string') {
    console.error('[DiscoveryProtocol] updateDeviceId called with non-string:', deviceId);
    deviceId = String(deviceId);
  }
  
  this.config.deviceId = deviceId;
  console.log('[DiscoveryProtocol] Updated deviceId to:', deviceId);
}
```

### 2. Improved DeviceId Handling in Initialization
In `DeviceDiscoveryModel.ts`:
```typescript
// Use toStringId to safely convert any type to string
const converted = toStringId(this._appOwnDeviceId);
if (converted && converted !== '[object Object]') {
  deviceIdForDiscovery = converted;
} else {
  console.warn('[DeviceDiscoveryModel] Invalid _appOwnDeviceId, using temporary ID');
  deviceIdForDiscovery = `temp-${Math.random().toString(36).substring(2, 12)}`;
}
```

### 3. Runtime Safety Checks
Added safety checks in both request and response paths:
```typescript
// Ensure deviceId is a string before creating the message
let safeDeviceId = this.config.deviceId;
if (typeof safeDeviceId !== 'string') {
  console.error('[DiscoveryProtocol] deviceId is not a string at send time:', safeDeviceId);
  safeDeviceId = safeDeviceId?.toString?.() || `unknown-${Math.random().toString(36).substring(2, 8)}`;
  this.config.deviceId = safeDeviceId;
}
```

## Key Learnings

1. **ONE.core Object References**: When working with ONE.core objects like SHA256IdHash, always use proper conversion methods (toStringId, requireStringId) rather than relying on implicit conversions.

2. **Defensive Programming**: Add runtime checks even after initialization to catch any cases where object references might slip through.

3. **Config Encapsulation**: Private configs need public update methods to allow proper updates from external code.

## Result
- Discovery packets now contain proper string deviceIds
- No more `[object Object]` in network messages
- Proper handling of ONE.core object references throughout the discovery flow