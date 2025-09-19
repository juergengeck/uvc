# UDPDirectModule Architecture

This document describes the architecture and design of the UDP Direct Buffer system used for high-performance networking in the Lama app.

## Overview

The UDPDirectModule provides efficient, zero-copy UDP networking capabilities by integrating React Native with native iOS/Android networking code. It uses multiple integration approaches to maximize compatibility and performance.

## Architecture

The system uses a layered architecture:

```
┌─────────────────────────────────────┐
│ Application Code                    │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│ Platform Layer (udp-direct.ts)      │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│ Model Layer (DirectBuffer.ts)       │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│ Module Layer (UDPDirectModule.ts)   │
└─────────────────┬───────────────────┘
                  │
┌─────────────────▼───────────────────┐
│ Native Bridge                       │
├─────────────────┬───────────────────┤
│ JSI Global Obj  │ TurboModule API   │
└─────────────────┴───────────────────┘
```

### Key Components

1. **UDPDirectModule.ts** - TypeScript interface to the native module
   - Directly accesses global JSI objects
   - Provides resilient initialization with retries
   - Offers both async and sync access patterns

2. **DirectBuffer.ts** - Managed interface to native shared memory
   - Represents native buffers with a JavaScript API
   - Handles lifecycle management and resource cleanup
   - Provides buffer pooling capabilities

3. **udp-direct.ts** - Platform interface layer
   - Integrates with application-level code
   - Manages DirectBuffer instances
   - Provides high-level UDP operations

## Unified Native Module Access

A key innovation in this architecture is the unified approach to accessing native functionality that works with both JSI and TurboModule systems:

```typescript
// First try global JSI objects (high performance)
if (typeof global.UDPDirectModule !== 'undefined') {
  return global.UDPDirectModule;
}

// Fall back to TurboModule system
if (NativeModules.UDPDirectModule) {
  return NativeModules.UDPDirectModule;
}
```

This approach provides:

1. **Best Performance**: Prioritizes direct JSI access when available
2. **Compatibility**: Falls back to TurboModule for broader compatibility
3. **Resilience**: Handles asynchronous loading of native modules
4. **Flexibility**: Adapts to different method names across implementations

## Lifecycle Management

The system uses reference counting for proper lifecycle management:

1. **Initialization**: First use initializes the system
   ```typescript
   const manager = await getDirectBufferManager();
   ```

2. **Reference Counting**: Each consumer increments a reference count
   ```typescript
   globalInstanceRefCount++;
   ```

3. **Resource Release**: Resources are only released when no longer needed
   ```typescript
   export async function releaseDirectBufferManager() {
     globalInstanceRefCount--;
     if (globalInstanceRefCount === 0) {
       return resetDirectBufferManager();
     }
   }
   ```

## Usage Examples

### Basic Buffer Operations

```typescript
import { createDirectBuffer, releaseDirectBuffer } from './platform/udp-direct';

async function processData() {
  // Create a buffer
  const buffer = await createDirectBuffer(1024);
  
  try {
    // Get a direct view of the buffer
    const view = await buffer.getView();
    
    // Modify data directly
    view[0] = 42;
    
    // Use the buffer...
  } finally {
    // Always release the buffer when done
    await releaseDirectBuffer(buffer);
  }
}
```

### UDP Communication

```typescript
import { 
  createDirectBuffer, 
  sendWithDirectBuffer, 
  receiveWithDirectBuffer,
  releaseDirectBuffer 
} from './platform/udp-direct';

async function sendDataToServer(data: Uint8Array) {
  const buffer = await createDirectBuffer(data.length);
  
  try {
    // Write data to buffer
    await buffer.write(data);
    
    // Send data
    await sendWithDirectBuffer(buffer, data.length, 8080, '192.168.1.1');
  } finally {
    await releaseDirectBuffer(buffer);
  }
}

async function receiveDataFromServer() {
  const buffer = await createDirectBuffer(1500); // Standard MTU size
  
  try {
    // Receive data with 5 second timeout
    const { bytesRead, address, port } = await receiveWithDirectBuffer(buffer, 5000);
    
    // Read the received data
    const data = await buffer.read(bytesRead);
    
    return { data, address, port };
  } finally {
    await releaseDirectBuffer(buffer);
  }
}
```

## Performance Considerations

- **Zero-Copy Operations**: Avoid unnecessary data copying between JS and native code
- **Buffer Reuse**: Consider using the buffer pool for frequently used buffers
- **Error Handling**: Always release buffers in finally blocks to prevent memory leaks
- **Initialization**: The first call may be slower due to module initialization

## Troubleshooting

If you encounter issues:

1. Check if the global JSI object is available:
   ```typescript
   console.log('UDPDirectModule available:', typeof global.UDPDirectModule !== 'undefined');
   ```

2. Verify the required methods exist:
   ```typescript
   const methods = ['createDirectBuffer', 'releaseDirectBuffer'];
   for (const method of methods) {
     console.log(`${method} available:`, typeof global.UDPDirectModule?.[method] === 'function');
   }
   ```

3. Use the diagnostic API:
   ```typescript
   import { getDirectBufferManagerState } from './platform/udp-direct';
   console.log('Manager state:', getDirectBufferManagerState());
   ``` 