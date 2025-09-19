/**
 * UDP type definitions for the UdpModel
 */

import { Buffer } from '@refinio/one.core/lib/system/expo/index.js';
import { DirectBuffer } from './DirectBuffer';

/**
 * Information about a remote UDP endpoint that sent a message
 */
export interface UdpRemoteInfo {
  address: string;
  port: number;
  family: string;
  size: number;
}

/**
 * Options for creating a UDP socket
 */
export interface UdpSocketOptions {
  type?: 'udp4' | 'udp6';
  reuseAddr?: boolean;
  broadcast?: boolean;
  debug?: boolean;
  debugLabel?: string;
  direct?: boolean; // Whether to use direct buffer mode
}

/**
 * Event types for UDP sockets
 */
export type UdpSocketEventType = 
  | 'listening'
  | 'message'
  | 'error'
  | 'close';

/**
 * UDP Socket interface
 */
export interface UdpSocket {
  id: number;
  options: UdpSocketOptions;
  _events: Record<string, any>;
  
  bind(port?: number, address?: string): Promise<void>;
  
  // Standardize on the simplified 3-parameter pattern only
  send(msg: Buffer | string | Uint8Array, port: number, address: string): Promise<void>;
  
  close(): Promise<void>;
  addMembership(multicastAddress: string, interfaceAddress?: string): Promise<void>;
  dropMembership(multicastAddress: string, interfaceAddress?: string): Promise<void>;
  setBroadcast(flag: boolean): Promise<void>;
  address(): string | { address: string; port: number; family: string };
  
  on(event: string, listener: (...args: any[]) => void): this;
  once(event: string, listener: (...args: any[]) => void): this;
  addListener(event: string, listener: (...args: any[]) => void): this;
  removeListener(event: string, listener: (...args: any[]) => void): this;
  emit(event: string, ...args: any[]): boolean;
}

/**
 * Extended UDP Socket with direct buffer support
 */
export interface DirectUdpSocket extends UdpSocket {
  /**
   * Send data using a DirectBuffer for zero-copy transfer
   */
  sendDirect(buffer: DirectBuffer, port: number, address: string): Promise<void>;
  
  /**
   * Register for direct buffer message events
   * The 'directMessage' event will be emitted with a DirectBuffer and UdpRemoteInfo
   */
  registerDirectMessages(): Promise<void>;
  
  /**
   * Unregister from direct buffer message events
   */
  unregisterDirectMessages(): Promise<void>;
} 