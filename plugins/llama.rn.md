# llama.rn Integration Guide

## Overview

llama.rn is a React Native wrapper for the llama.cpp library, providing inference capabilities for Large Language Models (LLMs) directly on mobile devices. This enables on-device AI features without relying on cloud services, ensuring privacy and offline capability.

## Common Issues

When integrating llama.rn into Expo/React Native projects, several build-time issues commonly occur:

### 1. Duplicate Header Files

```
error: Multiple commands produce '/path/to/llama_rn.framework/Headers/llama.h'
```

This error occurs because multiple source files from different architectures try to output to the same header destination during the build process. 

### 2. Missing React Header Files

```
'React/RCTEventEmitter.h' file not found
'React/RCTBridgeModule.h' file not found
```

This happens when the build system cannot find the React Native header files needed by llama.rn.

## The withLlamaFix Plugin

The `withLlamaFix.js` Expo config plugin automatically addresses these issues by:

1. **Fixing Duplicate Headers**: Modifies the Xcode project to prevent duplicate header file commands by:
   - Identifying files with the same name in copy phases
   - Removing duplicates while preserving one copy of each file
   - Ensuring unique output paths for header files

2. **Adding React Header Search Paths**: Adds the necessary header search paths to the llama-rn target:
   - `$(PODS_ROOT)/Headers/Public/React-Core`
   - `$(PODS_ROOT)/Headers/Public/React`
   - `$(PODS_ROOT)/Headers/Public/React-RCTEventEmitter`
   - `$(PODS_ROOT)/Headers/Public/React-cxxreact`
   - `$(PODS_ROOT)/Headers/Public/React-jsi`

3. **Setting Build Flags**: Adds appropriate build flags to prevent header duplication:
   - Sets `COPY_HEADERS_RUN_UNIFDEF` to ensure unique headers

## Integration in Your Project

### 1. Plugin Installation

The plugin is automatically applied during the prebuild process. No manual installation is needed beyond including it in your app.json:

```json
{
  "expo": {
    "plugins": [
      // ... other plugins
      "./plugins/withLlamaFix.js"
    ]
  }
}
```

### 2. EAS Integration

The plugin works seamlessly with EAS builds. For optimal integration:

1. Ensure `setup-modules` runs in your EAS prebuild command:

```json
// eas.json
{
  "build": {
    "production": {
      "prebuildCommand": "npm run setup-modules"
    }
  }
}
```

2. The plugin automatically applies fixes during the build process without additional steps.

## How It Works

The plugin hooks into the Expo prebuild process and:

1. Examines the generated Podfile for iOS
2. Adds a post-install hook that:
   - Locates the llama-rn target in the Pods project
   - Updates header search paths for React headers
   - Modifies build phases to eliminate duplicate header files
   - Sets appropriate build settings to prevent future duplication

This approach ensures that the fixes are applied consistently across all build environments:
- Local development builds
- EAS cloud builds
- Manual Xcode builds

## Troubleshooting

If you encounter issues despite the plugin:

### Build Issues

1. **Plugin not applying**: Ensure the plugin is correctly listed in app.json and that you're running a full prebuild.

2. **Missing React headers**: Some React Native versions may use different header paths. You might need to update the paths in the plugin.

3. **XCode project modification failures**: Try manually opening the Pods project in XCode and examining the llama-rn target's build settings.

### Runtime Issues

1. **Model loading failures**: Check that your model paths are correct and the model files are available.

2. **Crashes during initialization**: Ensure you're using a compatible version of llama.rn for your React Native version.

3. **Memory issues**: Large models may exceed device memory. Configure appropriate context sizes and memory limits.

## Advanced Configuration

To customize the plugin's behavior:

1. **Additional header paths**: Edit the `react_paths` array in the plugin if you need to include additional React Native components.

2. **Supporting different targets**: If your project has renamed the llama-rn target, update the target name in the plugin.

## Versioning Information

- **llama.rn version**: 0.5.8 (current tested version)
- **React Native compatibility**: Works with React Native 0.76.9+
- **Expo SDK compatibility**: Tested with Expo SDK 52+

## Additional Resources

- [llama.rn GitHub Repository](https://github.com/mybigday/llama.rn)
- [llama.cpp Documentation](https://github.com/ggerganov/llama.cpp)
- [Expo Config Plugins Guide](https://docs.expo.dev/guides/config-plugins/)

## License

This plugin is provided under the same license as your project. The documentation and code examples are available for unrestricted use within your project. 