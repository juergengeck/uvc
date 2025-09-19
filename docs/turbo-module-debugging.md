# TurboModule Debugging Guide

This document provides troubleshooting steps for diagnosing and fixing TurboModule loading issues in the lama.one app.

## Common Issues

### 1. TurboModule Not Found

**Symptoms:**
- Error: "TurboModule not found" or "Module X is not available"
- Module functions are undefined
- iOS builds but native functionality doesn't work

**Fixes:**
- Ensure the module is properly registered in the TurboModuleRegistry
- Check for proper imports in JavaScript code
- Verify native module implementation exists and compiles

### 2. Header File Issues

**Symptoms:**
- Build errors about missing header files
- Duplicate header errors
- "X.h file not found"

**Fixes:**
- Apply withLlamaFix.js and withUdpHeaderPaths.js plugins
- Run the fix-turbo-modules.sh script
- Check header search paths in Xcode

### 3. Implementation Issues

**Symptoms:**
- Missing methods at runtime
- Crash when calling module methods
- Native module available but methods throw errors

**Fixes:**
- Ensure method signatures match between JS and native code
- Check for proper method exports in the native module
- Verify method implementations are correct

### 4. C++ Compilation Errors with Xcode 16+

**Symptoms:**
- Errors like `no matching function for call to '__construct_at'`
- Errors related to `allocator_traits`
- Build issues mentioning deprecated C++17 features

**Fixes:**
- Apply withLlamaFix.js plugin which adds necessary C++17 compatibility flags
- Add C++17 compatibility preprocessor macros to source files
- Set `CLANG_CXX_LANGUAGE_STANDARD = c++17` in build settings

## Debugging Steps

### 1. Check Module Availability

Add debugging code to check if modules are available:

```javascript
// For llama.rn
import { NativeModules } from 'react-native';
console.log('RNLlama available:', !!NativeModules.RNLlama);
console.log('RNLlama methods:', Object.keys(NativeModules.RNLlama || {}));

// For UDP modules
console.log('UDPModule available:', !!NativeModules.UDPModule);
console.log('UDPDirectModule available:', !!NativeModules.UDPDirectModule);
```

### 2. Inspect Native Registration

In AppDelegate.mm, ensure TurboModules are properly registered:

```objc
// Check if this block exists in AppDelegate.mm
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const std::string &)name
                                                      jsInvoker:(std::shared_ptr<facebook::react::CallInvoker>)jsInvoker
{
  // Custom TurboModules should be registered here
  if (name == "RNLlama") {
    return std::make_shared<facebook::react::NativeRNLlamaSpecJSI>(jsInvoker);
  }
  if (name == "UDPModule") {
    return UDPModuleModuleProvider(name, jsInvoker);
  }
  if (name == "UDPDirectModule") {
    return UDPDirectModuleModuleProvider(name, jsInvoker);
  }
  return nullptr;
}
```

### 3. Check Module Loading Order

The order of module loading can be important. Debug the initialization sequence:

```javascript
// Add near app startup
import { NativeModules, TurboModuleRegistry } from 'react-native';
console.log('[ModuleLoader] Pre-load check:', {
  UDPModuleNative: !!NativeModules.UDPModule,
  UDPDirectModuleNative: !!NativeModules.UDPDirectModule,
  RNLlamaNative: !!NativeModules.RNLlama,
  UDPModuleTurbo: !!TurboModuleRegistry.get('UDPModule'),
  UDPDirectModuleTurbo: !!TurboModuleRegistry.get('UDPDirectModule'),
  RNLlamaTurbo: !!TurboModuleRegistry.get('RNLlama')
});
```

### 4. Diagnosing C++ Compilation Errors

If you're facing C++ compilation errors with newer Xcode versions:

```bash
# Check the exact error message
npx expo run:ios --verbose

# Look for errors like "no matching function for call to '__construct_at'"
# or other allocator_traits related errors
```

1. Add C++17 compatibility macros to the source file:

```cpp
// Add at the beginning of your .cpp/.mm file
#ifndef _LIBCPP_ENABLE_CXX17_REMOVED_FEATURES
#define _LIBCPP_ENABLE_CXX17_REMOVED_FEATURES 1
#endif

#ifndef _LIBCPP_HAS_NO_INCOMPLETE_FORMAT
#define _LIBCPP_HAS_NO_INCOMPLETE_FORMAT
#endif

#ifndef _LIBCPP_AVAILABILITY_CUSTOM_VECTOR_BOOL_SPECIALIZATION
#define _LIBCPP_AVAILABILITY_CUSTOM_VECTOR_BOOL_SPECIALIZATION
#endif
```

2. Alternatively, use the provided plugins that automatically add these flags:

```bash
# Make sure these plugins are in your app.json configuration
./plugins/withLlamaFix.js
./plugins/withUdpHeaderPaths.js
```

## Fix Script Usage

The provided `fix-turbo-modules.sh` script will:

1. Clean build artifacts and Pod installation
2. Verify plugin configurations in app.json
3. Run Expo prebuild with a clean flag
4. Install dependencies with `pod install`
5. Build the app for the simulator

Usage:
```bash
./scripts/fix-turbo-modules.sh
```

## Manual Fixes

If the automated fixes don't work, try these manual steps:

1. Open the Xcode project:
   ```bash
   open ios/lama.xcworkspace
   ```

2. Select the "Pods" project and find the problematic module targets.

3. For each target:
   - Select the target
   - Go to "Build Settings"
   - Search for "Header Search Paths"
   - Add missing React paths
   - Search for "Preprocessor Macros"
   - Add `RCT_NEW_ARCH_ENABLED=1` if needed
   - Search for "C++ Language Standard"
   - Set to "C++17 [-std=c++17]"
   - Search for "Other C++ Flags"
   - Add `-D_LIBCPP_ENABLE_CXX17_REMOVED_FEATURES=1 -D_LIBCPP_HAS_NO_INCOMPLETE_FORMAT -D_LIBCPP_AVAILABILITY_CUSTOM_VECTOR_BOOL_SPECIALIZATION`

4. Clean and rebuild the project from Xcode.

## Recent Changes

After React Native/Expo upgrades, TurboModules may need adjustments:

1. The TurboModule registry API might change
2. Header file locations might be different
3. The bridging mechanism between JS and native code might be updated
4. Xcode 16+ has stricter C++ standard compliance and may require compatibility flags

Always check the React Native upgrade guide for specific changes related to native modules.

## Additional Resources

- [React Native New Architecture Documentation](https://reactnative.dev/docs/the-new-architecture/landing-page)
- [TurboModule System Documentation](https://reactnative.dev/docs/the-new-architecture/pillars-turbomodules)
- [Expo Config Plugins Documentation](https://docs.expo.dev/guides/config-plugins/)

# Debugging TurboModule Implementation Issues

This guide provides strategies for debugging common issues when implementing TurboModules in React Native with Expo.

## Common Error Patterns and Solutions

### "Header file not found" Errors

#### Signs:
- Build errors mentioning missing headers like `'functional'` or `ReactCommon/TurboModule.h`
- Compilation fails during pod installation or build phase

#### Debugging Steps:
1. **Locate actual header paths**:
   ```bash
   find ios/Pods -name "RCTTurboModule.h"
   find ios/Pods -name "TurboModule.h"
   ```

2. **Check your conditional includes**:
   Ensure you're using proper fallback paths:
   ```objc
   #if __has_include(<React-NativeModulesApple/ReactCommon/RCTTurboModule.h>)
   #import <React-NativeModulesApple/ReactCommon/RCTTurboModule.h>
   #else
   #import <ReactCommon/RCTTurboModule.h> // Fallback path
   #endif
   ```

3. **Verify podspec dependencies**:
   Make sure your podspec includes all necessary dependencies:
   ```ruby
   s.dependency "React-Core"
   s.dependency "ReactCommon"
   s.dependency "React-jsi"
   s.dependency "React-NativeModulesApple"
   ```

4. **Check C++ standard library issues**:
   For C++ standard headers like `<functional>`, ensure they're included properly in implementation files, not just headers.

### C++ Compilation Errors

#### Signs:
- Errors about missing symbols in C++ code
- Deprecated feature warnings
- Template resolution failures

#### Debugging Steps:
1. **Add C++17 compatibility flags**:
   ```ruby
   s.pod_target_xcconfig = {
     'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
     'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) _LIBCPP_ENABLE_CXX17_REMOVED_FEATURES=1'
   }
   ```

2. **Add preprocessor directives** at the top of .mm files:
   ```cpp
   #ifndef _LIBCPP_ENABLE_CXX17_REMOVED_FEATURES
   #define _LIBCPP_ENABLE_CXX17_REMOVED_FEATURES 1
   #endif
   
   #pragma clang diagnostic push
   #pragma clang diagnostic ignored "-Wdeprecated-declarations"
   // Implementation code
   #pragma clang diagnostic pop
   ```

3. **Check Folly version compatibility**:
   Use a recent Folly version in podspec:
   ```ruby
   folly_version = '2024.11.18.00'
   ```

### JavaScript/Native Bridge Errors

#### Signs:
- Native module methods not being called
- "Module not found" errors in JavaScript
- Promise rejections with no message

#### Debugging Steps:
1. **Log module registration**:
   Add logs in your module registry:
   ```objc
   + (void)load {
     NSLog(@"[MyModule] Registering module with TurboModuleRegistry");
     [[RCTTurboModuleRegistry sharedInstance] registerModule:self];
   }
   
   + (NSArray<NSString *> *)moduleNames {
     NSLog(@"[MyModule] Returning module names");
     return @[@"MyModule"];
   }
   ```

2. **Verify host function registration**:
   Check that all methods have corresponding host functions and are properly registered:
   ```cpp
   MyModuleTurbo(const ObjCTurboModule::InitParams &params) {
     // Log registration
     NSLog(@"[MyModule] Creating TurboModule C++ instance");
     
     // Register methods
     methodMap_["someMethod"] = MethodMetadata{3, __hostFunction_MyModuleSpec_someMethod};
     // ... other methods
   }
   ```

3. **Use JSI debugging**:
   ```cpp
   jsi::Value someMethod(jsi::Runtime &rt, jsi::String strArg) override {
     NSLog(@"[MyModule] C++ someMethod called with: %s", strArg.utf8(rt).c_str());
     // ... implementation
   }
   ```

### Memory Management Issues

#### Signs:
- Crashes with "EXC_BAD_ACCESS"
- Objects being deallocated unexpectedly
- Promise callbacks not being called

#### Debugging Steps:
1. **Check weak/strong references**:
   Use proper reference counting with blocks:
   ```objc
   __weak MyModule *weakSelf = self;
   [self doSomethingAsync:^(id result) {
     __strong MyModule *strongSelf = weakSelf;
     if (!strongSelf) return;
     // Use strongSelf safely
   }];
   ```

2. **Log object lifecycle**:
   ```objc
   - (instancetype)init {
     NSLog(@"[MyModule] Initializing");
     if (self = [super init]) {
       // Init code
     }
     return self;
   }
   
   - (void)dealloc {
     NSLog(@"[MyModule] Deallocating");
   }
   ```

3. **Check JSI Value lifetime**:
   JSI Values must be properly converted and not held beyond function calls.

### Podspec and Build Configuration Issues

#### Signs:
- Linking errors during build
- Missing symbols at runtime
- Inconsistent behavior between debug/release builds

#### Debugging Steps:
1. **Verify podspec configuration**:
   Make sure your podspec has correct settings:
   ```ruby
   s.pod_target_xcconfig = {
     'DEFINES_MODULE' => 'YES',
     'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17'
   }
   ```

2. **Check package.json path**:
   Ensure your podspec correctly references the project's package.json:
   ```ruby
   package = JSON.parse(File.read(File.join(__dir__, '../../package.json')))
   ```

3. **Clean build environment**:
   ```bash
   rm -rf ios/Pods ios/Podfile.lock
   pod cache clean --all
   npx expo prebuild --clean
   ```

## Advanced Debugging Techniques

### Using LLDB for Native Debugging

1. Add breakpoints in Xcode for C++ and Objective-C code
2. Inspect variables and memory at runtime
3. Use `po` command to print objects
4. Step through JSI method calls to trace execution

### Debugging JSI Integration

1. **Log JSI Value types and content**:
   ```cpp
   void logJSIValue(jsi::Runtime& rt, const jsi::Value& value, const char* name) {
     NSLog(@"[JSI] %s type: %d", name, value.kind());
     if (value.isString()) {
       NSLog(@"[JSI] %s value: %s", name, value.getString(rt).utf8(rt).c_str());
     } else if (value.isNumber()) {
       NSLog(@"[JSI] %s value: %f", name, value.getNumber());
     }
   }
   ```

2. **Add temporary debug methods**:
   Add a simple echo method to test JSI is working correctly:
   ```cpp
   jsi::Value echo(jsi::Runtime& rt, jsi::String input) override {
     NSLog(@"[Echo] Received: %s", input.utf8(rt).c_str());
     return jsi::String::createFromUtf8(rt, input.utf8(rt));
   }
   ```

## Debugging React Native Interoperability

If your module needs to work with both old and new architectures:

1. **Check TurboModule detection**:
   ```objc
   + (BOOL)requiresMainQueueSetup {
     // Log which architecture is in use
     NSLog(@"[MyModule] TurboModule available: %@", 
           NSClassFromString(@"RCTTurboModule") ? @"YES" : @"NO");
     return NO;
   }
   ```

2. **Test individual method calls**:
   Create simple JavaScript test methods to verify each native method works.

3. **Monitor native module initialization**:
   Log when your module is accessed from JavaScript to ensure proper loading.

By following these debugging strategies, you can identify and fix most issues encountered when implementing TurboModules in React Native with Expo. 