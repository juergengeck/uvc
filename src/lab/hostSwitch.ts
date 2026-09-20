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

export async function startLaneHost<K extends string>({
  keys,
  spawn,
}: {
  keys: K[];
  spawn: (key: K) => SpawnedLaneWorker;
}): Promise<LaneHost<K>> {
  const workers = new Map<string, SpawnedLaneWorker>();
  const open = new Map<string, boolean>(keys.map(key => [key, true]));
  const routable = new Map<string, boolean>(keys.map(key => [key, false]));
  const pendingDials = new Map<string, DialMessage[]>(keys.map(key => [key, []]));
  const clients = {} as Record<K, LaneApiClient>;
  const persons = {} as Record<K, string>;

  const ready = keys.map(
    key =>
      new Promise<void>((resolve, reject) => {
        const handle = spawn(key);
        const client = new LaneApiClient(handle.port);
        workers.set(key, handle);
        clients[key] = client;
        handle.onError(error => {
          client.fail(error);
          reject(error);
        });
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
            resolve();
          } else if (msg?.kind === 'boot-failed') {
            reject(new Error(`Lane ${key} failed to boot: ${msg.error}`));
          } else if (msg?.kind === 'chum-accept-failed') {
            // A competing persisted route can win while the other is still
            // being accepted. ConnectionsModel owns that retry/replacement
            // lifecycle; surfacing it here only strands startup work.
            console.warn(`Lane ${key} rejected an incoming connection: ${msg.error}`);
          } else if (msg?.kind === 'chum-dial') {
            switchDial(msg as unknown as DialMessage);
          }
        });
      }),
  );

  function deliverDial({ from, url, port }: DialMessage, target: string): void {
    const handle = workers.get(target);
    if (!handle || !open.get(target) || !open.get(from)) {
      port.postMessage({ t: 'close', reason: `lane host: ${target} unreachable from ${from}` });
      port.close();
      return;
    }
    handle.port.postMessage({ kind: 'chum-accept', url, port }, [port]);
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
      port.postMessage({ t: 'close', reason: `lane host: undialable url ${url}` });
      port.close();
      return;
    }
    const handle = workers.get(target);
    if (!handle || !open.get(target) || !open.get(from)) {
      port.postMessage({ t: 'close', reason: `lane host: ${target} unreachable from ${from}` });
      port.close();
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

  await Promise.all(ready);

  return {
    clients,
    persons,
    setSwitch(key: string, value: boolean) {
      if (!open.has(key)) throw new Error(`Lane host: unknown worker ${key}.`);
      open.set(key, value);
    },
    async stop() {
      for (const [target, queued] of pendingDials) {
        for (const { from, port } of queued) {
          port.postMessage({ t: 'close', reason: `lane host stopped before ${target} became reachable from ${from}` });
          port.close();
        }
      }
      await Promise.all([...workers.values()].map(handle => handle.terminate()));
    },
  };
}
