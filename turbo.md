# TurboModule Integration Guide for iOS (React Native with Expo)

This guide outlines the steps to create and integrate a native TurboModule for iOS in a React Native project, particularly when using Expo and developing the module as a local pod.

## Introduction

TurboModules are a key part of React Native's New Architecture (Fabric). They offer improved performance and type safety compared to legacy Native Modules by using JSI (JavaScript Interface) for direct communication between JavaScript and native code, bypassing the traditional bridge.

## Prerequisites

1.  **Expo Project**: An existing React Native project managed with Expo.
2.  **New Architecture Enabled**: Ensure the New Architecture is enabled in your project.
    *   In `expo.plugins` (e.g., in `app.config.js` or `app.json`):
        ```json
        [
          "expo-build-properties",
          {
            "ios": {
              "newArchitectureEnabled": true
            },
            "android": {
              "newArchitectureEnabled": true // If applicable
            }
          }
        ]
        ```
3.  **Xcode**: For iOS native development.
4.  **CocoaPods**: For managing iOS dependencies.

## Directory Structure Recommendation

There are multiple approaches to organizing your TurboModule code with Expo:

*   **Direct Approach**: If you're building a module that will be integrated with a specific app (not intended for distribution):
    *   Place your module directly in the `ios/MyModule/` directory. This is the simplest approach and lets Expo and CocoaPods discover it naturally.
    
*   **Development Pod Approach**: For more complex scenarios or when you want to keep native code separate:
    *   Keep your module's source code in a dedicated directory outside the `ios` folder, e.g., `ios-custom-modules/MyModule/`.
    *   During prebuild, files will be copied to `ios/MyModule/` by your Expo plugin.
    
*   **Monorepo Package Approach**: For modules intended to be shared across projects:
    *   You can place the module in a package within your monorepo and use Expo's support for local packages.

This guide primarily focuses on the Development Pod approach, but many steps apply regardless of your chosen structure.

## Steps to Create a TurboModule

### Step 1: JavaScript Spec (Interface Definition)

While React Native supports code generation from a JavaScript spec (e.g., `NativeMyModule.js`), for manual setup, you directly define the interface in C++.

### Step 2: C++ Spec Header (`MyModuleSpec.h`)

This file defines the C++ abstract interface for your TurboModule. JavaScript will call these methods.

```cpp
// ios-custom-modules/MyModule/MyModuleSpec.h
#pragma once

#include <ReactCommon/TurboModule.h> // Core C++ TurboModule base
#include <jsi/jsi.h> // For jsi::Object, jsi::Value etc. if used in method signatures

namespace facebook {
namespace react {

class JSI_EXPORT MyModuleSpec : public TurboModule {
public:
  MyModuleSpec(std::shared_ptr<CallInvoker> jsInvoker);

  // Define methods that will be callable from JavaScript.
  // Use jsi::Value for generic return types or complex objects.
  // Use jsi::Runtime& as the first argument for methods needing it.

  virtual jsi::Value someMethod(jsi::Runtime &rt, jsi::String strArg, double numArg, jsi::Object options) = 0;
  virtual void voidMethod(jsi::Runtime &rt) = 0;
  virtual jsi::Value methodWithPromise(jsi::Runtime &rt, bool someCondition) = 0; // Promises are handled by returning a JSI Value that resolves/rejects
};

} // namespace react
} // namespace facebook
```

### Step 3: Objective-C++ Module Header (`MyModule.h`)

This is the main header for your native module. It declares the Objective-C class that will implement the module logic and conform to React Native protocols.

```objc
// ios-custom-modules/MyModule/MyModule.h
#pragma once

#import <React/RCTBridgeModule.h>    // For legacy bridge compatibility (optional but good practice)
#import <React/RCTEventEmitter.h>    // If your module emits events
#import <React-NativeModulesApple/ReactCommon/RCTTurboModule.h>     // For TurboModule conformance (Objective-C side)
#import "MyModuleSpec.h"             // Your C++ Spec

NS_ASSUME_NONNULL_BEGIN

@interface MyModule : RCTEventEmitter <RCTBridgeModule, RCTTurboModule> // Conform to RCTTurboModule

// Declare methods that will be called by the TurboModule C++ implementation.
// These are the actual native implementations.
// Use RCTPromiseResolveBlock and RCTPromiseRejectBlock for promise-based methods.
- (void)someMethod:(NSString *)strArg 
            numArg:(double)numArg 
           options:(NSDictionary *)options
          resolver:(RCTPromiseResolveBlock)resolve
          rejecter:(RCTPromiseRejectBlock)reject;

- (void)voidMethod;

- (void)methodWithPromise:(BOOL)someCondition
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject;

@end

NS_ASSUME_NONNULL_END
```

### Step 4: Objective-C++ Module Implementation (`MyModule.mm`)

This file contains the primary native logic for your module.

```objc
// ios-custom-modules/MyModule/MyModule.mm
#import "MyModule.h"
#import <React/RCTLog.h>
#import <React/RCTConvert.h> // For type conversions

// For TurboModule C++ binding (defined in Step 5)
namespace facebook { namespace react { class MyModuleTurbo; } }

@implementation MyModule {
  // Internal state, e.g., dispatch queues, data stores
  dispatch_queue_t _myModuleQueue;
}

RCT_EXPORT_MODULE(); // Exports the module to React Native (uses class name by default)

- (instancetype)init {
  if (self = [super init]) {
    _myModuleQueue = dispatch_queue_create("com.example.MyModuleQueue", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

// Required for TurboModules if you don't want it on the main thread.
+ (BOOL)requiresMainQueueSetup {
  return NO; // Or YES if your module needs main thread setup
}

// If emitting events
- (NSArray<NSString *> *)supportedEvents {
  return @[@"myEventName"];
}

// Actual method implementations
- (void)someMethod:(NSString *)strArg 
            numArg:(double)numArg 
           options:(NSDictionary *)options
          resolver:(RCTPromiseResolveBlock)resolve
          rejecter:(RCTPromiseRejectBlock)reject {
  dispatch_async(_myModuleQueue, ^{
    RCTLogInfo(@"MyModule someMethod called with: %@, %f, %@", strArg, numArg, options);
    // ... your native logic ...
    NSDictionary *result = @{@"status": @"success", @"data": strArg};
    resolve(result);
    // Or if error: reject(@"ERROR_CODE", @"Error message", nil);
  });
}

- (void)voidMethod {
  RCTLogInfo(@"MyModule voidMethod called");
  // ... your native logic ...
  // If emitting an event:
  // [self sendEventWithName:@"myEventName" body:@{@"key": @"value"}];
}

- (void)methodWithPromise:(BOOL)someCondition
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject {
  if (someCondition) {
    resolve(@"Promise resolved successfully!");
  } else {
    reject(@"COND_FALSE", @"Condition was false, promise rejected", nil);
  }
}

#pragma mark - RCTTurboModule

// This links the Objective-C class to the C++ TurboModule binding.
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::MyModuleTurbo>(params);
  // Note: MyModuleTurbo is the C++ class that implements MyModuleSpec
  // It will typically call back into this Objective-C MyModule instance.
}

@end
```

### Step 5: C++ Spec Implementation / JSI Binding (`MyModuleTurbo.mm`)

This C++ class acts as the bridge between JSI calls and your Objective-C native implementation. It implements the C++ Spec from your module spec file and defines the required host functions.

```cpp
// ios-custom-modules/MyModule/MyModuleTurbo.mm
#import "MyModule.h"      // The Objective-C Module
#import "MyModuleSpec.h"  // The C++ Spec this class implements

#import <React/RCTConvert.h>
#import <jsi/jsi.h>

using namespace facebook::jsi;
using namespace facebook::react;

// Helper to convert NSError to jsi::JSError
static void throwJSIError(Runtime &rt, NSError * _Nullable error, const std::string& messagePrefix) {
    std::string errorMessage = messagePrefix;
    if (error && error.localizedDescription) {
        errorMessage += ": " + std::string([error.localizedDescription UTF8String]);
    } else if (!error) {
        errorMessage += ": Native operation failed";
    }
    throw JSError(rt, errorMessage);
}

// Helper to convert jsi::Object to NSDictionary
static NSDictionary * _Nullable convertJSIObjectToNSDictionary(Runtime &rt, const Object &jsiObject) {
    if (jsiObject.getPropertyNames(rt).size(rt) == 0) {
        return nil;
    }
    NSMutableDictionary *dict = [NSMutableDictionary dictionary];
    Array propertyNames = jsiObject.getPropertyNames(rt);
    for (size_t i = 0; i < propertyNames.size(rt); i++) {
        String name = propertyNames.getValueAtIndex(rt, i).asString(rt);
        std::string keyStr = name.utf8(rt);
        NSString *key = [NSString stringWithUTF8String:keyStr.c_str()];
        
        Value val = jsiObject.getProperty(rt, name);
        if (val.isString()) {
            dict[key] = [NSString stringWithUTF8String:val.asString(rt).utf8(rt).c_str()];
        } else if (val.isNumber()) {
            dict[key] = @(val.asNumber());
        } else if (val.isBool()) {
            dict[key] = @(val.asBool());
        }
    }
    return dict;
}

namespace facebook {
namespace react {

// Host functions that JSI calls, which then dispatch to the class methods
static Value __hostFunction_MyModuleSpec_someMethod(Runtime &rt, TurboModule &turboModule, const Value *args, size_t count) {
    auto &module = static_cast<MyModuleTurbo &>(turboModule);
    return module.someMethod(rt, args[0].asString(rt), args[1].asNumber(), args[2].asObject(rt));
}

static Value __hostFunction_MyModuleSpec_voidMethod(Runtime &rt, TurboModule &turboModule, const Value *args, size_t count) {
    auto &module = static_cast<MyModuleTurbo &>(turboModule);
    module.voidMethod(rt);
    return Value::undefined();
}

static Value __hostFunction_MyModuleSpec_methodWithPromise(Runtime &rt, TurboModule &turboModule, const Value *args, size_t count) {
    auto &module = static_cast<MyModuleTurbo &>(turboModule);
    return module.methodWithPromise(rt, args[0].asBool());
}

// TurboModule implementation that delegates to Objective-C
class MyModuleTurbo : public MyModuleSpec {
public:
    MyModuleTurbo(const ObjCTurboModule::InitParams &params)
        : MyModuleSpec(params.jsInvoker),
          objcInstance_(static_cast<MyModule *>(params.instance)) {
        
        // Register methods
        methodMap_["someMethod"] = MethodMetadata{3, __hostFunction_MyModuleSpec_someMethod};
        methodMap_["voidMethod"] = MethodMetadata{0, __hostFunction_MyModuleSpec_voidMethod};
        methodMap_["methodWithPromise"] = MethodMetadata{1, __hostFunction_MyModuleSpec_methodWithPromise};
    }
    
    // Implementations that call into Objective-C
    Value someMethod(Runtime &rt, String strArg, double numArg, Object options) override {
        NSString *strArgObjC = [NSString stringWithUTF8String:strArg.utf8(rt).c_str()];
        NSDictionary *optionsDict = convertJSIObjectToNSDictionary(rt, options);
        
        // Setup promise
        __block bool resolved = false;
        __block id result = nil;
        __block NSError *error = nil;
        
        // Call into Objective-C
        [objcInstance_ someMethod:strArgObjC
                          numArg:numArg
                         options:optionsDict
                        resolver:^(id value) {
                            resolved = true;
                            result = value;
                        }
                        rejecter:^(NSString *code, NSString *message, NSError *err) {
                            resolved = false;
                            error = err ?: [NSError errorWithDomain:@"MyModule" code:0 userInfo:@{NSLocalizedDescriptionKey: message ?: @"Unknown error"}];
                        }];
        
        // Handle result
        if (!resolved) {
            throwJSIError(rt, error, "MyModule.someMethod failed");
        }
        
        // Convert result back to JSI
        return Value::null(); // Replace with actual result conversion
    }
    
    void voidMethod(Runtime &rt) override {
        [objcInstance_ voidMethod];
    }
    
    Value methodWithPromise(Runtime &rt, bool someCondition) override {
        __block bool resolved = false;
        __block id result = nil;
        __block NSError *error = nil;
        
        [objcInstance_ methodWithPromise:someCondition
                              resolver:^(id value) {
                                  resolved = true;
                                  result = value;
                              }
                              rejecter:^(NSString *code, NSString *message, NSError *err) {
                                  resolved = false;
                                  error = err ?: [NSError errorWithDomain:@"MyModule" code:0 userInfo:@{NSLocalizedDescriptionKey: message ?: @"Unknown error"}];
                              }];
        
        if (!resolved) {
            throwJSIError(rt, error, "MyModule.methodWithPromise failed");
        }
        
        // Convert result
        if ([result isKindOfClass:[NSString class]]) {
            return String::createFromUtf8(rt, [(NSString *)result UTF8String]);
        }
        return Value::null(); // Or appropriate conversion
    }
    
private:
    MyModule *objcInstance_;
};

// Provider function
std::shared_ptr<TurboModule> MyModuleProvider(const ObjCTurboModule::InitParams &params) {
    return std::make_shared<MyModuleTurbo>(params);
}

} // namespace react
} // namespace facebook
```

### Step 6: Module Registry (`MyModuleRegistry.h` and `MyModuleRegistry.mm`)

This registers your TurboModule with the system so it can be loaded.

```objc
// ios-custom-modules/MyModule/MyModuleRegistry.h
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface MyModuleRegistry : NSObject

// Class method to register the module with the TurboModule system
+ (void)registerModules;

@end

NS_ASSUME_NONNULL_END
```

```objc
// ios-custom-modules/MyModule/MyModuleRegistry.mm
#import "MyModuleRegistry.h"
#import <React/RCTLog.h>

// Essential for registering with TurboModule system
#if __has_include(<React-NativeModulesApple/ReactCommon/RCTTurboModuleRegistry.h>)
#import <React-NativeModulesApple/ReactCommon/RCTTurboModuleRegistry.h>
#else 
#import <ReactCommon/RCTTurboModuleRegistry.h>
#endif

// Get your module class
#import "MyModule.h"

@implementation MyModuleRegistry

// Static initializer called at app startup
+ (void)load {
    NSLog(@"[MyModuleRegistry] load called");
}

// Static method to register modules
+ (void)registerModules {
    // Register your module with the TurboModule registry
    __autoreleasing NSError *error = nil;
    if (![RCTTurboModuleRegistry registerTurboModule:@"MyModule" 
                                          withClass:[MyModule class]
                                              error:&error]) {
        RCTLogError(@"[MyModuleRegistry] Failed to register module: %@", error);
    } else {
        RCTLogInfo(@"[MyModuleRegistry] Successfully registered MyModule with TurboModule system");
    }
}

@end
```

### Step 7: Podspec File (`MyModule.podspec`)

This file configures your module's CocoaPods integration.

```ruby
# ios-custom-modules/MyModule/MyModule.podspec
require 'json'

package = JSON.parse(File.read(File.join(__dir__, '../../package.json')))

Pod::Spec.new do |s|
  s.name         = "MyModule"
  s.version      = package["version"] || "1.0.0"
  s.summary      = "My module for React Native"
  s.description  = "Description of my module"
  s.homepage     = "https://github.com/myorg/myrepo"
  s.license      = "MIT"
  s.author       = { "Your Name" => "your.email@example.com" }
  s.platforms    = { :ios => "13.0" }
  s.source       = { :git => "https://github.com/myorg/myrepo.git", :tag => "#{s.version}" }
  
  # All source files
  s.source_files = "*.{h,m,mm}"
  
  # Public headers
  s.public_header_files = [
    "MyModule.h",
    "MyModuleRegistry.h"
  ]
  
  # Dependencies
  s.dependency "React-Core"
  s.dependency "React-jsi"
  
  # Configure minimal build settings
  s.pod_target_xcconfig = {
    "HEADER_SEARCH_PATHS" => "$(PODS_ROOT)/Headers/Public $(PODS_ROOT)/Headers/Public/React-Core $(PODS_ROOT)/Headers/Public/React-jsi",
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++17"
  }
  
  # Use static framework
  s.static_framework = true
end
```

### Step 8: Expo Plugin Configuration

Create a plugin to integrate your module with Expo:

```javascript
// my-module-plugin.js
const { withDangerousMod, withAppDelegate, withPodfile } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// 1. Copy source files
const withMyModuleFiles = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (c) => {
      const sourceDir = path.join(c.modRequest.projectRoot, 'ios-custom-modules/MyModule');
      const destDir = path.join(c.modRequest.projectRoot, 'ios/MyModule');
      
      // Create destination directory
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      
      // Copy all files
      fs.readdirSync(sourceDir).forEach(file => {
        if (fs.statSync(path.join(sourceDir, file)).isFile()) {
          fs.copyFileSync(
            path.join(sourceDir, file),
            path.join(destDir, file)
          );
        }
      });
      
      return c;
    }
  ]);
};

// 2. Add pod to Podfile
const withMyModulePod = (config) => {
  return withPodfile(config, (podfileConfig) => {
    const podLine = `  pod 'MyModule', :path => './MyModule'`;
    
    // Add pod if not already present
    if (!podfileConfig.modResults.contents.includes(`pod 'MyModule'`)) {
      const targetRegex = new RegExp(`target '${podfileConfig.modRequest.projectName}' do`, 'm');
      const match = podfileConfig.modResults.contents.match(targetRegex);
      
      if (match) {
        const targetBlockStart = match.index + match[0].length;
        podfileConfig.modResults.contents = 
          podfileConfig.modResults.contents.substring(0, targetBlockStart) +
          `\n${podLine}` +
          podfileConfig.modResults.contents.substring(targetBlockStart);
      }
    }
    
    return podfileConfig;
  });
};

// 3. Update AppDelegate for module registration
const withMyModuleRegistration = (config) => {
  return withAppDelegate(config, (appDelegateConfig) => {
    if (appDelegateConfig.modResults.contents.includes('class AppDelegate')) {
      // Swift AppDelegate
      const registrationCode = `
    // Register MyModule with TurboModule system
    if let moduleRegistryClass = NSClassFromString("MyModuleRegistry") {
      let selector = NSSelectorFromString("registerModules")
      if moduleRegistryClass.responds(to: selector) {
        moduleRegistryClass.perform(selector)
      }
    }
`;
      
      // Add before return statement in didFinishLaunchingWithOptions
      const returnStatement = 'return super.application(';
      const insertionPoint = appDelegateConfig.modResults.contents.lastIndexOf(returnStatement);
      
      if (insertionPoint !== -1) {
        const beforeReturn = appDelegateConfig.modResults.contents.substring(0, insertionPoint);
        const afterReturn = appDelegateConfig.modResults.contents.substring(insertionPoint);
        
        appDelegateConfig.modResults.contents = beforeReturn + registrationCode + afterReturn;
      }
    }
    
    return appDelegateConfig;
  });
};

// Main plugin function
module.exports = (config) => {
  config = withMyModuleFiles(config);
  config = withMyModulePod(config);
  config = withMyModuleRegistration(config);
  return config;
};
```

Add your plugin to `app.config.js`:

```javascript
const withMyModule = require('./my-module-plugin');

module.exports = ({ config }) => {
  config = withMyModule(config);
  return config;
};
```

## Simplifying C++ Integration with Preprocessor Macros

If you encounter C++ compilation errors with newer Xcode versions, use these macros at the top of your .mm files:

```cpp
// Enable C++17 compatibility
#ifndef _LIBCPP_ENABLE_CXX17_REMOVED_FEATURES
#define _LIBCPP_ENABLE_CXX17_REMOVED_FEATURES 1
#endif

// Add support for newer allocator_traits implementation
#ifndef _LIBCPP_HAS_NO_INCOMPLETE_FORMAT
#define _LIBCPP_HAS_NO_INCOMPLETE_FORMAT
#endif

#ifndef _LIBCPP_AVAILABILITY_CUSTOM_VECTOR_BOOL_SPECIALIZATION
#define _LIBCPP_AVAILABILITY_CUSTOM_VECTOR_BOOL_SPECIALIZATION
#endif

// Silence warnings about std::allocator members being deprecated in C++17
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"

// ... your implementation code ...

#pragma clang diagnostic pop
```

## Troubleshooting

If you encounter issues:

1. **Clean your build environment**:
   ```bash
   cd ios
   rm -rf build Pods
   pod install
   ```

2. **Verify module registration**:
   - Check AppDelegate for registration code
   - Ensure bridging header imports are correct
   - Look for log messages during module initialization

3. **Inspect your podspec**:
   - Confirm all dependencies are listed
   - Check that header search paths are correct
   - Ensure C++17 compatibility settings are present

4. **Check for C++ header issues**:
   - Add the necessary preprocessor definitions
   - Update includes with fallback paths
   - Use only needed dependencies
   
5. **Simplify file organization**:
   - Keep related files together
   - Use clear naming conventions
   - Minimize dependencies between components

## Common Pitfalls to Avoid

1. **Circular dependencies** - Ensure modules don't circularly depend on each other
2. **Mixing C++ standards** - Stick with C++17 consistently
3. **Complex subspecs** - Prefer simple podspec configurations
4. **Redundant header imports** - Only import what you actually need
5. **Tight coupling** - Separate concerns clearly between components
6. **React Native version mismatches** - Verify compatibility with your RN version
7. **Ignoring memory management** - Use proper reference handling in asynchronous operations

By following this simplified approach, your TurboModules will be more maintainable and reliable across React Native and Expo updates.

## UDP Module Refactoring Plan

The current UDP module architecture has several issues causing build failures, including circular dependencies, inconsistent forward declarations, and conflicting compilation contexts. The following refactoring plan addresses these issues.

### Current Issues

1. **Circular Dependencies**
   - `UDPSocketManager.h` imports `Fix/UDPSocketManagerDelegate.h`
   - `UDPModule+Delegate.h` imports `UDPModule.h`
   - `UDPModule.h` imports `Fix/UDPModule+Delegate.h`

2. **Inconsistent C++/Objective-C Boundary**
   - Mixing pure C++ code with Objective-C++ in ways that create ambiguous nullability

3. **Fragmented Implementation**
   - Code spread across multiple directories (`UDPModule`, `UDPDirectModule`)
   - Redundant functionality and cross-module imports

4. **Prebuild Process Issues**
   - Staging files in `ios-custom-modules` that get copied to the generated `ios` directory
   - Inconsistent files between source and destination

### Refactoring Goals

1. Eliminate circular dependencies
2. Establish clear C++/Objective-C boundaries
3. Consolidate related functionality
4. Simplify the build process
5. Fix nullability warnings

### Implementation Plan

#### Phase 1: Restructure Headers and Forward Declarations

1. **Create Clear Protocol Files**
   - Move delegate protocols to standalone header files with no dependencies
   - Use forward declarations instead of imports wherever possible

2. **Flatten Directory Structure**
   - Remove the `Fix` subdirectory, moving files to the parent directory
   - Use clear naming conventions for related files

3. **Separate C++ and Objective-C Concerns**
   - Create language-specific headers for mixed contexts
   - Use proper conditional compilation directives

#### Phase 2: Consolidate UDP Functionality

1. **Review Common Patterns**
   - Identify duplicated code between `UDPModule` and `UDPDirectModule`
   - Create shared utility functions

2. **Clarify Module Boundaries**
   - Determine which module should own which functionality
   - Reduce cross-module dependencies

3. **Proper Type Handling**
   - Add consistent nullability annotations
   - Fix pointer type declarations in C++ contexts

#### Phase 3: Simplify Module Registration

1. **Clean Registration Process**
   - Simplify the module registration logic
   - Ensure consistent initialization

2. **Unified Compatibility Headers**
   - Create a single compatibility header for C++ features
   - Remove redundant preprocessor definitions

### Implementation Steps (Phase 1)

1. Create `UDPSocketManagerDelegate.h` in the main directory with only necessary imports
2. Update `UDPSocketManager.h` to import the relocated delegate header
3. Remove category approach in favor of direct protocol implementation
4. Fix nullability specifiers in all header files
5. Create proper typedefs for C++ contexts

### Post-Refactoring Structure

```
ios-custom-modules/
├── UDPModule/
│   ├── UDPModule.h                   # Main module header
│   ├── UDPModule.m                   # Implementation
│   ├── UDPSocketManager.h            # Socket manager definition
│   ├── UDPSocketManager.m            # Implementation 
│   ├── UDPSocketManagerDelegate.h    # Protocol definition (moved from Fix/)
│   ├── UDPSocket.h                   # Socket interface
│   ├── UDPSocket.m                   # Implementation
│   ├── UDPModuleCompat.h             # Compatibility header for C++
│   ├── UDPModuleTurbo.mm             # JSI integration
│   └── UDPModuleRegistry.mm          # Registration
│
└── UDPDirectModule/
    ├── UDPDirectModule.h             # Main direct module header
    ├── UDPDirectModule.mm            # Implementation
    ├── UDPDirectModuleCompat.h       # Self-contained compatibility header
    ├── SharedBufferHostObject.h      # Buffer management
    ├── SharedBufferHostObject.mm     # Implementation
    └── UDPDirectModuleRegister.mm    # Registration
```

This approach eliminates circular dependencies and clarifies the relationship between components while maintaining the necessary functionality.

# TurboModule Refactoring Plan for UDPDirectModule

The goal is to refactor the `UDPDirectModule` to rely solely on the C++ TurboModule (`UDPDirectModuleCxxImpl`) as the primary interface to JavaScript. All Objective-C UDP logic will be encapsulated in a new helper class, `UDPSocketManager`.

## Refactoring Steps

1.  **Create `UDPSocketManager.h` and `UDPSocketManager.mm`** (Done)
    *   Defines an Objective-C class to encapsulate `GCDAsyncUdpSocket` creation, management, and delegate handling.
    *   Uses Objective-C blocks (callbacks) to communicate events (data received, errors, socket closures) back to its C++ owner.
    *   This class is *not* a React Native module itself.

2.  **Modify `UDPDirectModuleCxxImpl.h`** (Done - Initial Pass)
    *   Remove `__weak UDPDirectModule* objcModule_;`.
    *   Add forward declaration for `UDPSocketManager`.
    *   Add `std::unique_ptr<UDPSocketManager> socketManager_;`.
    *   Update constructor to `UDPDirectModuleCxxImpl(std::shared_ptr<facebook::react::CallInvoker> jsInvoker);`.
    *   Remove secondary constructor.
    *   Add `std::shared_ptr<facebook::react::CallInvoker> jsInvoker_;`.
    *   Add destructor `~UDPDirectModuleCxxImpl()`.
    *   Prototype helper methods: `emitDeviceEvent`, `JSErrorFromNSError`, `setupSocketManagerCallbacks`.

3.  **Implement Core Logic in `UDPDirectModuleCxxImpl.mm`**
    *   **Constructor/Destructor**:
        *   Implement `UDPDirectModuleCxxImpl(std::shared_ptr<facebook::react::CallInvoker> jsInvoker)`:
            *   Store `jsInvoker`.
            *   Create a `dispatch_queue_t` for `UDPSocketManager`.
            *   Instantiate `socketManager_ = std::make_unique<UDPSocketManager>(initWithDelegateQueue: queue);`.
            *   Call `setupSocketManagerCallbacks(*this->rt_);` (or pass runtime if available, otherwise will need to handle runtime access carefully in callbacks).
        *   Implement `~UDPDirectModuleCxxImpl()`:
            *   Ensure `socketManager_` is properly released (unique_ptr handles this, but be mindful of Obj-C ARC if `socketManager_` holds strong refs to C++ via blocks that capture `this`).
    *   **`setupSocketManagerCallbacks` Method**:
        *   Define C++ lambdas for each callback property in `UDPSocketManager` (`onDataReceived`, `onSocketClosed`, `onSendSuccess`, `onSendFailure`).
        *   These lambdas will:
            *   Convert Objective-C data (NSNumber, NSData, NSError) to JSI types (jsi::Value, jsi::String, jsi::Object, jsi::ArrayBuffer).
            *   For `onDataReceived`, create a `SharedBufferHostObject` for the received data.
            *   Call `emitDeviceEvent` to send the event to JavaScript.
        *   Assign these lambdas to the `socketManager_` properties (e.g., `socketManager_->onDataReceived = ...;`).
    *   **JSI Method Implementations**:
        *   Refactor all overridden JSI methods (e.g., `createSocket`, `bind`, `send`, `close`, socket option methods, buffer methods) to:
            *   Convert JSI arguments to Objective-C types.
            *   Call the corresponding methods on the `socketManager_` instance.
            *   For methods returning promises:
                *   If the `socketManager_` method is synchronous and returns success/failure or data (e.g., `createSocketWithOptions:error:`, `getSocketAddress:`), resolve/reject the JSI promise directly based on the result.
                *   If the `socketManager_` operation is asynchronous (like `sendData:onSocket:...` which relies on delegate callbacks), the promise resolution/rejection will happen within the C++ lambdas set up in `setupSocketManagerCallbacks`. This often involves storing the JSI promise's `resolve` and `reject` functions in a map keyed by a tag or socket ID, and then invoking them when the corresponding `onSendSuccess` or `onSendFailure` callback fires.
            *   Convert return values from Objective-C (e.g., `NSDictionary`, `NSArray`, `NSNumber`) to JSI types (`jsi::Object`, `jsi::Array`, `jsi::Value`).
            *   Use `JSErrorFromNSError` to convert `NSError*` from `socketManager_` into JSI errors for promise rejections.
    *   **`SharedBufferHostObject` Creation**:
        *   For `getSharedBufferObject` (called by JS to get a host object for a *created* buffer): `socketManager_->createManagedBufferOfSize:` will return a buffer ID. Use this ID and `socketManager_->getModifiableBufferWithId:` to create the `SharedBufferHostObject`.
        *   For received data (in `onDataReceived` C++ lambda): `socketManager_` provides a buffer ID. Use this ID and `socketManager_->getModifiableBufferWithId:` to create the `SharedBufferHostObject`. The `UDPSocketManager` will also call `jsDidAcquireReceivedBuffer` and `jsDidReleaseBufferId` appropriately.
        *   **Event Emitter Implementation**:
            *   Implement `addListener(jsi::Runtime &rt, jsi::String eventName)` and `removeListeners(jsi::Runtime &rt, double count)`. For TurboModules, these usually just increment/decrement an internal listener count. The actual event dispatch often uses `RCTDeviceEventEmitter` (or a similar global event emitter accessible from JSI).
            *   Implement `emitDeviceEvent(jsi::Runtime &rt, const std::string &eventName, std::function<void(jsi::Object &eventData)> P)`:
                *   This helper will take the event name and a lambda to populate the event data object.
                *   It will use `jsInvoker_->invokeAsync` to ensure the event is emitted on the JS thread.
                *   Inside the `invokeAsync` lambda: `rt.global().getPropertyAsFunction(rt, "RCTDeviceEventEmitter").call(rt, "emit", jsi::String::createFromUtf8(rt, eventName), eventPayloadObject);`
        *   **`getConstants`**:
            *   Return any constants required by the JS side (e.g., error codes). This can be hardcoded or fetched from `UDPSocketManager` if appropriate.
        *   **Helper `JSErrorFromNSError`**:
            *   Implement this to take an `NSError*` and a prefix, and return a `jsi::JSError` or a `jsi::Value` representing an error object.

4.  **Update `UDPModuleTurbo.mm` (TurboModule Provider)**
    *   Modify the `getTurboModule` method:
        *   It should now create `UDPDirectModuleCxxImpl` using only the `params.jsInvoker`:
            `return std::make_shared<facebook::react::UDPDirectModuleCxxImpl>(params.jsInvoker);`
        *   The `params.bridge` is no longer passed.
    *   Remove any code related to the old `UDPDirectModule` singleton if it was being accessed or managed here.

5.  **Delete Old `UDPDirectModule.h` and `UDPDirectModule.mm`**
    *   Once all functionality is successfully migrated to `UDPSocketManager` and `UDPDirectModuleCxxImpl`, these files can be safely deleted from the `ios-custom-modules/UDPDirectModule/` directory and from the Xcode project/CocoaPods if they were explicitly listed.

6.  **Resolve Linter/Build Issues with `UDPDirectModuleSpecJSI.h`**
    *   Ensure that the C++ Codegen process correctly generates `UDPDirectModuleSpecJSI.h`.
    *   Verify that `#include "UDPDirectModuleSpecJSI.h"` in `UDPDirectModuleCxxImpl.h` (or `.mm`) correctly finds this generated header. This often involves checking Xcode Header Search Paths.
    *   Confirm that `UDPDirectModuleCxxImpl` accurately implements all pure virtual methods defined in `NativeUdpModuleCxxSpecJSI` (the base class from the generated spec) with the correct JSI signatures. Mismatches here are a common source of build errors and the linter errors you've observed.

7.  **Testing and Debugging**
    *   Thoroughly test all functionalities: socket creation, binding, sending/receiving data (string and ArrayBuffer/SharedArrayBuffer), multicast operations, event emissions, and error handling.
    *   Use logging (`RCTLogInfo`, `NSLog`, C++ `std::cout` or a logging library) extensively during development.