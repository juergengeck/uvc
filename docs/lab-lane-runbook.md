# UVC lab lane

`/lab` is a development workspace with independent Admin, Doctor, Lamp and Sensor
workers. It uses the current Amway/EK pattern: staged startup, semantic object
feeds, separate worker storage, a host-switched local mesh and a separate
CommServer transport for joining devices. The Flexibel-style lane shows fixed
360 × 640 mobile views in Admin, Doctor,
Lamp, Sensor order. All four apps stay side by side in one row, with independent
vertical scrolling. Each IoM QR invitation sits below its app, outside the mobile view.
Narrow windows scroll the lane horizontally. A joining device shows only its own app.

The real UVC logo and shared green palette identify the workspace. All hardware
inputs are explicitly simulated. Admin attestations sign exact received record
versions. They attest to the recorded changes, not hygiene, dose achievement or compliance.

## Build and run

```sh
npm run build:lane-worker
npx expo start --web --port 8081
# Or create a static web build:
npx expo export --platform web
```

Open `http://localhost:8081/lab`. The worker build is required because Metro does
not bundle Web Workers. Static hosting must serve `/lane.worker.js` and route
`/lab` to the application. Use HTTPS or localhost for browser crypto support.

Startup reports worker initialization, role anchors, each peer pairing and a
welcome message with verified arrival. A failed pair produces a partial status,
not a successful mesh claim. Each pair is checked against both expected Person
and Instance identities. Activity retains the latest 200 events.

## Production deployment

Run `./deploy.sh` to build the worker and Expo app, preserve the public website
from `../one.uvc/html`, and publish the combined output to Cloudflare Pages
(`uvc-one`, production branch `main`). Set `UVC_WEBSITE_DIR` to use another local
copy of those website assets. `./deploy.sh --build-only` assembles the same output
in `.expo/pages-deploy` without publishing.

The website remains at `/`; `/app/` redirects to the updated `/journal` app.
Calendar is `/calendar`, and the four-instance lab is `/lab`. The deployment
allows the Glue relay used by IoM pairing and serves the lab worker without a
long-lived cache. The app's worker URL includes the worker bundle's SHA-256 build
version, preventing an older cached worker from running against newer app APIs.

## Exercise a cycle

1. In Lamp, enter a phase title, target dose and duration, then save it.
2. Start a cycle in Lamp. Select that cycle in Sensor after it replicates.
3. In Lamp, enter simulated energy in mJ and record it. Recording light on/off
   changes lab state only; it never operates physical hardware.
4. In Sensor, use **Record sensor on**, then enter simulated irradiance in mW/cm²
   and record it. The sensor starts off; **Record sensor off** stops further readings.
5. Admin automatically signs received lamp and sensor changes and shares the
   attestations with Doctor. **Device changes** shows pending and attested records.
   Signing runs in Admin's worker while the cycle is open and after later changes.
6. Doctor shows room-cleaning progress and verification status. Detailed device
   changes and the journal are available in Doctor’s Settings. Check the attestation
   there and in the Admin journal. The receiving
   worker verifies the signature before marking the corresponding changes attested.
7. Close the cycle in Lamp when recording is complete. Admin automatically
   attests the final closed version. Earlier attestations stay in both journals.

Lamp and sensor on/off changes also work without a cycle and are automatically
attested after they arrive at Admin. These manual simulations never operate physical hardware.
Signing processes changes in sequence and skips versions already attested, so
attestation feeds do not create a signing loop. Signing errors appear in Admin.

The view shows actual replicated record counts. It does not derive delivered
dose from a timer or random measurements. Contact chats and journals are projected
from storage. Admin and Doctor also project the shared Admin-owned attestation
stream into their journals, keeping Doctor's own entries independent. Admin can
explicitly publish role assignments.

## Contact chat

Chat follows Projektor's Amway lane: each app lists its other contacts with a
chat icon. Select a contact to open a private one-to-one conversation, send with
**Send** or Enter, and use **Close chat** to return to the contact list. Messages
show sender and time, with your own messages aligned to the right.

Messages use ONE TopicModel/TopicRoom channels shared only by the two people.
Closed conversations show unread badges; opening a conversation clears its badge.
Repeated text counts as separate messages, while replayed channel events do not
inflate unread counts. Switching to Settings keeps notification subscriptions
active. Each app's XLSX export includes its own contact-chat history.

## Join another device

Scan the IoM QR below the desired app. Invitations are minted once the workers
are ready; use **New QR invite** below that app to renew an invitation. Invitations
expire after ten minutes, and open `/lab?role=…&invited=true…` with the
pairing payload in the fragment. The second browser boots just that role and
requires **Join device** to accept the invitation. The worker validates the
canonical protocol and exact owner identity. Keep the originating browser open.
To publish team records from the joining device, first use **Publish role assignments**
on the original Admin. The joining worker reads that replicated role list to
select the actual team audience, and refuses incomplete assignments.
The default relay is `wss://api.glue.one/comm`; a `commServer` query parameter may
select a ws/wss test relay. For a physical phone, use a host address reachable
from that phone; localhost links refer to the phone itself.

Each app has its own Settings and theme control. Dark mode uses light logo lettering
with the original green checkmark on a transparent background.

Each visit has a fresh storage directory. Startup never deletes other sessions'
IndexedDB databases, since another tab may still use them. Unmounting terminates
workers and rejects outstanding calls. Clearing site data remains a browser action.

## Data

**Settings → Data → Export XLSX** inside each app reads that worker’s snapshot and downloads
an Excel workbook with Workers, Connections, Cycles, Device changes, Attestations,
Journal and Messages plus
an Overview describing scope. Journal and message tails contain up to 20 recent
entries per worker. An export read failure is shown instead of an empty success.
This extract is not a backup. Product memory remains in the main application's
Settings → Data; the lab does not invent a memory collection.

## Verification

```sh
npm run test:lane
npx jest src/data --runInBand
npm run build:lane-worker
npx expo export --platform web
```

The lane suite exercises real worker-thread pairing and replication, identity
isolation, planned/recorded/closed/reviewed cycles, role management, transport
readiness, IPC lifecycle and strict invitation decoding. A live browser check
should additionally cover narrow/wide layouts, joining a second tab/device and
opening the downloaded XLSX. External relay availability is a separate concern
from the local mesh.
