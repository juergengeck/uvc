# UVC Integration Harness

The canonical integration harness is owned by the running `uvc.cube` process.

Start Cube with a test-only shared secret on the deployed Glue relay:

```bash
UVC_E2E_SECRET=testpass123 \
UVC_COMM_SERVER_URL=wss://api.glue.one/comm \
npm run dev
```

Start the physical Expo development client in explicit integration mode. This
starts native discovery for the test without changing the user's persisted
discovery setting. The secret is compiled into this development bundle solely
to authenticate the narrow physical test action:

```bash
EXPO_PUBLIC_UVC_INTEGRATION=1 \
EXPO_PUBLIC_UVC_E2E_SECRET=testpass123 \
EXPO_PUBLIC_UVC_COMM_SERVER_URL=wss://api.glue.one/comm \
npx expo start --dev-client --lan
```

Then run the full protocol from another terminal:

```bash
UVC_E2E_SECRET=testpass123 npm run test:integration
```

When Expo is not already paired with Cube, provide the physical Apple device
identifier. The client delivers Cube's single-use invitation through the
app's registered `uvc.one` deep-link pairing path:

```bash
UVC_E2E_SECRET=testpass123 npm run test:integration -- \
  --expo-device '<device-id>'
```

The client checks the loopback API, starts `uvc-test-runner.runFullProtocol`,
polls Cube-owned status, and prints the evidence-report path.

Physical identity provisioning and hardware writes are opt-in:

```bash
UVC_E2E_SECRET=testpass123 npm run test:integration -- --provision-headless
UVC_E2E_SECRET=testpass123 npm run test:integration -- --exercise-write=esp32
```

With `--exercise-write=esp32`, the physical test reads the LED baseline, requires
correlated readback for `ON` and `OFF`, restores the initial state, and verifies
all three write commands in the current run's journal. Groov writes remain a
same-state readback check because they may address an externally wired output.

For a focused Cube-to-ESP32 LED cycle, run:

```bash
UVC_E2E_SECRET=testpass123 npm run test:integration:led
```

The focused test selects the single live commissioned ESP32 (or accepts
`--device-id <id>`), invokes the public `deviceControl` plan, requires correlated
producer controller acknowledgment for ON and OFF, holds ON for three seconds for visual
inspection, checks the typed journal evidence, and leaves the LED OFF even if
the main assertion fails. Use `--on-hold-ms <milliseconds>` to change the hold.
Controller acknowledgment proves that firmware successfully applied the configured
discrete-GPIO or addressable-RGB output; it does not by itself optically verify that
an attached LED emitted light.

The previous mDNS, recipe, and firmware-source probe remains available as:

```bash
npm run test:integration:probe
```

It is diagnostic coverage, not the full-product integration test.
