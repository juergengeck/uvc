# @uvc/groov-authority

QUICVC application service for controlling and observing a configured groov EPIC output.

The package does not implement QUICVC transport or credentials. Pass the existing `connection.core` `QuicVCConnectionManager` to `createGroovAuthorityRuntime`, provide an explicit authorizer, and start the returned service.

Before a headless Groov has an assigned ONE identity, run
`GroovProvisioningDiscovery` (`_uvc-provision._udp`) and
`GroovProvisioningService` on stream `0x43`. The service composes
`UvcHeadlessProvisioningDevice`: it verifies the controller assignment first,
then invokes the host callback that generates and persists keys locally. When
the device-signed admin grant is durable, stop bootstrap discovery and start
`GroovPeerDiscovery` (`_one-refinio._udp`) with the resulting Person/Instance.

The host owns the ONE identity, CHUM, and shared phone-book plan described in
[`../../docs/peer-discovery-phone-book.md`](../../docs/peer-discovery-phone-book.md).
Compose `GroovPeerDiscovery` with that plan to publish/browse
`_one-refinio._udp` and feed observations directly into the trie.
`GroovAuthorityService` does not create a parallel discovery or contact store.

```ts
const mdns = new GroovPeerDiscovery(identity, peer => controlPlan.recordDiscovery({
  ...peer,
  deviceKind: peer.deviceKind as 'cube' | 'expo' | 'groov' | 'esp32' | 'one-peer',
  capabilities: new Set(peer.capabilities),
}));
mdns.start();
```

Clients use the same stream host through `GroovAuthorityClient`. Its read,
write, and emergency-off promises resolve only after a correlated authority
response containing observed state; timeout and protocol errors reject.

```ts
const client = new GroovAuthorityClient(quicManager);
const before = await client.readState(groovDeviceId);
const after = await client.setLight(groovDeviceId, {enabled: true});
```

```ts
const { service } = await createGroovAuthorityRuntime({
  quicManager,
  authorize,
});

service.start(); // registers the application handler on QUICVC stream 0x42
```

Required environment variables:

- `GROOV_AUTHORITY_ID`
- `GROOV_MANAGE_BASE_URL`
- `GROOV_MANAGE_API_KEY`
- `GROOV_MODULE_INDEX`
- `GROOV_CHANNEL_INDEX`
- `GROOV_OUTPUT_KIND=digital|analog`

Optional environment variables:

- `GROOV_IO_DEVICE` (defaults to `local`)
- `GROOV_ANALOG_MIN`
- `GROOV_ANALOG_MAX`
- `GROOV_ANALOG_OFF_VALUE`
- `GROOV_ANALOG_READBACK_TOLERANCE`
- `GROOV_REQUEST_TIMEOUT_MS` (defaults to `5000`)
- `GROOV_TLS_CA_FILE`
- `GROOV_TLS_REJECT_UNAUTHORIZED` (defaults to `true`)

The module and channel have no defaults. A process cannot write hardware until both are explicitly configured.

For the supported Opto 22 SSH deployment, identity-safe service flags, rollback
runner, and live DNS-SD validation, see
[`../../docs/groov-rio-deployment.md`](../../docs/groov-rio-deployment.md).
