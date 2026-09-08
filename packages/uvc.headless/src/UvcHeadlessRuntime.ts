import {resolveUvcBootstrapCredentials} from './bootstrap-credentials.js';
import os from 'node:os';
import path from 'node:path';
import {
  UVC_RECIPES, isUvcChumSyncType, UvcStateTrie,
  makeUvcJournalTrieRootId, makeUvcProvisioningTrieRootId,
  type UvcJournalEvent, type UvcStateEntry,
} from '@refinio/uvc.core';
import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks.js';
import type {Instance, Person} from '@refinio/one.core/lib/recipes.js';
import {storeVersionedObject, getObjectByIdHash, getCurrentVersionHash} from '@refinio/one.core/lib/storage-versioned-objects.js';
import {storeUnversionedObject, getObject} from '@refinio/one.core/lib/storage-unversioned-objects.js';
import {calculateIdHashOfObj} from '@refinio/one.core/lib/util/object.js';
import type {OneCoreTrieStorageDeps} from '@refinio/trie.core';
import {createPublicKeyTrustVerifier} from '@vger/vger.core/services/index.js';
import type {ServerConfig} from '@vger/vger.headless/dist/types.js';
import type {HeadlessRuntimeExtension, HeadlessRuntimeContext, HeadlessAuthenticationContext} from '@vger/vger.headless/dist/runtime-extension.js';
import {UvcGroovProvisioningRuntime} from './services/UvcGroovProvisioningRuntime.js';
import {UvcGroovControlRuntime, isUvcAdministratorPeer, resolveUvcAdministratorTrust} from './services/UvcGroovControlRuntime.js';
import {loadUvcHeadlessProvisioningState, activateUvcHeadlessProvisioningState, type UvcHeadlessProvisioningState} from './services/UvcHeadlessProvisioningState.js';

export class UvcHeadlessRuntime implements HeadlessRuntimeExtension {
  readonly recipes = UVC_RECIPES;
  private uvcGroovProvisioningRuntime: UvcGroovProvisioningRuntime | null = null;
  private uvcGroovControlRuntime: UvcGroovControlRuntime | null = null;

  constructor(readonly stateFile: string, private state: UvcHeadlessProvisioningState | null) {}

  async authenticate({authenticator, email, instanceName, password, isRegistered}: HeadlessAuthenticationContext): Promise<void> {
    if (!isRegistered && this.state?.status === 'ready') {
      const secrets = this.state.identity.secrets;
      if (!secrets) throw new Error('[UVC provisioning] Ready identity is missing device-generated secret keys');
      await authenticator.registerWithIdentityKeys(secrets, {email, instanceName, secret: password});
    } else {
      await authenticator.loginOrRegister(email, password, instanceName);
    }
  }

  verifyIdentity(personId: string, instanceId: string): void {
    if (this.state?.status === 'ready' || this.state?.status === 'active') {
      if (personId !== this.state.identity.personId || instanceId !== this.state.identity.instanceId) {
        throw new Error('[UVC provisioning] Imported ONE identity does not match the certified device identity');
      }
    }
  }

  acceptsPeerKey(personId: string, publicKey: string): boolean {
    return this.state?.status === 'active' && isUvcAdministratorPeer(this.state, personId, publicKey);
  }

  async start(context: HeadlessRuntimeContext): Promise<void> {
    const {core, config, manager, trustModel} = context;
    const normalTrustVerifier = createPublicKeyTrustVerifier(trustModel);
    const stateFile = this.stateFile;
    if (this.state?.status === 'ready') {
      await this.activateUvcProvisionedIdentity(
        core,
        trustModel,
        stateFile,
        this.state,
      );
    }
    if (config.deviceType === 'groov' && this.state?.status !== 'active') {
      this.uvcGroovProvisioningRuntime?.stop();
      const hardwareDeviceId = process.env.UVC_HARDWARE_DEVICE_ID?.trim() || os.hostname().split('.')[0]!;
      this.uvcGroovProvisioningRuntime = new UvcGroovProvisioningRuntime({
        manager,
        hardwareDeviceId,
        displayName: hardwareDeviceId,
        port: config.quicvcPort!,
        stateFile,
        onProvisioned: () => {
          console.log('[UVC provisioning] Ceremony complete; restarting into assigned identity');
          // The deployment unit uses Restart=on-failure. Exit with a
          // dedicated restart code after the grant response is flushed.
          setTimeout(() => process.exit(75), 750);
        },
      });
      manager.setTrustVerifier({
        getTrustForPublicKey: async (publicKey, credential) => (
          await normalTrustVerifier.getTrustForPublicKey(publicKey, credential)
          ?? this.uvcGroovProvisioningRuntime?.resolveBootstrapTrust(publicKey, credential)
          ?? null
        ),
      });
      await this.uvcGroovProvisioningRuntime.start();
    } else {
      const activeProvisioning = config.deviceType === 'groov'
        && this.state?.status === 'active'
        ? this.state
        : undefined;
      manager.setTrustVerifier(activeProvisioning ? {
        getTrustForPublicKey: async (publicKey, credential) => (
          resolveUvcAdministratorTrust(activeProvisioning, publicKey, credential)
          ?? await normalTrustVerifier.getTrustForPublicKey(publicKey, credential)
        ),
      } : normalTrustVerifier);
    }
    console.log('[VgerHeadlessServer] TrustVerifier wired');

    if (
      config.deviceType === 'groov'
      && this.state?.status === 'active'
      && core.instanceId
    ) {
      const activeProvisioning = this.state;
      // A commissioned UVC device has exactly one durable administrator.
      // Admit that certified person/key tuple to the direct CHUM lane even
      // when the generic Glue peer-demand matcher has no Groov route.
      const connectionModule = context.connectionModule;
      connectionModule?.setDirectPeerSyncMatcher((personId, publicKey) => (
        isUvcAdministratorPeer(activeProvisioning, personId, publicKey)
      ));
      connectionModule?.setChumSyncTypeScope((personId, type) => (
        personId === activeProvisioning.administrator?.personId
          ? isUvcChumSyncType(type)
          : undefined
      ));
      connectionModule?.addChumSyncRuntimeObjectTypes({
        priorityWakeupObjectTypes: ['UvcStateTrieRoot'],
        connectedAfterProtocolReady: true,
        connectedAfterPriorityObjectTypes: ['UvcStateTrieRoot'],
        traceObjectTypes: ['UvcStateTrieRoot'],
        importBatchContextObjectTypes: ['UvcStateTrieRoot'],
      });
      this.uvcGroovControlRuntime?.stop();
      this.uvcGroovControlRuntime = new UvcGroovControlRuntime({
        manager,
        ownerPersonId: core.ownerId as SHA256IdHash<Person>,
        ownerInstanceId: core.instanceId as SHA256IdHash<Instance>,
        provisioningState: this.state,
      });
      await this.uvcGroovControlRuntime.start();
    }

  }

  private async activateUvcProvisionedIdentity(
    core: HeadlessRuntimeContext['core'],
    trustModel: HeadlessRuntimeContext['trustModel'],
    stateFile: string,
    state: UvcHeadlessProvisioningState,
  ): Promise<void> {
    if (!core.ownerId || !core.instanceId || !state.administrator || !state.grant || !state.grantHash) {
      throw new Error('[UVC provisioning] Cannot activate an incomplete assigned identity');
    }
    if (
      String(core.ownerId) !== state.identity.personId
      || String(core.instanceId) !== state.identity.instanceId
      || state.grant.devicePersonId !== state.identity.personId
      || state.grant.administratorPersonId !== state.administrator.personId
    ) {
      throw new Error('[UVC provisioning] Assigned identity or administrator grant does not match the active ONE instance');
    }

    const storedGrant = await storeUnversionedObject(state.grant as never);
    if (String(storedGrant.hash) !== state.grantHash) {
      throw new Error('[UVC provisioning] Durable administrator grant hash does not match its certified hash');
    }

    const trieStorage: OneCoreTrieStorageDeps = {
      storeVersionedObject: async object => await storeVersionedObject(object as never) as never,
      getObjectByIdHash: async idHash => await getObjectByIdHash(idHash as never) as never,
      calculateIdHashOfObj: async object => await calculateIdHashOfObj(object as never) as string,
      getCurrentVersionHash: async idHash => await getCurrentVersionHash(idHash as never) as string,
      getObject: async hash => await getObject(hash as never) as never,
    };
    const provisioning = new UvcStateTrie({
      rootId: makeUvcProvisioningTrieRootId({
        ownerPersonId: core.ownerId,
        ownerInstanceId: core.instanceId as SHA256IdHash<Instance>,
      }),
      storage: trieStorage,
    });
    const journal = new UvcStateTrie({
      rootId: makeUvcJournalTrieRootId({
        ownerPersonId: core.ownerId,
        ownerInstanceId: core.instanceId as SHA256IdHash<Instance>,
      }),
      storage: trieStorage,
    });
    await Promise.all([provisioning.init(), journal.init()]);
    await provisioning.append(storedGrant.hash as never, state.grant);
    const journalEvent: UvcJournalEvent = {
      $type$: 'UvcJournalEvent',
      eventId: `${core.instanceId}:journal:admin-granted:${state.grant.grantedAt}:activation`,
      actorPersonId: core.ownerId,
      actorInstanceId: core.instanceId as SHA256IdHash<Instance>,
      eventType: 'admin-granted',
      deviceId: state.hardwareDeviceId,
      evidence: storedGrant.hash as never,
      recordedAt: state.grant.grantedAt,
    };
    const storedJournal = await storeUnversionedObject(journalEvent as never);
    await journal.append(storedJournal.hash as never, journalEvent as UvcStateEntry);

    await trustModel.setTrustForPublicKey(
      state.administrator.publicKey,
      'UVC administrator',
      'trusted',
      'trusted',
      state.administrator.personId,
    );
    this.state = activateUvcHeadlessProvisioningState(stateFile, state);
    console.log(`[UVC provisioning] Activated assigned identity and administrator ${state.administrator.personId.substring(0, 12)}…`);
  }

  stop(): void {
    this.uvcGroovProvisioningRuntime?.stop();
    this.uvcGroovProvisioningRuntime = null;
    this.uvcGroovControlRuntime?.stop();
    this.uvcGroovControlRuntime = null;
  }
}

export function configureUvcHeadless(config: ServerConfig, provisioningStateFile?: string): ServerConfig {
  const stateFile = path.resolve(provisioningStateFile ?? process.env.UVC_PROVISIONING_STATE_FILE
    ?? path.join(path.dirname(config.storageDir ?? './vger-data'), 'uvc-provisioning-state.json'));
  const state = loadUvcHeadlessProvisioningState(stateFile);
  const assigned = state?.status === 'ready' || state?.status === 'active';
  const credentials = resolveUvcBootstrapCredentials(config, assigned);
  return {
    ...config,
    ...credentials,
    deviceType: 'groov',
    runtimeProfile: 'control-appliance',
    runtimeExtension: new UvcHeadlessRuntime(stateFile, state),
    ...(assigned ? {email: state.identity.email, name: state.identity.instanceName} : {discoveryEnabled: false}),
  };
}
