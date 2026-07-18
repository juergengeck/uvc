# uvc Settings: Current Flows and Consolidation onto settings.core

Status: phases 0–3 complete; phase 4 persistence/effect inversion complete (2026-07-16)
Scope: `/Users/gecko/src/uvc` (Expo app) vs `lama/packages/settings.core`

## 1. Inventory: seven parallel settings mechanisms

uvc currently has **seven independent settings mechanisms**, each with its own
storage, defaults, and change propagation. Several overlap on the *same keys*.

| # | Mechanism | File | Storage backend | What it holds |
|---|-----------|------|-----------------|---------------|
| 1 | `SettingsProvider` (React context) | [src/providers/app/SettingsProvider.tsx](../src/providers/app/SettingsProvider.tsx) | **None — persistence disabled** ("TEMPORARY: Disable PropertyTree access") | language, darkMode, AI provider configs, summary config, deviceConfig, deviceSettings |
| 2 | `SettingsModel` | [src/models/SettingsModel.ts](../src/models/SettingsModel.ts) | `PropertyTreeStore('vger')` (one.models) | darkMode, generic key/value, owns a `DeviceSettingsService` |
| 3 | `SettingsManager` | [src/settings/SettingsManager.ts](../src/settings/SettingsManager.ts) | `SettingStoreApi` (optional, JSON blob under one key) | device + network setting groups; also the static-defaults authority |
| 4 | `DeviceSettingsService` (+ 2 factories) | [src/services/DeviceSettingsService.ts](../src/services/DeviceSettingsService.ts), [createDeviceSettingsService.ts](../src/services/createDeviceSettingsService.ts) | save-callback → `propertyTree['deviceSettings']` (JSON blob) | discoveryEnabled/Port, autoConnect, deprecated per-device map |
| 5 | `NetworkSettingsService` (singleton) | [src/services/NetworkSettingsService.ts](../src/services/NetworkSettingsService.ts) | `appModel.propertyTree` keys `eddaDomain`, `commServerUrl`, `headlessAuthorityUrl` + in-memory fallback | network endpoints, connection ops |
| 6 | `LLMSettingsManager` (singleton) | [src/models/ai/LLMSettingsManager.ts](../src/models/ai/LLMSettingsManager.ts) | ONE.core versioned objects (`GlobalLLMSettings` recipe) | AI/LLM global + per-model settings |
| 7 | Early-boot direct storage | [src/providers/app/AppTheme.tsx:360](../src/providers/app/AppTheme.tsx), [src/i18n/config.ts:99](../src/i18n/config.ts) | `SecureStore('app_darkMode')`, `SettingsStore('app_language')` | darkMode, language (pre-login) |

Dead/broken code found during the survey:

- [src/services/DeviceSettingsFactory.ts](../src/services/DeviceSettingsFactory.ts) — calls the
  `useSettings()` React hook inside a plain function (invalid) and is imported nowhere. Dead.
- `createDefaultDeviceSettingsService()` in
  [createDeviceSettingsService.ts](../src/services/createDeviceSettingsService.ts) — creates a
  service with a **no-op save callback** ("will be replaced later" — it never is).
- `SettingsManager` (mechanism 3) is never instantiated anywhere; only its *static*
  default getters are used. The whole load/save/OEvent machinery is dead code.
- `useDeviceSettings` falls back to creating **its own** `DeviceSettingsService`
  per mount when the AppModel service lookup fails — violating the single-instance rule.

## 2. Flows, as they actually run today

### 2.1 Dark mode

```
Toggle in settings screen → useAppTheme().toggleTheme
  → AppTheme state update (immediate UI)
  → setStoredDarkMode() → expo SecureStore 'app_darkMode'     (pre-login source of truth)
  → after login: sync effect → instance.propertyTree.setValue('darkMode', …)
SettingsProvider.setDarkMode → state only (persistence commented out)   ← never wins
SettingsModel.get/setDarkMode → propertyTree 'darkMode'                 ← unused by UI
```

Three writers for one flag; only the SecureStore + AppTheme sync path is real.
`SettingsProvider.darkMode` and `SettingsModel.darkMode` are vestigial.

### 2.2 Language

```
LanguageSelector → useSettings().setLanguage
  → setStoredLanguage() → one.core SettingsStore 'app_language' + i18n.changeLanguage
  → SettingsProvider state
  (propertyTree write commented out)
Boot: SettingsProvider effect + i18n init both read 'app_language'.
```

Works, but persistence bypasses the provider's intended propertyTree path.

### 2.3 Device discovery settings (the most tangled flow)

```
UI toggle → useDeviceSettings().toggleDiscovery
  ├─ window.appModel.deviceDiscoveryModel.forceStopDiscovery()/getESP32ConnectionManager()  (global access)
  ├─ service.setDiscoveryEnabled(enabled)
  │    ├─ mutate in-memory settings (+ __explicitChange flag)
  │    ├─ debounced (200ms) save → saveCallback
  │    │    └─ createDeviceSettingsService callback:
  │    │         re-reads propertyTree, diffs, may *silently overwrite* the incoming
  │    │         value with the stored one unless __explicitChange is set,
  │    │         then writes propertyTree['deviceSettings'] JSON blob
  │    └─ notifyDiscoveryStateChanged → window.appModel.deviceDiscoveryModel
  │         start/stopDiscovery + emits its own events
  └─ updateDeviceConfig(...)  → SettingsProvider state (NOT persisted)
```

Problems:
- The same fact (`discoveryEnabled`) lives in **four** places: SettingsProvider
  `deviceSettings`, SettingsProvider `deviceConfig`, DeviceSettingsService in-memory
  state, and the propertyTree blob. They are reconciled by heuristics
  (`__explicitChange`, "preserve current unless explicit") instead of a single owner.
- Effects (start/stop discovery) are fired from the *settings service* via
  `window.appModel` globals, instead of the discovery model listening to a settings
  change event. `DeviceDiscoveryModel.setSettingsService()` exists but the service
  also pushes directly — bidirectional coupling.
- Two `DeviceSettingsService` instances can exist simultaneously (AppModel's and
  the `useDeviceSettings` fallback), with divergent in-memory state.
- `SettingsModel.initDeviceSettingsService()` creates a **third** instance at init,
  with defaults and its own save callback — ignoring anything saved before.

### 2.4 Network settings

```
Network screens → useNetworkSettings / useHeadlessAuthority
  → NetworkSettingsService.getInstance()
      reads/writes propertyTree keys: 'eddaDomain', 'commServerUrl', 'headlessAuthorityUrl'
      plus in-memory fallback before AppModel is ready
SettingsManager defaults ('Settings.network' group) are a separate, unused schema.
```

Mostly coherent, but the service mixes settings persistence with connection
operations (invites, pairing, connection lists) in one 628-line singleton.

### 2.5 AI/LLM settings

```
ai-settings screen → useLLMSettings / useAISettings
  → LLMSettingsManager → ONE.core versioned objects (GlobalLLMSettings, LLM)
SettingsProvider.providerConfigs / summaryConfig → defaults only, never persisted,
  updateProvider is literally a dummy: async () => { console.log(...) }
```

The ONE.core-versioned path (mechanism 6) is the real one, and notably it is
*already* the architecture settings.core's `InstanceSettingsStorage` generalizes.

### 2.6 Screens

`app/(screens)/settings.tsx` is the hub → pushes to `health-settings`,
`network/*` (7 sub-screens), `ai-settings`, `data-management`, `debug-settings`,
`language-selection`. Reset/logout live on the hub screen and call
`deleteAllAppData()` / `logout()` from `src/initialization`.

## 3. What settings.core offers (lama/packages/settings.core)

- **`SettingsRegistry`** — modules declare `SettingsSection`s (id, fields with type/
  default/validate/`sensitive`). Defaults, validation, and UI schema all derive from
  one declaration. This replaces uvc's five competing hand-written default objects.
- **`InstanceSettingsStorage`** — settings as proper ONE.core versioned objects:
  one `InstanceSettings` compound per instance referencing per-module
  `ModuleSettings` objects. Gives CHUM sync, per-module access control, IoM remote
  management. `sensitive: true` fields are routed to the local `SettingsStore`
  (never synced) — exactly what API keys need.
- **`SettingsProvider`/`useSettings`** — React context over a `SettingsStorage`,
  platform-agnostic (works in RN; lama.cube feeds it via `IPCSettingsStorage`).
- **`SettingsPlan` + `SettingsModule`** — refinio.api plan for remote get/update.
  uvc already ships `packages/refinio.api`; adopting the plan makes uvc settings
  remotely orchestrable like lama.cube (`SettingsHandler` pattern).
- Built-in sections (glue, netbird, memory-export, subscription) and legacy
  `UserSettings` types incl. `DeviceSettings`/`NetworkSettings` that already cover
  most of uvc's fields (`discoveryEnabled`, `discoveryPort`, `autoConnect`,
  `addOnlyConnectedDevices`, `commServerUrl`, …).

Gaps vs uvc needs (small, all expressible as registered sections):
- uvc's `eddaDomain` / `headlessAuthorityUrl` fields — add to a uvc `network` section.
- ESP32 `defaultDataPresentation` — add to the uvc `devices` section (the per-device
  map is already deprecated in favor of DeviceModel ONE objects).
- Early-boot values (darkMode/language before login) — settings.core storage needs a
  ONE instance; keep the two tiny SecureStore/SettingsStore reads as a boot cache
  that is reconciled from settings.core after login (same pattern AppTheme uses today).

## 4. Consolidation plan

Target: **one declaration (registry section) → one storage (InstanceSettingsStorage)
→ one React surface (settings.core SettingsProvider) → models subscribe to changes.**

### Phase 0 — dead code removal (completed 2026-07-16)
1. Delete `src/services/DeviceSettingsFactory.ts` (broken, unused).
2. Delete `createDefaultDeviceSettingsService()` (no-op save).
3. Delete `SettingsManager` instance machinery; keep the two static default getters
   temporarily (they become registry defaults in Phase 2).
4. Remove `SettingsModel.initDeviceSettingsService()` — AppModel already gets its
   service from `createDeviceSettingsService(appModel)` in `initialization/index.ts`;
   the SettingsModel copy is a duplicate instance.

### Phase 1 — dependency wiring (completed 2026-07-16)
- Use the canonical `@refinio/settings.core` from `../one/packages/settings.core`,
  matching UVC's current direct `file:` dependencies on one.core/one.models. The
  similarly named package under `lama/packages/settings.core` is an older copy and
  must not be installed alongside the canonical ONE workspace package.

### Phase 2 — register uvc sections (completed 2026-07-16)
- `registerUvcDeviceSettings()`: discoveryEnabled (default **false** — keep the
  privacy/battery rationale as the field description), discoveryPort (49497),
  discoveryBroadcastInterval, autoConnect, addOnlyConnectedDevices,
  defaultDataPresentation.
- `registerUvcNetworkSettings()`: commServerUrl, eddaDomain, headlessAuthorityUrl,
  autoConnect.
- `registerUvcUiSettings()`: darkMode, language.
- AI settings: keep `LLMSettingsManager` (already ONE.core-versioned and
  first-class), but delete `SettingsProvider.providerConfigs/summaryConfig`
  (dummy, never persisted). If summary config is still wanted, register an `ai`
  section with those fields.

### Phase 3 — storage + provider swap (completed 2026-07-16)
- In `AppModel.init()` (after instance is available): create
  `InstanceSettingsStorage({ instanceIdHash })`, register sections, expose as
  `appModel.settings`.
- Replace uvc's `SettingsProvider` with settings.core's provider fed by that
  storage; migrate the four `useSettings()` consumers
  (`settings.tsx`, `ai-settings.tsx`, `language-selection.tsx`, `_layout.tsx`).
- One-time migration on first init: read legacy propertyTree keys
  (`deviceSettings`, `eddaDomain`, `commServerUrl`, `headlessAuthorityUrl`,
  `darkMode`, `language`) → write into module settings → mark migrated.

Implementation note: the migration also reconciles the two intentional pre-login
boot caches (`app_language` and `app_darkMode`) and scopes its marker to the ONE
instance. The marker uses a SecureStore-safe dotted key.

### Phase 4 — invert the effect coupling (core work completed 2026-07-16)
- `DeviceDiscoveryModel` subscribes to storage changes for the `devices` section and
  starts/stops discovery itself. Delete `DeviceSettingsService` (its debounce,
  `__explicitChange` heuristic, and `window.appModel` reach-through all exist only
  to paper over the multi-owner problem, which the single store removes).
- `useDeviceSettings` becomes a thin wrapper over `useSettings('devices')` +
  discovery-model status; no service instantiation in the hook.
- Split `NetworkSettingsService`: settings move to the `network` section; the
  connection/invite operations remain as a lean `ConnectionOpsService` (or move
  onto TransportManager where they belong).

`DeviceSettingsService`, both factories, and the hook-created fallback instance
are deleted. `DeviceDiscoveryModel` now owns the storage subscription and applies
desired discovery state. `NetworkSettingsService` reads/writes the canonical
sections; physically splitting its remaining connection/invite methods is a
separate ownership cleanup with no remaining settings persistence impact.

### Phase 5 — parity with lama.cube (optional but cheap)
- Wire `SettingsPlan` into `packages/refinio.api` (mirror
  `lama.cube/src/main/api/handlers/SettingsHandler.ts` and
  `module-registry-init.ts:297`) so uvc instances are remotely manageable via
  refinio.cli / IoM.

### Risks / notes
- `InstanceSettingsStorage` grants owner access and stores versioned objects —
  verify CHUM doesn't sync `discoveryEnabled` across devices in surprising ways
  before enabling sharing beyond the owner (per-module access control exists).
- Keep the SecureStore darkMode boot cache; it solves a real pre-login flash
  problem and is one small, well-scoped exception.
- The per-device map in settings is already deprecated → do **not** carry
  `devices: {}` into the new section; DeviceModel owns devices.

## 5. Expected deletions after full consolidation

| Deleted | Lines (approx) |
|---|---|
| SettingsProvider.tsx (replaced by settings.core provider) | ~390 |
| SettingsManager.ts | ~320 |
| SettingsModel.ts (device-service part; keep thin propertyTree shim if still needed) | ~150 |
| DeviceSettingsService.ts + both factories | ~630 |
| NetworkSettingsService.ts settings half | ~250 |
| **Total** | **~1700 lines**, 4 storage backends → 1 (+1 boot cache) |
