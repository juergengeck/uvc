/**
 * Lane host transport: boot, seed, pair, chat, snapshot, and IoM invite
 * minting over lane worker clients.
 *
 * Readiness without global gates: the host waits for exactly the operation
 * it is about to call (op-scoped retry with a bound); any other failure
 * settles immediately, so side-effecting calls never run twice. Columns seed
 * independently — one failed role never stops the others.
 *
 * Depends only on the narrow LaneClient surface (LaneApiClient satisfies it
 * structurally), so orchestration is unit-testable with stub clients.
 */

import { startLaneHost } from './hostSwitch.ts';
import type { LaneHost, SpawnedLaneWorker } from './hostSwitch.ts';
import { projectRoleSnapshot } from './projection.ts';
import type { RoleSnapshot } from './projection.ts';

/** Minimal client surface; LaneApiClient satisfies it structurally. */
export interface LaneClient {
  call<T>(handler: string, method: string, params?: Record<string, unknown>): Promise<T>;
}

/**
 * Thrown by worker ops that are legitimately not ready yet (young instance
 * still registering). The only failure withOpRetry retries; everything else
 * settles immediately.
 */
export class LaneNotReadyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LaneNotReadyError';
  }
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Op-scoped retry with a bound. Retries LaneNotReadyError until timeoutMs;
 * rethrows any other error on first sight so side-effecting calls can never
 * run twice. Never gate on global readiness: the bound applies per call.
 */
export async function withOpRetry<T>(
  label: string,
  fn: () => Promise<T>,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const intervalMs = options.intervalMs ?? 2_000;
  const start = Date.now();
  let last: unknown = 'no attempts yet';
  for (;;) {
    try {
      const value = await fn();
      if (value === null || value === undefined) {
        last = 'not ready yet';
      } else {
        return value;
      }
    } catch (error) {
      if (!(error instanceof LaneNotReadyError)) throw error;
      last = error;
    }
    if (Date.now() - start >= timeoutMs) {
      const detail = last instanceof Error ? last.message : String(last);
      throw new Error(`Lane ${label} not ready within ${timeoutMs}ms (last: ${detail}).`);
    }
    await sleep(intervalMs);
  }
}

export interface LaneSeed {
  host: LaneHost<string>;
  clients: Record<string, LaneClient>;
  persons: Record<string, string>;
}

export type LaneStageListener = (message: string) => void;

/**
 * Boot one worker per role and anchor each role in the lane. Resolves when
 * every role reported ready; callers seed roles independently afterwards.
 */
export async function bootLane({
  lane,
  roles,
  spawn,
  onStage,
  adminPerson,
}: {
  lane: string;
  roles: string[];
  spawn: (key: string) => SpawnedLaneWorker;
  onStage?: LaneStageListener;
  /** Required when booting a secondary-device lane without an admin worker. */
  adminPerson?: string;
}): Promise<LaneSeed> {
  onStage?.(`Booting ${roles.length} lane worker${roles.length === 1 ? '' : 's'}`);
  const host = await startLaneHost({
    keys: roles,
    spawn: key => {
      onStage?.(`Starting ${key}`);
      return spawn(key);
    },
  });
  const clients = host.clients as unknown as Record<string, LaneClient>;
  try {
    onStage?.('Lane workers ready; anchoring roles');
    const pinnedAdmin = adminPerson ?? host.persons.admin;
    if (typeof pinnedAdmin !== 'string' || pinnedAdmin === '') {
      throw new Error('Lane boot needs the established admin Person identity.');
    }
    await Promise.all(roles.map(role => clients[role].call('uvcLane', 'configureLane', {
      lane,
      adminPerson: pinnedAdmin,
    })));
    await Promise.all(roles.map(async role => {
      onStage?.(`Anchoring ${role}`);
      await clients[role].call('uvcLane', 'ensureRoleAnchor', { lane });
      onStage?.(`${role} ready`);
    }));
    return { host, clients, persons: { ...host.persons } };
  } catch (error) {
    try {
      await host.stop();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Lane anchor setup and host cleanup failed.');
    }
    throw error;
  }
}

/**
 * Never pair a signed-in foreign identity: when the caller knows the seeded
 * owner (re-runs), a mismatch fails the column loudly with the expected
 * identity and the recovery instead of pairing.
 */
export function ensureExpectedIdentity({
  role,
  actual,
  expected,
}: {
  role: string;
  actual: string;
  expected?: string;
}): void {
  if (expected !== undefined && actual !== expected) {
    throw new Error(
      `Lane ${role}: signed in as a different person than the seeded pairing ` +
        `(actual ${actual.slice(0, 12)}, expected ${expected.slice(0, 12)}). ` +
        `Sign out inside that app or clear the lane partition, then reload.`,
    );
  }
}

/** IoP invite pairing: inviter mints, joiner accepts, both sides report live. */
export async function invitePair({
  inviter,
  joiner,
  pairTimeoutMs = 120_000,
}: {
  inviter: LaneClient;
  joiner: LaneClient;
  pairTimeoutMs?: number;
}): Promise<void> {
  type Identity = { person: string; instanceId: string };
  type Connection = { remotePersonId: string | null; remoteInstanceId: string | null; isConnected: boolean };
  const [inviterIdentity, joinerIdentity] = await Promise.all([
    inviter.call<Identity>('uvcLane', 'whoAmI'),
    joiner.call<Identity>('uvcLane', 'whoAmI'),
  ]);
  for (const [label, identity] of [['inviter', inviterIdentity], ['joiner', joinerIdentity]] as const) {
    if (!identity || typeof identity.person !== 'string' || !identity.person.trim()
      || typeof identity.instanceId !== 'string' || !identity.instanceId.trim()) {
      throw new Error(`Lane pairing ${label} did not report a Person and Instance identity.`);
    }
  }
  const invite = await inviter.call<{ url: string; publicKey: string; token: string; pairingMode?: string }>(
    'connection',
    'createInvite',
    { mode: 'primed' },
  );
  await joiner.call('connection', 'connectWithInvite', {
    url: invite.url,
    publicKey: invite.publicKey,
    token: invite.token,
    pairingMode: invite.pairingMode,
  });
  await withOpRetry(
    'pairing',
    async () => {
      const [aConnections, bConnections] = await Promise.all([
        inviter.call<Connection[]>('connection', 'listConnections'),
        joiner.call<Connection[]>('connection', 'listConnections'),
      ]);
      const hasPeer = (connections: Connection[], peer: Identity): boolean => connections.some(connection => (
        connection.isConnected === true
        && connection.remotePersonId === peer.person
        && connection.remoteInstanceId === peer.instanceId
      ));
      if (!hasPeer(aConnections, joinerIdentity) || !hasPeer(bConnections, inviterIdentity)) {
        throw new LaneNotReadyError('pairing link to the exact peer Person and Instance is not live yet');
      }
      return true;
    },
    { timeoutMs: pairTimeoutMs },
  );
}

/**
 * Chat delivery: send through the product path, then poll until the peer's
 * thread tail contains the text. A send-side success alone is not success —
 * arrival is.
 */
export async function sendChatAndAwaitArrival({
  from,
  to,
  thread,
  text,
  audience,
  arrivalTimeoutMs = 90_000,
}: {
  from: LaneClient;
  to: LaneClient;
  thread: string;
  text: string;
  audience: string[];
  arrivalTimeoutMs?: number;
}): Promise<{ seq: number }> {
  const posted = await from.call<{ idHash: string; seq: number }>('uvcLane', 'postLaneChat', {
    thread,
    text,
    audience,
  });
  await withOpRetry(
    'chat arrival',
    async () => {
      const tail = await to.call<{ entries: { seq: number; text: string }[] }>('uvcLane', 'tailLaneChat', {
        thread,
      });
      if (!tail.entries.some(entry => entry.seq === posted.seq && entry.text === text)) {
        throw new LaneNotReadyError('message not arrived yet');
      }
      return true;
    },
    { timeoutMs: arrivalTimeoutMs },
  );
  return { seq: posted.seq };
}

/**
 * Per-role snapshot: identity, connections, chat tails, journal tail, and
 * known cleaning cycles with their signature state — honestly partial.
 */
export async function snapshotRole({
  client,
  role,
  threads,
  journalStream,
  cycleIds,
}: {
  client: LaneClient;
  role: string;
  threads: string[];
  journalStream?: string;
  cycleIds?: string[];
}): Promise<RoleSnapshot> {
  const [who, connections] = await Promise.all([
    client.call<{ person: string; role: string; instanceId: string }>('uvcLane', 'whoAmI'),
    client.call<unknown[]>('connection', 'listConnections'),
  ]);
  const chatTail: unknown[] = [];
  for (const thread of threads) {
    const tail = await client.call<{ entries: unknown[] }>('uvcLane', 'tailLaneChat', { thread });
    chatTail.push(...tail.entries);
  }
  let journalTail: unknown[] = [];
  if (journalStream !== undefined) {
    const tail = await client.call<{ entries: unknown[] }>('uvcLane', 'tailJournal', { stream: journalStream });
    journalTail = tail.entries;
    if (role === 'admin' || role === 'doctor') {
      const roleSuffix = `:${role}`;
      const lane = journalStream.endsWith(roleSuffix) ? journalStream.slice(0, -roleSuffix.length) : journalStream;
      const attestations = await client.call<{ entries: unknown[] }>('uvcLane', 'tailJournal', {
        stream: `${lane}:attestations:admin`,
        // Each cycle second re-signs its scope; keep enough rows that signed signals stay in view.
        limit: 100,
      });
      journalTail.push(...attestations.entries);
    }
  }
  const cycles: unknown[] = [];
  for (const cycleId of cycleIds ?? []) {
    const read = await client.call<{
      cycle: { planId: string; endedAt: number } | null;
      energyReadings: number;
      sensorReadings: number;
      signature: { signer: string; signerRole: string; verified: boolean } | null;
    }>('uvcLane', 'readCycle', { cycleId });
    if (read.cycle === null) continue;
    cycles.push({
      cycleId,
      planId: read.cycle.planId,
      ended: read.cycle.endedAt > 0,
      energyReadings: read.energyReadings,
      sensorReadings: read.sensorReadings,
      signedBy: read.signature?.verified === true ? read.signature.signer : null,
      signerRole: read.signature?.verified === true ? read.signature.signerRole : null,
    });
  }
  const changeScopes = await client.call<Array<{
    changes: unknown[];
    attestation: unknown | null;
  }>>('uvcLane', 'listChanges', { cycleIds: cycleIds ?? [] });
  const deviceChanges = changeScopes.flatMap(scope => Array.isArray(scope.changes) ? scope.changes : []);
  const attestations = changeScopes
    .map(scope => scope.attestation)
    .filter((attestation): attestation is unknown => attestation !== null && attestation !== undefined);
  const lightState = await client.call('uvcLane', 'readLightState');
  const sensorState = await client.call('uvcLane', 'readSensorState');
  const automaticAttestation = role === 'admin'
    ? await client.call('uvcLane', 'readAutomaticAttestationStatus')
    : null;
  return projectRoleSnapshot({
    role,
    person: who.person,
    instanceId: who.instanceId === '' ? null : who.instanceId,
    connections,
    chatTail,
    journalTail,
    cycles,
    deviceChanges,
    attestations,
    lightState,
    sensorState,
    automaticAttestation,
  });
}

export interface LaneMeshSeed {
  persons: Record<string, string>;
  invites: Record<string, { invitationUrl: string; token: string }>;
  log: string[];
  failures: string[];
}

/**
 * Seed a booted lane: full-mesh IoP pairing across every role pair, one
 * welcome chat proving delivery. IoM invitations are minted only when the
 * user requests one. Collect per-pair failures and continue, so one bad pair
 * never stops the mesh.
 */
export async function seedLaneMesh({
  seed,
  lane,
  roles,
  welcomeThread,
  pairTimeoutMs = 120_000,
  arrivalTimeoutMs = 90_000,
  onStage,
}: {
  seed: LaneSeed;
  lane: string;
  roles: string[];
  welcomeThread: string;
  pairTimeoutMs?: number;
  arrivalTimeoutMs?: number;
  onStage?: LaneStageListener;
}): Promise<LaneMeshSeed> {
  const log: string[] = [];
  const failures: string[] = [];
  const record = (message: string, failed = false): void => {
    log.push(message);
    if (failed) failures.push(message);
    onStage?.(message);
  };
  const persons = { ...seed.persons };
  const audience = roles.map(role => persons[role]).filter((person): person is string => typeof person === 'string');
  for (let i = 0; i < roles.length; i += 1) {
    for (let j = i + 1; j < roles.length; j += 1) {
      const [a, b] = [roles[i], roles[j]];
      onStage?.(`Pairing ${a} <-> ${b}`);
      try {
        await invitePair({ inviter: seed.clients[a], joiner: seed.clients[b], pairTimeoutMs });
        record(`paired ${a} <-> ${b}`);
      } catch (error) {
        record(`pair ${a} <-> ${b} failed: ${(error as Error)?.message ?? error}`, true);
      }
    }
  }
  if (roles.length > 1) {
    onStage?.(`Sending welcome chat on ${welcomeThread}`);
    try {
      await sendChatAndAwaitArrival({
        from: seed.clients[roles[0]],
        to: seed.clients[roles[1]],
        thread: welcomeThread,
        text: `lane ${lane} live`,
        audience,
        arrivalTimeoutMs,
      });
      record(`welcome chat delivered on ${welcomeThread}`);
    } catch (error) {
      record(`welcome chat failed: ${(error as Error)?.message ?? error}`, true);
    }
  } else {
    record('welcome chat skipped: at least two roles are required');
  }
  return { persons, invites: {}, log, failures };
}

/**
 * Mint a role's IoM invitation: the column QR payload a real phone scans to
 * enroll as a second device of that role's person. Returns the shareable URL
 * immediately; pairing completes when the device accepts.
 */
export async function mintIoMInvite({
  client,
}: {
  client: LaneClient;
}): Promise<{ invitationUrl: string; token: string; person: string }> {
  return client.call<{ invitationUrl: string; token: string; person: string }>('uvcLane', 'createIoMInvite');
}
