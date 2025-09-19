import type { UnversionedObjectResult } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import { storeUnversionedObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import { getObjectByIdHash } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person, Recipe } from '@refinio/one.core/lib/recipes.js';
import type { License } from '@refinio/one.models/lib/recipes/Certificates/License.js';
import { registerLicense } from '@refinio/one.models/lib/misc/Certificates/LicenseRegistry.js';

/**
 * License for device ownership credentials
 */
export const DeviceOwnershipLicense: License = Object.freeze({
  $type$: 'License',
  name: 'DeviceOwnership',
  description: '[signature.issuer] affirms ownership and control rights over [subject] device.'
});

registerLicense(DeviceOwnershipLicense, 'VerifiableCredential');

/**
 * Recipe for Verifiable Credential
 * 
 * A generic credential that can be issued to make claims about any subject.
 * Follows W3C Verifiable Credentials model with ONE's pattern of externalized semantics.
 * 
 * This is an unversioned object because credentials are immutable once issued.
 */
export interface VerifiableCredential {
  // Standard ONE object type field
  $type$: 'VerifiableCredential';
  
  // Unique credential ID (will be the isID field)
  id: string;
  
  // Issuer of the credential (Person who signs it)
  issuer: SHA256IdHash<Person>;
  
  // Subject of the credential (reference to any object)
  subject: SHA256Hash;
  
  // Type of credential (defines the claims structure)
  credentialType: string;
  
  // Claims made by this credential (type-specific data)
  claims: Map<string, any>;
  
  // Timestamps (stored as milliseconds since epoch)
  issuedAt: number;
  validUntil?: number;
  
  // License defining usage rights
  license: SHA256Hash<License>;
  
  // Cryptographic proof of the credential's validity
  proof: string;
  
  // Whether the credential has been revoked
  revoked?: boolean;
}

/**
 * Recipe definition for VerifiableCredential
 */
export const VerifiableCredentialRecipe: Recipe = {
  $type$: 'Recipe',
  name: 'VerifiableCredential',
  rule: [
    {
      itemprop: 'id',
      itemtype: { type: 'string' }
    },
    {
      itemprop: 'issuer',
      itemtype: { type: 'referenceToId', allowedTypes: new Set(['Person']) }
    },
    {
      itemprop: 'subject',
      itemtype: { type: 'referenceToObj', allowedTypes: new Set(['*']) }
    },
    {
      itemprop: 'credentialType',
      itemtype: { type: 'string' }
    },
    {
      itemprop: 'claims',
      itemtype: { 
        type: 'map',
        key: { type: 'string' },
        value: { type: 'stringifiable' }
      }
    },
    {
      itemprop: 'issuedAt',
      itemtype: { type: 'number' }
    },
    {
      itemprop: 'validUntil',
      itemtype: { type: 'number' },
      optional: true
    },
    {
      itemprop: 'license',
      itemtype: { type: 'referenceToObj', allowedTypes: new Set(['License']) }
    },
    {
      itemprop: 'proof',
      itemtype: { type: 'string' }
    },
    {
      itemprop: 'revoked',
      itemtype: { type: 'boolean' },
      optional: true
    }
  ]
};

/**
 * Create and store a new VerifiableCredential
 */
export async function createVerifiableCredential(
  issuer: SHA256IdHash<Person>,
  subject: SHA256Hash,
  credentialType: string,
  claims: Map<string, any>,
  license: SHA256Hash<License>,
  proof: string,
  options?: {
    validUntil?: number;
  }
): Promise<UnversionedObjectResult<VerifiableCredential>> {
  const credential: VerifiableCredential = {
    $type$: 'VerifiableCredential',
    id: `vc-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
    issuer,
    subject,
    credentialType,
    claims,
    issuedAt: Date.now(),
    license,
    proof,
    ...(options?.validUntil && { validUntil: options.validUntil })
  };
  
  return storeUnversionedObject(credential);
}

/**
 * Get a VerifiableCredential by its hash
 */
export async function getVerifiableCredential(
  hash: SHA256Hash<VerifiableCredential>
): Promise<VerifiableCredential | undefined> {
  return getObjectByIdHash(hash);
}

// #### one.core interfaces ####
declare module '@OneObjectInterfaces' {
  export interface OneCertificateInterfaces {
    VerifiableCredential: VerifiableCredential;
  }
}