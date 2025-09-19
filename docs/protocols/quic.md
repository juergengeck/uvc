# QUIC Transport Architecture

## Updated Architecture

Based on the evaluation of the current system and best practices for maintainable code, we've implemented a cleaner architecture with:

1. **Platform-agnostic interface** in `one.core/src/system` - This defines the contract all implementations must follow
2. **Platform-specific implementation** in `src/system/expo` - The Expo-specific implementation of the QUIC transport
3. **Direct imports** of the needed implementation rather than complex factory patterns

### Key Changes

1. **Simplified Implementation**: 
   - Removed the redundant `MinimalQuicTransport`/`PassthroughQuicTransport` classes
   - Kept only the `ExpoQuicTransport` class which extends `EventEmitter` properly
   - Ensured all required EventEmitter methods are available

2. **Interface Compliance**:
   - Made sure `ExpoQuicTransport` implements all required methods
   - Added proper event handling for socket messages and errors
   - Implemented broadcast functionality for device discovery

3. **Type Safety**:
   - Added TypeScript augmentation for the `QuicTransport` interface
   - Ensures type safety when using EventEmitter methods

4. **Testing**:
   - Created a test script in `src/test-quic.js` to verify the implementation
   - Added a test button to the UDPDiagnostic component

## Implementation Details

### ExpoQuicTransport

The `ExpoQuicTransport` class in `one.core/lib/system/expo/quic-transport.js` now:
- Extends `EventEmitter` for proper event handling
- Implements all required methods for QUIC transport
- Includes proper event handling for socket messages and errors
- Provides a `sendBroadcast` method for device discovery

### QuicModel

The `QuicModel` class in `src/models/network/QuicModel.ts`:
- Imports and registers the platform-specific implementation
- Sets up proper event handlers
- Provides a clean API for QUIC transport functionality
- Has a diagnostic test function `runTransportTests()`

## Testing

To test the implementation:
1. Navigate to the UDPDiagnostic screen in the app
2. Click the "Test QUIC Transport" button
3. The test verifies:
   - The transport is an instance of EventEmitter
   - Required methods like `on()` and `emit()` are available
   - Event handling works correctly

## Next Steps

For future improvements:
1. Properly document the QuicTransport interface
2. Implement more robust error handling
3. Add more comprehensive tests
4. Create implementations for other platforms as needed

# QUIC Socket Lifecycle Analysis

## Problem
The application was experiencing errors with the UDP socket used for device discovery:
```
[DeviceDiscoveryModel] Error sending periodic discovery request: Error: Invalid socket: Socket not created or already closed
```

## Root Causes

### 1. Shared Socket Instance with Multiple Consumers

The `QuicModel` maintained a single `_discoverySocket` instance that was shared across multiple components:

- `DeviceDiscoveryModel` uses it for periodic device discovery
- `UDPDiagnostic` and other diagnostic components access it directly
- `ESP32TestButton` also directly accesses the socket

This shared access created potential race conditions where one component might close or invalidate the socket while another is still using it.

### 2. Inconsistent Socket Lifecycle Management

There was inconsistency in how socket lifecycle was managed:

- `QuicModel.getDiscoverySocket()` created a socket if one doesn't exist and returned the same instance to all callers
- `DeviceDiscoveryModel.stopDiscovery()` nullified its reference to the socket but didn't close it
- `DeviceDiscoveryModel.shutdown()` actually closed the socket
- `QuicModel.shutdown()` also closed the socket

This dual ownership model led to confusion about which component is responsible for the socket's lifecycle, potentially causing both premature closures and leaks.

### 3. Timing Issues with Async Operations

- When `DeviceDiscoveryModel` started discovery, it set up an interval to send periodic discovery requests
- If the socket became invalid (closed by another component or times out), the interval was still active and would attempt to use an invalid socket
- The error occurred because there was no synchronization between the socket's lifecycle and the discovery interval

### 4. Missing Clear Ownership Boundaries

The architecture didn't establish clear ownership boundaries for the discovery socket:

- The `QuicModel` created and held the socket
- The `DeviceDiscoveryModel` used and could close it
- Other diagnostic components accessed it directly
- No component explicitly tracked who was using the socket or coordinated its lifecycle

## Solution Implemented

We implemented a reference counting mechanism to properly manage socket lifecycles:

### 1. Socket Reference Counting in QuicModel

- Added `acquireDiscoverySocket(userId, port?)` method that tracks socket users
- Added `releaseDiscoverySocket(userId)` method to signal when a user is done with the socket
- Added `_socketUsers` Map to track which components are using the socket
- Socket is only closed when all users have released it
- Added event notifications for socket state changes via `onSocketStateChanged` event

### 2. Updated DeviceDiscoveryModel

- Modified to use the new `acquireDiscoverySocket` and `releaseDiscoverySocket` methods
- Created a proper shutdown sequence that releases the socket instead of closing it directly
- Added internal method `_stopDiscoveryInternal` that handles proper resource cleanup

### 3. Updated UDPDiagnostic Component

- Implemented proper socket acquisition and release in the component
- Used `useEffect` to ensure the socket is released when the component unmounts
- Added explicit UI controls for socket acquisition and release
- Improved error handling and user feedback

### 4. Socket Event Propagation

- Added `onSocketStateChanged` event to notify consumers of socket state changes
- Components can react to external socket closures gracefully

## Benefits of the Implementation

1. **Clear Ownership**: `QuicModel` is now the sole owner of socket lifecycle (creation/closure)
2. **Reference Counting**: Socket stays open as long as at least one component is using it
3. **Proper Cleanup**: Components cleanly release their references when done
4. **Error Resilience**: Components can react to socket errors without crashing
5. **User Experience**: Diagnostic components provide better feedback about socket state

## Future Improvements

1. Add socket pooling for different types of sockets
2. Implement socket recreation if it becomes invalid during use
3. Add more comprehensive socket state monitoring and diagnostics
4. Consider implementing a timeout for inactive sockets to free up resources
5. Add unit tests for the reference counting mechanism 