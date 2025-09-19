/**
 * UDPSingleton - Lifecycle management for UdpModel
 * 
 * This module provides a singleton wrapper around the UdpModel
 * with proper initialization and cleanup handling to ensure
 * consistent and reliable UDP operations.
 */

import { UdpModel } from './UdpModel';
import type { UdpSocket, UdpSocketOptions } from './UdpModel';
import Debug from 'debug';

// Enable debug logging
const debug = Debug('one:udp:singleton');

// Track reference count for proper lifecycle management
let globalInstanceRefCount = 0;
let shutdownPromise: Promise<void> | null = null;
let isShuttingDown = false;

/**
 * Get the UDPManager singleton instance
 * 
 * This returns a properly initialized UdpModel instance
 * with reference counting for safe shutdown.
 * 
 * @returns A Promise that resolves to the UdpModel instance
 */
export async function getUDPManager(): Promise<UdpModel> {
  try {
    // If we're in the process of shutting down, wait for it to complete
    if (shutdownPromise) {
      debug('Waiting for previous shutdown to complete before initialization');
      await shutdownPromise;
      shutdownPromise = null;
      isShuttingDown = false;
    }

    debug('Getting UdpModel instance (ref count: %d)', globalInstanceRefCount);

    // Get the singleton instance
    const model = UdpModel.getInstance();

    // Initialize if needed
    if (!model.isInitialized()) {
      debug('UdpModel not initialized, calling init()');
      await model.init();
      debug('UdpModel init() complete');
    }

    // Increment the reference count
    globalInstanceRefCount++;
    debug('Incremented reference count to %d', globalInstanceRefCount);

    return model;
  } catch (error) {
    debug('UdpModel initialization failed: %o', error);
    console.error('[UDPSingleton] UdpModel initialization failed:', error);
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Safely release a reference to the UDP manager
 *
 * This decreases the reference count and shuts down the manager
 * if there are no more references.
 *
 * @returns A Promise that resolves when the release operation is complete
 */
export async function releaseUDPManager(): Promise<void> {
  if (globalInstanceRefCount <= 0) {
    debug('releaseUDPManager called but ref count is already 0');
    return;
  }

  // Decrement the reference count
  globalInstanceRefCount--;
  debug('Decremented reference count to %d', globalInstanceRefCount);

  // If there are no more references, shut down
  if (globalInstanceRefCount === 0) {
    return resetUDPManager();
  }
}

/**
 * Reset the UDPManager singleton
 *
 * This function properly shuts down the UdpModel, handling any errors
 * and ensuring resources are released even if exceptions occur.
 *
 * @returns A Promise that resolves when shutdown is complete
 */
export async function resetUDPManager(): Promise<void> {
  // If already shutting down, just return the existing promise
  if (isShuttingDown && shutdownPromise) {
    debug('Already shutting down, returning existing promise');
    return shutdownPromise;
  }

  debug('Resetting UdpModel singleton');
  isShuttingDown = true;

  // Create a new shutdown promise
  shutdownPromise = (async () => {
    try {
      // Reset reference count to avoid multiple shutdown attempts
      globalInstanceRefCount = 0;

      // Get model instance
      const model = UdpModel.getInstance();

      // Only shut down if initialized
      if (model.isInitialized()) {
        debug('Shutting down UdpModel...');
        await model.shutdown();
        debug('UdpModel shutdown completed successfully');
      } else {
        debug('UdpModel not initialized, skipping shutdown');
      }
    } catch (error) {
      // Log error but don't throw - we want to reset state even if shutdown fails
      console.error('[UDPSingleton] Error during UdpModel shutdown:', error);
      debug('UdpModel shutdown failed: %o', error);
    } finally {
      // Always reset state
      isShuttingDown = false;
      debug('UdpModel reset completed');
    }
  })();

  return shutdownPromise;
}

/**
 * Create a UDP socket with proper lifecycle management
 * 
 * @param options Socket options
 * @returns A Promise that resolves to the created socket
 */
export async function createManagedSocket(options: UdpSocketOptions): Promise<UdpSocket> {
  const model = await getUDPManager();
  const socket = await model.createSocket(options);
  
  // Wrap the socket's close method to release the UDP manager when closed
  const originalClose = socket.close;
  socket.close = async (): Promise<void> => {
    try {
      await originalClose.call(socket);
    } finally {
      // Always release the manager reference when the socket is closed
      await releaseUDPManager();
    }
  };
  
  return socket;
}

/**
 * Get the current UDP manager state for diagnostics
 *
 * @returns Object with diagnostic information
 */
export function getUDPManagerState(): Record<string, any> {
  const model = UdpModel.getInstance();
    
    return {
    refCount: globalInstanceRefCount,
    initialized: model.isInitialized(),
    isShuttingDown,
    hasShutdownPromise: !!shutdownPromise,
    socketCount: model.getSocketCount()
  };
}

/**
 * Test UDP connectivity by creating a socket and binding to a port
 */
export async function testUDPConnectivity(port: number = 0): Promise<boolean> {
  try {
    const socket = await createManagedSocket({ type: 'udp4' });
    await socket.bind(port);
    await socket.close();
    return true;
  } catch (error) {
    debug('UDP connectivity test failed: %o', error);
    return false;
  }
}

/**
 * Test UDP loopback by sending a message to ourselves
 */
export async function testUDPLoopback(): Promise<boolean> {
  try {
    const socket = await createManagedSocket({ type: 'udp4' });
    await socket.bind(0); // Bind to any available port
    
    const address = socket.address();
    if (!address) {
      await socket.close();
      return false;
    }
    
    // Set up promise for message receipt
    const messagePromise = new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 1000);
      
      socket.once('message', (msg) => {
        clearTimeout(timeout);
        resolve(true);
      });
    });
    
    // Send test message
    await socket.send('test', address.port, '127.0.0.1');
    
    // Wait for result
    const result = await messagePromise;
    await socket.close();
    
    return result;
  } catch (error) {
    debug('UDP loopback test failed: %o', error);
    return false;
  }
}

/**
 * Test UDP module functionality
 * 
 * This runs a comprehensive test of UDP capabilities
 */
export async function testUDPModule(): Promise<{
  success: boolean;
  results: any;
  error?: string;
}> {
  console.log('=== UDP DIAGNOSTIC STARTED ===');
  
  try {
    // Get the UDP manager
    const udpModel = await getUDPManager();
    console.log('UDP Manager obtained successfully');
    
    // Create a test socket
    const socket = await createManagedSocket({
      type: 'udp4',
      reuseAddr: true,
      broadcast: true,
      debug: true,
      debugLabel: 'TestSocket'
    });
    console.log('Socket created successfully');
    
    // Try to bind to a test port
    const testPort = 49497;
    await socket.bind(testPort, '0.0.0.0');
    console.log(`Socket bound to port ${testPort}`);
    
    // Get socket address
    const address = socket.address();
    console.log('Socket address:', address);
    
    // Test broadcast enable
    await socket.setBroadcast(true);
    console.log('Broadcast enabled');
    
    // Set up a message handler
    let messageReceived = false;
    socket.on('message', (msg, rinfo) => {
      console.log(`Message received from ${rinfo.address}:${rinfo.port}`);
      messageReceived = true;
    });
    
    // Send a test message to ourselves
    const testMessage = 'UDP Test Message';
    await socket.send(testMessage, testPort, '127.0.0.1');
    console.log('Test message sent');
    
    // Wait a bit for the message
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Close the socket
    await socket.close();
    console.log('Socket closed successfully');
    
    return {
      success: true,
      results: {
        socketCreated: true,
        bindSuccessful: true,
        broadcastEnabled: true,
        messageSent: true,
        messageReceived,
        socketClosed: true,
        address
      }
    };
  } catch (error) {
    console.error('UDP diagnostic failed:', error);
    return {
      success: false,
      results: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Export all functions
export default {
  getUDPManager,
  releaseUDPManager,
  resetUDPManager,
  createManagedSocket,
  getUDPManagerState,
  testUDPConnectivity,
  testUDPLoopback,
  testUDPModule
}; 