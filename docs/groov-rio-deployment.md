# Groov RIO deployment

The Groov target is an Opto 22 embedded Linux device. UVC uses the supported
SSH custom-program surface, not a Node-RED function-node copy of the runtime.

Official references:

- [groov EPIC & RIO Developer Guide](https://developer.opto22.com/epicdev/)
- [Secure Shell access](https://developer.opto22.com/epicdev/SSH/)
- [Node-RED on groov](https://developer.opto22.com/nodered/general/getting-started/)
- [groov Manage REST API](https://developer.opto22.com/groov/manage/getting-started/)

SSH access requires the free Opto 22 `GROOV-LIC-SHELL` license. It must be
enabled through groov Manage; UVC does not bypass the official access path.
Opto 22 documents custom applications, file transfer, package installation,
and service control through Shell access, but product support for a
Shell-modified device is limited. Refinio supports the UVC application and its
modifications. The Groov Manage API remains the local I/O boundary.

UVC depends on Shell access as its break-glass service-control and recovery
path. Keep the Shell license installed and SSH enabled on UVC-managed devices,
use credentials distinct from groov Manage, and restrict port 22 to a trusted
management network at the network boundary. Do not disable the on-device Shell
unless another authenticated path can inspect and restart `uvc-headless.service`.
Disabling it while groov Manage is unavailable leaves physical access as the
only recovery path.

The first declared public target is `GRV-R7-MM1001-10`, ARMv7, on official
firmware 4.1.2 or newer with Node.js major 20 or 22. Other RIO models require a
separate live compatibility result before they are added to release metadata.

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

## Building a release

Build a clean VGER headless bundle, then build the versioned RIO archive:

```bash
cd packages/uvc.groov
npm run build:rio-release -- \
  --bundle /tmp/vger-deploy/bundle.mjs \
  --version 0.1.0 \
  --output-dir /tmp/uvc-rio-release
```

For public publication, also provide `--public`, a complete `--sbom`, and
complete `--notices`. The output includes a `.publication.json` descriptor for
Refinio's existing `42` release signer. The archive must be uploaded before the
signed `/downloads/uvc/current-release.json` pointer changes. RIO is one
artifact in the shared UVC release, alongside desktop and ESP32 artifacts.

The current builder accepts an explicit VGER bundle. A dedicated Groov build
profile is still required in VGER to remove unrelated HTML, model, agent,
seller, WhatsApp, embedding, MCP, and refinement code at build time. Runtime
disable flags do not count as that build-time reduction.

## Installing or updating

Install a local release during development:

```bash
./packages/uvc.groov/scripts/install-rio.sh \
  --archive /tmp/uvc-rio-release/uvc-rio-0.1.0.tar.gz \
  --model GRV-R7-MM1001-10 \
  --firmware 4.1.2 \
  dev@rio.local
```

Once the signed public manifest exists, omit `--archive`. The host installer
verifies the pinned Refinio root, publisher certificate, manifest signature,
artifact signatures, Merkle proof, and downloaded archive hash before using
SSH.

On-device releases are root-owned and immutable:

```text
/home/dev/uvc/
├── current -> releases/<active-version>
├── previous -> releases/<previous-version>
├── releases/<version>/
└── shared/
    ├── uvc.env
    ├── uvc-data/
    └── uvc-provisioning-state.json
```

The systemd service runs as the official Shell user, binds HTTP health to
loopback, loads secrets from the mode-0600 `shared/uvc.env`, and writes logs to
journald. Updates never replace `shared`. Activation requires a stable PID and
three consecutive `ready: true` health responses; failure restores the prior
release automatically.

The environment file starts uncommissioned. Leave every Groov Manage authority
field empty until the dedicated API user, exact module, exact channel, and
output kind are known. Partial configuration is a startup error.

Useful on-device commands:

```bash
/home/dev/uvc/current/bin/doctor
sudo /home/dev/uvc/current/bin/rollback
/home/dev/uvc/current/bin/backup /run/media/sda1/rio.uvc-rio-backup
sudo /home/dev/uvc/current/bin/restore /run/media/sda1/rio.uvc-rio-backup --yes
```

Backups are consistent-state AES-256-GCM archives with a scrypt-derived key.
Keep them off-device. Opto 22 warns that custom applications must be reinstalled
after firmware updates, and the standard groov backup retains only the first
10 MB of user files; it is not a substitute for the UVC recovery archive.

The legacy developer deploy entry point now builds and installs this same
archive instead of maintaining a separate update-only path:

```bash
GROOV_SSH_TARGET=dev@rio.local \
GROOV_HEADLESS_BUNDLE=/tmp/vger-deploy/bundle.mjs \
GROOV_RIO_MODEL=GRV-R7-MM1001-10 \
GROOV_RIO_FIRMWARE=4.1.2 \
./packages/uvc.groov/scripts/deploy-headless-bundle.sh
```

Validate the live network contract with:

```bash
cd packages/uvc.cube
UVC_QA_EXPECTED_KINDS=cube,groov npm run test:integration:probe
```
