# UVC release flow for refinio.one

The UVC workspace owns release preparation and validation. The Refinio workspace
continues to own the 42-root signing key, signed manifest generation, shared
downloads catalog, and deployment of `https://refinio.one/downloads/uvc/`.

The supported entry point is:

```bash
npm run release:refinio-one
```

## Safety and provenance

Before it can publish, the release command requires:

- clean UVC, ONE, VGER, and Refinio checkouts, unless
  `--allow-dirty-inputs` is explicitly supplied;
- every input checkout's `HEAD` to equal its current pushed `origin` branch;
- synchronized `packages/uvc.cube` and `packages/uvc.groov` versions;
- a release version newer than the current `latest` UVC manifest;
- exactly one Windows x64, Linux x64, groov RIO armv7, and ESP32-C6 artifact;
- successful artifact verification and release contract tests.

`--allow-dirty-inputs` does not permit unpushed commits. `--allow-same-version`
permits an intentional same-version republish but never permits downgrading the
`latest` release.

## Version assignment

Run the release command without `--version`. If the current package version is
not newer than the live UVC release, the command updates both package versions
to the next patch and stops. Commit and push that version change before building
artifacts:

```bash
npm run release:refinio-one
git add package-lock.json \
  packages/uvc.cube/package.json packages/uvc.cube/package-lock.json \
  packages/uvc.groov/package.json packages/uvc.groov/package-lock.json
git commit -m "chore(release): prepare UVC 0.1.1"
git push
```

The command deliberately stops after changing versions so no artifact can be
built or signed from source state that differs from the pushed release input.

## Artifact locations

By default, version `VERSION` is assembled from:

```text
packages/uvc.cube/release/UVC-Cube-VERSION-setup.exe
packages/uvc.cube/release/UVC-Cube-VERSION-x86_64.AppImage
release/VERSION/uvc-rio-VERSION.tar.gz
release/VERSION/uvc-esp32c6-VERSION.tar.gz
```

The four targets require different toolchains, so the release command does not
silently rebuild them on the operator's host. Build them with their owning
package/toolchain, then run the guarded release command. Paths can be overridden
with `--windows-artifact`, `--linux-artifact`, `--rio-artifact`, and
`--esp32-artifact`.

Desktop packages:

```bash
npm --prefix packages/uvc.cube run dist:windows
npm --prefix packages/uvc.cube run dist:linux
```

Public groov RIO package, after producing `/tmp/vger-deploy/bundle.mjs` and its
esbuild metafile from the VGER headless package:

```bash
VERSION=0.1.1
NO_WHATSAPP=1 NO_FOTOS=1 pnpm --dir ../vger/packages/vger.headless bundle
node packages/uvc.groov/scripts/generate-rio-compliance.mjs \
  --metafile /tmp/vger-deploy/bundle-meta.json \
  --bundle-cwd ../vger/packages/vger.headless \
  --version "$VERSION" \
  --output-dir "release/$VERSION"
node packages/uvc.groov/scripts/build-rio-release.mjs \
  --public \
  --bundle /tmp/vger-deploy/bundle.mjs \
  --sbom "release/$VERSION/uvc-rio-$VERSION.sbom.spdx.json" \
  --notices "release/$VERSION/uvc-rio-$VERSION.THIRD_PARTY_NOTICES" \
  --version "$VERSION" \
  --output-dir "release/$VERSION"
```

ESP32-C6 public firmware:

```bash
npm run build:esp32-release -- --version 0.1.1
```

Set `IDF_PATH` to the ESP-IDF version pinned by the firmware project's
`dependencies.lock` (currently v5.5.5). The build helper honors that path even
when another `idf.py` is already on `PATH`, and rejects a mismatched SDK before
starting the build.

## Validate and publish

Validate the complete flow without changing the live site:

```bash
npm run release:refinio-one -- --version 0.1.1 --dry-run
```

Before the release commits have been pushed, local pipeline development can use
`--skip-provenance-check --dry-run`. The script rejects that bypass unless dry
run mode is active, so it cannot weaken a publication.

Publish after the dry run succeeds:

```bash
npm run release:refinio-one -- --version 0.1.1
```

The command regenerates `release/VERSION/uvc-release-artifacts.json`, invokes
the existing UVC publisher, and leaves signing and additive downloads deployment
inside `refinio.one`. To validate or publish a previously assembled descriptor,
pass `--use-existing-descriptor --artifacts-file PATH`.

The lower-level `npm run publish:release` command remains available for the
publisher stage, but normal operator releases should use `release:refinio-one`
so source provenance and version assignment are checked first.
