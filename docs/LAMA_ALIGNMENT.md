# UVC → Lama Alignment Plan

## Overview

This document outlines the strategy for aligning uvc (React Native/Expo app) with lama's architecture, specifically mirroring `lama.ios` patterns.

## Current State

uvc is a React Native app with a traditional structure plus some packages:

### Current Structure
```
uvc/
├── app/                    # Expo Router screens
├── src/
│   ├── components/         # React Native components
│   ├── hooks/              # Custom hooks
│   ├── models/             # App models (AppModel, etc.)
│   ├── providers/          # Context providers
│   ├── services/           # Business logic
│   ├── initialization/     # Init sequence
│   └── config/             # Configuration
├── packages/
│   ├── chat.core/          # ✓ From lama
│   ├── connection.core/    # ✓ From lama
│   ├── one.core.expo/      # Expo-specific one.core
│   ├── one.models/         # ✓ From lama
│   ├── one.vc/             # Verifiable credentials
│   ├── one.btle/           # Bluetooth LE
│   ├── one.audit/          # Audit logging
│   ├── quicvc-protocol/    # ✓ From lama
│   ├── trust.core/         # ✓ From lama
│   ├── refinio.api/        # ✓ From lama
│   └── refinio.cli/        # ✓ From lama
└── vendor/                 # Local tarballs
```

### Key Differences from lama.ios
| Aspect | lama.ios | uvc | Gap |
|--------|----------|-----|-----|
| Core package | Uses `lama.core` | Has `AppModel` in src/ | Should use/extend lama.core |
| Package structure | Full lama packages | Subset of packages | Missing many *.core packages |
| Platform separation | Clear core/app split | Mixed in src/ | Needs refactoring |
| Business logic | In *.core packages | In src/services/ | Should move to packages |

## Target State

uvc should align with lama.ios patterns:

```
uvc/
├── app/                    # Expo Router screens (keep)
├── src/
│   ├── components/         # React Native components (keep)
│   ├── hooks/              # Hooks consuming packages (keep)
│   └── providers/          # Providers for packages (keep)
│
├── packages/
│   ├── # UVC-specific (owned by this repo)
│   ├── uvc.core/           # UVC business logic (NEW)
│   │
│   ├── # Shared from lama (synced)
│   ├── lama.core/          # Platform-agnostic logic (ADD)
│   ├── chat.core/          # ✓ Present
│   ├── connection.core/    # ✓ Present
│   ├── contact.core/       # ADD
│   ├── device.core/        # ADD
│   ├── settings.core/      # ADD
│   ├── mcp.core/           # ADD (for AI features)
│   ├── meaning.core/       # ADD
│   ├── memory.core/        # ADD
│   ├── agent.core/         # ADD
│   ├── trust.core/         # ✓ Present
│   ├── policy.core/        # ADD
│   ├── one.core/           # Via one.core.expo
│   ├── one.models/         # ✓ Present
│   ├── one.knowledge/      # ADD
│   ├── one.discovery/      # ADD
│   └── transport.core/     # ADD (abstract transport)
```

## Gap Analysis

### Missing Packages from lama

**High Priority (Core Functionality)**
| Package | Purpose | Why Needed |
|---------|---------|------------|
| `lama.core` | Platform-agnostic logic | Foundation for all business logic |
| `contact.core` | Contact management | Replace src/services contact logic |
| `device.core` | Device management | Multi-device support |
| `settings.core` | Settings management | Replace src/config patterns |

**Medium Priority (Features)**
| Package | Purpose | Why Needed |
|---------|---------|------------|
| `mcp.core` | MCP integration | AI assistant features |
| `meaning.core` | Semantic analysis | Knowledge features |
| `memory.core` | Chat memory | AI memory |
| `agent.core` | AI agents | Advanced AI features |
| `one.knowledge` | Knowledge graph | Structured knowledge |
| `one.discovery` | Resource discovery | P2P discovery |

**Low Priority (Infrastructure)**
| Package | Purpose | Why Needed |
|---------|---------|------------|
| `policy.core` | Access policies | Fine-grained permissions |
| `cube.core` | Datacube | Advanced data organization |
| `assembly.core` | Assembly management | Device groups |

### Code to Refactor

| Current Location | Target Location | Description |
|------------------|-----------------|-------------|
| `src/models/AppModel.ts` | `packages/uvc.core/` | Main app orchestrator |
| `src/services/` | Various `*.core` packages | Business logic |
| `src/initialization/` | `packages/uvc.core/` | Init sequence |
| `src/models/network/` | `connection.core` or `uvc.core` | Network logic |
| `src/models/ai/` | `mcp.core` or `uvc.core` | AI logic |

## Action Items

### Phase 1: Create uvc.core Package
- [ ] Create `packages/uvc.core/` package
- [ ] Move `AppModel` and related code to uvc.core
- [ ] Move initialization logic to uvc.core
- [ ] Export clean API from uvc.core

```typescript
// packages/uvc.core/src/index.ts
export { UvcCore } from './UvcCore.js';
export { UvcConfig } from './config.js';
export * from './types.js';
```

### Phase 2: Add lama.core
- [ ] Add `lama.core` package to uvc
- [ ] Have `uvc.core` extend/compose `lama.core`
- [ ] Migrate shared logic to use lama.core patterns

```typescript
// packages/uvc.core/src/UvcCore.ts
import { LamaCore } from 'lama.core';

export class UvcCore {
  private lamaCore: LamaCore;

  constructor(config: UvcConfig) {
    this.lamaCore = new LamaCore(config);
  }

  async init(): Promise<void> {
    await this.lamaCore.init();
    // UVC-specific initialization
  }
}
```

### Phase 3: Add Missing *.core Packages
- [ ] Add `contact.core` and refactor contact logic
- [ ] Add `device.core` for multi-device
- [ ] Add `settings.core` and migrate config
- [ ] Add other packages as features require

### Phase 4: Package Sync
- [ ] Establish sync process for shared packages from lama
- [ ] Document which packages are uvc-specific vs shared
- [ ] Update vendor/ tarballs or switch to direct imports

## Platform-Specific Considerations

### React Native / Expo Differences

Some lama packages need Expo-specific adaptations:

| Package | Adaptation Needed |
|---------|-------------------|
| `one.core` | Use `one.core.expo` (already present) |
| `transport.core` | Need `transport.expo` for native transports |
| `connection.btle` | Use `one.btle` with Expo BLE |
| Storage | IndexedDB → AsyncStorage/SQLite |

### Native Modules

uvc has native modules that don't exist in lama:
- `react-native-udp-direct` - Native UDP
- `one.btle` - Bluetooth LE
- `llama.rn` - Local LLM

These should be documented as uvc-specific extensions.

## Dependency Direction

```
app/ (Expo Router)
    ↓ uses
src/hooks, src/providers
    ↓ consume
packages/uvc.core
    ↓ imports
packages/lama.core, chat.core, connection.core, etc.
    ↓ imports
packages/one.core.expo, one.models
```

## Migration Strategy

### Incremental Approach (Recommended)
1. Create `uvc.core` as wrapper around existing code
2. Gradually move logic from src/ to packages/
3. Add lama packages one at a time
4. Refactor to use lama patterns

### Parallel Approach (Alternative)
1. Create new uvc2 project using lama.ios as template
2. Port uvc features to uvc2
3. Replace uvc with uvc2

## Success Criteria

- [ ] `uvc.core` package exists and contains app logic
- [ ] `lama.core` is imported and used
- [ ] Business logic moved from src/services to packages
- [ ] Shared packages sync from lama works
- [ ] AppModel uses lama patterns
- [ ] New lama features can be adopted easily
- [ ] Native modules documented as uvc extensions

## Reference: lama.ios Structure

```
lama/packages/lama.ios/
├── src/
│   ├── App.tsx
│   ├── components/
│   ├── hooks/
│   ├── screens/
│   └── providers/
├── ios/
├── android/
└── package.json (depends on lama.core, chat.core, etc.)
```

uvc should mirror this, with uvc.core replacing direct lama.core usage where UVC-specific behavior is needed.
