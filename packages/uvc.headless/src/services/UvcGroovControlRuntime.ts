import {createAccess} from '@refinio/one.core/lib/access.js';
import type {Instance, Person} from '@refinio/one.core/lib/recipes.js';
import {SET_ACCESS_MODE} from '@refinio/one.core/lib/storage-base-common.js';
import {getObject, storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects.js';
import {
  getCurrentVersionHash,
  getObjectByIdHash,
  getVersionsHashes,
  storeVersionedObject,
} from '@refinio/one.core/lib/storage-versioned-objects.js';
import {onChumObjectImported} from '@refinio/one.core/lib/chum-sync.js';
import {calculateIdHashOfObj} from '@refinio/one.core/lib/util/object.js';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks.js';
import type {OneCoreTrieStorageDeps} from '@refinio/trie.core';
import type {DeviceIdentityCredential, QuicVCPeerTrustInfo} from '@refinio/connection.core';
import {
  UvcControlPlan,
  UvcStateTrie,
  makeUvcControlTrieRootId,
  makeUvcJournalTrieRootId,
  makeUvcPhoneBookTrieRootId,
  isUvcStateSyncType as isCoreUvcStateSyncType,
  type UvcAuthorityAdapter,
  type UvcStateEntry,
} from '@refinio/uvc.core';
import {
  createGroovAuthorityRuntime,
  type GroovAuthorityService,
  type GroovManageLightController,
  type QuicVCStreamHost,
} from '@uvc/groov-authority';

import type {UvcHeadlessProvisioningState} from './UvcHeadlessProvisioningState.js';

const GROOV_AUTHORITY_ENVIRONMENT_KEYS = [
  'GROOV_AUTHORITY_ID',
  'GROOV_MANAGE_BASE_URL',
  'GROOV_MANAGE_API_KEY',
  'GROOV_MODULE_INDEX',
  'GROOV_CHANNEL_INDEX',
  'GROOV_OUTPUT_KIND',
] as const;

export function isUvcStateSyncType(type: string): boolean {
  return isCoreUvcStateSyncType(type);
}

export function isUvcControlCommandImport(imported: {kind: string; type: string}): boolean {
  return imported.kind === 'object' && imported.type === 'UvcControlCommand';
}

const storage: OneCoreTrieStorageDeps = {
  storeVersionedObject: async object => await storeVersionedObject(object as never) as never,
  getObjectByIdHash: async idHash => await getObjectByIdHash(idHash as never) as never,
  calculateIdHashOfObj: async object => await calculateIdHashOfObj(object as never) as string,
  getCurrentVersionHash: async idHash => await getCurrentVersionHash(idHash as never) as string,
  getVersionsHashes: async idHash => await getVersionsHashes(idHash as never) as string[],
  getObject: async hash => await getObject(hash as never) as never,
};

interface GroovControlAuthorityController {
  readState(): Promise<{enabled: boolean; intensity: number}>;
  setLight(desired: {enabled: boolean; intensity?: number}): Promise<{
    enabled: boolean;
    intensity: number;
  }>;
}

export type GroovAuthorityConfigurationState =
  | {mode: 'uncommissioned'}
  | {mode: 'commissioned'};

/**
 * Distinguish a deliberately uncommissioned device from a partially supplied
 * secret/configuration surface. Partial configuration is a startup error;
 * values are never logged or copied into ONE objects.
 */
export function resolveGroovAuthorityConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): GroovAuthorityConfigurationState {
  const present = GROOV_AUTHORITY_ENVIRONMENT_KEYS.filter(key => Boolean(env[key]?.trim()));
  if (present.length === 0) {
    return {mode: 'uncommissioned'};
  }
  const missing = GROOV_AUTHORITY_ENVIRONMENT_KEYS.filter(key => !env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`[UVC Groov control] Incomplete authority configuration; missing ${missing.join(', ')}`);
  }
  return {mode: 'commissioned'};
}

/** Resolve the exact administrator identity certified by durable UVC provisioning. */
export function isUvcAdministratorPeer(
  state: UvcHeadlessProvisioningState,
  personId: string,
  publicKey: string,
): boolean {
  const administrator = state.administrator;
  return Boolean(
    state.status === 'active'
    && state.grant
    && administrator
    && state.grant.devicePersonId === state.identity.personId
    && state.grant.administratorPersonId === administrator.personId
    && personId === administrator.personId
    && publicKey === administrator.publicKey
  );
}

/** Resolve the exact administrator instance certified by durable UVC provisioning. */
export function resolveUvcAdministratorTrust(
  state: UvcHeadlessProvisioningState,
  publicKey: string,
  credential?: DeviceIdentityCredential,
): QuicVCPeerTrustInfo | null {
  const administrator = state.administrator;
  if (
    !administrator
    || !isUvcAdministratorPeer(state, administrator.personId, publicKey)
    || credential?.id !== administrator.instanceId
    || credential.credentialSubject.id !== administrator.instanceId
    || credential.credentialSubject.personId !== administrator.personId
    || credential.credentialSubject.publicKeyHex !== administrator.publicKey
    || credential.credentialSubject.publicSignKey !== administrator.publicSignKey
    || credential.credentialSubject.signAlgorithm !== administrator.signAlgorithm
  ) {
    return null;
  }
  return {
    personId: administrator.personId as SHA256IdHash<Person>,
    publicKey,
    trustLevel: 'trusted',
  };
}

export function createGroovControlAuthorityAdapter(
  hardwareDeviceId: string,
  controller?: GroovControlAuthorityController,
): UvcAuthorityAdapter {
  const requireController = (deviceId: string): GroovControlAuthorityController => {
    if (deviceId !== hardwareDeviceId) {
      throw new Error(`[UVC Groov control] Command targets unknown hardware device ${deviceId}`);
    }
    if (!controller) {
      throw new Error('[UVC Groov control] Groov Manage authority is not commissioned');
    }
    return controller;
  };
  return {
    read: async deviceId => {
      const state = await requireController(deviceId).readState();
      return {enabled: state.enabled, intensity: state.intensity};
    },
    set: async (deviceId, desired) => {
      const state = await requireController(deviceId).setLight(desired);
      return {enabled: state.enabled, intensity: state.intensity};
    },
  };
}

export interface UvcGroovControlRuntimeOptions {
  manager: QuicVCStreamHost;
  ownerPersonId: SHA256IdHash<Person>;
  ownerInstanceId: SHA256IdHash<Instance>;
  provisioningState: UvcHeadlessProvisioningState;
  env?: NodeJS.ProcessEnv;
}

/** Groov-owned UVC trie executor and optional commissioned hardware authority. */
export class UvcGroovControlRuntime {
  private readonly controlTries = new Map<string, UvcStateTrie>();
  private readonly consumed = new Set<string>();
  private plan?: UvcControlPlan;
  private authorityService?: GroovAuthorityService;
  private disconnectImportListener?: () => void;
  private consumeTail: Promise<void> = Promise.resolve();

  constructor(private readonly options: UvcGroovControlRuntimeOptions) {}

  async start(): Promise<void> {
    if (this.plan) {
      return;
    }
    const {provisioningState: state, ownerPersonId, ownerInstanceId} = this.options;
    if (
      state.status !== 'active'
      || state.deviceKind !== 'groov'
      || !state.administrator
      || !state.grant
      || state.identity.personId !== ownerPersonId
      || state.identity.instanceId !== ownerInstanceId
      || state.grant.devicePersonId !== ownerPersonId
      || state.grant.administratorPersonId !== state.administrator.personId
    ) {
      throw new Error('[UVC Groov control] Active device identity and administrator grant are required');
    }

    const administratorPersonId = state.administrator.personId as SHA256IdHash<Person>;
    const hardwareDeviceId = state.hardwareDeviceId;
    const phoneBook = this.makeTrie(makeUvcPhoneBookTrieRootId({ownerPersonId, ownerInstanceId}));
    const journal = this.makeTrie(makeUvcJournalTrieRootId({ownerPersonId, ownerInstanceId}));
    await Promise.all([phoneBook.init(), journal.init()]);

    let controller: GroovManageLightController | undefined;
    const configuration = resolveGroovAuthorityConfiguration(this.options.env);
    if (configuration.mode === 'commissioned') {
      const runtime = await createGroovAuthorityRuntime({
        quicManager: this.options.manager,
        env: this.options.env,
        authorize: request => {
          const allowed = request.peerPersonId === administratorPersonId
            && request.peerTrustLevel === 'trusted';
          return {
            allowed,
            reason: allowed
              ? 'Durable UVC administrator grant and trusted QUICVC identity match'
              : 'Peer is not the trusted UVC administrator',
          };
        },
      });
      controller = runtime.controller;
      this.authorityService = runtime.service;
      this.authorityService.start();
      console.log('[UVC Groov control] Commissioned Groov Manage authority started');
    } else {
      console.warn('[UVC Groov control] Executor started fail-closed without Groov Manage commissioning');
    }

    this.plan = new UvcControlPlan({
      ownerPersonId,
      ownerInstanceId,
      localDeviceId: hardwareDeviceId,
      phoneBook,
      journal,
      controlFor: personId => this.getControlTrie(personId),
      store: async entry => (await storeUnversionedObject(entry as never)).hash as never,
      load: async hash => await getObject(hash as never) as UvcStateEntry,
      isPaired: personId => personId === administratorPersonId,
      authority: createGroovControlAuthorityAdapter(hardwareDeviceId, controller),
    });
    await this.plan.sharePhoneBookWith(administratorPersonId);
    this.disconnectImportListener = onChumObjectImported.addListener(event => {
      if (
        event.localPersonId !== ownerPersonId
        || event.remotePersonId !== administratorPersonId
        || !isUvcControlCommandImport(event.imported)
      ) {
        return;
      }
      this.consumeTail = this.consumeTail
        .then(() => this.consumeImportedAdministratorCommand(event.imported.hash))
        .catch(error => {
          console.error('[UVC Groov control] Failed to consume imported command:', error);
        });
    });
    console.log('[UVC Groov control] Trie executor started');
  }

  stop(): void {
    this.disconnectImportListener?.();
    this.disconnectImportListener = undefined;
    this.authorityService?.stop();
    this.authorityService = undefined;
    this.plan?.shutdown();
    this.plan = undefined;
    this.controlTries.clear();
    this.consumed.clear();
    this.consumeTail = Promise.resolve();
  }

  private async consumeImportedAdministratorCommand(hash: string): Promise<void> {
    if (!this.plan) {
      throw new Error('[UVC Groov control] Executor is not initialized');
    }
    if (this.consumed.has(hash)) {
      return;
    }
    const source = this.options.provisioningState.administrator!.personId as SHA256IdHash<Person>;
    const entry = await getObject(hash as never) as UvcStateEntry;
    await this.plan.consume(hash as SHA256Hash<UvcStateEntry>, entry, source);
    this.consumed.add(hash);
    console.log(`[UVC Groov control] Consumed command ${hash}`);
  }

  private makeTrie(rootId: string): UvcStateTrie {
    return new UvcStateTrie({
      rootId,
      storage,
      grantRootAccess: async (rootIdHash, personId) => {
        if (personId !== this.options.provisioningState.administrator?.personId) {
          throw new Error('[UVC Groov control] Trie roots may be shared only with the administrator');
        }
        await createAccess([{
          id: rootIdHash,
          person: [personId],
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
      ownerPersonId: this.options.ownerPersonId,
      ownerInstanceId: this.options.ownerInstanceId,
      audiencePersonId: personId,
    }));
    await trie.init();
    this.controlTries.set(personId, trie);
    return trie;
  }
}
