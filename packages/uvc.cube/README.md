# uvc.cube

`uvc.cube` is an independent desktop ONE instance for the UVC workspace.

It is intentionally modeled after the high-level `vger.cube` split:

- `src/main/` owns Node/Electron lifecycle and IPC
- `src/preload/` exposes a narrow browser bridge
- `src/renderer/` holds the React UI

The renderer is only a view. Electron main owns one configurable Person/Instance,
its persisted UVC tries, mDNS publication/browsing, and plan IPC using
[`../../docs/peer-discovery-phone-book.md`](../../docs/peer-discovery-phone-book.md).
It does not treat an HTTP authority URL as discovery or create a renderer-local
phone book.

## Scripts

```bash
npm install
npm run dev
npm run build
npm run typecheck
npm run test:integration
npm run test:integration:probe
```

## Runtime state

- Identity is configured in the Cube identity settings section and takes effect
  after restart.
- `_one-refinio._udp` is advertised from the bound Instance key.
- Valid discoveries are appended to the durable phone-book trie.
- Approval remains disabled until ONE pairing completes; mDNS is not trust.
- The canonical integration runner is owned by the running Cube and exercises
  live discovery, persisted phone-book state, pairing, control/readback, and
  journal evidence. See [`tests/integration/README.md`](tests/integration/README.md).
- The standalone QA probe checks real-LAN advertisements, recipes, and the
  firmware source contract; it is diagnostic rather than full-product coverage.
- Both runners emit evidence below `tests/integration/reports/`.
