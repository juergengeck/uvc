# Expo Prebuild Configuration Analysis

## Current Issues

### 1. Multiple Duplicate Plugin Executions
- `[llama-rn-plugin] Added UIFileSharingEnabled to Info.plist.` appears **4 times**
- This suggests the plugin is being called multiple times during prebuild

### 2. Plugin Chain Problems

#### Plugins in app.json:
1. `expo-router` - File-based routing
2. `./plugins/withLlamaSetup` - Runs llama.rn setup script
3. `./plugins/withBLEPermissions` - Adds BLE permissions for iOS/Android
4. `expo-build-properties` - Sets build configurations
5. `expo-image-picker` - Image picker functionality
6. `expo-localization` - Localization support

#### Additional Plugins Applied During Prebuild (not in app.json):
- `[FollyCoroutinesFix]` - Fixes Folly coroutines issue
- `Podfile post_install` modifications - Multiple framework fixes
- `RCTDeprecation moduleMap` fix
- `llama-rn-plugin` - Different from withLlamaSetup

### 3. Architecture Conflicts
- iOS: `newArchEnabled: true` in app.json
- Android: `newArchEnabled: false` in app.json (inconsistent!)
- But expo-build-properties sets both to `true`

### 4. Missing/Broken References
- `../llama-module-disable-plugin` referenced in plugins/index.js
- `@modelcontextprotocol/sdk` package warnings

### 5. Pod Installation Issues
- `DEFINES_MODULE` conflicts for expo-dev-menu
- Duplicate module processing

## Plugin Execution Order

1. **Pre-prebuild Phase:**
   - Clear ios/android directories
   
2. **Prebuild Phase (multiple passes):**
   - Pass 1: llama-rn-plugin (4x execution)
   - Pass 2: FollyCoroutinesFix
   - Pass 3: Podfile modifications
   - Pass 4: RCTDeprecation fixes
   - Pass 5: withLlamaSetup
   - Pass 6: AppDelegate modifications

3. **Post-prebuild Phase:**
   - setup-modules script
   - pod-install

## Redundancies Identified

1. **Llama.rn Setup:**
   - `withLlamaSetup` plugin runs setup-llama-rn.js
   - `npm run setup-modules` also runs setup-llama-rn.js
   - Both are executed in the same prebuild process

2. **Multiple Podfile Modifications:**
   - FollyCoroutinesFix
   - Framework search path fixes
   - RCTDeprecation moduleMap fix
   - All modifying the same Podfile

3. **BLE Permissions:**
   - Set in app.json infoPlist
   - Also added by withBLEPermissions plugin
   - Potentially redundant

## Recommendations

### 1. Consolidate Plugin Structure
Create a single master plugin that orchestrates all modifications:

```javascript
// plugins/withLamaConfig.js
module.exports = function withLamaConfig(config) {
  config = withLlamaRnSetup(config);
  config = withBLESupport(config);
  config = withiOSFixes(config);
  config = withAndroidFixes(config);
  return config;
};
```

### 2. Fix Architecture Inconsistency
Both platforms should use the same architecture setting:

```json
{
  "ios": {
    "newArchEnabled": true
  },
  "android": {
    "newArchEnabled": true  // Fix: was false
  }
}
```

### 3. Remove Duplicate Executions
- Remove `npm run setup-modules` from prebuild:clean script
- Ensure llama-rn-plugin only runs once
- Consolidate Podfile modifications

### 4. Clean Plugin List in app.json
```json
"plugins": [
  "expo-router",
  "./plugins/withLamaConfig",  // Single consolidated plugin
  [
    "expo-build-properties",
    {
      "ios": {
        "deploymentTarget": "15.1",
        "newArchitectureEnabled": true
      },
      "android": {
        "compileSdkVersion": 34,
        "targetSdkVersion": 34,
        "minSdkVersion": 21,
        "newArchitectureEnabled": true
      }
    }
  ],
  "expo-image-picker",
  "expo-localization"
]
```

### 5. Fix Package.json Scripts
```json
"scripts": {
  "prebuild:clean": "rm -rf ios android && expo prebuild --clean && npm run pod-install",
  "setup-modules": "node scripts/setup-llama-rn.js",
  "pod-install": "cd ios && pod install --repo-update && cd .."
}
```

## Plugin Dependencies Map

```
expo-router
├── No dependencies

withLlamaSetup
├── Requires: scripts/setup-llama-rn.js
├── Modifies: llama.rn podspec, Android config

withBLEPermissions  
├── Modifies: Info.plist, AndroidManifest.xml
├── Adds: Bluetooth permissions

expo-build-properties
├── Modifies: Build settings
├── Sets: Architecture, SDK versions

expo-image-picker
├── Adds: Photo library permissions

expo-localization
├── Adds: Localization support
```

## Action Items

1. **Immediate:**
   - Fix Android newArchEnabled inconsistency
   - Remove duplicate setup-modules execution

2. **Short-term:**
   - Consolidate all custom plugins into withLamaConfig
   - Clean up plugin directory structure

3. **Long-term:**
   - Move to Expo SDK 51+ for better prebuild support
   - Consider using Expo Modules API for custom native code