/**
 * The lane host's only job between workers: switch `lab:` dials to the
 * target worker's port. Shared by the integration test and the browser lane
 * host; it never reads lane data.
 */

import { LaneApiClient } from './portIpc.ts';
import type { LanePort } from './portIpc.ts';

export interface SpawnedLaneWorker {
  port: LanePort;
  terminate(): Promise<unknown> | unknown;
  onError(callback: (error: Error) => void): void;
}

interface ControlMessage {
  kind: string;
  key?: string;
  person?: string;
  error?: string;
  from?: string;
  url?: string;
  port?: MessagePort;
}

interface DialMessage {
  from: string;
  url: string;
  port: MessagePort;
}

export interface LaneHost<K extends string = string> {
  clients: Record<K, LaneApiClient>;
  persons: Record<K, string>;
  setSwitch(key: K, value: boolean): void;
  stop(): Promise<void>;
}

const DEFAULT_READY_TIMEOUT_MS = 120_000;

function asError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(error == null ? fallback : String(error));
}

function closeDial(port: MessagePort, reason: string): void {
  try {
    port.postMessage({ t: 'close', reason });
  } catch {
    // The other side may already have closed the transferred port.
  }
  try {
    port.close();
  } catch {
    // Closing is best effort during failure cleanup.
  }
}

export async function startLaneHost<K extends string>({
  keys,
  spawn,
  readyTimeoutMs = DEFAULT_READY_TIMEOUT_MS,
}: {
  keys: K[];
  spawn: (key: K) => SpawnedLaneWorker;
  /** Bound startup so a worker that never sends `ready` cannot leak the host. */
  readyTimeoutMs?: number;
}): Promise<LaneHost<K>> {
  if (!Number.isFinite(readyTimeoutMs) || readyTimeoutMs <= 0) {
    throw new RangeError('Lane host readyTimeoutMs must be a positive finite number.');
  }
  const workers = new Map<string, SpawnedLaneWorker>();
  const open = new Map<string, boolean>(keys.map(key => [key, true]));
  const routable = new Map<string, boolean>(keys.map(key => [key, false]));
  const pendingDials = new Map<string, DialMessage[]>(keys.map(key => [key, []]));
  const clients = {} as Record<K, LaneApiClient>;
  const persons = {} as Record<K, string>;
  const readyRejectors = new Map<string, (error: Error) => void>();
  let stopped = false;
  let stopPromise: Promise<void> | undefined;

  const stopInternal = (reason = new Error('Lane host stopped.')): Promise<void> => {
    if (stopPromise) return stopPromise;
    stopped = true;
    for (const rejectReady of readyRejectors.values()) rejectReady(reason);
    readyRejectors.clear();
    for (const key of open.keys()) open.set(key, false);
    for (const client of Object.values(clients) as LaneApiClient[]) client.fail(reason);
    for (const [target, queued] of pendingDials) {
      for (const { from, port } of queued) {
        closeDial(port, `lane host stopped before ${target} became reachable from ${from}`);
      }
      pendingDials.set(target, []);
    }
    stopPromise = Promise.allSettled([...workers.values()].map(handle => Promise.resolve().then(() => handle.terminate()))).then(
      () => undefined,
    );
    return stopPromise;
  };

  const ready = keys.map(
    key =>
      new Promise<void>((resolve, reject) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let client: LaneApiClient | undefined;
        const finish = (error?: Error): void => {
          if (settled) return;
          settled = true;
          if (timer !== undefined) clearTimeout(timer);
          readyRejectors.delete(key);
          if (error) reject(error);
          else resolve();
        };
        readyRejectors.set(key, error => {
          client?.fail(error);
          finish(error);
        });
        try {
          const handle = spawn(key);
          client = new LaneApiClient(handle.port);
          workers.set(key, handle);
          clients[key] = client;
          const fail = (error: unknown): void => {
            const failure = asError(error, `Lane ${key} failed.`);
            client?.fail(failure);
            finish(failure);
          };
          handle.onError(fail);
          client.onControl(message => {
            // Control traffic arrives on the owning worker's own port, so the
            // closure key — not the message body — identifies the sender.
            const msg = message as ControlMessage;
            if (msg?.kind === 'routing-ready') {
              routable.set(key, true);
              flushDials(key);
            } else if (msg?.kind === 'ready') {
              if (typeof msg.person !== 'string') return;
              persons[key] = msg.person;
              finish();
            } else if (msg?.kind === 'boot-failed') {
              fail(new Error(`Lane ${key} failed to boot: ${msg.error ?? 'unknown error'}`));
            } else if (msg?.kind === 'chum-accept-failed') {
              // A competing persisted route can win while the other is still
              // being accepted. ConnectionsModel owns that retry/replacement
              // lifecycle; surfacing it here only strands startup work.
              console.warn(`Lane ${key} rejected an incoming connection: ${msg.error}`);
            } else if (msg?.kind === 'chum-dial') {
              switchDial(msg as unknown as DialMessage);
            }
          });
          if (!settled) {
            timer = setTimeout(
              () => fail(new Error(`Lane ${key} did not become ready within ${readyTimeoutMs}ms.`)),
              readyTimeoutMs,
            );
            (timer as { unref?: () => void }).unref?.();
          }
        } catch (error) {
          const failure = asError(error, `Lane ${key} failed to spawn.`);
          client?.fail(failure);
          finish(failure);
        }
      }),
  );

  function deliverDial({ from, url, port }: DialMessage, target: string): void {
    const handle = workers.get(target);
    if (!handle || !open.get(target) || !open.get(from)) {
      closeDial(port, `lane host: ${target} unreachable from ${from}`);
      return;
    }
    try {
      handle.port.postMessage({ kind: 'chum-accept', url, port }, [port]);
    } catch (error) {
      closeDial(port, `lane host: ${target} failed to accept from ${from}: ${String(error)}`);
    }
  }

  function flushDials(target: string): void {
    const queued = pendingDials.get(target) ?? [];
    pendingDials.set(target, []);
    for (const dial of queued) deliverDial(dial, target);
  }

  function switchDial(dial: DialMessage): void {
    const { from, url, port } = dial;
    let target: string;
    try {
      target = new URL(url).host;
    } catch {
      closeDial(port, `lane host: undialable url ${url}`);
      return;
    }
    const handle = workers.get(target);
    if (!handle || !open.get(target) || !open.get(from)) {
      closeDial(port, `lane host: ${target} unreachable from ${from}`);
      return;
    }
    // Workers boot independently. A fast worker can dial a slower peer before
    // that peer has installed its chum-accept listener. A transferred
    // MessagePort has no replay, so hold it here until the target explicitly
    // announces that the listener exists.
    if (!routable.get(target)) {
      pendingDials.get(target)?.push(dial);
      return;
    }
    deliverDial(dial, target);
  }

  try {
    await Promise.all(ready);
  } catch (error) {
    const failure = asError(error, 'Lane host failed to boot.');
    await stopInternal(failure);
    throw failure;
  }

  return {
    clients,
    persons,
    setSwitch(key: string, value: boolean) {
      if (!open.has(key)) throw new Error(`Lane host: unknown worker ${key}.`);
      if (stopped) throw new Error('Lane host is stopped.');
      open.set(key, value);
    },
    async stop() {
      await stopInternal();
    },
  };
}
