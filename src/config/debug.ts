/**
 * Debug Configuration - MINIMAL VERSION
 * 
 * This file provides minimal debug logging focused only on message transfer diagnostics
 * to diagnose the asymmetric messaging issue.
 */

import Debug from 'debug';

// MINIMAL: Only enable message transfer debugging
const DEBUG_NAMESPACES: string[] = [
  'MessageTransferDebug*',
  'CommServerManager*'
];

// Enable only our specific debug namespaces
Debug.enabled = (namespace: string) => {
  return DEBUG_NAMESPACES.some(pattern => {
    if (pattern.endsWith('*')) {
      return namespace.startsWith(pattern.slice(0, -1));
    }
    return namespace === pattern;
  });
};

// DISABLE ALL VERBOSE LOGGING
process.env.DEBUG = '';
process.env.ONE_MODELS_DEBUG = '';
process.env.ONE_MODELS_BUS_DEBUG = '';
process.env.ONE_MODELS_BUS_LOG = '';
process.env.ONE_MODELS_INTERNAL = '';
process.env.ONE_PAIRING_DEBUG = '';
process.env.PAIRING_TOKEN_DEBUG = '';
process.env.ONE_MODELS_MESSAGE_BUS_DEBUG = '';
process.env.MESSAGE_BUS_DEBUG = '';
process.env.ONE_MODELS_HANDOVER_DEBUG = '';
process.env.COMMUNICATION_SERVER_DEBUG = '';
process.env.CONNECTION_ROUTE_MANAGER_DEBUG = '';
process.env.INCOMING_CONNECTION_MANAGER_DEBUG = '';
process.env.LEUTE_CONNECTIONS_MODULE_DEBUG = '';
process.env.ONE_MODELS_MESSAGE_BUS_ALL = '';
process.env.CHUM_SYNC_DEBUG = '';
process.env.CHUM_IMPORTER_DEBUG = '';
process.env.ONE_MODELS_CHUM_DEBUG = '';

// Only enable our focused message transfer debugging
process.env.MESSAGE_TRANSMISSION_DEBUG = 'true';
process.env.ACCESS_GRANTS_DEBUG = 'true';

console.log('[DEBUG] 🔇 All verbose logging disabled');
console.log('[DEBUG] 🎯 Only message transfer diagnostics enabled');

export default Debug;

// Minimal debug setup function
export function setupDebugLogging(): void {
  console.log('[DEBUG] Minimal debug configuration loaded');
}

// Empty stub functions to prevent errors
export function addGlobalDebugFunctions() {
  // No-op
}

export function subscribeToMessageBus(): Promise<void> {
  return Promise.resolve();
}

export function inspectConnectionsModelInternals() {
  // No-op
}

export function inspectConnectionsModelAPI() {
  // No-op
}

export function forceOneModelsLogging(): void {
  // No-op
}

export function tracePairingFlow() {
  // No-op
} 