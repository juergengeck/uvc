# Native Module Build Guide

## Prerequisites

### Development Environment
```bash
# Required versions
node -v  # >= 18.0.0
ruby -v  # >= 2.7.0
pod --version  # >= 1.11.3
xcodebuild -version  # >= 15.0.0

# Global dependencies
npm install -g expo-cli
npm install -g pod-install
npm install -g typescript
```

### Xcode Configuration
1. Open Xcode → Preferences → Locations
   - Set Command Line Tools version
2. Install iOS 15.1+ Simulator
3. Enable Developer Mode on device

### System Dependencies
```bash
# Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install dependencies
brew install cmake
brew install ninja
brew install libomp  # Required for MLX
```

## Project Setup

### 1. Module Structure
```bash
modules/expo-fullmoon/
├── ios/
│   ├── ExpoFullmoon.podspec
│   ├── ExpoFullmoonModule.h
│   ├── ExpoFullmoonModule.mm
│   ├── ExpoFullmoonView.h
│   ├── ExpoFullmoonView.mm
│   └── MLXWrapper/
│       ├── MLXModelWrapper.h
│       └── MLXModelWrapper.mm
├── src/
│   ├── index.ts
│   ├── types.ts
│   └── ExpoFullmoonView.tsx
├── package.json
├── tsconfig.json
└── babel.config.js
```

### 2. Package Configuration
```json
// package.json
{
  "name": "expo-fullmoon",
  "version": "1.0.0",
  "description": "Local LLM integration using MLX",
  "main": "build/index.js",
  "types": "build/index.d.ts",
  "scripts": {
    "build": "expo-module build",
    "clean": "expo-module clean",
    "lint": "expo-module lint",
    "test": "expo-module test",
    "prepare": "expo-module prepare",
    "prepublishOnly": "expo-module prepublishOnly",
    "expo-module": "expo-module"
  },
  "keywords": [
    "react-native",
    "expo",
    "expo-fullmoon",
    "ExpoFullmoon"
  ],
  "peerDependencies": {
    "expo": "*",
    "react": "*",
    "react-native": "*"
  },
  "devDependencies": {
    "expo-module-scripts": "^3.0.0",
    "expo-modules-core": "^1.5.0"
  }
}
```

### 3. TypeScript Configuration
```json
// tsconfig.json
{
  "extends": "expo-module-scripts/tsconfig.base",
  "compilerOptions": {
    "outDir": "./build",
    "rootDir": "./src",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["./src"],
  "exclude": ["**/__tests__/*", "**/__mocks__/*"]
}
```

## Native Implementation

### 1. Podspec Configuration
```ruby
# ios/ExpoFullmoon.podspec
require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ExpoFullmoon'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platform       = :ios, '15.1'
  s.swift_version  = '5.0'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'MLX', '~> 0.2.0'
  s.dependency 'EXFileSystem'
  s.dependency 'EXSecureStore'

  # Source files
  s.source_files = 'ios/**/*.{h,m,mm,swift}'

  # Framework Search Paths
  s.pod_target_xcconfig = {
    'HEADER_SEARCH_PATHS' => [
      '"$(PODS_ROOT)/Headers/Public/MLX"',
      '"$(PODS_ROOT)/Headers/Public/ExpoModulesCore"'
    ],
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++20',
    'CLANG_CXX_LIBRARY' => 'libc++',
    'OTHER_CPLUSPLUSFLAGS' => '-fobjc-arc -fmodules -fcxx-modules',
    'ENABLE_BITCODE' => 'NO',
    'IPHONEOS_DEPLOYMENT_TARGET' => '15.1',
    'DEFINES_MODULE' => 'YES'
  }
end
```

### 2. Module Header
```objc
// ios/ExpoFullmoonModule.h
#import <ExpoModulesCore/ExpoModulesCore.h>
#import <MLX/MLX.h>

@interface ExpoFullmoonModule : EXModule

@property (nonatomic, strong) MLXModel *model;
@property (nonatomic, strong) MLXTokenizer *tokenizer;
@property (nonatomic, strong) dispatch_queue_t inferenceQueue;
@property (nonatomic, assign) BOOL isGenerating;

- (void)initialize:(NSDictionary *)config
           resolve:(EXPromiseResolveBlock)resolve
            reject:(EXPromiseRejectBlock)reject;

- (void)generate:(NSDictionary *)params
         resolve:(EXPromiseResolveBlock)resolve
          reject:(EXPromiseRejectBlock)reject;

- (void)stopGeneration;
- (void)cleanup;

@end
```

### 3. Module Implementation
```objc
// ios/ExpoFullmoonModule.mm
#import "ExpoFullmoonModule.h"
#import <MLX/MLX.h>
#import <Metal/Metal.h>

@implementation ExpoFullmoonModule

EX_EXPORT_MODULE(ExpoFullmoon);

- (void)initialize:(NSDictionary *)config
           resolve:(EXPromiseResolveBlock)resolve
            reject:(EXPromiseRejectBlock)reject {
  NSString *modelPath = config[@"modelPath"];
  NSNumber *nGpuLayers = config[@"nGpuLayers"];
  
  // Initialize on background queue
  dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
    NSError *error = nil;
    
    // Configure Metal if GPU layers > 0
    if ([nGpuLayers intValue] > 0) {
      [self configureMetalDevice];
    }
    
    // Initialize model
    self.model = [[MLXModel alloc] initWithPath:modelPath error:&error];
    if (error) {
      reject(@"init_error", @"Failed to initialize model", error);
      return;
    }
    
    // Initialize tokenizer
    self.tokenizer = [[MLXTokenizer alloc] initWithPath:modelPath error:&error];
    if (error) {
      reject(@"init_error", @"Failed to initialize tokenizer", error);
      return;
    }
    
    // Create inference queue
    self.inferenceQueue = dispatch_queue_create("ai.inference", 
                           DISPATCH_QUEUE_SERIAL);
    
    resolve(nil);
  });
}

// ... Additional implementation methods
```

### 4. MLX Wrapper
```objc
// ios/MLXWrapper/MLXModelWrapper.h
#import <Foundation/Foundation.h>
#import <MLX/MLX.h>

@interface MLXModelWrapper : NSObject

@property (nonatomic, strong) MLXModel *model;
@property (nonatomic, strong) MLXTokenizer *tokenizer;

- (instancetype)initWithModel:(MLXModel *)model 
                   tokenizer:(MLXTokenizer *)tokenizer;

- (NSArray<NSNumber *> *)tokenize:(NSString *)text;
- (NSString *)detokenize:(NSArray<NSNumber *> *)tokens;
- (NSArray<NSNumber *> *)generate:(NSArray<NSNumber *> *)tokens
                         options:(NSDictionary *)options;

@end
```

## Build Process

### 1. Development Build
```bash
# Clean previous builds
rm -rf ios/build
rm -rf ios/Pods
rm -rf node_modules

# Install dependencies
npm install

# Generate native code
npm run prebuild

# Install pods
cd ios
pod install
cd ..

# Build TypeScript
npm run build

# Run on simulator
npm run ios
```

### 2. Production Build
```bash
# Clean and install
npm run clean
npm install

# Build native module
npm run prepare
npm run build

# Build iOS
cd ios
pod install
xcodebuild -workspace ExpoFullmoon.xcworkspace \
           -scheme ExpoFullmoon \
           -configuration Release \
           -sdk iphoneos \
           build
cd ..
```

### 3. Troubleshooting Steps
```bash
# Clear Metro bundler cache
npm start -- --reset-cache

# Clear Pod cache
cd ios
pod cache clean --all
rm -rf ~/Library/Caches/CocoaPods
pod deintegrate
pod setup
pod install
cd ..

# Clear Xcode build cache
rm -rf ~/Library/Developer/Xcode/DerivedData

# Verify Metal support
xcrun metal --version
```

## Integration Tests

### 1. Test Setup
```typescript
// jest/setup.js
import { NativeModules } from 'react-native';

NativeModules.ExpoFullmoon = {
  initialize: jest.fn(),
  generate: jest.fn(),
  stopGeneration: jest.fn(),
  cleanup: jest.fn(),
};
```

### 2. Module Tests
```typescript
// __tests__/ExpoFullmoon-test.ts
import ExpoFullmoon from '../src';

describe('ExpoFullmoon', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes correctly', async () => {
    const module = new ExpoFullmoon();
    await module.initialize({
      modelPath: '/path/to/model',
      nGpuLayers: 1,
    });
    expect(NativeModules.ExpoFullmoon.initialize).toHaveBeenCalled();
  });
});
```

## Error Handling

### 1. Error Types
```typescript
// src/types.ts
export enum FullmoonErrorCode {
  INITIALIZATION_FAILED = 'initialization_failed',
  MODEL_LOAD_FAILED = 'model_load_failed',
  GENERATION_FAILED = 'generation_failed',
  INVALID_INPUT = 'invalid_input',
  OUT_OF_MEMORY = 'out_of_memory',
}

export class FullmoonError extends Error {
  code: FullmoonErrorCode;
  details?: any;

  constructor(code: FullmoonErrorCode, message: string, details?: any) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
```

### 2. Native Error Handling
```objc
// ios/ExpoFullmoonModule.mm
- (void)handleError:(NSError *)error
           reject:(EXPromiseRejectBlock)reject {
  NSString *code = @"unknown_error";
  NSString *message = error.localizedDescription;
  
  if ([error.domain isEqualToString:MLXErrorDomain]) {
    switch (error.code) {
      case MLXErrorCodeModelLoad:
        code = @"model_load_failed";
        break;
      case MLXErrorCodeOutOfMemory:
        code = @"out_of_memory";
        break;
      // ... other cases
    }
  }
  
  reject(code, message, error);
}
```

## Performance Optimization

### 1. Memory Management
```objc
// ios/ExpoFullmoonModule.mm
- (void)handleMemoryWarning {
  if (self.model) {
    [self.model purgeCache];
  }
  
  // Release non-essential resources
  @autoreleasepool {
    // Clean up temporary buffers
  }
}

- (void)dealloc {
  [self cleanup];
}
```

### 2. Metal Configuration
```objc
- (void)configureMetalDevice {
  id<MTLDevice> device = MTLCreateSystemDefaultDevice();
  if (!device) {
    NSLog(@"Metal is not supported on this device");
    return;
  }
  
  // Configure shared event handler
  self.metalEventHandler = [MTLSharedEventListener new];
  
  // Set up command queue
  self.commandQueue = [device newCommandQueue];
}
```

## Distribution

### 1. Package Release
```json
// package.json
{
  "files": [
    "build",
    "ios",
    "android",
    "!**/__tests__",
    "!**/__fixtures__",
    "!**/__mocks__"
  ],
  "publishConfig": {
    "access": "public"
  }
}
```

### 2. Version Management
```bash
# Update version
npm version patch|minor|major

# Build and publish
npm run build
npm publish
```

## Debugging

### 1. Debug Build Configuration
```ruby
# ios/ExpoFullmoon.podspec
s.pod_target_xcconfig = {
  'GCC_PREPROCESSOR_DEFINITIONS' => ['DEBUG=1'],
  'CLANG_ENABLE_MODULES' => 'YES',
  'DEFINES_MODULE' => 'YES',
  'MTL_ENABLE_DEBUG_INFO' => 'INCLUDE_SOURCE'
}
```

### 2. Logging Setup
```objc
// ios/ExpoFullmoonModule.mm
#ifdef DEBUG
#define FullmoonLog(fmt, ...) NSLog((@"[Fullmoon] " fmt), ##__VA_ARGS__)
#else
#define FullmoonLog(...)
#endif
```

## Format Compatibility

### 1. llama.rn Adapter
```typescript
// src/adapters/LlamaAdapter.ts
export class LlamaAdapter {
  private context: ExpoFullmoon;

  constructor(context: ExpoFullmoon) {
    this.context = context;
  }

  async completion(params: LlamaCompletionParams): Promise<LlamaCompletionResult> {
    const convertedParams = this.convertParams(params);
    const result = await this.context.generate(convertedParams);
    return this.convertResult(result);
  }

  private convertParams(params: LlamaCompletionParams): FullmoonParams {
    // Convert between formats
    return {
      // ... conversion logic
    };
  }
}
```

## Maintenance

### 1. Version Updates
```bash
# Update MLX
cd ios
pod update MLX
cd ..

# Update Expo
expo upgrade

# Update dependencies
npm update
```

### 2. Patch Management
```bash
# Create patch
npx patch-package expo-fullmoon

# Apply patches
npx patch-package
``` 