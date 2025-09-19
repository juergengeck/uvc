# uvc.one

A React Native/Expo mobile app for secure local-first AI chat, built on the ONE platform.

## Architecture

### Model Hierarchy

The app follows ONE platform's model hierarchy:

- **Core Models**
  - `MultiUser`: Instance lifecycle and authentication
  - `LeuteModel`: Identity and user profile management
  - `ChannelManager`: Communication and data sharing
  - `ConnectionsModel`: Network connections and pairing
  - `TopicModel`: Chat and messaging
  - `BlobCollectionModel`: File and binary data handling
  - `Notifications`: System notifications
  - `Settings`: Application configuration
  - `QuicModel`: QUIC transport and UDP socket management

### Connection Handover and Pairing Protocol

The app implements a sophisticated connection handover mechanism for device pairing through CommServer relay. This system enables secure peer-to-peer connections between devices using invitation URLs.

#### Connection Flow Architecture

The pairing process follows this sequence:

1. **Spare Connection Creation**: UVC creates spare connections to CommServer that wait for handover
2. **Invitation Generation**: UVC generates invitation URLs containing pairing tokens
3. **Invitation Acceptance**: edda.one scans/enters the invitation URL
4. **Connection Handover**: CommServer hands over spare connections to edda.one for pairing
5. **Pairing Protocol**: Encrypted key exchange and trust establishment
6. **Chum Sync**: Ongoing data synchronization between paired devices

#### Technical Implementation

**Key Fix: Message Flow Separation**

The critical fix implemented separates the message handling responsibilities:

- **CommunicationServerListener**: Handles connection establishment and handover
  - Receives `connection_handover` from CommServer
  - Immediately emits connection for pairing protocol
  - Does NOT consume `communication_request` messages

- **ConnectionSetup**: Handles pairing protocol
  - Waits for and processes `communication_request` messages
  - Performs encrypted key exchange
  - Establishes secure communication channel

**Previous Issue**: The system was double-consuming `communication_request` messages, causing connections to stall at the pairing phase.

**Solution**: Modified `CommunicationServerListener.js` to emit connections immediately after handover without consuming pairing-specific messages.

#### Person ID Resolution Fix

**Issue**: After successful pairing, connections showed `remotePersonId: '0000000000000000000000000000000000000000000000000000000000000000'` instead of the actual person ID.

**Root Cause**: The `knownPeerMap` in `LeuteConnectionsModule` was not being populated with newly paired peer information because the profile created during pairing had empty contacts instead of including the `OneInstanceEndpoint`.

**Technical Flow**:
1. `connectionsInfo()` returns `peerInfo ? peerInfo.personId : dummyPersonId` where `dummyPersonId = '0'.repeat(64)`
2. `knownPeerMap` is populated only in `setupRoutesForOneInstanceEndpoint()` called from `updateCache()`
3. `updateCache()` calls `findAllOneInstanceEndpointsForOthers()` which searches for endpoints in contact profiles
4. During pairing, `trustPairingKeys()` created profiles with empty contacts `[]` instead of OneInstanceEndpoint
5. Without endpoints in profiles, `knownPeerMap` remained empty and returned dummy zeros

**Solution**: Modified `LeuteAccessRightsManager.trustPairingKeys()` to include `OneInstanceEndpoint` in the profile:

```typescript
const oneInstanceEndpoint = {
    $type$: 'OneInstanceEndpoint' as const,
    personId: remotePersonId,
    url: 'wss://commserver.edda.one',
    instanceId: _remoteInstanceId,
    instanceKeys: keys[0],
    personKeys: keys[0]
};

const profile = await ProfileModel.constructWithNewProfile(
    remotePersonId,
    localPersonId,
    'default',
    [oneInstanceEndpoint], // Include OneInstanceEndpoint in contacts
    [signKey]
);
```

**Result**: Now `updateCache()` finds the OneInstanceEndpoint, populates `knownPeerMap`, and `connectionsInfo()` returns the correct person ID.

#### Connection States

1. **Spare Connection State**:
   ```
   Connection -> Register -> Authenticate -> Wait for Handover
   ```

2. **Handover State**:
   ```
   Handover Received -> Emit for Pairing -> Ready for Protocol
   ```

3. **Pairing State**:
   ```
   Communication Request -> Key Exchange -> Trust Establishment -> Success
   ```

#### Error Handling

The system implements graceful handling of interrupted flows:

- **WebSocket Suspension**: Normal app backgrounding doesn't throw errors
- **Network Changes**: Connection interruptions are logged as normal events
- **Connection Closure**: Distinguishes between normal suspension and actual errors

#### Debugging and Monitoring

Comprehensive logging is implemented throughout the connection flow:

- **NetworkPlugin**: Logs connection lifecycle events with appropriate severity
- **CommunicationServerListener**: Traces handover and pairing emission
- **ConnectionSetup**: Detailed phase-by-phase pairing progress
- **PairingManager**: Trust establishment and success notifications

### Platform Implementation

The app integrates with the ONE platform through carefully designed platform-specific implementations:

#### QUIC Transport and UDP Management

- **QuicModel**: Follows one.models pattern for consistent architecture
  - Centralizes initialization and management of QUIC transport
  - Provides event-based communication using OEvents
  - Handles proper lifecycle management with shutdown capabilities
  - Integrates with AppModel for consistent access
  - Prevents "QUIC transport already initialized" errors

- **UDPManager**: Manages UDP sockets with proper lifecycle handling
  - Provides socket creation and tracking
  - Implements event-based notifications for socket lifecycle events
  - Ensures proper cleanup of resources
  - Centralizes error handling and reporting

- **Integration with DeviceDiscoveryManager**:
  - Uses dependency injection for QuicModel access
  - Provides fallback mechanism for backward compatibility
  - Improves error handling and logging

#### UDP Module

The UDP module follows a clean integration with one.core:

- **Native Implementation**:
  - iOS: Network.framework-based implementation in `ios/UDPModule/`
  - Android: Java socket implementation in `android-custom-modules/`

- **JavaScript Interface Layers**:
  - `one.core/lib/system/UDPModule.js`: Core implementation used in production
  - `udp-module/`: Package that re-exports one.core's UDPModule for Expo/RN discoverability
  - `src/models/quic/UDPManager.ts`: Model-based wrapper for UDP functionality

- **Integration Strategy**:
  - Production code accesses UDP through `AppModel.createUdpSocket()` or `QuicModel.createUdpSocket()`
  - This ensures consistent usage of one.core's implementation
  - Prevents duplicate implementations and compatibility issues
  - Follows the principle of using one.models pattern for all components

### Initialization Process

The app follows ONE platform's three-phase initialization process:

1. **Platform Setup (minimal, no storage)**
   - Prepare initial platform
   - Load model definitions
   - Setup hashes and essential services
   - Initialize QUIC transport in the entry point

2. **MultiUser Creation and Login**
   - Create MultiUser instance with recipes
   - Handle registration/login
   - Verify logged_in state
   - Instance is managed by MultiUser

3. **Model Setup**
   - Initialize object events
   - Create and initialize models in sequence:
     1. Base models (LeuteModel, Settings)
     2. Core services (Channels, etc.)
     3. Communication and sharing (including QuicModel)
     4. Application models
   - Set up cross-model dependencies

### Trust Management

- Automatic key trust on successful pairing
- Trust levels:
  - Inner circle (local/remote keys of main identity)
  - Others (TrustKeysCertificate by inner circle)
- Key verification using tweetnacl
- Certificate management for trust relationships

### Chat System

The app includes a comprehensive chat system with the following features:

1. **Message Types**
   - Text messages with markdown support
   - Image attachments with thumbnails
   - File attachments
   - AI-assisted messaging

2. **UI Components**
   - `MessageBubble`: Displays individual messages with status indicators
   - `InputToolbar`: Message input with file attachment support
   - `MessageList`: Virtualized message list with pull-to-refresh
   - `ChatHeader`: Model selection and connection status
   - `ChatFileSelector`: File and image attachment handling
   - `ChatAiSelector`: AI model selection and interaction

3. **Integration**
   - Uses ONE's `TopicModel` for message storage
   - Real-time updates through `ChannelManager`
   - Local-first architecture with sync support
   - End-to-end encryption for messages
   - Support for offline messaging

4. **AI Integration**
   - Multiple LLM model support (GPT-4, GPT-3.5, Local LLM)
   - Image analysis capabilities
   - Context-aware responses
   - Local processing options

### Project Structure

```
app/
├── initialization/     # Initialization and setup logic
├── models/            # Application models
├── (auth)/            # Authentication routes
├── (screens)/         # Main application screens
├── (tabs)/            # Tab-based navigation
│   ├── _layout.tsx    # Tab configuration
│   ├── messages.tsx   # Chat interface
│   └── settings.tsx   # Settings interface
└── src/
    ├── components/    # Reusable components
    │   └── chat/      # Chat-specific components
    ├── hooks/         # Custom React hooks
    ├── models/        # Model implementations
    ├── platform/      # Platform-specific implementations
    │   ├── index.ts   # Platform initialization
    │   └── udp/       # UDP module implementation
    ├── types/         # TypeScript definitions
    └── utils/         # Utility functions
```

## Native Modules

### UDP Module

The app includes a custom UDP module implementation for React Native:

- **iOS Implementation**: Uses Apple's Network.framework for modern UDP socket handling
- **Android Implementation**: Uses Java sockets for UDP communication
- **JavaScript Interface**: Provides a Node.js-like UDP socket interface
- **Integration with one.core**: Compatible with one.core's UDPModule interface

#### Usage

```javascript
// Production usage (recommended)
import { useAppModel } from '@src/hooks/useAppModel';

// Using AppModel convenience method
const appModel = useAppModel();
const socket = appModel.createUdpSocket({ type: 'udp4' });

// Or directly from QuicModel
const quicModel = appModel.quicModel;
const socket = quicModel.createUdpSocket({ type: 'udp4' });

// Legacy approach (not recommended)
import UDPModule from '@lama/UDPModule';
const socket = UDPModule.createSocket({ type: 'udp4' });

// Basic UDP communication
socket.on('message', (msg, rinfo) => {
  console.log(`Message from ${rinfo.address}:${rinfo.port}: ${msg}`);
});
socket.bind(8080);
socket.send(data, port, address);
```

### Using UDP in your code

To use UDP in your application code, you should access it through the AppModel or QuicModel:

```typescript
// Using AppModel (recommended for application code)
const socket = await appModel.createUdpSocket({ type: 'udp4' });

// Using QuicModel directly (for lower-level access)
const socket = await quicModel.createUdpSocket({ type: 'udp4' });
```

## Development

### Prerequisites

- Node.js 18+
- Expo CLI
- iOS Simulator or Android Emulator
- Local LLM setup (optional)

### Setup

1. Clone the repository
```bash
git clone <repository-url>
cd lama.one
```

2. Install dependencies
```bash
npm install
```

3. Start the development server
```bash
npx expo start
```

### Building for Production

```bash
# iOS
npm run build:ios

# Android
npm run build:android
```

### Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Dependencies

1. **one.core**
   - Core recipe and instance management
   - Crypto system for encryption
   - Key management and trust verification
   - Access control and storage management
   - Object event system
   - Storage base implementation
   - QUIC transport implementation
   - UDP module interface

2. **one.models**
   - LeuteModel for profile operations
   - TrustedKeysManager for key trust
   - ConnectionsModel for connection management
   - ChannelManager for communication
   - TopicModel for chat functionality
   - DocumentModel for file handling

3. **External**
   - React Native/Expo for mobile platform
   - TypeScript for type safety
   - Metro for bundling

# Model State Management

## Overview
The application uses a state machine pattern for all models to ensure proper initialization and state management. This is critical for the correct operation of components that depend on these models.

## States
Models have three states:
- `Uninitialised`: Initial state
- `Initialising`: Model is in the process of setting up
- `Initialised`: Model is ready for use

## QuicModel State Management

The QuicModel follows the same state machine pattern but adds additional internal state tracking:

- **Initialization States**:
  - `_initialized`: Indicates if the model is fully initialized
  - `_initializing`: Prevents concurrent initialization attempts

- **Event Notifications**:
  - `onQuicReady`: Emitted when QUIC transport is ready
  - `onUdpReady`: Emitted when UDP manager is ready
  - `onQuicError`: Emitted when errors occur during initialization

- **Initialization Process**:
  1. Check if already initialized or initializing
  2. Initialize QUIC transport (retrieve existing instance)
  3. Initialize UDP manager
  4. Set initialization flags
  5. Emit appropriate events

- **Shutdown Process**:
  1. Shutdown UDP manager (close all sockets)
  2. Reset QUIC transport reference
  3. Reset initialization flags

This approach ensures proper resource management and prevents initialization issues that were previously encountered with the platform-specific implementation.

## Usage in Components
Components that use models must use the `useModelState` hook:

```typescript
import { useModelState } from '../hooks/useModelState';

function MyComponent({ model }) {
  const { isReady, error: modelError, isLoading } = useModelState(model, 'ModelName');

  // Only perform operations when model is ready
  React.useEffect(() => {
    if (!isReady) return;
    // ... model operations ...
  }, [isReady]);

  if (isLoading) {
    return <LoadingView />;
  }

  if (modelError) {
    return <ErrorView error={modelError} />;
  }

  return <MainView />;
}
```

## Best Practices
1. Always check `isReady` before performing model operations
2. Handle `modelError` appropriately in UI
3. Show loading states while `isLoading` is true
4. Separate model state errors from operation errors
5. Use consistent logging with component name prefixes

### Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

Copyright © 2024 Refinio. All rights reserved.

## Acknowledgments

Special thanks to the [fullmoon-ios](https://github.com/mainframecomputer/fullmoon-ios) project for pioneering local LLM integration on iOS with MLX. While we maintain our own implementation, their groundbreaking work in optimizing LLMs for Apple Silicon has been inspirational for our local-first AI approach.

## Llama.rn Integration

We use the official `llama.rn` npm package for local LLM capabilities. Setup happens during the build process:

1. `npm run setup-llama` - Patches the llama.rn podspec to avoid duplicate header issues
2. `npm run prebuild:clean` - Standard iOS/Android setup including the llama.rn module

If you encounter build issues with llama.rn:

```bash
# Try the emergency fix for build issues
npm run fix-llama-pod

# Build with the emergency fix applied
npm run build:ios:with-fix
```

See [docs/llama-rn-usage.md](docs/llama-rn-usage.md) for detailed integration documentation.

# QUICVC Protocol for ESP32

An implementation of QUIC with Verifiable Credentials for ESP32 devices. This component provides a secure transport protocol for IoT devices without the online dependencies of traditional PKI.

## Features

- QUIC-like transport protocol with verifiable credentials for authentication
- Secure connection establishment with credential exchange
- Device discovery over UDP
- Credential provisioning and management
- Drop-in replacement for traditional UDP-based discovery and credential operations
- Ownership removal protocol with verifiable journal entries
- Service type routing for different message types

## Installation

### ESP-IDF Component Registry

This component can be installed directly from the ESP-IDF component registry:

```bash
idf.py add-dependency "refinio/quicvc^1.0.0"
```

### Manual Installation

1. Clone this repository into your project's `components` directory:

```bash
mkdir -p components
cd components
git clone https://github.com/refinio/quicvc.git
```

2. Include the component in your project's `CMakeLists.txt`:

```cmake
set(EXTRA_COMPONENT_DIRS ${EXTRA_COMPONENT_DIRS} "components/quicvc")
```

## Usage

### Initialize the Transport

```c
#include "quicvc_transport.h"

// Define the transport handle
quicvc_transport_t transport;

// Initialize with standard ports
esp_err_t ret = quicvc_transport_init(&transport, 49497, 49499);
if (ret != ESP_OK) {
    ESP_LOGE(TAG, "Failed to initialize QUICVC transport: %d", ret);
    return;
}
```

### Set Credential

```c
// Set local credential
ret = quicvc_transport_set_credential(&transport,
                                     "vc-esp32-12345678",       // id
                                     "issuer-id",               // issuer
                                     "subject-id",              // subject
                                     "esp32-12345678",          // device_id
                                     "ESP32",                   // device_type
                                     "AA:BB:CC:DD:EE:FF",       // device_mac
                                     1613692800,                // issued_at
                                     1645228800,                // expires_at
                                     "owner",                   // ownership
                                     "control,configure,monitor", // permissions
                                     "proof-signature");        // proof
if (ret != ESP_OK) {
    ESP_LOGE(TAG, "Failed to set credential: %d", ret);
    return;
}
```

### Send Discovery Broadcast

```c
// Send discovery to all devices (broadcast)
ret = quicvc_transport_send_discovery(&transport, NULL);
if (ret != ESP_OK) {
    ESP_LOGE(TAG, "Failed to send discovery: %d", ret);
    return;
}
```

### Check for Discovery Packets

```c
// Callback for discovery packets
void discovery_callback(const char *addr, uint16_t port, const char *device_id, void *user_data) {
    ESP_LOGI(TAG, "Discovery from %s:%d, device: %s", addr, port, device_id);
    
    // Store device information for later use
    // ...
}

// Check for discovery packets with 1-second timeout
ret = quicvc_transport_check_discovery(&transport, discovery_callback, NULL, 1000);
if (ret == ESP_OK) {
    ESP_LOGI(TAG, "Received discovery packet");
} else if (ret != ESP_ERR_TIMEOUT) {
    ESP_LOGE(TAG, "Error checking discovery: %d", ret);
}
```

### Send Credential to Device

```c
// Create a JSON credential
const char *json_credential = 
    "{"
    "\"id\":\"vc-device-12345678\","
    "\"iss\":\"issuer-id\","
    "\"sub\":\"subject-id\","
    "\"dev\":\"device-12345678\","
    "\"typ\":\"ESP32\","
    "\"mac\":\"AA:BB:CC:DD:EE:FF\","
    "\"iat\":1613692800,"
    "\"exp\":1645228800,"
    "\"own\":\"owner\","
    "\"prm\":\"control,configure,monitor\","
    "\"prf\":\"proof-signature\""
    "}";

// Send credential to device
ret = quicvc_transport_send_credential(&transport, "192.168.1.100", 49499, json_credential);
if (ret != ESP_OK) {
    ESP_LOGE(TAG, "Failed to send credential: %d", ret);
    return;
}
```

### Check for Credential Responses

```c
// Callback for credential responses
void credential_callback(const char *addr, uint16_t port, bool success, 
                       const char *message, const char *device_id, void *user_data) {
    if (success) {
        ESP_LOGI(TAG, "Credential accepted by %s:%d, device: %s", addr, port, device_id);
    } else {
        ESP_LOGW(TAG, "Credential rejected by %s:%d: %s", addr, port, message ? message : "Unknown error");
    }
}

// Check for credential responses with 5-second timeout
ret = quicvc_transport_check_credential_response(&transport, credential_callback, NULL, 5000);
if (ret == ESP_OK) {
    ESP_LOGI(TAG, "Received credential response");
} else if (ret != ESP_ERR_TIMEOUT) {
    ESP_LOGE(TAG, "Error checking credential response: %d", ret);
}
```

### Establish a Secure Connection

```c
// Connect to a device (client mode)
ret = quicvc_transport_connect(&transport, "192.168.1.100", 443, 5000);
if (ret != ESP_OK) {
    ESP_LOGE(TAG, "Failed to connect: %d", ret);
    return;
}
```

### Listen for Connections

```c
// Listen for connections (server mode)
ret = quicvc_transport_listen(&transport, 443);
if (ret != ESP_OK) {
    ESP_LOGE(TAG, "Failed to start listening: %d", ret);
    return;
}

// Accept connection with 10-second timeout
ret = quicvc_transport_accept(&transport, 10000);
if (ret != ESP_OK) {
    ESP_LOGE(TAG, "Failed to accept connection: %d", ret);
    return;
}
```

### Send and Receive Data

```c
// Send data
const char *message = "Hello, world!";
ret = quicvc_transport_send(&transport, message, strlen(message));
if (ret != ESP_OK) {
    ESP_LOGE(TAG, "Failed to send data: %d", ret);
    return;
}

// Receive data
char buffer[1024];
size_t len = sizeof(buffer);
ret = quicvc_transport_recv(&transport, buffer, &len, 1000);
if (ret == ESP_OK) {
    ESP_LOGI(TAG, "Received %d bytes: %.*s", len, len, buffer);
} else if (ret != ESP_ERR_TIMEOUT) {
    ESP_LOGE(TAG, "Error receiving data: %d", ret);
}
```

### Close Connection

```c
// Close the connection and clean up
quicvc_transport_close(&transport);
```

## Service Types

The QUICVC protocol uses service types to route different kinds of messages:

1. **DISCOVERY (Type 1)**: Device discovery broadcasts
2. **CREDENTIALS (Type 2)**: Ownership removal commands (previously used for credential provisioning)
3. **LED_CONTROL (Type 3)**: LED control commands for authenticated devices
4. **JOURNAL_SYNC (Type 5)**: Journal entry synchronization
5. **ATTESTATION_DISCOVERY (Type 6)**: Attestation-based discovery
6. **VC_EXCHANGE (Type 7)**: Verifiable credential exchange for authentication
7. **ESP32_COMMAND (Type 11)**: ESP32 command responses

## Ownership Management

### Device Provisioning

Devices are provisioned by issuing a DeviceIdentityCredential:

```json
{
  "$type$": "DeviceIdentityCredential",
  "issuer": "owner_person_id",
  "credentialSubject": {
    "id": "device_id",
    "type": "ESP32",
    "capabilities": ["led_control", "sensor_data"]
  }
}
```

### Ownership Removal

Ownership can be removed using service type 2:

```json
{
  "type": "ownership_remove",
  "deviceId": "device_id",
  "senderPersonId": "owner_person_id",
  "timestamp": 1234567890
}
```

The ESP32 validates the sender is the current owner, creates verifiable journal entries, clears ownership data, and restarts.

## Journal System

All ownership changes are recorded as verifiable credentials in the device journal:

```json
{
  "$type$": "DeviceJournalCredential",
  "issuer": "device_id",
  "issuanceDate": "2025-01-01T00:00:00Z",
  "credentialSubject": {
    "action": "ownership_removed",
    "actor": "person_id",
    "message": "Device is now unclaimed",
    "deviceState": {
      "owned": false,
      "owner": "none"
    }
  },
  "proof": {
    "type": "Ed25519Signature2020",
    "verificationMethod": "did:esp32:device_id#key-1"
  }
}
```

## API Reference

For detailed API documentation, see the header files:

- [quicvc.h](quicvc.h) - Core QUICVC protocol implementation
- [quicvc_transport.h](quicvc_transport.h) - High-level transport API

## Security Considerations

This implementation uses verifiable credentials for authentication, eliminating the need for online certificate authorities. However, you should still follow these security best practices:

1. Store credentials securely, preferably in encrypted storage
2. Implement regular credential rotation
3. Validate all credential fields, especially expiration dates
4. Use strong proofs and signatures in your credentials
5. Implement a credential revocation mechanism for compromised devices

## License

Apache License 2.0