# UVC.ONE Architecture Comprehensive Summary

**Project**: uvc.one - A secure, local-first messaging application built on the ONE platform
**Repository**: `/Users/gecko/src/uvc`
**Build System**: Expo/React Native with native module integration
**Key Technology Stack**: TypeScript, React Native, Expo, QUIC/UDP transport, LLM integration (llama.rn)

---

## 1. PROJECT STRUCTURE OVERVIEW

### Top-Level Directories

```
/Users/gecko/src/uvc/
├── app/                           # Expo Router screens (file-based routing)
│   ├── (tabs)/                   # Tab navigation group
│   ├── (auth)/                   # Authentication flows group
│   ├── (screens)/                # Modal screens and nested routes
│   └── _layout.tsx              # Root layout with providers
├── src/                           # Main source code
├── packages/                      # Monorepo packages
├── vendor/                        # NOT USED (check package.json)
├── node_modules/                 # Dependencies
├── package.json                   # Root manifest & scripts
├── babel.config.js               # Babel configuration with aliases
├── metro.config.js               # Metro bundler config
├── app.json                       # Expo configuration
├── jest.config.js                # Jest testing config
├── CLAUDE.md                      # Project instructions (THIS FILE)
└── tsconfig.json                  # TypeScript config (if present)
```

### Source Structure (src/)

```
src/
├── assets/                       # Images and resources
├── components/                   # React components organized by feature
│   ├── auth/                    # Authentication UI
│   ├── chat/                    # Chat/messaging UI
│   ├── contacts/                # Contact management UI
│   ├── devices/                 # Device discovery/pairing UI
│   └── [other feature dirs]
├── models/                       # Domain models (91 files, 10 subdirs)
│   ├── AppModel.ts             # Root orchestrator
│   ├── network/                # Network/transport models
│   │   ├── TransportManager.ts # Multi-transport coordinator
│   │   ├── QuicModel.ts        # QUIC/UDP transport
│   │   ├── DeviceDiscoveryModel.ts  # P2P device discovery
│   │   ├── UdpModel.ts         # UDP socket management
│   │   ├── connections/        # Connection state management
│   │   ├── discovery/          # Device discovery protocol
│   │   ├── transport/          # Transport implementations
│   │   └── esp32/              # ESP32-specific code
│   ├── ai/                     # AI/LLM models
│   │   ├── LLMManager.ts       # Local LLM lifecycle management
│   │   ├── LlamaModel.ts       # llama.rn integration
│   │   └── assistant/          # AI assistant models
│   ├── chat/                   # Chat/messaging models
│   ├── contacts/               # Contact management models
│   ├── device/                 # Device registry and settings
│   ├── core/                   # Core system models
│   └── [other subdirs]
├── hooks/                        # Custom React hooks
│   ├── useAppModel.ts          # App model access
│   ├── useModelState.ts        # Model state tracking
│   ├── chat/                   # Chat-related hooks
│   ├── contact/                # Contact-related hooks
│   ├── devices/                # Device-related hooks
│   └── [other feature hooks]
├── providers/                    # React Context providers
│   └── app/
│       └── OneProvider.tsx      # Main ONE platform provider
├── initialization/              # App startup sequence
│   ├── index.ts                # Main initialization entry point
│   ├── parallelInit.ts         # Parallel initialization optimizations
│   └── [initialization modules]
├── utils/                        # Utility functions
│   ├── appJournal.ts           # Event logging/journaling
│   ├── debugLogger.ts          # Debug utilities
│   ├── logger.ts               # Structured logging
│   └── [other utilities]
├── services/                     # Business logic services
│   ├── ModelService.ts         # Model management service
│   ├── NetworkSettingsService.ts # Network configuration
│   └── [other services]
├── types/                        # TypeScript type definitions
├── constants/                    # Application constants
├── config/                       # Configuration files
├── recipes/                      # ONE platform recipes (data structure definitions)
├── i18n/                         # Internationalization
├── locales/                      # Translation files
└── [other directories]
```

### Packages (Monorepo Structure)

```
packages/
├── quicvc-protocol/             # QUIC-VC protocol abstractions
│   ├── src/                     # TypeScript source
│   ├── c-headers/               # C header files for ESP32
│   └── package.json             # Protocol package definition
├── react-native-udp-direct/     # Custom UDP native module
│   ├── cpp/                     # C++ implementation
│   ├── ios/                     # iOS native code
│   └── src/                     # JavaScript bindings
├── one.core.expo/               # Core ONE platform (Expo variant)
│   ├── src/
│   │   ├── system/
│   │   │   ├── esp32/          # ESP32 integration
│   │   │   │   └── esp32-quicvc-project/  # ESP32 QUIC firmware
│   │   │   └── [other system code]
│   │   └── [core libraries]
│   └── package.json
├── one.models/                  # ONE platform models/recipes
├── one.btle/                    # Bluetooth Low Energy module
├── one.audit/                   # Audit logging
├── one.vc/                      # Verifiable Credentials
├── refinio.api/                 # Instance-based API server (Node.js)
│   ├── src/                     # TypeScript source
│   ├── handlers/                # Request handlers
│   └── package.json
├── refinio.cli/                 # CLI client for ONE platform
│   ├── src/                     # TypeScript source
│   ├── commands/                # CLI subcommands
│   └── package.json
└── [other packages]
```

---

## 2. CORE ARCHITECTURAL PATTERNS

### 2.1 Model-Based State Management (StateMachine Pattern)

All major components follow a **three-state lifecycle** based on ONE platform's StateMachine:

```
Uninitialised → Initialising → Initialised
```

**Key Models**:

| Model | Purpose | States | Key Methods |
|-------|---------|--------|-------------|
| **AppModel** | Root orchestrator | Uninitialised, Initialising, Initialised, ShuttingDown | init(), startNetworking() |
| **LeuteModel** | Identity & contacts (from @refinio/one.models) | Uninitialised, Initialising, Initialised | - |
| **ChannelManager** | Message channels (from @refinio/one.models) | Uninitialised, Initialising, Initialised | - |
| **TopicModel** | Chat topics (from @refinio/one.models) | Uninitialised, Initialising, Initialised | - |
| **TransportManager** | Multi-transport coordinator | - | init(), startNetworking() |
| **QuicModel** | QUIC/UDP transport | - | init(), createUdpSocket() |
| **DeviceDiscoveryModel** | P2P device discovery | - | startDiscovery(), stopDiscovery() |
| **DeviceModel** | Device registry & settings | Uninitialised, Initialising, Initialised | init() |
| **LLMManager** | Local LLM lifecycle | - | loadModel(), unloadModel() |
| **OrganisationModel** | Org/dept/room management | Uninitialised, Initialising, Initialised | init() |

**State Checking Hook**:

```typescript
import { useModelState } from '@src/hooks/useModelState';

function MyComponent({ model }) {
  const { isReady, error, isLoading } = useModelState(model, 'ModelName');
  
  if (isLoading) return <LoadingView />;
  if (error) return <ErrorView error={error} />;
  if (!isReady) return null;
  
  return <MainView />;
}
```

### 2.2 Event-Driven Communication (OEvent System)

Models communicate via **OEvent** (from ONE platform):

```typescript
// Define an event
public readonly onUpdated = new OEvent<(data: Data) => void>();

// Listen to event
const unsubscribe = model.onUpdated.listen((data) => {
  // Handle event
});

// Clean up
unsubscribe();
```

**Common Events**:
- `onUpdated` - Model data changed
- `onReady` - Model finished initialization
- `onStateChange` - Model state transitioned
- `onTransportRegistered` - Transport layer event
- `onMessagesUpdated` - New messages received

### 2.3 Context-Based Access Pattern

All components access the root model via **OneContext**:

```typescript
import { OneContext } from '@src/providers/app/OneProvider';

function MyComponent() {
  const context = useContext(OneContext);
  if (!context) throw new Error('Must be inside OneProvider');
  
  const { model, initialized } = context;
  return <View>{initialized ? <Content /> : <Loading />}</View>;
}

// Convenience hook
import { useAppModel } from '@src/hooks/useAppModel';
const appModel = useAppModel();
```

---

## 3. NETWORK ARCHITECTURE

### 3.1 Transport Layer (TransportManager)

Manages multiple transport types in a pluggable architecture:

```
TransportManager
├── CommServerManager         # WebSocket relay server
├── QuicModel                 # QUIC/UDP direct transport
├── UDPDirectModule          # Native UDP implementation
├── DeviceDiscoveryModel      # Bonjour/mDNS discovery
└── [Future: BLE, etc.]
```

**Key Concept**: Each transport is independent, but TransportManager coordinates:
- Connection routing based on availability
- Fallback logic (prefer direct P2P, fallback to relay)
- Event propagation across all transports

### 3.2 Connection Flow (Pairing)

```
1. Create spare connections to CommServer
   ↓
2. Generate invitation URLs with pairing tokens
   ↓
3. Exchange QR codes or links
   ↓
4. Connection handover from relay → direct P2P
   ↓
5. Encrypted key exchange (TweetsNaCl)
   ↓
6. Trust establishment (add to contacts)
   ↓
7. CHUM protocol for message sync
```

**Key Files**:
- `src/models/network/DeviceDiscoveryModel.ts` - Bonjour discovery (125KB!)
- `src/models/contacts/InviteManager.ts` - Invitation generation
- `src/models/network/connections/` - Connection state machines

### 3.3 Protocol Layers

| Layer | Technology | Purpose | Files |
|-------|-----------|---------|-------|
| **Transport** | WebSocket, QUIC, UDP | Raw data transmission | TransportManager, QuicModel, UdpModel |
| **Sync** | CHUM | Message/state synchronization | ChannelManager (from one.models) |
| **Discovery** | mDNS/Bonjour | Find peers on local network | DeviceDiscoveryModel |
| **Crypto** | TweetsNaCl, Curve25519 | Encryption & signing | one.core (crypto-helpers) |
| **Identity** | Verifiable Credentials | Prove identity | one.core (recipes) |

### 3.4 Device Discovery Protocol

**Broadcast Discovery** (DeviceDiscoveryModel):
1. Advertise device via Bonjour with device ID and metadata
2. Listen for other devices' advertisements
3. Collect device info (ID, name, capabilities)
4. Filter by criteria (online, trusted, nearby)

**Connection Establishment**:
1. Discover device via mDNS
2. Establish WebSocket to device's advertised endpoint
3. Exchange identity information
4. Establish direct UDP connection if possible
5. Store device in DeviceModel

---

## 4. INITIALIZATION SEQUENCE

### 4.1 Three-Phase Initialization

**Phase 1: Platform Setup** (`createInstance()` in one.core)
- Load native modules (UDP, crypto)
- Optimize crypto via parallel initialization
- Initialize QUIC transport
- Set up storage (ONE.core file-based)

**Phase 2: Authentication** (`MultiUser.login()`)
- Prompt for username/password or registration
- Create ONE instance (encrypted local storage)
- Verify identity
- Unlock user storage

**Phase 3: Model Creation** (`initModelAfterLogin()`)
- Initialize LeuteModel (identity/contacts)
- Initialize ChannelManager (message channels)
- Initialize child models in parallel:
  - TransportManager → CommServerManager
  - DeviceDiscoveryModel (singleton)
  - DeviceModel
  - TopicModel (from ChannelManager)
  - LLMManager (async, doesn't block)
  - OrganisationModel
- Create system topics (Everyone, Glue, AI Subjects)
- Start networking (commServer connection, device discovery)

**Code**:

```typescript
// src/initialization/index.ts
export async function initModelAfterLogin() {
  const appModel = new AppModel({
    leuteModel,
    channelManager,
    transportManager,
    authenticator,
    leuteAccessRightsManager,
  });
  
  await appModel.init(); // Runs Phase 3 internally
  await appModel.startNetworking();
  return appModel;
}
```

### 4.2 Parallel Initialization Optimization

```typescript
// src/initialization/parallelInit.ts
const [channelManager, groupResults] = await Promise.all([
  measureTime('ChannelManager init', async () => {...}),
  measureTime('Group creation', async () => {...})
]);

const [transportManager, leuteAccessRightsManager] = await Promise.all([
  measureTime('TransportManager.init', async () => {...}),
  measureTime('LeuteAccessRightsManager.init', async () => {...})
]);
```

### 4.3 Hot Reload Support

When Expo detects hot reload (development):

```typescript
if (global.HOT_RELOAD_DETECTED) {
  // Reset singletons to prevent stale state
  await DeviceDiscoveryModel.resetInstance();
  await QuicModel.resetInstance();
  await UdpModel.resetInstance();
}
global.HOT_RELOAD_DETECTED = true;
```

---

## 5. CRITICAL MODELS & THEIR ROLES

### 5.1 AppModel (Root Orchestrator)

**Location**: `src/models/AppModel.ts`

**Responsibilities**:
- Hold references to all major models
- Coordinate initialization sequence
- Manage network startup
- Provide centralized access point

**Key Properties**:
```typescript
export class AppModel extends StateMachine<AppModelState, AppModelEvent> {
  // Core models
  leuteModel: LeuteModel;                    // Identity & contacts
  topicModel: TopicModel;                    // Chat topics
  channelManager: ChannelManager;            // Message channels
  journalModel: JournalModel;                // Event journal
  notifications: Notifications;               // Notification system
  
  // Network
  transportManager: TransportManager;        // Multi-transport
  deviceDiscoveryModel?: DeviceDiscoveryModel; // P2P discovery
  deviceModel?: DeviceModel;                 // Device registry
  
  // AI
  llmManager?: LLMManager;                   // Local LLM
  
  // Access control
  leuteAccessRightsManager: any;             // Permission management
}
```

### 5.2 TransportManager (Network Coordinator)

**Location**: `src/models/network/TransportManager.ts`

**Design**: Simple container that holds transport implementations

**Key Methods**:
- `init()` - Initialize CommServerManager
- `startNetworking()` - Start WebSocket connection to relay
- `registerTransport(transport)` - Add new transport type
- `getTransportForTarget(target)` - Select best transport

**Transports**:
1. **CommServerManager** (WebSocket relay) - Always available, used for fallback
2. **QuicModel** (QUIC/UDP) - Direct P2P, preferred when available
3. **Future**: BLE, HTTP, etc.

### 5.3 QuicModel (QUIC/UDP Transport)

**Location**: `src/models/network/QuicModel.ts`

**Responsibilities**:
- Manage UDP sockets for QUIC protocol
- Handle packet send/receive
- Coordinate with DeviceDiscoveryModel
- Provide socket factory for other components

**Key Methods**:
```typescript
async createUdpSocket(options: UdpSocketOptions): Promise<UdpSocket>
async init(): Promise<void>
static getInstance(): QuicModel
static async resetInstance(): Promise<void>
```

**Service Types** (enum):
- `DISCOVERY` (1) - Device discovery packets
- `CREDENTIAL` (2) - Identity exchange
- `DATA` (3) - Regular data/messages
- `FILE_TRANSFER` (4) - File sharing
- `CONTROL` (5) - Protocol control

### 5.4 DeviceDiscoveryModel (P2P Discovery)

**Location**: `src/models/network/DeviceDiscoveryModel.ts` (125KB!)

**Responsibilities**:
- Advertise local device via Bonjour
- Discover remote devices via mDNS
- Maintain discovery state and device list
- Filter devices by criteria
- Singleton - survives hot reload

**Key Methods**:
```typescript
startDiscovery(): Promise<void>
stopDiscovery(): Promise<void>
getDiscoveredDevices(): DiscoveryDevice[]
getDeviceInfo(deviceId: string): RuntimeDevice | null
```

**Bonjour Service Type**: `_uvc-discovery._tcp` (DNS-SD)

### 5.5 DeviceModel (Device Registry)

**Location**: `src/models/device/DeviceModel.ts`

**Responsibilities**:
- Store device definitions (ONE objects)
- Manage device settings
- Handle device ownership and credentials
- Synchronize with discovery state

**Key Concepts**:
- Uses ONE.core object storage for persistence
- Combines stored Device objects with runtime discovery state
- Manages DeviceOwnershipLicense credentials
- Maps discovered devices to stored device records

### 5.6 LLMManager (AI Integration)

**Location**: `src/models/ai/LLMManager.ts`

**Responsibilities**:
- Load/unload LLM models from filesystem
- Manage model versions and settings
- Interface with llama.rn (native module)
- Store LLM objects as versioned ONE objects
- Store LLMSettings as runtime state

**Key Distinction**:
- **LLM objects** - Versioned ONE objects, stable identity
- **LLMSettings** - Runtime state (isLoaded, etc.)

**Key Methods**:
```typescript
async loadModel(modelIdHash: SHA256IdHash): Promise<void>
async unloadModel(modelIdHash: SHA256IdHash): Promise<void>
async listAvailableModels(): Promise<LLM[]>
```

---

## 6. BUILD SYSTEM & NATIVE INTEGRATION

### 6.1 Expo/React Native Configuration

**Key Files**:
- `app.json` - Expo app config (permissions, icons, schemes)
- `expo.config.ts` (if using dynamic config)
- `eas.json` (EAS build config, if using EAS)

**Plugins** (in app.json):
```json
"plugins": [
  "expo-router",                    // File-based routing
  "./plugins/withUVCConfig",        // Custom UVC settings
  "./plugins/withBLEPermissions",   // Bluetooth permissions
  "./plugins/withUDPModuleFix",     // UDP module integration
  ["expo-build-properties", {...}], // Native build settings
  "expo-image-picker",
  "expo-localization"
]
```

**Native Architecture Enabled**:
- iOS: `newArchEnabled: true`, Hermes engine
- Android: `newArchEnabled: true`, compileSdkVersion: 34

### 6.2 Native Modules

| Module | Purpose | Type | Location |
|--------|---------|------|----------|
| **react-native-udp-direct** | Direct UDP socket access | Custom C++/JavaScript | `packages/react-native-udp-direct/` |
| **llama.rn** | On-device LLM inference | npm package | Uses JSI bridge |
| **react-native-ble-plx** | Bluetooth Low Energy | npm package | For device discovery (BLE variant) |
| **expo-crypto** | Cryptographic functions | Expo module | Built-in |
| **Bonjour** | mDNS discovery | Native iOS/Android | Via react-native-zeroconf or custom |

### 6.3 Module Resolution

**Babel Configuration** (babel.config.js):

```javascript
plugins: [
  [
    'module-resolver',
    {
      root: ['.', '..'],
      alias: {
        '@app': './app',
        '@src': './src',
        '@': './src',
        'llama.rn': './node_modules/llama.rn',
        'react-native': './node_modules/react-native'
      }
    }
  ]
]
```

**Usage**:
```typescript
import { Component } from '@src/components/Component';
import { useAppModel } from '@src/hooks/useAppModel';
import { AppModel } from '@app/(tabs)/home';
```

### 6.4 Metro Bundler Configuration

**metro.config.js**:
```javascript
resolver: {
  unstable_enablePackageExports: false,
  unstable_enableSymlinks: false,
  extraNodeModules: {
    buffer: require.resolve('buffer'), // Buffer polyfill
  },
  alias: {
    '@': path.resolve(__dirname, 'src'),
    '@src': path.resolve(__dirname, 'src'),
    '@app': path.resolve(__dirname, 'app'),
  },
}
```

### 6.5 Build Commands

```bash
# Development
npm start                    # Start Expo dev server
npm run android             # Run on Android emulator/device
npm run ios                 # Run on iOS simulator/device
npm run simulator           # Run on iPhone 15 simulator

# Production
npm run prebuild:clean      # Clean native prebuild (must run before native changes)
npm run build:ios           # Build for iOS (calls expo run:ios)
npm run build:android       # Build for Android (calls expo run:android)

# Testing
npm test                    # Jest watch mode
npm run test:watch          # Same as npm test
npm run test:coverage       # With coverage report

# Native modules
npm run pod-install         # Install iOS pods
npm run setup-modules       # Setup native modules (llama.rn setup)
npm run clean              # Clean build artifacts
```

---

## 7. ONE PLATFORM INTEGRATION

### 7.1 Object Relationship Patterns

The ONE platform uses a three-tier object model:

```typescript
// 1. Person - Core identity
const person = await Person.create({ name: 'Alice' });
const personIdHash = calculateIdHashOfObj(person);

// 2. Profile - Contact information
const profile = await ProfileModel.constructWithNewProfile(
  personIdHash,
  personIdHash,
  'default',
  [oneInstanceEndpoint],
  [signKey]
);

// 3. Someone - Comprehensive representation
const someone = await SomeoneModel.constructWithNewSomeone(person);
await leuteModel.addSomeoneElse(someone.idHash);
```

### 7.2 Object Storage & Recipes

**Versioned Objects** (have identity that persists across versions):
```typescript
// Store versioned object
const result = await storeVersionedObject({
  $type$: 'MyType',
  field1: 'value1',
  field2: 'value2'
});
// result.idHash - stable across versions
// result.hash - content hash of this specific version
```

**Unversioned Objects** (immutable):
```typescript
const result = await storeUnversionedObject({
  $type$: 'MyType',
  data: 'immutable'
});
// result.hash - content addressing
```

**Recipe System**:
- Recipes define data structure
- Every ONE object has `$type$` field
- Recipes are self-describing (Recipe objects define Recipe structure)
- Register recipes during initialization

### 7.3 Message Channels (CHUM)

Communication uses **CHUM** (from one.models) - a real-time sync protocol:

```typescript
// Create channel
const channelInfo = await channelManager.createChannelAsOwner(...);
const channelId = channelInfo.channelId;

// Send message
await channelManager.sendMessage(
  channelId,
  { $type$: 'Message', text: 'Hello' }
);

// Listen for messages
channelManager.onUpdated.listen((channelInfoIdHash, channelId, owner, timeOfChange) => {
  const messages = channelManager.getMessagesByChannelId(channelId);
  // Handle new messages
});
```

### 7.4 Instance Architecture

ONE uses a **local instance model**:
- Each user has a local ONE instance (encrypted storage)
- Instance creation: `createInstance(userId, password)`
- Instance retrieval: `getInstanceIdHash()`
- Instance closure: `closeAndDeleteCurrentInstance()`
- Storage is user-specific and encrypted

---

## 8. TESTING STRATEGY

### 8.1 Jest Configuration

**jest.config.js**:
```javascript
{
  preset: 'jest-expo',
  transformIgnorePatterns: [
    // Complex pattern to handle node_modules
  ],
  setupFiles: ['<rootDir>/jest.setup.js'],
  collectCoverage: true,
  moduleNameMapper: {
    '^react-native$': 'react-native-web',
  }
}
```

### 8.2 Test Organization

```
src/
├── __tests__/              # Component tests
├── components/__tests__/   # Co-located component tests
└── models/__tests__/       # Model tests (if present)
```

### 8.3 Running Tests

```bash
npm test                    # Watch mode
npm run test:coverage       # Generate coverage report
```

### 8.4 Coverage Exclusions

- `/coverage/` - Coverage results
- `/node_modules/` - Dependencies
- `/babel.config.js` - Config
- `/jest.setup.js` - Setup
- `/tmp/` - Temporary files

---

## 9. ESP32 INTEGRATION

### 9.1 ESP32 Firmware Project

**Location**: `packages/one.core.expo/src/system/esp32/esp32-quicvc-project/`

**Subdirectories**:
- `esp32-variants/` - Device-specific firmware variants
- Documentation: `esp32.md`, `README.md`, `mcp.md`
- Build/flash scripts: `build_and_flash.sh`, `monitor_*.sh`
- Configuration: `sdkconfig`

### 9.2 Protocol Support

- QUIC transport with Verifiable Credentials (QUICVC)
- mDNS/Bonjour advertisement
- P2P discovery

### 9.3 MCP (Model Context Protocol) Support

Documentation in `mcp.md` - ESP32 can expose tools/resources via MCP

---

## 10. CRITICAL CONCEPTS & PATTERNS

### 10.1 The "Rule": Fail Fast, Don't Mitigate

From `/Users/gecko/.claude/CLAUDE.md`:
- No fallbacks - fail fast and throw
- No delays - they're for "arseholes"
- Don't mitigate before understanding
- Always fix the root cause

**Example**:
```typescript
// CORRECT
if (!model) throw new Error('Model not available');

// WRONG
if (!model) {
  console.warn('Model not available, using default');
  return defaultValue; // MITIGATION!
}
```

### 10.2 No Claude Attribution in Git

Never add `🧠 Generated with Claude` or similar in git commits. The CLAUDE.md file exists for project guidance only.

### 10.3 Type Safety with Branded Strings

SHA256Hash and SHA256IdHash are branded string types for type safety:

```typescript
type SHA256Hash = string & { readonly __tag: 'SHA256Hash' };
type SHA256IdHash<T = any> = string & { readonly __tag: 'SHA256IdHash<' & T & '>' };

// Use from one.core
import { calculateIdHashOfObj } from '@refinio/one.core/lib/util/object.js';
const idHash: SHA256IdHash<MyType> = calculateIdHashOfObj(obj);
```

### 10.4 Model State vs Runtime State

**Model State** = Identity-defining properties (stored in ONE objects)
**Runtime State** = Transient properties (keep separate)

**Example** (from LLMManager):
```typescript
// CORRECT - Separate concerns
interface LLM extends OneVersionedObject {
  name: string;
  version: string;
  // Identity-defining properties only
}

interface LLMSettings {
  isLoaded: boolean;  // Runtime state
  loadedAt: number;
  modelPath: string;
}

// WRONG - Runtime state in ONE object
interface LLM extends OneVersionedObject {
  name: string;
  isLoaded: boolean; // DON'T DO THIS
}
```

### 10.5 Using one.leute Reference Implementation

`one.leute/` (the reference web implementation) is extremely valuable:
- `src/hooks/` - Hook patterns for React
- `src/model/` - Model usage examples
- `src/root/chat/` - Chat implementation reference
- `src/components/` - Component patterns

**Always check one.leute before creating new features.**

### 10.6 Logging Standards

```typescript
import { getLogger } from '@src/utils/logger';
const log = getLogger('ComponentName');

log.info('Normal operation');
log.warn('Something unexpected');
log.error('Fatal error', error);

// For performance
log('[PERF] Operation took 123ms');

// For network events
log('[NETWORK] Connection established');
```

---

## 11. KEY DEVELOPMENT WORKFLOWS

### 11.1 Adding a New Feature

1. **Create model** in `src/models/[feature]/[FeatureModel].ts`
   - Extend StateMachine if state management needed
   - Implement init() method
   - Add OEvent for updates
   
2. **Create hooks** in `src/hooks/[feature]/use[Feature].ts`
   - Use useModelState() for state tracking
   - Export convenience hook
   
3. **Create components** in `src/components/[feature]/`
   - Use context hooks for model access
   - Handle loading/error states
   
4. **Add to AppModel** in `src/models/AppModel.ts`
   - Add property declaration
   - Initialize in init() or as lazy property
   - Call init() if needed
   
5. **Create route** in `app/(screens)/[feature]/`
   - Use Expo Router syntax
   - Access model via OneProvider

### 11.2 Debugging Network Issues

Enable focused debugging:
```typescript
import { enableFocusedConnectionDebugging } from '@src/initialization';
enableFocusedConnectionDebugging();

// For invitations only
import { enableInvitationDebugging } from '@src/initialization';
enableInvitationDebugging();
```

Check logs with keywords:
- `[NETWORK]` - Network events
- `[PERF]` - Performance metrics
- `[ONE_CORE]` - Core platform events
- Device discovery: Check DeviceDiscoveryModel state

### 11.3 Debugging Model State

```typescript
// In component
const { isReady, error, isLoading } = useModelState(model, 'ModelName');
console.log(`Model state: ready=${isReady}, error=${error}, loading=${isLoading}`);

// Or directly
console.log(`Current state: ${model.currentState}`);
model.onStateChange.listen((event, newState) => {
  console.log(`State changed to: ${newState}`);
});
```

---

## 12. COMMON COMMANDS & SCRIPTS

### 12.1 Development

```bash
npm start                    # Start dev server (choose platform when prompted)
npm run simulator            # iOS simulator specifically
npm run android              # Android emulator
npm run web                  # Web version (limited)
npm run android-debug        # Android with console
npm run ios-debug            # iOS with console
```

### 12.2 Building

```bash
npm run prebuild:clean       # MUST run after native module changes
npm run prebuild             # Update native code without cleaning
npm run pod-install          # iOS pods
npm run clean                # Clean build artifacts
npm run build:ios            # Production iOS build
npm run build:android        # Production Android build
```

### 12.3 Testing

```bash
npm test                     # Jest watch mode
npm run test:watch           # Same
npm run test:coverage        # Coverage report
```

### 12.4 Maintenance

```bash
npm run setup-modules        # Setup native modules (llama.rn)
npm run cleanup-llama        # Llama cleanup (see docs)
npm run setup-llama          # Setup llama specifically
npm install                  # Install dependencies
npm run postinstall          # Run postinstall (patch-package, fix scripts)
```

---

## 13. IMPORTANT FILES QUICK REFERENCE

| File | Purpose |
|------|---------|
| `src/models/AppModel.ts` | Root model orchestrator |
| `src/models/network/TransportManager.ts` | Multi-transport coordinator |
| `src/models/network/QuicModel.ts` | QUIC/UDP transport |
| `src/models/network/DeviceDiscoveryModel.ts` | P2P discovery (125KB) |
| `src/models/device/DeviceModel.ts` | Device registry |
| `src/models/ai/LLMManager.ts` | LLM lifecycle |
| `src/initialization/index.ts` | Main init entry point |
| `src/initialization/parallelInit.ts` | Parallel init optimizations |
| `src/providers/app/OneProvider.tsx` | Main React context provider |
| `src/hooks/useModelState.ts` | Model state hook |
| `src/hooks/useAppModel.ts` | AppModel access hook |
| `babel.config.js` | Module resolution aliases |
| `metro.config.js` | Bundler configuration |
| `app.json` | Expo configuration |
| `package.json` | Root manifest & scripts |

---

## 14. ARCHITECTURE SUMMARY DIAGRAM

```
┌─────────────────────────────────────────────────────────────┐
│                    React Native / Expo                      │
│              (iOS, Android, Web via Hermes)                 │
└──────────┬────────────────────────────────────┬─────────────┘
           │                                    │
           ▼                                    ▼
┌────────────────────────┐        ┌─────────────────────────┐
│   App Screens          │        │   Component Library     │
│ (Expo Router)          │        │  (@src/components/)     │
│ • (tabs)               │        │  • Chat UI              │
│ • (auth)               │        │  • Contact UI           │
│ • (screens)            │        │  • Device UI            │
└────────┬───────────────┘        └──────────┬──────────────┘
         │                                   │
         └───────────────┬───────────────────┘
                         ▼
            ┌────────────────────────────┐
            │   OneProvider              │
            │  (React Context)           │
            └────────────┬───────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                     AppModel                                │
│  Root orchestrator for all domain models                   │
├─────────────────────────────────────────────────────────────┤
│ ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐ │
│ │ Core Models      │  │ Network Stack    │  │ AI/Utils   │ │
│ │                  │  │                  │  │            │ │
│ │ • LeuteModel     │  │ • TransportMgr   │  │ • LLMmgr   │ │
│ │ • ChannelManager │  │ • QuicModel      │  │ • Settings │ │
│ │ • TopicModel     │  │ • DeviceDiscov   │  │ • Org      │ │
│ │ • JournalModel   │  │ • DeviceModel    │  │            │ │
│ │ • Notifications  │  │                  │  │            │ │
│ └──────────────────┘  └──────────────────┘  └────────────┘ │
└────────┬──────────────────────────────┬───────────────────┬─┘
         │                              │                   │
         ▼                              ▼                   ▼
    ┌─────────────┐            ┌──────────────┐      ┌─────────┐
    │ ONE.core    │            │ ONE.models   │      │ Recipes │
    │ • Crypto    │            │ • Leute      │      │ • Device│
    │ • Storage   │            │ • Channel    │      │ • LLM   │
    │ • Instance  │            │ • Topic      │      │ • Org   │
    └─────────────┘            └──────────────┘      └─────────┘
         │                              │
         └──────────────┬───────────────┘
                        ▼
    ┌─────────────────────────────────┐
    │    ONE Platform (Core Layer)    │
    │  • Message Bus                  │
    │  • Storage (versioned/unversioned)
    │  • CHUM (real-time sync)        │
    └─────────────────────────────────┘
         │              │              │
         ▼              ▼              ▼
  ┌─────────────┐ ┌──────────┐ ┌──────────────┐
  │  Crypto &   │ │ FileSystem│ │ Native Modules
  │  Keychain   │ │ Storage   │ │ • UDP/QUIC
  │ (TweetNaCl) │ │(Expo-fs)  │ │ • Bonjour
  └─────────────┘ └──────────┘ │ • llama.rn
                                │ • BLE
                                └──────────────┘
```

---

## 15. DESIGN DECISIONS & RATIONALES

### Why StateMachine for all models?

- **Explicit state management** - Know when models are ready
- **Prevents operations on uninitialized state** - Fail fast
- **Clear initialization ordering** - Dependency resolution
- **Event-driven coordination** - Loose coupling

### Why separate TransportManager from transport implementations?

- **Pluggable architecture** - Add WebSocket, BLE, HTTP without changes
- **Fallback logic** - Prefer direct P2P, fallback to relay
- **Clean separation** - Network abstraction
- **Future-proof** - Easy to add new transports

### Why parallel initialization?

- **Performance** - Faster app startup
- **Non-blocking** - Responsive UI during init
- **Dependency awareness** - Only parallelize independent operations
- **Measurement** - Track what's slow

### Why THREE-tier object model (Person/Profile/Someone)?

- **Person** - Core identity that never changes
- **Profile** - Contact info that can be updated
- **Someone** - Composite with all information for UI
- **Separation** - Identity != contact info

---

## 16. PERFORMANCE OPTIMIZATIONS

### 16.1 Crypto Optimization

```typescript
// src/initialization/parallelInit.ts
// Crypto operations run in parallel, not sequential
const [leuteModel] = await Promise.all([
  LeuteModel.init(),
  // Other parallel operations...
]);
```

### 16.2 Lazy Loading

- LLMManager loads on demand
- Models initialized after authentication
- Heavy models (DeviceDiscoveryModel) are singletons

### 16.3 Hot Reload Handling

Singletons reset on hot reload to prevent stale state:
```typescript
if (global.HOT_RELOAD_DETECTED) {
  await DeviceDiscoveryModel.resetInstance();
  await QuicModel.resetInstance();
}
```

---

## 17. MONOREPO PACKAGE DETAILS

### 17.1 quicvc-protocol

Protocol definitions for QUIC with Verifiable Credentials
- C headers for ESP32
- TypeScript type definitions
- No runtime code (pure types)

### 17.2 react-native-udp-direct

Custom UDP native module for direct socket access
- C++ implementation
- iOS/Android support
- JSI bridge to JavaScript

### 17.3 one.core.expo

Extended ONE platform for Expo/React Native
- ESP32 firmware project
- Platform-specific storage
- Crypto helpers for React Native

### 17.4 refinio.api (Node.js API Server)

Standalone API server for ONE platform
- Instance-based (each user has instance)
- QUICVC transport
- Handler architecture (Object, Profile, Recipe)

### 17.5 refinio.cli (Node.js CLI Client)

Command-line client for ONE platform
- Multi-instance support
- Profile-aware (shortcuts)
- Full CRUD operations

---

This comprehensive summary captures the entire architecture of the uvc.one project. Use this as a reference guide for understanding how all components fit together and when to dive deeper into specific areas.

