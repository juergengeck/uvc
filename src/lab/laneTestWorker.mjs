// src/lab/laneTestWorker.mjs — test-only worker entry for lane.integration.test.ts.
//
// Boots one lane role against the in-process `lab:` endpoint (no external
// network). Browser parity: the role key arrives as the first message, since
// Vite worker chunks take no URL query. This helper is not a test itself and
// never ships to the app bundle.
import { MessageChannel, parentPort } from 'node:worker_threads';
// Platform first: every one.core storage/crypto call below needs it, and
// static imports evaluate before the init handshake below runs.
import '@refinio/one.core/lib/system/load-nodejs.js';

const init = await new Promise(resolve => parentPort.once('message', resolve));

try {
  const { startLaneInstance, laneUrl } = await import('./laneInstance.ts');
  const port = {
    postMessage: (message, transfer) => parentPort.postMessage(message, transfer),
    addEventListener: (type, listener) => {
      parentPort.on(type === 'message' ? 'message' : type, data => listener({ data }));
    },
    start() {},
  };
  await startLaneInstance({
    port,
    role: init.key,
    lane: init.lane ?? 'test-lane',
    email: init.email,
    secret: init.secret,
    directory: init.directory,
    endpoint: { kind: 'lab', url: laneUrl(init.key) },
    createMessageChannel: () => new MessageChannel(),
  });
} catch (error) {
  parentPort.postMessage({ kind: 'boot-failed', key: init?.key, error: String(error?.stack ?? error) });
}
