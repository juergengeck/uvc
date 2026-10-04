/** Real IoM devices retain shared, signed history and concurrent producer writes. */
import { spawn, type ChildProcess } from 'node:child_process';
import { connect } from 'node:net';
import { Worker } from 'node:worker_threads';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LaneApiClient } from '../portIpc.ts';
import { bootLane, seedLaneMesh, withOpRetry, LaneNotReadyError } from '../transport.ts';
import type { LaneClient } from '../transport.ts';
import type { LanePlan } from '../laneInstance.ts';
import { DEFAULT_TREATMENT } from '../treatment.ts';

jest.setTimeout(240_000);

const LANE = 'role-pairing-test';
const ROLES = ['admin', 'doctor', 'lamp', 'sensor'] as const;
type Role = typeof ROLES[number];
const PLAN = `${LANE}:plan`;
const CYCLE = `${LANE}:cycle`;
const COMM_SERVER_PORT = 18336;
const COMM_SERVER_URL = `ws://127.0.0.1:${COMM_SERVER_PORT}`;
const COMM_SERVER_BUNDLE = path.resolve(__dirname, '../../../../one/packages/one.models/comm_server.bundle.js');
type Result<M extends keyof LanePlan> = Awaited<ReturnType<LanePlan[M]>>;
type AttestationJournal = { entries: (Result<'tailJournal'>['entries'][number] & { scope?: string })[] };

async function withTimeout<T>(label: string, pending: Promise<T>, timeoutMs = 30_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out within ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function spawnInstance(directory: string, role: Role) {
  const worker = new Worker(path.join(__dirname, '..', 'laneTestWorker.mjs'));
  const port = {
    postMessage: (message: unknown, transfer?: unknown[]) => worker.postMessage(message, transfer as []),
    addEventListener: (_type: string, listener: (event: MessageEvent) => void) => {
      worker.on('message', data => listener({ data } as MessageEvent));
    },
    start() {},
  };
  const client = new LaneApiClient(port);
  const ready = new Promise<string>((resolve, reject) => {
    const off = client.onControl(message => {
      const control = message as { kind?: string; person?: string; error?: string };
      if (control.kind === 'ready' && control.person) {
        off();
        resolve(control.person);
      } else if (control.kind === 'boot-failed') {
        off();
        reject(new Error(control.error));
      }
    });
    worker.on('error', reject);
  });
  // A host-spawned instance is observed through bootLane instead of ready.
  // Keep boot failures handled on that unused promise as well.
  void ready.catch(() => undefined);
  worker.postMessage({
    kind: 'lab-key', key: role, lane: LANE, email: `${role}@lab.local`,
    secret: `lab-${role}`, directory, commServerUrl: COMM_SERVER_URL,
    appBaseUrl: 'http://127.0.0.1/lab',
  });
  return { worker, port, client, ready, directory };
}

async function startCommServer(): Promise<ChildProcess> {
  const child = spawn(process.execPath, [COMM_SERVER_BUNDLE, '-h', '127.0.0.1', '-p', String(COMM_SERVER_PORT)], {
    stdio: 'ignore',
  });
  try {
    await withOpRetry('stock commserver startup', async () => {
      if (child.exitCode !== null) throw new Error(`Stock commserver exited with ${child.exitCode}`);
      const reachable = await new Promise<boolean>(resolve => {
        const socket = connect(COMM_SERVER_PORT, '127.0.0.1');
        socket.setTimeout(1_000, () => { socket.destroy(); resolve(false); });
        socket.once('connect', () => { socket.end(); resolve(true); });
        socket.once('error', () => resolve(false));
      });
      if (!reachable) throw new LaneNotReadyError('commserver is starting');
      return true;
    }, { timeoutMs: 10_000, intervalMs: 100 });
    return child;
  } catch (error) {
    child.kill();
    throw error;
  }
}

async function stopCommServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  await withTimeout('stock commserver shutdown', new Promise<void>(resolve => {
    child.once('exit', () => resolve());
    child.kill();
  }), 5_000);
}

async function snapshot(client: LaneClient) {
  const [roles, treatment, cycle, energy, readings, light, sensor, changes, journal, lampJournal, sensorJournal] = await Promise.all([
    client.call<{ role: string; person: string }[]>('uvcLane', 'listRoles', { lane: LANE }),
    client.call<Result<'readTreatment'>>('uvcLane', 'readTreatment'),
    client.call<Result<'readCycle'>>('uvcLane', 'readCycle', { cycleId: CYCLE }),
    client.call<Result<'tailEnergy'>>('uvcLane', 'tailEnergy', { cycleId: CYCLE }),
    client.call<Result<'tailReadings'>>('uvcLane', 'tailReadings', { cycleId: CYCLE }),
    client.call<Result<'readLightState'>>('uvcLane', 'readLightState'),
    client.call<Result<'readSensorState'>>('uvcLane', 'readSensorState'),
    client.call<Result<'listChanges'>>('uvcLane', 'listChanges', { cycleIds: [CYCLE] }),
    client.call<AttestationJournal>('uvcLane', 'tailJournal', { stream: `${LANE}:attestations:admin`, limit: 100 }),
    client.call<Result<'tailJournal'>>('uvcLane', 'tailJournal', { stream: `${LANE}:lamp`, limit: 100 }),
    client.call<Result<'tailJournal'>>('uvcLane', 'tailJournal', { stream: `${LANE}:sensor`, limit: 100 }),
  ]);
  return { roles, treatment, cycle, energy, readings, light, sensor, changes, journal, lampJournal, sensorJournal };
}

describe('same-person role devices over the stock commserver', () => {
  let root = '';
  let commserver: ChildProcess | undefined;
  let seed: Awaited<ReturnType<typeof bootLane>> | undefined;
  const instances: ReturnType<typeof spawnInstance>[] = [];
  const phones: Partial<Record<Role, ReturnType<typeof spawnInstance>>> = {};

  function allClients(): [string, LaneClient][] {
    if (!seed) throw new Error('role mesh is not running');
    return ROLES.flatMap(role => [[`${role} host`, seed!.clients[role]], [`${role} phone`, phones[role]!.client]]);
  }

  async function awaitEnergy(values: number[]) {
    return withOpRetry(`all devices retain energy ${values.join(', ')}`, async () => {
      const received = await Promise.all(allClients().map(async ([label, client]) => {
        const [energy, cycle, changes] = await Promise.all([
          client.call<Result<'tailEnergy'>>('uvcLane', 'tailEnergy', { cycleId: CYCLE }),
          client.call<Result<'readCycle'>>('uvcLane', 'readCycle', { cycleId: CYCLE }),
          client.call<Result<'readChanges'>>('uvcLane', 'readChanges', { cycleId: CYCLE }),
        ]);
        return { label, energy, cycle, changes };
      }));
      for (const read of received) {
        if (JSON.stringify(read.energy.entries.map(entry => entry.joulesMilli).sort((a, b) => a - b)) !== JSON.stringify(values)
          || read.cycle.energyReadings !== values.length
          || read.changes.changes.filter(change => change.kind === 'energy').length !== values.length) {
          throw new LaneNotReadyError(JSON.stringify(received.map(({ label, energy, cycle, changes }) => ({
            label, values: energy.entries.map(entry => entry.joulesMilli),
            cycleReadings: cycle.energyReadings, energyChanges: changes.changes.filter(change => change.kind === 'energy').length,
          }))));
        }
      }
      return received;
    }, { timeoutMs: 30_000, intervalMs: 200 });
  }

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'uvc-role-pairing-'));
    commserver = await startCommServer();
    seed = await bootLane({ lane: LANE, roles: [...ROLES], spawn: role => {
      const instance = spawnInstance(path.join(root, role), role as Role);
      instances.push(instance);
      return { port: instance.port, terminate: () => instance.worker.terminate(), onError: callback => instance.worker.on('error', callback) };
    } });
    const mesh = await seedLaneMesh({ seed, lane: LANE, roles: [...ROLES], welcomeThread: `${LANE}:welcome`, pairTimeoutMs: 20_000, arrivalTimeoutMs: 15_000 });
    expect(mesh.failures).toEqual([]);
    const audience = Object.values(seed.persons);
    await seed.clients.admin.call('uvcLane', 'enableAutomaticAttestation', { audience });
    await seed.clients.lamp.call('uvcLane', 'planPhase', { ...DEFAULT_TREATMENT, planId: PLAN, audience });
    await seed.clients.lamp.call('uvcLane', 'startCycle', { planId: PLAN, cycleId: CYCLE, audience });
    await seed.clients.lamp.call('uvcLane', 'recordEnergy', { cycleId: CYCLE, joulesMilli: 1000, audience });
    await seed.clients.lamp.call('uvcLane', 'setLightState', { on: false, reason: 'pairing baseline', audience });
    await seed.clients.sensor.call('uvcLane', 'setSensorState', { on: true, reason: 'pairing baseline', audience });
    await seed.clients.sensor.call('uvcLane', 'recordReading', { cycleId: CYCLE, irradianceUwCm2: 3000, audience });
    // Pair after production: this tests imported history, not only later feeds.
    for (const role of ROLES) {
      const phone = spawnInstance(path.join(root, `${role}-phone`), role);
      instances.push(phone);
      phones[role] = phone;
      expect(await withTimeout(`${role} phone boot`, phone.ready)).toBe(seed.persons[role]);
      await phone.client.call('uvcLane', 'configureLane', { lane: LANE, adminPerson: seed.persons.admin });
      await phone.client.call('uvcLane', 'ensureRoleAnchor', { lane: LANE });
      const invite = await seed.clients[role].call<{ token: string; invitationUrl: string }>('uvcLane', 'createIoMInvite');
      const paired = seed.clients[role].call('uvcLane', 'awaitIoMInvite', { token: invite.token, timeoutMs: 20_000 });
      await Promise.all([
        paired,
        phone.client.call('uvcLane', 'acceptIoMInvite', { invitationUrl: invite.invitationUrl, timeoutMs: 20_000 }),
      ]);
      await withOpRetry(`${role} certified app role`, async () => {
        const resolved = await phone.client.call<{ role: string | null }>('uvcLane', 'readCertifiedRole');
        if (resolved.role !== role) throw new LaneNotReadyError(`role certificate is ${resolved.role ?? 'pending'}`);
        return resolved;
      }, { timeoutMs: 15_000, intervalMs: 200 });
    }
  });

  afterAll(async () => {
    await seed?.host.stop();
    await Promise.all(instances.map(instance => instance.worker.terminate()));
    if (commserver) await stopCommServer(commserver);
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('imports treatment, readings, verified changes and journals on every role device', async () => {
    const received = await withOpRetry('complete signed history on all role devices', async () => {
      return Promise.all(allClients().map(async ([label, client]) => {
        const read = await snapshot(client);
        const standalone = read.changes.find(scope => scope.scope === `${LANE}:standalone`);
        const cycle = read.changes.find(scope => scope.scope === CYCLE);
        if (read.roles.length !== ROLES.length || read.treatment?.planId !== PLAN || read.cycle.cycle?.cycleId !== CYCLE
          || read.cycle.energyReadings !== 1 || read.cycle.sensorReadings !== 1
          || read.energy.entries.length !== 1 || read.readings.entries.length !== 1
          || read.light?.on !== false || read.sensor?.on !== true
          || standalone?.changes.length !== 2 || cycle?.changes.length !== 2
          || !standalone.attestation?.verified || !cycle.attestation?.verified
          || !standalone.changes.every(change => change.attested) || !cycle.changes.every(change => change.attested)
          || !read.journal.entries.some(entry => entry.kind === 'attestation' && entry.verified && entry.scope === CYCLE)
          || read.journal.entries.filter(entry => entry.kind === 'signal' && entry.verified).length !== 2
          || read.lampJournal.entries.length < 3 || read.sensorJournal.entries.length < 1) {
          throw new LaneNotReadyError(`${label}: ${JSON.stringify({
            roles: read.roles.map(entry => entry.role), plan: read.treatment?.planId, cycle: read.cycle.cycle?.cycleId,
            energy: read.energy.entries.map(entry => entry.joulesMilli), readings: read.readings.entries.map(entry => entry.irradianceUwCm2),
            light: read.light?.on, sensor: read.sensor?.on,
            scopes: read.changes.map(scope => ({ scope: scope.scope, changes: scope.changes.length,
              attestationReceived: scope.attestation !== null, verified: scope.attestation?.verified,
              attested: scope.changes.filter(change => change.attested).length })),
            journal: read.journal.entries.map(entry => ({ kind: entry.kind, verified: entry.verified, scope: entry.scope })),
            lampJournal: read.lampJournal.entries.length, sensorJournal: read.sensorJournal.entries.length,
          })}`);
        }
        return { label, read };
      }));
    }, { timeoutMs: 30_000, intervalMs: 200 });
    expect(received).toHaveLength(8);
    for (const { read } of received) {
      expect(read.roles).toEqual(expect.arrayContaining(ROLES.map(role => expect.objectContaining({ role, person: seed!.persons[role] }))));
      expect(read.treatment).toMatchObject({ ...DEFAULT_TREATMENT, planId: PLAN });
      expect(read.energy.entries.map(entry => entry.joulesMilli)).toEqual([1000]);
      expect(read.readings.entries.map(entry => entry.irradianceUwCm2)).toEqual([3000]);
      expect(read.cycle.attestation).toMatchObject({ verified: true, signer: seed!.persons.admin, signerRole: 'admin' });
      expect(read.journal.entries.filter(entry => entry.verified).every(entry => entry.signatures.length === 1)).toBe(true);
    }
  });

  it('keeps concurrent Lamp writes distinct and restores their branches from the same storage directory', async () => {
    await awaitEnergy([1000]);
    const audience = Object.values(seed!.persons);
    const [hostWrite, phoneWrite] = await Promise.all([
      seed!.clients.lamp.call<Result<'recordEnergy'>>('uvcLane', 'recordEnergy', { cycleId: CYCLE, joulesMilli: 1001, audience }),
      phones.lamp!.client.call<Result<'recordEnergy'>>('uvcLane', 'recordEnergy', { cycleId: CYCLE, joulesMilli: 2002, audience }),
    ]);
    expect(hostWrite.idHash).not.toBe(phoneWrite.idHash);
    const replicated = await awaitEnergy([1000, 1001, 2002]);
    for (const { changes } of replicated) {
      expect(changes.changes.filter(change => change.kind === 'energy').map(change => change.idHash)).toEqual(
        expect.arrayContaining([hostWrite.idHash, phoneWrite.idHash]),
      );
    }

    const original = phones.lamp!;
    const identity = await original.client.call<Result<'whoAmI'>>('uvcLane', 'whoAmI');
    await original.worker.terminate();
    const restarted = spawnInstance(original.directory, 'lamp');
    instances.push(restarted);
    phones.lamp = restarted;
    expect(await withTimeout('Lamp restart', restarted.ready)).toBe(identity.person);
    expect(await restarted.client.call('uvcLane', 'whoAmI')).toEqual(identity);
    // No reseeding or invitation: the original persisted branch remains readable.
    await awaitEnergy([1000, 1001, 2002]);
    const nextWrite = await restarted.client.call<Result<'recordEnergy'>>('uvcLane', 'recordEnergy', {
      cycleId: CYCLE, joulesMilli: 3003, audience,
    });
    expect(nextWrite.seq).toBe(phoneWrite.seq + 1);
    expect([hostWrite.idHash, phoneWrite.idHash]).not.toContain(nextWrite.idHash);
    // Local storage must include both branches even before reconnection imports anything.
    const restored = await restarted.client.call<Result<'tailEnergy'>>('uvcLane', 'tailEnergy', { cycleId: CYCLE });
    expect(restored.entries.map(entry => entry.joulesMilli).sort((a, b) => a - b)).toEqual([1000, 1001, 2002, 3003]);
    expect((await restarted.client.call<Result<'readCycle'>>('uvcLane', 'readCycle', { cycleId: CYCLE })).energyReadings).toBe(4);
  });
});
