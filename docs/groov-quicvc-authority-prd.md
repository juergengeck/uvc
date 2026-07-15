# Groov QUICVC Authority PRD

## Status

Approved direction for the first implementation slice.

## Summary

Run the UVC demonstrator authority on the groov EPIC embedded Linux device and expose its light-control capability through the project's existing QUICVC transport. The authority controls a configured groov I/O output through the local groov Manage REST API, verifies every write by reading the physical I/O state back, and returns that observation to the authenticated QUICVC peer.

This supersedes the Raspberry Pi authority and public HTTP/WebSocket control surface described in `pi-authority-demonstrator-first-cut.md`.

## Problem

The current report places a Raspberry Pi between UVC clients and the groov EPIC. That adds a second Linux authority, a second deployment target, and an HTTP/WebSocket protocol beside QUICVC. The groov EPIC is already an embedded Linux device, is reachable on the project network, and owns the I/O rack used by the demonstrator.

## Goals

- Make the groov EPIC the authority for the demonstrator light output.
- Reuse the existing QUICVC connection, credential, encryption, fragmentation, and stream routing implementation.
- Provide authenticated operations to read light state, set light state, and force the output off.
- Use the groov Manage REST API only as the local hardware adapter boundary.
- Return observed I/O state after writes; a successful REST response alone is not success.
- Keep the protocol and hardware adapter independently testable without energizing hardware.
- Fail closed when peer identity, authorization, configuration, transport state, or I/O readback is missing.

## Non-goals

- Running a local language model or any inference workload in UVC.
- Taskmaster integration or generated task state.
- A Raspberry Pi authority.
- A new public HTTP or WebSocket authority API.
- Reimplementing QUICVC packet protection, credentials, discovery, or connection management.
- Guessing the installed module/channel or writing to hardware during automated tests.
- Sensor calibration or ESP32 firmware changes in this slice.

## Users and actors

- **Operator:** controls and observes the demonstrator through a UVC client.
- **UVC client:** an authenticated QUICVC peer that invokes authority operations.
- **Groov authority:** the service on the groov EPIC handling the dedicated application stream.
- **Groov Manage:** the local HTTPS API used to read and write rack I/O.

## Architecture

```text
UVC client
  |
  | QUICVC authenticated connection
  | application stream 0x42
  v
GroovAuthorityService on groov EPIC
  |
  | authorize(peer identity, operation)
  v
GroovManageLightController
  |
  | HTTPS + apiKey, read-after-write
  v
groov Manage REST API -> configured rack module/channel -> light
```

QUICVC owns transport security and peer identity. `GroovAuthorityService` must only accept messages on an established connection whose resolved peer person id is present. An injected authorizer decides whether that peer may perform `read`, `write`, or `emergencyOff`.

## Protocol contract

- QUICVC stream id: `0x42`.
- Application frame version: `1`.
- Frame header: version byte, frame-type byte, big-endian request-id length (`uint16`), big-endian payload length (`uint32`), followed by UTF-8 request id and a UTF-8 JSON object payload.
- Request ids are required and responses use the same request id.
- Frame types:
  - `GetStateRequest` / `GetStateResponse`
  - `SetLightRequest` / `SetLightResponse`
  - `EmergencyOffRequest` / `EmergencyOffResponse`
  - `StateChangedEvent`
  - `ErrorResponse`
- Unknown versions, frame types, invalid lengths, empty request ids, non-object JSON, and invalid operation payloads are rejected.

## Operations

### Get state

Returns the observed output state, output kind, module index, channel index, reachability, raw hardware value, and observation timestamp.

### Set light

Input:

- `enabled`: required boolean.
- `intensity`: required for an enabled analog output and prohibited outside the inclusive range `[0, 1]`.

The adapter writes the configured output, reads it back, and rejects the operation if the observation does not match the command within the configured analog tolerance.

### Emergency off

Writes the configured off value and reads it back. The operation is idempotent: repeated requests leave the output off and return the observed off state.

## Groov Manage integration

The authority uses the official groov Manage REST API:

- Digital write: `PUT /manage/api/v1/io/{device}/modules/{moduleIndex}/channels/{channelIndex}/digital/state`
- Digital readback: `GET /manage/api/v1/io/{device}/modules/{moduleIndex}/channels/{channelIndex}/digital/status`
- Analog write: `PUT /manage/api/v1/io/{device}/modules/{moduleIndex}/channels/{channelIndex}/analog/value`
- Analog readback: `GET /manage/api/v1/io/{device}/modules/{moduleIndex}/channels/{channelIndex}/analog/status`
- Authentication header: `apiKey`

References:

- https://developer.opto22.com/groov/manage/getting-started/
- https://developer.opto22.com/static/generated/manage-rest-api/swagger-ui/

## Configuration

Required at runtime:

- groov Manage base URL
- API key from a dedicated API-only groov user
- I/O device name (`local` for the built-in rack)
- module index
- channel index
- output kind (`digital` or `analog`)
- analog minimum, maximum, off value, and readback tolerance when using analog output
- groov Manage request timeout (five seconds by default, with no automatic write retries)
- QUICVC identity, credential, trust verifier, and UDP listen port supplied by the host runtime

TLS certificate verification is enabled by default. A device CA certificate may be configured. Disabling verification must be an explicit commissioning-only choice.

## Security and safety requirements

- Never log or transmit the groov API key.
- Never accept commands from an unestablished or unidentified QUICVC connection.
- Never provide a permissive default authorizer.
- Never infer a module or channel.
- Never silently clamp invalid intensity values.
- Never report commanded state as observed state.
- Never retry writes automatically; a caller can make a new, correlated request after inspecting the error.
- Automated tests use fakes and must not access the live output.

## Acceptance criteria

- The protocol codec round-trips every frame type and rejects malformed frames.
- The service registers exactly one handler on QUICVC stream `0x42`.
- Read, write, and emergency-off requests require an established, identified, authorized peer.
- Digital and analog adapters use the documented groov Manage paths and `apiKey` header.
- Every successful write response contains a matching hardware readback.
- Hardware, authorization, transport, and validation failures produce correlated error responses without fabricated state.
- Focused automated tests pass without contacting the live groov.
- The implementation contains no model runtime and makes no Taskmaster changes.

## Commissioning gate

Live deployment and output testing require the operator to provide the dedicated API key, the intended output kind, and the exact module/channel indices. Until those values are supplied, the implementation must remain incapable of writing to the physical rack.
