import { MemoryTrie } from '@refinio/memory.core/services/MemoryTrie.js';
import { createMemoryTrieStore, createMemoryTrieEntryStore } from '@refinio/memory.core/services/MemoryTrieOneCoreStore.js';
import { buildPersonMemoryTrieId } from '@refinio/memory.core/services/MemoryTrieScope.js';
import type { Memory } from '@refinio/memory.core/types/Memory.js';
import type { OneCoreTrieStorageDeps } from '@refinio/trie.core';
import { getObjectByIdHash, storeVersionedObject, getCurrentVersionHash } from '@refinio/one.core/lib/storage-versioned-objects.js';
import { getObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import { calculateIdHashOfObj } from '@refinio/one.core/lib/util/object.js';
import { cubeOneRuntime } from './cube-one-runtime.js';

const storage: OneCoreTrieStorageDeps = {
  storeVersionedObject: object => storeVersionedObject(object as never),
  getObjectByIdHash: id => getObjectByIdHash(id as never) as unknown as ReturnType<OneCoreTrieStorageDeps['getObjectByIdHash']>,
  calculateIdHashOfObj: object => calculateIdHashOfObj(object as never),
  getCurrentVersionHash: id => getCurrentVersionHash(id as never),
  getObject: hash => getObject(hash as never) as unknown as Promise<Record<string, unknown>>,
};

async function ownerMemories() {
  // Reload the persisted root on each request so imported/updated heads are visible.
  return MemoryTrie.load({
    trieId: buildPersonMemoryTrieId(cubeOneRuntime.getIdentity().personId),
    storeDeps: createMemoryTrieStore(storage),
    entryStore: createMemoryTrieEntryStore(storage),
  });
}

export async function listMemories() {
  const trie = await ownerMemories();
  const { entries } = await trie.listEntries();
  return entries.map(entry => ({
    id: entry.memoryIdHash,
    title: entry.title,
    summary: entry.summary,
    timestamp: entry.timestamp,
    factsCount: entry.factsCount,
    entitiesCount: entry.entitiesCount,
  }));
}

export async function getMemory(input: { id: string }) {
  if (!input || typeof input.id !== 'string' || !/^[a-f0-9]{64}$/i.test(input.id)) {
    throw new Error('A valid memory ID is required.');
  }
  // Only expose objects in this owner's memory index, not arbitrary ONE objects.
  if (!(await listMemories()).some(memory => memory.id === input.id)) {
    throw new Error('This memory is not in your library.');
  }
  const { obj } = await getObjectByIdHash(input.id as never);
  if (obj.$type$ !== 'Memory') throw new Error('The indexed object is not a memory.');
  const memory = obj as unknown as Memory;
  return { id: input.id, title: memory.title, summary: memory.summary, prose: memory.prose, author: memory.author,
    facts: memory.facts, entities: memory.entities, sourceSubjects: memory.sourceSubjects };
}
