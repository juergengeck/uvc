/**
 * One lane role instance per worker realm.
 *
 * The caller loads the one.core platform (browser or nodejs) before importing
 * this module, then calls startLaneInstance once. This module only composes
 * models, the refinio.api registry, the `lab:` dialer and the feed-forward
 * stream on the given port. Domain writes are UVC lane versioned objects
 * whose disclosure is a sender-side access grant to the named audience;
 * CHUM carries them.
 *
 * Transport note: the lane pairs over the CommServer handover in the browser
 * (endpoint kind `commserver`). The `lab` endpoint exists for the
 * network-free integration test, where the host switches `lab:` dials
 * between workers exactly like the book's lane.
 */

import MultiUser from '@refinio/one.models/lib/models/Authenticator/MultiUser.js';
import LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import ConnectionsModel from '@refinio/one.models/lib/models/ConnectionsModel.js';
import Connection from '@refinio/one.models/lib/misc/Connection/Connection.js';
import MessagePortPlugin from '@refinio/one.models/lib/misc/Connection/plugins/MessagePortPlugin.js';
import PromisePlugin from '@refinio/one.models/lib/misc/Connection/plugins/PromisePlugin.js';
import { registerConnectionDialer } from '@refinio/one.models/lib/misc/ConnectionEstablishment/ConnectionDialers.js';
import { PAIRING_PROTOCOL_VERSION } from '@refinio/one.models/lib/misc/ConnectionEstablishment/PairingManager.js';
import { objectEvents } from '@refinio/one.models/lib/misc/ObjectEventDispatcher.js';
import RecipesStable from '@refinio/one.models/lib/recipes/recipes-stable.js';
import RecipesExperimental from '@refinio/one.models/lib/recipes/recipes-experimental.js';
import { ReverseMapsStable, ReverseMapsForIdObjectsStable } from '@refinio/one.models/lib/recipes/reversemaps-stable.js';
import { ReverseMapsExperimental, ReverseMapsForIdObjectsExperimental } from '@refinio/one.models/lib/recipes/reversemaps-experimental.js';
import { onVersionedObj } from '@refinio/one.core/lib/storage-versioned-objects.js';
import {
  storeVersionedObject,
  getObjectByIdHash,
  hasVersionHead,
  isMissingVersionHeadError,
} from '@refinio/one.core/lib/storage-versioned-objects.js';
import { calculateIdHashOfObj } from '@refinio/one.core/lib/util/object.js';
import { createAccess } from '@refinio/one.core/lib/access.js';
import { SET_ACCESS_MODE } from '@refinio/one.core/lib/storage-base-common.js';
import { getInstanceIdHash, getInstanceOwnerIdHash } from '@refinio/one.core/lib/instance.js';
import { OperationRegistry } from '@refinio/api/registry';
import { IpcTransport } from '@refinio/api/transports/IpcTransport.js';
import { AccessRightsRecipes } from '@refinio/api/helpers/AccessRightsHelper.js';
import type { Recipe } from '@refinio/one.core/lib/recipes.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';

import {
  UvcLaneRecipes,
  createUvcLaneChat,
  createUvcLaneRole,
  createUvcLaneThread,
  UVC_LAB_ROLES,
} from './uvcLabRecipes.ts';
import type { UvcLaneChat, UvcLaneRoleAnchor } from './uvcLabRecipes.ts';
import {
  UvcLaneCycleRecipes,
  createUvcLaneCycle,
  createUvcLaneCycleSignature,
  createUvcLaneEnergy,
  createUvcLaneJournal,
  createUvcLaneLightState,
  createUvcLanePhase,
  createUvcLaneReading,
  createUvcLaneStreamHead,
} from './uvcLaneCycleRecipes.ts';
import type { UvcLaneCycle, UvcLaneLightState, UvcLanePhase } from './uvcLaneCycleRecipes.ts';
import { createLaneIpcMain, postFeed } from './portIpc.ts';
import type { LanePort } from './portIpc.ts';
import { createIoMOps } from './iomOps.ts';

export const laneUrl = (role: string): string => `lab://${role}`;

function merge(...sources: Array<Iterable<readonly [PropertyKey, Set<string>]>>): Map<PropertyKey, Set<string>> {
  const merged = new Map<PropertyKey, Set<string>>();
  for (const source of sources) {
    for (const [type, props] of source) merged.set(type, new Set([...(merged.get(type) ?? []), ...props]));
  }
  return merged;
}

export interface LaneEndpoint {
  kind: 'lab' | 'commserver';
  url: string;
}

export interface LaneInstanceOptions {
  port: LanePort;
  role: string;
  lane: string;
  email: string;
  secret: string;
  directory: string;
  endpoint: LaneEndpoint;
  createMessageChannel: () => MessageChannel;
}

interface AcceptMessage {
  kind: string;
  url?: string;
  port?: unknown;
}

const KIND_OF_TYPE: Record<string, string> = {
  UvcLaneRole: 'role',
  UvcLaneChat: 'chat',
  UvcLaneThread: 'thread',
  UvcLanePhase: 'phase',
  UvcLaneCycle: 'cycle',
  UvcLaneLightState: 'light',
  UvcLaneEnergy: 'energy',
  UvcLaneReading: 'reading',
  UvcLaneCycleSignature: 'signature',
  UvcLaneJournal: 'journal',
  UvcLaneStreamHead: 'stream-head',
};

const FEED_TYPES = Object.keys(KIND_OF_TYPE);

function feedId(type: string, obj: Record<string, unknown>): string {
  if (type === 'UvcLaneChat') return `${String(obj.thread)}:${String(obj.seq)}`;
  if (type === 'UvcLaneEnergy' || type === 'UvcLaneReading' || type === 'UvcLaneJournal') {
    return `${String(obj.stream)}:${String(obj.seq)}`;
  }
  if (type === 'UvcLaneRole') return `${String(obj.lane)}:${String(obj.role)}`;
  if (type === 'UvcLaneThread' || type === 'UvcLaneStreamHead') return String(obj.thread ?? obj.stream);
  if (type === 'UvcLaneCycle' || type === 'UvcLaneCycleSignature') return String(obj.cycleId);
  if (type === 'UvcLanePhase') return String(obj.planId);
  if (type === 'UvcLaneLightState') return String(obj.stateId);
  return String(obj.idHash ?? type);
}

export async function startLaneInstance({
  port,
  role,
  lane,
  email,
  secret,
  directory,
  endpoint,
  createMessageChannel,
}: LaneInstanceOptions): Promise<{ shutdown(): Promise<void> }> {
  const listenerUrl = endpoint.url;
  const multiUser = new MultiUser({
    directory,
    // AccessRightsRecipes registers the pairing audit certificate that
    // OneConnectionPlan.connectWithInvite mints via grantAccessRightsAfterPairing.
    recipes: [
      ...RecipesStable,
      ...RecipesExperimental,
      ...AccessRightsRecipes,
      ...(UvcLaneRecipes as unknown as Recipe[]),
      ...(UvcLaneCycleRecipes as unknown as Recipe[]),
    ],
    // Framework reverse-map tables are keyed by its closed type-name unions;
    // the merge is key-wise disjoint in practice, so the boundary cast below
    // documents that instead of pretending membership.
    reverseMaps: merge(ReverseMapsStable, ReverseMapsExperimental) as never,
    reverseMapsForIdObjects: merge(ReverseMapsForIdObjectsStable, ReverseMapsForIdObjectsExperimental) as never,
  });
  await multiUser.loginOrRegister(email, secret, role);
  await objectEvents.init();

  const self = (): string => {
    const owner = getInstanceOwnerIdHash();
    if (!owner) throw new Error('UVC lab: instance has no owner.');
    return owner;
  };

  // The instance endpoint published in our profile is the listener URL:
  // commserver peers route through the relay lease, lab peers through the
  // host-switched `lab:` dialer below.
  const leuteModel = new LeuteModel(listenerUrl, true);
  const channelManager = new ChannelManager(leuteModel);
  const connections = new ConnectionsModel(leuteModel, {
    commServerUrl: endpoint.kind === 'commserver' ? endpoint.url : undefined,
    publicCommServerUrl: endpoint.kind === 'commserver' ? endpoint.url : undefined,
    // catchAll pre-registers this worker's credential for the listener at
    // init (pairing itself stays demand-driven and invite-gated).
    incomingConnectionConfigurations: [
      endpoint.kind === 'commserver'
        ? { type: 'commserver', url: endpoint.url, catchAll: true }
        : { type: 'external', url: listenerUrl, catchAll: true },
    ],
    acceptIncomingConnections: true,
    acceptUnknownInstances: false,
    acceptUnknownPersons: false,
    allowPairing: true,
    allowDebugRequests: false,
    pairingTokenExpirationDuration: 600_000,
    establishOutgoingConnections: true,
    noImport: false,
    noExport: false,
  });
  await leuteModel.init();
  await channelManager.init();
  await connections.init();
  await connections.waitForIncomingConnectionReady();

  // OneConnectionPlan.connectWithInvite rebuilds its invitation from
  // {url, publicKey, token} and drops pairingProtocolVersion, which
  // PairingManager.connectUsingInvitation asserts. Restore the local protocol
  // version on the way through (instance-only; the wire token already carries it).
  const pairing = connections.pairing as unknown as {
    createInvitation(
      myPersonId?: string,
      token?: string,
      options?: { mode?: string; identityRelation?: string; deviceEnrollmentPersonId?: string },
    ): Promise<unknown>;
    connectUsingInvitation(invitation: Record<string, unknown>, ...rest: unknown[]): Promise<unknown>;
  };
  const connectUsingInvitation = pairing.connectUsingInvitation.bind(pairing);
  pairing.connectUsingInvitation = (invitation: Record<string, unknown>, ...rest: unknown[]) =>
    connectUsingInvitation({ pairingProtocolVersion: PAIRING_PROTOCOL_VERSION, ...invitation }, ...rest);

  const unregisterDialer = registerConnectionDialer('lab:', (target: string) => {
    const { port1, port2 } = createMessageChannel();
    port.postMessage({ kind: 'chum-dial', from: role, url: target, port: port2 }, [port2]);
    return Connection.fromPlugin(new MessagePortPlugin(port1));
  });

  // Install the accept side before activating any persisted peer routes.
  port.addEventListener('message', event => {
    const message = event.data as AcceptMessage;
    if (message?.kind !== 'chum-accept') return;
    if (message.url !== listenerUrl) throw new Error(`Lane ${role}: accept for foreign url ${message.url}.`);
    // The outgoing side gains its PromisePlugin in connectWithEncryption; the
    // accepted side needs it added explicitly (websocket listeners do the same).
    const incoming = Connection.fromPlugin(new MessagePortPlugin(message.port as MessagePort));
    incoming.addPlugin(new PromisePlugin());
    connections
      .acceptExternalConnection(incoming, listenerUrl)
      .catch(error => port.postMessage({ kind: 'chum-accept-failed', role, error: (error as Error).message }));
  });
  // The host must not transfer a dial before the listener above exists. This
  // separate readiness phase prevents peers from racing one another during
  // boot (and losing a MessagePort before it can be accepted).
  port.postMessage({ kind: 'routing-ready', role });

  const roleAnchorIdHash = async (laneName: string, roleName: string): Promise<string> =>
    calculateIdHashOfObj({ $type$: 'UvcLaneRole', lane: laneName, role: roleName } as never);

  async function readLatest<T>(
    typeName: string,
    idFields: Record<string, string>,
  ): Promise<{ idHash: string; obj: T } | null> {
    const idHash = await calculateIdHashOfObj({ $type$: typeName, ...idFields } as never);
    // Not yet stored is a normal state, asked explicitly — no error swallowing.
    if (!(await hasVersionHead(idHash as never))) return null;
    try {
      const result = await getObjectByIdHash(idHash as never);
      return { idHash, obj: result.obj as unknown as T };
    } catch (error) {
      if (!isMissingVersionHeadError(error)) throw error;
      return null;
    }
  }

  async function readStreamHead(stream: string): Promise<{ head: string; count: number } | null> {
    const idHash = await calculateIdHashOfObj({ $type$: 'UvcLaneStreamHead', stream } as never);
    if (!(await hasVersionHead(idHash as never))) return null;
    try {
      const result = await getObjectByIdHash(idHash as never);
      const obj = result.obj as unknown as { head?: unknown; count?: unknown };
      if (typeof obj.head !== 'string' || typeof obj.count !== 'number') return null;
      return { head: obj.head, count: obj.count };
    } catch (error) {
      if (!isMissingVersionHeadError(error)) throw error;
      return null;
    }
  }

  async function walkStream(stream: string, bound: number): Promise<{ idHash: string; obj: Record<string, unknown> }[]> {
    const head = await readStreamHead(stream);
    let cursor = head ? head.head : '';
    const entries: { idHash: string; obj: Record<string, unknown> }[] = [];
    while (cursor !== '' && entries.length < bound) {
      const result = await getObjectByIdHash(cursor as never);
      const obj = result.obj as unknown as Record<string, unknown>;
      entries.push({ idHash: cursor, obj });
      cursor = typeof obj.prev === 'string' ? obj.prev : '';
    }
    return entries.reverse();
  }

  async function appendStreamEntry<T>(input: {
    stream: string;
    create: (stream: string, seq: number, prev: string) => T;
    audience: string[];
  }): Promise<{ idHash: string; seq: number }> {
    const head = await readStreamHead(input.stream);
    const seq = head ? head.count : 0;
    const obj = input.create(input.stream, seq, head ? head.head : '');
    const stored = await storeVersionedObject(obj as never);
    const streamHead = await storeVersionedObject(
      createUvcLaneStreamHead({ stream: input.stream, head: stored.idHash, count: seq + 1 }) as never,
    );
    await grant(stored.idHash, input.audience);
    await grant(streamHead.idHash, input.audience);
    return { idHash: stored.idHash, seq };
  }

  async function appendJournalEntry({
    kind,
    summary,
    audience,
  }: {
    kind: string;
    summary: string;
    audience?: string[];
  }): Promise<{ idHash: string; seq: number }> {
    return appendStreamEntry({
      stream: `${lane}:${role}`,
      create: (stream, seq, prev) =>
        createUvcLaneJournal({ stream, seq, kind, summary, recordedAt: Date.now(), prev }),
      audience: audience ?? [self()],
    });
  }

  async function grant(idHash: string, people: string[]): Promise<void> {
    await createAccess([
      {
        id: idHash as never,
        person: people as SHA256IdHash<Person>[],
        hashGroup: [],
        mode: SET_ACCESS_MODE.ADD,
      },
    ]);
  }

  async function readThreadHead(thread: string): Promise<{ head: string; count: number } | null> {
    const idHash = await calculateIdHashOfObj({ $type$: 'UvcLaneThread', thread } as never);
    // Not yet stored is a normal state, asked explicitly — no error swallowing.
    if (!(await hasVersionHead(idHash as never))) return null;
    try {
      const result = await getObjectByIdHash(idHash as never);
      const obj = result.obj as unknown as { head?: unknown; count?: unknown };
      if (typeof obj.head !== 'string' || typeof obj.count !== 'number') return null;
      return { head: obj.head, count: obj.count };
    } catch (error) {
      // Head selected and then transiently unreadable (concurrent head swap):
      // report unknown rather than a storage crash.
      if (!isMissingVersionHeadError(error)) throw error;
      return null;
    }
  }

  const plan = {
    whoAmI(): { person: string; role: string; instanceId: string } {
      return { person: self(), role, instanceId: getInstanceIdHash() ?? '' };
    },

    async ensureRoleAnchor({ lane: laneName }: { lane: string }): Promise<{ idHash: string; person: string }> {
      const anchor = createUvcLaneRole({ lane: laneName, role, person: self(), registeredAt: Date.now() });
      const stored = await storeVersionedObject(anchor as never);
      await grant(stored.idHash, [self()]);
      return { idHash: stored.idHash, person: self() };
    },

    roleAnchorIdHash({ lane: laneName }: { lane: string }): Promise<{ idHash: string }> {
      return roleAnchorIdHash(laneName, role).then(idHash => ({ idHash }));
    },

    async assignRole({
      lane: laneName,
      targetPerson,
      roleName: rName,
      audience,
    }: {
      lane: string;
      targetPerson: string;
      roleName: string;
      audience: string[];
    }): Promise<{ idHash: string; role: string; person: string }> {
      if (role !== 'admin') throw new Error('UVC lab: only the admin role can assign roles.');
      const anchor = createUvcLaneRole({
        lane: laneName,
        role: rName,
        person: targetPerson,
        registeredAt: Date.now(),
      });
      const stored = await storeVersionedObject(anchor as never);
      await grant(stored.idHash, audience);
      await appendJournalEntry({
        kind: 'role',
        summary: `assigned role "${rName}" to ${targetPerson.slice(0, 8)}…`,
        audience,
      });
      return { idHash: stored.idHash, role: rName, person: targetPerson };
    },

    async listRoles({
      lane: laneName,
    }: {
      lane: string;
    }): Promise<Array<{ role: string; person: string; registeredAt: number; idHash: string }>> {
      const roles: Array<{ role: string; person: string; registeredAt: number; idHash: string }> = [];
      for (const r of UVC_LAB_ROLES) {
        const res = await readLatest<UvcLaneRoleAnchor>('UvcLaneRole', { lane: laneName, role: r });
        if (res) {
          roles.push({
            role: res.obj.role,
            person: res.obj.person,
            registeredAt: res.obj.registeredAt,
            idHash: res.idHash,
          });
        }
      }
      return roles;
    },

    async postLaneChat({
      thread,
      text,
      audience,
    }: {
      thread: string;
      text: string;
      audience: string[];
    }): Promise<{ idHash: string; seq: number }> {
      if (!Array.isArray(audience) || audience.length === 0) {
        throw new Error('UVC lab: postLaneChat needs a non-empty audience.');
      }
      const head = await readThreadHead(thread);
      const seq = head ? head.count : 0;
      const chat: UvcLaneChat = createUvcLaneChat({
        thread,
        seq,
        sender: self(),
        text,
        sentAt: Date.now(),
        prev: head ? head.head : '',
      });
      const stored = await storeVersionedObject(chat as never);
      const threadHead = await storeVersionedObject(
        createUvcLaneThread({ thread, head: stored.idHash, count: seq + 1 }) as never,
      );
      await grant(stored.idHash, audience);
      await grant(threadHead.idHash, audience);
      return { idHash: stored.idHash, seq };
    },

    async tailLaneChat({ thread, limit = 20 }: { thread: string; limit?: number }): Promise<{ entries: UvcLaneChat[] }> {
      const entries: UvcLaneChat[] = [];
      const head = await readThreadHead(thread);
      let cursor = head ? head.head : '';
      const bound = Math.max(1, Math.min(100, limit ?? 20));
      while (cursor !== '' && entries.length < bound) {
        const result = await getObjectByIdHash(cursor as never);
        const obj = result.obj as unknown as Record<string, unknown>;
        entries.push({
          $type$: 'UvcLaneChat',
          thread: String(obj.thread),
          seq: Number(obj.seq),
          sender: String(obj.sender),
          text: String(obj.text),
          sentAt: Number(obj.sentAt),
          prev: typeof obj.prev === 'string' ? obj.prev : '',
        });
        cursor = typeof obj.prev === 'string' ? obj.prev : '';
      }
      return { entries: entries.reverse() };
    },

    async planPhase({
      title,
      targetDoseJm2,
      durationS,
      planId,
      audience,
    }: {
      title: string;
      targetDoseJm2: number;
      durationS: number;
      planId?: string;
      audience: string[];
    }): Promise<{ planId: string; idHash: string }> {
      const id = planId ?? `${lane}:plan:${Date.now()}`;
      const phase: UvcLanePhase = createUvcLanePhase({
        planId: id,
        title,
        targetDoseJm2,
        durationS,
        createdBy: self(),
        createdAt: Date.now(),
      });
      const stored = await storeVersionedObject(phase as never);
      await grant(stored.idHash, audience);
      await appendJournalEntry({
        kind: 'phase',
        summary: `planned sanitation phase ${id} (${title}, target ${targetDoseJm2} J/m2 over ${durationS}s)`,
        audience,
      });
      return { planId: id, idHash: stored.idHash };
    },

    async startCycle({
      planId,
      cycleId,
      audience,
    }: {
      planId: string;
      cycleId?: string;
      audience: string[];
    }): Promise<{ cycleId: string; idHash: string }> {
      const id = cycleId ?? `${planId}:cycle:${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      const cycle: UvcLaneCycle = createUvcLaneCycle({
        cycleId: id,
        planId,
        startedBy: self(),
        startedAt: Date.now(),
      });
      const stored = await storeVersionedObject(cycle as never);
      await grant(stored.idHash, audience);
      await appendJournalEntry({ kind: 'cycle', summary: `started cleaning cycle ${id} for ${planId}`, audience });
      return { cycleId: id, idHash: stored.idHash };
    },

    async recordEnergy({
      cycleId,
      joulesMilli,
      audience,
    }: {
      cycleId: string;
      joulesMilli: number;
      audience: string[];
    }): Promise<{ idHash: string; seq: number }> {
      return appendStreamEntry({
        stream: `${cycleId}:energy`,
        create: (stream, seq, prev) =>
          createUvcLaneEnergy({ stream, seq, joulesMilli, recordedBy: self(), recordedAt: Date.now(), prev }),
        audience,
      });
    },

    async recordReading({
      cycleId,
      irradianceMwCm2,
      audience,
    }: {
      cycleId: string;
      irradianceMwCm2: number;
      audience: string[];
    }): Promise<{ idHash: string; seq: number }> {
      return appendStreamEntry({
        stream: `${cycleId}:sensor`,
        create: (stream, seq, prev) =>
          createUvcLaneReading({ stream, seq, irradianceMwCm2, recordedBy: self(), recordedAt: Date.now(), prev }),
        audience,
      });
    },

    async setLightState({
      on,
      reason,
      audience,
    }: {
      on: boolean;
      reason: string;
      audience: string[];
    }): Promise<{ idHash: string }> {
      const state: UvcLaneLightState = createUvcLaneLightState({
        stateId: `${lane}:light`,
        on,
        reason,
        updatedBy: self(),
        updatedAt: Date.now(),
      });
      const stored = await storeVersionedObject(state as never);
      await grant(stored.idHash, audience);
      await appendJournalEntry({
        kind: 'light',
        summary: `light source ${on ? 'ON' : 'OFF'} (${reason})`,
        audience,
      });
      return { idHash: stored.idHash };
    },

    async closeCycle({
      cycleId,
      reason,
      audience,
    }: {
      cycleId: string;
      reason: string;
      audience: string[];
    }): Promise<{ idHash: string; energyReadings: number; joulesMilliTotal: number; sensorReadings: number }> {
      const latest = await readLatest<UvcLaneCycle>('UvcLaneCycle', { cycleId });
      if (!latest) throw new Error(`UVC lab: unknown cycle ${cycleId}.`);
      if (latest.obj.endedAt !== 0) throw new Error(`UVC lab: cycle ${cycleId} is already closed.`);
      const closed: UvcLaneCycle = createUvcLaneCycle({
        cycleId,
        planId: latest.obj.planId,
        startedBy: latest.obj.startedBy,
        startedAt: latest.obj.startedAt,
        endedAt: Date.now(),
        endReason: reason,
      });
      const stored = await storeVersionedObject(closed as never);
      await grant(stored.idHash, audience);
      const energy = await walkStream(`${cycleId}:energy`, 10_000);
      const readings = await walkStream(`${cycleId}:sensor`, 10_000);
      const joulesMilliTotal = energy.reduce(
        (sum, entry) => sum + (typeof entry.obj.joulesMilli === 'number' ? entry.obj.joulesMilli : 0),
        0,
      );
      await appendJournalEntry({
        kind: 'cycle',
        summary:
          `closed cleaning cycle ${cycleId} (${reason}): ` +
          `${energy.length} energy records, ${joulesMilliTotal} mJ delivered, ${readings.length} sensor readings`,
        audience,
      });
      return { idHash: stored.idHash, energyReadings: energy.length, joulesMilliTotal, sensorReadings: readings.length };
    },

    async signCycle({
      cycleId,
      audience,
    }: {
      cycleId: string;
      audience: string[];
    }): Promise<{ idHash: string; records: number }> {
      if (role !== 'admin') throw new Error('UVC lab: only the admin role signs cycle recordings.');
      const latest = await readLatest<UvcLaneCycle>('UvcLaneCycle', { cycleId });
      if (!latest) throw new Error(`UVC lab: unknown cycle ${cycleId}.`);
      if (latest.obj.endedAt === 0) throw new Error(`UVC lab: cannot sign open cycle ${cycleId}.`);
      const energy = await readStreamHead(`${cycleId}:energy`);
      const reading = await readStreamHead(`${cycleId}:sensor`);
      const recordIds = [latest.idHash, energy?.head, reading?.head].filter(
        (id): id is string => typeof id === 'string' && id !== '',
      );
      const signature = createUvcLaneCycleSignature({
        cycleId,
        signerRole: role,
        signer: self(),
        signedAt: Date.now(),
        recordIds,
      });
      const stored = await storeVersionedObject(signature as never);
      await grant(stored.idHash, audience);
      await appendJournalEntry({
        kind: 'signature',
        summary: `signed cleaning cycle ${cycleId}: sensor and actor recordings certified (${recordIds.length} records)`,
        audience,
      });
      return { idHash: stored.idHash, records: recordIds.length };
    },

    async readCycle({ cycleId }: { cycleId: string }): Promise<{
      cycle: UvcLaneCycle | null;
      energyReadings: number;
      energyHead: string | null;
      sensorReadings: number;
      sensorHead: string | null;
      signature: { signer: string; signerRole: string; signedAt: number; records: string[] } | null;
    }> {
      const latest = await readLatest<UvcLaneCycle>('UvcLaneCycle', { cycleId });
      const energy = await readStreamHead(`${cycleId}:energy`);
      const reading = await readStreamHead(`${cycleId}:sensor`);
      const signature = await readLatest<{
        signer: unknown;
        signerRole: unknown;
        signedAt: unknown;
        recordsJson: unknown;
      }>('UvcLaneCycleSignature', { cycleId });
      let records: string[] = [];
      if (typeof signature?.obj.recordsJson === 'string') {
        try {
          const parsed: unknown = JSON.parse(signature.obj.recordsJson);
          if (Array.isArray(parsed)) records = parsed.filter((entry): entry is string => typeof entry === 'string');
        } catch {
          records = [];
        }
      }
      return {
        cycle: latest ? latest.obj : null,
        energyReadings: energy ? energy.count : 0,
        energyHead: energy ? energy.head : null,
        sensorReadings: reading ? reading.count : 0,
        sensorHead: reading ? reading.head : null,
        signature: signature
          ? {
              signer: String(signature.obj.signer),
              signerRole: String(signature.obj.signerRole),
              signedAt: Number(signature.obj.signedAt),
              records,
            }
          : null,
      };
    },

    async readLightState(): Promise<{ on: boolean; reason: string; updatedBy: string; updatedAt: number } | null> {
      const latest = await readLatest<UvcLaneLightState>('UvcLaneLightState', { stateId: `${lane}:light` });
      if (!latest) return null;
      return {
        on: latest.obj.on === 1,
        reason: latest.obj.reason,
        updatedBy: latest.obj.updatedBy,
        updatedAt: latest.obj.updatedAt,
      };
    },

    async appendJournal({
      kind,
      summary,
      audience,
    }: {
      kind: string;
      summary: string;
      audience?: string[];
    }): Promise<{ idHash: string; seq: number }> {
      return appendJournalEntry({ kind, summary, audience });
    },

    async tailJournal({ stream, limit = 20 }: { stream: string; limit?: number }): Promise<{
      entries: { idHash: string; seq: number; kind: string; summary: string; recordedAt: number }[];
    }> {
      const bound = Math.max(1, Math.min(100, limit ?? 20));
      const raw = await walkStream(stream, bound);
      return {
        entries: raw.map(({ idHash, obj }) => ({
          idHash,
          seq: Number(obj.seq),
          kind: String(obj.kind),
          summary: String(obj.summary),
          recordedAt: Number(obj.recordedAt),
        })),
      };
    },

    async tailEnergy({ cycleId, limit = 100 }: { cycleId: string; limit?: number }): Promise<{
      entries: { seq: number; joulesMilli: number; recordedAt: number }[];
    }> {
      const bound = Math.max(1, Math.min(10_000, limit ?? 100));
      const raw = await walkStream(`${cycleId}:energy`, bound);
      return {
        entries: raw.map(({ obj }) => ({
          seq: Number(obj.seq),
          joulesMilli: Number(obj.joulesMilli),
          recordedAt: Number(obj.recordedAt),
        })),
      };
    },

    async tailReadings({ cycleId, limit = 100 }: { cycleId: string; limit?: number }): Promise<{
      entries: { seq: number; irradianceMwCm2: number; recordedAt: number }[];
    }> {
      const bound = Math.max(1, Math.min(10_000, limit ?? 100));
      const raw = await walkStream(`${cycleId}:sensor`, bound);
      return {
        entries: raw.map(({ obj }) => ({
          seq: Number(obj.seq),
          irradianceMwCm2: Number(obj.irradianceMwCm2),
          recordedAt: Number(obj.recordedAt),
        })),
      };
    },

    ...createIoMOps({ connections, self, listenerUrl, email }),
  };

  const registry = new OperationRegistry();
  registry.register('uvcLane', plan, {
    description: 'UVC lab lane operations over ONE storage',
    methods: [
      'whoAmI',
      'ensureRoleAnchor',
      'roleAnchorIdHash',
      'postLaneChat',
      'tailLaneChat',
      'planPhase',
      'startCycle',
      'recordEnergy',
      'recordReading',
      'setLightState',
      'closeCycle',
      'signCycle',
      'readCycle',
      'readLightState',
      'appendJournal',
      'tailJournal',
      'tailEnergy',
      'tailReadings',
      'createIoMInvite',
      'awaitIoMInvite',
      'acceptIoMInvite',
    ].map(name => ({
      name,
      description: `uvcLane.${name}`,
    })),
  });
  // Connection calls go straight to the pairing manager and the connections
  // model — the same layer the product's CommServerManager drives — instead
  // of OneConnectionPlan, which the export map does not expose and whose
  // invitation rebuild drops the protocol version this instance restores above.
  const connectionPlan = {
    async createInvite({ mode }: { mode?: string } = {}): Promise<{
      url: string;
      publicKey: string;
      token: string;
      pairingMode: string | undefined;
    }> {
      const invitation = (await pairing.createInvitation(
        self(),
        undefined,
        mode ? { mode } : undefined,
      )) as unknown as { url: string; publicKey: string; token: string; pairingMode?: string };
      return {
        url: String(invitation.url),
        publicKey: String(invitation.publicKey),
        token: String(invitation.token),
        pairingMode: invitation.pairingMode,
      };
    },

    async connectWithInvite({
      url,
      publicKey,
      token,
      pairingMode,
    }: {
      url: string;
      publicKey: string;
      token: string;
      pairingMode?: string;
    }): Promise<{ person: string }> {
      await pairing.connectUsingInvitation(
        { url, publicKey, token, pairingMode } as Record<string, unknown>,
        self(),
      );
      return { person: self() };
    },

    // Projected to plain data: rows cross worker boundaries by structured
    // clone, and these are exactly the fields the snapshot projection reads.
    listConnections(): {
      remotePersonId: string | null;
      remoteInstanceId: string | null;
      isConnected: boolean;
      isInternetOfMe: boolean;
    }[] {
      const infos = connections.connectionsInfo() as unknown as Record<string, unknown>[];
      return infos.map(info => ({
        remotePersonId: typeof info.remotePersonId === 'string' ? info.remotePersonId : null,
        remoteInstanceId: typeof info.remoteInstanceId === 'string' ? info.remoteInstanceId : null,
        isConnected: info.isConnected === true,
        isInternetOfMe: info.isInternetOfMe === true,
      }));
    },

    getStatus(): { online: boolean; totalConnections: number; activeConnections: number } {
      const infos = connections.connectionsInfo() as unknown as { isConnected?: boolean }[];
      const active = infos.filter(info => info.isConnected === true).length;
      return { online: active > 0, totalConnections: infos.length, activeConnections: active };
    },
  };
  registry.register('connection', connectionPlan, {
    description: 'Pairing and connection status',
    methods: ['createInvite', 'connectWithInvite', 'listConnections', 'getStatus'].map(name => ({
      name,
      description: `connection.${name}`,
    })),
  });
  new IpcTransport(registry).register(createLaneIpcMain(port));

  // Feed-forward fires on the semantic versioned-object event, which is
  // dispatched after the version head is selected. The bytes-available event
  // fires while CHUM is still materializing the version graph, so rows
  // derived from it are not yet readable via getObjectByIdHash.
  const stopFeed = onVersionedObj.addListener(result => {
    const obj = result.obj as Record<string, unknown>;
    const type = obj.$type$ as string;
    if (!FEED_TYPES.includes(type)) return;
    postFeed(port, {
      type,
      kind: KIND_OF_TYPE[type],
      id: feedId(type, obj),
      idHash: result.idHash,
      hash: result.hash,
      obj,
    });
  });

  port.postMessage({ kind: 'ready', role, person: getInstanceOwnerIdHash() });

  return {
    async shutdown() {
      stopFeed();
      unregisterDialer();
      await connections.shutdown();
      await channelManager.shutdown();
      await leuteModel.shutdown();
      await multiUser.logout();
    },
  };
}

export type LanePlan = {
  whoAmI(): { person: string; role: string; instanceId: string };
  ensureRoleAnchor(input: { lane: string }): Promise<{ idHash: string; person: string }>;
  roleAnchorIdHash(input: { lane: string }): Promise<{ idHash: string }>;
  postLaneChat(input: { thread: string; text: string; audience: string[] }): Promise<{ idHash: string; seq: number }>;
  tailLaneChat(input: { thread: string; limit?: number }): Promise<{ entries: UvcLaneChat[] }>;
  planPhase(input: {
    title: string;
    targetDoseJm2: number;
    durationS: number;
    planId?: string;
    audience: string[];
  }): Promise<{ planId: string; idHash: string }>;
  startCycle(input: { planId: string; cycleId?: string; audience: string[] }): Promise<{ cycleId: string; idHash: string }>;
  recordEnergy(input: { cycleId: string; joulesMilli: number; audience: string[] }): Promise<{ idHash: string; seq: number }>;
  recordReading(input: {
    cycleId: string;
    irradianceMwCm2: number;
    audience: string[];
  }): Promise<{ idHash: string; seq: number }>;
  setLightState(input: { on: boolean; reason: string; audience: string[] }): Promise<{ idHash: string }>;
  closeCycle(input: { cycleId: string; reason: string; audience: string[] }): Promise<{
    idHash: string;
    energyReadings: number;
    joulesMilliTotal: number;
    sensorReadings: number;
  }>;
  signCycle(input: { cycleId: string; audience: string[] }): Promise<{ idHash: string; records: number }>;
  readCycle(input: { cycleId: string }): Promise<{
    cycle: UvcLaneCycle | null;
    energyReadings: number;
    energyHead: string | null;
    sensorReadings: number;
    sensorHead: string | null;
    signature: { signer: string; signerRole: string; signedAt: number; records: string[] } | null;
  }>;
  readLightState(): Promise<{ on: boolean; reason: string; updatedBy: string; updatedAt: number } | null>;
  appendJournal(input: { kind: string; summary: string; audience?: string[] }): Promise<{ idHash: string; seq: number }>;
  tailJournal(input: { stream: string; limit?: number }): Promise<{
    entries: { idHash: string; seq: number; kind: string; summary: string; recordedAt: number }[];
  }>;
  tailEnergy(input: { cycleId: string; limit?: number }): Promise<{
    entries: { seq: number; joulesMilli: number; recordedAt: number }[];
  }>;
  tailReadings(input: { cycleId: string; limit?: number }): Promise<{
    entries: { seq: number; irradianceMwCm2: number; recordedAt: number }[];
  }>;
  createIoMInvite(input: { relayUrl: string; openTimeoutMs?: number }): Promise<{
    invitationUrl: string;
    token: string;
    person: string;
  }>;
  awaitIoMInvite(input: { token: string; timeoutMs?: number }): Promise<{ person: string }>;
  acceptIoMInvite(input: { invitationUrl: string; timeoutMs?: number }): Promise<{ person: string }>;
};
