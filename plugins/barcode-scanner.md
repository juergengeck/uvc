# expo-barcode-scanner Integration Guide

## Overview

expo-barcode-scanner is an Expo module that provides a React component that detects barcodes, QR codes, and other formats. It's commonly used for scanning functionality in applications, including QR code scanning for connection links.

## Common Issues

When integrating expo-barcode-scanner into React Native/Expo projects, you might encounter the following build-time issue:

### Missing ExpoModulesCore Header Files

```
'ExpoModulesCore/EXBarcodeScannerInterface.h' file not found
```

This error occurs because the build system cannot locate the required header files from the ExpoModulesCore dependency, which the barcode scanner module depends on.

## Fix Options

### Option 1: Direct Fix Script (Recommended)

For an immediate solution, you can run:

```bash
npm run fix-barcode-scanner
```

This script directly creates the missing header file in all relevant locations:
- `ios/Pods/Headers/Public/ExpoModulesCore/EXBarcodeScannerInterface.h`
- `ios/Pods/Headers/Private/ExpoModulesCore/EXBarcodeScannerInterface.h`
- `node_modules/expo-modules-core/ios/ExpoModulesCore/EXBarcodeScannerInterface.h`

After running this script, you can continue with:
```bash
npm run pod-install
npx expo run:ios
```

### Option 2: Config Plugin Approach

The `withBarcodeScannerFix.js` Expo config plugin also addresses this issue by:

1. **Creating the Missing Header File**: The plugin creates a minimal implementation of the missing header file during the build process.

2. **Adding ExpoModulesCore Header Search Paths**: The plugin adds the necessary header search paths to the expo-barcode-scanner target:
   - `$(PODS_ROOT)/Headers/Public/ExpoModulesCore`
   - `$(PODS_ROOT)/../../node_modules/expo-modules-core/ios/ExpoModulesCore`
   - `$(PODS_ROOT)/Headers/Private/ExpoModulesCore`

3. **Supporting Both Target Names**: The plugin targets both possible native module names:
   - `expo-barcode-scanner`
   - `EXBarCodeScanner`

## Integration in Your Project

### Plugin Installation

The plugin is automatically applied during the prebuild process. No manual installation is needed beyond including it in your app.json:

```json
{
  "expo": {
    "plugins": [
      // ... other plugins
      "./plugins/withBarcodeScannerFix.js"
    ]
  }
}
```

### EAS Integration

For EAS builds, you have two options:

1. **Use the Config Plugin**: The plugin works automatically with EAS builds.

2. **Create an EAS Build Hook**: Add a prebuild hook in your `eas.json` that runs the fix script:

```json
{
  "build": {
    "production": {
      "prebuildCommand": "npm run setup-modules && npm run fix-barcode-scanner"
    }
  }
}
```

## How the Fix Works

### The Direct Fix Script

The script (`scripts/fix-barcode-scanner.js`):
1. Creates a simple header file with an empty `EXBarcodeScannerInterface` protocol
2. Places this header in multiple locations where it might be searched for
3. Works immediately on an existing build, without requiring a full rebuild

### The Config Plugin

The plugin hooks into the Expo prebuild process and:
1. Creates the same header file during the iOS build preparation
2. Also modifies the Podfile to add header search paths
3. Is applied automatically every time you prebuild your project

## Troubleshooting

If you continue to encounter issues despite the fixes:

### Build Issues

1. **Fix not applying**: For the direct fix, check if the directories exist. For the plugin, ensure it's correctly listed in app.json.

2. **Header paths incorrect**: Some Expo versions might use different paths. Use `find ios/Pods -name "*.h" | grep ExpoModulesCore` to find the actual location.

3. **Version mismatch**: Make sure you're using compatible versions of expo-barcode-scanner and expo-modules-core.

## Advanced Configuration

To customize either approach:

1. **Additional header locations**: If you discover other places where the header should be placed, add them to the script or plugin.

2. **Modify the header content**: If a simple empty protocol isn't sufficient, you can expand the header definition in both the script and plugin.

## Versioning Information

- **expo-barcode-scanner version**: Compatible with all recent versions
- **expo-modules-core compatibility**: Tested with recent Expo SDK versions
- **Expo SDK compatibility**: Tested with Expo SDK 52+

## Additional Resources

- [expo-barcode-scanner Documentation](https://docs.expo.dev/versions/latest/sdk/bar-code-scanner/)
- [Expo Modules Core GitHub Repository](https://github.com/expo/expo/tree/main/packages/expo-modules-core)
- [Expo Config Plugins Guide](https://docs.expo.dev/guides/config-plugins/) 