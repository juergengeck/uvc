# Device Type Strategy

## Overview
Device types should be explicitly declared in the discovery protocol, not inferred from device IDs.

## Current Device Types
1. **ESP32** - ESP32 hardware devices with LED control and sensor capabilities
2. **application** - LAMA app instances (mobile, desktop, web)
3. **mobile** - Mobile devices (may be deprecated in favor of 'application')
4. **desktop** - Desktop devices (may be deprecated in favor of 'application')

## Handling Unknown Device Types

### Discovery Phase
When a device with type "Unknown" or unrecognized type is discovered:

1. **Display in UI** - Show the device with a generic icon and "Unknown Device" label
2. **Log for debugging** - Log the device details for troubleshooting
3. **Allow basic interaction** - Enable basic connectivity but no specialized features
4. **No automatic authentication** - Don't attempt specialized authentication flows

### Authentication Phase
For unknown devices:
1. **Generic credential exchange** - Use standard VC exchange without device-specific handling
2. **Capability-based features** - Enable features based on declared capabilities, not device type
3. **Manual pairing** - Require explicit user action to establish trust

### Future Extensibility
To add new device types:
1. Define the type string (e.g., "sensor", "gateway", "wearable")
2. Add to DeviceType enum/constants
3. Implement device-specific handlers if needed
4. Update UI to show appropriate icons/controls

## ESP32 Firmware Requirements

The ESP32 firmware MUST:
1. Send `deviceType: "ESP32"` in discovery messages
2. Include capabilities array (e.g., ["led-control", "credentials", "journal"])
3. Use a unique device ID (NOT prefixed with device type)
4. Support QUIC-VC authentication flow

Example discovery message:
```json
{
  "type": "discovery_request",
  "deviceId": "3f2504e0-4f89-11d3-9a0c-0305e82c3301",  // UUID, not "esp32-xxx"
  "deviceName": "Living Room Sensor",
  "deviceType": "ESP32",
  "capabilities": ["led-control", "temperature", "humidity"],
  "version": "1.0.0",
  "timestamp": 1234567890
}
```

## Migration Path

1. **Phase 1** - Support both explicit type and ID prefix (current state)
2. **Phase 2** - Log warnings when relying on ID prefix
3. **Phase 3** - Remove ID prefix checks, rely only on explicit type
4. **Phase 4** - Reject devices without explicit type field

## Security Considerations

- Device type alone does NOT grant trust or capabilities
- Authentication (via VC) is required for any privileged operations
- Capabilities must be verified, not assumed from device type
- Unknown devices should be sandboxed until explicitly trusted