# UVC device state and journal

UVC discovery, control, and observed hardware state use persisted `trie.core`
roots. Channels are not part of this protocol. CHUM shares the root selected by
IdAccess and follows its typed references feed-forward.

## Objects

- `UvcDiscoveryObservation` records which Person/Instance saw an mDNS endpoint,
  its advertised public key and claimed identity, and its expiry time. It is a
  reachability observation, never ownership or trust.
- `UvcControlCommand` records issuer Person/Instance, paired executor Person,
  target device, `read|set`, and desired state.
- `UvcControlObservation` references the command hash and records the producing
  Person/Instance, observed device state, or explicit failure.
- `UvcJournalEvent` references command and observation hashes for Journal UI.

Provisioning adds four more immutable objects:

- `UvcIdentityAssignment` — controller-selected Person/Instance inputs and a
  signed challenge.
- `UvcDeviceIdentityProof` — public device keys generated on the device and a
  device signature; it never contains private material.
- `UvcDeviceIdentityCertificate` — controller certification of the exact
  device-created keys and assigned IDs.
- `UvcAdminRoleGrant` — the device's signed, durable trust of the provisioning
  Person as `admin`.

All eight are immutable unversioned ONE objects. Trie nodes and roots are the
versioned storage objects.

## Root layout

- `uvc:phone-book:<ownerPerson>:<ownerInstance>` indexes observations under
  `phone-book`, `phone-book/device/<id>`, and `phone-book/observer/<person>`.
- `uvc:control:<ownerPerson>:<ownerInstance>:<audiencePerson>` indexes commands,
  observations, and latest device state. This is the participant access boundary.
- `uvc:journal:<ownerPerson>:<ownerInstance>` indexes `journal`,
  `journal/device/<id>`, and `journal/event/<type>`.
- `uvc:provisioning:<ownerPerson>:<ownerInstance>` indexes each ceremony under
  `provisioning/ceremony/<id>` and admin grants under
  `provisioning/admin/<person>`.

Stable roots are restored directly. Startup does not scan or replay objects.
A raw imported command is not executable: the receiver consumes only entries
reached through a paired peer's control root whose audience is the receiver.

## Read/set flow

Browser, Expo, and Cube call the same `UvcControlPlan`. If the local instance
has the authenticated Groov or ESP32 connection it executes locally. Otherwise
it writes to a recipient-scoped control trie and shares that root with the paired
executor. The executor writes a producer-owned observation to the inverse root.

Every attempt records a command journal event and every outcome records an
observed/failed journal event. Dispatch and timeout are never treated as state.
Groov writes require Manage readback; ESP32 writes require correlated LED state.

Provisioning writes `identity-assigned`, `device-keys-created`,
`identity-certified`, and `admin-granted` journal events, each referencing the
exact evidence hash. An mDNS appearance or sent assignment is never journaled
as successful provisioning.
