import {createAccess} from '@refinio/one.core/lib/access.js';
import {isIdAccessibleBy} from '@refinio/one.core/lib/accessManager.js';
import {calculateIdHashForStoredObj} from '@refinio/one.core/lib/microdata-to-id-hash.js';
import type {Access, IdAccess, Person} from '@refinio/one.core/lib/recipes.js';
import {
  getAllEntries,
  getOnlyLatestReferencingObjsHashAndId,
} from '@refinio/one.core/lib/reverse-map-query.js';
import {SET_ACCESS_MODE} from '@refinio/one.core/lib/storage-base-common.js';
import {getObject} from '@refinio/one.core/lib/storage-unversioned-objects.js';
import {
  getIdObject,
  getObjectByIdHash,
} from '@refinio/one.core/lib/storage-versioned-objects.js';
import {calculateIdHashOfObj} from '@refinio/one.core/lib/util/object.js';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks.js';

interface LatestGrantReference<T extends Access | IdAccess> {
  hash: SHA256Hash<T>;
  idHash: SHA256IdHash<T>;
  source: string;
}

/**
 * Revoke latest Access grants whose concrete target has been deleted.
 *
 * The producer owns this invariant. A dangling Access must be replaced before
 * networking starts because CHUM's accessible-root enumeration is deliberately
 * strict and cannot export a graph whose declared root is absent.
 */
export async function revokeDanglingAccessGrantsForPeople(
  people: Iterable<SHA256IdHash<Person>>,
): Promise<number> {
  const peerIds = [...people];
  const accessRefs = new Map<string, LatestGrantReference<Access>>();
  const idAccessRefs = new Map<string, LatestGrantReference<IdAccess>>();
  for (const personId of peerIds) {
    for (const ref of await getOnlyLatestReferencingObjsHashAndId(personId, 'Access')) {
      accessRefs.set(ref.hash, {...ref, source: `person ${personId}`});
    }
    for (const ref of await getOnlyLatestReferencingObjsHashAndId(personId, 'IdAccess')) {
      idAccessRefs.set(ref.hash, {...ref, source: `person ${personId}`});
    }
    for (const hashGroup of await getAllEntries(personId, 'HashGroup')) {
      for (const ref of await getOnlyLatestReferencingObjsHashAndId(hashGroup, 'Access')) {
        accessRefs.set(ref.hash, {...ref, source: `hash group ${hashGroup}`});
      }
      for (const ref of await getOnlyLatestReferencingObjsHashAndId(hashGroup, 'IdAccess')) {
        idAccessRefs.set(ref.hash, {...ref, source: `hash group ${hashGroup}`});
      }
    }
  }

  let revoked = 0;
  for (const ref of accessRefs.values()) {
    const access = await getObject(ref.hash) as Access;
    await assertReferenceIdentity(ref, access);
    try {
      await calculateIdHashForStoredObj(access.object as never);
    } catch (error) {
      if (!isMissingStoredObjectError(error)) {
        throw error;
      }
      console.warn(
        `[AccessIntegrity] Revoking dangling Access ${ref.hash} from ${ref.source} `
        + `to missing object ${access.object}`,
      );
      await createAccess([{
        object: access.object,
        person: [],
        hashGroup: [],
        mode: SET_ACCESS_MODE.REPLACE,
      }]);
      revoked += 1;
    }
  }
  for (const ref of idAccessRefs.values()) {
    const access = await getObject(ref.hash) as IdAccess;
    await assertReferenceIdentity(ref, access);
    try {
      await getIdObject(access.id);
    } catch (error) {
      if (!isMissingStoredObjectError(error)) {
        throw error;
      }
      console.warn(
        `[AccessIntegrity] Revoking dangling IdAccess ${ref.hash} from ${ref.source} `
        + `to missing id object ${access.id}`,
      );
      const [result] = await createAccess([{
        id: access.id,
        person: [],
        hashGroup: [],
        mode: SET_ACCESS_MODE.REPLACE,
      }]);
      const current = await getObjectByIdHash(
        result.idHash as SHA256IdHash<IdAccess>,
      );
      if (current.obj.person.length > 0 || current.obj.hashGroup.length > 0) {
        throw new Error(
          `IdAccess revocation did not become current for ${access.id}: `
          + `${current.obj.person.length} people, ${current.obj.hashGroup.length} hash groups`,
        );
      }
      for (const personId of peerIds) {
        if (await isIdAccessibleBy(personId, access.id)) {
          throw new Error(
            `IdAccess revocation left ${access.id} active for ${personId}`,
          );
        }
      }
      console.log(
        `[AccessIntegrity] IdAccess ${result.idHash} now resolves to empty grant ${current.hash}`,
      );
      revoked += 1;
    }
  }
  return revoked;
}

async function assertReferenceIdentity<T extends Access | IdAccess>(
  ref: LatestGrantReference<T>,
  access: T,
): Promise<void> {
  const calculatedIdHash = await calculateIdHashOfObj(access);
  if (calculatedIdHash !== ref.idHash) {
    throw new Error(
      `[AccessIntegrity] Reverse-map identity mismatch for ${access.$type$} ${ref.hash} `
      + `from ${ref.source}: query resolved ${ref.idHash}, object recipe resolves ${calculatedIdHash}`,
    );
  }
}

function isMissingStoredObjectError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as {code?: unknown; name?: unknown};
  return candidate.name === 'FileNotFoundError'
    && (candidate.code === 'SB-READ1' || candidate.code === 'SB-READ2');
}
