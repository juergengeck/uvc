# Device Management Architecture

## Overview

The Lama application uses a sophisticated device management system built on the ONE platform's object storage architecture. Devices are stored as versioned ONE objects, not in application settings.

## Key Components

### 1. DeviceModel (`src/models/device/DeviceModel.ts`)

The central model for managing device instances and credentials. It handles:

- **Device Registration**: Creating ESP32Device objects with proper ownership
- **Credential Management**: Issuing and storing device ownership credentials
- **Device Persistence**: Storing devices as versioned ONE objects
- **Settings Management**: Device-specific settings stored separately as DeviceSettings objects

**Key Methods:**
- `persistDeviceOwnership(deviceId, ownerId)` - Register device ownership without sending credentials (for VC-Exchange flow)
- `registerDeviceOwnership(deviceId)` - Register ownership and send credentials to device
- `getDevice(deviceId)` - Retrieve a device by ID
- `getDevices()` - Get all devices (owned and discovered)
- `updateDeviceSettings(deviceId, settings)` - Update device configuration
- `removeDeviceOwnership(deviceId)` - Remove device ownership

### 2. DeviceDiscoveryModel (`src/models/network/DeviceDiscoveryModel.ts`)

Manages device discovery using UDP broadcasts and attestation-based discovery protocol:

- **Discovery Protocol**: Uses AttestationDiscovery for secure device discovery
- **VC Exchange**: Integrates with VCManager for credential exchange
- **ESP32 Support**: Special handling for ESP32 devices via ESP32ConnectionManager
- **Ownership Flow**: Delegates device persistence to DeviceModel

**Key Features:**
- Attestation-based discovery with compact binary format
- Credential verification via CredentialVerifier
- Journal-based synchronization for ESP32 devices
- Automatic ownership detection and validation

### 3. Device Storage

Devices are stored as ONE objects with proper relationships:

#### ESP32Device Object
```typescript
interface ESP32Device {
  $type$: 'ESP32Device';
  owner: SHA256IdHash<Person>;  // isID field - device owner
  name: string;                  // isID field - device name
  deviceId: string;              // Original discovery ID
  deviceType: string;            // Device classification
  address: string;               // Network address
  port: number;                  // Network port
  capabilities: string[];        // Device capabilities
  hasValidCredential: boolean;   // Credential status
  // ... other fields
}
```

#### DeviceSettings Object
```typescript
interface DeviceSettings {
  $type$: 'DeviceSettings';
  forDevice: SHA256IdHash<ESP32Device>;  // isID field - reference to device
  displayName: string;                   // User-defined name
  isConnected: boolean;                  // Connection state
  autoConnect: boolean;                  // Auto-connect preference
  permissions: string[];                 // Granted permissions
  // ... other preferences
}
```

#### DeviceList Object
```typescript
interface DeviceList {
  $type$: 'DeviceList';
  owner: SHA256IdHash<Person>;           // isID field - list owner
  devices: SHA256IdHash<ESP32Device>[];  // Array of device references
}
```

### 4. Settings Service (Deprecated for Device Storage)

The DeviceSettingsService (`src/services/DeviceSettingsService.ts`) previously stored devices in settings but this is now deprecated. Device-related methods are marked with `@deprecated` tags directing to use DeviceModel instead.

**Settings should only store:**
- Discovery preferences (enabled/disabled, port)
- Default data presentation format
- Auto-connect preferences
- UI preferences

## Device Ownership Flow

### 1. Discovery Phase
1. Device broadcasts discovery packets (UDP)
2. DeviceDiscoveryModel receives and validates packets
3. Device added to discovery list with basic info

### 2. Ownership Claim
1. User initiates ownership claim via UI
2. DeviceDiscoveryModel triggers VC exchange
3. Device validates credentials and accepts ownership
4. DeviceModel persists device as ESP32Device object

### 3. Credential Storage
1. DeviceModel creates VerifiableCredential
2. Credential references the ESP32Device object
3. Both stored in ONE object storage
4. Device receives and stores credential

### 4. Ongoing Management
1. DeviceSettings track user preferences
2. Connection state managed by ESP32ConnectionManager
3. Journal sync maintains device state
4. Discovery continues for unowned devices

## Best Practices

### DO:
- Store devices as ONE objects via DeviceModel
- Use DeviceSettings for user preferences only
- Reference devices by SHA256IdHash when needed
- Handle device lifecycle through proper models

### DON'T:
- Store device objects in settings
- Create devices without proper ownership
- Bypass the credential verification flow
- Mix discovery state with persistent storage

## Migration Notes

If upgrading from older versions where devices were stored in settings:

1. Devices in settings are ignored (marked deprecated)
2. Owned devices should be re-registered via UI
3. Device ownership must be re-established via VC exchange
4. Settings now only store discovery preferences

## Security Considerations

1. **Ownership Verification**: All device ownership claims go through VC exchange
2. **Credential Validation**: Devices verify credentials before accepting commands
3. **Attestation Discovery**: Discovery packets include attestations for authenticity
4. **Journal Integrity**: Device state changes tracked in signed journal entries

## API Examples

### Register Device Ownership
```typescript
// Get DeviceModel instance
const deviceModel = DeviceModel.getInstance();

// Persist ownership (after VC exchange)
const result = await deviceModel.persistDeviceOwnership(
  deviceId,
  ownerPersonId
);

if (result.success) {
  console.log('Device registered successfully');
}
```

### Get All Devices
```typescript
// Get all devices (owned and discovered)
const devices = await deviceModel.getDevices();

// Filter owned devices
const ownedDevices = devices.filter(d => 
  d.owner === currentPersonId
);
```

### Update Device Settings
```typescript
// Update device settings
await deviceModel.updateDeviceSettings(deviceId, {
  displayName: 'Living Room Light',
  autoConnect: true,
  notifications: false
});
```

### Remove Device Ownership
```typescript
// Remove device ownership
await deviceModel.removeDeviceOwnership(deviceId);
```

## Troubleshooting

### Device Not Appearing
1. Check discovery is enabled in settings
2. Verify device is broadcasting on correct port
3. Check network connectivity
4. Review discovery logs

### Ownership Claim Fails
1. Verify device supports VC exchange
2. Check credential generation logs
3. Ensure device firmware is updated
4. Try manual credential flash via UI

### Settings Not Persisting
1. Ensure using DeviceModel, not settings service
2. Check ONE object storage is initialized
3. Verify proper permissions for storage
4. Review DeviceModel initialization logs

## Related Documentation

- [Network Architecture](docs/network.md) - Network layer details
- [CHUM Protocol](docs/chum.md) - Message synchronization
- [ONE Platform](CLAUDE.md) - Platform architecture
- [Device Discovery](src/models/network/discovery/README.md) - Discovery protocol details