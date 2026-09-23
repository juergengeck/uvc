import { startLaneHost } from '../hostSwitch.ts';
import type { SpawnedLaneWorker } from '../hostSwitch.ts';
import type { LanePort } from '../portIpc.ts';

type Listener = (event: { data: unknown }) => void;

interface FakeWorker extends SpawnedLaneWorker {
  emit(message: unknown): void;
  fail(error: Error): void;
  terminated: boolean;
  messages: unknown[];
}

function fakeWorker(): FakeWorker {
  const listeners = new Set<Listener>();
  const errors = new Set<(error: Error) => void>();
  const messages: unknown[] = [];
  const port: LanePort = {
    addEventListener: (_type, listener) => listeners.add(listener as Listener),
    postMessage: message => messages.push(message),
  };
  const worker: FakeWorker = {
    port,
    messages,
    terminated: false,
    emit(message) {
      for (const listener of listeners) listener({ data: message });
    },
    fail(error) {
      for (const callback of errors) callback(error);
    },
    onError(callback) {
      errors.add(callback);
    },
    terminate() {
      worker.terminated = true;
    },
  };
  return worker;
}

describe('lane host lifecycle', () => {
  it('terminates every worker when one reports a boot failure', async () => {
    const workers = new Map<string, FakeWorker>();
    const boot = startLaneHost({
      keys: ['ready', 'failed'],
      readyTimeoutMs: 100,
      spawn: key => {
        const worker = fakeWorker();
        workers.set(key, worker);
        queueMicrotask(() => {
          if (key === 'ready') worker.emit({ kind: 'ready', person: 'person-ready' });
          else worker.emit({ kind: 'boot-failed', error: 'storage unavailable' });
        });
        return worker;
      },
    });

    await expect(boot).rejects.toThrow('Lane failed failed to boot: storage unavailable');
    expect(workers.get('ready')?.terminated).toBe(true);
    expect(workers.get('failed')?.terminated).toBe(true);
  });

  it('times out a worker that never becomes ready and cleans up partial boot', async () => {
    const workers = new Map<string, FakeWorker>();
    const boot = startLaneHost({
      keys: ['ready', 'stuck'],
      readyTimeoutMs: 15,
      spawn: key => {
        const worker = fakeWorker();
        workers.set(key, worker);
        if (key === 'ready') queueMicrotask(() => worker.emit({ kind: 'ready', person: 'person-ready' }));
        return worker;
      },
    });

    await expect(boot).rejects.toThrow('Lane stuck did not become ready within 15ms');
    expect(workers.get('ready')?.terminated).toBe(true);
    expect(workers.get('stuck')?.terminated).toBe(true);
  });

  it('fails pending and future calls when the running host stops', async () => {
    const worker = fakeWorker();
    const host = await startLaneHost({
      keys: ['admin'],
      spawn: () => {
        queueMicrotask(() => worker.emit({ kind: 'ready', person: 'person-admin' }));
        return worker;
      },
    });

    const pending = host.clients.admin.call('h', 'pending');
    await host.stop();
    await expect(pending).rejects.toThrow('Lane host stopped');
    await expect(host.clients.admin.call('h', 'after-stop')).rejects.toThrow('Lane host stopped');
    expect(worker.terminated).toBe(true);

    // A result racing with terminate is ignored by LaneApiClient.
    expect(() => worker.emit({ kind: 'ipc-result', id: 1, ok: true, value: 'late' })).not.toThrow();
  });
});
