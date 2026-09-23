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
 * Transport note: the role mesh always uses host-switched `lab:` dials.
 * Same-person device enrollment uses a separate ConnectionsModel whose
 * pairing listener lives on the Glue commserver.
 */

import MultiUser from '@refinio/one.models/lib/models/Authenticator/MultiUser.js';
import LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import TopicModel from '@refinio/one.models/lib/models/Chat/TopicModel.js';
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
import { getObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import { calculateIdHashOfObj } from '@refinio/one.core/lib/util/object.js';
import { createAccess } from '@refinio/one.core/lib/access.js';
import { SET_ACCESS_MODE } from '@refinio/one.core/lib/storage-base-common.js';
import { getInstanceIdHash, getInstanceOwnerIdHash } from '@refinio/one.core/lib/instance.js';
import { createCryptoHash } from '@refinio/one.core/lib/system/crypto-helpers.js';
import { createCryptoApiFromDefaultKeys, getDefaultKeys } from '@refinio/one.core/lib/keychain/keychain.js';
import { getPublicKeys } from '@refinio/one.core/lib/keychain/key-storage-public.js';
import { signatureVerify } from '@refinio/one.core/lib/crypto/sign.js';
import {
  hexToUint8ArrayWithCheck,
  uint8arrayToHexString,
} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string.js';
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
  changeAttestationPayload,
  createUvcLaneChangeAttestation,
  createUvcLaneCycle,
  createUvcLaneEnergy,
  createUvcLaneJournal,
  createUvcLaneLightChange,
  createUvcLaneLightState,
  createUvcLanePhase,
  createUvcLaneReading,
  createUvcLaneSensorChange,
  createUvcLaneSensorState,
  createUvcLaneStreamHead,
} from './uvcLaneCycleRecipes.ts';
import type {
  UvcLaneChangeAttestation,
  UvcLaneCycle,
  UvcLaneLightState,
  UvcLanePhase,
  UvcLaneSensorState,
} from './uvcLaneCycleRecipes.ts';
import { createLaneIpcMain, postFeed } from './portIpc.ts';
import { createDeviceChatCommands } from './deviceChatCommands.ts';
import { createSensorFollower, createSimulationClock, DEMO_CLEANING, runLampCleaning } from './demoCleaning.ts';
import type { DeviceChatCommands } from './deviceChatCommands.ts';
import type { LanePort } from './portIpc.ts';
import { createIoMOps, DEFAULT_COMM_SERVER_URL } from './iomOps.ts';
import { createChatPlan } from './chatPlan.ts';

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
  /** Commserver carrying IoM discovery and pairing; defaults to Glue. */
  commServerUrl?: string;
  /** Lane entry URL prefix the QR-encoded IoM invitation links back to. */
  appBaseUrl?: string;
}

export interface LaneDeviceChange {
  idHash: string;
  hash: string;
  sourceRole: 'lamp' | 'sensor';
  kind: 'light' | 'sensor' | 'energy' | 'reading';
  summary: string;
  recordedAt: number;
  cycleId: string | null;
  attested: boolean;
}

export interface LaneChangeAttestation {
  scope: string;
  cycleId: string | null;
  idHash: string;
  hash: string;
  signer: string;
  signerRole: string;
  signedAt: number;
  records: string[];
  verified: boolean;
  cycleVersion: string | null;
}

export interface LaneChangeScope {
  scope: string;
  changes: LaneDeviceChange[];
  attestation: LaneChangeAttestation | null;
}

export interface AutomaticAttestationStatus {
  enabled: boolean;
  busy: boolean;
  error: string | null;
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
  UvcLaneLightChange: 'light-change',
  UvcLaneSensorState: 'sensor',
  UvcLaneSensorChange: 'sensor-change',
  UvcLaneEnergy: 'energy',
  UvcLaneReading: 'reading',
  UvcLaneCycleSignature: 'signature',
  UvcLaneChangeAttestation: 'attestation',
  UvcLaneJournal: 'journal',
  UvcLaneStreamHead: 'stream-head',
};

const FEED_TYPES = Object.keys(KIND_OF_TYPE);

function feedId(type: string, obj: Record<string, unknown>): string {
  if (type === 'UvcLaneChat') return `${String(obj.thread)}:${String(obj.seq)}`;
  if (type === 'UvcLaneEnergy' || type === 'UvcLaneReading' || type === 'UvcLaneJournal'
    || type === 'UvcLaneLightChange' || type === 'UvcLaneSensorChange') {
    return `${String(obj.stream)}:${String(obj.seq)}`;
  }
  if (type === 'UvcLaneRole') return `${String(obj.lane)}:${String(obj.role)}`;
  if (type === 'UvcLaneThread' || type === 'UvcLaneStreamHead') return String(obj.thread ?? obj.stream);
  if (type === 'UvcLaneCycle' || type === 'UvcLaneCycleSignature') return String(obj.cycleId);
  if (type === 'UvcLaneChangeAttestation') return String(obj.scope);
  if (type === 'UvcLanePhase') return String(obj.planId);
  if (type === 'UvcLaneLightState') return String(obj.stateId);
  if (type === 'UvcLaneSensorState') return String(obj.stateId);
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
  commServerUrl,
  appBaseUrl,
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
  // MultiUser's third argument is the logical instance name, not the storage
  // directory. Reusing `role` made every same-role/same-email worker derive
  // the same Instance id even when each worker had its own database. Include
  // the stable directory identity so a restarted session reopens the same
  // instance while another device/session gets fresh instance keys; the
  // Person id remains derived from the email and therefore stays identical.
  const instanceName = String(await createCryptoHash(`${lane}\u0000${role}\u0000${directory}`));
  await multiUser.loginOrRegister(email, secret, instanceName);
  await objectEvents.init();

  let expectedAdminPerson: string | null = null;

  const self = (): string => {
    const owner = getInstanceOwnerIdHash();
    if (!owner) throw new Error('UVC lab: instance has no owner.');
    return owner;
  };

  // The instance endpoint published in our profile is the mesh listener URL.
  // Browser and test lanes route it through the host-switched `lab:` dialer.
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

  // Device discovery and pairing use Glue through a dedicated model. The
  // lane mesh above remains hermetic and continues to route over MessagePorts.
  const iomCommServer = commServerUrl ?? DEFAULT_COMM_SERVER_URL;
  const iomConnections = new ConnectionsModel(leuteModel, {
    commServerUrl: iomCommServer,
    publicCommServerUrl: iomCommServer,
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
  await iomConnections.init();
  const iomPairing = iomConnections.pairing as unknown as {
    connectUsingInvitation(invitation: Record<string, unknown>, ...rest: unknown[]): Promise<unknown>;
  };
  const iomConnectUsingInvitation = iomPairing.connectUsingInvitation.bind(iomPairing);
  iomPairing.connectUsingInvitation = (invitation: Record<string, unknown>, ...rest: unknown[]) =>
    iomConnectUsingInvitation({ pairingProtocolVersion: PAIRING_PROTOCOL_VERSION, ...invitation }, ...rest);

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
  ): Promise<{ idHash: string; hash: string; obj: T } | null> {
    const idHash = await calculateIdHashOfObj({ $type$: typeName, ...idFields } as never);
    // Not yet stored is a normal state, asked explicitly — no error swallowing.
    if (!(await hasVersionHead(idHash as never))) return null;
    try {
      const result = await getObjectByIdHash(idHash as never);
      return { idHash, hash: result.hash, obj: result.obj as unknown as T };
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

  async function walkStreamStatus(stream: string, bound: number): Promise<{
    entries: { idHash: string; hash: string; obj: Record<string, unknown> }[];
    complete: boolean;
  }> {
    const head = await readStreamHead(stream);
    if (!head) return { entries: [], complete: true };
    let cursor = head ? head.head : '';
    const entries: { idHash: string; hash: string; obj: Record<string, unknown> }[] = [];
    while (cursor !== '' && entries.length < bound) {
      // Stream-head and entry versions arrive independently over CHUM. Expose
      // honest partial state until the referenced entry's version head lands;
      // that semantic arrival schedules the next snapshot.
      if (!(await hasVersionHead(cursor as never))) break;
      const result = await getObjectByIdHash(cursor as never);
      const obj = result.obj as unknown as Record<string, unknown>;
      entries.push({ idHash: result.idHash, hash: result.hash, obj });
      cursor = typeof obj.prev === 'string' ? obj.prev : '';
    }
    return {
      entries: entries.reverse(),
      complete: cursor === '' && entries.length === head.count,
    };
  }

  async function walkStream(stream: string, bound: number): Promise<{ idHash: string; hash: string; obj: Record<string, unknown> }[]> {
    return (await walkStreamStatus(stream, bound)).entries;
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
    stream,
    attestation,
    record,
  }: {
    kind: string;
    summary: string;
    audience?: string[];
    stream?: string;
    attestation?: string;
    record?: string;
  }): Promise<{ idHash: string; seq: number }> {
    return appendStreamEntry({
      stream: stream ?? `${lane}:${role}`,
      create: (stream, seq, prev) =>
        createUvcLaneJournal({ stream, seq, kind, summary, recordedAt: Date.now(), prev, attestation, record }),
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

  const attestationScope = (cycleId?: string): string => cycleId ?? `${lane}:standalone`;
  const attestationSummary = ({
    cycleId,
    lampRecords,
    sensorRecords,
  }: Pick<UvcLaneChangeAttestation, 'cycleId' | 'lampRecords' | 'sensorRecords'>): string => {
    const lampKind = cycleId === '' ? 'lamp change' : 'energy record';
    const sensorKind = cycleId === '' ? 'sensor change' : 'sensor reading';
    return `Admin attested to ${lampRecords.length} ${lampKind}${lampRecords.length === 1 ? '' : 's'} and ${sensorRecords.length} ${sensorKind}${sensorRecords.length === 1 ? '' : 's'}`;
  };

  /** "Lamp on" / "Sensor off", read from the signed change record itself. */
  async function signedSignal(recordHash: string): Promise<string | null> {
    const record = await getObject(recordHash as never) as unknown as { $type$: string; on?: unknown };
    if (record.$type$ === 'UvcLaneLightChange') return `Lamp ${record.on === 1 ? 'on' : 'off'}`;
    if (record.$type$ === 'UvcLaneSensorChange') return `Sensor ${record.on === 1 ? 'on' : 'off'}`;
    return null;
  }

  async function verifyAttestation(attestation: UvcLaneChangeAttestation): Promise<boolean> {
    if (expectedAdminPerson === null || attestation.signer !== expectedAdminPerson
      || attestation.signerRole !== 'admin' || attestation.lane !== lane) return false;
    try {
      const roleAnchor = await getObject(attestation.adminRole as never) as unknown as UvcLaneRoleAnchor;
      if (roleAnchor.$type$ !== 'UvcLaneRole' || roleAnchor.lane !== lane
        || roleAnchor.role !== 'admin' || roleAnchor.person !== attestation.signer) return false;
      const keys = await getObject(attestation.signingKey as never) as unknown as {
        $type$?: unknown;
        owner?: unknown;
      };
      if (keys.$type$ !== 'Keys' || keys.owner !== attestation.signer) return false;
      const publicKeys = await getPublicKeys(attestation.signingKey as never);
      const trustedKeys = await leuteModel.trust.getTrustedKeysForPerson(attestation.signer as SHA256IdHash<Person>);
      if (!trustedKeys.some(key => key.length === publicKeys.publicSignKey.length
        && key.every((byte, index) => byte === publicKeys.publicSignKey[index]))) return false;
      const payload = changeAttestationPayload(attestation);
      return signatureVerify(
        new TextEncoder().encode(payload),
        hexToUint8ArrayWithCheck(attestation.signature),
        publicKeys.publicSignKey,
      );
    } catch {
      return false;
    }
  }

  async function readStoredAttestation(scope: string): Promise<LaneChangeAttestation | null> {
    const stored = await readLatest<UvcLaneChangeAttestation>('UvcLaneChangeAttestation', { scope });
    if (!stored) return null;
    const verified = await verifyAttestation(stored.obj);
    return {
      scope: stored.obj.scope,
      cycleId: stored.obj.cycleId === '' ? null : stored.obj.cycleId,
      idHash: stored.idHash,
      hash: stored.hash,
      signer: stored.obj.signer,
      signerRole: stored.obj.signerRole,
      signedAt: stored.obj.signedAt,
      records: [...stored.obj.lampRecords, ...stored.obj.sensorRecords],
      verified,
      cycleVersion: stored.obj.cycleVersion ?? null,
    };
  }

  async function collectChangeScope(cycleId?: string): Promise<{
    scope: string;
    cycleVersion?: string;
    changes: LaneDeviceChange[];
    attestation: LaneChangeAttestation | null;
    complete: boolean;
  }> {
    const scope = attestationScope(cycleId);
    const attestation = await readStoredAttestation(scope);
    const attestedRecords = new Set<string>();
    const changes: LaneDeviceChange[] = [];
    let cycleVersion: string | undefined;
    let complete = true;

    if (cycleId === undefined) {
      if (attestation?.verified) for (const hash of attestation.records) attestedRecords.add(hash);
      const [lightResult, sensorResult] = await Promise.all([
        walkStreamStatus(`${lane}:light-changes`, 10_000),
        walkStreamStatus(`${lane}:sensor-changes`, 10_000),
      ]);
      const lightChanges = lightResult.entries;
      const sensorChanges = sensorResult.entries;
      complete = lightResult.complete && sensorResult.complete;
      for (const light of lightChanges) {
        changes.push({
          idHash: light.idHash,
          hash: light.hash,
          sourceRole: 'lamp',
          kind: 'light',
          summary: `light ${light.obj.on === 1 ? 'on' : 'off'}: ${String(light.obj.reason)}`,
          recordedAt: Number(light.obj.recordedAt),
          cycleId: null,
          attested: attestedRecords.has(light.hash),
        });
      }
      for (const sensor of sensorChanges) {
        changes.push({
          idHash: sensor.idHash,
          hash: sensor.hash,
          sourceRole: 'sensor',
          kind: 'sensor',
          summary: `sensor ${sensor.obj.on === 1 ? 'on' : 'off'}: ${String(sensor.obj.reason)}`,
          recordedAt: Number(sensor.obj.recordedAt),
          cycleId: null,
          attested: attestedRecords.has(sensor.hash),
        });
      }
    } else {
      const cycle = await readLatest<UvcLaneCycle>('UvcLaneCycle', { cycleId });
      cycleVersion = cycle?.hash;
      if (attestation?.verified && attestation.cycleVersion === cycleVersion) {
        for (const hash of attestation.records) attestedRecords.add(hash);
      }
      const [energyResult, readingResult] = await Promise.all([
        walkStreamStatus(`${cycleId}:energy`, 10_000),
        walkStreamStatus(`${cycleId}:sensor`, 10_000),
      ]);
      const energy = energyResult.entries;
      const readings = readingResult.entries;
      complete = energyResult.complete && readingResult.complete;
      for (const entry of energy) {
        changes.push({
          idHash: entry.idHash,
          hash: entry.hash,
          sourceRole: 'lamp',
          kind: 'energy',
          summary: `${Number(entry.obj.joulesMilli)} mJ delivered`,
          recordedAt: Number(entry.obj.recordedAt),
          cycleId,
          attested: attestedRecords.has(entry.hash),
        });
      }
      for (const entry of readings) {
        changes.push({
          idHash: entry.idHash,
          hash: entry.hash,
          sourceRole: 'sensor',
          kind: 'reading',
          summary: `${Number(entry.obj.irradianceMwCm2)} mW/cm2 irradiance`,
          recordedAt: Number(entry.obj.recordedAt),
          cycleId,
          attested: attestedRecords.has(entry.hash),
        });
      }
    }
    changes.sort((a, b) => a.recordedAt - b.recordedAt || a.hash.localeCompare(b.hash));
    return { scope, cycleVersion, changes, attestation, complete };
  }

  async function signReceivedChanges({
    cycleId,
    audience,
    expectedHashes,
  }: {
    cycleId?: string;
    audience: string[];
    expectedHashes?: string[];
  }): Promise<{ idHash: string; hash: string; records: number; verified: boolean }> {
    if (role !== 'admin') throw new Error('UVC lab: only the admin role signs received device changes.');
    if (expectedAdminPerson === null || self() !== expectedAdminPerson) {
      throw new Error('UVC lab: this worker is not the host-pinned lane administrator.');
    }
    if (!Array.isArray(audience) || audience.length === 0) {
      throw new Error('UVC lab: signChanges needs a non-empty audience including the doctor.');
    }
    const received = await collectChangeScope(cycleId);
    if (!received.complete) {
      throw new Error(`UVC lab: received device changes in ${received.scope} are still replicating.`);
    }
    if (cycleId !== undefined && received.cycleVersion === undefined) {
      throw new Error(`UVC lab: unknown cycle ${cycleId}.`);
    }
    if (received.changes.length === 0) {
      throw new Error(`UVC lab: no received lamp or sensor changes in ${received.scope}.`);
    }
    const currentHashes = received.changes.map(change => change.hash).sort();
    if (expectedHashes !== undefined) {
      const expected = [...expectedHashes].sort();
      if (expected.length !== currentHashes.length || expected.some((hash, index) => hash !== currentHashes[index])) {
        throw new Error('UVC lab: received changes changed after review; refresh before signing.');
      }
    }
    const signer = self();
    const signingKey = String(await getDefaultKeys(signer as SHA256IdHash<Person>));
    const adminRole = await readLatest<UvcLaneRoleAnchor>('UvcLaneRole', { lane, role: 'admin' });
    if (!adminRole || adminRole.obj.person !== signer) {
      throw new Error('UVC lab: admin role anchor does not identify the signing person.');
    }
    const signedAt = Date.now();
    const lampRecords = received.changes.filter(change => change.sourceRole === 'lamp').map(change => change.hash);
    const sensorRecords = received.changes.filter(change => change.sourceRole === 'sensor').map(change => change.hash);
    const signingInput = {
      scope: received.scope,
      lane,
      cycleId,
      cycleVersion: received.cycleVersion,
      lampRecords,
      sensorRecords,
      signer,
      signerRole: role,
      signedAt,
      signingKey,
      adminRole: adminRole.hash,
    };
    const cryptoApi = await createCryptoApiFromDefaultKeys(signer as SHA256IdHash<Person>);
    const signature = uint8arrayToHexString(cryptoApi.sign(new TextEncoder().encode(changeAttestationPayload(signingInput))));
    const attestation = createUvcLaneChangeAttestation({ ...signingInput, signature });
    const stored = await storeVersionedObject(attestation as never);
    await grant(stored.idHash, audience);
    const verified = await verifyAttestation(attestation);
    if (!verified) throw new Error('UVC lab: locally produced change attestation failed verification.');
    const summary = attestationSummary(attestation);
    await appendJournalEntry({
      kind: 'attestation',
      summary,
      audience,
      stream: `${lane}:attestations:admin`,
      attestation: stored.hash,
    });
    // One audit entry per lamp or sensor signal this signature newly covers.
    for (const change of received.changes) {
      if (change.attested || (change.kind !== 'light' && change.kind !== 'sensor')) continue;
      await appendJournalEntry({
        kind: 'signal',
        summary: change.summary,
        audience,
        stream: `${lane}:attestations:admin`,
        attestation: stored.hash,
        record: change.hash,
      });
    }
    return { idHash: stored.idHash, hash: stored.hash, records: currentHashes.length, verified };
  }

  const AUTOMATIC_STANDALONE_SCOPE = '';
  const AUTOMATIC_BATCH_LIMIT = 32;
  const AUTOMATIC_DEBOUNCE_MS = 75;
  const knownAutomaticCycles = new Set<string>();
  const automaticQueue = new Set<string>();
  let automaticAudience: string[] = [];
  let automaticStopped = false;
  let automaticTimer: ReturnType<typeof setTimeout> | null = null;
  let automaticRunPromise: Promise<void> | null = null;
  let automaticStatus: AutomaticAttestationStatus = { enabled: false, busy: false, error: null };

  function publishAutomaticStatus(next: AutomaticAttestationStatus): void {
    if (automaticStatus.enabled === next.enabled && automaticStatus.busy === next.busy
      && automaticStatus.error === next.error) return;
    automaticStatus = next;
    if (!automaticStopped) port.postMessage({ kind: 'automatic-attestation-changed' });
  }

  function updateAutomaticStatus(change: Partial<AutomaticAttestationStatus>): void {
    publishAutomaticStatus({ ...automaticStatus, ...change });
  }

  function sameHashes(left: string[], right: string[]): boolean {
    if (left.length !== right.length) return false;
    const a = [...left].sort();
    const b = [...right].sort();
    return a.every((hash, index) => hash === b[index]);
  }

  async function automaticallyAttestScope(scopeKey: string): Promise<void> {
    const cycleId = scopeKey === AUTOMATIC_STANDALONE_SCOPE ? undefined : scopeKey;
    const received = await collectChangeScope(cycleId);
    if (!received.complete || received.changes.length === 0) return;
    if (cycleId !== undefined && received.cycleVersion === undefined) return;
    const currentHashes = received.changes.map(change => change.hash);
    const exactAttestation = received.attestation?.verified === true
      && received.attestation.cycleVersion === (received.cycleVersion ?? null)
      && sameHashes(received.attestation.records, currentHashes);
    if (exactAttestation) return;
    await signReceivedChanges({ cycleId, audience: automaticAudience, expectedHashes: currentHashes });
  }

  async function runAutomaticAttestation(): Promise<void> {
    if (automaticStopped || !automaticStatus.enabled || automaticStatus.busy) return;
    updateAutomaticStatus({ busy: true, error: null });
    let error: string | null = null;
    let processed = 0;
    while (!automaticStopped && automaticStatus.enabled && automaticQueue.size > 0
      && processed < AUTOMATIC_BATCH_LIMIT) {
      const scopeKey = automaticQueue.values().next().value as string;
      automaticQueue.delete(scopeKey);
      try {
        await automaticallyAttestScope(scopeKey);
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
      }
      processed += 1;
    }
    updateAutomaticStatus({ busy: false, error });
    if (automaticQueue.size > 0) scheduleAutomaticAttestation();
  }

  function scheduleAutomaticAttestation(): void {
    if (automaticStopped || !automaticStatus.enabled || automaticStatus.busy || automaticTimer !== null) return;
    automaticTimer = setTimeout(() => {
      automaticTimer = null;
      const running = runAutomaticAttestation();
      automaticRunPromise = running;
      void running.finally(() => {
        if (automaticRunPromise === running) automaticRunPromise = null;
      });
    }, AUTOMATIC_DEBOUNCE_MS);
  }

  function queueAutomaticAttestation(scopeKey: string): void {
    if (automaticStopped || !automaticStatus.enabled) return;
    automaticQueue.add(scopeKey);
    scheduleAutomaticAttestation();
  }

  function automaticScopeFor(type: string, obj: Record<string, unknown>): string | null {
    if (type === 'UvcLaneLightChange' || type === 'UvcLaneSensorChange') return AUTOMATIC_STANDALONE_SCOPE;
    if (type === 'UvcLaneCycle') return typeof obj.cycleId === 'string' ? obj.cycleId : null;
    const stream = typeof obj.stream === 'string' ? obj.stream : '';
    if (type === 'UvcLaneEnergy' && stream.endsWith(':energy')) return stream.slice(0, -':energy'.length);
    if (type === 'UvcLaneReading' && stream.endsWith(':sensor')) return stream.slice(0, -':sensor'.length);
    if (type !== 'UvcLaneStreamHead') return null;
    if (stream === `${lane}:light-changes` || stream === `${lane}:sensor-changes`) {
      return AUTOMATIC_STANDALONE_SCOPE;
    }
    if (stream.endsWith(':energy')) return stream.slice(0, -':energy'.length);
    if (stream.endsWith(':sensor')) return stream.slice(0, -':sensor'.length);
    return null;
  }

  function observeAutomaticAttestation(type: string, obj: Record<string, unknown>): void {
    const scopeKey = automaticScopeFor(type, obj);
    if (scopeKey === null) return;
    if (scopeKey !== AUTOMATIC_STANDALONE_SCOPE) knownAutomaticCycles.add(scopeKey);
    queueAutomaticAttestation(scopeKey);
  }

  async function stopAutomaticAttestation(): Promise<void> {
    automaticStopped = true;
    automaticQueue.clear();
    if (automaticTimer !== null) {
      clearTimeout(automaticTimer);
      automaticTimer = null;
    }
    await automaticRunPromise;
  }

  const plan = {
    whoAmI(): { person: string; role: string; instanceId: string } {
      return { person: self(), role, instanceId: getInstanceIdHash() ?? '' };
    },

    configureLane({ lane: configuredLane, adminPerson }: { lane: string; adminPerson: string }): { ready: true } {
      if (configuredLane !== lane) throw new Error(`UVC lab: cannot configure worker for lane ${configuredLane}.`);
      if (!/^[0-9a-f]{64}$/.test(adminPerson)) throw new Error('UVC lab: configured admin must be a Person id hash.');
      if (expectedAdminPerson !== null && expectedAdminPerson !== adminPerson) {
        throw new Error('UVC lab: lane administrator is already pinned to another identity.');
      }
      expectedAdminPerson = adminPerson;
      return { ready: true };
    },

    enableAutomaticAttestation({ audience }: { audience: string[] }): AutomaticAttestationStatus {
      if (role !== 'admin') throw new Error('UVC lab: only the admin role enables automatic attestation.');
      if (expectedAdminPerson === null || self() !== expectedAdminPerson) {
        throw new Error('UVC lab: this worker is not the host-pinned lane administrator.');
      }
      if (!Array.isArray(audience) || audience.length === 0
        || audience.some(person => typeof person !== 'string' || !/^[0-9a-f]{64}$/.test(person))) {
        throw new Error('UVC lab: automatic attestation needs a non-empty Person-hash audience.');
      }
      automaticAudience = [...new Set(audience)];
      updateAutomaticStatus({ enabled: true, error: null });
      queueAutomaticAttestation(AUTOMATIC_STANDALONE_SCOPE);
      for (const cycleId of knownAutomaticCycles) queueAutomaticAttestation(cycleId);
      return { ...automaticStatus };
    },

    readAutomaticAttestationStatus(): AutomaticAttestationStatus {
      return { ...automaticStatus };
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
      if (role !== 'lamp') throw new Error('UVC lab: only the lamp role configures treatment parameters.');
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
      if (role !== 'lamp') throw new Error('UVC lab: only the lamp role records delivered energy.');
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
      if (role !== 'sensor') throw new Error('UVC lab: only the sensor role records irradiance readings.');
      const sensorState = await readLatest<UvcLaneSensorState>('UvcLaneSensorState', { stateId: `${lane}:sensor` });
      if (!sensorState || sensorState.obj.on !== 1) {
        throw new Error('UVC lab: the sensor must be active before recording irradiance readings.');
      }
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
      if (role !== 'lamp') throw new Error('UVC lab: only the lamp role records light changes.');
      const state: UvcLaneLightState = createUvcLaneLightState({
        stateId: `${lane}:light`,
        on,
        reason,
        updatedBy: self(),
        updatedAt: Date.now(),
      });
      const stored = await storeVersionedObject(state as never);
      await grant(stored.idHash, audience);
      await appendStreamEntry({
        stream: `${lane}:light-changes`,
        create: (stream, seq, prev) => createUvcLaneLightChange({
          stream,
          seq,
          on,
          reason,
          updatedBy: self(),
          recordedAt: state.updatedAt,
          prev,
        }),
        audience,
      });
      await appendJournalEntry({
        kind: 'light',
        summary: `light source ${on ? 'ON' : 'OFF'} (${reason})`,
        audience,
      });
      return { idHash: stored.idHash };
    },

    async setSensorState({
      on,
      reason,
      audience,
    }: {
      on: boolean;
      reason: string;
      audience: string[];
    }): Promise<{ idHash: string }> {
      if (role !== 'sensor') throw new Error('UVC lab: only the sensor role records sensor changes.');
      const state: UvcLaneSensorState = createUvcLaneSensorState({
        stateId: `${lane}:sensor`,
        on,
        reason,
        updatedBy: self(),
        updatedAt: Date.now(),
      });
      const stored = await storeVersionedObject(state as never);
      await grant(stored.idHash, audience);
      await appendStreamEntry({
        stream: `${lane}:sensor-changes`,
        create: (stream, seq, prev) => createUvcLaneSensorChange({
          stream,
          seq,
          on,
          reason,
          updatedBy: self(),
          recordedAt: state.updatedAt,
          prev,
        }),
        audience,
      });
      await appendJournalEntry({
        kind: 'sensor',
        summary: `sensor ${on ? 'ON' : 'OFF'} (${reason})`,
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
    }): Promise<{ idHash: string; hash: string; records: number; verified: boolean }> {
      return signReceivedChanges({ cycleId, audience });
    },

    async signChanges(input: {
      cycleId?: string;
      audience: string[];
      expectedHashes?: string[];
    }): Promise<{ idHash: string; hash: string; records: number; verified: boolean }> {
      return signReceivedChanges(input);
    },

    async readChanges({ cycleId }: { cycleId?: string } = {}): Promise<{
      scope: string;
      changes: LaneDeviceChange[];
      attestation: LaneChangeAttestation | null;
    }> {
      const result = await collectChangeScope(cycleId);
      return { scope: result.scope, changes: result.changes, attestation: result.attestation };
    },

    async listChanges({ cycleIds = [] }: { cycleIds?: string[] } = {}): Promise<LaneChangeScope[]> {
      const scopes = await Promise.all([
        collectChangeScope(),
        ...cycleIds.map(cycleId => collectChangeScope(cycleId)),
      ]);
      return scopes.map(result => ({ scope: result.scope, changes: result.changes, attestation: result.attestation }));
    },

    async readCycle({ cycleId }: { cycleId: string }): Promise<{
      cycle: UvcLaneCycle | null;
      energyReadings: number;
      energyHead: string | null;
      sensorReadings: number;
      sensorHead: string | null;
      signature: { signer: string; signerRole: string; signedAt: number; records: string[]; verified: boolean } | null;
      attestation: LaneChangeAttestation | null;
    }> {
      const latest = await readLatest<UvcLaneCycle>('UvcLaneCycle', { cycleId });
      const energy = await readStreamHead(`${cycleId}:energy`);
      const reading = await readStreamHead(`${cycleId}:sensor`);
      const changeScope = await collectChangeScope(cycleId);
      const attestation = changeScope.attestation;
      const currentHashes = changeScope.changes.map(change => change.hash).sort();
      const attestedHashes = [...(attestation?.records ?? [])].sort();
      const currentAttestation = attestation?.verified === true
        && attestation.cycleVersion === latest?.hash
        && currentHashes.length === attestedHashes.length
        && currentHashes.every((hash, index) => hash === attestedHashes[index]);
      return {
        cycle: latest ? latest.obj : null,
        energyReadings: energy ? energy.count : 0,
        energyHead: energy ? energy.head : null,
        sensorReadings: reading ? reading.count : 0,
        sensorHead: reading ? reading.head : null,
        signature: currentAttestation && attestation
          ? {
              signer: attestation.signer,
              signerRole: attestation.signerRole,
              signedAt: attestation.signedAt,
              records: attestation.records,
              verified: true,
            }
          : null,
        attestation,
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

    async readSensorState(): Promise<{ on: boolean; reason: string; updatedBy: string; updatedAt: number } | null> {
      const latest = await readLatest<UvcLaneSensorState>('UvcLaneSensorState', { stateId: `${lane}:sensor` });
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
      entries: {
        idHash: string;
        seq: number;
        kind: string;
        summary: string;
        recordedAt: number;
        signatures: string[];
        verified: boolean;
        scope?: string;
      }[];
    }> {
      const bound = Math.max(1, Math.min(100, limit ?? 20));
      const raw = await walkStream(stream, bound);
      return {
        entries: await Promise.all(raw.map(async ({ idHash, obj }) => {
          const attestationHash = typeof obj.attestation === 'string' ? obj.attestation : null;
          let verified = false;
          let verifiedAttestation: UvcLaneChangeAttestation | null = null;
          if (attestationHash !== null) {
            try {
              const attestation = await getObject(attestationHash as never) as unknown as UvcLaneChangeAttestation;
              verified = attestation.$type$ === 'UvcLaneChangeAttestation' && await verifyAttestation(attestation);
              if (verified) verifiedAttestation = attestation;
            } catch {
              verified = false;
            }
          }
          const recordHash = typeof obj.record === 'string' ? obj.record : null;
          if (recordHash !== null) {
            // A signal entry is shown only as its signed record says, and only if the signature covers it.
            const covered = verifiedAttestation !== null
              && [...verifiedAttestation.lampRecords, ...verifiedAttestation.sensorRecords].includes(recordHash);
            const signal = covered ? await signedSignal(recordHash) : null;
            return {
              idHash,
              seq: Number(obj.seq),
              kind: 'signal',
              summary: signal ?? 'Signal entry not covered by a verified admin signature.',
              recordedAt: verifiedAttestation?.signedAt ?? Number(obj.recordedAt),
              signatures: signal !== null && attestationHash !== null ? [attestationHash] : [],
              verified: signal !== null,
            };
          }
          const signedSummary = verifiedAttestation === null
            ? String(obj.summary)
            : attestationSummary(verifiedAttestation);
          return {
            idHash,
            seq: Number(obj.seq),
            kind: verifiedAttestation === null ? String(obj.kind) : 'attestation',
            ...(verifiedAttestation === null ? {} : { scope: verifiedAttestation.scope }),
            summary: signedSummary,
            recordedAt: verifiedAttestation?.signedAt ?? Number(obj.recordedAt),
            signatures: verified && attestationHash !== null ? [attestationHash] : [],
            verified,
          };
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

    ...createIoMOps({
      connections: iomConnections,
      self,
      email,
      appBaseUrl: appBaseUrl ?? 'http://localhost/',
    }),
  };

  // Private lane chat uses native deterministic 1:1 topics. TopicModel grants
  // channel access only to the pair; no lane-wide audience is involved.
  const topicModel = new TopicModel(channelManager, leuteModel);
  await topicModel.init();
  let deviceCommands: DeviceChatCommands | null = null;
  const simulationClock = createSimulationClock();
  const chatPlan = createChatPlan({
    topicModel,
    channelManager,
    self,
    notify: (peer, message) => {
      port.postMessage({ kind: 'chat-updated', peer, message: { id: message.id, incoming: message.incoming } });
      void deviceCommands?.receive(peer, message);
    },
  });
  // Lamp and sensor chats are command channels: on, off, status.
  if (role === 'lamp' || role === 'sensor') {
    deviceCommands = createDeviceChatCommands({
      device: role === 'lamp' ? 'Lamp' : 'Sensor',
      readState: role === 'lamp' ? plan.readLightState : plan.readSensorState,
      setState: (on, reason, audience) => role === 'lamp'
        ? plan.setLightState({ on, reason, audience })
        : plan.setSensorState({ on, reason, audience }),
      reply: (peer, text) => chatPlan.sendChat({ peer, text }),
      clean: role === 'lamp'
        ? async audience => {
          const done = await runLampCleaning(plan, audience, simulationClock.sleep);
          return `Lamp cleaning finished · ${DEMO_CLEANING.durationS} s at ${DEMO_CLEANING.irradianceMwCm2} mW/cm² · `
            + `${done.joulesMilliTotal} mJ in ${done.energyReadings} energy records · ${done.sensorReadings} sensor readings so far`;
        }
        : undefined,
    });
  }
  const commands = deviceCommands;
  // The sensor measures the lamp on the instance that acts for the device.
  const sensorFollower = role === 'sensor' && commands
    ? createSensorFollower({
      lane,
      readLightState: plan.readLightState,
      readCycleEnded: async cycleId => {
        const latest = await readLatest<UvcLaneCycle>('UvcLaneCycle', { cycleId });
        return latest ? latest.obj.endedAt !== 0 : null;
      },
      setSensorState: plan.setSensorState,
      recordReading: plan.recordReading,
    }, () => commands.audience(), simulationClock.sleep)
    : null;

  const registry = new OperationRegistry();
  registry.register('uvcLane', plan, {
    description: 'UVC lab lane operations over ONE storage',
    methods: [
      'whoAmI',
      'configureLane',
      'enableAutomaticAttestation',
      'readAutomaticAttestationStatus',
      'ensureRoleAnchor',
      'roleAnchorIdHash',
      'assignRole',
      'listRoles',
      'postLaneChat',
      'tailLaneChat',
      'planPhase',
      'startCycle',
      'recordEnergy',
      'recordReading',
      'setLightState',
      'setSensorState',
      'closeCycle',
      'signCycle',
      'signChanges',
      'readChanges',
      'listChanges',
      'readCycle',
      'readLightState',
      'readSensorState',
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
  registry.register('chat', chatPlan, {
    description: 'UVC lab private 1:1 chat over topic channels',
    methods: ['watchPeers', 'openChat', 'sendChat', 'readChat'].map(name => ({
      name,
      description: `chat.${name}`,
    })),
  });
  if (deviceCommands) {
    registry.register('device', deviceCommands, {
      description: 'UVC lab device chat commands (on, off, status)',
      methods: [{ name: 'enable', description: 'device.enable' }],
    });
  }
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
      const infos = [
        ...(connections.connectionsInfo() as unknown as Record<string, unknown>[]),
        ...(iomConnections.connectionsInfo() as unknown as Record<string, unknown>[]),
      ];
      return infos.map(info => ({
        remotePersonId: typeof info.remotePersonId === 'string' ? info.remotePersonId : null,
        remoteInstanceId: typeof info.remoteInstanceId === 'string' ? info.remoteInstanceId : null,
        isConnected: info.isConnected === true,
        // A second instance of our own Person is IoM by identity. The direct
        // tracked-CHUM row starts with isInternetOfMe=false even for this
        // canonical same-person pairing, so project the semantic condition.
        isInternetOfMe: info.isInternetOfMe === true || info.remotePersonId === self(),
      }));
    },

    getStatus(): { online: boolean; totalConnections: number; activeConnections: number } {
      const infos = [
        ...(connections.connectionsInfo() as unknown as { isConnected?: boolean }[]),
        ...(iomConnections.connectionsInfo() as unknown as { isConnected?: boolean }[]),
      ];
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
    observeAutomaticAttestation(type, obj);
    void sensorFollower?.observe(type, obj);
    postFeed(port, {
      type,
      kind: KIND_OF_TYPE[type],
      id: feedId(type, obj),
      idHash: result.idHash,
      hash: result.hash,
      obj,
    });
  });

  const notifyConnections = () => port.postMessage({ kind: 'connections-changed' });
  const stopConnections = connections.onConnectionsChange.listen(notifyConnections);
  const stopIoMConnections = iomConnections.onConnectionsChange.listen(notifyConnections);

  port.postMessage({ kind: 'ready', role, person: getInstanceOwnerIdHash() });

  return {
    async shutdown() {
      stopFeed();
      simulationClock.stop();
      await sensorFollower?.stop();
      await deviceCommands?.idle();
      await stopAutomaticAttestation();
      stopConnections();
      stopIoMConnections();
      unregisterDialer();
      await chatPlan.shutdown();
      await topicModel.shutdown();
      await iomConnections.shutdown();
      await connections.shutdown();
      await channelManager.shutdown();
      await leuteModel.shutdown();
      await multiUser.logout();
    },
  };
}

export type LanePlan = {
  whoAmI(): { person: string; role: string; instanceId: string };
  configureLane(input: { lane: string; adminPerson: string }): { ready: true };
  enableAutomaticAttestation(input: { audience: string[] }): AutomaticAttestationStatus;
  readAutomaticAttestationStatus(): AutomaticAttestationStatus;
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
  setSensorState(input: { on: boolean; reason: string; audience: string[] }): Promise<{ idHash: string }>;
  closeCycle(input: { cycleId: string; reason: string; audience: string[] }): Promise<{
    idHash: string;
    energyReadings: number;
    joulesMilliTotal: number;
    sensorReadings: number;
  }>;
  signCycle(input: { cycleId: string; audience: string[] }): Promise<{
    idHash: string;
    hash: string;
    records: number;
    verified: boolean;
  }>;
  signChanges(input: { cycleId?: string; audience: string[]; expectedHashes?: string[] }): Promise<{
    idHash: string;
    hash: string;
    records: number;
    verified: boolean;
  }>;
  readChanges(input?: { cycleId?: string }): Promise<LaneChangeScope>;
  listChanges(input?: { cycleIds?: string[] }): Promise<LaneChangeScope[]>;
  readCycle(input: { cycleId: string }): Promise<{
    cycle: UvcLaneCycle | null;
    energyReadings: number;
    energyHead: string | null;
    sensorReadings: number;
    sensorHead: string | null;
    signature: { signer: string; signerRole: string; signedAt: number; records: string[]; verified: boolean } | null;
    attestation: LaneChangeAttestation | null;
  }>;
  readLightState(): Promise<{ on: boolean; reason: string; updatedBy: string; updatedAt: number } | null>;
  readSensorState(): Promise<{ on: boolean; reason: string; updatedBy: string; updatedAt: number } | null>;
  appendJournal(input: { kind: string; summary: string; audience?: string[] }): Promise<{ idHash: string; seq: number }>;
  tailJournal(input: { stream: string; limit?: number }): Promise<{
    entries: {
      idHash: string;
      seq: number;
      kind: string;
      summary: string;
      recordedAt: number;
      signatures: string[];
      verified: boolean;
    }[];
  }>;
  tailEnergy(input: { cycleId: string; limit?: number }): Promise<{
    entries: { seq: number; joulesMilli: number; recordedAt: number }[];
  }>;
  tailReadings(input: { cycleId: string; limit?: number }): Promise<{
    entries: { seq: number; irradianceMwCm2: number; recordedAt: number }[];
  }>;
  createIoMInvite(): Promise<{
    invitationUrl: string;
    token: string;
    person: string;
  }>;
  awaitIoMInvite(input: { token: string; timeoutMs?: number }): Promise<{ person: string }>;
  acceptIoMInvite(input: { invitationUrl: string; timeoutMs?: number }): Promise<{ person: string }>;
};
