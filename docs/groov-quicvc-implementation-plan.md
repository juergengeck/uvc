# Groov QUICVC Authority Implementation Plan

## Status

- Application protocol: implemented and tested.
- Groov I/O adapter: implemented and tested with injected requests.
- QUICVC authority service: implemented and tested with an in-memory stream host.
- Runtime composition: implemented; QUICVC identity and trust remain host-owned.
- Automated verification: complete without live hardware access.
- Live commissioning: pending API key, output kind, module index, channel index, and operator approval.

## Decision

Add a focused Node-compatible package at `packages/uvc.groov`. Keep the application protocol and groov hardware adapter independent from the QUICVC packet implementation. At runtime, structurally inject the existing `QuicVCConnectionManager` used by VGER; do not fork or copy its transport and credential logic.

## Work breakdown

### 1. Application protocol

- Reserve QUICVC stream `0x42` for groov authority traffic.
- Implement the versioned binary envelope used by VGER's QUICVC model-sharing service.
- Define request, response, event, state, and error payload types.
- Validate frame boundaries and operation payloads before touching hardware.

### 2. Groov I/O adapter

- Implement a `LightController` interface.
- Implement `GroovManageLightController` for digital and analog outputs.
- Authenticate with the `apiKey` header.
- Support verified TLS and an optional configured CA.
- Make write completion contingent on matching readback.
- Keep request execution injectable for deterministic tests.

### 3. QUICVC authority service

- Accept the existing manager through a narrow `QuicVCStreamHost` interface.
- Register/unregister the stream handler with explicit lifecycle methods.
- Require established connection state, resolved peer identity, and an injected authorization decision.
- Correlate all responses to request ids.
- Return typed errors on the same stream.

### 4. Runtime composition

- Export environment parsing with no module/channel defaults.
- Export a factory that combines configuration, the groov adapter, the QUICVC manager, and the application authorizer.
- Leave QUICVC identity/credential/trust initialization with the host runtime, matching VGER ownership.

### 5. Verification

- Unit-test frame round trips and malformed input.
- Unit-test digital/analog paths, authentication header, validation, and read-after-write mismatch.
- Unit-test stream routing, authorization, correlation, and emergency-off behavior with fakes.
- Build and type-check the package.
- Do not call the live write endpoints during automated verification.

### 6. Commissioning after code completion

- Create a dedicated groov API-only account.
- Record the intended module and channel from groov Manage.
- Install the device CA certificate or explicitly choose commissioning-only insecure TLS.
- Supply the existing QUICVC identity and trust wiring from the selected headless host.
- Start the service with output writes disabled, verify state reads, then perform an operator-approved off/on/off test.
- Capture the observed state and QUICVC request ids in the commissioning report.

## Boundaries

- `connection.core`: owns QUICVC transport, credential validation, encryption, connections, and stream delivery.
- `uvc.groov/protocol`: owns only application frames on stream `0x42`.
- `uvc.groov/GroovAuthorityService`: owns authorization enforcement and operation dispatch.
- `uvc.groov/GroovManageLightController`: owns the REST-to-I/O mapping and readback verification.
- Host runtime: owns secrets, QUICVC identity/trust wiring, process lifecycle, and deployment.
