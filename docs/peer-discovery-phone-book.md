# UVC discovery, phone book, and control

Deployment notes: [Groov RIO](./groov-rio-deployment.md) and
[ESP32 headless firmware](./esp32-headless-deployment.md).

## Shared protocol

The cross-product contract lives in `../one/packages/uvc.core`. Expo, browser,
Cube, and headless hosts use its recipes, `UvcStateTrie`, and `UvcControlPlan`.
UVC uses trie roots rather than channels.

Native peers publish and browse `_one-refinio._udp.local.` with:

- instance name: first 16 characters of the stable ONE Instance id
- SRV port: QUICVC UDP port
- TXT: `deviceId`, `pubkey`, `personId`, `name`, `deviceType`,
  `platform=one`, and `capabilities`

`deviceId` and `pubkey` must be the Instance and public encryption key used by
the subsequent QUICVC handshake. Valid `deviceType` values are `cube`, `expo`,
`groov`, and `esp32`.

An unprovisioned Groov or ESP32 has no ONE Person/Instance yet and therefore
must not publish placeholders on `_one-refinio._udp`. It publishes
`_uvc-provision._udp.local.` with `hardwareDeviceId`, an ephemeral
`bootstrapKey`, `deviceType`, and `protocol=uvc-headless-provisioning-v1`.
After the identity ceremony completes it removes that bootstrap service and
starts the identity-bound `_one-refinio._udp` service.

## Trust and replication

mDNS proves reachability only. Each result becomes an untrusted
`UvcDiscoveryObservation` in the observer's deterministic phone-book trie.
It does not create a trusted Someone, ownership claim, pairing, or access grant.

After QUICVC verifies the key and pairing resolves the remote Person/Instance,
the phone-book root is granted to that paired Person. CHUM follows the root's
typed references. Browser cannot browse DNS-SD, so it learns the same directory
through its paired ONE/CHUM connection.

ESP32 advertises the same DNS-SD state transition. The firmware keeps its own
device keys and exact provisioning/admin evidence in NVS while the shared ONE
objects and trie roots remain the replication contract with full ONE peers.

## Runtime ownership

- Cube is an independent configurable Person/Instance owned by Electron main.
  It advertises its bound identity and persists discoveries in its trie.
- Expo is an independent mobile/browser ONE instance. Native Expo advertises
  and browses; browser consumes shared roots.
- Groov's headless ONE host advertises/browses and owns the authority adapter.
  `GroovAuthorityService` remains stream `0x42` business logic.
- ESP32 owns its ESP-IDF advertisement and authenticated LED authority.

## Headless identity provisioning

Cube, Expo, or browser can provision a bootstrap Groov/ESP32 over QUICVC stream
`0x43`. The transport supplies the authenticated controller Person, Instance,
signing key, and signing algorithm; none of those values come from mDNS.

1. The controller signs `UvcIdentityAssignment`, assigning the device email and
   instance name (the stable inputs to ONE Person/Instance IDs).
2. Only after verifying that assignment against the connected peer does the
   device generate and persist its encryption/signing keys locally.
3. The device returns `UvcDeviceIdentityProof`, signed by its new key and bound
   to both controller and device challenges.
4. The controller verifies the calculated Person/Instance IDs and signs
   `UvcDeviceIdentityCertificate`.
5. The device verifies the certificate, durably installs a device-signed
   `UvcAdminRoleGrant` for the controller Person, and returns that grant.

Private keys never occur in a recipe, trie, mDNS record, or transport frame.
The device is not controllable until the exact admin grant is durable.

## Control and journal

The issuer adds `UvcControlCommand` to
`uvc:control:<issuerPerson>:<issuerInstance>:<executorPerson>` and grants that
root to the paired executor. The executor validates root owner/audience, runs
the authenticated hardware adapter, and writes `UvcControlObservation` to its
recipient root. `UvcJournalEvent` indexes both hashes in the local journal trie.

No response, wrong producer, missing pairing, invalid root audience, or absent
readback is an explicit failure.

## Integration runner

The canonical harness is owned by the running Cube. Start Cube with
`UVC_E2E_SECRET` set, then run `npm run test:integration` in
`packages/uvc.cube`. The `uvc-test-runner` operation validates live discovery,
the persisted phone-book projection, pairing, headless control/readback, and
journal evidence. Provisioning and hardware writes require explicit safety
flags. Timestamped Markdown evidence is written below
`packages/uvc.cube/tests/integration/reports/`.

`npm run test:integration:probe` retains the standalone `qa.core` LAN, recipe,
and firmware-source probe. It is diagnostic coverage and is not the canonical
full-product integration test. See
[`uvc-integration-test-prd.md`](./uvc-integration-test-prd.md) for the protocol
and remaining Expo automation-bridge scope.

An earlier diagnostic report on 2026-07-15 showed Cube correctly and `rio` as `deviceType=linux`
without `personId`. Therefore `rio` is discovered as a reachable ONE peer but is
not accepted as a Groov identity until its advertiser publishes `deviceType=groov`
and the bound Person id.
