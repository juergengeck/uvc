# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CRITICAL RULES

**NEVER WORK IN OR REFERENCE `/Users/gecko/src/flexibel.electron`**

This project is `/Users/gecko/src/uvc`. All code is here. ESP32 code is at `packages/one.core.expo/src/system/esp32/esp32-quicvc-project/`.

## Project Identity

**uvc.one** - A secure, local-first messaging application built on the ONE platform. P2P communication with end-to-end encryption, local AI processing, and cross-device sync without cloud dependencies.

## Essential Commands

### Development & Build
```bash
# Start development server
npm start                    # Start Expo development server
npm run android             # Run on Android device/emulator
npm run ios                 # Run on iOS device/simulator

# Build for production
npm run build:ios           # Clean prebuild and run iOS
npm run build:android       # Clean prebuild and run Android
npm run simulator           # Run on iPhone 15 simulator

# Project setup
npm install                 # Install dependencies
npm run setup-modules       # Setup native modules (llama.rn)
npm run prebuild:clean      # Clean prebuild with modules setup
```

### Testing
```bash
npm test                    # Run Jest tests in watch mode
npm run test:watch          # Run Jest tests with file watching
npm run test:coverage       # Run tests with coverage report
```

### Native Module Development
```bash
npm run setup-llama         # Setup llama.rn native module
npm run pod-install         # Install iOS pods
npm run clean               # Clean build artifacts
```

## Architecture Overview

### Local-First React Native App on ONE Platform
This is a **secure, local-first messaging application** built on the **ONE platform** with the following key characteristics:

- **End-to-end encryption** with cryptographic identity management
- **P2P communication** via WebSocket relay and direct UDP connections
- **Local AI processing** with llama.rn integration
- **Cross-device synchronization** without cloud dependencies
- **Expo/React Native** with extensive native module integration

### Core Architecture Patterns

#### 1. Model-Based State Management
The app uses a sophisticated **StateMachine-based model hierarchy** extending from ONE platform:

```
AppModel (root orchestrator)
├── LeuteModel (identity/contacts)
├── ChannelManager (communication)
├── TopicModel (chat/messaging)
├── TransportManager (networking)
├── QuicModel (UDP/QUIC transport)
├── LLMManager (AI processing)
└── SettingsModel (configuration)
```

**Key Rules:**
- Models have 3 states: `Uninitialised` → `Initialising` → `Initialised`
- Always check model state before operations using `useModelState` hook
- Use event-driven communication via `OEvent` system
- Access models through React Context providers

#### 2. Network Architecture
Multi-transport P2P networking:

```typescript
TransportManager
├── CommServerManager (WebSocket relay)
├── QuicModel (QUIC transport)
├── UDPDirectModule (native UDP)
└── ConnectionsModel (device pairing)
```

**Pairing Flow:**
1. Create spare connections to CommServer
2. Generate invitation URLs with pairing tokens
3. Connection handover from relay to direct P2P
4. Encrypted key exchange and trust establishment
5. CHUM protocol for ongoing message sync

#### 3. ONE Platform Integration
Built on Refinio's ONE platform with local dependencies:

- `@refinio/one.core` - Core recipes, crypto, storage
- `@refinio/one.models` - Domain models and business logic
- `one.leute/` - **Reference web app implementation** (React/TypeScript)

**Reference Implementation:**
The `one.leute/` directory contains the reference web implementation of the same functionality. This is **extremely valuable** for understanding:

- Component architecture and patterns in `src/components/`
- Model usage examples in `src/model/` and `src/hooks/`
- Chat implementation in `src/root/chat/`
- Authentication flows in `src/root/contacts/` and onboarding components
- Network and connection handling patterns
- UI/UX patterns for messaging, contacts, and settings

**Key Reference Files:**
- `src/model/Model.ts` - Main model orchestrator (similar to AppModel)
- `src/hooks/chat/topicHooks.ts` - Chat functionality hooks
- `src/hooks/contact/` - Contact management patterns
- `src/root/chat/` - Complete chat implementation
- `src/components/` - Reusable UI components

**Import Patterns:**
```typescript
// Prefer ONE platform imports
import { Person, Profile } from '@refinio/one.core';
import { LeuteModel } from '@refinio/one.models';

// Use model-based access
const appModel = useAppModel();
const socket = appModel.createUdpSocket({ type: 'udp4' });
```

## Project Structure

### Monorepo Architecture
This is a **monorepo** containing multiple packages. The main React Native app is at the root, with additional packages in `packages/`:

```
app/                        # Expo Router screens
├── (auth)/                # Authentication flows
├── (screens)/             # Main app screens
├── (tabs)/                # Tab navigation
└── _layout.tsx           # Root layout

src/
├── components/           # React components
├── models/              # Domain models
│   ├── network/         # Network models (TransportManager, QuicModel, DeviceDiscovery)
│   ├── ai/              # AI models (LLMManager, AIAssistant)
│   └── contacts/        # Contact management (InviteManager)
├── hooks/               # Custom React hooks
├── providers/           # Context providers
├── services/            # Business logic
├── utils/               # Utilities
├── initialization/      # App initialization (parallel init, crypto optimization)
└── platform/           # Platform-specific code

packages/
├── quicvc-protocol/     # Protocol definitions for QUIC-VC
├── react-native-udp-direct/  # Native UDP module
├── one.core.expo/       # Core platform with ESP32 firmware
├── one.models/          # ONE platform models
├── one.btle/           # Bluetooth Low Energy support
├── one.vc/             # Verifiable credentials
├── one.audit/          # Audit logging
├── refinio.api/        # Node.js API server (ESM, uses QUICVC transport)
└── refinio.cli/        # Node.js CLI client

vendor/                  # Local ONE platform dependencies (tarballs)
└── [one.core, one.models, one.btle tarballs]
```

### Key Packages

**refinio.api** - Instance-based API server for ONE platform
- Uses QUIC with verifiable credentials (QUICVC) for transport
- Provides CRUD operations for ONE objects
- ESM modules (`"type": "module"`)
- See `packages/refinio.api/CLAUDE.md` for detailed docs
- Commands: `npm run build`, `npm start`, `npm run dev`

**one.core.expo** - Contains ESP32 firmware
- ESP32 code location: `packages/one.core.expo/src/system/esp32/esp32-quicvc-project/`
- QUICVC protocol implementation for embedded devices

### Critical Files
- [src/initialization/index.ts](src/initialization/index.ts) - App initialization sequence
- [src/initialization/parallelInit.ts](src/initialization/parallelInit.ts) - Parallel initialization optimizations
- [src/models/AppModel.ts](src/models/AppModel.ts) - Root model orchestrator
- [src/models/network/TransportManager.ts](src/models/network/TransportManager.ts) - Multi-transport coordination
- [src/models/network/QuicModel.ts](src/models/network/QuicModel.ts) - QUIC/UDP transport
- [src/models/network/DeviceDiscoveryModel.ts](src/models/network/DeviceDiscoveryModel.ts) - P2P device discovery
- [src/providers/app/OneProvider.tsx](src/providers/app/OneProvider.tsx) - Main ONE platform provider
- [src/utils/appJournal.ts](src/utils/appJournal.ts) - Application event journal
- [babel.config.js](babel.config.js) - Module resolution and aliases
- [package.json](package.json) - Dependencies and scripts

## Development Guidelines

### Core Principles (from .cursorrules)

**Fail Fast Philosophy:**
- No fallbacks, no mitigation, no delays
- Throw immediately when problems occur
- Fix root causes, don't hide failures
- Work in a controlled environment - fail fast so we can fix properly
- Defensive programming is adverse to code quality

**Use What Exists:**
- Prefer ONE.core and ONE.models over custom implementations
- Check `one.leute/` reference implementation before creating new features
- Read source code in `one.core/src/recipes.ts`, `one.core/src/instance.ts`, `one.core/src/util/object.ts`
- Avoid redundant implementations - search thoroughly first

**No Assumptions:**
- Investigate thoroughly before implementing
- Don't make assumptions about how things work
- Look at actual file locations before assuming import paths
- Verify data integrity after operations

**Expo Prebuild Protection:**
- **NEVER** directly edit `ios/` or `android/` folders (ephemeral, regenerated)
- Modify config plugins in `plugins/` directory instead
- Use Expo's Config Plugin system for native customizations

### Model State Management
Always use the `useModelState` hook for models:

```typescript
import { useModelState } from '@src/hooks/useModelState';

function MyComponent({ model }) {
  const { isReady, error, isLoading } = useModelState(model, 'ModelName');
  
  if (isLoading) return <LoadingView />;
  if (error) return <ErrorView error={error} />;
  if (!isReady) return null;
  
  // Safe to use model operations
  return <MainView />;
}
```

### ONE Platform Object Relationships
Follow correct creation sequence for Person/Profile/Someone objects:

**Critical Understanding:**
- `Person` - UUID and core identity representation
- `Profile` - Contact information and communication details (must include `OneInstanceEndpoint` for proper connection mapping)
- `Someone` - Comprehensive representation of a real person with all their information

**Creation Sequence:**
```typescript
// 1. Check if Person exists first (normal case, not error)
let person = await getPerson(personId).catch(() => null);
if (!person) {
  person = await Person.create(...);
}

// 2. Create Profile with OneInstanceEndpoint (REQUIRED for knownPeerMap)
const oneInstanceEndpoint = {
  $type$: 'OneInstanceEndpoint' as const,
  personId: remotePersonId,
  url: 'wss://commserver.edda.one',
  instanceId: remoteInstanceId,
  instanceKeys: keys[0],
  personKeys: keys[0]
};

const profile = await ProfileModel.constructWithNewProfile(
  personId, localPersonId, 'default',
  [oneInstanceEndpoint],  // MUST include endpoint for proper peer resolution
  [signKey]
);

// 3. Create Someone object
const someone = await SomeoneModel.constructWithNewSomeone(person);

// 4. Add to contacts (takes Someone ID, not Person ID)
await leuteModel.addSomeoneElse(someone.idHash);

// 5. VERIFY data integrity
const retrievedSomeone = await leuteModel.getSomeone(personId);
if (!retrievedSomeone) {
  throw new Error('Failed to retrieve Someone after creation');
}
```

**Common Pitfalls:**
- `addSomeoneElse` only adds ID to contacts list, doesn't create Someone
- Profile MUST include `OneInstanceEndpoint` or `knownPeerMap` won't populate
- Without endpoint, connection shows `remotePersonId: '0'.repeat(64)` instead of actual ID
- Always verify relationships after creation - don't assume they worked
- Handle existing Person as normal case, not error condition

### Native Module Usage
Access UDP and native features through model layer:

```typescript
// Correct: Through AppModel
const socket = await appModel.createUdpSocket({ type: 'udp4' });

// Correct: Through QuicModel
const socket = await quicModel.createUdpSocket({ type: 'udp4' });

// Avoid: Direct native module access
// const socket = UDPModule.createSocket({ type: 'udp4' });
```

### TypeScript with ONE Platform
Handle type mismatches with wrapper adapters (prefer adapters over type assertions):

```typescript
// Event wrapper for type compatibility
const wrappedEvent = {
  listen: (callback: (timeOfEarliestChange: Date) => void) => {
    return channelManager.onUpdated.listen((channelInfoIdHash, channelId, channelOwner, timeOfEarliestChange) => {
      callback(timeOfEarliestChange);
    });
  },
  emit: (timeOfEarliestChange: Date) => {
    console.warn('Unexpected call to emit on wrapper event');
  }
} as OEvent<(timeOfEarliestChange: Date) => void>;

// Property initialization patterns
public modelName!: ModelType;        // Definite assignment - initialized at runtime
private _optional?: OptionalType;    // Optional - may be undefined

// StateMachine with exact state/event literals
state: StateMachine<"Uninitialised" | "Initialised", "shutdown" | "init">
```

**Common TypeScript Issues:**
- Always verify actual file locations in `node_modules/@refinio/` before assuming import paths
- Use wrapper interfaces/adapters rather than excessive type casting
- Add debug logging around model initialization and event handling
- Network models (QuicModel, DeviceDiscoveryModel) are in `./network/` subdirectory

### Using the Reference Implementation
**Always check `one.leute/` for implementation patterns before creating new features:**

```typescript
// 1. Check how similar functionality is implemented in one.leute
// 2. Look at the hook patterns in one.leute/src/hooks/
// 3. Study the model usage in one.leute/src/model/
// 4. Adapt patterns to React Native constraints

// Example: Chat functionality
// Reference: one.leute/src/hooks/chat/topicHooks.ts
// Adaptation: src/hooks/chat/topicHooks.ts with React Native considerations
```

**Common Reference Patterns:**
- **Model initialization** - See `one.leute/src/model/Model.ts`
- **Chat components** - See `one.leute/src/root/chat/`
- **Contact management** - See `one.leute/src/hooks/contact/`
- **Authentication flows** - See `one.leute/src/components/onboarding/`
- **Settings/configuration** - See `one.leute/src/root/settings/`

## Working with Monorepo Packages

### Package Development Commands

**Main App:**
```bash
npm start              # Start Expo dev server
npm test               # Run Jest tests
npm run prebuild:clean # Rebuild native modules (required after native changes)
```

**refinio.api (Node.js API Server):**
```bash
cd packages/refinio.api
npm run build         # Compile TypeScript
npm run dev           # Watch mode
npm start             # Start server (node dist/index.js)
```

**quicvc-protocol:**
```bash
cd packages/quicvc-protocol
npm run build         # Compile TypeScript
npm run watch         # Watch mode
```

**ESP32 Firmware:**
- Location: `packages/one.core.expo/src/system/esp32/esp32-quicvc-project/`
- Uses ESP-IDF build system
- Implements QUICVC protocol for embedded devices

### Package Dependencies
- Main app imports from `@refinio/quicvc-protocol` (protocol definitions)
- `refinio.api` uses ESM modules (`"type": "module"` in package.json)
- All packages import from `@refinio/one.core` and `@refinio/one.models`
- Vendor tarballs in `vendor/` provide local ONE platform dependencies

### Building Vendored Packages
Vendored packages in `vendor/` are built from source packages in `packages/`:
- `packages/one.core.expo/`, `packages/one.models/`, `packages/one.btle/` contain source code
- Build these packages and create tarballs for `vendor/` directory
- Main app installs from `vendor/` tarballs via `file:` references in package.json
- This allows local development and modifications to ONE platform packages

## Common Patterns

### Initialization Sequence
The app follows a strict 3-phase initialization with performance optimizations:

1. **Platform Setup** - Load native modules, crypto optimization, QUIC transport
   - Parallel loading of independent components
   - Key caching for performance
   - Early initialization of critical services
2. **Authentication** - MultiUser login/register
   - ONE instance creation
   - Identity verification
3. **Model Creation** - Initialize domain models in dependency order
   - AppModel → TransportManager → Network models
   - LeuteModel → ChannelManager → TopicModel
   - DeviceModel, DeviceDiscoveryModel, OrganisationModel
   - System topic creation (Everyone, Glue, AI Subjects)

### Error Handling
- Use comprehensive error boundaries
- Implement graceful degradation for network issues
- Log with structured context: `[ComponentName]` prefix
- Distinguish between model state errors and operation errors

### Chat System Integration
The chat system uses ONE's TopicModel with real-time sync:

```typescript
// Message handling
const topicModel = useTopicModel();
const messages = topicModel.getMessages(topicId);

// Real-time updates
useEffect(() => {
  const unsubscribe = topicModel.onMessagesUpdated.listen(handleUpdate);
  return unsubscribe;
}, []);
```

## Build Configuration

### Expo Configuration
- **New Architecture** enabled for iOS and Android
- **Custom plugins** for UDP module integration
- **Dev client** setup for native module development

### Native Dependencies
- **llama.rn** - Local LLM processing
- **UDPDirectModule** - Custom UDP implementation
- **React Native Paper** - UI components
- **Expo Router** - File-based navigation

### Module Resolution
Babel aliases configured for clean imports:
```typescript
import { Component } from '@src/components/Component';
import { useAppModel } from '@src/hooks/useAppModel';
```

## Testing Strategy

### Jest Configuration
- **jest-expo** preset for React Native testing
- **Coverage collection** with exclusions for build artifacts
- **Transform ignore patterns** for node_modules
- **Module name mapping** for web compatibility

### Test Organization
- **Unit tests** for utilities and services
- **Component tests** for React components
- **Integration tests** for model interactions
- **Native module tests** for platform-specific code

## Development Workflow

### Local Development
1. `npm install` - Install dependencies
2. `npm run setup-modules` - Setup native modules
3. `npm start` - Start development server
4. Choose platform (iOS/Android/Web)

### Native Module Development
1. Make changes to native module code
2. `npm run pod-install` - Update iOS pods
3. `npm run prebuild:clean` - Clean rebuild
4. Test on target platform

### Production Build
1. `npm run prebuild:clean` - Clean environment
2. `npm run build:ios` or `npm run build:android`
3. Test on physical devices
4. Deploy through app stores

## Debugging Tips

### Common Issues
- **QUIC transport errors** - Check QuicModel initialization
- **UDP socket failures** - Verify native module setup
- **Model state issues** - Use `useModelState` hook
- **Build failures** - Run `npm run clean` and `npm run prebuild:clean`

### Logging
- **Model events** - Use structured logging with `[ComponentName]` prefix
- **Performance tracking** - Use `[PERF]` prefix with timestamps
- **Network events** - Enable debug logging in NetworkPlugin
- **Native modules** - Check native logs in Xcode/Android Studio
- **App journal** - See [src/utils/appJournal.ts](src/utils/appJournal.ts) for event tracking
- **Debug logger** - See [src/utils/debugLogger.ts](src/utils/debugLogger.ts) for advanced debugging

## Automated Code Review

When conducting automated code reviews, use this direct prompt:

```
# Direct prompt for automated review (no @claude mention needed)
direct_prompt: |
  Please review this pull request and look for bugs and security issues.
  Only report on bugs and potential vulnerabilities you find. Be concise.
```

This prompt ensures focused reviews on critical issues without unnecessary commentary.

## Memories

### Object Relationship Memories
- **Person, Profile, and Someone Object Relationships**:
  - `person` - uuid and core identity representation
  - `profile` - contact information and communication details
  - `someone` - comprehensive representation of a real person with all their information and persona

### LLM Principles
- **We treat LLMs as first-class citizens**
  - Integrated directly into the core architecture
  - Local processing through `LLMManager`
  - First-class support in model hierarchy

### Initialization Sequence Memories
- **understand our init sequence**:
  - `createInstance()` - Load imports/setup with parallel initialization
  - `Login process` - Authentication and identity verification
  - `initModel()` - Initialize with user context and create model hierarchy

### Recent Changes
- **Performance optimizations** - Parallel initialization, crypto optimization, key caching
- **Debug utilities** - Enhanced logging, performance tracking, app journal
- **Network stack** - QUIC model improvements, device discovery enhancements
- **iOS build fixes** - Module import corrections, native module integration
- **New packages** - Added `refinio.api` and `refinio.cli` packages

---

**Key Principle**: This is a sophisticated local-first application with complex P2P networking and native integration. Always understand the model state lifecycle and use the provided hooks and patterns for safe operations.

**Important Paths:**
- ESP32 code: `packages/one.core.expo/src/system/esp32/esp32-quicvc-project/`
- Main repo: `/Users/gecko/src/uvc`
- ONE platform core: `vendor/` tarballs

**Type Safety Notes:**
- SHA256Hash and SHA256IdHash are branded string types - they're just strings but with type safety
- Always use one.core helpers when available - don't reimplement existing utilities

**Development Philosophy:**
- Fail fast, fix root causes, no mitigation or delays
- Use what exists (ONE.core, ONE.models, one.leute reference)
- Investigate thoroughly before implementing
- Never edit `ios/` or `android/` folders directly (use config plugins instead)