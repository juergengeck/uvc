# UVC headless

Owns the Groov first-claim ceremony, provisioned identity activation, administrator
trust, UVC recipes, CHUM scope, and hardware control. VGER supplies the generic
headless host through typed lifecycle hooks; it does not depend on this package.
Shared ONE packages remain canonical in `../../../one/packages`.

From this directory, with `uvc`, `vger`, and `one` checked out alongside each other
and VGER's dependencies installed:

```sh
pnpm install
pnpm build
pnpm test
pnpm bundle
node bundle/uvc-headless.mjs --help
```

`build` prepares the VGER host and canonical UVC dependency through VGER's
peer-aware nodejs build, builds the sibling Groov authority, then compiles this
entrypoint. Local `link:` dependencies use those prepared checkouts.
The isolated pnpm workspace does not install the UVC Expo application.

For a local uncommissioned device:

```sh
node dist/cli.js --storage /tmp/uvc-device --device-type groov \
  --no-glue-services --no-whatsapp --no-seller-services --no-embeddings --no-mcp
```

On first boot UVC persists a random local storage secret and bootstrap login before
starting provisioning. Subsequent boots reuse it. A ready/active provisioning
state selects its certified person and instance while retaining the storage secret.
Missing credentials for an assigned identity fail startup. The
`--uvc-provisioning-state` option and `UVC_PROVISIONING_STATE_FILE` environment
variable are owned here. Provisioning completion restarts with exit code 75 under
the existing RIO service unit.

After `pnpm bundle`, package the UVC executable with:

```sh
node ../uvc.groov/scripts/build-rio-release.mjs --output-dir /tmp/uvc-rio-release
```

The release builder defaults to `bundle/uvc-headless.mjs` in this package and
requires the UVC CLI marker. Existing installed releases are not changed by a
source move or local build.
