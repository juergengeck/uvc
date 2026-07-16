# Groov RIO deployment

The Groov target is an Opto 22 embedded Linux device. UVC uses the supported
SSH custom-program surface, not a Node-RED function-node copy of the runtime.

Official references:

- [groov EPIC & RIO Developer Guide](https://developer.opto22.com/epicdev/)
- [Secure Shell access](https://developer.opto22.com/epicdev/SSH/)
- [Node-RED on groov](https://developer.opto22.com/nodered/general/getting-started/)
- [groov Manage REST API](https://developer.opto22.com/groov/manage/getting-started/)

SSH access requires the Opto 22 Shell license. Custom files live under the
`dev` account; UVC installs its service in `/home/dev/uvc` and runs it through
`uvc-headless.service`. The Groov Manage API remains the local I/O boundary.

## Identity and discovery states

An unprovisioned device publishes `_uvc-provision._udp` with its hardware id
and bootstrap public key. It does not claim a Person or Instance. After the
assignment, device-local key generation, identity certificate, and durable
admin grant complete, that advertisement stops and `_one-refinio._udp` starts.

A provisioned record must include `deviceId`, `personId`, `pubkey`,
`deviceType=groov`, and the QUICVC endpoint. The device display name is stored
on the ONE `Device` object. Change it through the owning operation:

```bash
curl -X POST -H 'Content-Type: application/json' \
  --data '{"name":"rio"}' \
  http://localhost:3000/api/instance/updateName
```

Do not use the VGER `--name` option as a display label. It changes the ONE
Instance name and therefore creates a different stable Instance id.

## Deploying the headless bundle

Build a clean VGER headless bundle, then run the transactional deployer:

```bash
GROOV_SSH_TARGET=dev@rio.local \
GROOV_HEADLESS_BUNDLE=/tmp/vger-deploy/bundle.mjs \
./packages/uvc.groov/scripts/deploy-headless-bundle.sh
```

The deployer syntax-checks locally and on-device, preserves rollback copies,
keeps the existing `./uvc-data` ONE storage, selects `deviceType=groov`, and
rolls back unless `/health` reports `ready: true`. It disables unrelated
WhatsApp, embedding, and seller services on the 1 GB target while retaining
QUICVC, Glue/CHUM, discovery, and the shared phone-book data path.

Validate the live network contract with:

```bash
cd packages/uvc.cube
UVC_QA_EXPECTED_KINDS=cube,groov npm run test:integration:probe
```
