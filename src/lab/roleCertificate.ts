import type { Recipe } from '@refinio/one.core/lib/recipes.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import { laneName, personHash, roleName, timestamp, type UvcLabRole } from './uvcLabRecipes.ts';

/** Clinic-issued role authority. The invitation only addresses a Person; this
 * signed, versioned record decides which app that Person may open. */
export interface UvcLabRoleCertificate {
  $type$: 'UvcLabRoleCertificate';
  lane: string;
  person: SHA256IdHash<Person>;
  role: UvcLabRole;
  issuer: SHA256IdHash<Person>;
  issuedAt: number;
  signingKey: string;
  signature: string;
}

export const UvcLabRoleCertificateRecipe: Recipe = {
  $type$: 'Recipe',
  name: 'UvcLabRoleCertificate',
  rule: [
    { itemprop: 'lane', isId: true, itemtype: { type: 'string' } },
    { itemprop: 'person', isId: true, itemtype: { type: 'referenceToId', allowedTypes: new Set(['Person']) } },
    { itemprop: 'role', itemtype: { type: 'string' } },
    { itemprop: 'issuer', itemtype: { type: 'referenceToId', allowedTypes: new Set(['Person']) } },
    { itemprop: 'issuedAt', itemtype: { type: 'integer' } },
    { itemprop: 'signingKey', itemtype: { type: 'referenceToObj', allowedTypes: new Set(['Keys']) } },
    { itemprop: 'signature', itemtype: { type: 'string' } },
  ],
};

export type RoleCertificatePayload = Omit<UvcLabRoleCertificate, '$type$' | 'signature'>;

export function roleCertificatePayload(input: RoleCertificatePayload): string {
  return JSON.stringify({
    lane: laneName(input.lane, 'lane'),
    person: personHash(input.person, 'person'),
    role: roleName(input.role),
    issuer: personHash(input.issuer, 'issuer'),
    issuedAt: timestamp(input.issuedAt, 'issuedAt'),
    signingKey: personHash(input.signingKey, 'signingKey'),
  });
}

export function createUvcLabRoleCertificate(input: RoleCertificatePayload & { signature: string }): UvcLabRoleCertificate {
  const payload = JSON.parse(roleCertificatePayload(input)) as RoleCertificatePayload;
  if (!/^[0-9a-f]{128}$/.test(input.signature)) throw new Error('UVC lab: invalid role certificate signature.');
  return { $type$: 'UvcLabRoleCertificate', ...payload, signature: input.signature };
}

declare module '@OneObjectInterfaces' {
  export interface OneVersionedObjectInterfaces {
    UvcLabRoleCertificate: UvcLabRoleCertificate;
  }
}
