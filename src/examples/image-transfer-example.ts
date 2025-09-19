/**
 * Example demonstrating how to send and receive large binary data like images
 * using the QuicModel's large binary data transfer capabilities
 */

import { QuicModel } from '../models/network/QuicModel';
import Debug from 'debug';

const debug = Debug('example:image-transfer');

/**
 * Send an image via UDP broadcast
 * 
 * @param imageData The binary image data as Uint8Array
 * @param port The port to broadcast on
 * @param metadata Additional metadata about the image
 * @returns A promise that resolves when the image is sent successfully
 * @throws Error if the image data is invalid or there was an error during sending
 */
export async function sendImage(
  imageData: Uint8Array, 
  port: number = 49497,
  metadata: { name?: string; type?: string } = {}
): Promise<void> {
  // Validate input data
  if (!imageData || !(imageData instanceof Uint8Array) || imageData.byteLength === 0) {
    const error = new Error('Invalid image data: Must provide a non-empty Uint8Array');
    debug('Error: %o', error);
    throw error;
  }

  try {
    debug(`Preparing to send image (${imageData.byteLength} bytes)`);
    
    // Get QuicModel instance
    const quicModel = QuicModel.getInstance();
    
    // Initialize if needed
    if (!quicModel.isInitialized()) {
      debug('QuicModel not initialized, initializing now...');
      await quicModel.init();
      
      // Double-check initialization was successful
      if (!quicModel.isInitialized()) {
        throw new Error('Failed to initialize QuicModel');
      }
    }
    
    // Set default metadata values
    const imageMetadata = {
      type: metadata.type || 'image/jpeg',
      name: metadata.name || `image_${Date.now()}.jpg`,
      id: `img_${Date.now()}_${Math.floor(Math.random() * 1000000)}`
    };
    
    debug(`Sending image "${imageMetadata.name}" (${imageData.byteLength} bytes) on port ${port}`);
    
    // Send the image using the large binary data transfer method
    await quicModel.sendLargeBinaryData(imageData, port, imageMetadata);
    
    debug('Image sent successfully');
  } catch (error) {
    const errorMessage = `Error sending image: ${error instanceof Error ? error.message : String(error)}`;
    debug('Error: %s', errorMessage);
    console.error('[ImageTransfer]', errorMessage);
    throw error instanceof Error ? error : new Error(errorMessage);
  }
}

/**
 * Set up a listener for received images
 * 
 * @param callback Function called when an image is received
 * @returns Cleanup function to remove the listener
 * @throws Error if QuicModel could not be initialized
 */
export async function listenForImages(
  callback: (imageData: Uint8Array, metadata: any) => void
): Promise<() => void> {
  try {
    const quicModel = QuicModel.getInstance();
    
    // Initialize if needed
    if (!quicModel.isInitialized()) {
      debug('QuicModel not initialized, initializing now...');
      await quicModel.init();
      
      // Double-check initialization was successful
      if (!quicModel.isInitialized()) {
        throw new Error('Failed to initialize QuicModel');
      }
    }
    
    // Set up listener for large binary data
    const listener = (data: Uint8Array, metadata: any) => {
      // Only process images
      if (metadata && metadata.type && metadata.type.startsWith('image/')) {
        debug(`Received image "${metadata.name}" (${data.byteLength} bytes)`);
        callback(data, metadata);
      }
    };
    
    // Register listener and store the disconnect function
    const disconnect = quicModel.onLargeBinaryDataReceived.listen(listener);
    
    debug('Image listener registered successfully');
    
    // Return cleanup function
    return () => {
      debug('Removing image listener');
      // Call the disconnect function returned by listen()
      disconnect();
    };
  } catch (error) {
    const errorMessage = `Error setting up image listener: ${error instanceof Error ? error.message : String(error)}`;
    debug('Error: %s', errorMessage);
    console.error('[ImageTransfer]', errorMessage);
    throw error instanceof Error ? error : new Error(errorMessage);
  }
}

// Example usage:
/*
// First, initialize the system
QuicModel.getInstance().init().then(() => {
  // Set up listener for incoming images
  listenForImages((imageData, metadata) => {
    console.log(`Received image: ${metadata.name} (${imageData.byteLength} bytes)`);
    // Process the image data - you could display it or save it
  }).catch(error => {
    console.error('Failed to set up image listener:', error);
  });
  
  // Send an image (assuming you have image data)
  const imageData = new Uint8Array([...]); // Your image data here
  sendImage(imageData, 49497, { 
    name: 'test-image.jpg', 
    type: 'image/jpeg'
  }).catch(error => {
    console.error('Failed to send image:', error);
  });
}).catch(error => {
  console.error('Failed to initialize QuicModel:', error);
});
*/ 