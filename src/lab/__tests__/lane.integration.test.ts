/**
 * Lane integration test: two real lane roles in worker threads, paired over
 * the in-process `lab:` transport (no external network), proving identity
 * isolation, invite pairing with IoP flags, feed delivery, and chat arrival.
 *
 * This exercises the committed laneInstance, hostSwitch, and portIpc modules
 * — not test doubles of them.
 */
import { Worker } from 'node:worker_threads';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startLaneHost } from '../hostSwitch.ts';
import type { LaneHost, SpawnedLaneWorker } from '../hostSwitch.ts';
import { LaneApiClient } from '../portIpc.ts';
import type { FeedRow } from '../portIpc.ts';
import { buildUvcIoMInviteUrl } from '../iomInvite.ts';

jest.setTimeout(240_000);

const LANE = 'test-lane';
const THREAD = `${LANE}:admin-user`;

let root = '';
let host: LaneHost<string> | undefined;

interface LaneConnection {
  remotePersonId: string | null;
  remoteInstanceId: string | null;
  isConnected: boolean;
  isInternetOfMe: boolean;
}

interface LaneChatEntry {
  seq: number;
  sender: string;
  text: string;
  sentAt: number;
}

function spawnWorker(key: string): SpawnedLaneWorker {
  const worker = new Worker(path.join(__dirname, '..', 'laneTestWorker.mjs'));
  // node:worker_threads Worker is an EventEmitter without addEventListener;
  // present the browser Worker's port shape.
  const port = {
    postMessage: (message: unknown, transfer?: unknown[]) =>
      worker.postMessage(message, transfer as []),
    addEventListener: (_type: string, listener: (event: MessageEvent) => void) => {
      worker.on('message', data => listener({ data } as MessageEvent));
    },
    start() {},
  };
  // Browser parity: the role key arrives as the first message, since a
  // bundler worker chunk takes no URL query.
  worker.postMessage({
    kind: 'lab-key',
    key,
    lane: LANE,
    email: `${key}@lab.local`,
    secret: `lab-${key}`,
    directory: path.join(root, key),
  });
  return { port, terminate: () => worker.terminate(), onError: (callback: (error: Error) => void) => worker.on('error', callback) };
}

function clients(): Record<string, LaneApiClient> {
  if (!host) throw new Error('lane host is not running');
  return host.clients;
}

async function poll<T>(label: string, fn: () => Promise<T | null>, timeoutMs: number): Promise<T> {
  const start = Date.now();
  let last = 'no result yet';
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      last = String((error as Error)?.message ?? error).slice(0, 200);
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error(`${label} not satisfied within ${timeoutMs}ms (last: ${last})`);
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'uvc-lane-'));
  host = await startLaneHost({ keys: ['admin', 'user'], spawn: spawnWorker });
});

afterAll(async () => {
  await host?.stop();
  host = undefined;
  if (root) await rm(root, { recursive: true, force: true });
});

describe('lane worker mesh', () => {
  it('boots isolated identities and anchors both roles', async () => {
    const { admin, user } = clients();
    expect(host?.persons.admin).toBeTruthy();
    expect(host?.persons.user).toBeTruthy();
    expect(host?.persons.admin).not.toBe(host?.persons.user);
    const [aWho, uWho] = await Promise.all([
      admin.call<{ person: string; role: string; instanceId: string }>('uvcLane', 'whoAmI'),
      user.call<{ person: string; role: string; instanceId: string }>('uvcLane', 'whoAmI'),
    ]);
    expect(aWho.person).toBe(host?.persons.admin);
    expect(aWho.role).toBe('admin');
    expect(uWho.person).toBe(host?.persons.user);
    expect(uWho.role).toBe('user');
    expect(aWho.instanceId).toBeTruthy();
    expect(uWho.instanceId).toBeTruthy();
    expect(aWho.instanceId).not.toBe(uWho.instanceId);
    const [aAnchor, uAnchor] = await Promise.all([
      admin.call<{ idHash: string }>('uvcLane', 'ensureRoleAnchor', { lane: LANE }),
      user.call<{ idHash: string }>('uvcLane', 'ensureRoleAnchor', { lane: LANE }),
    ]);
    expect(aAnchor.idHash).toBeTruthy();
    expect(uAnchor.idHash).toBeTruthy();
    expect(aAnchor.idHash).not.toBe(uAnchor.idHash);
  });

  it('pairs over an invite and reports IoP flags on both sides', async () => {
    const { admin, user } = clients();
    const invite = await admin.call<{ url: string; publicKey: string; token: string; pairingMode?: string }>(
      'connection',
      'createInvite',
      { mode: 'primed' },
    );
    expect(invite.token).toBeTruthy();
    expect(invite.url).toContain('lab://admin');
    await user.call('connection', 'connectWithInvite', {
      url: invite.url,
      publicKey: invite.publicKey,
      token: invite.token,
      pairingMode: invite.pairingMode,
    });
    const pair = await poll('pairing visible on both sides', async () => {
      const [aConns, uConns] = await Promise.all([
        admin.call<LaneConnection[]>('connection', 'listConnections'),
        user.call<LaneConnection[]>('connection', 'listConnections'),
      ]);
      const aHit = aConns.find(entry => entry.isConnected);
      const uHit = uConns.find(entry => entry.isConnected);
      return aHit && uHit ? { aHit, uHit } : null;
    }, 120_000);
    expect(pair.aHit.isInternetOfMe).toBe(false);
    expect(pair.uHit.isInternetOfMe).toBe(false);
    expect(pair.aHit.remotePersonId).toBe(host?.persons.user);
    expect(pair.uHit.remotePersonId).toBe(host?.persons.admin);
  });

  it('delivers lane chat from feed to arrival', async () => {
    const { admin, user } = clients();
    const persons = host?.persons ?? {};
    const audience = [persons.admin, persons.user];
    const feedRows: FeedRow[] = [];
    const off = admin.onFeed(row => {
      if (row.type === 'UvcLaneChat') feedRows.push(row);
    });
    try {
      const first = await admin.call<{ idHash: string; seq: number }>('uvcLane', 'postLaneChat', {
        thread: THREAD,
        text: 'cycle kickoff',
        audience,
      });
      const second = await admin.call<{ idHash: string; seq: number }>('uvcLane', 'postLaneChat', {
        thread: THREAD,
        text: 'light on',
        audience,
      });
      expect(first.seq).toBe(0);
      expect(second.seq).toBe(1);
      await poll(
        'chat feed rows',
        async () => (feedRows.length >= 2 ? feedRows : null),
        60_000,
      );
      // Arrival, not send-200: the peer reads the ordered tail over CHUM.
      const tail = await poll('chat arrival on peer', async () => {
        const result = await user.call<{ entries: LaneChatEntry[] }>('uvcLane', 'tailLaneChat', { thread: THREAD });
        return result.entries.length === 2 ? result.entries : null;
      }, 90_000);
      expect(tail.map(entry => entry.text)).toEqual(['cycle kickoff', 'light on']);
      expect(tail[0]?.sender).toBe(persons.admin);
    } finally {
      off();
    }
  });

  it('reproduces the owner person on the same email and refuses foreigners', async () => {
    const { admin, user } = clients();
    const adminPerson = host?.persons.admin ?? '';
    // Real key material from the role's own pairing manager; the join room
    // points at a dead port so the accept run can only proceed past the
    // identity check, never pair. No relay touched.
    const minted = await admin.call<{ publicKey: string }>('connection', 'createInvite', { mode: 'primed' });
    const { invitationUrl } = buildUvcIoMInviteUrl({
      relayUrl: 'wss://127.0.0.1:1/comm',
      email: 'admin@lab.local',
      person: adminPerson,
      token: 'u0j_hEFqjQ93oS_GB8-L0123456789abcdef',
      publicKey: minted.publicKey,
      // Mirrors the stack's PAIRING_PROTOCOL_VERSION (one.models lib
      // declares it as literal 2); the worker checks the fragment against
      // its own runtime copy, so drift breaks loudly here.
      pairingProtocolVersion: 2,
    });
    // Foreign identity fails fast, before any dialing.
    await expect(
      user.call('uvcLane', 'acceptIoMInvite', { invitationUrl, timeoutMs: 15_000 }),
    ).rejects.toThrow('different person');
    // Same email reproduces the exact Person with fresh instance keys.
    const second = new Worker(path.join(__dirname, '..', 'laneTestWorker.mjs'));
    try {
      const ready = new Promise<string>((resolve, reject) => {
        second.on('message', data => {
          const msg = data as { kind?: string; person?: string; error?: string };
          if (msg?.kind === 'ready' && typeof msg.person === 'string') resolve(msg.person);
          if (msg?.kind === 'boot-failed') reject(new Error(msg.error));
        });
        second.on('error', reject);
      });
      second.postMessage({
        kind: 'lab-key',
        key: 'admin',
        lane: LANE,
        email: 'admin@lab.local',
        secret: 'lab-admin-second-device',
        directory: path.join(root, 'admin-second-device'),
      });
      const secondPerson = await Promise.race([
        ready,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('second device boot timeout')), 120_000)),
      ]);
      expect(secondPerson).toBe(adminPerson);
      const port = {
        postMessage: (message: unknown, transfer?: unknown[]) => second.postMessage(message, transfer as []),
        addEventListener: (_type: string, listener: (event: MessageEvent) => void) => {
          second.on('message', data => listener({ data } as MessageEvent));
        },
        start() {},
      };
      const secondClient = new LaneApiClient(port);
      // Passes the identity check, then fails reaching the dead relay room —
      // proving the token authorizes this same-person instance.
      await expect(
        secondClient.call('uvcLane', 'acceptIoMInvite', { invitationUrl, timeoutMs: 15_000 }),
      ).rejects.toThrow(/rendezvous|timed out|unreachable|refused|ECONN/i);
    } finally {
      await second.terminate();
    }
  });

  it('runs a planned, metered, signed cleaning cycle across roles', async () => {
    const { admin, user } = clients();
    const persons = host?.persons ?? {};
    const audience = [persons.admin, persons.user];
    // The user plans the sanitation phase; the light toggles and meters,
    // the sensor records, the user closes, the admin signs.
    const { planId } = await user.call<{ planId: string; idHash: string }>('uvcLane', 'planPhase', {
      planId: `${LANE}:plan:ward-round`,
      title: 'Ward round',
      targetDoseJm2: 400,
      durationS: 300,
      audience,
    });
    const { cycleId } = await user.call<{ cycleId: string; idHash: string }>('uvcLane', 'startCycle', {
      planId,
      cycleId: `${LANE}:cycle:ward-1`,
      audience,
    });
    await user.call('uvcLane', 'setLightState', { on: true, reason: `cycle ${cycleId}`, audience });
    await user.call('uvcLane', 'recordEnergy', { cycleId, joulesMilli: 1000, audience });
    await user.call('uvcLane', 'recordReading', { cycleId, irradianceMwCm2: 40, audience });
    await user.call('uvcLane', 'recordEnergy', { cycleId, joulesMilli: 1500, audience });
    await user.call('uvcLane', 'recordReading', { cycleId, irradianceMwCm2: 44, audience });
    // Emergency off before the planned close.
    await user.call('uvcLane', 'setLightState', { on: false, reason: 'emergency off', audience });
    const closed = await user.call<{
      idHash: string;
      energyReadings: number;
      joulesMilliTotal: number;
      sensorReadings: number;
    }>('uvcLane', 'closeCycle', { cycleId, reason: 'emergency off — phase complete', audience });
    expect(closed).toMatchObject({ energyReadings: 2, joulesMilliTotal: 2500, sensorReadings: 2 });
    // Only the admin signs; open cycles and double closes fail loudly.
    await expect(user.call('uvcLane', 'signCycle', { cycleId, audience })).rejects.toThrow('only the admin role');
    const { cycleId: openId } = await user.call<{ cycleId: string }>('uvcLane', 'startCycle', {
      planId,
      audience,
    });
    // Wait until the open cycle replicated before asserting the guard —
    // otherwise an "unknown cycle" replication lag masks the "open" check.
    await poll('open cycle visible', async () => {
      const read = await admin.call<{ cycle: { endedAt: number } | null }>('uvcLane', 'readCycle', { cycleId: openId });
      return read.cycle && read.cycle.endedAt === 0 ? true : null;
    }, 90_000);
    await expect(admin.call('uvcLane', 'signCycle', { cycleId: openId, audience })).rejects.toThrow('open cycle');
    await user.call('uvcLane', 'closeCycle', { cycleId: openId, reason: 'abandoned', audience });
    await expect(user.call('uvcLane', 'closeCycle', { cycleId, reason: 'again', audience })).rejects.toThrow(
      'already closed',
    );
    const signed = await admin.call<{ idHash: string; records: number }>('uvcLane', 'signCycle', { cycleId, audience });
    expect(signed.records).toBeGreaterThanOrEqual(3);
    // Cross-worker evidence: the admin reads the user's replicated cycle,
    // energy, readings, and signature; journals show the signed cycle.
    const evidence = await poll('signed cycle evidence', async () => {
      const read = await admin.call<{
        cycle: { endedAt: number } | null;
        energyReadings: number;
        sensorReadings: number;
        signature: { signer: string; signerRole: string; records: string[] } | null;
      }>('uvcLane', 'readCycle', { cycleId });
      return read.cycle && read.cycle.endedAt > 0 && read.signature ? read : null;
    }, 90_000);
    expect(evidence.energyReadings).toBe(2);
    expect(evidence.sensorReadings).toBe(2);
    expect(evidence.signature?.signerRole).toBe('admin');
    expect(evidence.signature?.signer).toBe(persons.admin);
    const light = await admin.call<{ on: boolean; reason: string } | null>('uvcLane', 'readLightState');
    expect(light).toMatchObject({ on: false, reason: 'emergency off' });
    const adminJournal = await poll('admin journal signature entry', async () => {
      const tail = await admin.call<{ entries: { kind: string; summary: string }[] }>('uvcLane', 'tailJournal', {
        stream: `${LANE}:admin`,
      });
      return tail.entries.some(entry => entry.kind === 'signature' && entry.summary.includes(cycleId)) ? tail : null;
    }, 90_000);
    expect(adminJournal.entries.length).toBeGreaterThanOrEqual(1);
    const userJournal = await admin.call<{ entries: { kind: string; summary: string }[] }>('uvcLane', 'tailJournal', {
      stream: `${LANE}:user`,
    });
    const kinds = userJournal.entries.map(entry => entry.kind);
    expect(kinds).toEqual(expect.arrayContaining(['phase', 'cycle', 'light']));
  });
});
