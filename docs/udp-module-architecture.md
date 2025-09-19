# UDPModule Architecture Documentation

This document explains the architecture of the UDPModule for React Native with Expo, focusing on a clean separation of concerns between Objective-C, C++, and Objective-C++ code.

## Overview

The UDPModule implementation follows a layered architecture that separates the native socket functionality (Objective-C) from the TurboModule implementation (C++). This provides several advantages:

1. **Language Isolation**: Each component uses the language most suited for its purpose
2. **Clean API Boundaries**: Well-defined interfaces between components
3. **Improved Maintainability**: Files are smaller and focused on specific concerns
4. **Better Error Handling**: Issues are isolated to specific layers
5. **Future-proof Design**: Adaptation to React Native architecture changes is easier

## Component Structure

The architecture consists of three main layers:

```
┌─────────────────┐
│   JavaScript    │
└────────┬────────┘
         ▼
┌─────────────────┐
│   TurboModule   │  C++ implementation of UDPModuleSpec
│    Interface    │
└────────┬────────┘
         ▼
┌─────────────────┐
│  Objective-C++  │  Bridge between C++ and Objective-C
│     Bridge      │
└────────┬────────┘
         ▼
┌─────────────────┐
│   Objective-C   │  UDP Socket Manager implementation
│  Implementation │
└─────────────────┘
```

### Files and Responsibilities

1. **Pure Objective-C (Socket Layer)**
   - `UDPSocketManager.h/m`: Handles all socket operations using the iOS Network framework
   - `UDPModule.h/m`: Implements RCTBridgeModule and RCTEventEmitter protocols

2. **Pure C++ (TurboModule Layer)**
   - `UDPModuleSpec.h`: Defines the TurboModule interface as a pure C++ spec
   - `UDPModuleTurbo.h/cpp`: Implements the TurboModule interface in pure C++

3. **Objective-C++ (Bridge Layer)**
   - `UDPModuleBridge.mm`: Bridges between Objective-C and C++ components

## How It Works

### Data Flow

1. **JavaScript → Native**:
   - JS calls are received by the TurboModule interface
   - C++ implementation converts parameters to appropriate types
   - Bridge layer calls the Objective-C socket manager

2. **Native → JavaScript**:
   - Socket events are received by the UDPSocketManager
   - Events are passed to the UDPModule through the delegate pattern
   - UDPModule emits events to JavaScript using RCTEventEmitter

### Key Design Patterns

1. **Singleton Socket Manager**: 
   - Centralized management of all UDP sockets
   - Consistent threading model with dispatch queues

2. **Delegation Pattern**:
   - UDPModule implements UDPSocketEventDelegate
   - Event handling is decoupled from socket implementation

3. **Clean Factory Methods**:
   - TurboModule creation is handled by clean factory methods
   - No direct dependencies between implementation layers

## Benefits of This Architecture

1. **Reduced C++ Complexity**:
   - C++ code only handles JSI interactions
   - No socket code in C++, eliminating platform-specific complexity

2. **Better Error Handling**:
   - Clearly defined error domains and codes
   - Consistent error propagation through layers

3. **Easier Testing**:
   - Each layer can be tested independently
   - Mock objects can be used to test individual components

4. **Improved Compatibility**:
   - Clean separation allows adaptation to React Native architecture changes
   - Minimizes the impact of C++ standard library compatibility issues

## Common Issues and Solutions

### C++ Header Issues

The architecture minimizes C++ header issues by:
- Using only what's needed in each component
- Avoiding C++ standard library headers in Objective-C++ files
- Ensuring clean separation between C++ and Objective-C code

### Thread Safety

Thread safety is ensured by:
- Using serial dispatch queues for socket operations
- Thread-safe access to shared resources with locks
- Consistent error handling across threading boundaries

### Memory Management

Memory is managed properly through:
- Clear ownership semantics for socket objects
- Proper use of ARC in Objective-C code
- std::shared_ptr for C++ lifetime management

## Future Improvements

1. **AsyncTask Integration**: Add support for React Native's AsyncTask
2. **Binary Data Support**: Improve handling of ArrayBuffer and TypedArray
3. **Performance Optimization**: Fine-tune dispatch queue usage
4. **Error Detail Enrichment**: Add more detailed error information 