# Lama Plugin Architecture

This document outlines the plugin architecture used in the Lama app for configuring native modules and managing build processes.

## Plugin Organization

All Expo Config Plugins should be placed in the `plugins/` directory with a descriptive name starting with `with`, following the Expo Config Plugin naming convention:

- `withUDPModule.js` - Configures the UDP networking module 
- `withLlamaRn.js` - Sets up the Llama RN LLM module
- `withModuleCompat.js` - Fixes C++ header conflicts in iOS builds
- `withLlamaFix.js` - Resolves TurboModule header issues
- etc.

## Plugin Index

The `plugins/index.js` file serves as a central export point for all plugins, allowing them to be imported consistently throughout the app:

```js
// Import from the central plugins index
const { withUDPModule, withLlamaRn } = require('./plugins');
```

## Applying Plugins

Plugins can be applied in two ways:

1. **Direct application** in `app.config.js`:
   ```js
   const plugins = require('./plugins');
   
   module.exports = ({ config }) => {
     config = plugins.withUDPModule(config);
     return config;
   };
   ```

2. **As entries in the plugins array** in `app.config.js` or `app.json`:
   ```js
   module.exports = ({ config }) => {
     config.plugins = [
       './plugins/withUDPModule',
       // other plugins...
     ];
     return config;
   };
   ```

## C++ Compatibility Fixes

The `withModuleCompat.js` plugin provides a solution for fixing C++ namespace conflicts in iOS builds. It works by:

1. Creating a compatibility header that properly defines namespace references
2. Adding this header as a prefix for problematic targets
3. Setting the right preprocessor flags for modern C++ compatibility

This resolves issues with JSI and standard library headers that cause build errors.

## Adding New Plugins

When creating a new plugin:

1. Create a new file in the `plugins/` directory with descriptive name
2. Export a function that accepts and modifies the Expo config object
3. Add the plugin to `plugins/index.js`
4. Apply the plugin in `app.config.js` or reference it in the plugins array

## Common Plugin Patterns

- Use `withDangerousMod` for file system modifications
- Use `withPodfile` for CocoaPods configuration
- Use `withXcodeProject` for Xcode project modifications
- Use `withInfoPlist` for Info.plist changes

## Build Process Integration

Plugins are executed during the Expo prebuild process. You can trigger a full rebuild with:

```bash
npx expo prebuild --clean
```

When debugging plugin issues, check:
- The build logs during prebuild
- The generated native project files in `ios/` and `android/`
- Any error messages during the build process 