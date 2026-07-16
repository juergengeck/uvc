import {
  GroovAuthorityClient,
  QuicVCHeadlessProvisioningClient,
  type GroovAuthorityState,
} from '@uvc/groov-authority';
import {Buffer} from 'buffer';
import {createAccess} from '@refinio/one.core/lib/access.js';
import {ensurePublicSignKey, signatureVerify} from '@refinio/one.core/lib/crypto/sign.js';
import {createCryptoApiFromDefaultKeys} from '@refinio/one.core/lib/keychain/keychain.js';
import type {Instance, Person} from '@refinio/one.core/lib/recipes.js';
import {SET_ACCESS_MODE} from '@refinio/one.core/lib/storage-base-common.js';
import {getObject, storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects.js';
import {
  getCurrentVersionHash,
  getObjectByIdHash,
  getVersionsHashes,
  storeVersionedObject,
  type VersionedObjectResult,
} from '@refinio/one.core/lib/storage-versioned-objects.js';
import {calculateIdHashOfObj} from '@refinio/one.core/lib/util/object.js';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks.js';
import type ConnectionsModel from '@refinio/one.models/lib/models/ConnectionsModel.js';
import {objectEvents} from '@refinio/one.models/lib/misc/ObjectEventDispatcher.js';
import type {OneCoreTrieStorageDeps} from '@refinio/trie.core';
import {
  UvcControlPlan,
  UvcProvisioningController,
  UvcStateTrie,
  makeUvcControlTrieRootId,
  makeUvcJournalTrieRootId,
  makeUvcPhoneBookTrieRootId,
  makeUvcProvisioningTrieRootId,
  type UvcAdminRoleGrantResult,
  type UvcControlObservation,
  type UvcDiscoveryObservation,
  type UvcStateEntry,
  type UvcStateTrieRoot,
} from '@refinio/uvc.core';

import type {DeviceDiscoveryModel} from '../network/DeviceDiscoveryModel';
import type {DiscoveryDevice} from '../network/interfaces';
import type {ESP32Response} from '../network/esp32/ESP32ConnectionManager';

export type UvcControlTargetKind = 'groov' | 'esp32';

export interface UvcControlTarget {
  deviceId: string;
  kind: UvcControlTargetKind;
  connectionId?: string;
  executorPersonId?: SHA256IdHash<Person>;
}

export interface UvcLightState {
  enabled: boolean;
  intensity?: number;
  observedAt: string;
  producerDeviceId: string;
}

export interface UvcSetLightInput {
  enabled: boolean;
  intensity?: number;
}

interface DiscoveredDeviceRecord {
  deviceId: string;
  deviceType: string;
  address: string;
  port: number;
  capabilities?: string[];
  metadata?: string;
  lastSeen?: number;
}

const storage: OneCoreTrieStorageDeps = {
  storeVersionedObject: async object => await storeVersionedObject(object as never) as never,
  getObjectByIdHash: async idHash => await getObjectByIdHash(idHash as never) as never,
  calculateIdHashOfObj: async object => await calculateIdHashOfObj(object as never) as string,
  getCurrentVersionHash: async idHash => await getCurrentVersionHash(idHash as never) as string,
  getVersionsHashes: async idHash => await getVersionsHashes(idHash as never) as string[],
  getObject: async hash => await getObject(hash as never) as never,
};

/** Trie-backed device logic shared by Expo and its browser build. */
export class DeviceControlModel {
  private groovClient?: GroovAuthorityClient;
  private headlessProvisioningClient?: QuicVCHeadlessProvisioningClient;
  private phoneBook!: UvcStateTrie;
  private journal!: UvcStateTrie;
  private provisioning!: UvcStateTrie;
  private plan!: UvcControlPlan;
  private provisioningController!: UvcProvisioningController;
  private readonly controlTries = new Map<string, UvcStateTrie>();
  private readonly consumed = new Set<string>();
  private readonly disconnectors: Array<() => void> = [];

  constructor(
    private readonly discovery: DeviceDiscoveryModel,
    private readonly connections: ConnectionsModel,
    private readonly personId: SHA256IdHash<Person>,
    private readonly instanceId: SHA256IdHash<Instance>,
  ) {}

  async init(): Promise<void> {
    this.phoneBook = this.makeTrie(makeUvcPhoneBookTrieRootId({
      ownerPersonId: this.personId,
      ownerInstanceId: this.instanceId,
    }), true);
    this.journal = this.makeTrie(makeUvcJournalTrieRootId({
      ownerPersonId: this.personId,
      ownerInstanceId: this.instanceId,
    }), true);
    this.provisioning = this.makeTrie(makeUvcProvisioningTrieRootId({
      ownerPersonId: this.personId,
      ownerInstanceId: this.instanceId,
    }), true);
    await Promise.all([this.phoneBook.init(), this.journal.init(), this.provisioning.init()]);
    const cryptoApi = await createCryptoApiFromDefaultKeys(this.instanceId);
    this.provisioningController = new UvcProvisioningController({
      administrator: {
        personId: this.personId,
        instanceId: this.instanceId,
        publicSignKey: Buffer.from(cryptoApi.publicSignKey).toString('base64'),
        signAlgorithm: 'ed25519',
      },
      sign: payload => Buffer.from(cryptoApi.sign(payload)).toString('base64'),
      verify: (payload, signature, publicSignKey, algorithm) => {
        if (algorithm !== 'ed25519') {
          throw new Error(`This Expo/browser runtime cannot verify ${algorithm} device proofs`);
        }
        return signatureVerify(
          payload,
          Buffer.from(signature, 'base64'),
          ensurePublicSignKey(Buffer.from(publicSignKey, 'base64')),
        );
      },
      deriveAssignedIdentityIds: async ({email, instanceName}) => {
        const personId = await calculateIdHashOfObj({$type$: 'Person', email});
        const instanceId = await calculateIdHashOfObj({$type$: 'Instance', name: instanceName, owner: personId});
        return {personId, instanceId};
      },
      persistence: {
        evidence: this.provisioning,
        journal: this.journal,
        store: async entry => (await storeUnversionedObject(entry as never)).hash as never,
        load: async hash => await getObject(hash as never) as UvcStateEntry,
      },
      randomChallenge: () => `${this.instanceId}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    });
    this.plan = new UvcControlPlan({
      ownerPersonId: this.personId,
      ownerInstanceId: this.instanceId,
      localDeviceId: this.instanceId,
      phoneBook: this.phoneBook,
      journal: this.journal,
      controlFor: personId => this.getControlTrie(personId),
      store: async entry => (await storeUnversionedObject(entry as never)).hash as never,
      load: async hash => await getObject(hash as never) as UvcStateEntry,
      isPaired: personId => this.connections.getActiveConnectionPersonIds().includes(personId),
      authority: {
        read: async deviceId => this.executeAgainstAuthority(this.requireTarget(deviceId), 'read'),
        set: async (deviceId, desired) => this.executeAgainstAuthority(
          this.requireTarget(deviceId),
          'set',
          desired,
        ),
      },
    });

    this.disconnectors.push(
      this.discovery.onDeviceDiscovered.listen(device => this.recordDiscovery(device)),
      this.discovery.onDeviceUpdated.listen(value => {
        const device = typeof (value as unknown) === 'string'
          ? this.discovery.getDevice(value as unknown as string)
          : value;
        return device ? this.recordDiscovery(device) : undefined;
      }),
      this.connections.pairing.onPairingSuccess.listen(async (
        _outgoing,
        _localPerson,
        _localInstance,
        remotePerson,
      ) => this.plan.sharePhoneBookWith(remotePerson)),
      objectEvents.onNewVersion(
        result => this.consumeSharedRoot(result as VersionedObjectResult<UvcStateTrieRoot>),
        'DeviceControlModel: consume trie root',
        'UvcStateTrieRoot',
      ),
    );
    for (const device of this.discovery.getDevices()) {
      await this.recordDiscovery(device);
    }
  }

  shutdown(): void {
    this.groovClient?.stop();
    this.groovClient = undefined;
    this.headlessProvisioningClient?.stop();
    this.headlessProvisioningClient = undefined;
    this.plan?.shutdown();
    for (const disconnect of this.disconnectors.splice(0)) {
      disconnect();
    }
  }

  async readLight(target: UvcControlTarget): Promise<UvcLightState> {
    return this.toLightState(await this.execute(target, 'read'));
  }

  async setLight(target: UvcControlTarget, desired: UvcSetLightInput): Promise<UvcLightState> {
    if (typeof desired.enabled !== 'boolean') {
      throw new Error('desired.enabled must be a boolean');
    }
    if (desired.intensity !== undefined && (
      !Number.isFinite(desired.intensity) || desired.intensity < 0 || desired.intensity > 1
    )) {
      throw new Error('desired.intensity must be between 0 and 1');
    }
    if (target.kind === 'esp32' && desired.intensity !== undefined) {
      throw new Error('ESP32 LED control does not support intensity');
    }
    return this.toLightState(await this.execute(target, 'set', desired));
  }

  async getJournal(deviceId?: string): Promise<UvcStateEntry[]> {
    const hashes = await this.journal.list(deviceId ? ['journal', 'device', deviceId] : ['journal']);
    return await Promise.all(hashes.map(hash => getObject(hash as never) as Promise<UvcStateEntry>));
  }

  async provisionHeadlessDevice(input: {
    deviceId: string;
    deviceKind: 'groov' | 'esp32';
    assignedEmail: string;
    assignedInstanceName: string;
    connectionId?: string;
  }): Promise<UvcAdminRoleGrantResult> {
    const discovered = this.discovery.getDevice(input.deviceId);
    if (!discovered) {
      throw new Error(`Cannot provision undiscovered device ${input.deviceId}`);
    }
    const quicManager = this.discovery.getQuicVCConnectionManager();
    if (!quicManager) {
      throw new Error('QUICVC is not initialized for headless provisioning');
    }
    this.headlessProvisioningClient ??= new QuicVCHeadlessProvisioningClient(
      quicManager,
      this.provisioningController,
    );
    return await this.headlessProvisioningClient.provision({
      deviceId: input.deviceId,
      hardwareDeviceId: input.deviceId,
      deviceKind: input.deviceKind,
      assignedEmail: input.assignedEmail,
      assignedInstanceName: input.assignedInstanceName,
      ...(input.connectionId ? {connectionId: input.connectionId} : {}),
    });
  }

  private async execute(
    target: UvcControlTarget,
    operation: 'read' | 'set',
    desired?: UvcSetLightInput,
  ): Promise<UvcControlObservation> {
    const executorPersonId = await this.canExecuteLocally(target)
      ? this.personId
      : target.executorPersonId ?? this.claimedPerson(target.deviceId);
    if (!executorPersonId) {
      throw new Error(`Device ${target.deviceId} has no paired executor`);
    }
    return await this.plan.execute({
      deviceId: target.deviceId,
      kind: target.kind,
      executorPersonId,
    }, operation, desired);
  }

  private async recordDiscovery(device: DiscoveryDevice): Promise<void> {
    const discovered = device as unknown as DiscoveredDeviceRecord;
    const metadata = parseMetadata(discovered.metadata);
    const publicKey = typeof metadata.publicKey === 'string' ? metadata.publicKey : '';
    if (!discovered.address || !discovered.port || !publicKey) {
      return;
    }
    const observedAt = discovered.lastSeen ?? Date.now();
    await this.plan.recordDiscovery({
      deviceId: discovered.deviceId,
      deviceKind: normalizeKind(discovered.deviceType),
      address: discovered.address,
      port: discovered.port,
      publicKey,
      ...(typeof metadata.claimedPersonId === 'string'
        ? {claimedPersonId: metadata.claimedPersonId as SHA256IdHash<Person>}
        : {}),
      capabilities: new Set(discovered.capabilities ?? []),
      observedAt,
      expiresAt: observedAt + 60_000,
    });
  }

  private async consumeSharedRoot(result: VersionedObjectResult<UvcStateTrieRoot>): Promise<void> {
    const parts = result.obj.id.split(':');
    if (parts[0] !== 'uvc' || (parts[1] !== 'phone-book' && parts[1] !== 'control')) {
      return;
    }
    const source = decodeURIComponent(parts[2] ?? '') as SHA256IdHash<Person>;
    if (!source || source === this.personId || !this.isPaired(source)) {
      return;
    }
    if (parts[1] === 'control') {
      const audience = decodeURIComponent(parts[4] ?? '');
      if (audience !== this.personId) {
        return;
      }
    }
    const imported = this.makeTrie(result.obj.id);
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
        await this.plan.consume(hash as SHA256Hash<UvcStateEntry>, entry, source);
        this.consumed.add(hash);
      }
    }
  }

  private makeTrie(rootId: string, repairIncompleteLocalRoot = false): UvcStateTrie {
    return new UvcStateTrie({
      rootId,
      storage,
      repairIncompleteLocalRoot,
      grantRootAccess: async (rootIdHash, remotePerson) => {
        await createAccess([{
          id: rootIdHash,
          person: [remotePerson],
          hashGroup: [],
          mode: SET_ACCESS_MODE.ADD,
        }]);
      },
    });
  }

  private async getControlTrie(personId: SHA256IdHash<Person>): Promise<UvcStateTrie> {
    const existing = this.controlTries.get(personId);
    if (existing) {
      return existing;
    }
    const trie = this.makeTrie(makeUvcControlTrieRootId({
      ownerPersonId: this.personId,
      ownerInstanceId: this.instanceId,
      audiencePersonId: personId,
    }), true);
    await trie.init();
    this.controlTries.set(personId, trie);
    return trie;
  }

  private isPaired(personId: SHA256IdHash<Person>): boolean {
    return this.connections.getActiveConnectionPersonIds().includes(personId);
  }

  private claimedPerson(deviceId: string): SHA256IdHash<Person> | undefined {
    const device = this.discovery.getDevice(deviceId) as unknown as DiscoveredDeviceRecord | undefined;
    const claimed = parseMetadata(device?.metadata).claimedPersonId;
    return typeof claimed === 'string' && this.isPaired(claimed as SHA256IdHash<Person>)
      ? claimed as SHA256IdHash<Person>
      : undefined;
  }

  private requireTarget(deviceId: string): UvcControlTarget {
    const device = this.discovery.getDevice(deviceId);
    if (!device) {
      throw new Error(`Device ${deviceId} is not discovered on this instance`);
    }
    const discovered = device as unknown as DiscoveredDeviceRecord;
    const kind = discovered.deviceType.toLowerCase().includes('esp32') ? 'esp32' : 'groov';
    return {deviceId, kind};
  }

  private async canExecuteLocally(target: UvcControlTarget): Promise<boolean> {
    if (target.kind === 'groov') {
      return this.discovery.getQuicVCConnectionManager()?.getConnection(target.deviceId)?.state === 'established';
    }
    return (await this.discovery.getESP32ConnectionManager())?.getDevice(target.deviceId)?.isAuthenticated === true;
  }

  private async executeAgainstAuthority(
    target: UvcControlTarget,
    operation: 'read' | 'set',
    desired?: UvcSetLightInput,
  ): Promise<{enabled: boolean; intensity?: number}> {
    if (target.kind === 'groov') {
      const manager = this.discovery.getQuicVCConnectionManager();
      if (!manager) {
        throw new Error('QUICVC is not initialized for Groov control');
      }
      this.groovClient ??= new GroovAuthorityClient(manager);
      const options = target.connectionId ? {connectionId: target.connectionId} : {};
      const result: GroovAuthorityState = operation === 'read'
        ? await this.groovClient.readState(target.deviceId, options)
        : await this.groovClient.setLight(target.deviceId, desired!, options);
      return {enabled: result.light.enabled, intensity: result.light.intensity};
    }
    const manager = await this.discovery.getESP32ConnectionManager();
    if (!manager) {
      throw new Error('ESP32 connection manager is not initialized');
    }
    return this.parseEsp32Observation(target.deviceId, await manager.sendCommand(target.deviceId, {
      type: 'led_control',
      command: 'led_control',
      deviceId: target.deviceId,
      action: operation === 'read' ? 'status' : desired!.enabled ? 'on' : 'off',
      timestamp: Date.now(),
    }));
  }

  private parseEsp32Observation(deviceId: string, response: ESP32Response): {enabled: boolean} {
    if (response.status !== 'success') {
      throw new Error(response.message ?? `ESP32 operation failed with status ${response.status}`);
    }
    const data = response.data as Record<string, unknown> | undefined;
    const rawState = data?.state ?? data?.blue_led ?? data?.blue_led_status;
    if (rawState !== 'on' && rawState !== 'off' && typeof rawState !== 'boolean') {
      throw new Error(`ESP32 ${deviceId} response did not contain an observed LED state`);
    }
    return {enabled: rawState === true || rawState === 'on'};
  }

  private toLightState(observation: UvcControlObservation): UvcLightState {
    if (observation.status !== 'observed' || typeof observation.enabled !== 'boolean') {
      throw new Error(observation.error ?? 'Device authority did not return light state');
    }
    return {
      enabled: observation.enabled,
      ...(observation.intensity !== undefined ? {intensity: observation.intensity} : {}),
      observedAt: new Date(observation.observedAt).toISOString(),
      producerDeviceId: observation.producerDeviceId,
    };
  }
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value.trim()) {
    return {};
  }
  const parsed = JSON.parse(value) as unknown;
  return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
}

function normalizeKind(value: string): UvcDiscoveryObservation['deviceKind'] {
  const kind = value.trim().toLowerCase();
  return kind === 'cube' || kind === 'expo' || kind === 'browser'
    || kind === 'groov' || kind === 'esp32'
    ? kind
    : 'one-peer';
}
