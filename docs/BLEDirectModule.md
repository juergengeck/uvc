# BLEDirectModule Architecture

This document outlines the high-level architecture for implementing a Bluetooth Low Energy (BLE) TurboModule for React Native/Expo projects, following the same approach used in UDPDirectModule.

## 1. Overall Architecture

The BLEDirectModule will provide direct, high-performance access to BLE functionality from JavaScript with these key characteristics:

* **TurboModule-based**: Uses React Native's New Architecture for optimal performance
* **Zero-copy buffer handling**: Direct memory access between JavaScript and native code
* **JSI integration**: Provides synchronous access to native methods where appropriate
* **Based on react-native-ble**: Leverages proven open-source BLE implementation

## 2. Core Components

### Native Layer

#### `BLEDirectModule` (Objective-C)

Core implementation handling all BLE operations:
* Device scanning and discovery
* Connection management
* Service and characteristic discovery
* Read/write operations
* Notifications and indications
* Buffer management for characteristic data

#### `SharedBufferHostObject` (Reused from UDP Module)

Provides zero-copy buffer access between JavaScript and native code:
* Wraps native buffers for efficient data transfer
* Handles memory management with proper lifecycle

#### `BLEModuleSpec` (C++)

TurboModule specification defining the interface between JavaScript and native:
* Maps JavaScript method calls to native implementations
* Handles type conversions and parameter validation
* Manages Promise-based async operations

#### `BLEModuleTurbo` (Objective-C++)

TurboModule provider handling registration with React Native:
* Implements TurboModule protocol requirements
* Creates and configures the C++ TurboModule implementation
* Coordinates JSI binding installation

### JavaScript API

```typescript
interface BLEDirectModule extends TurboModule {
  // Device Management
  startScan(options: ScanOptions): Promise<void>;
  stopScan(): Promise<void>;
  connect(deviceId: string): Promise<void>;
  disconnect(deviceId: string): Promise<void>;
  
  // Service & Characteristic Operations
  discoverServices(deviceId: string): Promise<string[]>;
  discoverCharacteristics(deviceId: string, serviceId: string): Promise<Characteristic[]>;
  
  // Data Operations
  readCharacteristic(deviceId: string, serviceId: string, characteristicId: string): Promise<SharedBufferHostObject>;
  writeCharacteristic(deviceId: string, serviceId: string, characteristicId: string, buffer: SharedBufferHostObject, offset: number, length: number): Promise<void>;
  
  // Notifications
  startNotifications(deviceId: string, serviceId: string, characteristicId: string): Promise<void>;
  stopNotifications(deviceId: string, serviceId: string, characteristicId: string): Promise<void>;
  
  // Buffer Management (shared with UDP module)
  createSharedArrayBuffer(size: number): Promise<SharedBufferHostObject>;
  releaseSharedArrayBuffer(bufferId: number): Promise<void>;
}
```

## 3. Zero-Copy Data Flow

### Writing to BLE Characteristic:

1. JavaScript calls `createSharedArrayBuffer(size)` to get a `SharedBufferHostObject`
2. JavaScript populates the buffer using the returned `ArrayBuffer`
3. JavaScript calls `writeCharacteristic(deviceId, serviceId, characteristicId, hostObject, offset, length)`
4. Native code extracts the buffer ID from the host object
5. Native code accesses the raw buffer directly and sends to the BLE device
6. JavaScript releases the buffer when done

### Reading from BLE Characteristic:

1. JavaScript calls `readCharacteristic(deviceId, serviceId, characteristicId)`
2. Native code reads from the BLE device and stores data in a native buffer
3. Native code creates a `SharedBufferHostObject` wrapping this buffer
4. JavaScript accesses the data directly via the returned host object
5. Buffer is automatically freed when JavaScript garbage collects the ArrayBuffer

### Handling Notifications:

1. JavaScript calls `startNotifications(deviceId, serviceId, characteristicId)`
2. Native code subscribes to notifications for the characteristic
3. When data arrives, native code emits a JavaScript event with a buffer ID
4. JavaScript accesses notification data via `getReceivedDataBuffer(bufferId)`

## 4. Expo Integration

To integrate with Expo's build system:

1. Create a custom module in the `ios-custom-modules` directory
2. Implement an Expo config plugin similar to `withUdpHeaderPaths.js`
3. Update app.json to include the new plugin
4. Ensure proper setup during prebuild

## 5. React Native Dependencies

The module will be based on react-native-ble, modified for:
* TurboModule architecture
* Direct buffer access
* JSI integration

## 6. Implementation Plan

1. **Phase 1**: Basic TurboModule setup with device scanning and connection
2. **Phase 2**: Service and characteristic discovery
3. **Phase 3**: Read/write operations with shared buffers
4. **Phase 4**: Notifications and indications
5. **Phase 5**: Performance optimization and testing

## 7. Performance Considerations

* Zero-copy data handling for large characteristic reads/writes
* Event batching for high-frequency notifications
* Direct JSI function calls for performance-critical operations
* Buffer pooling to minimize memory allocations