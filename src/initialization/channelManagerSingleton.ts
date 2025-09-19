/**
 * ChannelManager Singleton Implementation
 * 
 * This file provides a singleton instance of ChannelManager to ensure that
 * only one instance is used throughout the application, preventing cache-storage
 * synchronization issues and inconsistencies.
 */

// Simple singleton for ChannelManager
let channelManagerInstance: any = null;
let isInitialized = false;

export function createChannelManager(leuteModel: any): any {
  if (channelManagerInstance) {
    return channelManagerInstance;
  }
  
  // Require the module and use the **default** export - destructuring will return undefined
  // when the module uses `export default`. So access .default explicitly.
  const ChannelManagerModule = require('@refinio/one.models/lib/models/ChannelManager.js');
  const OriginalChannelManager = ChannelManagerModule.default || ChannelManagerModule;

  // If not patched yet, replace constructor with singleton proxy
  if (!(OriginalChannelManager as any).__lamaSingletonPatched) {
    const PatchedChannelManager: any = function (...args: any[]) {
      if (channelManagerInstance) return channelManagerInstance;
      // @ts-ignore
      channelManagerInstance = new (OriginalChannelManager as any)(...args);
      return channelManagerInstance;
    };
    PatchedChannelManager.prototype = OriginalChannelManager.prototype;
    Object.setPrototypeOf(PatchedChannelManager, OriginalChannelManager);
    (PatchedChannelManager as any).__lamaSingletonPatched = true;

    // Override default export so *future* imports get the patched constructor
    if (ChannelManagerModule.default) {
      ChannelManagerModule.default = PatchedChannelManager;
    } else {
      module.exports = PatchedChannelManager;
    }
  }

  // Now create (or retrieve) the instance
  channelManagerInstance = channelManagerInstance || new OriginalChannelManager(leuteModel);
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
  
  // CRITICAL: Verify ObjectEventDispatcher is available before ChannelManager.init()
  const { objectEvents } = await import('@refinio/one.models/lib/misc/ObjectEventDispatcher');
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
    const { onVersionedObj } = await import('@refinio/one.core/lib/storage-versioned-objects');
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