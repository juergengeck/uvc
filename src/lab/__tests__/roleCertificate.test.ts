import { describe, expect, it } from '@jest/globals';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import { createUvcLabRoleCertificate, roleCertificatePayload, UvcLabRoleCertificateRecipe } from '../roleCertificate.ts';

const PERSON = 'a'.repeat(64) as SHA256IdHash<Person>;
const CLINIC = 'b'.repeat(64) as SHA256IdHash<Person>;
const KEY = 'c'.repeat(64);
const SIGNATURE = 'd'.repeat(128);

describe('Clinic role certificate', () => {
  const facts = { lane: 'lab', person: PERSON, role: 'doctor' as const, issuer: CLINIC, issuedAt: 42, signingKey: KEY };

  it('binds the role, subject, issuer and signing key in the signed payload', () => {
    const cert = createUvcLabRoleCertificate({ ...facts, signature: SIGNATURE });
    expect(cert).toEqual({ $type$: 'UvcLabRoleCertificate', ...facts, signature: SIGNATURE });
    expect(JSON.parse(roleCertificatePayload(cert))).toEqual(facts);
    expect(roleCertificatePayload({ ...facts, role: 'lamp' })).not.toBe(roleCertificatePayload(facts));
    expect(UvcLabRoleCertificateRecipe.rule.filter(rule => rule.isId).map(rule => rule.itemprop)).toEqual(['lane', 'person']);
  });

  it('rejects malformed authority facts before storage', () => {
    expect(() => createUvcLabRoleCertificate({ ...facts, role: 'owner' as never, signature: SIGNATURE })).toThrow('unknown lane role');
    expect(() => createUvcLabRoleCertificate({ ...facts, person: 'bad' as SHA256IdHash<Person>, signature: SIGNATURE })).toThrow('person must be a SHA-256 hash');
    expect(() => createUvcLabRoleCertificate({ ...facts, signature: 'short' })).toThrow('invalid role certificate signature');
  });
});
