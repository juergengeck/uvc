/**
 * UVC lab lane object model.
 *
 * Every lane-scoped object references its lane and role/thread by id hash, so
 * receivers enumerate a lane through the id-object reverse map instead of any
 * host-maintained index. Custom lane types live outside the framework's closed
 * type world; values crossing into one.core APIs are validated here, at the
 * boundary — never inside domain logic.
 *
 * This module is runtime-import-free (type-only one.core/one.models imports)
 * so the Node test worker and jest can load it without the ESM platform.
 */

import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';

export const UVC_LAB_ROLES = ['admin', 'doctor', 'lamp', 'sensor', 'user', 'light'] as const;
export type UvcLabRole = (typeof UVC_LAB_ROLES)[number];

export const UVC_LANE_TYPES = ['UvcLaneRole', 'UvcLaneChat', 'UvcLaneThread'] as const;
export type UvcLaneType = (typeof UVC_LANE_TYPES)[number];

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

const laneRef = (itemprop: string, isId = false) => ({
  itemprop,
  ...(isId ? { isId: true } : {}),
  itemtype: { type: 'string' },
});
const person = (itemprop: string, isId = false) => ({
  itemprop,
  ...(isId ? { isId: true } : {}),
  itemtype: { type: 'referenceToId', allowedTypes: new Set(['Person']) },
});
const text = (itemprop: string, isId = false) => ({
  itemprop,
  ...(isId ? { isId: true } : {}),
  itemtype: { type: 'string' },
});
const integer = (itemprop: string, isId = false) => ({
  itemprop,
  ...(isId ? { isId: true } : {}),
  itemtype: { type: 'integer' },
});

export const UvcLaneRecipes: LaneRecipe[] = [
  {
    $type$: 'Recipe',
    name: 'UvcLaneRole',
    rule: [laneRef('lane', true), text('role', true), person('person'), integer('registeredAt')],
  },
  {
    $type$: 'Recipe',
    name: 'UvcLaneChat',
    rule: [
      laneRef('thread', true),
      integer('seq', true),
      person('sender'),
      text('text'),
      integer('sentAt'),
      text('prev'),
    ],
  },
  {
    $type$: 'Recipe',
    name: 'UvcLaneThread',
    rule: [laneRef('thread', true), text('head'), integer('count')],
  },
];

/** Id-object reverse maps: enumerate lane chats through their thread. */
export const UvcLaneReverseMapsForIdObjects: [string, Set<string>][] = [
  ['UvcLaneChat', new Set(['thread'])],
];

export interface UvcLaneRoleAnchor {
  $type$: 'UvcLaneRole';
  lane: string;
  role: string;
  person: string;
  registeredAt: number;
}

export interface UvcLaneChat {
  $type$: 'UvcLaneChat';
  thread: string;
  seq: number;
  sender: string;
  text: string;
  sentAt: number;
  prev: string;
}

export interface UvcLaneThread {
  $type$: 'UvcLaneThread';
  thread: string;
  head: string;
  count: number;
}

const HASH = /^[0-9a-f]{64}$/;

function fail(message: string): never {
  throw new Error(`UVC lab: ${message}`);
}

export function laneName(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') fail(`${field} is required.`);
  return value as string;
}

export function roleName(value: unknown): UvcLabRole {
  if (typeof value !== 'string' || !(UVC_LAB_ROLES as readonly string[]).includes(value)) {
    fail(`unknown lane role ${String(value)}.`);
  }
  return value as UvcLabRole;
}

export function personHash(value: unknown, field: string): string {
  if (typeof value !== 'string' || !HASH.test(value)) fail(`${field} must be a SHA-256 hash.`);
  return value as string;
}

export function timestamp(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(`${field} must be a non-negative integer.`);
  return value as number;
}

export function createUvcLaneRole(input: {
  lane: string;
  role: string;
  person: SHA256IdHash<Person> | string;
  registeredAt: number;
}): UvcLaneRoleAnchor {
  return {
    $type$: 'UvcLaneRole',
    lane: laneName(input.lane, 'lane'),
    role: roleName(input.role),
    person: personHash(input.person, 'person'),
    registeredAt: timestamp(input.registeredAt, 'registeredAt'),
  };
}

export function createUvcLaneChat(input: {
  thread: string;
  seq: number;
  sender: SHA256IdHash<Person> | string;
  text: string;
  sentAt: number;
  prev?: string;
}): UvcLaneChat {
  const message = laneName(input.text, 'text');
  const prev = input.prev ?? '';
  if (typeof prev !== 'string') fail('prev must be a string.');
  return {
    $type$: 'UvcLaneChat',
    thread: laneName(input.thread, 'thread'),
    seq: timestamp(input.seq, 'seq'),
    sender: personHash(input.sender, 'sender'),
    text: message,
    sentAt: timestamp(input.sentAt, 'sentAt'),
    prev,
  };
}

export function createUvcLaneThread(input: { thread: string; head: string; count: number }): UvcLaneThread {
  if (typeof input.head !== 'string' || input.head === '') fail('head is required.');
  return {
    $type$: 'UvcLaneThread',
    thread: laneName(input.thread, 'thread'),
    head: input.head,
    count: timestamp(input.count, 'count'),
  };
}
