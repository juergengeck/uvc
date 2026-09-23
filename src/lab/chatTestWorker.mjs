// Test-only lane worker with one read-only storage probe. The probe lets the
// privacy integration test ask whether a foreign worker received a specific
// Topic identity; it does not ship in the browser worker bundle.
import { MessageChannel, parentPort } from 'node:worker_threads';
import '@refinio/one.core/lib/system/load-nodejs.js';

const init = await new Promise(resolve => parentPort.once('message', resolve));

try {
  const [{ startLaneInstance, laneUrl }, { hasVersionHead }] = await Promise.all([
    import('./laneInstance.ts'),
    import('@refinio/one.core/lib/storage-versioned-objects.js'),
  ]);
  const port = {
    postMessage: (message, transfer) => parentPort.postMessage(message, transfer),
    addEventListener: (type, listener) => {
      parentPort.on(type === 'message' ? 'message' : type, data => listener({ data }));
    },
    start() {},
  };
  parentPort.on('message', async message => {
    if (message?.kind !== 'chat-test-has-topic') return;
    let visible = false;
    let error;
    try {
      visible = await hasVersionHead(message.topicId);
    } catch (cause) {
      error = String(cause?.message ?? cause);
    }
    parentPort.postMessage({ kind: 'chat-test-has-topic-result', id: message.id, visible, error });
  });
  await startLaneInstance({
    port,
    role: init.key,
    lane: init.lane ?? 'chat-test-lane',
    email: init.email,
    secret: init.secret,
    directory: init.directory,
    endpoint: { kind: 'lab', url: laneUrl(init.key) },
    createMessageChannel: () => new MessageChannel(),
    commServerUrl: init.commServerUrl,
    appBaseUrl: init.appBaseUrl,
  });
} catch (error) {
  parentPort.postMessage({ kind: 'boot-failed', key: init?.key, error: String(error?.stack ?? error) });
}

