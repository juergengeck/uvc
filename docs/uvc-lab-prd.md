# PRD: UVC Lab Lane (Browser)

Status: implemented · Entry: `/lab` (expo-router) · Lane: four browser worker roles
(`admin`, `doctor`, `lamp`, `sensor`) side by side in a single browser tab

## 1. Problem

Validating UVC room sanitization, device pairing, cycle orchestration, and compliance
signing previously required multiple physical devices (phones, tablets, and ESP32
optical sensors/fixtures). Developers and clinical operators had no lightweight way
to boot the entire clinical workflow — clinical operator, compliance administrator,
germicidal UVC lamp, and optical radiometer sensor — side by side in a single browser
tab for immediate validation, UI development, and demonstration.

## 2. Goals

1. Boot four **isolated** browser roles in one tab:
   - **Doctor**: Room Sanitization Controller (clinical mobile app view).
   - **Admin**: Compliance & Quality Assurance (clinical director mobile app view).
   - **Lamp**: 254nm Germicidal UVC Emitter (physical hardware fixture simulator).
   - **Sensor**: Optical Radiometer Probe (industrial photodiode LCD simulator).
2. Realistic application and simulator experiences:
   - Real mobile app frames for `doctor` and `admin` with clinical operational flows
     (plan phase, cycle dispatch, emergency stop, team chat, compliance queue, one-click
     sign & certify, cryptographic seal).
   - Rich interactive hardware graphics for `lamp` (quartz tube, 254nm ultraviolet
     luminescence rays, wattage, temperature, power toggle) and `sensor` (quartz dome,
     high-contrast digital LCD irradiance/dose readout, manual capture, 1 Hz auto-meter).
3. Automated mesh pairing & IoM second-device enrollment:
   - Automatic handover pairing over CommServer.
   - Per-role IoM (Internet of Me) invitation QR codes for seamless physical phone
     enrollment as a secondary device.
4. Compliance & Auditability (EN 17141):
   - Strict adherence to EN 17141 posture: cycles document delivered optical energy
     against planned sanitization phases as execution evidence (never microbiological proof).
   - One-click cryptographic signing of completed cycles with immutable audit trail.
5. Zero dependency on physical hardware during lab development and automated testing.

## 3. Non-goals

- No replacement for physical hardware testing: physical ESP32 and groov controllers
  will be bridged via WebSocket/serial adapters in subsequent phases.
- Microbiological efficacy validation (lane records physical and optical telemetry only).
- Production private key storage in the browser (synthetic identities `@lab.local` only).

## 4. Users and Roles

- **Doctor (`doctor@lab.local`)**:
  - Sets disinfection parameters (phase title, target dose in J/m², duration in seconds).
  - Starts cycles, monitors live dose delivery, and executes emergency off when necessary.
  - Sends and receives real-time coordination messages in the clinical suite.
- **Admin (`admin@lab.local`)**:
  - Monitors mesh health and trusted peer nodes in the clinical zone.
  - Reviews completed, uncertified cycles in the EN 17141 certification queue.
  - Signs and certifies cycles, creating cryptographic audit seals with actor and sensor hashes.
- **Lamp Simulator (`lamp@lab.local`)**:
  - Simulates a 254nm low-pressure mercury/excimer quartz UVC emitter.
  - Reports operational telemetry (tube temperature, wattage, power state).
  - Emits simulated energy pulses (+500 mJ) to active cycles.
- **Sensor Simulator (`sensor@lab.local`)**:
  - Simulates an optical radiometer probe with a quartz diffuser window.
  - Reports instantaneous irradiance (`mW/cm²`) and integrates cumulative dose (`J/m²`).
  - Supports manual sample readings and continuous 1 Hz auto-metering.

## 5. Architecture & Components

```text
/lab (Expo Router Route)
 ├── Lane Shell & Header (Mesh Status, Reboot, EN 17141 Compliance Badge)
 ├── Four Role Columns:
 │    ├── [Doctor Column]  -> DoctorAppColumn (Phone Frame, Plan, Cycle Control, Chat)
 │    ├── [Admin Column]   -> AdminAppColumn (Phone Frame, Certification Queue, Seal)
 │    ├── [Lamp Column]    -> LampSimulatorColumn (Quartz Emitter SVG/CSS, Glow, Telemetry)
 │    └── [Sensor Column]  -> SensorSimulatorColumn (Radiometer LCD, Irradiance, Dose)
 ├── Diagnostics & Hardware Drawer (Collapsible per role):
 │    ├── Identity & Instance Details
 │    ├── Handover Links & IoM Peer Flags
 │    ├── Raw Event Journal Tail
 │    └── IoM Second-Device QR Code (InviteManager)
 └── Background Web Worker (public/lane.worker.js)
      ├── Role Instances: admin, doctor, lamp, sensor
      ├── ONE Core Storage & Identity Handover
      └── In-Memory Message Port Mesh
```

## 6. Verification & Testing

- **Unit & Mesh Tests**:
  `npm run test:lane` runs unit tests and in-process 4-role worker mesh tests verifying:
  - Role identity isolation (`ownerId === personId`).
  - CommServer handover & peer link flags (`isInternetOfMe`).
  - Chat thread delivery across all peers.
  - Full sanitization cycle lifecycle: Plan Phase -> Start Cycle -> Meter Energy -> Sign Cycle.
- **Worker Bundle**:
  `npm run build:lane-worker` compiles `scripts/build-lane-worker.mjs` into `public/lane.worker.js`.
- **Browser Route**:
  Verified via Metro / Expo web server at `http://localhost:8081/lab`.

## 7. Operator Guide

1. Navigate to `/lab` in any modern web browser.
2. Observe automatic worker anchoring, mesh pairing, and status transition to **Live Lane**.
3. In the **Doctor** column:
   - Configure a sanitization phase (e.g., Target: `250 J/m²`, Duration: `120s`).
   - Click **Start Cycle**.
4. In the **Lamp** column:
   - Observe the quartz tube ignite with vibrant 254nm ultraviolet luminescence rays.
   - Click **Pulse Energy (+500 mJ)** to inject delivered dose packets.
5. In the **Sensor** column:
   - Observe the digital LCD reflect active irradiance (e.g., `4.25 mW/cm²`).
   - Click **Auto-Meter** to simulate continuous optical dose integration.
6. In the **Doctor** column:
   - Click **Emergency Off** or wait for cycle completion.
7. In the **Admin** column:
   - The completed cycle appears in the **EN 17141 Certification Queue**.
   - Click **Sign & Certify Cycle**.
   - The cycle transitions to **CERTIFIED** with an immutable cryptographic seal.
8. (Optional) In any column's Diagnostics Drawer:
   - Scan the IoM QR code with the Expo mobile app on a physical phone to bind it as a second device.
