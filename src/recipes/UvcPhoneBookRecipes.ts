import type {Instance, Person, Recipe} from '@refinio/one.core/lib/recipes.js';
import type {SHA256Hash, SHA256IdHash} from '@refinio/one.core/lib/util/type-checks.js';
import type {Profile} from '@refinio/one.models/lib/recipes/Leute/Profile.js';
import type {Signature} from '@refinio/one.models/lib/recipes/SignatureRecipes.js';

export const UVC_PHONE_BOOK_VERSION = 'v1' as const;
export const UVC_PHONE_BOOK_ENTRY_VERSION = 'v1' as const;

/**
 * Immutable, self-verifying projection of one known Person.
 *
 * Signature roots are used instead of copied role/trust strings. A Signature
 * recursively carries its certificate and license through Signature.data, so
 * CHUM transfers the complete evidence graph from one directory entry.
 */
export interface UvcPhoneBookEntry {
  $type$: 'UvcPhoneBookEntry';
  $version$: typeof UVC_PHONE_BOOK_ENTRY_VERSION;
  subjectPersonId: SHA256IdHash<Person>;
  profiles: Set<SHA256Hash<Profile>>;
  trustCertifications: Set<SHA256Hash<Signature>>;
  roleCertifications: Set<SHA256Hash<Signature>>;
  devices: Set<SHA256IdHash>;
  deviceCertifications: Set<SHA256Hash<Signature>>;
}

/**
 * One source root per UVC instance. Receivers union roots from their connected
 * instances instead of allowing concurrent writers to replace one shared root.
 */
export interface UvcPhoneBook {
  $type$: 'UvcPhoneBook';
  $version$: typeof UVC_PHONE_BOOK_VERSION;
  ownerPersonId: SHA256IdHash<Person>;
  ownerInstanceId: SHA256IdHash<Instance>;
  entries: Set<SHA256Hash<UvcPhoneBookEntry>>;
}

/** Local index of imported source roots; it is never granted to a peer. */
export interface UvcPhoneBookRegistry {
  $type$: 'UvcPhoneBookRegistry';
  $version$: typeof UVC_PHONE_BOOK_VERSION;
  ownerPersonId: SHA256IdHash<Person>;
  ownerInstanceId: SHA256IdHash<Instance>;
  sources: Set<SHA256IdHash<UvcPhoneBook>>;
}

export type UvcPhoneBookIdObject = Pick<
  UvcPhoneBook,
  '$type$' | 'ownerPersonId' | 'ownerInstanceId'
>;

export type UvcPhoneBookRegistryIdObject = Pick<
  UvcPhoneBookRegistry,
  '$type$' | 'ownerPersonId' | 'ownerInstanceId'
>;

export interface CreateUvcPhoneBookEntryParams {
  subjectPersonId: SHA256IdHash<Person>;
  profiles: Iterable<SHA256Hash<Profile>>;
  trustCertifications: Iterable<SHA256Hash<Signature>>;
  roleCertifications?: Iterable<SHA256Hash<Signature>>;
  devices?: Iterable<SHA256IdHash>;
  deviceCertifications?: Iterable<SHA256Hash<Signature>>;
}

export interface CreateUvcPhoneBookParams {
  ownerPersonId: SHA256IdHash<Person>;
  ownerInstanceId: SHA256IdHash<Instance>;
  entries?: Iterable<SHA256Hash<UvcPhoneBookEntry>>;
}

function requiredHash<T extends string>(value: T, field: string): T {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new Error(`[UvcPhoneBook] ${field} is required`);
  }
  return normalized as T;
}

function normalizedSet<T extends string>(values: Iterable<T> | undefined, field: string): Set<T> {
  if (values === undefined) {
    return new Set();
  }
  const normalized = [...new Set([...values].map(value => requiredHash(value, field)))].sort();
  return new Set(normalized) as Set<T>;
}

export function createUvcPhoneBookEntry(params: CreateUvcPhoneBookEntryParams): UvcPhoneBookEntry {
  const profiles = normalizedSet(params.profiles, 'profiles[]');
  const trustCertifications = normalizedSet(params.trustCertifications, 'trustCertifications[]');
  const devices = normalizedSet(params.devices, 'devices[]');
  const deviceCertifications = normalizedSet(params.deviceCertifications, 'deviceCertifications[]');

  if (profiles.size === 0) {
    throw new Error('[UvcPhoneBook] an entry requires at least one Profile version');
  }
  if (trustCertifications.size === 0) {
    throw new Error('[UvcPhoneBook] an entry requires trusted certificate evidence');
  }
  if (devices.size > 0 && deviceCertifications.size === 0) {
    throw new Error('[UvcPhoneBook] devices require device certificate evidence');
  }
  if (deviceCertifications.size > 0 && devices.size === 0) {
    throw new Error('[UvcPhoneBook] device certificate evidence requires a device');
  }

  return {
    $type$: 'UvcPhoneBookEntry',
    $version$: UVC_PHONE_BOOK_ENTRY_VERSION,
    subjectPersonId: requiredHash(params.subjectPersonId, 'subjectPersonId'),
    profiles,
    trustCertifications,
    roleCertifications: normalizedSet(params.roleCertifications, 'roleCertifications[]'),
    devices,
    deviceCertifications,
  };
}

export function createUvcPhoneBook(params: CreateUvcPhoneBookParams): UvcPhoneBook {
  return {
    $type$: 'UvcPhoneBook',
    $version$: UVC_PHONE_BOOK_VERSION,
    ownerPersonId: requiredHash(params.ownerPersonId, 'ownerPersonId'),
    ownerInstanceId: requiredHash(params.ownerInstanceId, 'ownerInstanceId'),
    entries: normalizedSet(params.entries, 'entries[]'),
  };
}

export function createUvcPhoneBookIdObject(params: {
  ownerPersonId: SHA256IdHash<Person>;
  ownerInstanceId: SHA256IdHash<Instance>;
}): UvcPhoneBookIdObject {
  return {
    $type$: 'UvcPhoneBook',
    ownerPersonId: requiredHash(params.ownerPersonId, 'ownerPersonId'),
    ownerInstanceId: requiredHash(params.ownerInstanceId, 'ownerInstanceId'),
  };
}

export function createUvcPhoneBookRegistry(params: {
  ownerPersonId: SHA256IdHash<Person>;
  ownerInstanceId: SHA256IdHash<Instance>;
  sources?: Iterable<SHA256IdHash<UvcPhoneBook>>;
}): UvcPhoneBookRegistry {
  return {
    $type$: 'UvcPhoneBookRegistry',
    $version$: UVC_PHONE_BOOK_VERSION,
    ownerPersonId: requiredHash(params.ownerPersonId, 'ownerPersonId'),
    ownerInstanceId: requiredHash(params.ownerInstanceId, 'ownerInstanceId'),
    sources: normalizedSet(params.sources, 'sources[]'),
  };
}

export function createUvcPhoneBookRegistryIdObject(params: {
  ownerPersonId: SHA256IdHash<Person>;
  ownerInstanceId: SHA256IdHash<Instance>;
}): UvcPhoneBookRegistryIdObject {
  return {
    $type$: 'UvcPhoneBookRegistry',
    ownerPersonId: requiredHash(params.ownerPersonId, 'ownerPersonId'),
    ownerInstanceId: requiredHash(params.ownerInstanceId, 'ownerInstanceId'),
  };
}

export const UvcPhoneBookEntryRecipe: Recipe = {
  $type$: 'Recipe',
  name: 'UvcPhoneBookEntry',
  rule: [
    {itemprop: '$type$', itemtype: {type: 'string', regexp: /^UvcPhoneBookEntry$/}},
    {itemprop: '$version$', itemtype: {type: 'string', regexp: /^v1$/}},
    {itemprop: 'subjectPersonId', itemtype: {type: 'referenceToId', allowedTypes: new Set(['Person'])}},
    {
      itemprop: 'profiles',
      itemtype: {type: 'set', item: {type: 'referenceToObj', allowedTypes: new Set(['Profile'])}},
    },
    {
      itemprop: 'trustCertifications',
      itemtype: {type: 'set', item: {type: 'referenceToObj', allowedTypes: new Set(['Signature'])}},
    },
    {
      itemprop: 'roleCertifications',
      itemtype: {type: 'set', item: {type: 'referenceToObj', allowedTypes: new Set(['Signature'])}},
    },
    {
      itemprop: 'devices',
      itemtype: {type: 'set', item: {type: 'referenceToId', allowedTypes: new Set(['Device'])}},
    },
    {
      itemprop: 'deviceCertifications',
      itemtype: {type: 'set', item: {type: 'referenceToObj', allowedTypes: new Set(['Signature'])}},
    },
  ],
};

export const UvcPhoneBookRecipe: Recipe = {
  $type$: 'Recipe',
  name: 'UvcPhoneBook',
  rule: [
    {itemprop: '$type$', itemtype: {type: 'string', regexp: /^UvcPhoneBook$/}},
    {itemprop: '$version$', itemtype: {type: 'string', regexp: /^v1$/}},
    {
      itemprop: 'ownerPersonId',
      itemtype: {type: 'referenceToId', allowedTypes: new Set(['Person'])},
      isId: true,
    },
    {
      itemprop: 'ownerInstanceId',
      itemtype: {type: 'referenceToId', allowedTypes: new Set(['Instance'])},
      isId: true,
    },
    {
      itemprop: 'entries',
      itemtype: {type: 'set', item: {type: 'referenceToObj', allowedTypes: new Set(['UvcPhoneBookEntry'])}},
    },
  ],
};

export const UvcPhoneBookRegistryRecipe: Recipe = {
  $type$: 'Recipe',
  name: 'UvcPhoneBookRegistry',
  rule: [
    {itemprop: '$type$', itemtype: {type: 'string', regexp: /^UvcPhoneBookRegistry$/}},
    {itemprop: '$version$', itemtype: {type: 'string', regexp: /^v1$/}},
    {
      itemprop: 'ownerPersonId',
      itemtype: {type: 'referenceToId', allowedTypes: new Set(['Person'])},
      isId: true,
    },
    {
      itemprop: 'ownerInstanceId',
      itemtype: {type: 'referenceToId', allowedTypes: new Set(['Instance'])},
      isId: true,
    },
    {
      itemprop: 'sources',
      itemtype: {type: 'set', item: {type: 'referenceToId', allowedTypes: new Set(['UvcPhoneBook'])}},
    },
  ],
};

export const UVC_PHONE_BOOK_RECIPES: Recipe[] = [
  UvcPhoneBookEntryRecipe,
  UvcPhoneBookRecipe,
  UvcPhoneBookRegistryRecipe,
];

declare module '@OneObjectInterfaces' {
  export interface OneUnversionedObjectInterfaces {
    UvcPhoneBookEntry: UvcPhoneBookEntry;
  }

  export interface OneVersionedObjectInterfaces {
    UvcPhoneBook: UvcPhoneBook;
    UvcPhoneBookRegistry: UvcPhoneBookRegistry;
  }

  export interface OneIdObjectInterfaces {
    UvcPhoneBook: UvcPhoneBookIdObject;
    UvcPhoneBookRegistry: UvcPhoneBookRegistryIdObject;
  }
}
