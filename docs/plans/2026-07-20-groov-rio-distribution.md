# Groov RIO distribution implementation plan

## Decision

UVC is distributed to the groov RIO as a signed application release installed
through Opto 22's licensed Shell/SSH surface. It is not distributed as groov
firmware, a disk image, or a Node-RED flow. Docker remains an optional advanced
artifact for firmware 4.0 and newer, not the default for the 1 GB MM1 target.

The first public compatibility target is deliberately narrow:

- model: `GRV-R7-MM1001-10`
- architecture: `armv7l`
- firmware: official stable `4.1.2` or newer in the `4.1` line
- Node.js: major 20 or 22, with release validation on both
- service manager: systemd
- installation authority: official `GROOV-LIC-SHELL` user with `sudo`

Opto 22 supports the standard hardware and firmware. Refinio owns support for
the UVC application, installer, service, storage, and all Shell modifications.

## Public release layout

The RIO release joins Refinio's existing signed release-root contract:

```text
https://refinio.one/downloads/uvc/
├── index.html
├── install-rio.sh
├── verify-refinio-release.mjs
├── current-release.json
├── release-trust-root.json
└── history/stable/<version>.json

https://refinio.one/installers/uvc/
└── uvc-rio-<version>.tar.gz
```

The immutable archive must be uploaded before `current-release.json` is
switched. The manifest and archive are signed by the existing `42` release
root. A RIO release must not mint another trust root.

## Archive contract

```text
uvc-rio-<version>/
├── app/uvc-headless.mjs
├── bin/
│   ├── backup
│   ├── doctor
│   ├── install
│   ├── recovery-crypto.mjs
│   ├── restore
│   ├── rio-common
│   ├── rollback
│   └── run
├── config/uvc.env.example
├── systemd/uvc-headless.service
├── build-info.json
├── release.json
├── sbom.spdx.json
└── THIRD_PARTY_NOTICES
```

The archive never contains a groov API key, controller credentials, ONE
storage, device identity, provisioning state, or preselected I/O channel.

## Device layout

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

Releases are immutable. Updates switch `current` atomically and never replace
`shared`. A failed readiness check switches back to the previous release.

## Work packages

### 1. Packaging and target lifecycle

- Build a versioned `.tar.gz` from a syntax-checked headless bundle.
- Generate compatibility and file-digest metadata.
- Install or update through a single target-side transaction.
- Keep explicit `current` and `previous` release links.
- Bind the diagnostic HTTP endpoint to loopback.
- Run as the Shell user, with secrets loaded from a mode-0600 environment file.
- Use journald rather than an unbounded application log.

### 2. Operator workflow

- Provide a host-side SSH installer for online and local-archive installs.
- Verify the Refinio manifest, Merkle proof, signature chain, and archive hash.
- Provide `doctor`, `rollback`, and consistent-state `backup` commands.
- Keep SSH available as the break-glass service-control path, restricted to a
  trusted management network. Do not disable it until an independent,
  authenticated path can inspect and restart the UVC service.

### 3. RIO runtime profile

- Produce a dedicated build-time Groov control profile from `vger.headless`.
- Include ONE identity/storage, provisioning, QUICVC, Glue/CHUM, discovery,
  phone-book/control tries, Groov authority, and health operations.
- Exclude browser HTML, WhatsApp, embeddings, sellers, MCP, model code, agent
  workers, and unrelated refinement scripts at build time.
- Produce no unresolved package imports in the RIO artifact.

This work belongs to the VGER workspace. Until that entry point lands, the
archive builder accepts the current clean VGER headless bundle explicitly; it
does not pretend runtime `--no-*` flags make the generic build minimal.

### 4. Signed publication

- Generalize Refinio's desktop-shaped manifest generator to accept an arbitrary
  artifact list.
- Register one additive `uvc` release surface under `/downloads/uvc`.
- Publish RIO as `groov-rio/armv7` within that release, without colliding with
  the Electron `linux/*` artifact.
- Require the canonical `42` signer and publish immutable history.

This work belongs to the Refinio and ONE settings workspaces. The UVC package
produces a publication descriptor so that integration does not infer artifact
metadata from filenames.

## Release gates

A public release is rejected unless validation records:

- execution on ARMv7
- Node 20 and Node 22 compatibility
- supported model and official firmware detection
- clean first install
- uncommissioned discovery and readiness
- commissioned restart
- upgrade with preserved identity and ONE storage
- automatic rollback after failed activation
- explicit rollback command
- consistent backup before firmware maintenance
- recovery after firmware replacement
- QA discovery/provisioning/control protocol on the live RIO
- complete SBOM and third-party notices

## Non-goals

- redistributing Opto 22 firmware
- bypassing the official Shell license or access controls
- changing groov firewall or disabling SSH without an explicit operator action
- unattended production activation of releases
- automatic I/O writes during installation or tests
