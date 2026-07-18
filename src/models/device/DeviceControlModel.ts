import {
  GroovAuthorityClient,
  QuicVCHeadlessProvisioningClient,
  type GroovAuthorityState,
} from '@uvc/groov-authority';
import {Buffer} from 'buffer';
import {createAccess} from '@refinio/one.core/lib/access.js';
import {onChumImportBatch} from '@refinio/one.core/lib/chum-sync.js';
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
  storeVersionedObjectSilently,
} from '@refinio/one.core/lib/storage-versioned-objects.js';
import {calculateHashOfObj, calculateIdHashOfObj} from '@refinio/one.core/lib/util/object.js';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks.js';
import type ConnectionsModel from '@refinio/one.models/lib/models/ConnectionsModel.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type {OneCoreTrieStorageDeps} from '@refinio/trie.core';
import {
  UvcControlPlan,
  UvcProvisioningController,
  UvcStateTrie,
  projectUvcStateTrieEntryHashes,
  makeEarlierUvcControlTrieRootId,
  makeEarlierUvcPhoneBookTrieRootId,
  makeUvcControlTrieRootId,
  makeUvcJournalTrieRootId,
  makeLegacyUvcControlTrieRootId,
  makeLegacyUvcPhoneBookTrieRootId,
  makePreviousUvcControlTrieRootId,
  makePreviousUvcPhoneBookTrieRootId,
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
  storeVersionedObjectSilently: async object => await storeVersionedObjectSilently(
    object as never,
  ) as never,
  getObjectByIdHash: async idHash => await getObjectByIdHash(idHash as never) as never,
  calculateHashOfObj: async object => await calculateHashOfObj(object as never) as string,
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
  private readonly pairedPeople = new Set<SHA256IdHash<Person>>();
  private readonly disconnectors: Array<() => void> = [];
  private readonly deferredDiscovery = new Map<string, DiscoveryDevice>();
  private discoveryDrainActive = false;
  private integrationDiscoveryRecorded = false;
  private controlOperationsInFlight = 0;
  private discoveryResumeTimer?: ReturnType<typeof setTimeout>;
  /** Keep import order per producer without blocking observations from peers. */
  private readonly consumeTails = new Map<SHA256IdHash<Person>, Promise<void>>();

  constructor(
    private readonly discovery: DeviceDiscoveryModel,
    private readonly connections: ConnectionsModel,
    private readonly leuteModel: LeuteModel,
    private readonly personId: SHA256IdHash<Person>,
    private readonly instanceId: SHA256IdHash<Instance>,
    private readonly integrationMode = false,
  ) {}

  async init(): Promise<void> {
    const phoneBookRootInput = {
      ownerPersonId: this.personId,
      ownerInstanceId: this.instanceId,
    };
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
    for (const someone of await this.leuteModel.others()) {
      for (const identity of someone.identities()) {
        this.pairedPeople.add(identity);
      }
    }
    // Control roots belong to the durable paired relationship, not to a
    // transient command. Materialize them before discovery listeners begin
    // writing phone-book snapshots so the first physical command never has to
    // initialize its sync root behind background device traffic.
    await Promise.all([...this.pairedPeople].map(async personId => {
      const controlRootInput = {
        ownerPersonId: this.personId,
        ownerInstanceId: this.instanceId,
        audiencePersonId: personId,
      };
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
      // Pairing and its IdAccess are durable. Reassert every producer-owned
      // root when a Metro runtime is recreated instead of depending on the
      // one-shot onPairingSuccess event from the original app process.
      await this.getControlTrie(personId);
    }));
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
      // Pairing is a durable Leute identity relationship. Socket presence only
      // selects whether CHUM can transfer right now; it must not revoke trust
      // while a relay lane reconnects.
      isPaired: personId => this.isPaired(personId),
      onCommandPublished: async (commandHash, command) => {
        console.log(
          `[DeviceControlModel] Published ${command.operation} command ${commandHash} `
          + `for executor ${command.executorPersonId}`,
        );
      },
      authority: {
        read: async deviceId => this.executeAgainstAuthority(this.requireTarget(deviceId), 'read'),
        set: async (deviceId, desired) => this.executeAgainstAuthority(
          this.requireTarget(deviceId),
          'set',
          desired,
        ),
      },
    });
    await this.plan.init();
    await Promise.all([...this.pairedPeople].map(async personId => {
      await this.plan.sharePhoneBookWith(personId);
      await this.plan.shareControlWith(personId);
    }));

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
      ) => {
        this.pairedPeople.add(remotePerson);
        await this.plan.sharePhoneBookWith(remotePerson);
        await this.plan.shareControlWith(remotePerson);
      }),
      onChumImportBatch.addListener(event => {
        if (
          event.localPersonId !== this.personId
          || !this.isPaired(event.remotePersonId)
        ) {
          return;
        }
        const source = event.remotePersonId;
        const tail = (this.consumeTails.get(source) ?? Promise.resolve())
          .then(() => this.consumeImportedBatch(event.batch.imported, event.remotePersonId))
          .catch(error => {
            console.error('[DeviceControlModel] Failed to project imported UVC trie root:', error);
          });
        this.consumeTails.set(source, tail);
        void tail.then(() => {
          if (this.consumeTails.get(source) === tail) {
            this.consumeTails.delete(source);
          }
        });
      }),
    );
    for (const device of this.discovery.getDevices()) {
      await this.recordDiscovery(device);
    }
  }

  shutdown(): void {
    if (this.discoveryResumeTimer) {
      clearTimeout(this.discoveryResumeTimer);
      this.discoveryResumeTimer = undefined;
    }
    this.deferredDiscovery.clear();
    this.groovClient?.stop();
    this.groovClient = undefined;
    this.headlessProvisioningClient?.stop();
    this.headlessProvisioningClient = undefined;
    this.plan?.shutdown();
    for (const disconnect of this.disconnectors.splice(0)) {
      disconnect();
    }
    this.consumeTails.clear();
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
    // An explicit executor is part of the caller's trust/routing decision and
    // must not be replaced merely because this runtime can also see the
    // hardware locally. Automatic local execution is only the default when no
    // executor was selected.
    const executorPersonId = target.executorPersonId
      ?? (await this.canExecuteLocally(target)
        ? this.personId
        : this.claimedPerson(target.deviceId));
    if (!executorPersonId) {
      throw new Error(`Device ${target.deviceId} has no paired executor`);
    }
    if (this.discoveryResumeTimer) {
      clearTimeout(this.discoveryResumeTimer);
      this.discoveryResumeTimer = undefined;
    }
    this.controlOperationsInFlight += 1;
    try {
      return await this.plan.execute({
        deviceId: target.deviceId,
        kind: target.kind,
        executorPersonId,
      }, operation, desired);
    } finally {
      this.controlOperationsInFlight -= 1;
      if (this.controlOperationsInFlight === 0) {
        this.scheduleDeferredDiscovery();
      }
    }
  }

  private async recordDiscovery(device: DiscoveryDevice): Promise<void> {
    if (this.integrationMode && this.integrationDiscoveryRecorded) {
      return;
    }
    const discovered = device as unknown as DiscoveredDeviceRecord;
    // Discovery is coalesced current state. Keep one producer-side drain so
    // callbacks cannot pre-submit a backlog of background trie operations
    // that would resume between a control command and its observation.
    this.deferredDiscovery.set(discovered.deviceId, device);
    await this.drainDiscovery();
  }

  private async persistDiscovery(device: DiscoveryDevice): Promise<void> {
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
      // The mDNS person id is only an external claim at this point. Persisting
      // it as referenceToId would require a locally materialized Person object
      // and makes the shared phone-book graph invalid when that object is not
      // present. Verified execution still resolves identity from pairing.
      capabilities: new Set(discovered.capabilities ?? []),
      observedAt,
      expiresAt: observedAt + 60_000,
    });
    // The physical integration flow only needs one producer-owned trie write
    // as evidence that the Expo CHUM lane is ready. Cube owns live discovery
    // during that flow; persisting every later broadcast here creates a long
    // background root write that can block the foreground LED command.
    if (this.integrationMode) {
      this.integrationDiscoveryRecorded = true;
      this.deferredDiscovery.clear();
    }
  }

  private scheduleDeferredDiscovery(): void {
    if (this.deferredDiscovery.size === 0 || this.discoveryResumeTimer) {
      return;
    }
    this.discoveryResumeTimer = setTimeout(() => {
      this.discoveryResumeTimer = undefined;
      void this.drainDiscovery().catch(error => {
        console.error('[DeviceControlModel] Failed to persist deferred discovery:', error);
      });
    }, 250);
  }

  private async drainDiscovery(): Promise<void> {
    if (this.controlOperationsInFlight > 0 || this.discoveryDrainActive) {
      return;
    }
    this.discoveryDrainActive = true;
    try {
      while (this.controlOperationsInFlight === 0 && this.deferredDiscovery.size > 0) {
        if (this.integrationMode && this.integrationDiscoveryRecorded) {
          this.deferredDiscovery.clear();
          break;
        }
        const next = this.deferredDiscovery.entries().next().value as
          | [string, DiscoveryDevice]
          | undefined;
        if (!next) {
          break;
        }
        const [deviceId, device] = next;
        this.deferredDiscovery.delete(deviceId);
        await this.persistDiscovery(device);
      }
    } finally {
      this.discoveryDrainActive = false;
      if (this.controlOperationsInFlight === 0 && this.deferredDiscovery.size > 0) {
        this.scheduleDeferredDiscovery();
      }
    }
  }

  private async consumeImportedEntry(hash: string, source: SHA256IdHash<Person>): Promise<void> {
    if (this.consumed.has(hash)) {
      return;
    }
    const entry = await getObject(hash as never) as UvcStateEntry;
    await this.plan.consume(hash as SHA256Hash<UvcStateEntry>, entry, source);
    this.consumed.add(hash);
    console.log(`[DeviceControlModel] Consumed imported ${entry.$type$} ${hash}`);
  }

  private async consumeImportedBatch(
    imported: readonly {kind: string; hash: string; type: string}[],
    source: SHA256IdHash<Person>,
  ): Promise<void> {
    for (const ref of imported) {
      if (ref.kind !== 'object' || ref.type !== 'UvcStateTrieRoot') continue;
      const root = await getObject(ref.hash as never) as UvcStateTrieRoot;
      const entryHashes = await projectUvcStateTrieEntryHashes({
        root,
        remotePersonId: source,
        localPersonId: this.personId,
        loadObject: async hash => await getObject(hash as never) as never,
      });
      for (const hash of entryHashes) {
        await this.consumeImportedEntry(String(hash), source);
      }
    }
  }

  private makeTrie(rootId: string): UvcStateTrie {
    return new UvcStateTrie({
      rootId,
      storage,
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
    }));
    await trie.init();
    this.controlTries.set(personId, trie);
    return trie;
  }

  private isPaired(personId: SHA256IdHash<Person>): boolean {
    return this.pairedPeople.has(personId);
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
