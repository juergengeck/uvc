/** Same-person device pairing through the stock commserver used by Glue. */
import { spawn, type ChildProcess } from 'node:child_process';
import { connect } from 'node:net';
import { Worker } from 'node:worker_threads';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LaneApiClient } from '../portIpc.ts';

jest.setTimeout(120_000);

const COMM_SERVER_PORT = 18334;
const COMM_SERVER_URL = `ws://127.0.0.1:${COMM_SERVER_PORT}`;
const COMM_SERVER_BUNDLE = path.resolve(
  __dirname,
  '../../../../one/packages/one.models/comm_server.bundle.js',
);

function spawnInstance(directory: string) {
  const worker = new Worker(path.join(__dirname, '..', 'laneTestWorker.mjs'));
  const port = {
    postMessage: (value: unknown, transfer?: unknown[]) => worker.postMessage(value, transfer as []),
    addEventListener: (_type: string, listener: (event: MessageEvent) => void) => {
      worker.on('message', data => listener({ data } as MessageEvent));
    },
    start() {},
  };
  const client = new LaneApiClient(port);
  const ready = new Promise<string>((resolve, reject) => {
    const off = client.onControl(message => {
      const control = message as { kind?: string; person?: string; error?: string };
      if (control.kind === 'ready' && typeof control.person === 'string') {
        off();
        resolve(control.person);
      } else if (control.kind === 'boot-failed') {
        off();
        reject(new Error(control.error));
      }
    });
    worker.on('error', reject);
  });
  worker.postMessage({
    kind: 'lab-key',
    key: 'doctor',
    lane: 'iom-glue-test',
    email: 'doctor@lab.local',
    secret: 'lab-doctor',
    directory,
    commServerUrl: COMM_SERVER_URL,
    appBaseUrl: 'http://127.0.0.1/lab',
  });
  return { worker, client, ready };
}

async function startCommServer(): Promise<ChildProcess> {
  const child = spawn(process.execPath, [COMM_SERVER_BUNDLE, '-h', '127.0.0.1', '-p', String(COMM_SERVER_PORT)], {
    stdio: 'ignore',
  });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Stock commserver exited with ${child.exitCode}.`);
    const reachable = await new Promise<boolean>(resolve => {
      const socket = connect(COMM_SERVER_PORT, '127.0.0.1');
      socket.once('connect', () => { socket.end(); resolve(true); });
      socket.once('error', () => resolve(false));
    });
    if (reachable) return child;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error('Stock commserver did not become reachable within 30 seconds.');
}

async function stopCommServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>(resolve => {
    child.once('exit', () => resolve());
    child.kill();
    setTimeout(resolve, 2_000).unref();
  });
}

describe('UVC lane IoM over Glue commserver protocol', () => {
  it('pairs two instances of the same Person and completes the inviter token', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'uvc-lab-iom-'));
    const commserver = await startCommServer();
    const inviter = spawnInstance(path.join(root, 'inviter'));
    const joiner = spawnInstance(path.join(root, 'joiner'));
    try {
      const [inviterPerson, joinerPerson] = await Promise.all([inviter.ready, joiner.ready]);
      expect(joinerPerson).toBe(inviterPerson);

      const invite = await inviter.client.call<{ invitationUrl: string; token: string; person: string }>(
        'uvcLane',
        'createIoMInvite',
      );
      expect(invite.person).toBe(inviterPerson);
      const fragment = JSON.parse(decodeURIComponent(new URL(invite.invitationUrl).hash.slice(1))) as {
        url?: string;
        token?: string;
      };
      expect(fragment.url).toBe(COMM_SERVER_URL);
      expect(fragment.token).toBe(invite.token);

      const completed = inviter.client.call('uvcLane', 'awaitIoMInvite', {
        token: invite.token,
        timeoutMs: 60_000,
      });
      await joiner.client.call('uvcLane', 'acceptIoMInvite', {
        invitationUrl: invite.invitationUrl,
        timeoutMs: 60_000,
      });
      await expect(completed).resolves.toEqual({ person: inviterPerson });

      const deadline = Date.now() + 15_000;
      let hit: { remotePersonId: string | null; isConnected: boolean; isInternetOfMe: boolean } | undefined;
      while (Date.now() < deadline) {
        const connections = await inviter.client.call<Array<{
          remotePersonId: string | null;
          isConnected: boolean;
          isInternetOfMe: boolean;
        }>>('connection', 'listConnections');
        hit = connections.find(entry => entry.remotePersonId === inviterPerson && entry.isConnected);
        if (hit?.isInternetOfMe) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      expect(hit).toEqual(expect.objectContaining({
        remotePersonId: inviterPerson,
        isConnected: true,
        isInternetOfMe: true,
      }));
    } finally {
      await Promise.all([inviter.worker.terminate(), joiner.worker.terminate()]);
      await stopCommServer(commserver);
      await rm(root, { recursive: true, force: true });
    }
  });
});
