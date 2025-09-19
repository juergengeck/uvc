/**
 * Network Models Index
 * 
 * This file exports the network models following the one.models pattern.
 * It provides a consistent entry point for importing network functionality.
 */

import { UdpModel, UdpSocket, UdpSocketOptions, UdpRemoteInfo, DirectUdpSocket } from './UdpModel';
import { QuicModel, QuicTransportOptions } from './QuicModel';
import { DeviceDiscoveryModel, DeviceDiscoveryConfig, Device, DeviceCapabilities } from './DeviceDiscoveryModel';
// NetworkPlugin removed - using ConnectionsModel directly
// CommServerManager and ProtocolFlowManager removed - using ConnectionsModel directly
// Remove circular dependency by not importing from UDPSingleton
// Instead, export functions that will be implemented in UDPSingleton
import { initializeQuicTransport } from './setup';
import { DirectBuffer, DirectBufferPool, getDirectBufferPool as _getDirectBufferPool, isDirectBufferSupported } from './DirectBuffer';
import { UdpSocketEventType } from './UdpTypes';
import { TransportManager } from './TransportManager';
import CommServerManager from './transports/CommServerManager';

// Export UdpModel and its types
export { UdpModel, UdpSocket, UdpSocketOptions, UdpRemoteInfo, DirectUdpSocket };

// Export UdpTypes
export { UdpSocketEventType };

// Export DirectBuffer and its types
export { DirectBuffer, DirectBufferPool, isDirectBufferSupported };

// Export QuicModel and its types
export { QuicModel, QuicTransportOptions };

// Export DeviceDiscoveryModel and its types
export { DeviceDiscoveryModel, DeviceDiscoveryConfig, Device, DeviceCapabilities };

// NetworkPlugin removed - using ConnectionsModel directly

// Export UDPSingleton helpers for backward compatibility
// These will be implemented in UDPSingleton.ts
export { 
  getUDPManager, 
  resetUDPManager, 
  testUDPConnectivity, 
  testUDPLoopback,
  testUDPModule
} from './UDPSingleton';

// Export QUIC setup function
export { initializeQuicTransport };

// Singleton getters
export const getUdpModel = (): UdpModel => {
  return UdpModel.getInstance();
};

export const getQuicModel = (): QuicModel => {
  return QuicModel.getInstance();
};

export const getDeviceDiscoveryModel = (config?: Partial<DeviceDiscoveryConfig>): DeviceDiscoveryModel => {
  return DeviceDiscoveryModel.getInstance(config);
};

// Initialization helpers
export const ensureUdpInitialized = async (): Promise<UdpModel> => {
  const model = UdpModel.getInstance();
  if (!model.isInitialized()) {
    await model.init();
  }
  return model;
};

export const ensureQuicInitialized = async (options?: QuicTransportOptions): Promise<QuicModel> => {
  return await QuicModel.ensureInitialized(options);
};

export const ensureDeviceDiscoveryInitialized = async (config?: Partial<DeviceDiscoveryConfig>): Promise<DeviceDiscoveryModel> => {
  return await DeviceDiscoveryModel.ensureInitialized(config);
};

// Direct buffer helpers
export const getDirectBufferPool = () => {
  console.warn('[NetworkIndex] Direct access to DirectBufferPool requested');
  return _getDirectBufferPool();
};

export const createDirectBuffer = async (size: number = 1500): Promise<DirectBuffer> => {
  return await getDirectBufferPool().createBuffer(size);
};

export const releaseDirectBuffer = async (buffer: DirectBuffer): Promise<boolean> => {
  if (buffer && !buffer.isReleased()) {
    return await getDirectBufferPool().releaseBuffer(buffer);
  }
  return true; // Buffer was already released or null
};

// Export a function to initialize QUIC on demand (rather than at import time)
let quicInitialized = false;
export function ensureQuicTransportInitialized(): boolean {
  if (quicInitialized) {
    return true;
  }
  
  try {
    const result = initializeQuicTransport();
    quicInitialized = result;
    return result;
  } catch (error) {
    console.error('[QUIC] Failed to initialize transport:', error);
    return false;
  }
}

// Utility functions
export { createError } from '@refinio/one.core/lib/errors.js';

// Type re-exports for convenience
export type { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';

// Re-export debug factory
export { default as Debug } from 'debug';

// Network infrastructure exports  
export { TransportManager, CommServerManager };

// Connections model exports
export {
  ConnectionsModel,
  LamaConnectionsPresets,
  LamaConnectionsConfigBuilder,
  LamaConnectionsUtils,
  createLamaConnectionsModel,
  type LamaConnectionsModelInstance
} from './connections'; 