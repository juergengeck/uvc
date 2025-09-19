# Modern Bluetooth Low Energy (BLE) Architecture for React Native

## Overview

This document outlines the design and implementation approach for integrating Bluetooth Low Energy (BLE) functionality into the Lama mobile application, leveraging modern React Native architecture and native code integration patterns.

Similar to our UDP implementation, our BLE architecture will:

1. Use a layered approach with clean separation of concerns
2. Leverage the latest native platform APIs for performance and reliability
3. Expose a consistent TypeScript interface for application components
4. Support proper error handling and recovery mechanisms
5. Integrate with one.core for seamless operation within our ecosystem

## Architectural Layers

Our BLE architecture follows a strict hierarchy with clear separation of concerns:

### 1. Native Module Layer (Lowest Level)

**`BLEDirectModule` (iOS) / `BLEModule` (Android)**
- Implemented as TurboModules for better performance and type safety
- Directly interfaces with platform-specific BLE APIs:
  - iOS: CoreBluetooth framework
  - Android: Android Bluetooth LE API
- Handles device scanning, connection management, service discovery, and GATT operations
- Implements proper Promise handling for all asynchronous operations
- Includes advanced error handling and debugging facilities
- Provides efficient buffer handling for large data transfers

### 2. Platform Abstraction Layer (Middle)

**`BLESingleton`**
- Wraps the native module functionality with a consistent interface
- Performs availability checks and initialization of the BLE subsystem
- Manages a single instance for accessing BLE functionality
- Handles cross-platform differences and provides a unified API
- Integrates with one.core for system-level management
- Provides access to BLE operations via a well-defined TypeScript interface

### 3. Application Layer (High Level)

**`BleModel`**
- Single centralized owner of BLE connections
- Uses BLESingleton to access BLE functionality
- Provides authenticated communication
- Manages device connections and reconnection logic
- Offers higher-level networking APIs for other components

**`DeviceDiscoveryManager`**
- Uses BleModel's existing connection management
- Handles device discovery and filtering
- Focuses on device interaction business logic without duplicating connection management

## Implementation Approach

### Native Module Implementation

#### iOS Native Module (`BLEDirectModule`)

Similar to UDPDirectModule, we'll implement a TurboModule with:

1. **Core Components**:
   - Objective-C implementation backed by CoreBluetooth
   - C++ TurboModule interface for high-performance bridging
   - JSI interface for zero-copy buffer operations

2. **Key Classes**:
   - `BLEDirectModule.h/mm`: Core module implementing CBCentralManagerDelegate and CBPeripheralDelegate
   - `BLEDirectModuleCxxImpl.h/mm`: C++ implementation of the TurboModule interface
   - `BLESharedBufferHostObject.h/mm`: JSI HostObject for efficient buffer handling
   - `BLEModuleTurbo.h/mm`: TurboModule provider registration

3. **Proper Promise Handling**:
   - All asynchronous operations return proper JSI Promises
   - Clear error propagation with detailed error messages
   - Support for concurrent operations with unique operation identifiers

#### Android Native Module (`BLEModule`)

1. **Core Components**:
   - Java implementation based on BluetoothAdapter and BluetoothGatt
   - TurboModule interface via React Native's TurboModules system
   - Efficient buffer handling for characteristic operations

2. **Key Classes**:
   - `BLEModule.java`: Core module implementing BLE scanning and GATT operations
   - `BLEPackage.java`: Package registration for TurboModule
   - `BLEScanCallback.java`: Callbacks for device scanning
   - `BLEGattCallback.java`: Callbacks for GATT operations

### JavaScript / TypeScript Layer

1. **Feature Support**:
   - Device scanning with filtering options
   - Connection management with auto-reconnect capabilities
   - Service and characteristic discovery
   - Read, write, and notify operations for characteristics
   - Efficient buffer handling for large transfers
   - MTU negotiation for optimal data transfer
   - Bonding and security level management

2. **Error Handling**:
   - Comprehensive error codes and messages
   - Automatic recovery strategies for common failures
   - Connection state monitoring and management
   - Timeout handling for all operations

3. **Integration with one.core**:
   - Export functionality through one.core for consistent API access
   - Use the same object relationships model for device management
   - Leverage existing authentication and encryption mechanisms

## Relationship with react-native-ble-plx

We'll use react-native-ble-plx as a reference implementation, adapting its best practices while improving:

1. **Zero-copy buffer handling** for more efficient data transfers
2. **Promise-based interface** with proper error propagation
3. **Enhanced logging and debugging** facilities
4. **TurboModule architecture** for better performance
5. **Better TypeScript integration** with full type definitions
6. **Clean integration with one.core** ecosystem

## Implementation Roadmap

1. **Phase 1: Native Module Implementation**
   - Implement base TurboModule structure
   - Implement device scanning functionality
   - Implement basic connection management
   - Add proper error handling and Promise support

2. **Phase 2: Core BLE Operations**
   - Implement service and characteristic discovery
   - Add GATT operations (read, write, notify)
   - Implement efficient buffer handling
   - Add connection management with auto-reconnect

3. **Phase 3: BLESingleton and Integration**
   - Implement BLESingleton abstraction layer
   - Integrate with one.core
   - Create BleModel for application-level management
   - Add diagnostic and testing functionality

4. **Phase 4: Advanced Features**
   - Implement bonding and security features
   - Add MTU negotiation
   - Support multiple concurrent connections
   - Add power management optimizations

## Best Practices

1. **Connection Ownership Rules**:
   - Only BleModel should create and manage device connections
   - Higher-level components must use BleModel's connection facilities
   - All BLE testing tools should check for existing connections before creating new ones

2. **Error Handling Strategy**:
   - Implement proper availability detection
   - Provide graceful degradation for missing functionality
   - Include detailed logging throughout the module

3. **Resource Management**:
   - Close connections when no longer needed
   - Implement proper cleanup for subscriptions
   - Handle background/foreground transitions

4. **Security Considerations**:
   - Implement proper bonding procedures
   - Support encryption for sensitive operations
   - Validate device identity to prevent spoofing

By following these guidelines, we'll ensure reliable BLE functionality while avoiding common pitfalls like connection conflicts and resource leaks.

## Debugging Tools

The BLE implementation will include built-in debugging tools:

1. **BLE Scanner**:
   - Visualize nearby BLE devices and their signal strengths
   - Display device services and characteristics
   - Test read/write operations directly

2. **Connection Diagnostics**:
   - Monitor connection states and parameters
   - Track MTU size and throughput
   - Log characteristic operations

3. **Logging Infrastructure**:
   - Hierarchical logging system with configurable levels
   - Performance metrics for BLE operations
   - Error capture and reporting mechanism

These tools will help troubleshoot BLE connectivity issues and optimize performance. 