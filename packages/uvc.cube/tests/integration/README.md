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

The previous mDNS, recipe, and firmware-source probe remains available as:

```bash
npm run test:integration:probe
```

It is diagnostic coverage, not the full-product integration test.
