# UVC Full-Protocol Integration Test PRD

## Status

Approved implementation direction. The first executable slice is owned by
`uvc.cube` and runs against the real Cube, Expo, Groov, and ESP32 instances.

## Problem

The existing `uvc-protocol-runner.mjs` is a useful LAN and source-contract
probe, but it does not exercise pairing, provisioning, trie replication,
device control, observed hardware state, or journal evidence. Its hard-coded
platform manifests and skipped `qa.core` transport/verification checks cannot
serve as full-product integration evidence.

## Goals

- Make the running Cube own integration-test orchestration through a public
  `uvc-test-runner` operation.
- Drive the same runtime operations used by the Cube UI.
- Require real advertisements from Expo, Groov, and ESP32.
- Validate discovery through Cube's persisted phone-book trie.
- Validate ONE pairing before accepting a peer as trusted.
- Optionally perform the signed headless provisioning ceremony.
- Send device reads through `UvcControlPlan` and require producer-owned
  `UvcControlObservation` readback.
- Require matching command and observation evidence in the journal trie.
- Produce a timestamped, step-profiled Markdown report for every run,
  including failures.
- Keep the standalone mDNS/source probe as a separately named diagnostic.

## Non-goals

- Treating mDNS presence as pairing, ownership, or successful control.
- Fabricating Expo/Cube/browser operation manifests.
- Scanning ONE storage outside the owning domain plans.
- Automatically provisioning a physical device without an explicit test flag.
- Energizing or changing live hardware by default.
- Weakening ESP32's fail-closed authenticated-transport boundary.

## Runner ownership and API

Cube registers one canonical `uvc-test-runner` operation with:

- `getStatus`
- `runFullProtocol`
- `stop`
- `getProtocolReport`

When `UVC_E2E_SECRET` is set, Cube exposes its registered operations through a
loopback-only test API. A thin command-line client starts the protocol and polls
the Cube-owned state. The client does not implement product assertions.

## Protocol

1. Verify Cube has a bound Person, Instance, encryption key, and signing key.
2. Wait for the requested physical peer kinds on Cube's live discovery
   projection.
3. Validate each advertisement as either an identity-bound ONE peer or a valid
   bootstrap headless peer.
4. Require each live peer to appear in Cube's persisted phone-book trie.
5. When explicitly requested, provision bootstrap Groov/ESP32 peers and wait
   for their identity-bound advertisement.
6. Require all identity-bound peers to be paired with Cube.
7. For Groov and ESP32, send a `read` through `UvcControlPlan` and require an
   observed response from the advertised executor Person.
8. When explicitly requested per device kind, exercise hardware writes through
   the same plan and require physical/device readback. ESP32 must transition its
   LED `ON`, then `OFF`, then restore the pre-test state. Groov uses a same-state
   write so the test does not intentionally alter an externally wired output.
9. Require `device-read`/`device-set` and `device-observed` journal evidence for
   the exercised devices.

## Safety switches

- Headless provisioning is disabled unless `--provision-headless` is passed.
- Live writes are disabled unless `--exercise-write=esp32`,
  `--exercise-write=groov`, or both are passed.
- The ESP32 write exercise must return correlated hardware readback for `ON`,
  `OFF`, and baseline restoration, with all three writes journaled by the
  current run.
- Groov commissioning requirements remain authoritative; the runner must not
  infer a module, channel, or authorization configuration.

## Pass criteria

A run passes only if every requested step completes. Missing peers, bootstrap
devices when provisioning is disabled, unpaired identities, absent readback,
timeouts, or missing journal evidence are failures. Static source checks and
partial peer sets never make a full-protocol run pass.

## Physical Expo control coverage

When the ESP32 write exercise is selected, Cube publishes a pending physical
Expo action to the loopback runner client. On macOS the client delivers a
development-only deep link to the selected iPhone. The URL is secret-gated and
accepted only when `EXPO_PUBLIC_UVC_INTEGRATION=1`; it does not expose an HTTP
listener on the phone or alter product settings.

The bridge only invokes Expo's real `DeviceControlModel`. Expo becomes the
`UvcControlCommand` issuer, Cube consumes that command from the paired peer's
recipient-scoped trie, Cube's authenticated hardware authority talks to ESP32,
and the producer-owned `UvcControlObservation` returns through CHUM. The runner
requires the exact Expo-issued read/ON/OFF/restore/final-read sequence and each
correlated ESP32 readback from Cube's journal DAG.

Physical Expo development clients are started with
`EXPO_PUBLIC_UVC_INTEGRATION=1` and an `EXPO_PUBLIC_UVC_E2E_SECRET` matching the
runner's `UVC_E2E_SECRET`. The integration mode starts native discovery after
identity and transport initialization without modifying the user's persisted
discovery setting and accepts only the narrow ESP32 LED-cycle action. Cube and
Expo use the deployed Glue relay at `wss://api.glue.one/comm`; integration mode
routes existing paired endpoint keys through that selected relay without
rewriting the durable peer identity or its trust evidence.
