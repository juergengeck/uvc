# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

### Key Directories
```
app/                        # Expo Router screens
├── (auth)/                # Authentication flows
├── (screens)/             # Main app screens
├── (tabs)/                # Tab navigation
└── _layout.tsx           # Root layout

src/
├── components/           # React components
├── models/              # Domain models
├── hooks/               # Custom React hooks
├── providers/           # Context providers
├── services/            # Business logic
├── utils/               # Utilities
├── initialization/      # App initialization
└── platform/           # Platform-specific code

ios-custom-modules/      # Custom native modules
└── UDPDirectModule/     # Native UDP implementation
```

### Critical Files
- `src/initialization/index.ts` - App initialization sequence
- `src/models/AppModel.ts` - Root model orchestrator
- `src/providers/app/AppModelProvider.tsx` - Main context provider
- `babel.config.js` - Module resolution and aliases
- `package.json` - Dependencies and scripts

## Development Guidelines

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

```typescript
// 1. Create Person object
const person = await Person.create(...);

// 2. Create Profile for the Person
const profile = await ProfileModel.constructWithNewProfile(
  personId, localPersonId, 'default', 
  [oneInstanceEndpoint], [signKey]
);

// 3. Create Someone object
const someone = await SomeoneModel.constructWithNewSomeone(person);

// 4. Add to contacts
await leuteModel.addSomeoneElse(someone.idHash);
```

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
Handle type mismatches with wrapper adapters:

```typescript
// Event wrapper for type compatibility
const wrappedEvent = {
  listen: (callback: (timeOfEarliestChange: Date) => void) => {
    return channelManager.onUpdated.listen((channelInfoIdHash, channelId, channelOwner, timeOfEarliestChange) => {
      callback(timeOfEarliestChange);
    });
  }
} as OEvent<(timeOfEarliestChange: Date) => void>;
```

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

## Common Patterns

### Initialization Sequence
The app follows a strict 3-phase initialization:

1. **Platform Setup** - Load native modules, crypto, QUIC transport
2. **Authentication** - MultiUser login/register
3. **Model Creation** - Initialize domain models in dependency order

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
- **Model events** - Use structured logging with component names
- **Network events** - Enable debug logging in NetworkPlugin
- **Native modules** - Check native logs in Xcode/Android Studio

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
  - `createInstance()` - Load imports/setup
  - `Login process`
  - `initModel()` - Initialize with user context

---

**Key Principle**: This is a sophisticated local-first application with complex P2P networking and native integration. Always understand the model state lifecycle and use the provided hooks and patterns for safe operations.