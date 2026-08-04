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

## Release packaging

Public RIO releases use Opto 22's official `GROOV-LIC-SHELL` customization
surface and Refinio's signed release-root contract. They are application
archives, not groov firmware or disk images.

Build a development release from a clean VGER headless bundle:

```bash
npm run build:rio-release -- \
  --bundle /tmp/vger-deploy/bundle.mjs \
  --version 0.1.0 \
  --output-dir /tmp/uvc-rio-release
```

For a public artifact, also pass `--public`, `--sbom <complete-spdx.json>`, and
`--notices <complete-third-party-notices>`. The builder produces the immutable
archive and a `.publication.json` descriptor for the existing Refinio signer.

Install from a local archive during development:

```bash
./scripts/install-rio.sh \
  --archive /tmp/uvc-rio-release/uvc-rio-0.1.0.tar.gz \
  --model GRV-R7-MM1001-10 \
  --firmware 4.1.2 \
  dev@rio.local
```

The installed commands are available under `/home/dev/uvc/current/bin`:

- `doctor` reports model, firmware, runtime, service, and health state.
- `rollback` atomically exchanges the current and previous releases.
- `backup` creates a password-encrypted consistent-state archive.
- `restore` restores an encrypted backup only with an explicit `--yes`.

After installation, edit `/home/dev/uvc/shared/uvc.env`, commission the device,
and disable Shell access in groov Manage for normal production operation.
