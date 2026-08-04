# UVC application shell plan

## Product invariant

UVC documents disinfection work in treatment facilities, bathrooms, operating rooms, and similar spaces. Every UVC application therefore opens on the same product surface:

- **Journal** is the start screen. It presents disinfection runs by date and records the room, time, status, duration, evidence, lamps, and sensors.
- **Settings** contains configuration and resources.
- **Settings → Devices** is where operators discover, provision, pair, and inspect ESP, groov RIO, lamps, sensors, and other UVC resources.

Chat, camera-feed promises, workspace package inspection, and implementation notes are not UVC product navigation. They must not appear until a real domain capability and persisted data model exist.

## Root cause

`uvc.cube` grew as a self-contained renderer. Its `App.tsx` owned routing, state, platform calls, and screens; it bypassed the public `settings.core` package through a source alias; and it filled missing journal data with fabricated records. The device screen felt coherent because it was the only screen connected end-to-end to discovery, pairing, and provisioning operations.

The VGER, Flexibel, and Edda applications use a stronger boundary: a shared application package owns product navigation and projections, while Electron owns only platform adapters and providers.

## Target architecture

```text
uvc.core / ONE objects
        │
        ├── journal operation ──────────────┐
        ├── discovery/pairing operations ───┤
        └── settings.core SettingsPlan ─────┤
                                            ▼
                         Cube Electron / browser adapters
                                            │
                                            ▼
                                      @uvc/uvc.ui
                                 Journal | Settings
                                              └── Devices
```

`@uvc/uvc.ui` owns the desktop/web application shell, route hierarchy, journal/calendar projection, generic settings form, and platform contract. `uvc.cube` supplies Electron IPC implementations and its device-management renderer. `uvc.browser` supplies an IndexedDB-backed ONE model adapter and a browser-local pairing/device view. Expo keeps its native widgets but follows the same route and journal semantics.

## Implementation sequence

1. Introduce `@uvc/uvc.ui` with the shared route hierarchy and typed platform boundary.
2. Replace the Cube renderer root with a thin composition of `SettingsProvider`, an IPC `SettingsPlanStorage`, the Electron platform adapter, and `UvcApp`.
3. Register Cube settings through the public `@refinio/settings.core` API and expose settings CRUD as a refinio operation.
4. Remove Chat, Feeds, Packages, workspace inspection, and fabricated journal entries from the renderer.
5. Keep the existing device discovery/provisioning workflow under Settings → Devices.
6. Verify type checking, production bundling, settings persistence, journal empty/record states, and device refresh/provisioning.
7. Compose `uvc.browser` with the same shell through a browser platform adapter; never project its legacy generic Assembly history as typed disinfection runs.

## Acceptance criteria

- Launching Cube opens Journal.
- The primary navigation contains Journal and Settings only.
- Devices is reachable from Settings and is not a primary destination.
- Journal renders only records returned by `journal.listDisinfectionRuns`.
- With no records, Journal explains that no disinfection has been documented; it never fabricates rooms, devices, or treatments.
- Settings values flow through `SettingsProvider` and a `SettingsPlanStorage` implementation from the public `settings.core` package.
- Cube's renderer root contains composition and adapters, not product screens.
- Cube typecheck and production build pass.
- The app served by `uvc.one/app/` uses the shared shell, opens on Journal, and keeps pairing under Settings → Devices.
- Browser-local storage remains a distinct ONE instance; missing typed UVC run data renders an honest empty journal instead of inferred or fabricated treatments.

## Deliberately deferred

- Camera feeds become a product surface only after a typed feed model and real stream-health operations exist.
- Cross-device journal synchronization is shown only from records actually present in the shared ONE data graph.
- Migrating bootstrap identity secrets from the existing local bootstrap store requires a separate lifecycle design because those values are needed before the ONE instance opens.
