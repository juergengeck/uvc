# BTLE Module Refactoring Guide

## Overview

We have successfully refactored the BTLE module to remove dependency on `@refinio/one.btle` and use `react-native-ble-plx` directly. This provides better control over the BLE implementation and removes the abstraction layer that was causing issues.

## Changes Made

### 1. New RefactoredBTLEService

Created `/src/services/RefactoredBTLEService.ts` which:
- Directly imports and uses `react-native-ble-plx` 
- Implements all the same functionality as the original `UniversalBTLEService`
- Handles Android permissions properly (BLUETOOTH_SCAN, BLUETOOTH_CONNECT for Android 12+)
- Provides better error handling and state management
- No longer depends on `@refinio/one.btle` module

### 2. Backward Compatibility

Modified `/src/services/ESP32BTLEService.ts` to:
- Re-export `RefactoredBTLEService` as `UniversalBTLEService`
- Maintains backward compatibility with existing code
- No changes needed in consuming components

### 3. Key Improvements

#### Direct BLE Manager Usage
```typescript
// Before (with one.btle)
const { UnifiedBLEManager } = await import('@refinio/one.btle');
this.bleManager = new UnifiedBLEManager();

// After (direct react-native-ble-plx)
import { BleManager } from 'react-native-ble-plx';
this.bleManager = new BleManager();
```

#### Better Permission Handling
```typescript
// Android 12+ specific permissions
if (Platform.Version >= 31) {
  await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
  );
  await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
  );
}
```

#### Improved Error Handling
- Proper Bluetooth state monitoring
- Better error messages for missing native modules
- Graceful degradation when BLE is not available

## API Compatibility

The refactored service maintains the same public API:

- `initialize()` - Initialize BLE manager
- `startDiscovery()` - Start scanning for devices
- `stopDiscovery()` - Stop scanning
- `connectDevice(deviceId)` - Connect to a device
- `disconnectDevice(deviceId)` - Disconnect from a device
- `sendLEDCommand(deviceId, action)` - Send LED control commands
- `shareWiFiCredentials(deviceId, ssid, password)` - Share WiFi credentials
- `getDeviceInfo(deviceId)` - Get device information
- `isBTLEAvailable()` - Check if BLE is available
- `cleanup()` - Clean up resources

## Migration Path

No migration needed for existing code! The service is drop-in compatible through the re-export.

If you want to use the new service directly:
```typescript
// Option 1: Keep using existing import (recommended)
import { UniversalBTLEService } from '@src/services/ESP32BTLEService';

// Option 2: Use new service directly
import { RefactoredBTLEService } from '@src/services/RefactoredBTLEService';
```

## Device Type Detection

The service automatically detects and supports:
- **ESP32 Devices** - WiFi configuration, LED control
- **Ring Devices** - Health data, battery monitoring
- **Wearable Devices** - Fitness tracking, sensors
- **Generic IoT Devices** - Basic BLE communication

## Service UUIDs

Standard GATT services supported:
```typescript
SUPPORTED_SERVICES = [
  '12345678-1234-1234-1234-123456789abc', // ESP32 custom service
  '87654321-4321-4321-4321-210987654321', // LAMA App service
  '0000180F-0000-1000-8000-00805F9B34FB', // Battery Service
  '0000180D-0000-1000-8000-00805F9B34FB', // Running Speed and Cadence
  '0000180A-0000-1000-8000-00805F9B34FB', // Device Information
  '00001800-0000-1000-8000-00805F9B34FB', // Generic Access
  '00001801-0000-1000-8000-00805F9B34FB'  // Generic Attribute
]
```

## Testing

To test the refactored BTLE service:

1. **Ensure native modules are linked**:
```bash
npx expo prebuild --clean
cd ios && pod install
cd ../android && ./gradlew clean
```

2. **Run on physical device** (BLE doesn't work on simulators):
```bash
npm run ios -- --device
npm run android -- --device
```

3. **Check BLE availability**:
```typescript
const btleService = new RefactoredBTLEService();
const available = await btleService.isBTLEAvailable();
console.log('BLE available:', available);
```

## Troubleshooting

### Native Module Not Found
If you see "BLE native module not available":
1. Run `npx expo prebuild --clean`
2. Reinstall pods: `cd ios && pod install`
3. Clean and rebuild the app

### Android Permissions
For Android 12+, ensure you have the following in `AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
```

### iOS Permissions
Ensure you have the following in `Info.plist`:
```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>This app needs Bluetooth to discover and connect to devices</string>
<key>NSBluetoothPeripheralUsageDescription</key>
<string>This app needs Bluetooth to discover and connect to devices</string>
```

## Future Improvements

1. **Remove one.btle dependency entirely** - Once all references are migrated
2. **Add BLE advertising support** - For app-to-app discovery
3. **Implement characteristic notifications** - For real-time data updates
4. **Add connection retry logic** - For better reliability
5. **Implement device bonding/pairing** - For secure connections

## Conclusion

The refactored BTLE service provides a cleaner, more maintainable implementation that directly uses `react-native-ble-plx` without the abstraction layer of `@refinio/one.btle`. This gives us better control over the BLE functionality and makes debugging easier.