import type {Instance, Person} from '@refinio/one.core/lib/recipes.js';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks.js';
import type {Profile} from '@refinio/one.models/lib/recipes/Leute/Profile.js';
import type {Signature} from '@refinio/one.models/lib/recipes/SignatureRecipes.js';
import {
  createUvcPhoneBook,
  createUvcPhoneBookEntry,
  createUvcPhoneBookIdObject,
  UvcPhoneBookEntryRecipe,
  UvcPhoneBookRecipe,
  UvcPhoneBookRegistryRecipe,
} from '../UvcPhoneBookRecipes';

const person = (value: string) => value as SHA256IdHash<Person>;
const instance = (value: string) => value as SHA256IdHash<Instance>;
const profile = (value: string) => value as SHA256Hash<Profile>;
const signature = (value: string) => value as SHA256Hash<Signature>;
const idHash = (value: string) => value as SHA256IdHash;

describe('UVC phone-book recipes', () => {
  it('normalizes a self-verifying known-person entry', () => {
    const entry = createUvcPhoneBookEntry({
      subjectPersonId: person('person-a'),
      profiles: [profile('profile-b'), profile('profile-a'), profile('profile-b')],
      trustCertifications: [signature('trust-a')],
      roleCertifications: [signature('role-a')],
      devices: [idHash('device-a')],
      deviceCertifications: [signature('device-cert-a')],
    });

    expect([...entry.profiles]).toEqual(['profile-a', 'profile-b']);
    expect([...entry.trustCertifications]).toEqual(['trust-a']);
    expect([...entry.roleCertifications]).toEqual(['role-a']);
    expect([...entry.devices]).toEqual(['device-a']);
    expect([...entry.deviceCertifications]).toEqual(['device-cert-a']);
  });

  it('rejects contacts without trusted certificate evidence', () => {
    expect(() => createUvcPhoneBookEntry({
      subjectPersonId: person('person-a'),
      profiles: [profile('profile-a')],
      trustCertifications: [],
    })).toThrow('trusted certificate evidence');
  });

  it('rejects devices without their certificate roots', () => {
    expect(() => createUvcPhoneBookEntry({
      subjectPersonId: person('person-a'),
      profiles: [profile('profile-a')],
      trustCertifications: [signature('trust-a')],
      devices: [idHash('device-a')],
    })).toThrow('devices require device certificate evidence');
  });

  it('keeps mutable directory contents out of the stable id object', () => {
    const ownerPersonId = person('owner');
    const ownerInstanceId = instance('instance');
    const idObject = createUvcPhoneBookIdObject({ownerPersonId, ownerInstanceId});
    const root = createUvcPhoneBook({
      ownerPersonId,
      ownerInstanceId,
      entries: [signature('entry-a') as any],
    });
    const sameRoot = createUvcPhoneBook({
      ownerPersonId,
      ownerInstanceId,
      entries: [signature('entry-a') as any],
    });

    expect(idObject).toEqual({$type$: 'UvcPhoneBook', ownerPersonId, ownerInstanceId});
    expect(idObject).not.toHaveProperty('entries');
    expect(root).toEqual(sameRoot);
  });

  it('registers only owner person and source instance as root identity fields', () => {
    const idFields = UvcPhoneBookRecipe.rule
      .filter(rule => rule.isId)
      .map(rule => rule.itemprop);

    expect(idFields).toEqual(['ownerPersonId', 'ownerInstanceId']);
    expect(UvcPhoneBookRecipe.rule[0].itemprop).toBe('$type$');
    expect(UvcPhoneBookEntryRecipe.name).toBe('UvcPhoneBookEntry');
    expect(UvcPhoneBookRegistryRecipe.name).toBe('UvcPhoneBookRegistry');
  });
});
