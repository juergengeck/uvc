import '@refinio/one.core/lib/system/load-nodejs.js';

import {createAccess} from '@refinio/one.core/lib/access.js';
import {getInstanceIdHash, getInstanceOwnerIdHash} from '@refinio/one.core/lib/instance.js';
import {createCryptoApiFromDefaultKeys} from '@refinio/one.core/lib/keychain/keychain.js';
import {ensurePublicSignKey, signatureVerify} from '@refinio/one.core/lib/crypto/sign.js';
import type {Instance, Person} from '@refinio/one.core/lib/recipes.js';
import {SET_ACCESS_MODE} from '@refinio/one.core/lib/storage-base-common.js';
import {getObject, storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects.js';
import {
  getCurrentVersionHash,
  getObjectByIdHash,
  storeVersionedObject,
} from '@refinio/one.core/lib/storage-versioned-objects.js';
import {calculateIdHashOfObj} from '@refinio/one.core/lib/util/object.js';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks.js';
import type {HexString} from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string.js';
import {ConnectionPhoneBookRecipes} from '@refinio/connection.core/recipes';
import {
  createConnectionFromQuicVC,
  QuicVCConnectionManager,
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
import {objectEvents} from '@refinio/one.models/lib/misc/ObjectEventDispatcher.js';
import type {Invitation} from '@refinio/one.models/lib/misc/ConnectionEstablishment/PairingManager.js';
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
  UvcControlPlan,
  UvcProvisioningController,
  UvcStateTrie,
  makeUvcControlTrieRootId,
  makeUvcJournalTrieRootId,
  makeUvcPhoneBookTrieRootId,
  makeUvcProvisioningTrieRootId,
  type UvcDiscoveryObservation,
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
import {QuicVCHeadlessProvisioningClient} from '@uvc/groov-authority';
import {app} from 'electron';
import path from 'node:path';
import {createPublicKey, randomUUID, verify as verifyNodeSignature} from 'node:crypto';

import type {DiscoveryDeviceSnapshot, SettingsSnapshot} from '@shared/contracts';

export interface CubeOneIdentity {
  personId: string;
  instanceId: string;
  publicKey: string;
  publicSignKey: string;
  displayName: string;
}

function requiredSetting(settings: SettingsSnapshot, key: string, fallback: string): string {
  const value = settings['uvc.identity']?.[key];
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || fallback;
}

const storage: OneCoreTrieStorageDeps = {
  storeVersionedObject: async object => await storeVersionedObject(object as never) as never,
  getObjectByIdHash: async idHash => await getObjectByIdHash(idHash as never) as never,
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
  private provisioningController?: UvcProvisioningController;
  private provisioningClient?: QuicVCHeadlessProvisioningClient;
  private quicManager?: QuicVCConnectionManager;
  private quicTransport?: NodeQuicVCTransport;
  private leuteModel?: LeuteModel;
  private connectionsModel?: ConnectionsModel;
  private readonly controlTries = new Map<string, UvcStateTrie>();
  private readonly pairedPeople = new Set<SHA256IdHash<Person>>();
  private readonly consumed = new Set<string>();
  private readonly discoveredDevices = new Map<string, DiscoveryDeviceSnapshot>();
  private readonly provisionedHardwareIdByPerson = new Map<string, string>();
  private readonly controlPeerConnections = new Map<string, Promise<void>>();
  private disconnectRootListener?: () => void;

  async init(settings: SettingsSnapshot): Promise<CubeOneIdentity> {
    if (this.identity) {
      return this.identity;
    }
    const email = requiredSetting(settings, 'email', 'cube@uvc.local');
    const password = requiredSetting(settings, 'password', 'uvc-cube-local');
    const instanceName = requiredSetting(settings, 'instanceName', 'uvc-cube');
    const displayName = requiredSetting(settings, 'displayName', 'UVC Cube');
    const commServerUrl = requiredSetting(settings, 'commServerUrl', 'wss://comm10.dev.refinio.one');
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
    this.connectionsModel = new ConnectionsModel(this.leuteModel, {commServerUrl});
    await this.leuteModel.init();
    await this.connectionsModel.init();
    for (const someone of await this.leuteModel.others()) {
      for (const personId of someone.identities()) {
        this.pairedPeople.add(personId);
      }
    }
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
    });
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
        const personId = await calculateIdHashOfObj({$type$: 'Person', email});
        const instanceId = await calculateIdHashOfObj({
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
    });
    this.disconnectRootListener = objectEvents.onNewVersion(
      result => this.consumeSharedRoot(result.obj as UvcStateTrieRoot),
      'UvcCube: consume shared trie root',
      'UvcStateTrieRoot',
    );
    for (const remotePerson of this.pairedPeople) {
      await this.controlPlan.sharePhoneBookWith(remotePerson);
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
      || this.provisionedHardwareIdByPerson.has(personId);
  }

  canonicalizeDiscoveredDevice(device: DiscoveryDeviceSnapshot): DiscoveryDeviceSnapshot {
    const hardwareDeviceId = device.ownerId
      ? this.provisionedHardwareIdByPerson.get(device.ownerId)
      : undefined;
    if (!hardwareDeviceId) {
      return device;
    }
    return {
      ...device,
      id: hardwareDeviceId,
      name: hardwareDeviceId,
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
    this.discoveredDevices.set(device.id, device);
    const observedAt = Date.parse(device.lastSeenAt ?? '') || Date.now();
    await this.controlPlan.recordDiscovery({
      deviceId: device.id,
      deviceKind: normalizeKind(device.type),
      address: device.address,
      port: device.port,
      publicKey: device.publicKey ?? '',
      ...(device.ownerId ? {claimedPersonId: device.ownerId as SHA256IdHash<Person>} : {}),
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
    executorPersonId: SHA256IdHash<Person>;
  }): Promise<UvcControlObservation> {
    if (!this.controlPlan) {
      throw new Error('[UvcCube] control plan is not initialized');
    }
    return await this.controlPlan.execute(input, 'read');
  }

  async setLight(input: {
    deviceId: string;
    kind: 'groov' | 'esp32';
    executorPersonId: SHA256IdHash<Person>;
    enabled: boolean;
    intensity?: number;
  }): Promise<UvcControlObservation> {
    if (!this.controlPlan) {
      throw new Error('[UvcCube] control plan is not initialized');
    }
    return await this.controlPlan.execute(input, 'set', {
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
    this.provisionedHardwareIdByPerson.set(certificate.devicePersonId, certificate.hardwareDeviceId);
    return result;
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
        this.provisionedHardwareIdByPerson.set(
          certificate.devicePersonId,
          certificate.hardwareDeviceId,
        );
      }
    }
  }

  async shutdown(): Promise<void> {
    this.provisioningClient?.stop();
    this.provisioningClient = undefined;
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

  private async consumeSharedRoot(root: UvcStateTrieRoot): Promise<void> {
    const parts = root.id.split(':');
    if (parts[0] !== 'uvc' || (parts[1] !== 'phone-book' && parts[1] !== 'control')) {
      return;
    }
    const source = decodeURIComponent(parts[2] ?? '') as SHA256IdHash<Person>;
    if (!source || source === this.ownerPersonId || !this.isPaired(source)) {
      return;
    }
    if (parts[1] === 'control' && decodeURIComponent(parts[4] ?? '') !== this.ownerPersonId) {
      return;
    }
    const imported = new UvcStateTrie({rootId: root.id, storage});
    await imported.init();
    const paths = parts[1] === 'phone-book'
      ? [['phone-book']]
      : [['control', 'command'], ['control', 'observation']];
    for (const path of paths) {
      for (const hash of await imported.list(path)) {
        if (this.consumed.has(hash)) {
          continue;
        }
        const entry = await getObject(hash as never) as UvcStateEntry;
        await this.controlPlan!.consume(hash, entry, source);
        this.consumed.add(hash);
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
    this.provisioningClient = new QuicVCHeadlessProvisioningClient(
      manager,
      this.provisioningController,
    );
    console.log(`[UvcCube] QUICVC provisioning transport bound to UDP ${port}`);
  }

  private resolveProvisioningPeer(
    publicKey: string,
    credential?: DeviceIdentityCredential,
  ): QuicVCPeerTrustInfo | null {
    const device = [...this.discoveredDevices.values()].find(candidate => candidate.publicKey === publicKey);
    if (!device) {
      return null;
    }
    if (device.ownerId) {
      return {
        personId: device.ownerId as SHA256IdHash<Person>,
        publicKey,
        trustLevel: this.isPaired(device.ownerId) ? 'trusted' : 'low',
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
      unsubscribe = manager.onConnectionEstablished.listen(event => {
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
