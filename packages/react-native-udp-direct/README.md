# React Native UDP Direct

A high-performance UDP socket module for React Native with zero-copy buffer support. This module provides direct UDP socket functionality with optimized memory management for efficient data transfer.

## Features

- **Native UDP Socket Support**: Full UDP socket functionality for React Native
- **Zero-Copy Buffers**: Efficient data transfer without copying between JS and native
- **TurboModule Architecture**: Modern React Native architecture for better performance
- **TypeScript Support**: Full TypeScript definitions included
- **iOS Support**: Currently supports iOS (Android support coming soon)
- **Thread-Safe Event System**: Robust event handling from native to JavaScript

## Installation

```sh
npm install @lama/react-native-udp-direct
# or
yarn add @lama/react-native-udp-direct
```

### iOS Setup

```sh
cd ios && pod install
```

## Usage

```typescript
import UDPDirectModule from '@lama/react-native-udp-direct';
import { DeviceEventEmitter } from 'react-native';

// Listen for incoming messages
const subscription = DeviceEventEmitter.addListener('message', (event) => {
  console.log('Received UDP message:', event);
  // event contains: { socketId, data, address, port, bufferId }
});

// Create and use a socket
async function setupSocket() {
  try {
    // Create a new UDP socket
    const { socketId } = await UDPDirectModule.createSocket({ 
      type: 'udp4', 
      reuseAddr: true,
      broadcast: true 
    });

    // Bind to a port
    await UDPDirectModule.bind(socketId, 12345, '0.0.0.0');
    console.log(`Socket ${socketId} bound to port 12345`);

    // Send a message
    const message = 'Hello, UDP!';
    const base64Message = Buffer.from(message).toString('base64');
    
    await UDPDirectModule.send(
      socketId, 
      base64Message, 
      12345, 
      '255.255.255.255'
    );
    
    // Close the socket when done
    await UDPDirectModule.close(socketId);
    
  } catch (error) {
    console.error('UDP Error:', error);
  }
}

// Don't forget to clean up
subscription.remove();
```

### Zero-Copy Buffer Usage

```typescript
// Create a native buffer
const { bufferId } = await UDPDirectModule.createSharedArrayBuffer(1024);

// Use the buffer for sending (implementation depends on your use case)
// ... 

// Always release buffers when done to prevent memory leaks
await UDPDirectModule.releaseSharedArrayBuffer(bufferId);
```

## API Reference

### Methods

#### `createSocket(options)`
Creates a new UDP socket.

- `options.type`: Socket type ('udp4' or 'udp6')
- `options.reuseAddr`: Allow address reuse (boolean)
- `options.broadcast`: Enable broadcast (boolean)

Returns: `Promise<{ socketId: number }>`

#### `bind(socketId, port, address)`
Binds the socket to a specific port and address.

- `socketId`: The socket ID from createSocket
- `port`: Port number to bind to
- `address`: IP address to bind to (e.g., '0.0.0.0')

Returns: `Promise<void>`

#### `send(socketId, base64Data, port, address)`
Sends data through the socket.

- `socketId`: The socket ID
- `base64Data`: Base64 encoded data to send
- `port`: Destination port
- `address`: Destination IP address

Returns: `Promise<void>`

#### `close(socketId)`
Closes the socket.

Returns: `Promise<void>`

#### `createSharedArrayBuffer(size)`
Creates a native buffer for zero-copy operations.

Returns: `Promise<{ bufferId: number }>`

#### `releaseSharedArrayBuffer(bufferId)`
Releases a native buffer.

Returns: `Promise<void>`

### Events

The module emits the following events via `DeviceEventEmitter`:

- `message`: Received UDP packet
  - `socketId`: Socket that received the message
  - `data`: Base64 encoded data
  - `address`: Sender's IP address
  - `port`: Sender's port
  - `bufferId`: Native buffer ID (if using zero-copy)

- `error`: Socket error occurred
  - `socketId`: Socket that encountered the error
  - `error`: Error message

- `close`: Socket was closed
  - `socketId`: Socket that was closed

## Architecture

This module uses a three-layer architecture:

1. **JavaScript Interface**: TypeScript definitions and module exports
2. **C++ JSI Bridge**: Direct JavaScript Interface for optimal performance
3. **Native Implementation**: Objective-C++ implementation using GCDAsyncUdpSocket

The zero-copy buffer system allows JavaScript to reference native memory without copying data across the bridge, significantly improving performance for large data transfers.

## Requirements

- React Native 0.73.0 or higher
- iOS 13.0 or higher
- New Architecture enabled (recommended)

## Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## License

MIT

Copyright (c) 2025 Juergen Geck