/**
 * Minimal UDP Receiver
 * 
 * This is a bare-bones UDP receiver that listens on port 49497 with minimal
 * processing - designed to confirm basic UDP reception is working.
 */

import { createSocket } from '../platform/udp';
import { Buffer } from '@refinio/one.core/lib/system/expo/index.js';

/**
 * Options for the UDP receiver
 */
export interface UDPReceiverOptions {
  port?: number;
  bindAddress?: string;
  reuseAddress?: boolean;
  enableBroadcast?: boolean;
  debugTag?: string;
}

/**
 * Creates a simple UDP receiver that logs all packets
 * @returns A function to stop the receiver
 */
export function startSimpleUDPReceiver(options: UDPReceiverOptions = {}): Promise<() => Promise<void>> {
  const {
    port = 49497,
    bindAddress = '0.0.0.0',
    reuseAddress = true,
    enableBroadcast = true,
    debugTag = 'UDPReceiver'
  } = options;
  
  console.log(`[${debugTag}] Starting minimal UDP receiver on port ${port}...`);
  
  return new Promise((resolve, reject) => {
    // Create UDP socket with minimal options
    createSocket({ 
      type: 'udp4',
      debug: true,
      reuseAddr: reuseAddress,
      debugLabel: debugTag
    }).then(socket => {
      console.log(`[${debugTag}] Socket created`);
      
      // Add message listener to log ALL incoming packets without any filtering
      socket.addListener('message', (message: Buffer, rinfo: { address: string; port: number }) => {
        console.log(`[${debugTag}] RECEIVED PACKET from ${rinfo.address}:${rinfo.port} (${message.length} bytes)`);
        
        // Try to decode and log the message for debugging
        try {
          const messageStr = message.toString('utf8');
          console.log(`[${debugTag}] Message: ${messageStr.substring(0, 100)}`);
        } catch (e) {
          console.log(`[${debugTag}] Could not decode message as UTF-8`);
        }
      });
      
      // Add error listener
      socket.addListener('error', (error: Error) => {
        console.error(`[${debugTag}] Socket error:`, error);
      });
      
      // Create the stop function first
      const stopFn = async (): Promise<void> => {
        console.log(`[${debugTag}] Stopping UDP receiver...`);
        
        try {
          await socket.close();
          console.log(`[${debugTag}] Socket closed successfully`);
        } catch (e) {
          console.error(`[${debugTag}] Exception closing socket:`, e);
        }
      };
      
      // Bind to the port
      console.log(`[${debugTag}] Binding to ${bindAddress}:${port}...`);
      socket.bind(port, bindAddress)
        .then(() => {
          console.log(`[${debugTag}] Successfully bound to ${bindAddress}:${port}`);
          
          // Enable broadcasting if requested
          if (enableBroadcast) {
            console.log(`[${debugTag}] Enabling broadcast mode...`);
            return socket.setBroadcast(true)
              .then(() => {
                console.log(`[${debugTag}] Broadcast mode enabled`);
                resolve(stopFn);
              })
              .catch(broadcastErr => {
                console.error(`[${debugTag}] Failed to set broadcast:`, broadcastErr);
                resolve(stopFn); // Continue despite broadcast error
              });
          } else {
            // Return the stop function
            resolve(stopFn);
          }
        })
        .catch(err => {
          console.error(`[${debugTag}] Failed to bind to port ${port}:`, err);
          
          // Try to close the socket on error
          socket.close()
            .catch(closeErr => {
              console.error(`[${debugTag}] Error closing socket:`, closeErr);
            })
            .finally(() => {
              reject(err);
            });
        });
    }).catch(error => {
      console.error(`[${debugTag}] Failed to create socket:`, error);
      reject(error);
    });
  });
}

/**
 * Utility function to quickly listen for UDP packets for a limited time
 */
export async function listenForUDPPackets(options: UDPReceiverOptions & { durationMs?: number } = {}): Promise<void> {
  const durationMs = options.durationMs || 30000; // Default 30 seconds
  const debugTag = options.debugTag || 'UDPReceiver';
  
  console.log(`[${debugTag}] Starting UDP receiver for ${durationMs}ms`);
  
  try {
    const stop = await startSimpleUDPReceiver(options);
    
    // Set a timeout to stop listening
    await new Promise<void>(resolve => {
      setTimeout(async () => {
        await stop();
        resolve();
      }, durationMs);
    });
    
    console.log(`[${debugTag}] Finished listening for UDP packets`);
  } catch (error) {
    console.error(`[${debugTag}] Failed to listen for UDP packets:`, error);
  }
} 