# Expo BLE Module Setup Guide

## Overview

This guide documents the complete setup for using `react-native-ble-plx` with Expo prebuild in the LAMA app.

## Requirements

- Expo SDK (managed workflow with prebuild)
- react-native-ble-plx: ^3.1.2
- Physical device for testing (BLE doesn't work on simulators)
- iOS 13.0+ / Android 5.0+ (API 21+)

## Installation Steps

### 1. Install the BLE package

```bash
npm install react-native-ble-plx
```

### 2. Configure Expo Plugin

Created `/plugins/withBLEPermissions.js` to handle platform-specific configurations:

#### iOS Permissions Added:
- `NSBluetoothAlwaysUsageDescription`
- `NSBluetoothPeripheralUsageDescription`
- `UIBackgroundModes`: bluetooth-central, bluetooth-peripheral

#### Android Permissions Added:
- `android.permission.BLUETOOTH`
- `android.permission.BLUETOOTH_ADMIN`
- `android.permission.BLUETOOTH_SCAN` (Android 12+)
- `android.permission.BLUETOOTH_CONNECT` (Android 12+)
- `android.permission.BLUETOOTH_ADVERTISE` (Android 12+)
- `android.permission.ACCESS_FINE_LOCATION`
- `android.permission.ACCESS_COARSE_LOCATION`

### 3. Update app.json

```json
{
  "expo": {
    "plugins": [
      "./plugins/withBLEPermissions",
      // ... other plugins
    ],
    "ios": {
      "infoPlist": {
        "NSBluetoothAlwaysUsageDescription": "App uses Bluetooth...",
        "NSBluetoothPeripheralUsageDescription": "App uses Bluetooth...",
        "UIBackgroundModes": ["bluetooth-central", "bluetooth-peripheral"]
      }
    },
    "android": {
      "permissions": [
        "android.permission.BLUETOOTH",
        "android.permission.BLUETOOTH_ADMIN",
        "android.permission.BLUETOOTH_CONNECT",
        "android.permission.BLUETOOTH_SCAN",
        "android.permission.BLUETOOTH_ADVERTISE",
        "android.permission.ACCESS_FINE_LOCATION"
      ]
    }
  }
}
```

### 4. Run Prebuild

```bash
# Clean prebuild to regenerate native projects
npx expo prebuild --clean

# Install iOS pods
cd ios && pod install && cd ..

# For Android, clean gradle
cd android && ./gradlew clean && cd ..
```

## Service Architecture

### RefactoredBTLEService

Direct implementation using `react-native-ble-plx` without `@refinio/one.btle` dependency:

```typescript
import { BleManager, Device, State } from 'react-native-ble-plx';

export class RefactoredBTLEService extends EventEmitter {
  private bleManager: BleManager | null = null;
  
  async initialize(): Promise<boolean> {
    this.bleManager = new BleManager();
    // Monitor Bluetooth state
    // Request permissions
    // Setup event handlers
  }
}
```

### Key Features

1. **Direct BLE Manager Access** - No abstraction layer
2. **Permission Handling** - Android 12+ specific permissions
3. **State Monitoring** - Real-time Bluetooth state updates
4. **Device Discovery** - Support for ESP32, rings, wearables
5. **Error Handling** - Graceful degradation when BLE unavailable

## Testing

### Test on Physical Device

```bash
# iOS (physical device)
npm run ios -- --device

# Android (physical device)
npm run android -- --device
```

### Run BLE Tests

```typescript
import { runBLETests } from '@src/tests/BLEModuleTest';

// Run in your app
await runBLETests();
```

### Expected Test Output

```
========================================
     BLE MODULE TEST SUITE
========================================
Platform: ios v17.0

[BLEModuleTest] Testing BLE initialization...
[BLEModuleTest] ✅ BLE module initialized successfully

[BLEModuleTest] Testing Bluetooth availability...
[BLEModuleTest] ✅ Bluetooth is available and powered on

[BLEModuleTest] Testing device discovery (5 seconds)...
[BLEModuleTest] 🔍 Scanning for devices...
[BLEModuleTest] 📱 Device discovered: ESP32-abc123 ESP32
[BLEModuleTest] ✅ Found 1 device(s)

========================================
           TEST RESULTS
========================================
Initialization: ✅ PASS
Availability:   ✅ PASS
Discovery:      ✅ PASS
========================================
```

## Troubleshooting

### Issue: Native module not found

**Error**: `Native module BlePlx not found`

**Solution**:
```bash
npx expo prebuild --clean
cd ios && pod install
```

### Issue: Bluetooth permissions denied (Android)

**Error**: `BLUETOOTH_SCAN permission denied`

**Solution**:
1. Ensure Android 12+ permissions in app.json
2. Request permissions at runtime:
```typescript
await PermissionsAndroid.request(
  PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
);
```

### Issue: NativeEventEmitter error

**Error**: `new NativeEventEmitter() requires a non-null argument`

**Solution**:
1. Check native module is properly linked
2. Ensure you're testing on a physical device
3. Rebuild the app after prebuild

### Issue: Pod installation fails

**Error**: `Can't merge pod_target_xcconfig`

**Solution**:
```bash
cd ios
pod deintegrate
pod install
```

## Platform-Specific Notes

### iOS

- Minimum deployment target: iOS 13.0
- Background modes required for continuous scanning
- No location permission needed (unlike Android)

### Android

- Minimum SDK: 21 (Android 5.0)
- Target SDK: 34 (Android 14)
- Location permission required for BLE scanning (Android < 12)
- New Bluetooth permissions for Android 12+

## Build Commands

### Development Build

```bash
# iOS
eas build --platform ios --profile development

# Android
eas build --platform android --profile development
```

### Production Build

```bash
# iOS
eas build --platform ios --profile production

# Android
eas build --platform android --profile production
```

## Verification Checklist

- [x] react-native-ble-plx installed
- [x] Expo plugin created (withBLEPermissions.js)
- [x] app.json configured with plugin
- [x] iOS permissions in Info.plist
- [x] Android permissions in AndroidManifest.xml
- [x] Prebuild successful
- [x] Pods installed (iOS)
- [x] RefactoredBTLEService created
- [x] Test suite created
- [x] Documentation complete

## Next Steps

1. Test on physical devices
2. Implement BLE advertising for app-to-app discovery
3. Add characteristic notifications for real-time updates
4. Implement connection retry logic
5. Add device bonding/pairing support

## Resources

- [react-native-ble-plx Documentation](https://github.com/dotintent/react-native-ble-plx)
- [Expo Prebuild Documentation](https://docs.expo.dev/workflow/prebuild/)
- [Expo Config Plugins](https://docs.expo.dev/config-plugins/introduction/)
- [Android Bluetooth Permissions](https://developer.android.com/guide/topics/connectivity/bluetooth/permissions)
- [iOS Core Bluetooth](https://developer.apple.com/documentation/corebluetooth)