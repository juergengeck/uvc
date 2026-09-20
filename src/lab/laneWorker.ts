/**
 * Browser Web Worker entry for one lane role.
 *
 * The platform import must run before anything touches one.core storage.
 * The role key cannot travel in a worker URL (bundlers need a static entry),
 * so it arrives as the first message instead — the same handshake the Node
 * test worker uses, keeping both hosts wire-compatible.
 *
 * Each page load boots a fresh session: reloading into persisted worker
 * state wedges CHUM (paired and connected, but nothing flows), and one.models
 * offers no repair short of a fresh instance — so every load gets its own
 * storage directory and stale sessions are pruned.
 */
import '@refinio/one.core/lib/system/load-browser.js';
import { startLaneInstance } from './laneInstance.ts';
import type { LanePort } from './portIpc.ts';

interface LaneKeyMessage {
  kind: string;
  key?: string;
  lane?: string;
  email?: string;
  secret?: string;
  session?: string;
  relayUrl?: string;
}

const scope = self as unknown as DedicatedWorkerGlobalScope & {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent) => void) | null;
};

// The DOM scope's addEventListener takes a nullable listener, which can never
// satisfy LanePort's non-null contract by assignability — so the boundary cast
// lives here, once, instead of weakening the port type every consumer uses.
const port: LanePort = {
  postMessage: (message, transfer) => {
    if (transfer?.length) scope.postMessage(message, transfer as Transferable[]);
    else scope.postMessage(message);
  },
  addEventListener: (type, listener) => scope.addEventListener(type, listener as EventListener),
};

scope.onmessage = (event: MessageEvent) => {
  const message = event.data as LaneKeyMessage;
  if (message?.kind !== 'lane-key' || typeof message.key !== 'string') return;
  scope.onmessage = null;
  const key = message.key;
  const lane = typeof message.lane === 'string' && message.lane !== '' ? message.lane : 'lane';
  const session = typeof message.session === 'string' && message.session !== '' ? message.session : 'default';
  const email = typeof message.email === 'string' && message.email.includes('@') ? message.email : `${key}@lab.local`;
  const secret = typeof message.secret === 'string' && message.secret !== '' ? message.secret : `lab-${key}`;
  const relayUrl = typeof message.relayUrl === 'string' ? message.relayUrl : '';
  if (relayUrl === '') {
    scope.postMessage({ kind: 'boot-failed', key, error: 'UVC lab: lane worker needs a relayUrl.' });
    return;
  }
  const directory = `uvc-lab-${lane}-${key}-${session}`;
  startLaneInstance({
    port,
    role: key,
    lane,
    email,
    secret,
    directory,
    endpoint: { kind: 'commserver', url: relayUrl },
    createMessageChannel: () => new MessageChannel(),
  }).catch(error => {
    scope.postMessage({ kind: 'boot-failed', key, error: error instanceof Error ? error.stack : String(error) });
  });
  void pruneOldSessions(lane, key, directory);
};

/** Best-effort cleanup of previous loads' directories. Never blocks boot. */
async function pruneOldSessions(lane: string, key: string, keep: string): Promise<void> {
  try {
    const databases = await indexedDB.databases?.();
    if (!Array.isArray(databases)) return;
    const prefix = `uvc-lab-${lane}-${key}-`;
    await Promise.all(
      databases
        .map(entry => entry.name ?? '')
        .filter(name => name.startsWith(prefix) && name !== keep)
        .map(
          name =>
            new Promise<void>(resolve => {
              const request = indexedDB.deleteDatabase(name);
              request.onsuccess = () => resolve();
              request.onerror = () => resolve();
              request.onblocked = () => resolve();
            }),
        ),
    );
  } catch {
    // IndexedDB enumeration is not portable; stale sessions simply remain.
  }
}
