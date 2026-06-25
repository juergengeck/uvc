# uvc.cube

`uvc.cube` is a desktop-facing Electron shell for the UVC workspace.

It is intentionally modeled after the high-level `vger.cube` split:

- `src/main/` owns Node/Electron lifecycle and IPC
- `src/preload/` exposes a narrow browser bridge
- `src/renderer/` holds the React UI

This first pass keeps the runtime small and focused. It reads the local UVC
workspace, surfaces package/module availability, and leaves clear room for the
next layer of device, feed, and transport integration.

## Scripts

```bash
npm install
npm run dev
npm run build
npm run typecheck
```

## Near-Term Follow-Up

- add live device discovery and pairing views
- wire ESP32-CAM feed panels into the renderer
- connect desktop actions to UVC packages instead of filesystem inspection
