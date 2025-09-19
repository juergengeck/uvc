/**
 * QuicModel Test
 * 
 * This file provides a simple test to verify that the QuicModel is working correctly.
 * It initializes the QuicModel and attempts to create a UDP socket.
 */

import { QuicModel } from '../models/network/QuicModel';

/**
 * Test the QuicModel initialization and UDP socket creation
 */
export async function testQuicModel(): Promise<string> {
  try {
    console.log('Starting QuicModel test...');
    
    // Initialize the QuicModel
    const quicModel = await QuicModel.ensureInitialized();
    console.log('QuicModel initialized successfully');
    
    // Check if the model is ready
    const isReady = quicModel.isReady();
    console.log('QuicModel ready state:', isReady);
    
    if (!isReady) {
      return 'ERROR: QuicModel is not ready after initialization';
    }
    
    // Try to create a UDP socket
    try {
      const socket = await quicModel.createUdpSocket({
        type: 'udp4',
        reuseAddr: true,
        broadcast: true,
        debug: true
      });
      
      console.log('UDP socket created successfully with ID:', socket.id);
      
      // Close the socket
      await socket.close();
      console.log('UDP socket closed successfully');
      
      return 'SUCCESS: QuicModel test completed successfully';
    } catch (socketError: any) {
      console.error('Error creating UDP socket:', socketError);
      const errorMessage = socketError instanceof Error ? socketError.message : String(socketError);
      return `ERROR: Failed to create UDP socket: ${errorMessage}`;
    }
  } catch (error: any) {
    console.error('Error in QuicModel test:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `ERROR: QuicModel test failed: ${errorMessage}`;
  }
}

/**
 * Run the test and log the result
 */
export function runQuicModelTest(): void {
  testQuicModel()
    .then(result => {
      console.log('QuicModel test result:', result);
    })
    .catch(error => {
      console.error('Unexpected error in QuicModel test:', error);
    });
} 