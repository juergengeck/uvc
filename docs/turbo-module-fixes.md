# TurboModule Loading Fixes

This document summarizes the changes made to fix TurboModule loading issues after React Native and Expo upgrades.

## Issue Overview

After upgrading React Native and Expo, we encountered issues with several TurboModules not loading properly:

1. **llama.rn** - The native module for local LLM inference was not being properly loaded or registered
2. **UDPModule** - Custom UDP module for networking was available but missing required methods
3. **UDPDirectModule** - Direct buffer UDP module had registration issues
4. **C++ Compilation Errors** - Newer Xcode versions (16+) have issues with the allocator_traits implementation

## Root Causes

The issues were primarily caused by:

1. **Header Search Path Issues** - The New Architecture requires specific header search paths for TurboModules
2. **Duplicate Header Files** - Build errors were occurring due to duplicate header file definitions
3. **Registration Discrepancies** - TurboModules were registered in different ways but not consistently
4. **Missing Preprocessor Definitions** - Some modules required RCT_NEW_ARCH_ENABLED=1 flag
5. **C++17 Compatibility Issues** - Xcode 16+ has changes to the C++ standard library implementation that break compilation

## Implemented Fixes

### 1. Expo Config Plugins

We enhanced existing plugins and created new ones:

- **withLlamaFix.js** - Fixes header search paths, duplicate header issues, and adds C++17 compatibility flags
- **withUdpHeaderPaths.js** - Adds necessary header paths and C++17 flags specific to UDP TurboModules

### 2. Build Process Improvements

- Created **fix-turbo-modules.sh** script to automate the fix process
- Updated app.json and app.plugin.js to include all necessary plugins
- Added proper Folly configuration flags to the build process

### 3. C++17 Compatibility Flags

Added the following flags to fix C++ compilation issues with Xcode 16+:

```
-D_LIBCPP_ENABLE_CXX17_REMOVED_FEATURES=1
-D_LIBCPP_HAS_NO_INCOMPLETE_FORMAT
-D_LIBCPP_AVAILABILITY_CUSTOM_VECTOR_BOOL_SPECIALIZATION
```

These flags help address compatibility issues with newer implementations of `allocator_traits` in the C++ standard library.

### 4. Debugging Infrastructure

Added new utilities to help diagnose TurboModule issues:

- **nativeModuleDebug.ts** - Utility for checking module availability
- **init.ts** - Added early checks during platform initialization
- **turbo-module-debugging.md** - Comprehensive debugging guide

## How to Apply the Fixes

1. Make sure all plugins are properly configured in app.json:
   ```json
   "plugins": [
     // ... other plugins
     "./udp-direct-module-plugin.js",
     "./llama-rn-plugin.js",
     "./plugins/withLlamaFix.js",
     "./plugins/withUdpHeaderPaths.js"
   ]
   ```

2. Run the fix script:
   ```bash
   ./scripts/fix-turbo-modules.sh
   ```

3. If issues persist, follow the debugging steps in docs/turbo-module-debugging.md

## Technical Details

### TurboModule Registration

For proper TurboModule registration in the New Architecture, modules must:

1. Be properly declared with the TurboModule spec
2. Have correct header search paths for React-related includes
3. Have consistent method signatures between JS and native
4. Be registered through both AppDelegate and JS modules

### Header Path Configuration

Critical header paths for TurboModules:
```
$(PODS_ROOT)/Headers/Public/React-Core
$(PODS_ROOT)/Headers/Public/React-RCTEventEmitter
$(PODS_ROOT)/Headers/Public/React-cxxreact
$(PODS_ROOT)/Headers/Public/React-jsi
$(PODS_ROOT)/Headers/Public/ReactCommon
$(PODS_ROOT)/Headers/Public/React-callinvoker
$(PODS_ROOT)/Headers/Public/React-runtimeexecutor
```

### Module Import Strategy

For consistency, we've standardized our module import approach:

1. Import native modules directly using TurboModuleRegistry when possible
2. Fall back to NativeModules for compatibility
3. Provide utility functions to check module availability 

### C++17 Compatibility for Xcode 16+

For newer Xcode versions (16+), C++ source files may need compatibility flags due to changes in the standard library. 
The key issue is with `allocator_traits<>::construct` which now uses `std::__construct_at` which may not be found.

You can also add these macros directly to your source files:

```cpp
#ifndef _LIBCPP_ENABLE_CXX17_REMOVED_FEATURES
#define _LIBCPP_ENABLE_CXX17_REMOVED_FEATURES 1
#endif

#ifndef _LIBCPP_HAS_NO_INCOMPLETE_FORMAT
#define _LIBCPP_HAS_NO_INCOMPLETE_FORMAT
#endif

#ifndef _LIBCPP_AVAILABILITY_CUSTOM_VECTOR_BOOL_SPECIALIZATION
#define _LIBCPP_AVAILABILITY_CUSTOM_VECTOR_BOOL_SPECIALIZATION
#endif

// Optional: Silence warnings about deprecated features in C++17
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"

// ... your implementation code ...

#pragma clang diagnostic pop
```

# TurboModule Implementation Fixes for UDPModule

This document outlines the key fixes applied to the UDPModule TurboModule implementation to resolve various compatibility issues with React Native's New Architecture.

## Header Resolution Issues

### Problem
The React Native New Architecture moved several key headers to different packages, causing import failures:
- `RCTTurboModule.h` moved from `ReactCommon` to `React-NativeModulesApple/ReactCommon`
- Import paths need conditional handling to work across different React Native versions

### Solution
Added conditional includes with fallbacks in both UDPModule.h and UDPModuleSpec.h:

```objc
#if __has_include(<React-NativeModulesApple/ReactCommon/RCTTurboModule.h>)
#import <React-NativeModulesApple/ReactCommon/RCTTurboModule.h>
#else
#import <ReactCommon/RCTTurboModule.h> // Fallback path
#endif
```

## C++ Standard Library Compatibility

### Problem
Newer Xcode versions (16+) experienced issues with C++ standard library headers in the TurboModule implementation:
- `<functional>` and other headers resulted in "file not found" errors
- Compilation errors related to C++17 removed features

### Solution
1. Updated all podspecs to use the latest Folly version for compatibility:
   ```ruby
   folly_version = '2024.11.18.00'
   ```

2. Improved C++ standard library handling by:
   - Ensuring direct header includes in implementation files
   - Adding C++ preprocessor directives to maintain compatibility

3. Added C++17 compatibility flags in the podspec:
   ```ruby
   s.pod_target_xcconfig = {
     'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
     'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) _LIBCPP_ENABLE_CXX17_REMOVED_FEATURES=1'
   }
   ```

## JSI Promise Implementation

### Problem
The JSI Promise implementation had issues with how it handled JSI Value objects, causing runtime errors:
- The `get` method was incorrectly returning the internal value directly, not wrapping it properly

### Solution
Fixed the JSI Promise class implementation:

```cpp
Value get(Runtime& runtime) {
    if (_resolved) {
        // Create a new Value object to return instead of returning the internal one directly
        return jsi::Value(runtime, _value);
    } else if (_rejected) {
        // Properly throw a JS error
        jsi::Object error = jsi::Object(runtime);
        error.setProperty(runtime, "message", jsi::String::createFromUtf8(runtime, "Promise was rejected"));
        return jsi::Value(runtime, error);
    }
    return jsi::Value::undefined();
}
```

## Package Resolution in Podspec

### Problem
The podspecs were looking for the package.json file in the wrong location:
- Using a relative path within the UDPModule directory, which didn't exist

### Solution
Updated both podspecs to reference the workspace root package.json:

```ruby
package = JSON.parse(File.read(File.join(__dir__, '../../package.json')))
```

## Data Type Consistency

### Problem
Inconsistent data types were used across TurboModule implementation:
- Socket IDs were sometimes NSNumber and sometimes int
- Method signatures had mismatches between declaration and implementation

### Solution
Standardized types across the implementation:
- Used consistent socket ID types (int instead of NSNumber)
- Ensured method signatures match between C++ and Objective-C implementations
- Fixed parameter types in method declarations

## Socket Management

### Problem
Socket lifecycle management had issues with reference counting and method signatures:
- The bind method had incorrect parameter types
- Socket objects could be prematurely deallocated

### Solution
- Fixed method signatures to match the JavaScript interface
- Improved memory management with proper strong/weak reference handling
- Used proper dispatch queues for async operations

## Forward Declarations

### Problem
Missing forward declarations for C++ classes causing compiler errors

### Solution
Added proper forward declarations at the top of header files:

```objc
// Forward declarations
@class UDPSocket;
namespace facebook { namespace react { class UDPModuleTurbo; } }
```

These fixes collectively resolved the compatibility issues in the UDPModule TurboModule implementation, allowing it to work correctly with the React Native New Architecture. 