# UVC downloads and release plan

## Outcome

Refinio publishes one new, additive UVC section:

```text
https://refinio.one/downloads/uvc/
├── index.html
├── current-release.json
├── release-trust-root.json
├── install-rio.sh
├── verify-refinio-release.mjs
└── history/<channel>/<version>.json

https://refinio.one/installers/uvc/
├── UVC-Cube-<version>-setup.exe
├── UVC-Cube-<version>-x64.AppImage
├── uvc-rio-<version>.tar.gz
└── uvc-esp32c6-<version>.tar.gz
```

The existing `/downloads/` Flexibel release, `/downloads/edda/`,
`/downloads/vger/`, and legacy installer aliases are unchanged. The shared
catalog skips UVC until its first signed manifest exists, then appends UVC
without changing existing entries.

## Signed artifact contract

All four initial artifacts are signed into one manifest using the existing canonical
42 release root:

| Platform | Architecture | Artifact |
| --- | --- | --- |
| `windows` | `x64` | Electron NSIS installer |
| `linux` | `x64` | Electron AppImage |
| `groov-rio` | `armv7` | Shell-installed application archive |
| `esp32` | `esp32c6` | ESP-IDF flash bundle |

`groov-rio` is intentionally not called `linux`: the platform identity must
not collide with the desktop Linux build. The browser verifies the trust-root
fingerprint, publisher certificate, artifact signatures, manifest signature,
and Merkle proofs before enabling links.

## Build workflow

1. Build Electron artifacts from `packages/uvc.cube` using
   `npm run dist:windows` and `dist:linux`. macOS is not part of the initial
   public release.
2. Build the RIO archive with `packages/uvc.groov/scripts/build-rio-release.mjs`.
   Public builds require complete notices and an SBOM.
3. Rebuild ESP-IDF with empty or placeholder bootstrap Wi-Fi values, then run:

   ```bash
   node scripts/build-esp32-release.mjs --version 0.1.0
   ```

   The builder rejects non-placeholder credentials, stale binaries, the wrong
   chip target, or a flash map other than the ESP-IDF-produced map. Operators
   flash with Espressif `esptool`; Wi-Fi is provisioned over UVC's BLE flow.
4. Assemble the exact four-artifact descriptor:

   ```bash
   node scripts/create-release-artifacts.mjs \
     --version 0.1.0 \
     --windows packages/uvc.cube/release/UVC-Cube-0.1.0-setup.exe \
     --linux packages/uvc.cube/release/UVC-Cube-0.1.0-x64.AppImage \
     --rio /tmp/uvc-rio-release/uvc-rio-0.1.0.tar.gz \
     --esp32 release/0.1.0/uvc-esp32c6-0.1.0.tar.gz \
     --output release/0.1.0/uvc-release-artifacts.json
   ```
5. Publish from the UVC workspace. This validates package versions, the exact
   four-artifact descriptor, artifact hashes, and release tests before handing
   signing and additive publication to Refinio:

   ```bash
   npm run publish:release -- --version 0.1.0
   ```

   Use `--dry-run` to execute every local release gate without changing the
   live publication.

The publisher loads the existing 42 key, signs and locally verifies the
manifest, uploads immutable artifacts to `/opt/refinio/installers/uvc`,
regenerates the shared catalog, performs the additive public deployment, then
downloads and hashes every live artifact again.

## Official support boundaries

Opto 22 officially exposes custom programming through licensed Shell/SSH on
groov RIO, but explicitly limits product support for Shell-modified devices.
The operator must obtain and enable `GROOV-LIC-SHELL`; the UVC installer does
not bypass it. Refinio owns the application, service, upgrades, rollback, and
recovery. UVC does not redistribute or modify Opto 22 firmware.

ESP32 flashing follows Espressif's official `esptool` workflow and the exact
offsets emitted by ESP-IDF. Electron packages are independent application
artifacts, not OS images.

## Release gates

- Electron packages install, launch, and persist state on every declared OS
  and architecture; signing/notarization policy is satisfied before a stable
  release.
- RIO passes the hardware, firmware, ARMv7, install, upgrade, rollback,
  backup/recovery, SBOM, notices, and provisioning gates in the RIO plan.
- ESP32 is rebuilt from a public bootstrap configuration, contains no network
  credentials, flashes successfully on ESP32-C6, and completes BLE Wi-Fi and
  ownership provisioning.
- The generated manifest verifies locally and every live artifact verifies by
  size and SHA-256 after deployment.
- Existing Flexibel, Edda, VGER, installer, and catalog contract tests remain
  green.

No placeholder or locally configured artifact may be published merely to make
the UVC section appear populated. The page can exist before the first release
and reports that no signed release is available.
