# UDP Module Documentation

## Overview

The UDP module (`@lama/react-native-udp-direct`) is a high-performance React Native module that provides direct UDP socket functionality with zero-copy buffer support. It has been packaged as a standalone npm module and is optimized for React Native 0.79.2+.

## Current Status

### Package Location
- **npm package**: `@lama/react-native-udp-direct`
- **Vendor tarball**: `vendor/lama-react-native-udp-direct-1.4.0.tgz`
- **Source code**: `packages/react-native-udp-direct/`

### Key Features
- Native UDP socket support for iOS
- **Zero-copy binary datapath via JSI (no Base64 conversion)**
- TurboModule used only for socket *control* (create/bind/close, options)
- Event-driven architecture with proper thread safety
- TypeScript definitions included
- **Full SO_REUSEADDR and SO_REUSEPORT support**

## Architecture

### Module Structure
```
@lama/react-native-udp-direct/
├── src/                    # TypeScript source
│   ├── index.ts           # Main module export
│   └── NativeUdpModule.ts # Type definitions
├── ios/                   # iOS native implementation
│   ├── UDPDirectModule.{h,mm}         # Main module entry point
│   ├── UDPSocketManager.{h,mm}        # Core UDP socket management
│   ├── UDPDirectModuleCxxImpl.{h,mm}  # C++ JSI implementation
│   ├── SharedBufferHostObject.{h,mm}  # Zero-copy buffer implementation
│   └── UDPDirectModuleSpecJSI.h       # Generated TurboModule spec
└── react-native-udp-direct.podspec    # iOS pod configuration
```

### Key Components

1. **UDPSocketManager** (Objective-C++)
   - Core UDP operations using GCDAsyncUdpSocket
   - Socket lifecycle management (create, bind, send, close)
   - Native buffer allocation and tracking
   - Thread-safe event handling

2. **UDPDirectJSI** (C++)
   - Pure JSI implementation for high-performance operations
   - Installs global `udpSendDirect` function
   - Provides `_udpJSI` namespace with socket operations
   - Zero-copy ArrayBuffer support

3. **UDPDirectModule** (Objective-C++)
   - React Native module interface
   - Installs JSI bindings on initialization
   - TurboModule integration for compatibility

4. **UDPSocketJSI** (TypeScript)
   - High-level JavaScript wrapper around JSI functions
   - Event-driven API similar to Node.js dgram
   - Automatic event handler management

## Installation & Setup

### Installation
```bash
# The module is already configured in package.json:
"@lama/react-native-udp-direct": "file:./vendor/lama-react-native-udp-direct-1.2.0.tgz"

# Install dependencies
npm install

# iOS setup
cd ios && pod install
```

### Prebuild Process
The module is automatically linked during the Expo prebuild process:
```bash
npx expo prebuild --clean
```

No additional configuration or plugins are required - the module uses React Native's autolinking.

## API Reference

The module provides two interfaces:
1. **TurboModule interface** - For control operations (create, bind, close)
2. **JSI interface** - For high-performance data operations

### JSI Interface (Recommended)

```typescript
import { createUDPSocket, isJSIAvailable } from '@lama/react-native-udp-direct';

// Check if JSI is available
if (isJSIAvailable()) {
  // Create socket using JSI
  const socket = await createUDPSocket({
    type: 'udp4',
    reuseAddr: true,
    broadcast: true
  });

  // Bind to port
  await socket.bind(60000, '0.0.0.0');

  // Set up event handlers
  socket.on('message', (event) => {
    console.log(`Received from ${event.address}:${event.port}`);
    // Zero-copy access to received data via ArrayBuffer
    const data = new Uint8Array(event.data);
    console.log('Data:', new TextDecoder().decode(data));
  });

  // Zero-copy send
  const message = new TextEncoder().encode('Hello UDP!');
  await socket.send(message, 60000, '192.168.1.255');

  // Direct global function also available
  (global as any).udpSendDirect(socketId, data.buffer, data.byteOffset, data.byteLength, 60000, '203.0.113.10');
}
```

### TurboModule Interface (Legacy)

```typescript
import UDPDirectModule from '@lama/react-native-udp-direct';

// Traditional TurboModule approach
const { socketId } = await UDPDirectModule.createSocket({
  type: 'udp4',
  reuseAddr: true,
  broadcast: true,
});
await UDPDirectModule.bind(socketId, 60000, '0.0.0.0');
```

### Creating a Socket
```typescript
import UDPDirectModule from '@lama/react-native-udp-direct';

const { socketId } = await UDPDirectModule.createSocket({
  type: 'udp4',
  reuseAddr: true,    // Sets SO_REUSEADDR
  reusePort: true,    // Sets BOTH SO_REUSEADDR and SO_REUSEPORT
  broadcast: true
});
```

#### Socket Options
- **type**: 'udp4' or 'udp6' (default: 'udp4')
- **reuseAddr**: Enable SO_REUSEADDR to allow address reuse (default: false)
- **reusePort**: Enable SO_REUSEPORT to allow multiple processes to bind to the same port. When true, automatically sets SO_REUSEADDR as well (default: false)
- **broadcast**: Enable broadcast capability (default: false)

### Binding to a Port
```typescript
await UDPDirectModule.bind(socketId, 12345, '0.0.0.0');
```

### Sending Data

#### High-performance binary send (JSI)
```typescript
// socketId obtained from UDPDirectModule.createSocket()
const payload = new Uint8Array([0x01, 0x02, 0x03]);
// global.udpSendDirect is installed by the native module at startup
(global as any).udpSendDirect(socketId, payload.buffer, payload.byteOffset, payload.byteLength, 12345, '192.168.1.50');
```
`udpSendDirect(socketId: string, buffer: ArrayBuffer, offset: number, length: number, port: number, address: string)`
performs a zero-copy transfer: the ArrayBuffer memory is handed straight to native code and written to the socket, respecting the offset and length for proper Uint8Array view support.

> There is **no Base64 path**. If you still have legacy code using `send(base64Data, …)` you must convert it to `udpSendDirect`.

### Receiving Data

#### Zero-Copy Receive (JSI)
```typescript
// Using JSI socket wrapper
socket.on('message', (event) => {
  console.log(`Received from ${event.address}:${event.port}`);
  // Direct ArrayBuffer access - no copying!
  const data = new Uint8Array(event.data);
  console.log('Data:', new TextDecoder().decode(data));
});
```

#### Legacy Base64 Receive (TurboModule)
```typescript
import { DeviceEventEmitter } from 'react-native';

const subscription = DeviceEventEmitter.addListener('message', (event) => {
  console.log('Received:', {
    socketId: event.socketId,
    data: Buffer.from(event.data, 'base64').toString(),
    address: event.address,
    port: event.port
  });
});

// Clean up
subscription.remove();
```

### Zero-Copy Buffers
```typescript
// Create a buffer
const { bufferId } = await UDPDirectModule.createSharedArrayBuffer(1024);

// Send using the buffer
await UDPDirectModule.sendFromArrayBuffer(
  socketId,
  bufferId,
  0,     // offset
  1024,  // length
  12345, // port
  '192.168.1.255'
);

// Release when done
await UDPDirectModule.releaseSharedArrayBuffer(bufferId);
```

## Technical Details

### Zero-Copy Implementation
The module achieves true zero-copy for both send and receive operations:

#### Send Operations
- JavaScript ArrayBuffer is directly accessed from native code
- No intermediate copying or serialization
- Buffer memory is pinned during send operation

#### Receive Operations
- Uses JSI MutableBuffer to create ArrayBuffer backed by native memory
- Custom NSDataBuffer class implements JSI::MutableBuffer interface
- Native NSData is retained until JavaScript ArrayBuffer is garbage collected
- JavaScript TypedArrays provide direct access to received bytes

```cpp
// Native implementation (simplified)
class NSDataBuffer : public jsi::MutableBuffer {
  NSMutableData* data_;
public:
  size_t size() const override { return data_.length; }
  uint8_t* data() override { return (uint8_t*)data_.mutableBytes; }
};

// ArrayBuffer created with direct memory mapping
auto buffer = jsi::ArrayBuffer(runtime, std::make_shared<NSDataBuffer>(receivedData));
```

### Thread Safety
- All UDP operations run on a dedicated serial queue
- Events are safely marshaled to the JavaScript thread using CallInvoker
- No direct JSI calls from background threads
- Thread-safe message queuing for async operations

### Memory Management
- Native buffers are reference counted via shared_ptr
- JavaScript ArrayBuffers hold direct references to native memory
- Automatic cleanup when ArrayBuffer is garbage collected
- No manual buffer release required with JSI interface

### Error Handling
The module emits error events for:
- Socket creation failures
- Bind errors
- Send failures
- Network errors

```typescript
DeviceEventEmitter.addListener('error', (event) => {
  console.error('UDP Error:', event.error);
});
```

## Integration with LAMA

### Usage in TransportManager
The UDP module is integrated with the LAMA transport system through:
- `src/models/network/UdpModel.ts` - High-level UDP interface
- `src/platform/udp-direct.ts` - Platform-specific UDP implementation
- `src/models/network/DirectBuffer.ts` - Direct buffer management with UDP module

### Module Access Pattern
The module is accessed through a consistent import pattern:
```typescript
import UDPDirectModule from '@lama/react-native-udp-direct';
```
This replaces the previous `getUDPModule()` function pattern for better consistency and type safety.

### Direct Buffer Integration
The module works with LAMA's DirectBuffer system for efficient data transfer:
- Zero-copy between JavaScript and native
- Optimized for QUIC protocol requirements
- Integrated with the platform's buffer management

## Recent Changes

### Module Import Updates (July 2025)
1. **Replaced getUDPModule() pattern** - All internal references now use direct imports of `UDPDirectModule` from `@lama/react-native-udp-direct`
2. **Updated DirectBuffer.ts** - Now imports the module directly instead of using a local getter function
3. **Consistent module access** - All tools and utilities updated to use the standardized import pattern

### SO_REUSEPORT Support (July 2025)
1. **Added reusePort option** - JavaScript can now pass `reusePort: true` when creating sockets
2. **Native implementation** - When `reusePort: true` is set:
   - Automatically sets both SO_REUSEADDR and SO_REUSEPORT on the socket
   - Handles both IPv4 and IPv6 sockets
   - Enables multiple processes to bind to the same port (critical for macOS/iOS)
3. **Bridge layer updates**:
   - TurboModule (UDPDirectModuleCxxImpl) now passes reusePort option
   - JSI interface (UDPDirectJSI) now passes reusePort option
   - Native socket manager properly sets socket options before binding

### JSI Implementation (July 2025)
1. **Added pure JSI interface** - Direct JavaScript-to-native calls without TurboModule overhead
2. **Global `udpSendDirect` function** - Zero-copy send via JSI with offset/length support
3. **True zero-copy receive** - Direct memory mapping using JSI MutableBuffer
4. **`_udpJSI` namespace** - Complete socket operations through JSI
5. **Simplified buffer management** - Direct ArrayBuffer usage without C++ wrappers
6. **Event handling via JSI** - Direct callback invocation from native with thread safety
7. **Updated JSI signature** - `udpSendDirect` now accepts offset and length parameters for proper Uint8Array view support

### Performance Improvements
- **Zero-copy sends**: Data is passed directly from JavaScript ArrayBuffer to native socket
- **True zero-copy receives**: Native memory directly mapped to JavaScript ArrayBuffer using MutableBuffer
  - No data copying between native and JavaScript
  - Direct memory access through TypedArray views
  - NSData backing remains valid until ArrayBuffer is garbage collected
- **No serialization overhead**: Direct JSI calls bypass React Native bridge
- **Thread-safe operations**: CallInvoker ensures safe JS thread access
- **Reduced memory usage**: No intermediate base64 strings for binary data

### Simplified Architecture (July 2025)
1. **Removed compatibility layers** - No longer supports old React Native versions
2. **Direct type declarations** - Replaced `typeof` with explicit types
3. **Fixed TurboModule integration** - Using correct generated spec names
4. **Cleaned up prebuild** - Removed custom plugins, using autolinking

### Package Structure
- Converted from local module to proper npm package
- Published as vendor tarball for easy distribution
- Removed dependency on `ios-custom-modules` directory
- Simplified podspec without conditional architecture checks

## Troubleshooting

### Build Errors

1. **"'compat/JSICompat.h' file not found"**
   - Ensure you're using the latest package from vendor
   - Clean and reinstall: `rm -rf node_modules && npm install`

2. **"no member named 'NativeUdpModuleCxxSpecJSI'"**
   - The correct class name is `NativeUdpModuleSpecJSI`
   - Check that codegen has run during pod install

3. **Pod installation failures**
   - Clean pods: `cd ios && rm -rf Pods Podfile.lock && pod install`
   - Ensure Expo prebuild has completed successfully

### Runtime Issues

1. **Module not found**
   - Check that autolinking worked: `npx react-native config`
   - Verify the module is listed in linked dependencies

2. **Events not received**
   - Ensure you're listening before binding the socket
   - Check that the socket is successfully bound
   - Verify network permissions in Info.plist

## Future Enhancements

1. **Android Support** - Currently iOS only
2. **IPv6 Support** - Add 'udp6' socket type
3. **Multicast Support** - Join/leave multicast groups
4. **Performance Metrics** - Add throughput/latency measurements
5. **Better Buffer API** - Direct TypedArray access from JavaScript

## License

MIT - Copyright (c) 2025 Juergen Geck