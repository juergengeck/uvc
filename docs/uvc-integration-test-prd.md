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
8. When explicitly requested per device kind, write the already-observed state
   and require physical/device readback. This exercises write authorization and
   correlation without intentionally changing the output.
9. Require `device-read`/`device-set` and `device-observed` journal evidence for
   the exercised devices.

## Safety switches

- Headless provisioning is disabled unless `--provision-headless` is passed.
- Live writes are disabled unless `--exercise-write=esp32`,
  `--exercise-write=groov`, or both are passed.
- Groov commissioning requirements remain authoritative; the runner must not
  infer a module, channel, or authorization configuration.

## Pass criteria

A run passes only if every requested step completes. Missing peers, bootstrap
devices when provisioning is disabled, unpaired identities, absent readback,
timeouts, or missing journal evidence are failures. Static source checks and
partial peer sets never make a full-protocol run pass.

## Follow-up coverage

The initial Cube-owned slice consumes Cube's canonical runtime DAG. Full Expo
operation-manifest parity and Expo-owned projection assertions require a
test-only, authenticated Expo automation bridge. Until that bridge exists,
the report must describe Expo coverage as discovery and pairing only rather
than claiming Expo plan execution.

Physical Expo development clients are started with
`EXPO_PUBLIC_UVC_INTEGRATION=1`. That development-only mode starts native
discovery after identity and transport initialization without modifying the
user's persisted discovery setting. It is not an Expo operation bridge and
does not expose device-control mutations.
