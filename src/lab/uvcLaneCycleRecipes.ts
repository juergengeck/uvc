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
  'UvcLaneEnergy',
  'UvcLaneReading',
  'UvcLaneCycleSignature',
  'UvcLaneJournal',
  'UvcLaneStreamHead',
] as const;

interface RecipeRule {
  itemprop: string;
  isId?: boolean;
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
    name: 'UvcLaneJournal',
    rule: [
      idText('stream'),
      integer('seq', true),
      text('kind'),
      text('summary'),
      integer('recordedAt'),
      text('prev'),
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

export interface UvcLaneJournal {
  $type$: 'UvcLaneJournal';
  stream: string;
  seq: number;
  kind: string;
  summary: string;
  recordedAt: number;
  prev: string;
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

export function createUvcLaneJournal(input: {
  stream: string;
  seq: number;
  kind: string;
  summary: string;
  recordedAt: number;
  prev?: string;
}): UvcLaneJournal {
  const prev = input.prev ?? '';
  if (typeof prev !== 'string') fail('prev must be a string.');
  return {
    $type$: 'UvcLaneJournal',
    stream: laneName(input.stream, 'stream'),
    seq: timestamp(input.seq, 'seq'),
    kind: laneName(input.kind, 'kind'),
    summary: laneName(input.summary, 'summary'),
    recordedAt: timestamp(input.recordedAt, 'recordedAt'),
    prev,
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
