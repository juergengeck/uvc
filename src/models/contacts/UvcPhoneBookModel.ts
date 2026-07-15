import {createAccess} from '@refinio/one.core/lib/access.js';
import {getInstanceIdHash} from '@refinio/one.core/lib/instance.js';
import type {Instance, OneVersionedObjectTypes, Person} from '@refinio/one.core/lib/recipes.js';
import {SET_ACCESS_MODE} from '@refinio/one.core/lib/storage-base-common.js';
import {getObject, storeUnversionedObject} from '@refinio/one.core/lib/storage-unversioned-objects.js';
import {
  getObjectByIdHash,
  storeVersionedObject,
  type VersionedObjectResult,
} from '@refinio/one.core/lib/storage-versioned-objects.js';
import {calculateIdHashOfObj} from '@refinio/one.core/lib/util/object.js';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks.js';
import type ConnectionsModel from '@refinio/one.models/lib/models/ConnectionsModel.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import ProfileModel from '@refinio/one.models/lib/models/Leute/ProfileModel.js';
import SomeoneModel from '@refinio/one.models/lib/models/Leute/SomeoneModel.js';
import {objectEvents} from '@refinio/one.models/lib/misc/ObjectEventDispatcher.js';
import {OEvent} from '@refinio/one.models/lib/misc/OEvent.js';
import type {Profile} from '@refinio/one.models/lib/recipes/Leute/Profile.js';
import type {Signature} from '@refinio/one.models/lib/recipes/SignatureRecipes.js';
import type {TrustKeysCertificate} from '@refinio/one.models/lib/recipes/Certificates/TrustKeysCertificate.js';
import type {AffirmationCertificate} from '@refinio/one.models/lib/recipes/Certificates/AffirmationCertificate.js';
import type {IRoleCertificate} from '../../recipes/RoleCertificate';
import type {VerifiableCredential} from '../../recipes/VerifiableCredential';
import type {Device} from '../../recipes/device';
import {
  createUvcPhoneBook,
  createUvcPhoneBookEntry,
  createUvcPhoneBookIdObject,
  createUvcPhoneBookRegistry,
  createUvcPhoneBookRegistryIdObject,
  type UvcPhoneBook,
  type UvcPhoneBookEntry,
  type UvcPhoneBookRegistry,
} from '../../recipes/UvcPhoneBookRecipes';
import type DeviceModel from '../device/DeviceModel';

type SupportedCertificate =
  | AffirmationCertificate
  | IRoleCertificate
  | TrustKeysCertificate
  | VerifiableCredential;

function sameStringSet(left: Iterable<string>, right: Iterable<string>): boolean {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function isMissingVersionRoot(error: unknown): boolean {
  const candidate = error as {code?: string; name?: string; type?: string} | undefined;
  return (
    candidate?.code === 'SB-READ2'
    || candidate?.name === 'FileNotFoundError'
    || (error instanceof Error && error.message === 'No versions node hashes found')
  );
}

/**
 * Native UVC phone book.
 *
 * The model publishes one deterministic source root per local instance. It
 * grants only that id root to a paired person, and consumes imported roots
 * through ObjectEventDispatcher so CHUM remains a feed-forward data path.
 */
export default class UvcPhoneBookModel {
  public readonly onUpdated = new OEvent<() => void>();

  private readonly importedEntries = new Map<SHA256IdHash<Person>, UvcPhoneBookEntry>();
  private disconnectImport?: () => void;
  private disconnectPairing?: () => void;
  private readonly disconnectSourceChanges: Array<() => void> = [];
  private publishChain: Promise<void> = Promise.resolve();
  private ownerPersonId?: SHA256IdHash<Person>;
  private ownerInstanceId?: SHA256IdHash<Instance>;

  constructor(
    private readonly leuteModel: LeuteModel,
    private readonly deviceModel: DeviceModel,
    private readonly connectionsModel: ConnectionsModel,
  ) {}

  async init(): Promise<void> {
    this.ownerPersonId = await this.leuteModel.myMainIdentity();
    const instanceId = getInstanceIdHash();
    if (!instanceId) {
      throw new Error('[UvcPhoneBook] Instance id is unavailable');
    }
    this.ownerInstanceId = instanceId;

    this.disconnectImport = objectEvents.onNewVersion(
      result => this.handlePhoneBookVersion(result as VersionedObjectResult<UvcPhoneBook>),
      'UvcPhoneBookModel: imported root',
      'UvcPhoneBook',
    );

    this.disconnectPairing = this.connectionsModel.pairing.onPairingSuccess.listen(
      async (
        _isOutgoing: boolean,
        _localPersonId: SHA256IdHash<Person>,
        _localInstanceId: SHA256IdHash<Instance>,
        remotePersonId: SHA256IdHash<Person>,
      ) => {
        await this.publishTo(remotePersonId);
      },
    );

    this.disconnectSourceChanges.push(
      this.leuteModel.onProfileUpdate.listen(() => this.queuePublishToActivePeers()),
      this.leuteModel.onMeIdentitiesChange.listen(() => this.queuePublishToActivePeers()),
      this.deviceModel.onDeviceOwnershipChanged.listen(() => this.queuePublishToActivePeers()),
      objectEvents.onUnversionedObject(
        () => this.queuePublishToActivePeers(true),
        'UvcPhoneBookModel: certificate source changed',
        'Signature',
      ),
    );

    await this.restoreImportedRoots();
  }

  async shutdown(): Promise<void> {
    this.disconnectImport?.();
    this.disconnectPairing?.();
    this.disconnectImport = undefined;
    this.disconnectPairing = undefined;
    for (const disconnect of this.disconnectSourceChanges.splice(0)) {
      disconnect();
    }
    await this.publishChain;
    this.importedEntries.clear();
  }

  getKnownPerson(personId: SHA256IdHash<Person>): UvcPhoneBookEntry | undefined {
    return this.importedEntries.get(personId);
  }

  getKnownPeople(): UvcPhoneBookEntry[] {
    return [...this.importedEntries.values()];
  }

  private queuePublishToActivePeers(refreshTrust = false): Promise<void> {
    const publish = this.publishChain.then(async () => {
      if (refreshTrust) {
        await this.leuteModel.trust.refreshCaches();
      }
      for (const personId of this.connectionsModel.getActiveConnectionPersonIds()) {
        await this.publishTo(personId);
      }
    });
    // A failed projection must be visible to its caller, but it must not poison
    // the serialization chain and prevent a later, valid source change.
    this.publishChain = publish.then(() => undefined, () => undefined);
    return publish;
  }

  async publishTo(remotePersonId: SHA256IdHash<Person>): Promise<VersionedObjectResult<UvcPhoneBook>> {
    const {ownerPersonId, ownerInstanceId} = this.requireOwner();
    const rootId = await calculateIdHashOfObj(createUvcPhoneBookIdObject({
      ownerPersonId,
      ownerInstanceId,
    })) as SHA256IdHash<UvcPhoneBook>;

    // The deterministic id is the complete sharing boundary. Grant it before
    // storing a new version so the semantic version wakeup is immediately
    // visible to an already-connected CHUM peer.
    await createAccess([{
      id: rootId,
      person: [remotePersonId],
      hashGroup: [],
      mode: SET_ACCESS_MODE.ADD,
    }]);

    const entries = await this.collectEntries();
    const entryHashes = new Set<SHA256Hash<UvcPhoneBookEntry>>();
    for (const entry of entries) {
      const stored = await storeUnversionedObject(entry);
      entryHashes.add(stored.hash as SHA256Hash<UvcPhoneBookEntry>);
    }

    return await storeVersionedObject(createUvcPhoneBook({
      ownerPersonId,
      ownerInstanceId,
      entries: entryHashes,
    })) as VersionedObjectResult<UvcPhoneBook>;
  }

  private requireOwner(): {
    ownerPersonId: SHA256IdHash<Person>;
    ownerInstanceId: SHA256IdHash<Instance>;
  } {
    if (!this.ownerPersonId || !this.ownerInstanceId) {
      throw new Error('[UvcPhoneBook] model is not initialized');
    }
    return {ownerPersonId: this.ownerPersonId, ownerInstanceId: this.ownerInstanceId};
  }

  private async loadVersion<T extends OneVersionedObjectTypes>(
    idHash: SHA256IdHash<T>,
  ): Promise<VersionedObjectResult<T> | undefined> {
    try {
      return await getObjectByIdHash(idHash as never) as VersionedObjectResult<T>;
    } catch (error) {
      if (isMissingVersionRoot(error)) {
        return undefined;
      }
      throw error;
    }
  }

  private async collectEntries(): Promise<UvcPhoneBookEntry[]> {
    const [me, others, devices] = await Promise.all([
      this.leuteModel.me(),
      this.leuteModel.others(),
      this.deviceModel.getDevices(),
    ]);
    const someones = [me, ...others];
    const result: UvcPhoneBookEntry[] = [];

    for (const someone of someones) {
      for (const subjectPersonId of someone.identities()) {
        const profileModels = await someone.profiles(subjectPersonId);
        const profiles = profileModels
          .map(profile => profile.loadedVersion)
          .filter((hash): hash is SHA256Hash<Profile> => hash !== undefined);

        const trustCertifications = new Set<SHA256Hash<Signature>>();
        for (const profile of profiles) {
          for (const certificateType of ['TrustKeysCertificate', 'AffirmationCertificate'] as const) {
            const certificates = await this.leuteModel.trust.getCertificatesOfType(
              profile,
              certificateType,
            );
            for (const certificate of certificates) {
              if (certificate.trusted) {
                trustCertifications.add(certificate.signatureHash);
              }
            }
          }
        }

        // A phone-book entry is not a claim by fiat. Without trusted-key
        // or affirmation evidence it is not publishable to another UVC instance.
        if (profiles.length === 0 || trustCertifications.size === 0) {
          continue;
        }

        const roleCertifications = new Set<SHA256Hash<Signature>>();
        const roleCertificates = await this.leuteModel.trust.getCertificatesOfType(
          subjectPersonId,
          'RoleCertificate' as any,
        );
        for (const certificate of roleCertificates) {
          if (certificate.trusted) {
            roleCertifications.add(certificate.signatureHash);
          }
        }

        const ownedDevices = devices.filter(device => (
          device.owner === subjectPersonId && device.hasValidCredential
        ));
        const deviceIds = new Set<SHA256IdHash>();
        const deviceCertifications = new Set<SHA256Hash<Signature>>();
        for (const device of ownedDevices) {
          if (!device.credential) {
            throw new Error(
              `[UvcPhoneBook] certified device ${device.deviceId} has no durable certificate root`,
            );
          }
          const certificate = await this.verifyCertificate(device.credential, 'VerifiableCredential');
          const credential = certificate as VerifiableCredential;
          if (
            credential.credentialType !== 'DeviceOwnership'
            || credential.issuer !== subjectPersonId
            || credential.revoked
            || (credential.validUntil !== undefined && credential.validUntil <= Date.now())
          ) {
            throw new Error(`[UvcPhoneBook] device ${device.deviceId} has invalid ownership evidence`);
          }
          deviceIds.add(await calculateIdHashOfObj({
            $type$: 'Device',
            owner: device.owner,
            name: device.name,
          } as any) as SHA256IdHash);
          deviceCertifications.add(device.credential);
        }

        result.push(createUvcPhoneBookEntry({
          subjectPersonId,
          profiles,
          trustCertifications,
          roleCertifications,
          devices: deviceIds,
          deviceCertifications,
        }));
      }
    }

    return result;
  }

  private async handlePhoneBookVersion(result: VersionedObjectResult<UvcPhoneBook>): Promise<void> {
    const {ownerInstanceId} = this.requireOwner();
    if (result.obj.ownerInstanceId === ownerInstanceId) {
      return;
    }
    await this.projectImportedRoot(result);
    await this.rememberImportedRoot(result.idHash);
  }

  private async projectImportedRoot(result: VersionedObjectResult<UvcPhoneBook>): Promise<void> {
    await this.leuteModel.trust.refreshCaches();
    for (const entryHash of result.obj.entries) {
      const entry = await getObject(entryHash);
      if (entry.$type$ !== 'UvcPhoneBookEntry') {
        throw new Error(`[UvcPhoneBook] root references unexpected entry type ${entry.$type$}`);
      }
      const projectedEntry = entry as UvcPhoneBookEntry;
      const validatedEntry = createUvcPhoneBookEntry({
        subjectPersonId: projectedEntry.subjectPersonId,
        profiles: projectedEntry.profiles,
        trustCertifications: projectedEntry.trustCertifications,
        roleCertifications: projectedEntry.roleCertifications,
        devices: projectedEntry.devices,
        deviceCertifications: projectedEntry.deviceCertifications,
      });
      await this.projectEntry(validatedEntry);
    }
    await this.leuteModel.trust.refreshCaches();
    await this.onUpdated.emitAll();
  }

  private async projectEntry(entry: UvcPhoneBookEntry): Promise<void> {
    const profiles: ProfileModel[] = [];
    for (const profileHash of entry.profiles) {
      const profile = await ProfileModel.constructFromVersion(profileHash);
      if (profile.personId !== entry.subjectPersonId) {
        throw new Error(
          `[UvcPhoneBook] profile ${profileHash} belongs to another Person`,
        );
      }
      profiles.push(profile);
    }

    const profileHashes = new Set(entry.profiles);
    for (const signatureHash of entry.trustCertifications) {
      const certificate = await this.verifyCertificate(
        signatureHash,
        ['TrustKeysCertificate', 'AffirmationCertificate'],
      );
      const certifiedProfile = certificate.$type$ === 'TrustKeysCertificate'
        ? certificate.profile
        : certificate.$type$ === 'AffirmationCertificate'
          ? certificate.data
          : undefined;
      if (!certifiedProfile) {
        throw new Error('[UvcPhoneBook] unsupported trust certificate type');
      }
      if (!profileHashes.has(certifiedProfile as SHA256Hash<Profile>)) {
        throw new Error('[UvcPhoneBook] trust certificate does not certify an entry profile');
      }
    }
    for (const signatureHash of entry.roleCertifications) {
      const certificate = await this.verifyCertificate(signatureHash, 'RoleCertificate');
      if ((certificate as IRoleCertificate).person !== entry.subjectPersonId) {
        throw new Error('[UvcPhoneBook] role certificate belongs to another Person');
      }
    }
    const certifiedDeviceIds = new Set<SHA256IdHash>();
    for (const signatureHash of entry.deviceCertifications) {
      const certificate = await this.verifyCertificate(signatureHash, 'VerifiableCredential');
      const credential = certificate as VerifiableCredential;
      if (
        credential.credentialType !== 'DeviceOwnership'
        || credential.issuer !== entry.subjectPersonId
        || credential.revoked
        || (credential.validUntil !== undefined && credential.validUntil <= Date.now())
      ) {
        throw new Error('[UvcPhoneBook] invalid device ownership credential');
      }
      const certifiedDevice = await getObject(credential.subject) as unknown as Device;
      const certifiedDeviceId = await calculateIdHashOfObj({
        $type$: 'Device',
        owner: certifiedDevice.owner,
        name: certifiedDevice.name,
      } as any) as SHA256IdHash;
      if (!entry.devices.has(certifiedDeviceId) || certifiedDevice.owner !== entry.subjectPersonId) {
        throw new Error('[UvcPhoneBook] device credential belongs to another device or Person');
      }
      certifiedDeviceIds.add(certifiedDeviceId);
    }
    if (!sameStringSet(entry.devices, certifiedDeviceIds)) {
      throw new Error('[UvcPhoneBook] every device requires matching ownership evidence');
    }

    let someone = await this.leuteModel.getSomeone(entry.subjectPersonId);
    if (!someone) {
      const mainProfile = profiles.find(profile => profile.owner === profile.personId) ?? profiles[0];
      someone = await SomeoneModel.constructWithNewSomeone(
        this.leuteModel,
        `uvc-phonebook:${entry.subjectPersonId}`,
        mainProfile,
      );
      await this.leuteModel.addSomeoneElse(someone.idHash);
    }

    const existingProfiles = new Set(
      (await someone.profiles(entry.subjectPersonId)).map(profile => profile.idHash),
    );
    for (const profile of profiles) {
      if (!existingProfiles.has(profile.idHash)) {
        await someone.addProfile(profile.idHash);
      }
    }

    const existingEntry = this.importedEntries.get(entry.subjectPersonId);
    this.importedEntries.set(entry.subjectPersonId, existingEntry
      ? createUvcPhoneBookEntry({
          subjectPersonId: entry.subjectPersonId,
          profiles: new Set([...existingEntry.profiles, ...entry.profiles]),
          trustCertifications: new Set([
            ...existingEntry.trustCertifications,
            ...entry.trustCertifications,
          ]),
          roleCertifications: new Set([
            ...existingEntry.roleCertifications,
            ...entry.roleCertifications,
          ]),
          devices: new Set([...existingEntry.devices, ...entry.devices]),
          deviceCertifications: new Set([
            ...existingEntry.deviceCertifications,
            ...entry.deviceCertifications,
          ]),
        })
      : entry);
  }

  private async verifyCertificate(
    signatureHash: SHA256Hash<Signature>,
    expectedType: SupportedCertificate['$type$'] | SupportedCertificate['$type$'][],
  ): Promise<SupportedCertificate> {
    const signature = await getObject(signatureHash) as Signature;
    if (signature.$type$ !== 'Signature') {
      throw new Error(`[UvcPhoneBook] ${signatureHash} is not a Signature`);
    }
    if (!await this.leuteModel.trust.verifySignatureWithTrustedKeys(signature)) {
      throw new Error(`[UvcPhoneBook] certificate signature ${signatureHash} is not trusted`);
    }
    const certificate = await getObject(signature.data) as unknown as SupportedCertificate;
    const expectedTypes = Array.isArray(expectedType) ? expectedType : [expectedType];
    if (!expectedTypes.includes(certificate.$type$)) {
      throw new Error(
        `[UvcPhoneBook] expected ${expectedTypes.join(' or ')}, received ${certificate.$type$}`,
      );
    }
    return certificate;
  }

  private async rememberImportedRoot(sourceId: SHA256IdHash<UvcPhoneBook>): Promise<void> {
    const {ownerPersonId, ownerInstanceId} = this.requireOwner();
    const registryId = await calculateIdHashOfObj(createUvcPhoneBookRegistryIdObject({
      ownerPersonId,
      ownerInstanceId,
    })) as SHA256IdHash<UvcPhoneBookRegistry>;
    const existing = await this.loadVersion<UvcPhoneBookRegistry>(registryId);
    await storeVersionedObject(createUvcPhoneBookRegistry({
      ownerPersonId,
      ownerInstanceId,
      sources: new Set([...(existing?.obj.sources ?? []), sourceId]),
    }));
  }

  private async restoreImportedRoots(): Promise<void> {
    const {ownerPersonId, ownerInstanceId} = this.requireOwner();
    const registryId = await calculateIdHashOfObj(createUvcPhoneBookRegistryIdObject({
      ownerPersonId,
      ownerInstanceId,
    })) as SHA256IdHash<UvcPhoneBookRegistry>;
    const registry = await this.loadVersion<UvcPhoneBookRegistry>(registryId);
    if (!registry) {
      return;
    }
    for (const sourceId of registry.obj.sources) {
      const source = await this.loadVersion<UvcPhoneBook>(sourceId);
      if (!source) {
        throw new Error(`[UvcPhoneBook] registry references missing source ${sourceId}`);
      }
      await this.projectImportedRoot(source);
    }
  }
}

export {sameStringSet};
