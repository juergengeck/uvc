/**
 * UVC lab lane cleaning-cycle domain model.
 *
 * The lane demonstrates the product benefit beyond switching lamps: every
 * cleaning cycle is a planned, metered, recorded, and signed evidence chain.
 * A sanitation phase is planned (user), the light source toggles and meters
 * delivered energy, the sensor records irradiance, and the admin signs the
 * sensor and actor recordings. Journals in the admin, light, and sensor
 * columns show the cycle as signed by its participants.
 *
 * Lane posture (EN 17141): a completed cycle documents delivered energy
 * against the planned phase. It is execution evidence, never a conformance
 * claim and never microbiological evidence.
 *
 * Cycle signatures are lane-local records (signer, role, timestamp, exact
 * certified record hashes). Issuing ONE AffirmationCertificates for them is
 * an explicit follow-up; the record shape already carries what a certificate
 * would certify.
 *
 * Runtime-import-free (type-only one.core imports) so jest loads this module.
 */

import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import { laneName, personHash, timestamp } from './uvcLabRecipes.ts';

export const UVC_LANE_CYCLE_TYPES = [
  'UvcLanePhase',
  'UvcLaneCycle',
  'UvcLaneLightState',
  'UvcLaneLightChange',
  'UvcLaneSensorState',
  'UvcLaneSensorChange',
  'UvcLaneEnergy',
  'UvcLaneReading',
  'UvcLaneCycleSignature',
  'UvcLaneChangeAttestation',
  'UvcLaneJournal',
  'UvcLaneStreamHead',
] as const;

interface RecipeRule {
  itemprop: string;
  isId?: boolean;
  optional?: boolean;
  itemtype: unknown;
}

interface LaneRecipe {
  $type$: 'Recipe';
  name: string;
  rule: RecipeRule[];
}

const idText = (itemprop: string) => ({ itemprop, isId: true, itemtype: { type: 'string' } });
const text = (itemprop: string) => ({ itemprop, itemtype: { type: 'string' } });
const integer = (itemprop: string, isId = false) => ({
  itemprop,
  ...(isId ? { isId: true } : {}),
  itemtype: { type: 'integer' },
});
const person = (itemprop: string) => ({
  itemprop,
  itemtype: { type: 'referenceToId', allowedTypes: new Set(['Person']) },
});
const objectRef = (itemprop: string, allowedTypes: string[], optional = false) => ({
  itemprop,
  ...(optional ? { optional: true } : {}),
  itemtype: { type: 'referenceToObj', allowedTypes: new Set(allowedTypes) },
});
const objectRefArray = (itemprop: string, allowedTypes: string[]) => ({
  itemprop,
  itemtype: { type: 'array', item: { type: 'referenceToObj', allowedTypes: new Set(allowedTypes) } },
});

export const UvcLaneCycleRecipes: LaneRecipe[] = [
  {
    $type$: 'Recipe',
    name: 'UvcLanePhase',
    rule: [
      idText('planId'),
      text('title'),
      integer('targetDoseJm2'),
      integer('durationS'),
      person('createdBy'),
      integer('createdAt'),
    ],
  },
  {
    $type$: 'Recipe',
    name: 'UvcLaneCycle',
    rule: [
      idText('cycleId'),
      text('planId'),
      person('startedBy'),
      integer('startedAt'),
      integer('endedAt'),
      text('endReason'),
    ],
  },
  {
    $type$: 'Recipe',
    name: 'UvcLaneLightState',
    rule: [idText('stateId'), integer('on'), text('reason'), person('updatedBy'), integer('updatedAt')],
  },
  {
    $type$: 'Recipe',
    name: 'UvcLaneLightChange',
    rule: [
      idText('stream'),
      integer('seq', true),
      integer('on'),
      text('reason'),
      person('updatedBy'),
      integer('recordedAt'),
      text('prev'),
    ],
  },
  {
    $type$: 'Recipe',
    name: 'UvcLaneSensorState',
    rule: [idText('stateId'), integer('on'), text('reason'), person('updatedBy'), integer('updatedAt')],
  },
  {
    $type$: 'Recipe',
    name: 'UvcLaneSensorChange',
    rule: [
      idText('stream'),
      integer('seq', true),
      integer('on'),
      text('reason'),
      person('updatedBy'),
      integer('recordedAt'),
      text('prev'),
    ],
  },
  {
    $type$: 'Recipe',
    name: 'UvcLaneEnergy',
    rule: [
      idText('stream'),
      integer('seq', true),
      integer('joulesMilli'),
      person('recordedBy'),
      integer('recordedAt'),
      text('prev'),
    ],
  },
  {
    $type$: 'Recipe',
    name: 'UvcLaneReading',
    rule: [
      idText('stream'),
      integer('seq', true),
      integer('irradianceMwCm2'),
      person('recordedBy'),
      integer('recordedAt'),
      text('prev'),
    ],
  },
  {
    $type$: 'Recipe',
    name: 'UvcLaneCycleSignature',
    rule: [idText('cycleId'), text('signerRole'), person('signer'), integer('signedAt'), text('recordsJson')],
  },
  {
    $type$: 'Recipe',
    name: 'UvcLaneChangeAttestation',
    rule: [
      idText('scope'),
      text('lane'),
      text('cycleId'),
      objectRef('cycleVersion', ['UvcLaneCycle'], true),
      objectRefArray('lampRecords', ['UvcLaneLightChange', 'UvcLaneEnergy']),
      objectRefArray('sensorRecords', ['UvcLaneSensorChange', 'UvcLaneReading']),
      person('signer'),
      text('signerRole'),
      integer('signedAt'),
      objectRef('signingKey', ['Keys']),
      objectRef('adminRole', ['UvcLaneRole']),
      text('signature'),
    ],
  },
  {
    $type$: 'Recipe',
    name: 'UvcLaneJournal',
    rule: [
      idText('stream'),
      integer('seq', true),
      text('kind'),
      text('summary'),
      integer('recordedAt'),
      text('prev'),
      objectRef('attestation', ['UvcLaneChangeAttestation'], true),
      // The one lamp or sensor signal this entry reports as signed by `attestation`.
      objectRef('record', ['UvcLaneLightChange', 'UvcLaneSensorChange'], true),
    ],
  },
  {
    $type$: 'Recipe',
    name: 'UvcLaneStreamHead',
    rule: [idText('stream'), text('head'), integer('count')],
  },
];

export interface UvcLanePhase {
  $type$: 'UvcLanePhase';
  planId: string;
  title: string;
  targetDoseJm2: number;
  durationS: number;
  createdBy: string;
  createdAt: number;
}

export interface UvcLaneCycle {
  $type$: 'UvcLaneCycle';
  cycleId: string;
  planId: string;
  startedBy: string;
  startedAt: number;
  endedAt: number;
  endReason: string;
}

export interface UvcLaneLightState {
  $type$: 'UvcLaneLightState';
  stateId: string;
  on: number;
  reason: string;
  updatedBy: string;
  updatedAt: number;
}

export interface UvcLaneLightChange extends UvcLaneStreamEntry {
  $type$: 'UvcLaneLightChange';
  on: number;
  reason: string;
  updatedBy: string;
}

export interface UvcLaneSensorState {
  $type$: 'UvcLaneSensorState';
  stateId: string;
  on: number;
  reason: string;
  updatedBy: string;
  updatedAt: number;
}

export interface UvcLaneSensorChange extends UvcLaneStreamEntry {
  $type$: 'UvcLaneSensorChange';
  on: number;
  reason: string;
  updatedBy: string;
}

export interface UvcLaneStreamEntry {
  stream: string;
  seq: number;
  recordedAt: number;
  prev: string;
}

export interface UvcLaneEnergy extends UvcLaneStreamEntry {
  $type$: 'UvcLaneEnergy';
  joulesMilli: number;
  recordedBy: string;
}

export interface UvcLaneReading extends UvcLaneStreamEntry {
  $type$: 'UvcLaneReading';
  irradianceMwCm2: number;
  recordedBy: string;
}

export interface UvcLaneCycleSignature {
  $type$: 'UvcLaneCycleSignature';
  cycleId: string;
  signerRole: string;
  signer: string;
  signedAt: number;
  recordsJson: string;
}

export interface UvcLaneChangeAttestation {
  $type$: 'UvcLaneChangeAttestation';
  scope: string;
  lane: string;
  cycleId: string;
  cycleVersion?: string;
  lampRecords: string[];
  sensorRecords: string[];
  signer: string;
  signerRole: string;
  signedAt: number;
  signingKey: string;
  adminRole: string;
  signature: string;
}

export interface UvcLaneJournal {
  $type$: 'UvcLaneJournal';
  stream: string;
  seq: number;
  kind: string;
  summary: string;
  recordedAt: number;
  prev: string;
  attestation?: string;
  record?: string;
}

export interface UvcLaneStreamHead {
  $type$: 'UvcLaneStreamHead';
  stream: string;
  head: string;
  count: number;
}

function fail(message: string): never {
  throw new Error(`UVC lab: ${message}`);
}

const HASH = /^[0-9a-f]{64}$/;

function idHashList(values: unknown, field: string): string[] {
  if (!Array.isArray(values) || values.length === 0) fail(`${field} needs a non-empty id-hash list.`);
  for (const value of values) {
    if (typeof value !== 'string' || !HASH.test(value)) fail(`${field} must hold SHA-256 hashes.`);
  }
  return values as string[];
}

export function createUvcLanePhase(input: {
  planId: string;
  title: string;
  targetDoseJm2: number;
  durationS: number;
  createdBy: SHA256IdHash<Person> | string;
  createdAt: number;
}): UvcLanePhase {
  return {
    $type$: 'UvcLanePhase',
    planId: laneName(input.planId, 'planId'),
    title: laneName(input.title, 'title'),
    targetDoseJm2: timestamp(input.targetDoseJm2, 'targetDoseJm2'),
    durationS: timestamp(input.durationS, 'durationS'),
    createdBy: personHash(input.createdBy, 'createdBy'),
    createdAt: timestamp(input.createdAt, 'createdAt'),
  };
}

export function createUvcLaneCycle(input: {
  cycleId: string;
  planId: string;
  startedBy: SHA256IdHash<Person> | string;
  startedAt: number;
  endedAt?: number;
  endReason?: string;
}): UvcLaneCycle {
  const endedAt = input.endedAt ?? 0;
  if (endedAt !== 0 && endedAt < input.startedAt) fail('endedAt must not precede startedAt.');
  return {
    $type$: 'UvcLaneCycle',
    cycleId: laneName(input.cycleId, 'cycleId'),
    planId: laneName(input.planId, 'planId'),
    startedBy: personHash(input.startedBy, 'startedBy'),
    startedAt: timestamp(input.startedAt, 'startedAt'),
    endedAt: timestamp(endedAt, 'endedAt'),
    endReason: typeof input.endReason === 'string' ? input.endReason : '',
  };
}

export function createUvcLaneLightState(input: {
  stateId: string;
  on: boolean;
  reason: string;
  updatedBy: SHA256IdHash<Person> | string;
  updatedAt: number;
}): UvcLaneLightState {
  return {
    $type$: 'UvcLaneLightState',
    stateId: laneName(input.stateId, 'stateId'),
    on: input.on === true ? 1 : 0,
    reason: typeof input.reason === 'string' ? input.reason : '',
    updatedBy: personHash(input.updatedBy, 'updatedBy'),
    updatedAt: timestamp(input.updatedAt, 'updatedAt'),
  };
}

export function createUvcLaneLightChange(input: {
  stream: string;
  seq: number;
  on: boolean;
  reason: string;
  updatedBy: SHA256IdHash<Person> | string;
  recordedAt: number;
  prev?: string;
}): UvcLaneLightChange {
  const prev = input.prev ?? '';
  if (typeof prev !== 'string') fail('prev must be a string.');
  return {
    $type$: 'UvcLaneLightChange',
    stream: laneName(input.stream, 'stream'),
    seq: timestamp(input.seq, 'seq'),
    on: input.on === true ? 1 : 0,
    reason: typeof input.reason === 'string' ? input.reason : '',
    updatedBy: personHash(input.updatedBy, 'updatedBy'),
    recordedAt: timestamp(input.recordedAt, 'recordedAt'),
    prev,
  };
}

export function createUvcLaneSensorState(input: {
  stateId: string;
  on: boolean;
  reason: string;
  updatedBy: SHA256IdHash<Person> | string;
  updatedAt: number;
}): UvcLaneSensorState {
  return {
    $type$: 'UvcLaneSensorState',
    stateId: laneName(input.stateId, 'stateId'),
    on: input.on === true ? 1 : 0,
    reason: typeof input.reason === 'string' ? input.reason : '',
    updatedBy: personHash(input.updatedBy, 'updatedBy'),
    updatedAt: timestamp(input.updatedAt, 'updatedAt'),
  };
}

export function createUvcLaneSensorChange(input: {
  stream: string;
  seq: number;
  on: boolean;
  reason: string;
  updatedBy: SHA256IdHash<Person> | string;
  recordedAt: number;
  prev?: string;
}): UvcLaneSensorChange {
  const prev = input.prev ?? '';
  if (typeof prev !== 'string') fail('prev must be a string.');
  return {
    $type$: 'UvcLaneSensorChange',
    stream: laneName(input.stream, 'stream'),
    seq: timestamp(input.seq, 'seq'),
    on: input.on === true ? 1 : 0,
    reason: typeof input.reason === 'string' ? input.reason : '',
    updatedBy: personHash(input.updatedBy, 'updatedBy'),
    recordedAt: timestamp(input.recordedAt, 'recordedAt'),
    prev,
  };
}

export function createUvcLaneEnergy(input: {
  stream: string;
  seq: number;
  joulesMilli: number;
  recordedBy: SHA256IdHash<Person> | string;
  recordedAt: number;
  prev?: string;
}): UvcLaneEnergy {
  const prev = input.prev ?? '';
  if (typeof prev !== 'string') fail('prev must be a string.');
  return {
    $type$: 'UvcLaneEnergy',
    stream: laneName(input.stream, 'stream'),
    seq: timestamp(input.seq, 'seq'),
    joulesMilli: timestamp(input.joulesMilli, 'joulesMilli'),
    recordedBy: personHash(input.recordedBy, 'recordedBy'),
    recordedAt: timestamp(input.recordedAt, 'recordedAt'),
    prev,
  };
}

export function createUvcLaneReading(input: {
  stream: string;
  seq: number;
  irradianceMwCm2: number;
  recordedBy: SHA256IdHash<Person> | string;
  recordedAt: number;
  prev?: string;
}): UvcLaneReading {
  const prev = input.prev ?? '';
  if (typeof prev !== 'string') fail('prev must be a string.');
  return {
    $type$: 'UvcLaneReading',
    stream: laneName(input.stream, 'stream'),
    seq: timestamp(input.seq, 'seq'),
    irradianceMwCm2: timestamp(input.irradianceMwCm2, 'irradianceMwCm2'),
    recordedBy: personHash(input.recordedBy, 'recordedBy'),
    recordedAt: timestamp(input.recordedAt, 'recordedAt'),
    prev,
  };
}

export function createUvcLaneCycleSignature(input: {
  cycleId: string;
  signerRole: string;
  signer: SHA256IdHash<Person> | string;
  signedAt: number;
  recordIds: string[];
}): UvcLaneCycleSignature {
  return {
    $type$: 'UvcLaneCycleSignature',
    cycleId: laneName(input.cycleId, 'cycleId'),
    signerRole: laneName(input.signerRole, 'signerRole'),
    signer: personHash(input.signer, 'signer'),
    signedAt: timestamp(input.signedAt, 'signedAt'),
    recordsJson: JSON.stringify(idHashList(input.recordIds, 'recordIds')),
  };
}

export function changeAttestationPayload(input: {
  scope: string;
  lane: string;
  cycleId?: string;
  cycleVersion?: string;
  lampRecords: string[];
  sensorRecords: string[];
  signer: SHA256IdHash<Person> | string;
  signerRole: string;
  signedAt: number;
  signingKey: string;
  adminRole: string;
}): string {
  const cycleVersion = input.cycleVersion;
  if (cycleVersion !== undefined && (typeof cycleVersion !== 'string' || !HASH.test(cycleVersion))) {
    fail('cycleVersion must be a SHA-256 hash.');
  }
  const lampRecords = input.lampRecords.length > 0 ? idHashList(input.lampRecords, 'lampRecords') : [];
  const sensorRecords = input.sensorRecords.length > 0 ? idHashList(input.sensorRecords, 'sensorRecords') : [];
  if (lampRecords.length + sensorRecords.length === 0) fail('attestation needs at least one lamp or sensor record.');
  if (typeof input.signingKey !== 'string' || !HASH.test(input.signingKey)) fail('signingKey must be a SHA-256 hash.');
  if (typeof input.adminRole !== 'string' || !HASH.test(input.adminRole)) fail('adminRole must be a SHA-256 hash.');
  return JSON.stringify({
    scope: laneName(input.scope, 'scope'),
    lane: laneName(input.lane, 'lane'),
    cycleId: typeof input.cycleId === 'string' ? input.cycleId : '',
    cycleVersion: cycleVersion ?? '',
    lampRecords,
    sensorRecords,
    signer: personHash(input.signer, 'signer'),
    signerRole: laneName(input.signerRole, 'signerRole'),
    signedAt: timestamp(input.signedAt, 'signedAt'),
    signingKey: input.signingKey,
    adminRole: input.adminRole,
  });
}

export function createUvcLaneChangeAttestation(input: {
  scope: string;
  lane: string;
  cycleId?: string;
  cycleVersion?: string;
  lampRecords: string[];
  sensorRecords: string[];
  signer: SHA256IdHash<Person> | string;
  signerRole: string;
  signedAt: number;
  signingKey: string;
  adminRole: string;
  signature: string;
}): UvcLaneChangeAttestation {
  const payload = JSON.parse(changeAttestationPayload(input)) as Omit<UvcLaneChangeAttestation, '$type$' | 'signature'> & {
    cycleVersion: string;
  };
  if (typeof input.signature !== 'string' || !/^[0-9a-f]{128}$/.test(input.signature)) {
    fail('signature must be a 64-byte Ed25519 signature.');
  }
  return {
    $type$: 'UvcLaneChangeAttestation',
    scope: payload.scope,
    lane: payload.lane,
    cycleId: payload.cycleId,
    ...(payload.cycleVersion === '' ? {} : { cycleVersion: payload.cycleVersion }),
    lampRecords: payload.lampRecords,
    sensorRecords: payload.sensorRecords,
    signer: payload.signer,
    signerRole: payload.signerRole,
    signedAt: payload.signedAt,
    signingKey: payload.signingKey,
    adminRole: payload.adminRole,
    signature: input.signature,
  };
}

export function createUvcLaneJournal(input: {
  stream: string;
  seq: number;
  kind: string;
  summary: string;
  recordedAt: number;
  prev?: string;
  attestation?: string;
  record?: string;
}): UvcLaneJournal {
  const prev = input.prev ?? '';
  if (typeof prev !== 'string') fail('prev must be a string.');
  if (input.attestation !== undefined && (typeof input.attestation !== 'string' || !HASH.test(input.attestation))) {
    fail('attestation must be a SHA-256 hash.');
  }
  if (input.record !== undefined) {
    if (typeof input.record !== 'string' || !HASH.test(input.record)) fail('record must be a SHA-256 hash.');
    if (input.attestation === undefined) fail('a signed record entry needs its attestation.');
  }
  return {
    $type$: 'UvcLaneJournal',
    stream: laneName(input.stream, 'stream'),
    seq: timestamp(input.seq, 'seq'),
    kind: laneName(input.kind, 'kind'),
    summary: laneName(input.summary, 'summary'),
    recordedAt: timestamp(input.recordedAt, 'recordedAt'),
    prev,
    ...(input.attestation === undefined ? {} : { attestation: input.attestation }),
    ...(input.record === undefined ? {} : { record: input.record }),
  };
}

export function createUvcLaneStreamHead(input: { stream: string; head: string; count: number }): UvcLaneStreamHead {
  if (typeof input.head !== 'string' || input.head === '') fail('head is required.');
  return {
    $type$: 'UvcLaneStreamHead',
    stream: laneName(input.stream, 'stream'),
    head: input.head,
    count: timestamp(input.count, 'count'),
  };
}
