import '@refinio/one.core/lib/system/load-nodejs.js';

import {createAccess} from '@refinio/one.core/lib/access.js';
import {
  getChumSyncDiagnostics,
  onChumImportBatch,
} from '@refinio/one.core/lib/chum-sync.js';
import {getInstanceIdHash, getInstanceOwnerIdHash} from '@refinio/one.core/lib/instance.js';
import {createMessageBus} from '@refinio/one.core/lib/message-bus.js';
import {calculateIdHashForStoredObj} from '@refinio/one.core/lib/microdata-to-id-hash.js';
import {createCryptoApiFromDefaultKeys} from '@refinio/one.core/lib/keychain/keychain.js';
import {ensurePublicSignKey, signatureVerify} from '@refinio/one.core/lib/crypto/sign.js';
import type {Instance, Person} from '@refinio/one.core/lib/recipes.js';
import {SET_ACCESS_MODE} from '@refinio/one.core/lib/storage-base-common.js';
import {getObject, storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects.js';
import {
  getCurrentVersionHash,
  getIdObject,
  getObjectByIdHash,
  storeVersionedObject,
  storeVersionedObjectSilently,
} from '@refinio/one.core/lib/storage-versioned-objects.js';
import {calculateHashOfObj, calculateIdHashOfObj} from '@refinio/one.core/lib/util/object.js';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks.js';
import type {HexString} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string.js';
import {ConnectionPhoneBookRecipes} from '@refinio/connection.core/recipes';
import {
  createConnectionFromQuicVC,
  QuicVCConnectionManager,
  type ConnectionEstablishedEvent,
  type DeviceIdentityCredential,
  type QuicVCPeerTrustInfo,
} from '@refinio/connection.core';
import {
  createNodeQuicVCTransport,
  type NodeQuicVCTransport,
} from '@refinio/connection.core/node';
import ConnectionsModel from '@refinio/one.models/lib/models/ConnectionsModel.js';
import LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import MultiUser from '@refinio/one.models/lib/models/Authenticator/MultiUser.js';
import type {Invitation} from '@refinio/one.models/lib/misc/ConnectionEstablishment/PairingManager.js';
import {isRegisteredInstanceKeyForPerson} from '@refinio/one.models/lib/misc/ConnectionEstablishment/RegisteredInstanceKey.js';
import {exchangeConnectionGroupName} from '@refinio/one.models/lib/misc/ConnectionEstablishment/protocols/ExchangeConnectionGroupName.js';
import {exchangeDirectChumReady} from '@refinio/one.models/lib/misc/ConnectionEstablishment/protocols/ExchangeDirectChumReady.js';
import {exchangeInstanceIdObjects} from '@refinio/one.models/lib/misc/ConnectionEstablishment/protocols/ExchangeInstanceIds.js';
import {verifyAndExchangePersonId} from '@refinio/one.models/lib/misc/ConnectionEstablishment/protocols/ExchangePersonIds.js';
import {sync} from '@refinio/one.models/lib/misc/ConnectionEstablishment/protocols/Sync.js';
import RecipesExperimental from '@refinio/one.models/lib/recipes/recipes-experimental.js';
import RecipesStable from '@refinio/one.models/lib/recipes/recipes-stable.js';
import {
  ReverseMapsExperimental,
  ReverseMapsForIdObjectsExperimental,
} from '@refinio/one.models/lib/recipes/reversemaps-experimental.js';
import {
  ReverseMapsStable,
  ReverseMapsForIdObjectsStable,
} from '@refinio/one.models/lib/recipes/reversemaps-stable.js';
import type {OneCoreTrieStorageDeps} from '@refinio/trie.core';
import {
  UVC_RECIPES,
  isUvcChumSyncType,
  UvcControlPlan,
  UvcFacilityPlan,
  UvcProvisioningController,
  UvcStateTrie,
  projectUvcStateTrieEntryHashes,
  makeEarlierUvcControlTrieRootId,
  makeEarlierUvcPhoneBookTrieRootId,
  makeUvcControlTrieRootId,
  makeUvcJournalTrieRootId,
  makeLegacyUvcControlTrieRootId,
  makeLegacyUvcPhoneBookTrieRootId,
  makeLegacyUvcProvisioningTrieRootId,
  makePreviousUvcControlTrieRootId,
  makePreviousUvcPhoneBookTrieRootId,
  makePreviousUvcProvisioningTrieRootId,
  makeUvcPhoneBookTrieRootId,
  makeUvcProvisioningTrieRootId,
  type UvcDiscoveryObservation,
  type UvcDisinfectionRun,
  type UvcRoom,
  type UvcRoomResource,
  type UvcControlCommand,
  type UvcControlObservation,
  type UvcAdminRoleGrantResult,
  type UvcAdminRoleGrant,
  type UvcDeviceIdentityCertificate,
  type UvcDeviceIdentityCertificateResult,
  type UvcDeviceIdentityProofResult,
  type UvcIdentityAssignmentResult,
  type UvcStateEntry,
  type UvcStateTrieRoot,
} from '@refinio/uvc.core';
import {
  GroovAuthorityClient,
  QuicVCHeadlessProvisioningClient,
  type GroovAuthorityState,
} from '@uvc/groov-authority';
import {app} from 'electron';
import path from 'node:path';
import {createPublicKey, randomUUID, verify as verifyNodeSignature} from 'node:crypto';

import type {CubeUvcCycleRecord, DiscoveryDeviceSnapshot, SettingsSnapshot} from '@shared/contracts';
import {DEFAULT_UVC_COMM_SERVER_URL} from '@shared/settings/registry';

const chumDiagnostics = createMessageBus('uvc-cube-chum-diagnostics');
for (const source of ['chum-sync', 'chum-importer']) {
  chumDiagnostics.on(`${source}:log`, (_source, message, ...details) => {
    const text = String(message);
    if (
      process.env.UVC_CHUM_DEBUG === '1'
      || text.includes('Failure during chum')
      || text.includes('IMPORTER ENDED WITH ERROR')
      || text.includes('Sync cycle had errors')
      || text.includes('BAD REQUEST')
    ) {
      console.error(`[UvcCube][${source}] ${text}`, ...details);
    }
  });
  chumDiagnostics.on(`${source}:debug`, (_source, message, ...details) => {
    if (process.env.UVC_CHUM_DEBUG === '1') {
      console.error(`[UvcCube][${source}][debug] ${String(message)}`, ...details);
    }
  });
}

/**
 * Cube consumes an app peer's phone-book root to learn its locally observed
 * devices. The app peer only consumes Cube's correlated control results; it
 * must not spend its foreground data lane importing Cube's discovery view.
 *
 * calculateIdHashForStoredObj returns the input for ID microdata and derives the
 * same ID for a concrete root version. It performs no version-head lookup or
 * read-time recovery.
 */
async function isCubeChumExportObject(
  hash: SHA256Hash | SHA256IdHash,
  type: string,
): Promise<boolean> {
  if (!isUvcChumSyncType(type)) return false;
  if (type !== 'UvcStateTrieRoot') return true;

  const idHash = await calculateIdHashForStoredObj(
    hash as SHA256Hash<UvcStateTrieRoot>,
    'UvcStateTrieRoot',
  );
  if (!idHash) {
    throw new Error(`[UvcCube] ${String(hash)} is not a versioned UvcStateTrieRoot`);
  }
  const rootId = await getIdObject(idHash);
  if (typeof rootId.id !== 'string') {
    throw new Error(`[UvcCube] UvcStateTrieRoot ${String(hash)} has no id`);
  }
  return rootId.id.startsWith('uvc:control:');
}

export interface CubeOneIdentity {
  personId: string;
  instanceId: string;
  publicKey: string;
  publicSignKey: string;
  displayName: string;
}

export interface CubeControlEvidence {
  commandHash: SHA256Hash<UvcControlCommand>;
  command: UvcControlCommand;
  observationHash: SHA256Hash<UvcControlObservation>;
  observation: UvcControlObservation;
  recordedAt: number;
}

function requiredSetting(settings: SettingsSnapshot, key: string, fallback: string): string {
  const value = settings['uvc.identity']?.[key];
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || fallback;
}

const storage: OneCoreTrieStorageDeps = {
  storeVersionedObject: async object => await storeVersionedObject(object as never) as never,
  storeVersionedObjectSilently: async object => await storeVersionedObjectSilently(
    object as never,
  ) as never,
  getObjectByIdHash: async idHash => await getObjectByIdHash(idHash as never) as never,
  calculateHashOfObj: async object => await calculateHashOfObj(object as never) as string,
  calculateIdHashOfObj: async object => await calculateIdHashOfObj(object as never) as string,
  getCurrentVersionHash: async idHash => await getCurrentVersionHash(idHash as never) as string,
  getObject: async hash => await getObject(hash as never) as never,
};

/** The single independent ONE instance owned by Electron main. */
export class CubeOneRuntime {
  private identity?: CubeOneIdentity;
  private ownerPersonId?: SHA256IdHash<Person>;
  private ownerInstanceId?: SHA256IdHash<Instance>;
  private phoneBook?: UvcStateTrie;
  private journal?: UvcStateTrie;
  private provisioning?: UvcStateTrie;
  private controlPlan?: UvcControlPlan;
  private facility?: UvcFacilityPlan;
  private provisioningController?: UvcProvisioningController;
  private provisioningClient?: QuicVCHeadlessProvisioningClient;
  private authorityClient?: GroovAuthorityClient;
  private quicManager?: QuicVCConnectionManager;
  private quicTransport?: NodeQuicVCTransport;
  private leuteModel?: LeuteModel;
  private connectionsModel?: ConnectionsModel;
  private readonly controlTries = new Map<string, UvcStateTrie>();
  private readonly pairedPeople = new Set<SHA256IdHash<Person>>();
  private readonly discoveredDevices = new Map<string, DiscoveryDeviceSnapshot>();
  private readonly provisionedDeviceEvidenceByPerson = new Map<string, {
    hardwareDeviceId: string;
    publicKey: string;
    certifiedAt: number;
  }>();
  private readonly controlPeerConnections = new Map<string, Promise<void>>();
  private readonly importedDiscoveryAt = new Map<string, number>();
  private readonly consumed = new Set<string>();
  private readonly importedDisinfectionRuns = new Map<string, UvcDisinfectionRun>();
  private disconnectImportListener?: () => void;
  /**
   * Preserve producer ordering without coupling independent peers. A command
   * imported from Expo can synchronously wait for an ESP-owned observation;
   * putting both imports on one global tail deadlocks that observation behind
   * the command that it must complete.
   */
  private readonly consumeTails = new Map<SHA256IdHash<Person>, Promise<void>>();

  async init(settings: SettingsSnapshot): Promise<CubeOneIdentity> {
    if (this.identity) {
      return this.identity;
    }
    const email = requiredSetting(settings, 'email', 'cube@uvc.local');
    const password = requiredSetting(settings, 'password', 'uvc-cube-local');
    const instanceName = requiredSetting(settings, 'instanceName', 'uvc-cube');
    const displayName = requiredSetting(settings, 'displayName', 'UVC Cube');
    const commServerUrl = process.env.UVC_COMM_SERVER_URL
      ?? requiredSetting(settings, 'commServerUrl', DEFAULT_UVC_COMM_SERVER_URL);
    const one = new MultiUser({
      directory: path.join(app.getPath('userData'), 'one'),
      recipes: [
        ...RecipesStable,
        ...RecipesExperimental,
        ...ConnectionPhoneBookRecipes,
        ...UVC_RECIPES,
      ],
      reverseMaps: new Map([...ReverseMapsStable, ...ReverseMapsExperimental]) as never,
      reverseMapsForIdObjects: new Map([
        ...ReverseMapsForIdObjectsStable,
        ...ReverseMapsForIdObjectsExperimental,
      ]) as never,
      storageInitTimeout: 20_000,
    });
    await one.loginOrRegister(email, password, instanceName);

    const ownerPersonId = getInstanceOwnerIdHash();
    const ownerInstanceId = getInstanceIdHash();
    if (!ownerPersonId || !ownerInstanceId) {
      throw new Error('[UvcCube] ONE login completed without owner and instance ids');
    }
    this.ownerPersonId = ownerPersonId;
    this.ownerInstanceId = ownerInstanceId;
    this.leuteModel = new LeuteModel(commServerUrl, true);
    // Cube is the stable service endpoint. App peers initiate its relay lane;
    // the resulting CHUM session is still bidirectional. If Cube also creates
    // an outgoing route, both peers repeatedly replace/drop the competing lane
    // before a newly published trie root can be imported.
    this.connectionsModel = new ConnectionsModel(this.leuteModel, {
      commServerUrl,
      establishOutgoingConnections: false,
      objectFilter: isCubeChumExportObject,
      importFilter: async (_hash, type) => isUvcChumSyncType(type),
      chumSyncOptions: {
        priorityWakeupObjectTypes: ['UvcStateTrieRoot'],
        connectedAfterPriorityObjectTypes: ['UvcStateTrieRoot'],
        traceObjectTypes: ['UvcStateTrieRoot'],
        importBatchContextObjectTypes: ['UvcStateTrieRoot'],
      },
      priorityRootIdHashesFactory: async (
        localPersonId,
        _localInstanceId,
        remotePersonId,
        remoteInstanceId,
      ) => await Promise.all([
        calculateIdHashOfObj({
          $type$: 'UvcStateTrieRoot',
          id: makeUvcPhoneBookTrieRootId({
            ownerPersonId: remotePersonId,
            ownerInstanceId: remoteInstanceId,
          }),
        }),
        calculateIdHashOfObj({
          $type$: 'UvcStateTrieRoot',
          id: makeUvcControlTrieRootId({
            ownerPersonId: remotePersonId,
            ownerInstanceId: remoteInstanceId,
            audiencePersonId: localPersonId,
          }),
        }),
        calculateIdHashOfObj({
          $type$: 'UvcStateTrieRoot',
          id: makeUvcJournalTrieRootId({
            ownerPersonId: remotePersonId,
            ownerInstanceId: remoteInstanceId,
          }),
        }),
      ]),
    });
    await this.leuteModel.init();
    await this.connectionsModel.init();
    for (const someone of await this.leuteModel.others()) {
      for (const personId of someone.identities()) {
        this.pairedPeople.add(personId);
      }
    }
    this.connectionsModel.setKeyMismatchHandler(async (
      remotePersonId,
      message,
      remotePublicKey,
    ) => {
      const registered = await isRegisteredInstanceKeyForPerson(
        this.leuteModel!,
        remotePersonId as SHA256IdHash<Person>,
        remotePublicKey,
      );
      const decision = registered ? 'Authorizing' : 'Rejecting';
      const writeLog = registered ? console.warn : console.error;
      writeLog(
        `[UvcCube] ${decision} Person key mismatch for known peer ${remotePersonId.slice(0, 16)} `
        + `on ${registered ? 'registered' : 'unknown'} route ${remotePublicKey.slice(0, 16)}: ${message}`,
      );
      return registered;
    });
    const cryptoApi = await createCryptoApiFromDefaultKeys(ownerInstanceId);
    const publicKey = Buffer.from(cryptoApi.publicEncryptionKey).toString('hex');
    const publicSignKey = Buffer.from(cryptoApi.publicSignKey).toString('base64');

    const grantRootAccess = async (rootIdHash: SHA256IdHash<any>, personId: SHA256IdHash<Person>) => {
      await createAccess([{
        id: rootIdHash,
        person: [personId],
        hashGroup: [],
        mode: SET_ACCESS_MODE.ADD,
      }]);
    };
    const phoneBookRootInput = {ownerPersonId, ownerInstanceId};
    await Promise.all([
      makeLegacyUvcPhoneBookTrieRootId(phoneBookRootInput),
      makeEarlierUvcPhoneBookTrieRootId(phoneBookRootInput),
      makePreviousUvcPhoneBookTrieRootId(phoneBookRootInput),
    ].map(async id => {
      const retiredPhoneBookRootIdHash = await calculateIdHashOfObj({
        $type$: 'UvcStateTrieRoot',
        id,
      });
      await createAccess([{
        id: retiredPhoneBookRootIdHash,
        person: [],
        hashGroup: [],
        mode: SET_ACCESS_MODE.REPLACE,
      }]);
    }));
    await Promise.all([...this.pairedPeople].map(async personId => {
      const controlRootInput = {ownerPersonId, ownerInstanceId, audiencePersonId: personId};
      await Promise.all([
        makeLegacyUvcControlTrieRootId(controlRootInput),
        makeEarlierUvcControlTrieRootId(controlRootInput),
        makePreviousUvcControlTrieRootId(controlRootInput),
      ].map(async id => {
        const retiredControlRootIdHash = await calculateIdHashOfObj({
          $type$: 'UvcStateTrieRoot',
          id,
        });
        await createAccess([{
          id: retiredControlRootIdHash,
          person: [],
          hashGroup: [],
          mode: SET_ACCESS_MODE.REPLACE,
        }]);
      }));
    }));
    this.phoneBook = new UvcStateTrie({
      rootId: makeUvcPhoneBookTrieRootId({ownerPersonId, ownerInstanceId}),
      storage,
      grantRootAccess,
    });
    this.journal = new UvcStateTrie({
      rootId: makeUvcJournalTrieRootId({ownerPersonId, ownerInstanceId}),
      storage,
      grantRootAccess,
    });
    this.provisioning = new UvcStateTrie({
      rootId: makeUvcProvisioningTrieRootId({ownerPersonId, ownerInstanceId}),
      storage,
      grantRootAccess,
    });
    await Promise.all([this.phoneBook.init(), this.journal.init(), this.provisioning.init()]);
    this.facility = new UvcFacilityPlan({
      ownerPersonId,
      ownerInstanceId,
      journal: this.journal,
      storage: {
        storeResource: async resource => (
          await storeUnversionedObject(resource as never)
        ).hash as SHA256Hash<UvcRoomResource>,
        storeVersioned: async object => await storeVersionedObject(object as never) as never,
        load: async hash => await getObject(hash as never) as UvcStateEntry | UvcRoomResource,
        loadVersioned: async idHash => await getObjectByIdHash(idHash as never) as unknown as UvcRoom | UvcDisinfectionRun,
        calculateIdHash: async object => await calculateIdHashOfObj(object as never) as SHA256IdHash,
      },
    });
    await this.migrateLegacyProvisioningEvidence(ownerPersonId, ownerInstanceId);
    await this.restoreProvisionedDeviceBindings();
    const restoredObservations = await this.phoneBook.list(['phone-book']);
    console.log(`[UvcCube] Restored ${restoredObservations.length} phone-book observations`);

    this.controlPlan = new UvcControlPlan({
      ownerPersonId,
      ownerInstanceId,
      localDeviceId: ownerInstanceId,
      phoneBook: this.phoneBook,
      journal: this.journal,
      controlFor: personId => this.getControlTrie(personId, grantRootAccess),
      store: async entry => (await storeUnversionedObject(entry as never)).hash as never,
      load: async hash => await getObject(hash as never) as UvcStateEntry,
      // Headless peers establish trust through the signed provisioning
      // ceremony, while app peers establish it through ONE pairing. Keep the
      // control boundary aligned with the runtime's canonical trust decision.
      isPaired: personId => this.isPaired(personId),
      onCommandPublished: async (_commandHash, command) => {
        await this.ensureControlPeerConnection(command.executorPersonId);
      },
      authority: {
        read: async deviceId => this.executeAuthorityRequest(deviceId, 'read'),
        set: async (deviceId, desired) => this.executeAuthorityRequest(deviceId, 'set', desired),
      },
    });
    await this.controlPlan.init();
    this.provisioningController = new UvcProvisioningController({
      administrator: {
        personId: ownerPersonId,
        instanceId: ownerInstanceId,
        publicSignKey,
        signAlgorithm: 'ed25519',
      },
      sign: payload => Buffer.from(cryptoApi.sign(payload)).toString('base64'),
      verify: (payload, signature, peerPublicSignKey, algorithm) => {
        if (algorithm === 'ecdsa-p256-sha256') {
          return verifyNodeSignature(
            'sha256',
            payload,
            createPublicKey(peerPublicSignKey),
            Buffer.from(signature, 'base64'),
          );
        }
        if (algorithm !== 'ed25519') throw new Error(`[UvcCube] unsupported provisioning signature algorithm ${algorithm}`);
        return signatureVerify(
          payload,
          Buffer.from(signature, 'base64'),
          ensurePublicSignKey(Buffer.from(peerPublicSignKey, 'base64')),
        );
      },
      deriveAssignedIdentityIds: async ({email, instanceName: assignedInstanceName}) => {
        const personId = await calculateIdHashOfObj<Pick<Person, '$type$' | 'email'>>({$type$: 'Person', email});
        const instanceId = await calculateIdHashOfObj<Pick<Instance, '$type$' | 'name' | 'owner'>>({
          $type$: 'Instance',
          name: assignedInstanceName,
          owner: personId,
        });
        return {personId, instanceId};
      },
      persistence: {
        evidence: this.provisioning,
        journal: this.journal,
        store: async entry => (await storeUnversionedObject(entry as never)).hash as never,
        load: async hash => await getObject(hash as never) as UvcStateEntry,
      },
      randomChallenge: () => randomUUID(),
    });
    await this.initializeQuicVC(publicKey, publicSignKey);
    this.connectionsModel.pairing.onPairingSuccess.listen(async (
      _outgoing,
      _localPerson,
      _localInstance,
      remotePerson,
    ) => {
      this.pairedPeople.add(remotePerson);
      await this.controlPlan!.sharePhoneBookWith(remotePerson);
      await this.controlPlan!.shareControlWith(remotePerson);
    });
    this.disconnectImportListener = onChumImportBatch.addListener(event => {
      if (
        event.localPersonId !== ownerPersonId
        || !this.isPaired(event.remotePersonId)
      ) {
        return;
      }
      const source = event.remotePersonId;
      const tail = (this.consumeTails.get(source) ?? Promise.resolve())
        .then(() => this.consumeImportedBatch(event.batch.imported, event.remotePersonId))
        .catch(error => {
          console.error('[UvcCube] Failed to project imported UVC trie root:', error);
        });
      this.consumeTails.set(source, tail);
      void tail.then(() => {
        if (this.consumeTails.get(source) === tail) {
          this.consumeTails.delete(source);
        }
      });
    });
    for (const remotePerson of this.pairedPeople) {
      await this.controlPlan.sharePhoneBookWith(remotePerson);
      await this.controlPlan.shareControlWith(remotePerson);
    }
    this.identity = {personId: ownerPersonId, instanceId: ownerInstanceId, publicKey, publicSignKey, displayName};
    console.log(`[UvcCube] ONE Person ${ownerPersonId} Instance ${ownerInstanceId}`);
    return this.identity;
  }

  getIdentity(): CubeOneIdentity {
    if (!this.identity) {
      throw new Error('[UvcCube] ONE runtime is not initialized');
    }
    return this.identity;
  }

  isPaired(personId: string): boolean {
    return this.pairedPeople.has(personId as SHA256IdHash<Person>)
      || this.provisionedDeviceEvidenceByPerson.has(personId);
  }

  canonicalizeDiscoveredDevice(device: DiscoveryDeviceSnapshot): DiscoveryDeviceSnapshot {
    const evidence = device.ownerId
      ? this.provisionedDeviceEvidenceByPerson.get(device.ownerId)
      : undefined;
    if (!evidence || evidence.publicKey !== device.publicKey) {
      return device;
    }
    return {
      ...device,
      id: evidence.hardwareDeviceId,
      name: evidence.hardwareDeviceId,
      trustState: 'paired',
    };
  }

  async recordDiscovery(device: DiscoveryDeviceSnapshot): Promise<void> {
    if (!this.controlPlan || !this.ownerPersonId || !this.ownerInstanceId) {
      throw new Error('[UvcCube] ONE runtime is not initialized');
    }
    if (!device.address || !device.port) {
      throw new Error(`[UvcCube] discovered device ${device.id} has no endpoint`);
    }
    if (device.ownerId && device.publicKey) {
      // The endpoint is mutable discovery state. Trust is the durable binding
      // between the advertised Person and an instance encryption key registered
      // during pairing/provisioning (the same anchor used for Person-key
      // rotation). This deliberately does not depend on the IP address or on a
      // historical provisioning-trie projection.
      const registered = await isRegisteredInstanceKeyForPerson(
        this.leuteModel!,
        device.ownerId as SHA256IdHash<Person>,
        device.publicKey as never,
      );
      if (registered) {
        this.pairedPeople.add(device.ownerId as SHA256IdHash<Person>);
      }
    }
    this.discoveredDevices.set(device.id, device);
    const observedAt = Date.parse(device.lastSeenAt ?? '') || Date.now();
    await this.controlPlan.recordDiscovery({
      deviceId: device.id,
      deviceKind: normalizeKind(device.type),
      address: device.address,
      port: device.port,
      publicKey: device.publicKey ?? '',
      // mDNS ownerId is an unauthenticated claim. Do not persist it as a ONE
      // referenceToId: the corresponding Person object is not guaranteed to
      // exist locally, and doing so creates a broken CHUM object graph.
      capabilities: new Set(device.capabilities ?? []),
      observedAt,
      expiresAt: observedAt + 60_000,
    });
    console.log(`[UvcCube] Phone book recorded ${device.id} observed at ${observedAt}`);
  }

  async phoneBookEntries(): Promise<UvcDiscoveryObservation[]> {
    if (!this.phoneBook) {
      throw new Error('[UvcCube] ONE runtime is not initialized');
    }
    const hashes = await this.phoneBook.list(['phone-book']);
    const entries = await Promise.all(hashes.map(hash => getObject(hash as never)));
    return entries.filter((entry: unknown): entry is UvcDiscoveryObservation => (
      (entry as {$type$?: string}).$type$ === 'UvcDiscoveryObservation'
    ));
  }

  lastImportedDiscoveryAt(personId: string): number | undefined {
    return this.importedDiscoveryAt.get(personId);
  }

  async createInvitation(): Promise<Invitation> {
    if (!this.connectionsModel) {
      throw new Error('[UvcCube] connections are not initialized');
    }
    return await this.connectionsModel.pairing.createInvitation(this.ownerPersonId);
  }

  async connectUsingInvitation(invitation: Invitation): Promise<void> {
    if (!this.connectionsModel) {
      throw new Error('[UvcCube] connections are not initialized');
    }
    await this.connectionsModel.pairing.connectUsingInvitation(invitation, this.ownerPersonId);
  }

  async readLight(input: {
    deviceId: string;
    kind: 'groov' | 'esp32';
    executorPersonId?: SHA256IdHash<Person>;
  }): Promise<UvcControlObservation> {
    if (!this.controlPlan || !this.ownerPersonId) {
      throw new Error('[UvcCube] control plan is not initialized');
    }
    return await this.controlPlan.execute({
      ...input,
      executorPersonId: input.executorPersonId ?? this.ownerPersonId,
    }, 'read');
  }

  async setLight(input: {
    deviceId: string;
    kind: 'groov' | 'esp32';
    executorPersonId?: SHA256IdHash<Person>;
    enabled: boolean;
    intensity?: number;
  }): Promise<UvcControlObservation> {
    if (!this.controlPlan || !this.ownerPersonId) {
      throw new Error('[UvcCube] control plan is not initialized');
    }
    return await this.controlPlan.execute({
      deviceId: input.deviceId,
      kind: input.kind,
      executorPersonId: input.executorPersonId ?? this.ownerPersonId,
    }, 'set', {
      enabled: input.enabled,
      ...(input.intensity !== undefined ? {intensity: input.intensity} : {}),
    });
  }

  async journalEntries(deviceId?: string): Promise<UvcStateEntry[]> {
    if (!this.journal) {
      throw new Error('[UvcCube] journal is not initialized');
    }
    const hashes = await this.journal.list(deviceId ? ['journal', 'device', deviceId] : ['journal']);
    return await Promise.all(hashes.map(hash => getObject(hash as never) as Promise<UvcStateEntry>));
  }

  async disinfectionRecords(): Promise<CubeUvcCycleRecord[]> {
    if (!this.facility) {
      throw new Error('[UvcCube] facility plan is not initialized');
    }
    const latest = new Map<string, UvcDisinfectionRun>();
    for (const run of [
      ...await this.facility.listDisinfectionRuns(),
      ...this.importedDisinfectionRuns.values(),
    ]) {
      const key = `${run.ownerPersonId}:${run.runId}`;
      const previous = latest.get(key);
      if (!previous || run.updatedAt > previous.updatedAt) latest.set(key, run);
    }
    return await Promise.all([...latest.values()].map(async run => ({
      id: run.runId,
      timestamp: run.startedAt ?? run.scheduledAt ?? run.createdAt,
      ...(run.startedAt !== undefined && run.endedAt !== undefined
        ? {durationMinutes: Math.max(1, Math.round((run.endedAt - run.startedAt) / 60_000))}
        : {}),
      evidenceCount: (run.startObservations?.size ?? 0) + (run.stopObservations?.size ?? 0),
      location: run.roomName,
      resources: await Promise.all([...run.resources].map(async hash => {
        const resource = await getObject(hash as never) as UvcRoomResource;
        if (resource.$type$ !== 'UvcRoomResource') {
          throw new Error(`[UvcCube] run ${run.runId} has invalid resource ${String(hash)}`);
        }
        return resource.label;
      })),
      status: run.status,
    }))).then(records => records.sort((left, right) => right.timestamp - left.timestamp));
  }

  /**
   * Project correlated command/observation evidence from the journal DAG.
   * The integration runner uses this instead of scanning ambient storage.
   */
  async controlEvidence(input: {
    deviceId: string;
    issuerPersonId: SHA256IdHash<Person>;
    since: number;
  }): Promise<CubeControlEvidence[]> {
    const events = await this.journalEntries(input.deviceId);
    const evidence: CubeControlEvidence[] = [];
    for (const entry of events) {
      if (
        entry.$type$ !== 'UvcJournalEvent'
        || entry.deviceId !== input.deviceId
        || entry.eventType !== 'device-observed'
        || entry.recordedAt < input.since
        || !entry.command
        || !entry.observation
      ) {
        continue;
      }
      const [command, observation] = await Promise.all([
        getObject(entry.command as never) as Promise<UvcStateEntry>,
        getObject(entry.observation as never) as Promise<UvcStateEntry>,
      ]);
      if (
        command.$type$ !== 'UvcControlCommand'
        || observation.$type$ !== 'UvcControlObservation'
        || command.issuerPersonId !== input.issuerPersonId
        || observation.command !== entry.command
      ) {
        continue;
      }
      evidence.push({
        commandHash: entry.command,
        command,
        observationHash: entry.observation,
        observation,
        recordedAt: entry.recordedAt,
      });
    }
    return evidence.sort((left, right) => left.command.issuedAt - right.command.issuedAt);
  }

  async createHeadlessIdentityAssignment(input: {
    hardwareDeviceId: string;
    deviceKind: 'groov' | 'esp32';
    assignedEmail: string;
    assignedInstanceName: string;
  }): Promise<UvcIdentityAssignmentResult> {
    if (!this.provisioningController) {
      throw new Error('[UvcCube] provisioning controller is not initialized');
    }
    return await this.provisioningController.createAssignment(input);
  }

  async provisionHeadlessDevice(input: {
    deviceId: string;
    assignedInstanceName: string;
  }): Promise<UvcAdminRoleGrantResult> {
    if (!this.provisioningClient || !this.quicManager) {
      throw new Error('[UvcCube] authenticated device setup is not initialized');
    }
    const device = this.discoveredDevices.get(input.deviceId);
    if (!device) {
      throw new Error(`[UvcCube] cannot set up undiscovered device ${input.deviceId}`);
    }
    const deviceKind = normalizeHeadlessKind(device.type);
    if (!deviceKind) {
      throw new Error(`[UvcCube] ${device.name ?? device.id} is not a headless Groov or ESP32 device`);
    }
    if (!device.online || !device.address || !device.port || !device.publicKey) {
      throw new Error(`[UvcCube] ${device.name ?? device.id} is not reachable for setup`);
    }
    const assignedInstanceName = requiredText(input.assignedInstanceName, 'device name');
    await this.connectProvisioningPeer(device);
    const result = await this.provisioningClient.provision({
      deviceId: device.id,
      hardwareDeviceId: device.id,
      deviceKind,
      assignedEmail: assignedDeviceEmail(deviceKind, device.id),
      assignedInstanceName,
    });
    const certificate = await getObject(result.grant.certificate as never) as UvcDeviceIdentityCertificate;
    if (
      certificate.$type$ !== 'UvcDeviceIdentityCertificate'
      || certificate.devicePersonId !== result.grant.devicePersonId
      || certificate.hardwareDeviceId !== device.id
    ) {
      throw new Error('[UvcCube] accepted administrator grant does not resolve to the claimed hardware device');
    }
    this.rememberProvisionedDeviceEvidence(certificate);
    return result;
  }

  private rememberProvisionedDeviceEvidence(certificate: UvcDeviceIdentityCertificate): void {
    const current = this.provisionedDeviceEvidenceByPerson.get(certificate.devicePersonId);
    if (current && current.certifiedAt >= certificate.certifiedAt) {
      return;
    }
    this.provisionedDeviceEvidenceByPerson.set(certificate.devicePersonId, {
      hardwareDeviceId: certificate.hardwareDeviceId,
      publicKey: certificate.devicePublicKey,
      certifiedAt: certificate.certifiedAt,
    });
  }

  private async migrateLegacyProvisioningEvidence(
    ownerPersonId: SHA256IdHash<Person>,
    ownerInstanceId: SHA256IdHash<Instance>,
  ): Promise<void> {
    if (!this.provisioning) {
      throw new Error('[UvcCube] provisioning trie is not initialized');
    }

    const retired = await Promise.all([
      makeLegacyUvcProvisioningTrieRootId({ownerPersonId, ownerInstanceId}),
      makePreviousUvcProvisioningTrieRootId({ownerPersonId, ownerInstanceId}),
    ].map(async rootId => {
      const trie = new UvcStateTrie({rootId, storage});
      await trie.init();
      return trie;
    }));

    // Provisioning evidence is local, signed trust state. Consolidate its
    // canonical entryHashes into the producer-owned v4 trie once, at this
    // explicit migration write boundary.
    const currentHashes = new Set(
      (await this.provisioning.list(['provisioning'])).map(String),
    );
    let migrated = 0;
    for (const trie of retired) {
      for (const hash of await trie.list(['provisioning'])) {
        if (currentHashes.has(String(hash))) continue;
        const entry = await getObject(hash as never) as UvcStateEntry;
        if (!isProvisioningEvidence(entry)) {
          throw new Error(`[UvcCube] legacy provisioning trie contains ${entry.$type$}`);
        }
        await this.provisioning.append(hash, entry);
        currentHashes.add(String(hash));
        migrated += 1;
      }
    }
    if (migrated > 0) {
      console.log(`[UvcCube] Migrated ${migrated} signed provisioning entries into the v4 trie`);
    }
  }

  private async restoreProvisionedDeviceBindings(): Promise<void> {
    if (!this.provisioning || !this.ownerPersonId) {
      return;
    }
    const certificates = new Map<string, UvcDeviceIdentityCertificate>();
    const grants: UvcAdminRoleGrant[] = [];
    for (const hash of await this.provisioning.list(['provisioning'])) {
      const entry = await getObject(hash as never) as UvcStateEntry;
      if (entry.$type$ === 'UvcDeviceIdentityCertificate') {
        certificates.set(String(hash), entry);
      } else if (entry.$type$ === 'UvcAdminRoleGrant') {
        grants.push(entry);
      }
    }
    for (const grant of grants) {
      const certificate = certificates.get(String(grant.certificate));
      if (
        certificate
        && grant.administratorPersonId === this.ownerPersonId
        && certificate.administratorPersonId === this.ownerPersonId
        && certificate.devicePersonId === grant.devicePersonId
      ) {
        this.rememberProvisionedDeviceEvidence(certificate);
      }
    }
  }

  async shutdown(): Promise<void> {
    this.disconnectImportListener?.();
    this.disconnectImportListener = undefined;
    this.controlPlan?.shutdown();
    this.controlPlan = undefined;
    this.consumeTails.clear();
    this.provisioningClient?.stop();
    this.provisioningClient = undefined;
    this.authorityClient?.stop();
    this.authorityClient = undefined;
    this.quicManager?.clearTransport();
    this.quicManager = undefined;
    this.quicTransport?.close();
    this.quicTransport = undefined;
  }

  async certifyHeadlessIdentity(
    input: UvcIdentityAssignmentResult & UvcDeviceIdentityProofResult,
  ): Promise<UvcDeviceIdentityCertificateResult> {
    if (!this.provisioningController) {
      throw new Error('[UvcCube] provisioning controller is not initialized');
    }
    return await this.provisioningController.certify(input);
  }

  async acceptHeadlessAdminGrant(
    input: UvcDeviceIdentityCertificateResult & UvcAdminRoleGrantResult,
  ): Promise<void> {
    if (!this.provisioningController) {
      throw new Error('[UvcCube] provisioning controller is not initialized');
    }
    await this.provisioningController.acceptAdminGrant(input);
  }

  private async consumeImportedEntry(hash: string, source: SHA256IdHash<Person>): Promise<void> {
    if (this.consumed.has(hash)) {
      return;
    }
    if (!this.controlPlan) {
      throw new Error('[UvcCube] control plan is not initialized');
    }
    const entry = await getObject(hash as never) as UvcStateEntry;
    await this.controlPlan.consume(hash as SHA256Hash<UvcStateEntry>, entry, source);
    this.consumed.add(hash);
    if (entry.$type$ === 'UvcDiscoveryObservation') {
      // Arrival time is Cube-owned lifecycle evidence. The observation's
      // observedAt belongs to the source event and may legitimately predate a
      // test that starts after Metro has initialized and CHUM has imported it.
      this.importedDiscoveryAt.set(source, Date.now());
    }
    if (entry.$type$ === 'UvcDisinfectionRun') {
      const key = `${entry.ownerPersonId}:${entry.runId}`;
      const previous = this.importedDisinfectionRuns.get(key);
      if (!previous || entry.updatedAt > previous.updatedAt) {
        this.importedDisinfectionRuns.set(key, entry);
      }
    }
    console.log(`[UvcCube] Consumed imported ${entry.$type$} ${hash}`);
    if (process.env.UVC_CHUM_DEBUG === '1' && entry.$type$ === 'UvcControlCommand') {
      const diagnostics = getChumSyncDiagnostics({traceLimit: 80});
      console.error('[UvcCube][chum-sync][control-response]', JSON.stringify({
        activeExporters: diagnostics.activeExporters,
        pendingVersionWakeups: diagnostics.pendingVersionWakeups,
        traceEvents: diagnostics.traceEvents,
      }));
    }
  }

  private async consumeImportedBatch(
    imported: readonly {kind: string; hash: string; type: string}[],
    source: SHA256IdHash<Person>,
  ): Promise<void> {
    if (!this.ownerPersonId) {
      throw new Error('[UvcCube] cannot project imported state before ONE identity');
    }
    for (const ref of imported) {
      if (ref.kind !== 'object' || ref.type !== 'UvcStateTrieRoot') continue;
      const root = await getObject(ref.hash as never) as UvcStateTrieRoot;
      const entryHashes = await projectUvcStateTrieEntryHashes({
        root,
        remotePersonId: source,
        localPersonId: this.ownerPersonId,
        loadObject: async hash => await getObject(hash as never) as never,
      });
      for (const hash of entryHashes) {
        await this.consumeImportedEntry(String(hash), source);
      }
    }
  }

  private async initializeQuicVC(publicKey: string, publicSignKey: string): Promise<void> {
    if (!this.ownerPersonId || !this.ownerInstanceId || !this.provisioningController) {
      throw new Error('[UvcCube] cannot initialize QUICVC before ONE identity');
    }
    const port = Number(process.env.UVC_QUICVC_PORT ?? 49497);
    if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
      throw new Error(`[UvcCube] invalid UVC_QUICVC_PORT ${process.env.UVC_QUICVC_PORT ?? ''}`);
    }
    const transport = await createNodeQuicVCTransport(port);
    const manager = QuicVCConnectionManager.getInstance(this.ownerPersonId);
    await manager.initialize(transport.transport, {
      id: this.ownerInstanceId,
      credentialSubject: {
        id: this.ownerInstanceId,
        publicKeyHex: publicKey,
        personId: this.ownerPersonId,
        publicSignKey,
        signAlgorithm: 'ed25519',
      },
    });
    manager.setTrustVerifier({
      getTrustForPublicKey: async (peerPublicKey, credential) => (
        this.resolveProvisioningPeer(peerPublicKey, credential)
      ),
    });
    this.quicTransport = transport;
    this.quicManager = manager;
    this.authorityClient = new GroovAuthorityClient(manager, {defaultTimeoutMs: 10_000});
    this.authorityClient.start();
    this.provisioningClient = new QuicVCHeadlessProvisioningClient(
      manager,
      this.provisioningController,
    );
    console.log(`[UvcCube] QUICVC provisioning transport bound to UDP ${port}`);
  }

  private async executeAuthorityRequest(
    targetDeviceId: string,
    operation: 'read' | 'set',
    desired?: {enabled: boolean; intensity?: number},
  ): Promise<{enabled: boolean; intensity?: number}> {
    if (!this.controlPlan || !this.quicManager) {
      throw new Error('[UvcCube] hardware authority transport is not initialized');
    }
    const device = this.discoveredDevices.get(targetDeviceId)
      ?? [...this.discoveredDevices.values()].find(candidate => (
        candidate.id === targetDeviceId || candidate.instanceId === targetDeviceId
      ));
    if (!device) {
      throw new Error(`[UvcCube] control target ${targetDeviceId} is not in the discovered device set`);
    }
    if (!device.address || !device.port || !device.publicKey) {
      throw new Error(`[UvcCube] control target ${targetDeviceId} has no authenticated route`);
    }

    if (normalizeHeadlessKind(device.type) === 'esp32') {
      if (!device.ownerId) {
        throw new Error(`[UvcCube] ESP32 target ${targetDeviceId} has no provisioned Person identity`);
      }
      if (device.ownerId === this.ownerPersonId) {
        throw new Error(`[UvcCube] ESP32 target ${targetDeviceId} cannot delegate back to Cube`);
      }
      // Cube is the executor selected by the Expo command, but the ESP32 owns
      // the hardware observation. Delegate to that provisioned Person through
      // the same typed control trie/CHUM lane, then publish Cube's correlated
      // result back to Expo. Groov has its own authority protocol below.
      const observation = await this.controlPlan.execute({
        deviceId: device.id,
        kind: 'esp32',
        executorPersonId: device.ownerId as SHA256IdHash<Person>,
      }, operation, desired);
      if (observation.status !== 'observed' || typeof observation.enabled !== 'boolean') {
        throw new Error(observation.error ?? `[UvcCube] ESP32 ${targetDeviceId} returned no observed state`);
      }
      return {
        enabled: observation.enabled,
        ...(observation.intensity !== undefined ? {intensity: observation.intensity} : {}),
      };
    }

    if (!this.authorityClient) {
      throw new Error('[UvcCube] Groov authority transport is not initialized');
    }
    const route = await this.connectProvisioningPeer(device);
    const state: GroovAuthorityState = operation === 'read'
      ? await this.authorityClient.readState(route.deviceId, {
          ...(route.connectionId ? {connectionId: route.connectionId} : {}),
        })
      : await this.authorityClient.setLight(route.deviceId, desired!, {
          ...(route.connectionId ? {connectionId: route.connectionId} : {}),
        });
    return {
      enabled: state.light.enabled,
      ...(Number.isFinite(state.light.intensity) ? {intensity: state.light.intensity} : {}),
    };
  }

  private async resolveProvisioningPeer(
    publicKey: string,
    credential?: DeviceIdentityCredential,
  ): Promise<QuicVCPeerTrustInfo | null> {
    const device = [...this.discoveredDevices.values()].find(candidate => candidate.publicKey === publicKey);
    if (!device) {
      return null;
    }
    if (device.ownerId) {
      const evidence = this.provisionedDeviceEvidenceByPerson.get(device.ownerId);
      const evidenceMatches = Boolean(
        evidence
        && evidence.hardwareDeviceId === device.id
        && evidence.publicKey === publicKey,
      );
      const registered = evidenceMatches || await isRegisteredInstanceKeyForPerson(
        this.leuteModel!,
        device.ownerId as SHA256IdHash<Person>,
        publicKey as never,
      );
      if (!registered) {
        return null;
      }
      return {
        personId: device.ownerId as SHA256IdHash<Person>,
        publicKey,
        trustLevel: 'trusted',
      };
    }
    // Enrollment pins the route to the exact bootstrap encryption key from
    // mDNS. The temporary bootstrap Person comes from the credential and is
    // discarded after the signed ceremony creates the final device identity.
    const bootstrapPersonId = credential?.credentialSubject.personId;
    if (!bootstrapPersonId || credential?.credentialSubject.publicKeyHex !== publicKey) {
      return null;
    }
    return {
      personId: bootstrapPersonId,
      publicKey,
      trustLevel: 'low',
    };
  }

  private async connectProvisioningPeer(device: DiscoveryDeviceSnapshot): Promise<{
    deviceId: string;
    connectionId?: string;
  }> {
    const manager = this.quicManager!;
    // Once QUICVC authenticates a peer it replaces the discovery/hardware id
    // with the credential's Instance id. Always address the established pipe
    // by that authenticated id; the hardware id is only valid during bootstrap.
    for (const candidateId of [device.instanceId, device.id]) {
      if (candidateId && manager.isConnected(candidateId)) {
        return {deviceId: candidateId};
      }
    }
    const ownCredential = manager.ownCredential;
    if (!ownCredential) {
      throw new Error('[UvcCube] local QUICVC credential is unavailable');
    }
    let unsubscribe = () => {};
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const established = new Promise<{deviceId: string; connectionId?: string}>((resolve, reject) => {
      unsubscribe = manager.onConnectionEstablished.listen((event: ConnectionEstablishedEvent) => {
        const identityMatches = device.ownerId
          ? event.peerPersonId === device.ownerId && event.peerPublicKey === device.publicKey
          : event.deviceId === device.id;
        if (
          !identityMatches
          || event.address !== device.address
          || event.port !== device.port
        ) {
          return;
        }
        if (timeout) clearTimeout(timeout);
        unsubscribe();
        resolve({deviceId: event.deviceId, connectionId: event.connectionId});
      });
      timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timed out authenticating ${device.name ?? device.id}`));
      }, 12_000);
    });
    try {
      await manager.initiateHandshake(device.id, device.address!, device.port!, ownCredential);
      for (const candidateId of [device.instanceId, device.id]) {
        if (candidateId && manager.isConnected(candidateId)) {
          if (timeout) clearTimeout(timeout);
          unsubscribe();
          return {deviceId: candidateId};
        }
      }
      return await established;
    } catch (error) {
      if (timeout) clearTimeout(timeout);
      unsubscribe();
      throw error;
    }
  }

  private async ensureControlPeerConnection(personId: SHA256IdHash<Person>): Promise<void> {
    if (!this.connectionsModel || !this.quicManager || !this.ownerPersonId || !this.ownerInstanceId || !this.identity) {
      throw new Error('[UvcCube] control transport is not initialized');
    }
    if (this.connectionsModel.hasActiveOrTrackedChumPeer(this.ownerPersonId, personId)) {
      return;
    }
    const pending = this.controlPeerConnections.get(personId);
    if (pending) {
      return await pending;
    }

    const establish = this.establishControlPeerConnection(personId).finally(() => {
      this.controlPeerConnections.delete(personId);
    });
    this.controlPeerConnections.set(personId, establish);
    return await establish;
  }

  private async establishControlPeerConnection(personId: SHA256IdHash<Person>): Promise<void> {
    const device = [...this.discoveredDevices.values()].find(candidate => candidate.ownerId === personId);
    if (!device?.address || !device.port || !device.publicKey || !device.instanceId) {
      throw new Error(`[UvcCube] no identity-bound route is available for control executor ${personId}`);
    }
    if (!/^[0-9a-f]{64}$/iu.test(device.instanceId)) {
      throw new Error(`[UvcCube] control executor ${device.id} has no valid ONE Instance id`);
    }

    const route = await this.connectProvisioningPeer(device);
    if (this.connectionsModel!.hasActiveOrTrackedChumPeer(this.ownerPersonId!, personId)) {
      return;
    }

    const connection = createConnectionFromQuicVC(
      route.deviceId,
      this.quicManager!,
      route.connectionId,
    );
    const preflight = (async () => {
      await exchangeConnectionGroupName(connection, 'chum');
      await sync(connection, true);
      const personInfo = await verifyAndExchangePersonId(
        this.leuteModel!,
        connection,
        this.ownerPersonId!,
        true,
        personId,
        // QUICVC already authenticated the exact person, Instance id,
        // encryption key, and signing key from durable UVC provisioning. The
        // legacy Person Keys cache may rotate independently across device
        // restarts; still run its possession challenge, but do not let that
        // cache override the stronger provisioned device identity.
        true,
      );
      const instanceInfo = await exchangeInstanceIdObjects(connection, this.ownerInstanceId!);
      return {personInfo, instanceInfo};
    })();
    const preflightTimeout = new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(
        `[UvcCube] timed out authenticating direct control sync with ${device.id}`,
      )), 12_000);
    });
    const {personInfo, instanceInfo} = await Promise.race([preflight, preflightTimeout]);
    if (personInfo.personId !== personId || instanceInfo.remoteInstanceId !== device.instanceId) {
      connection.close(`Direct control identity does not match ${device.id}`);
      throw new Error(`[UvcCube] direct control identity does not match the certified route for ${device.id}`);
    }
    // VGER retires any competing relay lane before both peers cross this
    // barrier. Starting CHUM data before acknowledging it makes the responder
    // parse the first CHUM frame as a connection-establishment command.
    await exchangeDirectChumReady(connection);

    // A relay CHUM may already be active by the time discovery selects the
    // certified QUICVC route. Retire it at the authenticated direct-handover
    // barrier so ConnectionsModel does not reject the dedicated control lane
    // as a duplicate peer.
    await this.connectionsModel!.disableTransientRelayRouteByPublicKey(
      device.publicKey as HexString,
      this.ownerPersonId!,
      'chum',
    );
    this.connectionsModel!.closeRoutedConnectionsByPublicKeys(
      this.identity!.publicKey as HexString,
      device.publicKey as HexString,
      'chum',
    );

    let sessionError: unknown;
    void this.connectionsModel!.startExternalChumConnection(
      connection,
      this.ownerPersonId!,
      this.ownerInstanceId!,
      personInfo.personId,
      instanceInfo.remoteInstanceId,
      true,
      'chum',
      this.identity!.publicKey as HexString,
      device.publicKey as HexString,
      'uvc-control-quicvc',
      {
        objectFilter: isCubeChumExportObject,
        importFilter: async (_hash, type) => isUvcChumSyncType(type),
        chumSyncOptions: {
          priorityWakeupObjectTypes: ['UvcStateTrieRoot'],
          connectedAfterProtocolReady: true,
          connectedAfterPriorityObjectTypes: ['UvcStateTrieRoot'],
          traceObjectTypes: ['UvcStateTrieRoot'],
          importBatchContextObjectTypes: ['UvcStateTrieRoot'],
        },
      },
    ).catch(error => {
      sessionError = error;
    });

    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (sessionError) {
        throw sessionError;
      }
      const ready = this.connectionsModel!.connectionsInfo().some(info => (
        info.remotePersonId === personId
        && info.protocolName === 'chum'
        && info.isConnected
      ));
      if (ready) {
        console.log(`[UvcCube] Direct QUICVC CHUM control lane ready for ${device.id}`);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    connection.close(`Timed out starting UVC control CHUM for ${device.id}`);
    throw new Error(`[UvcCube] timed out starting direct control sync with ${device.id}`);
  }

  private async getControlTrie(
    personId: SHA256IdHash<Person>,
    grantRootAccess: (rootIdHash: SHA256IdHash<any>, personId: SHA256IdHash<Person>) => Promise<void>,
  ): Promise<UvcStateTrie> {
    const existing = this.controlTries.get(personId);
    if (existing) {
      return existing;
    }
    const ownerPersonId = this.ownerPersonId!;
    const ownerInstanceId = this.ownerInstanceId!;
    const trie = new UvcStateTrie({
      rootId: makeUvcControlTrieRootId({ownerPersonId, ownerInstanceId, audiencePersonId: personId}),
      storage,
      grantRootAccess,
    });
    await trie.init();
    this.controlTries.set(personId, trie);
    return trie;
  }
}

function normalizeKind(value?: string): UvcDiscoveryObservation['deviceKind'] {
  const kind = value?.trim().toLowerCase();
  return kind === 'cube' || kind === 'expo' || kind === 'browser'
    || kind === 'groov' || kind === 'esp32'
    ? kind
    : 'one-peer';
}

function normalizeHeadlessKind(value?: string): 'groov' | 'esp32' | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'groov' || normalized === 'esp32' ? normalized : undefined;
}

function isProvisioningEvidence(entry: UvcStateEntry): entry is
  | UvcIdentityAssignmentResult['assignment']
  | UvcDeviceIdentityProofResult['proof']
  | UvcDeviceIdentityCertificate
  | UvcAdminRoleGrant {
  return entry.$type$ === 'UvcIdentityAssignment'
    || entry.$type$ === 'UvcDeviceIdentityProof'
    || entry.$type$ === 'UvcDeviceIdentityCertificate'
    || entry.$type$ === 'UvcAdminRoleGrant';
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`[UvcCube] ${label} is required`);
  }
  return normalized;
}

function assignedDeviceEmail(kind: 'groov' | 'esp32', hardwareDeviceId: string): string {
  const localPart = `${kind}-${hardwareDeviceId}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);
  return `${localPart}@devices.uvc.local`;
}

export const cubeOneRuntime = new CubeOneRuntime();
