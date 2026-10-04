/** Same-person device pairing through the stock commserver used by Glue. */
import { spawn, type ChildProcess } from 'node:child_process';
import { connect } from 'node:net';
import { Worker } from 'node:worker_threads';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LaneApiClient } from '../portIpc.ts';
import { bootLane, seedLaneMesh, withOpRetry, LaneNotReadyError } from '../transport.ts';

jest.setTimeout(120_000);

const COMM_SERVER_PORT = 18334;
const COMM_SERVER_URL = `ws://127.0.0.1:${COMM_SERVER_PORT}`;
const COMM_SERVER_BUNDLE = path.resolve(
  __dirname,
  '../../../../one/packages/one.models/comm_server.bundle.js',
);

function spawnInstance(directory: string, role = 'doctor') {
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
    key: role,
    lane: 'iom-glue-test',
    email: `${role}@lab.local`,
    secret: `lab-${role}`,
    directory,
    commServerUrl: COMM_SERVER_URL,
    appBaseUrl: 'http://127.0.0.1/lab',
  });
  return { worker, port, client, ready };
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
  it('pairs a second doctor and relays lamp commands, replies and status without manual publication', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'uvc-lab-doctor-'));
    const commserver = await startCommServer();
    const roles = ['admin', 'doctor', 'lamp', 'sensor'];
    const instances: ReturnType<typeof spawnInstance>[] = [];
    const joiner = spawnInstance(path.join(root, 'phone'));
    let seed: Awaited<ReturnType<typeof bootLane>> | undefined;
    try {
      seed = await bootLane({ lane: 'iom-glue-test', roles, spawn: role => {
        const instance = spawnInstance(path.join(root, role), role);
        instances.push(instance);
        return { port: instance.port, terminate: () => instance.worker.terminate(), onError: callback => instance.worker.on('error', callback) };
      } });
      const mesh = await seedLaneMesh({ seed, lane: 'iom-glue-test', roles, welcomeThread: 'welcome' });
      expect(mesh.failures).toEqual([]);
      const doctor = seed.clients.doctor;
      await withOpRetry('doctor lamp role', async () => {
        const assignments = await doctor.call<{ role: string; person: string }[]>('uvcLane', 'listRoles', { lane: 'iom-glue-test' });
        if (!assignments.some(entry => entry.role === 'lamp' && entry.person === seed!.persons.lamp)) throw new LaneNotReadyError('lamp role missing');
        return true;
      }, { timeoutMs: 15_000 });
      await Promise.all(roles.map(role => seed!.clients[role].call('chat', 'watchPeers', {
        peers: roles.filter(peer => peer !== role).map(peer => seed!.persons[peer]),
      })));
      await seed.clients.lamp.call('device', 'enable', { audience: Object.values(seed.persons) });
      expect(await joiner.ready).toBe(seed.persons.doctor);
      await joiner.client.call('uvcLane', 'configureLane', { lane: 'iom-glue-test', adminPerson: seed.persons.admin });
      const invite = await doctor.call<{ invitationUrl: string; token: string }>('uvcLane', 'createIoMInvite');
      const completed = doctor.call('uvcLane', 'awaitIoMInvite', { token: invite.token, timeoutMs: 30_000 });
      await joiner.client.call('uvcLane', 'acceptIoMInvite', { invitationUrl: invite.invitationUrl, timeoutMs: 30_000 });
      await completed;
      await withOpRetry('phone lamp role', async () => {
        const assignments = await joiner.client.call<{ role: string; person: string }[]>('uvcLane', 'listRoles', { lane: 'iom-glue-test' });
        if (!assignments.some(entry => entry.role === 'lamp' && entry.person === seed!.persons.lamp)) throw new LaneNotReadyError('lamp role missing on phone');
        return true;
      }, { timeoutMs: 15_000 });
      await joiner.client.call('chat', 'sendChat', { peer: seed.persons.lamp, text: 'on' });
      await withOpRetry('phone command at original doctor', async () => {
        const chat = await doctor.call<{ messages: { text: string }[] }>('chat', 'readChat', { peer: seed!.persons.lamp });
        if (!chat.messages.some(entry => entry.text === 'on')) throw new LaneNotReadyError('phone command missing at original doctor');
        return true;
      }, { timeoutMs: 15_000 });
      await withOpRetry('phone command at lamp chat', async () => {
        const chat = await seed!.clients.lamp.call<{ messages: { text: string }[] }>('chat', 'readChat', { peer: seed!.persons.doctor });
        if (!chat.messages.some(entry => entry.text === 'on')) throw new LaneNotReadyError('phone command missing at lamp chat');
        return true;
      }, { timeoutMs: 15_000 });
      await withOpRetry('lamp command from phone', async () => {
        const state = await seed!.clients.lamp.call<{ on: boolean } | null>('uvcLane', 'readLightState');
        if (state?.on !== true) throw new LaneNotReadyError('phone command has not reached the lamp');
        return true;
      }, { timeoutMs: 15_000 });
      await withOpRetry('lamp status on phone', async () => {
        const state = await joiner.client.call<{ on: boolean } | null>('uvcLane', 'readLightState');
        if (state?.on !== true) throw new LaneNotReadyError('lamp status has not reached the phone');
        const chat = await joiner.client.call<{ messages: { text: string }[] }>('chat', 'readChat', { peer: seed!.persons.lamp });
        if (!chat.messages.some(entry => entry.text.startsWith('Lamp is on'))) throw new LaneNotReadyError('lamp reply has not reached the phone');
        return true;
      }, { timeoutMs: 15_000 });
    } finally {
      await seed?.host.stop();
      await Promise.all([...instances.map(instance => instance.worker.terminate()), joiner.worker.terminate()]);
      await stopCommServer(commserver);
      await rm(root, { recursive: true, force: true });
    }
  });

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
