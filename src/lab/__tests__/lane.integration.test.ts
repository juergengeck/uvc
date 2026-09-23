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
  host = await startLaneHost({ keys: ['admin', 'doctor', 'lamp', 'sensor', 'user'], spawn: spawnWorker });
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
    // Real key material from the role's own pairing manager; the invitation
    // points at a dead commserver so accept can only proceed past the identity
    // check, never pair.
    const minted = await admin.call<{ publicKey: string }>('connection', 'createInvite', { mode: 'primed' });
    const { invitationUrl } = buildUvcIoMInviteUrl({
      appBaseUrl: 'http://localhost/browser/#/uvclab',
      email: 'admin@lab.local',
      person: adminPerson,
      token: 'u0j_hEFqjQ93oS_GB8-L0123456789abcdef',
      url: 'wss://127.0.0.1:1/comm',
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
      const firstIdentity = await admin.call<{ person: string; instanceId: string }>('uvcLane', 'whoAmI');
      const secondIdentity = await secondClient.call<{ person: string; instanceId: string }>('uvcLane', 'whoAmI');
      expect(secondIdentity.person).toBe(firstIdentity.person);
      expect(secondIdentity.instanceId).toBeTruthy();
      expect(secondIdentity.instanceId).not.toBe(firstIdentity.instanceId);
      // Passes the identity check, then fails reaching the dead commserver —
      // proving the token authorizes this same-person instance.
      await expect(
        secondClient.call('uvcLane', 'acceptIoMInvite', { invitationUrl, timeoutMs: 15_000 }),
      ).rejects.toThrow(/commserver|timed out|unreachable|refused|ECONN/i);
    } finally {
      await second.terminate();
    }
  });

  it('runs a planned, metered, signed cleaning cycle across roles', async () => {
    const { admin, doctor, lamp, sensor } = clients();
    const persons = host?.persons ?? {};
    const audience = [persons.admin, persons.doctor, persons.lamp, persons.sensor];
    const roleClients = { admin, doctor, lamp, sensor };
    const roleNames = Object.keys(roleClients) as Array<keyof typeof roleClients>;
    await Promise.all(roleNames.map(role => roleClients[role].call('uvcLane', 'configureLane', {
      lane: LANE,
      adminPerson: persons.admin,
    })));
    for (let i = 0; i < roleNames.length; i += 1) {
      for (let j = i + 1; j < roleNames.length; j += 1) {
        const inviter = roleClients[roleNames[i]];
        const joiner = roleClients[roleNames[j]];
        const invite = await inviter.call<{ url: string; publicKey: string; token: string; pairingMode?: string }>(
          'connection',
          'createInvite',
          { mode: 'primed' },
        );
        await joiner.call('connection', 'connectWithInvite', invite);
      }
    }
    // Sensors start inactive. Only the sensor worker can activate itself, and
    // readings remain rejected on the producer while it is inactive.
    await expect(sensor.call('uvcLane', 'readSensorState')).resolves.toBeNull();
    await expect(
      sensor.call('uvcLane', 'recordReading', { cycleId: `${LANE}:inactive`, irradianceMwCm2: 1, audience }),
    ).rejects.toThrow('sensor must be active');
    await expect(
      lamp.call('uvcLane', 'setSensorState', { on: true, reason: 'wrong role', audience }),
    ).rejects.toThrow('only the sensor role');

    const sensorFeed: FeedRow[] = [];
    const stopSensorFeed = admin.onFeed(row => {
      if (row.type === 'UvcLaneSensorState' || row.type === 'UvcLaneSensorChange') sensorFeed.push(row);
    });
    try {
      await sensor.call('uvcLane', 'setSensorState', { on: true, reason: 'preflight on', audience });
      const onState = await poll('sensor on state visible to admin', async () => {
        const state = await admin.call<{ on: boolean; reason: string } | null>('uvcLane', 'readSensorState');
        return state?.on === true ? state : null;
      }, 90_000);
      expect(onState).toMatchObject({ on: true, reason: 'preflight on' });
      await sensor.call('uvcLane', 'setSensorState', { on: false, reason: 'preflight off', audience });
      const offState = await poll('sensor off state visible to admin', async () => {
        const state = await admin.call<{ on: boolean; reason: string } | null>('uvcLane', 'readSensorState');
        return state?.on === false ? state : null;
      }, 90_000);
      expect(offState).toMatchObject({ on: false, reason: 'preflight off' });
      await expect(
        sensor.call('uvcLane', 'recordReading', { cycleId: `${LANE}:inactive`, irradianceMwCm2: 1, audience }),
      ).rejects.toThrow('sensor must be active');
      await sensor.call('uvcLane', 'setSensorState', { on: true, reason: 'measurement ready', audience });
      await poll('sensor activation feed reaches admin', async () => (
        sensorFeed.some(row => row.type === 'UvcLaneSensorState' && row.kind === 'sensor')
          && sensorFeed.some(row => row.type === 'UvcLaneSensorChange' && row.kind === 'sensor-change')
          ? sensorFeed
          : null
      ), 90_000);
    } finally {
      stopSensorFeed();
    }

    // Standalone lamp and sensor transitions share one independently
    // reviewable scope, including ON and OFF before an admin review.
    await lamp.call('uvcLane', 'setLightState', { on: true, reason: 'preflight on', audience });
    await lamp.call('uvcLane', 'setLightState', { on: false, reason: 'preflight off', audience });
    const standalone = await poll('standalone device changes visible', async () => {
      const read = await admin.call<{ changes: Array<{ hash: string; kind: string }> }>('uvcLane', 'readChanges', {});
      return read.changes.length === 5 ? read : null;
    }, 90_000);
    expect(standalone.changes.filter(change => change.kind === 'sensor')).toHaveLength(3);
    const signedStandalone = await admin.call<{ verified: boolean; records: number }>('uvcLane', 'signChanges', {
      audience,
      expectedHashes: standalone.changes.map(change => change.hash),
    });
    expect(signedStandalone).toMatchObject({ verified: true, records: 5 });
    const doctorStandalone = await poll('doctor receives verified sensor state attestation', async () => {
      const read = await doctor.call<{
        changes: Array<{ kind: string; attested: boolean }>;
        attestation: { verified: boolean; records: string[] } | null;
      }>('uvcLane', 'readChanges', {});
      return read.attestation?.verified === true && read.changes.length === 5 ? read : null;
    }, 90_000);
    expect(doctorStandalone.changes.filter(change => change.kind === 'sensor').every(change => change.attested)).toBe(true);
    const doctorStandaloneJournal = await poll('doctor receives shared sensor state attestation journal', async () => {
      const tail = await doctor.call<{ entries: { kind: string; summary: string; verified: boolean }[] }>('uvcLane', 'tailJournal', {
        stream: `${LANE}:attestations:admin`,
      });
      return tail.entries.some(entry => entry.kind === 'attestation' && entry.verified
        && entry.summary.includes('3 sensor changes')) ? tail : null;
    }, 90_000);
    expect(doctorStandaloneJournal.entries.some(entry => entry.summary.includes('3 sensor changes'))).toBe(true);

    // The lamp configures, starts, meters and closes; the sensor records;
    // Admin signs the exact received versions for Doctor to review.
    await expect(doctor.call('uvcLane', 'planPhase', {
      title: 'Wrong role', targetDoseJm2: 400, durationS: 300, audience,
    })).rejects.toThrow('only the lamp role configures treatment parameters');
    const { planId } = await lamp.call<{ planId: string; idHash: string }>('uvcLane', 'planPhase', {
      planId: `${LANE}:plan:ward-round`,
      title: 'Ward round',
      targetDoseJm2: 400,
      durationS: 300,
      audience,
    });
    const { cycleId } = await lamp.call<{ cycleId: string; idHash: string }>('uvcLane', 'startCycle', {
      planId,
      cycleId: `${LANE}:cycle:ward-1`,
      audience,
    });
    await lamp.call('uvcLane', 'setLightState', { on: true, reason: `cycle ${cycleId}`, audience });
    await lamp.call('uvcLane', 'recordEnergy', { cycleId, joulesMilli: 1000, audience });
    await sensor.call('uvcLane', 'recordReading', { cycleId, irradianceMwCm2: 40, audience });
    await lamp.call('uvcLane', 'recordEnergy', { cycleId, joulesMilli: 1500, audience });
    await sensor.call('uvcLane', 'recordReading', { cycleId, irradianceMwCm2: 44, audience });
    // Emergency off before the planned close.
    await lamp.call('uvcLane', 'setLightState', { on: false, reason: 'emergency off', audience });
    const closed = await lamp.call<{
      idHash: string;
      energyReadings: number;
      joulesMilliTotal: number;
      sensorReadings: number;
    }>('uvcLane', 'closeCycle', { cycleId, reason: 'emergency off — phase complete', audience });
    expect(closed).toMatchObject({ energyReadings: 2, joulesMilliTotal: 2500, sensorReadings: 2 });
    // Only the admin signs; open cycles and double closes fail loudly.
    await expect(doctor.call('uvcLane', 'signCycle', { cycleId, audience })).rejects.toThrow('only the admin role');
    const { cycleId: openId } = await lamp.call<{ cycleId: string }>('uvcLane', 'startCycle', {
      planId,
      audience,
    });
    // Wait until the open cycle replicated before asserting the guard —
    // otherwise an "unknown cycle" replication lag masks the "open" check.
    await poll('open cycle visible', async () => {
      const read = await admin.call<{ cycle: { endedAt: number } | null }>('uvcLane', 'readCycle', { cycleId: openId });
      return read.cycle && read.cycle.endedAt === 0 ? true : null;
    }, 90_000);
    await expect(admin.call('uvcLane', 'signChanges', { cycleId: openId, audience })).rejects.toThrow('no received');
    await lamp.call('uvcLane', 'closeCycle', { cycleId: openId, reason: 'abandoned', audience });
    await expect(lamp.call('uvcLane', 'closeCycle', { cycleId, reason: 'again', audience })).rejects.toThrow(
      'already closed',
    );
    const pending = await poll('received cycle changes', async () => {
      const read = await admin.call<{ changes: Array<{ hash: string }> }>('uvcLane', 'readChanges', { cycleId });
      return read.changes.length === 4 ? read : null;
    }, 90_000);
    const signed = await admin.call<{ idHash: string; records: number; verified: boolean }>('uvcLane', 'signChanges', {
      cycleId,
      audience,
      expectedHashes: pending.changes.map(change => change.hash),
    });
    expect(signed).toMatchObject({ records: 4, verified: true });
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
    const adminJournal = await poll('admin journal attestation entry', async () => {
      const tail = await admin.call<{ entries: { kind: string; summary: string; verified: boolean }[] }>('uvcLane', 'tailJournal', {
        stream: `${LANE}:attestations:admin`,
      });
      return tail.entries.some(entry => entry.kind === 'attestation' && entry.verified && entry.summary.includes('2 energy records and 2 sensor readings')) ? tail : null;
    }, 90_000);
    expect(adminJournal.entries.length).toBeGreaterThanOrEqual(1);
    const doctorJournal = await poll('doctor receives verified shared attestation', async () => {
      const tail = await doctor.call<{ entries: { kind: string; summary: string; verified: boolean }[] }>('uvcLane', 'tailJournal', {
        stream: `${LANE}:attestations:admin`,
      });
      return tail.entries.some(entry => entry.kind === 'attestation' && entry.verified) ? tail : null;
    }, 90_000);
    expect(doctorJournal.entries.some(entry => entry.kind === 'attestation' && entry.verified)).toBe(true);
  });

  it('automatically attests exact later device and closed-cycle versions once', async () => {
    const { admin, doctor, lamp, sensor } = clients();
    const persons = host?.persons ?? {};
    const audience = [persons.admin, persons.doctor, persons.lamp, persons.sensor, persons.user];
    const attestationStream = `${LANE}:attestations:admin`;

    await expect(
      doctor.call('uvcLane', 'enableAutomaticAttestation', { audience }),
    ).rejects.toThrow('only the admin role');

    const controls: unknown[] = [];
    const stopControls = admin.onControl(message => {
      if ((message as { kind?: string })?.kind === 'automatic-attestation-changed') controls.push(message);
    });
    try {
      const enabled = await admin.call<{ enabled: boolean; busy: boolean; error: string | null }>(
        'uvcLane',
        'enableAutomaticAttestation',
        { audience },
      );
      expect(enabled).toMatchObject({ enabled: true, error: null });

      // The standalone attestation from the preceding test is stale because
      // later cycle-related lamp transitions also belong to this device scope.
      // Enabling performs one catch-up pass over that observed scope.
      const caughtUp = await poll('automatic standalone catch-up reaches doctor', async () => {
        const read = await doctor.call<{
          changes: Array<{ attested: boolean }>;
          attestation: { hash: string; records: string[]; verified: boolean } | null;
        }>('uvcLane', 'readChanges', {});
        return read.attestation?.verified === true && read.changes.length > 0
          && read.changes.every(change => change.attested) ? read : null;
      }, 90_000);
      const catchupHash = caughtUp.attestation?.hash;
      expect(catchupHash).toBeTruthy();
      await poll('automatic attestation reports idle', async () => {
        const status = await admin.call<{ enabled: boolean; busy: boolean; error: string | null }>(
          'uvcLane',
          'readAutomaticAttestationStatus',
        );
        return status.enabled && !status.busy && status.error === null ? status : null;
      }, 30_000);
      expect(controls.length).toBeGreaterThan(0);

      // Sensor and lamp changes each trigger a new exact standalone signature
      // and are shared to the doctor without an explicit signChanges call.
      const beforeSensorCount = caughtUp.attestation?.records.length ?? 0;
      await sensor.call('uvcLane', 'setSensorState', { on: false, reason: 'automatic off', audience });
      const sensorOff = await poll('automatic sensor-off attestation', async () => {
        const read = await doctor.call<{
          changes: Array<{ attested: boolean }>;
          attestation: { hash: string; records: string[]; verified: boolean } | null;
        }>('uvcLane', 'readChanges', {});
        return read.attestation?.verified === true && read.attestation.hash !== catchupHash
          && read.attestation.records.length === beforeSensorCount + 1
          && read.changes.every(change => change.attested) ? read : null;
      }, 90_000);
      await sensor.call('uvcLane', 'setSensorState', { on: true, reason: 'automatic on', audience });
      const sensorOn = await poll('automatic sensor-on attestation', async () => {
        const read = await doctor.call<{
          changes: Array<{ attested: boolean }>;
          attestation: { hash: string; records: string[]; verified: boolean } | null;
        }>('uvcLane', 'readChanges', {});
        return read.attestation?.verified === true && read.attestation.hash !== sensorOff.attestation?.hash
          && read.attestation.records.length === beforeSensorCount + 2
          && read.changes.every(change => change.attested) ? read : null;
      }, 90_000);
      await lamp.call('uvcLane', 'setLightState', { on: true, reason: 'automatic lamp on', audience });
      const lampOn = await poll('automatic lamp attestation', async () => {
        const read = await doctor.call<{
          changes: Array<{ attested: boolean }>;
          attestation: { hash: string; records: string[]; verified: boolean } | null;
        }>('uvcLane', 'readChanges', {});
        return read.attestation?.verified === true && read.attestation.hash !== sensorOn.attestation?.hash
          && read.attestation.records.length === beforeSensorCount + 3
          && read.changes.every(change => change.attested) ? read : null;
      }, 90_000);

      // Energy and irradiance are signed automatically, then the close event
      // forces a signature over the same records and the exact closed version.
      const cycleId = `${LANE}:cycle:auto-attestation`;
      await lamp.call('uvcLane', 'startCycle', {
        planId: `${LANE}:plan:ward-round`,
        cycleId,
        audience,
      });
      await lamp.call('uvcLane', 'recordEnergy', { cycleId, joulesMilli: 750, audience });
      await sensor.call('uvcLane', 'recordReading', { cycleId, irradianceMwCm2: 37, audience });
      await lamp.call('uvcLane', 'closeCycle', { cycleId, reason: 'automatic complete', audience });
      const automaticCycle = await poll('closed cycle automatically attested to doctor', async () => {
        const read = await doctor.call<{
          cycle: { endedAt: number } | null;
          signature: { records: string[]; verified: boolean } | null;
          attestation: { hash: string; cycleVersion: string | null; records: string[]; verified: boolean } | null;
        }>('uvcLane', 'readCycle', { cycleId });
        return read.cycle && read.cycle.endedAt > 0 && read.signature?.verified === true
          && read.attestation?.verified === true && read.attestation.cycleVersion !== null ? read : null;
      }, 90_000);
      expect(automaticCycle.signature?.records).toHaveLength(2);
      expect(automaticCycle.attestation?.records).toHaveLength(2);

      const settledJournal = await poll('automatic attestation status settles', async () => {
        const [status, journal] = await Promise.all([
          admin.call<{ enabled: boolean; busy: boolean; error: string | null }>('uvcLane', 'readAutomaticAttestationStatus'),
          admin.call<{ entries: Array<{ kind: string; verified: boolean }> }>('uvcLane', 'tailJournal', {
            stream: attestationStream,
            limit: 100,
          }),
        ]);
        return status.enabled && !status.busy && status.error === null ? journal : null;
      }, 30_000);
      const settledCount = settledJournal.entries.length;
      const settledCycleHash = automaticCycle.attestation?.hash;
      await new Promise(resolve => setTimeout(resolve, 500));
      const [sameCycle, sameJournal] = await Promise.all([
        doctor.call<{ attestation: { hash: string } | null }>('uvcLane', 'readCycle', { cycleId }),
        admin.call<{ entries: unknown[] }>('uvcLane', 'tailJournal', { stream: attestationStream, limit: 100 }),
      ]);
      expect(sameCycle.attestation?.hash).toBe(settledCycleHash);
      expect(sameJournal.entries).toHaveLength(settledCount);
      expect(lampOn.attestation?.verified).toBe(true);
    } finally {
      stopControls();
    }
  });

  it('switches the lamp from chat commands and ignores other text', async () => {
    const { doctor, lamp } = clients();
    const persons = host?.persons ?? {};
    const audience = [persons.admin, persons.doctor, persons.lamp, persons.sensor];
    type Message = { text: string; sender: string };

    await expect(doctor.call('device', 'enable', { audience })).rejects.toThrow();
    await lamp.call('device', 'enable', { audience });
    await Promise.all([
      doctor.call('chat', 'watchPeers', { peers: [persons.lamp] }),
      lamp.call('chat', 'watchPeers', { peers: [persons.doctor] }),
    ]);

    const lampReplies = async (): Promise<string[]> => {
      const { messages } = await doctor.call<{ messages: Message[] }>('chat', 'readChat', { peer: persons.lamp });
      return messages.filter(message => message.sender === persons.lamp).map(message => message.text);
    };
    const command = async (text: string): Promise<string[]> => {
      const before = (await lampReplies()).length;
      await doctor.call('chat', 'sendChat', { peer: persons.lamp, text });
      return poll(`lamp answers "${text}"`, async () => {
        const replies = await lampReplies();
        return replies.length > before ? replies.slice(before) : null;
      }, 90_000);
    };

    expect(await command('off')).toEqual([expect.stringMatching(/^Lamp is off · since /)]);
    await expect(lamp.call('uvcLane', 'readLightState')).resolves.toMatchObject({ on: false, reason: expect.stringMatching(/^Chat command from /) });
    expect(await command('On')).toEqual([expect.stringMatching(/^Lamp is on · since /)]);
    await expect(lamp.call('uvcLane', 'readLightState')).resolves.toMatchObject({ on: true });

    // Non-commands get no answer: the next reply belongs to the status command alone.
    await doctor.call('chat', 'sendChat', { peer: persons.lamp, text: 'please turn on' });
    expect(await command('status')).toEqual([expect.stringMatching(/^Lamp is on · since /)]);
  });

  it('cleans the room from one doctor command: lamp cycle, sensor readings, both off', async () => {
    const { doctor, lamp, sensor } = clients();
    const persons = host?.persons ?? {};
    const audience = [persons.admin, persons.doctor, persons.lamp, persons.sensor];
    type Message = { text: string; sender: string };
    await sensor.call('device', 'enable', { audience });

    const lampReplies = async (): Promise<string[]> => {
      const { messages } = await doctor.call<{ messages: Message[] }>('chat', 'readChat', { peer: persons.lamp });
      return messages.filter(message => message.sender === persons.lamp).map(message => message.text);
    };
    const before = (await lampReplies()).length;
    await doctor.call('chat', 'sendChat', { peer: persons.lamp, text: 'clean' });

    const finished = await poll('lamp reports the finished cleaning', async () => {
      const replies = (await lampReplies()).slice(before);
      return replies.length ? replies : null;
    }, 90_000);
    expect(finished).toEqual([expect.stringMatching(/^Lamp cleaning finished · 10 s at 3 mW\/cm² · 30000 mJ in 10 energy records/)]);

    const journal = await lamp.call<{ entries: Array<{ summary: string }> }>('uvcLane', 'tailJournal', { stream: `${LANE}:lamp`, limit: 100 });
    const cycleId = journal.entries.map(entry => /^closed cleaning cycle (\S+) \(Demo room cleaning completed\)/.exec(entry.summary)?.[1]).find(Boolean);
    expect(cycleId).toBeTruthy();

    const cleaned = await poll('doctor sees the closed cycle with sensor readings', async () => {
      const read = await doctor.call<{ cycle: { endedAt: number } | null; energyReadings: number; sensorReadings: number }>('uvcLane', 'readCycle', { cycleId });
      if (read.cycle && read.cycle.endedAt !== 0 && read.energyReadings === 10 && read.sensorReadings > 0) return read;
      const [sensorCycle, sensorState] = await Promise.all([
        sensor.call<{ sensorReadings: number; cycle: unknown }>('uvcLane', 'readCycle', { cycleId }),
        sensor.call('uvcLane', 'readSensorState'),
      ]);
      throw new Error(JSON.stringify({ doctor: { ended: read.cycle?.endedAt, energy: read.energyReadings, sensor: read.sensorReadings }, sensorSide: { readings: sensorCycle.sensorReadings, known: !!sensorCycle.cycle }, sensorState }));
    }, 90_000);
    expect(cleaned.sensorReadings).toBeGreaterThan(0);
    await expect(lamp.call('uvcLane', 'readLightState')).resolves.toMatchObject({ on: false });
    await poll('sensor switches itself off with the lamp', async () => {
      const state = await sensor.call<{ on: boolean } | null>('uvcLane', 'readSensorState');
      return state && !state.on ? state : null;
    }, 30_000);

    // The audit trail: Admin signs each lamp and sensor signal, one verified journal entry apiece.
    const { admin } = clients();
    const signals = await poll('admin journals signed lamp and sensor signals', async () => {
      const tail = await admin.call<{ entries: Array<{ kind: string; summary: string; verified: boolean }> }>(
        'uvcLane', 'tailJournal', { stream: `${LANE}:attestations:admin`, limit: 100 },
      );
      const signed = tail.entries.filter(entry => entry.kind === 'signal' && entry.verified).map(entry => entry.summary);
      return ['Lamp on', 'Lamp off', 'Sensor on', 'Sensor off'].every(summary => signed.includes(summary)) ? signed : null;
    }, 90_000);
    expect(signals).toEqual(expect.arrayContaining(['Lamp on', 'Sensor on']));
    // Doctor verifies the same signed signals once the admin's journal has replicated.
    const doctorSignals = await poll('doctor verifies the signed signals', async () => {
      const tail = await doctor.call<{ entries: Array<{ kind: string; summary: string; verified: boolean }> }>(
        'uvcLane', 'tailJournal', { stream: `${LANE}:attestations:admin`, limit: 100 },
      );
      const signed = tail.entries.filter(entry => entry.kind === 'signal' && entry.verified).map(entry => entry.summary);
      return signed.includes('Lamp on') && signed.includes('Sensor on') ? signed : null;
    }, 90_000);
    expect(doctorSignals).toEqual(expect.arrayContaining(['Lamp on', 'Sensor on']));
  });
});
