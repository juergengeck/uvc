/**
 * Debug Configuration for one.core
 * 
 * This file configures debug settings for one.core before it's loaded.
 * It must be imported before any one.core modules.
 */

// Make this a module
export {};

// Add types for the global object
declare global {
  var __ONE_CORE_DEBUG__: boolean;
  var __ONE_CORE_DEBUG_CONFIG__: {
    [key: string]: boolean;
  };
}

// Disable core debug logging
globalThis.__ONE_CORE_DEBUG__ = false;

// Disable all debug namespaces
globalThis.__ONE_CORE_DEBUG_CONFIG__ = {
  // Core operations
  'util/promise': false,
  'util/serialize': false,
  'system/expo': false,
  'storage/write': false,
  'storage/read': false,
  'network/udp': false,
  'network/quic': false,
  
  // Channel operations
  'models/channel': false,
  'channel/manager': false,
  'channel/events': false
}; 