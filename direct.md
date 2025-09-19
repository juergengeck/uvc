# Direct Memory Sharing Implementation for UDP Communication

## Overview

This document outlines a plan to implement zero-copy data transfer between native code and JavaScript for UDP packet handling using React Native's JSI (JavaScript Interface). This will replace the current event-based approach which suffers from data copying and serialization issues.

## Architecture

### High-Level Design

```
┌───────────────┐     ┌────────────────┐     ┌─────────────────┐
│ Native UDP    │     │ Shared Memory  │     │ JavaScript      │
│ Implementation│◄───►│ Buffer Pool    │◄───►│ UdpModel        │
└───────────────┘     └────────────────┘     └─────────────────┘
                             ▲                       ▲
                             │                       │
                             ▼                       ▼
                      ┌────────────────┐     ┌─────────────────┐
                      │ JSI Direct     │     │ Buffer Manager  │
                      │ Memory Bridge  │     │ (buffer.ts)     │
                      └────────────────┘     └─────────────────┘
```

### Key Components

1. **Shared Memory Buffer Pool**: Pre-allocated memory region for UDP packets
2. **JSI Direct Memory Bridge**: Facilitates zero-copy access between native and JS
3. **Buffer Manager**: JavaScript utility for handling direct memory buffers
4. **Native UDP Implementation**: Modified to use shared memory instead of events

## Implementation Details

### 1. Native Side (C++/Objective-C)

#### 1.1 JSI Buffer Host Object

```cpp
class SharedBufferHostObject : public jsi::HostObject {
public:
  SharedBufferHostObject(size_t size);
  ~SharedBufferHostObject();
  
  // JSI methods
  jsi::Value get(jsi::Runtime& runtime, const jsi::PropNameID& name) override;
  void set(jsi::Runtime& runtime, const jsi::PropNameID& name, const jsi::Value& value) override;
  
  // Buffer management
  uint8_t* data();
  size_t size();
  void copyFrom(const uint8_t* src, size_t length);
  
private:
  std::vector<uint8_t> buffer_;
};
```

#### 1.2 Buffer Pool Manager

```cpp
class BufferPoolManager {
public:
  BufferPoolManager(size_t bufferSize, size_t poolSize);
  ~BufferPoolManager();
  
  // Get a free buffer from the pool
  std::shared_ptr<SharedBufferHostObject> acquireBuffer();
  
  // Return a buffer to the pool
  void releaseBuffer(std::shared_ptr<SharedBufferHostObject> buffer);
  
  // Get singleton instance
  static BufferPoolManager& getInstance();
  
private:
  std::vector<std::shared_ptr<SharedBufferHostObject>> pool_;
  std::mutex poolMutex_;
  size_t bufferSize_;
};
```

#### 1.3 UDP Direct Native Module

```cpp
class UDPDirectModule : public facebook::xplat::module::CxxModule {
public:
  UDPDirectModule(std::shared_ptr<facebook::react::CallInvoker> jsInvoker);
  
  std::string getName() override { return "UDPDirectModule"; }
  std::map<std::string, folly::dynamic> getConstants() override;
  std::vector<facebook::xplat::module::CxxModule::Method> getMethods() override;
  
  // Socket operations
  jsi::Value createSocket(jsi::Runtime& runtime, const jsi::Value& config);
  jsi::Value bind(jsi::Runtime& runtime, const jsi::Value& socketId, const jsi::Value& port, const jsi::Value& address);
  jsi::Value send(jsi::Runtime& runtime, const jsi::Value& socketId, const jsi::Value& buffer, const jsi::Value& port, const jsi::Value& address);
  jsi::Value close(jsi::Runtime& runtime, const jsi::Value& socketId);
  
  // Direct buffer operations
  jsi::Value createBuffer(jsi::Runtime& runtime, const jsi::Value& size);
  jsi::Value releaseBuffer(jsi::Runtime& runtime, const jsi::Value& buffer);
  
private:
  std::shared_ptr<facebook::react::CallInvoker> jsInvoker_;
  std::map<std::string, std::unique_ptr<UDPSocket>> sockets_;
  std::shared_ptr<BufferPoolManager> bufferPool_;
  
  // Callback when UDP data is received
  void onUDPData(const std::string& socketId, const uint8_t* data, size_t length, const std::string& address, int port);
};
```

### 2. JavaScript Side

#### 2.1 Enhanced Buffer.ts

```typescript
/**
 * DirectBuffer - Represents a direct memory buffer that is shared with native code
 */
export class DirectBuffer {
  // The underlying JSI object reference
  private _nativeBuffer: any;
  // ArrayBuffer view for easy data access
  private _arrayBuffer: ArrayBuffer;
  // Current length of data in the buffer
  private _length: number;
  
  constructor(nativeBuffer: any) {
    this._nativeBuffer = nativeBuffer;
    this._arrayBuffer = nativeBuffer.getArrayBuffer();
    this._length = 0;
  }
  
  /**
   * Length of data in the buffer
   */
  get length(): number {
    return this._length;
  }
  
  /**
   * Set the length of data in the buffer
   */
  set length(value: number) {
    this._length = value;
  }
  
  /**
   * Get a Uint8Array view of the buffer
   */
  asUint8Array(): Uint8Array {
    return new Uint8Array(this._arrayBuffer, 0, this._length);
  }
  
  /**
   * Convert to Node.js Buffer
   */
  toBuffer(): Buffer {
    return Buffer.from(this.asUint8Array());
  }
  
  /**
   * Release the buffer back to the native pool
   */
  release(): void {
    if (this._nativeBuffer && this._nativeBuffer.release) {
      this._nativeBuffer.release();
      this._nativeBuffer = null;
      this._arrayBuffer = null;
      this._length = 0;
    }
  }
}

/**
 * DirectBufferPool - Manages a pool of direct memory buffers
 */
export class DirectBufferPool {
  private static _instance: DirectBufferPool | null = null;
  private _nativeModule: any;
  
  private constructor() {
    this._nativeModule = require('react-native').NativeModules.UDPDirectModule;
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(): DirectBufferPool {
    if (!DirectBufferPool._instance) {
      DirectBufferPool._instance = new DirectBufferPool();
    }
    return DirectBufferPool._instance;
  }
  
  /**
   * Acquire a buffer from the pool
   */
  public acquireBuffer(size: number = 1500): DirectBuffer {
    const nativeBuffer = this._nativeModule.createBuffer(size);
    return new DirectBuffer(nativeBuffer);
  }
  
  /**
   * Release a buffer back to the pool
   */
  public releaseBuffer(buffer: DirectBuffer): void {
    buffer.release();
  }
}
```

#### 2.2 Modified UdpSocket Interface

```typescript
export interface DirectUdpSocket extends EventEmitter {
  id: string;
  bind(port: number, address?: string): Promise<void>;
  send(buffer: DirectBuffer | Buffer, port: number, address: string): Promise<void>;
  close(): Promise<void>;
  address(): { address: string; port: number; family: string };
  addMembership(multicastAddress: string): Promise<void>;
  dropMembership(multicastAddress: string): Promise<void>;
  setBroadcast(flag: boolean): Promise<void>;
  setTTL(ttl: number): Promise<void>;
}
```

#### 2.3 Modified UdpModel Class

```typescript
export class UdpModel extends Model {
  // ... existing code ...
  
  /**
   * Create a socket with direct buffer support
   */
  public async createDirectSocket(options: UdpSocketOptions): Promise<DirectUdpSocket> {
    await this.ensureInitialized();
    
    const socketId = await this._nativeModule.createSocket({
      type: options.type || 'udp4',
      reuseAddr: options.reuseAddr !== false,
      direct: true // Enable direct buffer mode
    });
    
    // Create socket wrapper with direct buffer support
    const socket = this.createDirectSocketWrapper(socketId, options);
    this._sockets.set(socketId, socket);
    
    return socket as DirectUdpSocket;
  }
  
  /**
   * Create a socket wrapper with direct buffer support
   */
  private createDirectSocketWrapper(socketId: string, options: UdpSocketOptions): DirectUdpSocket {
    // ... similar to createSocketWrapper but with direct buffer support
  }
  
  /**
   * Handle direct buffer message from native
   */
  private handleDirectMessage(socketId: string, bufferRef: any, remoteInfo: UdpRemoteInfo): void {
    const socket = this._sockets.get(socketId);
    if (!socket) return;
    
    // Create DirectBuffer from native reference
    const buffer = new DirectBuffer(bufferRef);
    
    // Emit message event
    socket.emit('message', buffer, remoteInfo);
  }
}
```

### 3. Control Flow

#### 3.1 UDP Packet Reception Flow

```
┌──────────────┐     ┌───────────────┐     ┌────────────────┐     ┌──────────────┐
│ Native UDP   │     │ Buffer Pool   │     │ JSI Bridge     │     │ UdpModel     │
│ Receiver     │     │ Manager       │     │                │     │ JS           │
└──────┬───────┘     └───────┬───────┘     └────────┬───────┘     └──────┬───────┘
       │                     │                      │                     │
       │  Packet received    │                      │                     │
       ├─────────────────────┼──────────────────────┼─────────────────────┤
       │                     │                      │                     │
       │ acquireBuffer()     │                      │                     │
       ├────────────────────►│                      │                     │
       │                     │                      │                     │
       │                     │ return buffer ref    │                     │
       │◄────────────────────┤                      │                     │
       │                     │                      │                     │
       │ copy data to buffer │                      │                     │
       ├─────────────────────┤                      │                     │
       │                     │                      │                     │
       │ onUDPData(bufferRef, address, port)        │                     │
       ├─────────────────────────────────────────────────────────────────►│
       │                     │                      │                     │
       │                     │                      │ handleDirectMessage │
       │                     │                      │◄────────────────────┤
       │                     │                      │                     │
       │                     │                      │ create DirectBuffer │
       │                     │                      ├─────────────────────┤
       │                     │                      │                     │
       │                     │                      │ emit 'message'      │
       │                     │                      ├─────────────────────┤
       │                     │                      │                     │
```

#### 3.2 UDP Send Flow

```
┌──────────────┐     ┌───────────────┐     ┌────────────────┐     ┌──────────────┐
│ JS UdpModel  │     │ DirectBuffer  │     │ JSI Bridge     │     │ Native UDP   │
│              │     │               │     │                │     │ Sender       │
└──────┬───────┘     └───────┬───────┘     └────────┬───────┘     └──────┬───────┘
       │                     │                      │                     │
       │ socket.send(buffer) │                      │                     │
       ├─────────────────────┼──────────────────────┼─────────────────────┤
       │                     │                      │                     │
       │ getBufferRef()      │                      │                     │
       ├────────────────────►│                      │                     │
       │                     │                      │                     │
       │                     │ return native ref    │                     │
       │◄────────────────────┤                      │                     │
       │                     │                      │                     │
       │ NativeModule.send(socketId, bufferRef, port, address)           │
       ├─────────────────────────────────────────────────────────────────►│
       │                     │                      │                     │
       │                     │                      │                     │
       │                     │                      │ Access buffer data  │
       │                     │                      │◄────────────────────┤
       │                     │                      │                     │
       │                     │                      │ Send UDP packet     │
       │                     │                      ├────────────────────►│
       │                     │                      │                     │
       │                     │                      │ Return success      │
       │◄─────────────────────────────────────────────────────────────────┤
       │                     │                      │                     │
```

## Implementation Steps

### Phase 1: Native Implementation

1. Create C++ headers for SharedBufferHostObject and BufferPoolManager
2. Implement SharedBufferHostObject class for direct memory access
3. Implement BufferPoolManager for buffer recycling
4. Create UDPDirectModule with JSI bindings
5. Implement socket operations with direct buffer support
6. Add platform-specific implementations (iOS/Android)

### Phase 2: JavaScript Integration

1. Enhance buffer.ts with DirectBuffer and DirectBufferPool classes
2. Update UdpModel to support direct buffer operations
3. Create new DirectUdpSocket interface
4. Implement bridge methods between JS and native
5. Add conversion utilities between DirectBuffer and Buffer

### Phase 3: Integration with Existing Code

1. Update QuicModel to use direct buffers when available
2. Modify DeviceDiscoveryModel to handle DirectBuffer objects
3. Ensure backward compatibility with existing code
4. Add fallback mechanism for platforms without JSI support

### Phase 4: Testing and Optimization

1. Benchmark performance comparison (copy vs zero-copy)
2. Stress test with high packet rates
3. Memory usage analysis
4. Optimize buffer pool size and management strategy

## Native Implementation Guidelines

### 1. iOS Implementation

#### 1.1 C++ Implementation (SharedBufferHostObject.h)

```cpp
// SharedBufferHostObject.h
#pragma once

#include <jsi/jsi.h>
#include <vector>
#include <memory>

using namespace facebook::jsi;

class SharedBufferHostObject : public HostObject {
public:
  SharedBufferHostObject(size_t size);
  ~SharedBufferHostObject();
  
  Value get(Runtime& runtime, const PropNameID& name) override;
  void set(Runtime& runtime, const PropNameID& name, const Value& value) override;
  
  uint8_t* data() { return buffer_.data(); }
  size_t size() const { return buffer_.size(); }
  size_t capacity() const { return buffer_.capacity(); }
  
  void setLength(size_t length);
  size_t getLength() const { return currentLength_; }
  
private:
  std::vector<uint8_t> buffer_;
  size_t currentLength_ = 0;
  bool isReleased_ = false;
};
```

#### 1.2 C++ Implementation (SharedBufferHostObject.cpp)

```cpp
// SharedBufferHostObject.cpp
#include "SharedBufferHostObject.h"
#include <jsi/jsi.h>

using namespace facebook::jsi;

SharedBufferHostObject::SharedBufferHostObject(size_t size) {
  buffer_.resize(size);
  currentLength_ = 0;
}

SharedBufferHostObject::~SharedBufferHostObject() {
  // No need for additional cleanup
}

void SharedBufferHostObject::setLength(size_t length) {
  if (length > buffer_.size()) {
    throw std::runtime_error("Cannot set length larger than capacity");
  }
  currentLength_ = length;
}

Value SharedBufferHostObject::get(Runtime& runtime, const PropNameID& name) {
  auto nameStr = name.utf8(runtime);
  
  if (nameStr == "getArrayBuffer") {
    return Function::createFromHostFunction(runtime, name, 0, 
      [this](Runtime& runtime, const Value& thisValue, const Value* args, size_t count) -> Value {
        if (isReleased_) {
          throw std::runtime_error("Buffer has been released");
        }
        
        // Create ArrayBuffer directly from our memory
        return runtime.global()
          .getPropertyAsFunction(runtime, "ArrayBuffer")
          .callAsConstructor(runtime, 
            runtime.prepareJavaScriptValue(buffer_.data()), 
            runtime.prepareJavaScriptValue(buffer_.size()));
      });
  } 
  else if (nameStr == "getLength") {
    return Function::createFromHostFunction(runtime, name, 0, 
      [this](Runtime& runtime, const Value& thisValue, const Value* args, size_t count) -> Value {
        if (isReleased_) {
          throw std::runtime_error("Buffer has been released");
        }
        return Value(static_cast<double>(currentLength_));
      });
  }
  else if (nameStr == "getCapacity") {
    return Function::createFromHostFunction(runtime, name, 0, 
      [this](Runtime& runtime, const Value& thisValue, const Value* args, size_t count) -> Value {
        if (isReleased_) {
          throw std::runtime_error("Buffer has been released");
        }
        return Value(static_cast<double>(buffer_.size()));
      });
  }
  else if (nameStr == "setLength") {
    return Function::createFromHostFunction(runtime, name, 1, 
      [this](Runtime& runtime, const Value& thisValue, const Value* args, size_t count) -> Value {
        if (isReleased_) {
          throw std::runtime_error("Buffer has been released");
        }
        if (count < 1 || !args[0].isNumber()) {
          throw std::runtime_error("setLength requires a number argument");
        }
        
        size_t newLength = static_cast<size_t>(args[0].getNumber());
        if (newLength > buffer_.size()) {
          throw std::runtime_error("Cannot set length larger than capacity");
        }
        
        currentLength_ = newLength;
        return Value::undefined();
      });
  }
  else if (nameStr == "release") {
    return Function::createFromHostFunction(runtime, name, 0, 
      [this](Runtime& runtime, const Value& thisValue, const Value* args, size_t count) -> Value {
        isReleased_ = true;
        return Value::undefined();
      });
  }
  
  return Value::undefined();
}

void SharedBufferHostObject::set(Runtime& runtime, const PropNameID& name, const Value& value) {
  // Read-only properties, no setters implemented
}
```

#### 1.3. Buffer Pool Manager Implementation

```cpp
// BufferPoolManager.h
#pragma once

#include "SharedBufferHostObject.h"
#include <vector>
#include <mutex>
#include <memory>

class BufferPoolManager {
public:
  // Create a pool with buffers of specified size
  BufferPoolManager(size_t bufferSize = 1500, size_t poolSize = 20);
  ~BufferPoolManager();
  
  // Get a buffer from the pool or create a new one
  std::shared_ptr<SharedBufferHostObject> acquireBuffer(size_t size = 0);
  
  // Return a buffer to the pool for reuse
  void releaseBuffer(std::shared_ptr<SharedBufferHostObject> buffer);
  
  // Static access
  static BufferPoolManager& getInstance();
  
private:
  std::vector<std::shared_ptr<SharedBufferHostObject>> pool_;
  std::mutex poolMutex_;
  size_t defaultBufferSize_;
  size_t maxPoolSize_;
  
  static std::unique_ptr<BufferPoolManager> instance_;
};
```

```cpp
// BufferPoolManager.cpp
#include "BufferPoolManager.h"

std::unique_ptr<BufferPoolManager> BufferPoolManager::instance_ = nullptr;

BufferPoolManager::BufferPoolManager(size_t bufferSize, size_t poolSize) 
    : defaultBufferSize_(bufferSize), maxPoolSize_(poolSize) {
  // Pre-allocate some buffers
  std::lock_guard<std::mutex> lock(poolMutex_);
  for (size_t i = 0; i < 5 && i < maxPoolSize_; i++) {
    pool_.push_back(std::make_shared<SharedBufferHostObject>(defaultBufferSize_));
  }
}

BufferPoolManager::~BufferPoolManager() {
  std::lock_guard<std::mutex> lock(poolMutex_);
  pool_.clear();
}

std::shared_ptr<SharedBufferHostObject> BufferPoolManager::acquireBuffer(size_t size) {
  std::lock_guard<std::mutex> lock(poolMutex_);
  
  // Use the requested size or default if not specified
  size_t bufferSize = (size > 0) ? size : defaultBufferSize_;
  
  // Look for a buffer in the pool
  if (!pool_.empty()) {
    auto buffer = pool_.back();
    pool_.pop_back();
    
    // If the buffer is too small, create a new one
    if (buffer->size() < bufferSize) {
      return std::make_shared<SharedBufferHostObject>(bufferSize);
    }
    
    return buffer;
  }
  
  // Create a new buffer if pool is empty
  return std::make_shared<SharedBufferHostObject>(bufferSize);
}

void BufferPoolManager::releaseBuffer(std::shared_ptr<SharedBufferHostObject> buffer) {
  if (!buffer) return;
  
  std::lock_guard<std::mutex> lock(poolMutex_);
  
  // Don't keep too many buffers in the pool
  if (pool_.size() >= maxPoolSize_) {
    return; // Buffer will be destroyed
  }
  
  // Reset length to 0 before returning to pool
  buffer->setLength(0);
  pool_.push_back(buffer);
}

BufferPoolManager& BufferPoolManager::getInstance() {
  if (!instance_) {
    instance_ = std::make_unique<BufferPoolManager>();
  }
  return *instance_;
}
```

#### 1.4 UDPDirectModule Implementation

```cpp
// UDPDirectModule.h
#pragma once

#include <React/RCTBridgeModule.h>
#include <ReactCommon/RCTTurboModule.h>
#include <jsi/jsi.h>
#include <memory>
#include <string>
#include <map>
#include "SharedBufferHostObject.h"
#include "BufferPoolManager.h"

using namespace facebook::jsi;

@interface UDPDirectModule : NSObject <RCTBridgeModule>
@end

class JSI_EXPORT UDPDirectModuleImpl {
public:
  UDPDirectModuleImpl(jsi::Runtime& rt);
  ~UDPDirectModuleImpl();
  
  jsi::Value createBuffer(jsi::Runtime& rt, const jsi::Value* args, size_t count);
  jsi::Value releaseBuffer(jsi::Runtime& rt, const jsi::Value* args, size_t count);
  
  // Socket operations (with direct buffer support)
  jsi::Value createSocket(jsi::Runtime& rt, const jsi::Value* args, size_t count);
  jsi::Value closeSocket(jsi::Runtime& rt, const jsi::Value* args, size_t count);
  jsi::Value bind(jsi::Runtime& rt, const jsi::Value* args, size_t count);
  jsi::Value send(jsi::Runtime& rt, const jsi::Value* args, size_t count);
  
private:
  std::shared_ptr<BufferPoolManager> bufferPool_;
  std::map<std::string, std::unique_ptr<UDPSocket>> sockets_; // You'll need to implement UDPSocket
  
  void registerSocketListener(const std::string& socketId);
};

// Helper to install the JSI module
void installUDPDirectModule(jsi::Runtime& rt);
```

```objc
// UDPDirectModule.mm
#import "UDPDirectModule.h"
#import <React/RCTBridge+Private.h>
#import <React/RCTUtils.h>
#import <jsi/jsi.h>

// Include the C++ implementations
#include "UDPDirectModuleImpl.h"
#include "SharedBufferHostObject.h"
#include "BufferPoolManager.h"

@implementation UDPDirectModule {
  std::shared_ptr<UDPDirectModuleImpl> _implementation;
  RCTBridge* _bridge;
}

RCT_EXPORT_MODULE(UDPDirectModule);

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

- (instancetype)init {
  if (self = [super init]) {
    // Implementation will be created when the bridge is set
  }
  return self;
}

- (void)setBridge:(RCTBridge *)bridge {
  _bridge = bridge;
  
  // Initialize when bridge is ready
  RCTCxxBridge *cxxBridge = (RCTCxxBridge *)bridge;
  if (!cxxBridge.runtime) {
    return;
  }
  
  // Install JSI bindings
  installUDPDirectModule(*(jsi::Runtime *)cxxBridge.runtime);
}

@end

// C++ implementation of UDPDirectModuleImpl.cpp goes here
// ...

// Install the module into the JSI runtime
void installUDPDirectModule(jsi::Runtime& rt) {
  // Create the module implementation
  auto module = std::make_shared<UDPDirectModuleImpl>(rt);
  
  // Create the global object
  auto udpDirectModule = jsi::Object(rt);
  
  // Register the methods
  udpDirectModule.setProperty(rt, "createBuffer", 
    jsi::Function::createFromHostFunction(rt, jsi::PropNameID::forAscii(rt, "createBuffer"), 1,
      [module](jsi::Runtime& rt, const jsi::Value& thisVal, const jsi::Value* args, size_t count) {
        return module->createBuffer(rt, args, count);
      }));
  
  udpDirectModule.setProperty(rt, "releaseBuffer", 
    jsi::Function::createFromHostFunction(rt, jsi::PropNameID::forAscii(rt, "releaseBuffer"), 1,
      [module](jsi::Runtime& rt, const jsi::Value& thisVal, const jsi::Value* args, size_t count) {
        return module->releaseBuffer(rt, args, count);
      }));
  
  // Register socket operations
  // ...
  
  // Set the module as a global
  rt.global().setProperty(rt, "UDPDirectModule", udpDirectModule);
}
```

### 2. Android Implementation

#### 2.1 Java Native Interface (UDPDirectModule.java)

```java
package com.refinio.one.udp;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;
import com.facebook.react.turbomodule.core.CallInvokerHolderImpl;
import com.facebook.jni.HybridData;
import com.facebook.proguard.annotations.DoNotStrip;

@ReactModule(name = UDPDirectModule.NAME)
public class UDPDirectModule extends ReactContextBaseJavaModule {

    public static final String NAME = "UDPDirectModule";
    private final ReactApplicationContext reactContext;

    @DoNotStrip
    private HybridData mHybridData;

    static {
        System.loadLibrary("udpdirect");
    }

    @DoNotStrip
    private native HybridData initHybrid(long jsContext, CallInvokerHolderImpl jsCallInvokerHolder);

    @DoNotStrip
    private native void installJSIBindings();

    public UDPDirectModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return NAME;
    }

    @Override
    public void initialize() {
        super.initialize();
        
        // Install JSI bindings when bridge is initialized
        installJSIBindings();
    }

    // No @ReactMethod methods needed - all exposed via JSI

    @Override
    public void onCatalystInstanceDestroy() {
        if (mHybridData != null) {
            mHybridData.resetNative();
        }
    }
}
```

#### 2.2 C++ Implementation (UDPDirectModule.cpp)

```cpp
// UDPDirectModule.cpp
#include <fbjni/fbjni.h>
#include <jsi/jsi.h>
#include <react/jni/JavaScriptExecutorHolder.h>
#include <react/jni/JMessageQueueThread.h>
#include <jsi/JSIDynamic.h>
#include <ReactCommon/TurboModuleUtils.h>
#include <memory>
#include <string>
#include "SharedBufferHostObject.h"
#include "BufferPoolManager.h"

using namespace facebook::jni;
using namespace facebook::jsi;
using namespace facebook::react;

class UDPDirectModuleImpl {
public:
  UDPDirectModuleImpl(Runtime& rt) {
    bufferPool_ = std::make_shared<BufferPoolManager>();
  }
  
  // Direct buffer methods
  Value createBuffer(Runtime& rt, const Value* args, size_t count) {
    size_t size = 1500; // Default UDP packet size
    if (count > 0 && args[0].isNumber()) {
      size = static_cast<size_t>(args[0].getNumber());
    }
    
    auto buffer = bufferPool_->acquireBuffer(size);
    return Object::createFromHostObject(rt, buffer);
  }
  
  Value releaseBuffer(Runtime& rt, const Value* args, size_t count) {
    if (count == 0 || !args[0].isObject()) {
      return Value::undefined();
    }
    
    Object bufferObj = args[0].getObject(rt);
    if (bufferObj.isHostObject(rt)) {
      auto hostObject = bufferObj.getHostObject(rt);
      auto sharedBuffer = std::dynamic_pointer_cast<SharedBufferHostObject>(hostObject);
      if (sharedBuffer) {
        bufferPool_->releaseBuffer(sharedBuffer);
      }
    }
    
    return Value::undefined();
  }
  
  // Socket operations would be implemented here
  // ...
  
private:
  std::shared_ptr<BufferPoolManager> bufferPool_;
};

// JNI binding
class UDPDirectJSIModule : public facebook::jni::HybridClass<UDPDirectJSIModule> {
public:
  static constexpr auto kJavaDescriptor = "Lcom/refinio/one/udp/UDPDirectModule;";
  
  static void registerNatives() {
    registerHybrid({
      makeNativeMethod("initHybrid", UDPDirectJSIModule::initHybrid),
      makeNativeMethod("installJSIBindings", UDPDirectJSIModule::installJSIBindings),
    });
  }
  
  UDPDirectJSIModule(
    jni::alias_ref<UDPDirectJSIModule::jhybriddata> jThis,
    jlong jsContext,
    jni::alias_ref<CallInvokerHolderImpl::javaobject> jsCallInvokerHolder)
    : jhybrid(jThis),
      runtime_(reinterpret_cast<Runtime*>(jsContext)),
      jsCallInvoker_(jsCallInvokerHolder->cthis()->getCallInvoker()) {}
  
private:
  friend HybridBase;
  
  static auto initHybrid(
    jni::alias_ref<jhybridobject> jThis,
    jlong jsContext,
    jni::alias_ref<CallInvokerHolderImpl::javaobject> jsCallInvokerHolder) {
    return makeCxxInstance(jThis, jsContext, jsCallInvokerHolder);
  }
  
  void installJSIBindings() {
    // Check if runtime is available
    if (!runtime_) {
      return;
    }
    
    auto& rt = *runtime_;
    
    // Create the module implementation
    auto moduleImpl = std::make_shared<UDPDirectModuleImpl>(rt);
    
    // Create the global object
    auto udpDirectModule = Object(rt);
    
    // Expose methods to JavaScript
    udpDirectModule.setProperty(rt, "createBuffer", 
      Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "createBuffer"), 1,
        [moduleImpl](Runtime& rt, const Value& thisVal, const Value* args, size_t count) {
          return moduleImpl->createBuffer(rt, args, count);
        }));
    
    udpDirectModule.setProperty(rt, "releaseBuffer", 
      Function::createFromHostFunction(rt, PropNameID::forAscii(rt, "releaseBuffer"), 1,
        [moduleImpl](Runtime& rt, const Value& thisVal, const Value* args, size_t count) {
          return moduleImpl->releaseBuffer(rt, args, count);
        }));
    
    // Register socket operations
    // ...
    
    // Install as global
    rt.global().setProperty(rt, "UDPDirectModule", udpDirectModule);
  }
  
  jni::global_ref<jhybridobject> jhybrid_;
  Runtime* runtime_;
  std::shared_ptr<CallInvoker> jsCallInvoker_;
};

JNIEXPORT jint JNI_OnLoad(JavaVM* vm, void* reserved) {
  return facebook::jni::initialize(vm, [] {
    UDPDirectJSIModule::registerNatives();
  });
}
```

### Performance Considerations 

1. **Zero-Copy**: The implementation ensures that data is not copied between JS and native layers. The same memory region is directly referenced by JavaScript.

2. **Avoid Conversions**: The native implementation does not perform any string conversions (base64, hex, etc.) unless explicitly requested by the business logic. This keeps the network layer fast.

3. **Buffer Reuse**: The buffer pool manager minimizes memory allocations by recycling buffers, reducing GC pressure.

4. **Memory Management**: Both implementations use smart pointers for memory management, preventing leaks.

5. **One Datatypes**: The implementation allows raw binary access at the network layer, with one datatypes being created only on demand when required by business logic.

6. **Receiver-Side Processing**: Data conversions should happen only in the receiver's business logic, not in the network path.

## Migration Strategy

1. Initially implement as an opt-in feature alongside existing implementation
2. Add feature detection for zero-copy support
3. Gradually migrate existing code to use direct buffers
4. Eventually deprecate the event-based approach

## Risks and Mitigations

1. **JSI Availability**: Ensure fallback to event-based approach when JSI isn't available
2. **Memory Management**: Implement strict buffer lifecycle to prevent leaks
3. **Performance**: Balance buffer pool size vs. memory usage
4. **API Compatibility**: Maintain existing interfaces during transition 

## Testing Plan

1. **Unit Tests**: Test buffer allocation, reading, and writing from both JavaScript and native
2. **Integration Tests**: Test complete flow from socket receive to application processing
3. **Performance Tests**: Compare throughput and latency between old and new approaches
4. **Memory Tests**: Monitor memory usage and ensure no leaks over time 