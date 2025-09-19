/**
 * Type definitions for UDPModule
 * 
 * This file provides TypeScript type definitions for the UDPModule
 * which is a custom implementation of UDP socket functionality for React Native.
 */

declare module '@lama/UDPModule' {
  import { EventEmitter } from 'events';

  /**
   * Information about the remote endpoint
   */
  export interface RemoteInfo {
    address: string;
    port: number;
    family: string;
    size: number;
  }

  /**
   * UDP Socket options
   */
  export interface UDPSocketOptions {
    type?: string;
    debug?: boolean;
    debugLabel?: string;
  }

  /**
   * UDP Socket class
   */
  export class UDPSocket extends EventEmitter {
    /**
     * Create a new UDP socket
     * @param options Configuration options
     */
    constructor(options?: UDPSocketOptions);

    /**
     * Add an event listener
     * @param event Event name
     * @param listener Event listener
     */
    on(event: 'message', listener: (msg: any, rinfo: RemoteInfo) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'listening', listener: () => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: string, listener: (...args: any[]) => void): this;

    /**
     * Add an event listener (alias for on)
     * @param event Event name
     * @param listener Event listener
     */
    addListener(event: string, listener: (...args: any[]) => void): this;

    /**
     * Remove an event listener
     * @param event Event name
     * @param listener Event listener
     */
    removeListener(event: string, listener: (...args: any[]) => void): this;

    /**
     * Bind the socket to a port and address
     * @param port Port to bind to
     * @param address Address to bind to (optional)
     * @returns Promise that resolves when the socket is bound
     */
    bind(port: number, address?: string): Promise<void>;

    /**
     * Send data to a specific destination
     * @param data Data to send (string or Buffer)
     * @param port Destination port
     * @param address Destination address
     * @returns Promise that resolves when the data is sent
     */
    send(data: string | Uint8Array, port: number, address: string): Promise<void>;

    /**
     * Close the socket
     * @returns Promise that resolves when the socket is closed
     */
    close(): Promise<void>;

    /**
     * Add membership to a multicast group
     * @param multicastAddress Multicast group address
     * @param interfaceAddress Interface address (optional)
     * @returns Promise that resolves when membership is added
     */
    addMembership(multicastAddress: string, interfaceAddress?: string): Promise<void>;

    /**
     * Drop membership from a multicast group
     * @param multicastAddress Multicast group address
     * @param interfaceAddress Interface address (optional)
     * @returns Promise that resolves when membership is dropped
     */
    dropMembership(multicastAddress: string, interfaceAddress?: string): Promise<void>;

    /**
     * Set broadcast mode
     * @param flag Whether to enable broadcast
     * @returns Promise that resolves when broadcast mode is set
     */
    setBroadcast(flag: boolean): Promise<void>;
  }

  /**
   * Create a new UDP socket
   * @param options Configuration options
   * @returns A new UDPSocket instance
   */
  export function createSocket(options?: UDPSocketOptions | string): UDPSocket;

  /**
   * Default export for compatibility with react-native-udp
   */
  const UDPModule: {
    createSocket: typeof createSocket;
    Socket: typeof UDPSocket;
  };

  export default UDPModule;
} 