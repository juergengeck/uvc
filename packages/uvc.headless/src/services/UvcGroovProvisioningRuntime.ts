import {createPublicKey, randomUUID, verify as verifyNodeSignature} from 'node:crypto';

import nacl from 'tweetnacl';
import {
  UvcHeadlessProvisioningDevice,
  UvcStateTrie,
  type UvcStateEntry,
} from '@refinio/uvc.core';
import {ensurePublicSignKey, signatureVerify} from '@refinio/one.core/lib/crypto/sign.js';
import {calculateHashOfObj, calculateIdHashOfObj} from '@refinio/one.core/lib/util/object.js';
import type {Instance, Person} from '@refinio/one.core/lib/recipes.js';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks.js';
import type {
  DeviceIdentityCredential,
  PeerTrustInfo,
  QuicVCConnectionManager,
} from '@refinio/connection.core';
import {
  GroovProvisioningDiscovery,
  GroovProvisioningService,
  type GroovVerifiedProvisioningPeer,
} from '@uvc/groov-authority';

import {
  loadUvcHeadlessProvisioningState,
  storeUvcHeadlessProvisioningState,
  type UvcHeadlessProvisioningState,
} from './UvcHeadlessProvisioningState.js';

export interface UvcGroovProvisioningRuntimeOptions {
  manager: QuicVCConnectionManager;
  hardwareDeviceId: string;
  displayName: string;
  port: number;
  stateFile: string;
  onProvisioned?: () => void | Promise<void>;
}

/** Device-owned first-claim runtime for a headless Groov. */
export class UvcGroovProvisioningRuntime {
  private readonly peers = new Map<string, GroovVerifiedProvisioningPeer>();
  private readonly objects = new Map<string, UvcStateEntry>();
  private discovery?: GroovProvisioningDiscovery;
  private service?: GroovProvisioningService;
  private pendingState?: UvcHeadlessProvisioningState;

  constructor(private readonly options: UvcGroovProvisioningRuntimeOptions) {}

  isProvisioned(): boolean {
    return loadUvcHeadlessProvisioningState(this.options.stateFile)?.status === 'active';
  }

  resolveBootstrapTrust(
    publicKey: string,
    credential?: DeviceIdentityCredential,
  ): PeerTrustInfo | null {
    if (this.isProvisioned()) {
      return null;
    }
    const subject = credential?.credentialSubject;
    if (
      !subject
      || subject.publicKeyHex !== publicKey
      || !subject.personId
      || !subject.id
      || !subject.publicSignKey
      || !subject.signAlgorithm
    ) {
      return null;
    }
    return {
      personId: subject.personId,
      publicKey,
      trustLevel: 'low',
    };
  }

  async start(): Promise<void> {
    if (this.isProvisioned() || this.service) {
      return;
    }
    const ownCredential = this.options.manager.ownCredential;
    if (!ownCredential?.credentialSubject.publicKeyHex) {
      throw new Error('[UVC provisioning] QUICVC bootstrap credential is unavailable');
    }

    const evidence = new UvcStateTrie({rootId: `uvc:bootstrap:evidence:${this.options.hardwareDeviceId}`});
    const journal = new UvcStateTrie({rootId: `uvc:bootstrap:journal:${this.options.hardwareDeviceId}`});
    await Promise.all([evidence.init(), journal.init()]);

    const device = new UvcHeadlessProvisioningDevice({
      hardwareDeviceId: this.options.hardwareDeviceId,
      deviceKind: 'groov',
      createAssignedIdentity: async ({email, instanceName}) => {
        const personEncryption = nacl.box.keyPair();
        const personSigning = nacl.sign.keyPair();
        const instanceEncryption = nacl.box.keyPair();
        const instanceSigning = nacl.sign.keyPair();
        const personId = await calculateIdHashOfObj({$type$: 'Person', email}) as SHA256IdHash<Person>;
        const instanceId = await calculateIdHashOfObj({
          $type$: 'Instance',
          name: instanceName,
          owner: personId,
        }) as SHA256IdHash<Instance>;
        const publicKey = Buffer.from(instanceEncryption.publicKey).toString('hex');
        const publicSignKey = Buffer.from(instanceSigning.publicKey).toString('base64');

        this.pendingState = {
          version: 1,
          status: 'pending',
          hardwareDeviceId: this.options.hardwareDeviceId,
          deviceKind: 'groov',
          identity: {
            email,
            instanceName,
            personId,
            instanceId,
            publicKey,
            publicSignKey,
            signAlgorithm: 'ed25519',
            secrets: {
              personSecretEncryptionKey: Buffer.from(personEncryption.secretKey).toString('base64'),
              personSecretSignKey: Buffer.from(personSigning.secretKey).toString('base64'),
              instanceSecretEncryptionKey: Buffer.from(instanceEncryption.secretKey).toString('base64'),
              instanceSecretSignKey: Buffer.from(instanceSigning.secretKey).toString('base64'),
            },
          },
          updatedAt: Date.now(),
        };
        storeUvcHeadlessProvisioningState(this.options.stateFile, this.pendingState);

        return {
          personId,
          instanceId,
          publicKey,
          publicSignKey,
          signAlgorithm: 'ed25519' as const,
          sign: (payload: Uint8Array) => Buffer.from(
            nacl.sign.detached(payload, instanceSigning.secretKey),
          ).toString('base64'),
        };
      },
      persistAdministrator: async (grantHash, grant) => {
        if (!this.pendingState) {
          throw new Error('[UVC provisioning] Assigned identity was not staged');
        }
        const administrator = this.peers.get(grant.administratorPersonId);
        if (!administrator) {
          throw new Error('[UVC provisioning] Administrator is not the authenticated bootstrap peer');
        }
        this.pendingState = {
          ...this.pendingState,
          status: 'ready',
          administrator,
          grant,
          grantHash,
          updatedAt: Date.now(),
        };
        storeUvcHeadlessProvisioningState(this.options.stateFile, this.pendingState);
      },
      persistence: {
        evidence,
        journal,
        store: async entry => {
          const hash = await calculateHashOfObj(entry as never) as SHA256Hash<UvcStateEntry>;
          this.objects.set(hash, entry);
          return hash;
        },
        load: async hash => {
          const entry = this.objects.get(hash);
          if (!entry) throw new Error(`[UVC provisioning] Missing bootstrap evidence ${hash}`);
          return entry;
        },
      },
      verify: verifyProvisioningSignature,
      randomChallenge: randomUUID,
    });

    this.service = new GroovProvisioningService(this.options.manager, device, {
      onPeerVerified: peer => this.peers.set(peer.personId, peer),
      onProvisioned: async () => {
        this.discovery?.stop();
        await this.options.onProvisioned?.();
      },
    });
    this.service.start();
    this.discovery = new GroovProvisioningDiscovery({
      hardwareDeviceId: this.options.hardwareDeviceId,
      bootstrapPublicKey: ownCredential.credentialSubject.publicKeyHex,
      displayName: this.options.displayName,
      port: this.options.port,
    });
    this.discovery.start();
    console.log(`[UVC provisioning] Advertising ${this.options.hardwareDeviceId} for first claim`);
  }

  stop(): void {
    this.discovery?.stop();
    this.discovery = undefined;
    this.service?.stop();
    this.service = undefined;
  }
}

function verifyProvisioningSignature(
  payload: Uint8Array,
  signature: string,
  publicSignKey: string,
  algorithm: 'ed25519' | 'ecdsa-p256-sha256',
): boolean {
  if (algorithm === 'ecdsa-p256-sha256') {
    return verifyNodeSignature(
      'sha256',
      payload,
      createPublicKey(publicSignKey),
      Buffer.from(signature, 'base64'),
    );
  }
  return signatureVerify(
    payload,
    Buffer.from(signature, 'base64'),
    ensurePublicSignKey(Buffer.from(publicSignKey, 'base64')),
  );
}
