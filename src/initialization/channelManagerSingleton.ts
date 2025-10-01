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

export function createChannelManager(leuteModel: any): any {
  if (channelManagerInstance) {
    return channelManagerInstance;
  }

  // Use the statically imported ChannelManager
  channelManagerInstance = new ChannelManager(leuteModel);
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