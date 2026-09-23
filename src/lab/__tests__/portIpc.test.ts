import { LaneApiClient, createLaneIpcMain, postFeed } from '../portIpc.ts';
import type { FeedRow, LanePort } from '../portIpc.ts';

type Listener = (event: { data: unknown }) => void;

/** Linked in-memory port pair: a.postMessage delivers to b's listeners. */
function linkedPorts(): [LanePort, LanePort] {
  const listenersA = new Set<Listener>();
  const listenersB = new Set<Listener>();
  const deliver = (target: Set<Listener>, message: unknown): void => {
    queueMicrotask(() => {
      for (const listener of target) listener({ data: message });
    });
  };
  const a: LanePort = {
    addEventListener: (_type, listener) => {
      listenersA.add(listener as Listener);
    },
    postMessage: message => deliver(listenersB, message),
  };
  const b: LanePort = {
    addEventListener: (_type, listener) => {
      listenersB.add(listener as Listener);
    },
    postMessage: message => deliver(listenersA, message),
  };
  return [a, b];
}

describe('lane port IPC', () => {
  it('routes handler calls and returns values', async () => {
    const [workerPort, hostPort] = linkedPorts();
    const main = createLaneIpcMain(workerPort);
    main.handle('handler:call', async (_event, request) => ({ success: true, data: { echo: request } }));
    const client = new LaneApiClient(hostPort);
    await expect(client.call('uvcLane', 'whoAmI', { role: 'admin' })).resolves.toEqual({
      echo: { handler: 'uvcLane', method: 'whoAmI', params: { role: 'admin' } },
    });
  });

  it('rejects calls with no registered handler', async () => {
    const [workerPort, hostPort] = linkedPorts();
    createLaneIpcMain(workerPort);
    const client = new LaneApiClient(hostPort);
    await expect(client.call('missing', 'm')).rejects.toThrow('No IPC handler');
  });

  it('surfaces handler errors as call rejections', async () => {
    const [workerPort, hostPort] = linkedPorts();
    const main = createLaneIpcMain(workerPort);
    main.handle('handler:call', async () => {
      throw new Error('boom');
    });
    const client = new LaneApiClient(hostPort);
    await expect(client.call('h', 'm')).rejects.toThrow('boom');
  });

  it('refuses duplicate handler registration', () => {
    const [workerPort] = linkedPorts();
    const main = createLaneIpcMain(workerPort);
    main.handle('x', async () => null);
    expect(() => main.handle('x', async () => null)).toThrow('already registered');
  });

  it('fans feed rows out to subscribers only', async () => {
    const [workerPort, hostPort] = linkedPorts();
    createLaneIpcMain(workerPort);
    const client = new LaneApiClient(hostPort);
    const seenA: FeedRow[] = [];
    const seenB: FeedRow[] = [];
    const offA = client.onFeed(row => seenA.push(row));
    client.onFeed(row => seenB.push(row));
    const row: FeedRow = { type: 'UvcLaneChat', id: 't:0', hash: 'h', kind: 'chat' };
    postFeed(workerPort, row);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(seenA).toEqual([row]);
    expect(seenB).toEqual([row]);
    offA();
    postFeed(workerPort, { ...row, hash: 'h2' });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(seenA).toHaveLength(1);
    expect(seenB).toHaveLength(2);
  });

  it('delivers control messages past feed and call traffic', async () => {
    const [workerPort, hostPort] = linkedPorts();
    createLaneIpcMain(workerPort);
    const client = new LaneApiClient(hostPort);
    const control: unknown[] = [];
    client.onControl(message => control.push(message));
    workerPort.postMessage({ kind: 'ready', role: 'admin', person: 'p' });
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(control).toEqual([{ kind: 'ready', role: 'admin', person: 'p' }]);
  });

  it('fail() rejects pending calls', async () => {
    // No IPC main on the far side: the call stays in flight, so fail() is
    // the only thing that can settle it — no late-result race possible.
    const [_dead, hostPort] = linkedPorts();
    const client = new LaneApiClient(hostPort);
    const pending = client.call('h', 'm');
    const assertion = expect(pending).rejects.toThrow('worker gone');
    client.fail(new Error('worker gone'));
    await assertion;
  });

  it('rejects calls started after failure and ignores late results', async () => {
    const [_dead, hostPort] = linkedPorts();
    const client = new LaneApiClient(hostPort);
    const pending = client.call('h', 'm');
    client.fail(new Error('worker gone'));
    await expect(pending).rejects.toThrow('worker gone');
    await expect(client.call('h', 'after-stop')).rejects.toThrow('worker gone');

    // A result already in the browser task queue must not throw after fail().
    expect(() => _dead.postMessage({ kind: 'ipc-result', id: 1, ok: true, value: 'late' })).not.toThrow();
  });
});
