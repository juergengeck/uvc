# UVC Lab Lane — operator runbook

Four browser worker roles (`admin`, `doctor`, `lamp`, `sensor`) in one tab at
`/lab` (with backward-compatible aliases for `user` and `light`). They register,
pair over the CommServer handover, run metered disinfection cycles, and the admin
signs the sensor and actor recordings.

The lane presents:
1. **Doctor App**: Realistic clinical mobile app for room sanitization planning,
   cycle initiation, emergency halt, active dose tracking, and team messaging.
2. **Admin App**: Realistic clinical director mobile app for EN 17141 compliance
   certification queues, one-click sign & certify, and mesh trust monitoring.
3. **Lamp Simulator**: Physical UVC emitter fixture graphic featuring quartz glass tube,
   glowing 254nm ultraviolet luminescence rays, tube temperature & wattage telemetry,
   hardware toggle, and energy delivery pulses.
4. **Sensor Simulator**: Industrial optical radiometer probe featuring an optical quartz
   sensor dome, high-contrast digital LCD readout (`mW/cm²` irradiance, `J/m²` dose),
   manual sample capture, and 1 Hz continuous metering.
5. **Diagnostics Drawer**: Collapsible low-level telemetry drawer beneath each role for
   raw ONE connection states, event journals, and IoM enrollment QR codes.

Lane posture (EN 17141): a completed cycle documents delivered energy against
the planned phase. It is execution evidence, never a conformance claim and
never microbiological evidence. Lane accounts are synthetic
(`<role>@lab.local`); no secrets leave the browser.

## Build

```bash
npm run build:lane-worker   # esbuild -> public/lane.worker.js (git-ignored)
npx expo export --platform web   # emits dist/, copies the worker asset
```

The `/lab` route spawns the worker by URL (`/lane.worker.js`); Metro cannot
bundle workers, so the bundle step is mandatory — without it the columns
stay in "waiting for worker".

## Test

```bash
npm run test:lane            # 45 tests: units + 4-role worker mesh
```

The mesh test boots real lane workers in worker threads, pairs them over the
in-process `lab:` transport, and proves identity isolation, IoP flags, chat
arrival, same-email person reproduction with foreigner refusal, and a full
planned → metered → signed cycle with journal evidence. Live CommServer
pairing was additionally proven headless once (see `/tmp/uvc-lab-spike/`;
throwaway probe, not committed).

## Operate

Open `/lab` in a browser (`http://localhost:8081/lab`). Boot takes seconds:
worker anchors, mesh pairing, welcome chat, then per-role IoM QRs. The header
flips to Live Lane when all four columns report.

### Role Interfaces & Operation Flow

1. **Doctor App (Room Sanitization Controller)**:
   - **Plan Phase**: Enter a target phase title (e.g. `OR-4 Pre-Op Surface Disinfection`),
     required target dose (default `250 J/m²`), and planned duration (`120s`).
   - **Start Cycle**: Dispatches the planned cycle across the mesh.
   - **Emergency Off**: Halts the cycle immediately, extinguishing lamp emission and
     closing the running cycle in the journal.
   - **Team Comms**: View and send real-time coordination messages to other actors in the suite.

2. **Lamp Simulator (254nm Germicidal Fixture)**:
   - **Fixture Graphic**: Renders a high-output quartz glass emitter tube with cathode/anode
     filaments. When energized (`ON`), projects vivid 254nm ultraviolet luminescence with
     dynamic radiation rays and warning indicators.
   - **Telemetry**: Displays rated wattage (55W / 0W standby) and surface tube temperature.
   - **Manual Power Toggle**: Switch the lamp emitter state directly from the fixture panel.
   - **Energy Delivery**: Pulses delivered dose packets (+500 mJ) recorded directly into the
     active cycle ledger.

3. **Sensor Simulator (Optical Radiometer Probe)**:
   - **Probe Graphic**: Renders a germicidal optical sensor dome with quartz diffuser window
     tuned for 254nm spectral sensitivity.
   - **Digital LCD Readout**: Displays high-contrast industrial measurements:
     - Real-time Irradiance: `mW/cm²` (drops to baseline when lamp is OFF).
     - Accumulated Dose: `J/m²` integrated over cycle exposure.
   - **Sample Reading**: Trigger immediate manual optical acquisition.
   - **Auto-Meter**: Toggle continuous 1 Hz integration loop for automated exposure metering.

4. **Admin App (Compliance & Quality Assurance)**:
   - **Certification Queue**: Unsigned completed cycles automatically appear with target vs.
     measured dosage summaries.
   - **Sign & Certify**: One-click EN 17141 certification cryptographically signs the record
     with the Admin's private key, generating an immutable timestamped audit seal.
   - **Mesh Trust Monitor**: Real-time view of trusted counterparty nodes in the clinical zone.

5. **IoM Second-Device Enrollment**:
   - Expand the "Hardware & Diagnostics" drawer at the bottom of any column.
   - Scan the rendered IoM QR code with a mobile device running the Expo app to enroll the
     phone as an additional trusted device for that role's identity.

### Troubleshooting

- A red notice names the column and step.
- `signed in as a different person than the seeded pairing`: Worker storage predates the lane.
  Click "Reset & Re-anchor" or clear browser site data, then reload.
- `IoM invite unavailable` past a minute: Worker initialization stalled. Click "Reboot Lane".
- Individual columns are isolated: an issue in one role never crashes the other three.

## Architecture

```text
/lab (Web browser tab)
 ├── Lane Header (Mesh Status, Reboot, EN 17141 Badge)
 ├── Grid of 4 Roles:
 │    ├── [Doctor]  -> Clinical Phone Frame (Plan, Cycle Control, Chat, Progress)
 │    ├── [Admin]   -> Compliance Phone Frame (Queue, Sign & Certify, Audit Trail)
 │    ├── [Lamp]    -> Physical UVC Fixture Graphic (Quartz Tube, Glow Rays, Telemetry)
 │    └── [Sensor]  -> Optical Radiometer Graphic (LCD Display, Irradiance, Dose)
 └── Diagnostics Drawers (per role):
      ├── ONE Identity & Instance IDs
      ├── Handover Links & IoM Flags
      ├── Device Event Journal
      └── IoM Enrollment QR
```

## Follow-ups (out of scope)

1. Live browser run (4 workers + relay + UI) — verify manually on the dev server:
   all paired, correct IoM flags, chat arrived, full signed cycle, all QRs rendered.
2. ESP32 bridging service (telemetry → sensor feed, hardware column).
3. ONE AffirmationCertificate issuance for cycle signatures (lane-local
   signed records already carry signer, role, timestamp, record hashes).
4. Committed E2E automation; optional Reset-lane action.
