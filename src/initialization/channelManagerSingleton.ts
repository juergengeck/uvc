/**
 * ChannelManager Singleton Implementation
 *
 * This file provides a singleton instance of ChannelManager to ensure that
 * only one instance is used throughout the application, preventing cache-storage
 * synchronization issues and inconsistencies.
 */

// CRITICAL: Use static imports to avoid runtime bundling delays
import ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import { objectEvents } from '@refinio/one.models/lib/misc/ObjectEventDispatcher';
import { onVersionedObj } from '@refinio/one.core/lib/storage-versioned-objects';

// Simple singleton for ChannelManager
let channelManagerInstance: any = null;
let isInitialized = false;

function legacyChannelKey(channelId: string, owner: any): string {
  return `${owner === undefined || owner === null ? 'default' : String(owner)}:${channelId}`;
}

async function resolveLegacyChannelParticipants(manager: any, channelId: string, owner: any): Promise<any[]> {
  if (channelId.includes('<->')) {
    return channelId.split('<->').filter(Boolean);
  }

  const resolvedOwner = owner === undefined || owner === null
    ? await manager.calculateDefaultOwner()
    : owner;
  return [resolvedOwner];
}

function normalizeLegacyQueryOptions(options: any): any {
  if (!options || typeof options !== 'object' || !options.channelId || options.discriminator) {
    return options;
  }

  const { channelId, ...rest } = options;
  return {
    ...rest,
    discriminator: channelId
  };
}

function installLegacyChannelIdCompatibility(manager: any): any {
  if (manager.__uvcLegacyChannelCompatInstalled) {
    return manager;
  }

  const originalCreateChannel = manager.createChannel.bind(manager);
  const originalPostToChannel = manager.postToChannel.bind(manager);
  const originalPostToChannelIfNotExist = manager.postToChannelIfNotExist?.bind(manager);
  const originalGetObjects = manager.getObjects.bind(manager);
  const originalGetObjectsWithType = manager.getObjectsWithType.bind(manager);
  const originalObjectIterator = manager.objectIterator.bind(manager);
  const originalObjectIteratorWithType = manager.objectIteratorWithType.bind(manager);
  const originalGetMatchingChannelInfos = manager.getMatchingChannelInfos.bind(manager);
  const originalChannels = manager.channels.bind(manager);
  const legacyChannelCache = new Map<string, { channelInfoIdHash: any; participantsHash: any; owner: any }>();

  const ensureLegacyChannel = async (channelId: string, owner: any) => {
    const resolvedOwner = owner === undefined || owner === null
      ? await manager.calculateDefaultOwner()
      : owner;
    const key = legacyChannelKey(channelId, resolvedOwner);
    const cached = legacyChannelCache.get(key);
    if (cached) {
      return cached;
    }

    const participants = await resolveLegacyChannelParticipants(manager, channelId, resolvedOwner);
    const result = await originalCreateChannel(participants, resolvedOwner, undefined, channelId);
    const normalized = {
      ...result,
      owner: resolvedOwner
    };
    legacyChannelCache.set(key, normalized);
    return normalized;
  };

  manager.createChannel = async (participantsOrChannelId: any, owner?: any, ...rest: any[]) => {
    if (typeof participantsOrChannelId !== 'string') {
      return originalCreateChannel(participantsOrChannelId, owner, ...rest);
    }

    const result = await ensureLegacyChannel(participantsOrChannelId, owner);
    return result.channelInfoIdHash;
  };

  manager.postToChannel = async (
    participantsOrChannelId: any,
    data: any,
    channelOwner?: any,
    timestamp?: number,
    author?: any,
    discriminator?: string
  ) => {
    if (typeof participantsOrChannelId !== 'string') {
      return originalPostToChannel(participantsOrChannelId, data, channelOwner, timestamp, author, discriminator);
    }

    const result = await ensureLegacyChannel(participantsOrChannelId, channelOwner);
    return originalPostToChannel(
      result.participantsHash,
      data,
      result.owner,
      timestamp,
      author,
      participantsOrChannelId
    );
  };

  if (originalPostToChannelIfNotExist) {
    manager.postToChannelIfNotExist = async (
      participantsOrChannelId: any,
      data: any,
      channelOwner?: any,
      discriminator?: string
    ) => {
      if (typeof participantsOrChannelId !== 'string') {
        return originalPostToChannelIfNotExist(participantsOrChannelId, data, channelOwner, discriminator);
      }

      const result = await ensureLegacyChannel(participantsOrChannelId, channelOwner);
      return originalPostToChannelIfNotExist(
        result.participantsHash,
        data,
        result.owner,
        participantsOrChannelId
      );
    };
  }

  manager.getObjects = (options?: any) => originalGetObjects(normalizeLegacyQueryOptions(options));
  manager.getObjectsWithType = (type: any, options?: any) =>
    originalGetObjectsWithType(type, normalizeLegacyQueryOptions(options));
  manager.objectIterator = (options?: any) => originalObjectIterator(normalizeLegacyQueryOptions(options));
  manager.objectIteratorWithType = (type: any, options?: any) =>
    originalObjectIteratorWithType(type, normalizeLegacyQueryOptions(options));
  manager.getMatchingChannelInfos = (options?: any) =>
    originalGetMatchingChannelInfos(normalizeLegacyQueryOptions(options));
  manager.channels = async (options?: any) => {
    const channels = await originalChannels(normalizeLegacyQueryOptions(options));
    return channels.map((channel: any) => ({
      ...channel,
      id: channel.discriminator ?? channel.participants,
      channelId: channel.discriminator ?? channel.participants
    }));
  };

  if (manager.onUpdated?.listen) {
    const originalListen = manager.onUpdated.listen.bind(manager.onUpdated);
    manager.onUpdated.listen = (listener: any) => originalListen((
      channelInfoIdHash: any,
      channelParticipants: any,
      channelOwner: any,
      timeOfEarliestChange: Date,
      data: any
    ) => {
      const channelInfo = manager.channelInfoCache?.get(channelInfoIdHash);
      const legacyChannelId = channelInfo?.discriminator ?? channelParticipants;
      return listener(channelInfoIdHash, legacyChannelId, channelOwner, timeOfEarliestChange, data);
    });
  }

  manager.__uvcLegacyChannelCompatInstalled = true;
  return manager;
}

export function createChannelManager(leuteModel: any): any {
  if (channelManagerInstance) {
    return channelManagerInstance;
  }

  // Use the statically imported ChannelManager
  channelManagerInstance = installLegacyChannelIdCompatibility(new ChannelManager(leuteModel));
  return channelManagerInstance;
}

export function getChannelManager(): any {
  if (!channelManagerInstance) {
    throw new Error('ChannelManager not created. Call createChannelManager() first.');
  }
  return channelManagerInstance;
}

export async function initializeChannelManager(): Promise<void> {
  if (!channelManagerInstance) {
    throw new Error('ChannelManager not created. Call createChannelManager() first.');
  }
  
  if (isInitialized) {
    return;
  }
  
  console.log('[ChannelManagerSingleton] 🔧 Initializing ChannelManager with ObjectEventDispatcher...');

  // Use the statically imported objectEvents
  console.log('[ChannelManagerSingleton] 🔍 ObjectEventDispatcher available:', !!objectEvents);
  console.log('[ChannelManagerSingleton] 🔍 ObjectEventDispatcher initialized:', !!(objectEvents as any).isInitialized);
  
  await channelManagerInstance.init();
  isInitialized = true;
  
  // CRITICAL: Verify that ChannelManager's onNewVersion listener was registered
  console.log('[ChannelManagerSingleton] ✅ ChannelManager.init() completed');
  console.log('[ChannelManagerSingleton] 🔍 ChannelManager onUpdated available:', !!channelManagerInstance.onUpdated);
  console.log('[ChannelManagerSingleton] 🔍 ChannelManager disconnectOnVersionedObjListener:', !!channelManagerInstance.disconnectOnVersionedObjListener);
  
  // CRITICAL: Test that the event registration chain is working
  try {
    // Use the statically imported onVersionedObj
    console.log('[ChannelManagerSingleton] 🔍 Testing storage event registration...');
    console.log('[ChannelManagerSingleton] 🔍 onVersionedObj available:', !!onVersionedObj);
    console.log('[ChannelManagerSingleton] 🔍 onVersionedObj listeners count:', (onVersionedObj as any)?.listeners?.length || 'unknown');
  } catch (storageError) {
    console.error('[ChannelManagerSingleton] ❌ Storage event testing failed:', storageError);
  }
}

export function clearChannelManagerInstance(): void {
  channelManagerInstance = null;
  isInitialized = false;
} 
