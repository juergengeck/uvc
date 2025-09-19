# @refinio/one.health

Health data integration package for ONE platform with Apple Health, Google Fit, and FHIR support.

## Overview

`one.health` provides a unified interface for health data management, integrating:
- Apple HealthKit data
- Google Fit data
- BLE health device data (via `one.btle`)
- FHIR (Fast Healthcare Interoperability Resources) data models
- ONE platform storage and synchronization

## Features

### Health Data Sources
- **Apple HealthKit**: Read health data from iOS devices
- **Google Fit**: Access fitness data from Android devices
- **BLE Devices**: Integrate smart rings, fitness trackers, and other health monitors
- **Manual Entry**: Support for user-entered health data

### FHIR Compliance
- FHIR R4 resource types
- LOINC codes for measurements
- UCUM units for standardization
- Automatic conversion from proprietary formats

### Data Types Supported
- Vital signs (heart rate, blood pressure, temperature)
- Activity data (steps, calories, distance)
- Sleep analysis
- Body measurements (weight, height, BMI)
- Blood glucose levels
- SpO2 (oxygen saturation)

## Installation

```bash
npm install @refinio/one.health
```

### Peer Dependencies
```bash
npm install react-native-health react-native-google-fit react-native-ble-plx
```

### iOS Setup
Add to your `Info.plist`:
```xml
<key>NSHealthShareUsageDescription</key>
<string>This app needs access to health data to track your wellness</string>
<key>NSHealthUpdateUsageDescription</key>
<string>This app needs to update health data from connected devices</string>
```

### Android Setup
Add to your `AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />
```

## Usage

### Basic Setup

```typescript
import { 
  HealthDataService, 
  AppleHealthService,
  BLEHealthIntegration 
} from '@refinio/one.health';

// Initialize health data service
const healthService = new HealthDataService({
  storage: oneInstance, // Your ONE platform instance
  patientId: 'patient-123'
});

// Setup Apple Health (iOS)
const appleHealth = new AppleHealthService();
await appleHealth.requestPermissions([
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierStepCount'
]);

// Setup BLE device integration
const bleIntegration = new BLEHealthIntegration(healthService, {
  patientId: 'patient-123',
  autoConnect: true,
  enableRealTimeSync: true
});
```

### Reading Health Data

```typescript
// Get heart rate from Apple Health
const heartRates = await appleHealth.getHeartRateSamples(
  new Date(Date.now() - 86400000), // 24 hours ago
  new Date()
);

// Convert to FHIR
import { appleHealthToFHIR } from '@refinio/one.health';

const fhirObservations = heartRates.map(hr => 
  appleHealthToFHIR(hr, 'patient-123')
);

// Save to ONE platform
await healthService.saveObservations(fhirObservations);
```

### BLE Device Integration

```typescript
// Start device discovery
await bleIntegration.startDiscovery(['ring', 'wearable']);

// Handle device events
bleIntegration.on('deviceDiscovered', (device) => {
  console.log('Found health device:', device.name);
});

bleIntegration.on('healthDataReceived', ({ device, data, observation }) => {
  console.log(`${device.name}: ${data.type} = ${data.value} ${data.unit}`);
});

// Get health summary
const summary = await bleIntegration.getHealthSummary('week');
```

### FHIR Resources

```typescript
import { 
  createPatient, 
  createDevice, 
  createObservation,
  LOINC_CODES,
  UCUM_UNITS 
} from '@refinio/one.health';

// Create a patient
const patient = createPatient({
  id: 'patient-123',
  name: { given: ['John'], family: 'Doe' },
  gender: 'male',
  birthDate: '1990-01-01'
});

// Create a device for a smart ring
const device = createDevice({
  id: 'ring-001',
  displayName: 'R02 Smart Ring',
  type: DeviceTypes.SMART_RING,
  manufacturer: 'Example Corp',
  model: 'R02',
  patient: { reference: 'Patient/patient-123' }
});

// Create an observation
const observation = {
  resourceType: 'Observation',
  status: 'final',
  code: createLOINCCode(LOINC_CODES.HEART_RATE, 'Heart rate'),
  valueQuantity: createQuantity(72, UCUM_UNITS.BEATS_PER_MINUTE),
  subject: { reference: 'Patient/patient-123' },
  device: { reference: 'Device/ring-001' }
};
```

### React Hooks

```typescript
import { useHealthData, useHealthPermissions } from '@refinio/one.health';

function HealthDashboard() {
  const { data, loading, error, refresh } = useHealthData({
    types: ['heart-rate', 'steps'],
    period: 'day'
  });

  const { 
    hasPermission, 
    requestPermission 
  } = useHealthPermissions();

  if (!hasPermission) {
    return (
      <Button onPress={requestPermission}>
        Grant Health Access
      </Button>
    );
  }

  return (
    <View>
      {data.heartRate && (
        <Text>Heart Rate: {data.heartRate.latest} BPM</Text>
      )}
      {data.steps && (
        <Text>Steps Today: {data.steps.total}</Text>
      )}
    </View>
  );
}
```

## Architecture

### Package Structure
```
one.health/
├── apple/          # Apple HealthKit integration
├── google/         # Google Fit integration  
├── fhir/           # FHIR resources and converters
├── integrations/   # BLE and platform integrations
├── models/         # Health data models
├── services/       # Core services
├── types/          # TypeScript definitions
└── utils/          # Utilities and helpers
```

### Data Flow
1. Health data sources (Apple Health, Google Fit, BLE devices)
2. Convert to FHIR-compliant format
3. Store in ONE platform
4. Sync and aggregate across devices
5. Present unified health view

## Advanced Features

### Health Goals
```typescript
const goal = createGoal({
  id: 'goal-001',
  lifecycleStatus: 'active',
  description: { text: 'Walk 10,000 steps daily' },
  subject: { reference: 'Patient/patient-123' },
  target: [{
    measure: createLOINCCode(LOINC_CODES.STEPS_24HR, 'Daily steps'),
    detailQuantity: createQuantity(10000, UCUM_UNITS.COUNT),
    dueDate: '2024-12-31'
  }]
});
```

### Care Plans
```typescript
const carePlan = createCarePlan({
  id: 'plan-001',
  status: 'active',
  intent: 'plan',
  title: 'Heart Health Monitoring',
  subject: { reference: 'Patient/patient-123' },
  activity: [{
    detail: {
      status: 'in-progress',
      description: 'Monitor heart rate 3 times daily'
    }
  }]
});
```

## Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

MIT © Refinio

## See Also

- [@refinio/one.btle](../one.btle) - BLE device integration
- [@refinio/one.core](../one.core) - Core ONE platform
- [FHIR R4 Specification](https://hl7.org/fhir/R4/)
- [LOINC](https://loinc.org/) - Logical Observation Identifiers
- [UCUM](https://unitsofmeasure.org/) - Unified Code for Units of Measure