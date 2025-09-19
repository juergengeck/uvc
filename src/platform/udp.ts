/**
 * UDP Platform Interface
 *
 * Provides a high-level, cross-platform API for UDP networking.
 * This interfaces with the low-level UDP implementation provided by
 * native modules through the models/network layer.
 */

import { createManagedSocket, getUDPManager } from '../models/network/UDPSingleton';
import type { UdpSocket, UdpSocketOptions, UdpRemoteInfo } from '../models/network/UdpModel';
import { checkDirectBufferSupport } from '../models/network/DirectBuffer';
import Debug from 'debug';

// Setup debug logging
const debug = Debug('one:platform:udp');

/**
 * Check if UDP functionality is available
 * 
 * @returns True if UDP is supported on this platform
 */
export async function isUdpSupported(): Promise<boolean> {
  try {
    const model = await getUDPManager();
    return model.isInitialized();
} catch (error) {
    debug('Error checking UDP support: %o', error);
    return false;
}
}

/**
 * Create a new UDP socket with proper lifecycle management
 * 
 * @param options Socket options
 * @returns A Promise that resolves to the created socket
 */
export async function createSocket(options: UdpSocketOptions): Promise<UdpSocket> {
  return createManagedSocket(options);
}

/**
 * Create a UDP socket for broadcasting
 * 
 * @param port Port to bind to
 * @param address Address to bind to (default: 0.0.0.0)
 * @returns A Promise that resolves to the broadcast socket
 */
export async function createBroadcastSocket(port?: number, address?: string): Promise<UdpSocket> {
  const socket = await createSocket({
    type: 'udp4',
    reuseAddr: true,
    broadcast: true
  });
  
  // Bind to port if specified
  if (port !== undefined) {
    await socket.bind(port, address);
          }

  // Enable broadcast
  await socket.setBroadcast(true);
  
            return socket;
          }

/**
 * Create a UDP socket for multicast
 * 
 * @param multicastAddress Multicast address to join
 * @param port Port to bind to
 * @param bindAddress Address to bind to (default: 0.0.0.0)
 * @returns A Promise that resolves to the multicast socket
 */
export async function createMulticastSocket(
  multicastAddress: string,
  port: number,
  bindAddress: string = '0.0.0.0'
): Promise<UdpSocket> {
  const model = await getUDPManager();
  const socket = await model.createSocket({
    type: 'udp4',
    reuseAddr: true
  });
  
  // Bind the socket
  await socket.bind(port, bindAddress);
  
  // Add multicast membership if supported
  if (socket.addMembership) {
    await socket.addMembership(multicastAddress);
          } else {
    debug('Multicast not supported on this platform');
          }

            return socket;
          }

/**
 * Send a broadcast message
 * 
 * @param message Message to broadcast
 * @param port Destination port
 * @param broadcastAddress Broadcast address (default: 255.255.255.255)
 * @returns A Promise that resolves when the message is sent
 */
export async function sendBroadcast(
  message: string | Uint8Array,
  port: number,
  broadcastAddress: string = '255.255.255.255'
): Promise<void> {
  const socket = await createBroadcastSocket();
  
  try {
    await socket.send(message, port, broadcastAddress);
  } finally {
    await socket.close();
          }
}

/**
 * Check if direct buffer support is available
 * 
 * @returns True if direct buffers are supported on this platform
 */
export function hasDirectBufferSupport(): boolean {
  return checkDirectBufferSupport();
}

/**
 * Get the UDP platform capabilities
 * 
 * @returns Object with platform capability flags
 */
export async function getUdpCapabilities(): Promise<Record<string, boolean>> {
  try {
    const model = await getUDPManager();
    
    return {
      available: model.isInitialized(),
      broadcast: true,
      multicast: true, // Multicast may not be available on all platforms
      directBuffers: hasDirectBufferSupport()
    };
  } catch (error) {
    return {
      available: false,
      broadcast: false,
      multicast: false,
      directBuffers: false
    };
  }
}

// Export types
export type { UdpSocket, UdpSocketOptions, UdpRemoteInfo };

// Export API as default
export default {
  createSocket,
  createBroadcastSocket,
  createMulticastSocket,
  sendBroadcast,
  isUdpSupported,
  hasDirectBufferSupport,
  getUdpCapabilities
}; 