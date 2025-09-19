# Lama App Plugins

This directory contains the Expo Config Plugins used to enhance and fix various aspects of the Lama application build process.

## Plugin Architecture

All plugins are organized in this directory with a central `index.js` export. See [PLUGIN_ARCHITECTURE.md](./PLUGIN_ARCHITECTURE.md) for more details on how the plugin system is organized.

## Key Plugins

### Core Platform Plugins

- **withModuleCompat.js** - Fixes C++ header conflicts in iOS builds by providing proper namespace qualifications
- **withLlamaFix.js** - Resolves common issues with the llama-rn package
- **withUDPModule.js** - Configures the UDP networking module
- **withUDPDirectModule.js** - Configures the UDPDirect module for direct buffer access
- **withAppDelegateModification.js** - Updates the AppDelegate for proper module registration

### Build Process Plugins

- **withPodfileFixForFrameworkIssues.js** - Resolves iOS framework conflicts
- **withUdpHeaderPaths.js** - Ensures proper header paths for UDP modules
- **withLlamaRnFabricBuildSettings.js** - Configures build settings for React Native Fabric

## C++ Compatibility Fix

The `withModuleCompat.js` plugin addresses the following issues:

1. C++ namespace conflicts between React Native and standard library headers
2. JSI header inclusion problems
3. Incomplete type errors for JSI and std library components
4. Namespace qualification issues for std::chrono, hash, etc.

It creates a compatibility header at `ios/ModuleHeaders/CppCompat.h` that:
- Properly qualifies std namespace symbols
- Sets the right preprocessor flags for C++17 compatibility
- Ensures JSI exports are properly defined

## Usage

All plugins can be imported from the central `index.js`:

```javascript
const plugins = require('./plugins');

// Apply the C++ compatibility fix
config = plugins.withModuleCompat(config);
```

## Plugin Application Order

The correct order for applying plugins is:

1. **withModuleCompat** - Apply C++ compatibility fixes first
2. **withUDPModule** / **withUDPDirectModule** - Set up networking modules 
3. **withLlamaRn** / **withLlamaFix** - Configure LLM modules
4. **withAppDelegateModification** - Update native app delegate
5. Other specialized plugins

This order ensures dependencies are properly handled and each plugin has the necessary context from previous steps.

## Available Plugins

### withLlamaFix.js

A plugin that resolves common build issues with the llama.rn package:
- Fixes duplicate header file errors during iOS builds
- Adds necessary React header search paths
- Ensures compatibility across local development and EAS builds

See [llama.rn.md](./llama.rn.md) for detailed documentation about llama.rn integration.

### withBarcodeScannerFix.js

A plugin that resolves header issues with the expo-barcode-scanner module:
- Fixes the missing `ExpoModulesCore/EXBarcodeScannerInterface.h` error
- Adds necessary header search paths to locate ExpoModulesCore headers
- Works with both expo-barcode-scanner and EXBarCodeScanner target names

See [barcode-scanner.md](./barcode-scanner.md) for detailed documentation about expo-barcode-scanner integration.

## Using Plugins

Plugins in this directory are automatically applied during the build process as they are included in the `plugins` array in `app.json`.

## Creating New Plugins

To create a new plugin:

1. Create a new JavaScript file in this directory
2. Export a function that accepts and returns a modified Expo config object
3. Add the plugin to the `plugins` array in `app.json`

Example:

```javascript
// plugins/withMyFix.js
const { withDangerousMod } = require('@expo/config-plugins');

const withMyFix = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      // Modify the iOS project here
      return config;
    },
  ]);
};

module.exports = withMyFix;
```

Then in app.json:

```json
{
  "expo": {
    "plugins": [
      // ... other plugins
      "./plugins/withMyFix.js"
    ]
  }
}
``` 