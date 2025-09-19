# Installation Guide

## Making the UDP Module Installable

The UDP module has been packaged as `@lama/react-native-udp-direct` and can be installed in multiple ways:

### Option 1: Local Development (Recommended for testing)

From your main LAMA project:

```bash
# Link the local package
npm link ./packages/react-native-udp-direct

# Or use npm/yarn workspaces
npm install @lama/react-native-udp-direct@file:./packages/react-native-udp-direct
```

### Option 2: Publish to NPM Registry

1. First, build the package:
```bash
cd packages/react-native-udp-direct
npm install
npm run build
```

2. Login to npm:
```bash
npm login
```

3. Publish the package:
```bash
npm publish --access public
```

### Option 3: Install from Git Repository

```bash
npm install git+https://github.com/lama-app/react-native-udp-direct.git
```

### Option 4: Private Registry

If you have a private npm registry:

```bash
# Configure npm to use your registry
npm config set @lama:registry https://your-registry-url

# Install the package
npm install @lama/react-native-udp-direct
```

## Integration with Existing Project

After installing the package, update your existing code:

1. Replace imports:
```typescript
// Old:
import { NativeModules } from 'react-native';
const { UDPDirectModule } = NativeModules;

// New:
import UDPDirectModule from '@lama/react-native-udp-direct';
```

2. For iOS, run:
```bash
cd ios && pod install
```

3. Clean and rebuild your project:
```bash
# iOS
npm run build:ios

# Android (when supported)
npm run build:android
```

## Package Structure

```
@lama/react-native-udp-direct/
├── src/                    # TypeScript source files
│   ├── index.ts           # Main entry point
│   └── NativeUdpModule.ts # Type definitions
├── ios/                   # iOS native implementation
│   ├── *.h               # Header files
│   └── *.mm              # Implementation files
├── lib/                   # Built JavaScript (generated)
├── package.json          # Package metadata
├── react-native-udp-direct.podspec  # iOS configuration
└── README.md             # Documentation
```

## Troubleshooting

### Module not found

If you get "Module not found" errors:

1. Clear Metro cache:
```bash
npx react-native start --reset-cache
```

2. Clean build folders:
```bash
cd ios && rm -rf build && pod install
cd android && ./gradlew clean
```

### Linking issues on iOS

Make sure your Podfile includes:
```ruby
pod 'react-native-udp-direct', :path => '../node_modules/@lama/react-native-udp-direct'
```

### TypeScript errors

Ensure your `tsconfig.json` includes:
```json
{
  "compilerOptions": {
    "types": ["@lama/react-native-udp-direct"]
  }
}
```