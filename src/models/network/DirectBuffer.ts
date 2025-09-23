/**
 * DirectBuffer.ts
 * 
 * This module provides a managed interface to native shared memory buffers,
 * enabling efficient zero-copy operations between JavaScript and native code.
 * 
 * Core concepts:
 * 
 * 1. DirectBuffer - A class that represents a native buffer with these features:
 *    - Zero-copy access to native memory from JavaScript
 *    - Automatic lifecycle management with proper resource cleanup
 *    - Unified API that works with the TurboModule implementation
 * 
 * 2. Module Access - Uses React Native's TurboModule system:
 *    - Consistent access via NativeModules.UDPDirectModule
 *    - Well-defined interface with proper error handling
 * 
 * 3. Buffer Pool - Optional pooling mechanism for buffer reuse:
 *    - Reduces allocation/deallocation overhead
 *    - Manages buffer lifecycle automatically
 * 
 * Usage examples:
 * 
 * ```typescript
 * // Create and use a buffer directly
 * const buffer = await DirectBuffer.create(1024);
 * await buffer.write(data);
 * const view = await buffer.getView(); // Get direct access to underlying ArrayBuffer
 * await buffer.release();
 * 
 * // Or use the buffer pool
 * const pool = getDirectBufferPool();
 * const buffer = await pool.createBuffer(1024);
 * // ... use buffer ...
 * await pool.releaseBuffer(buffer);
 * ```
 * 
 * For high-performance applications, this module enables direct memory access
 * without the overhead of copying data between JavaScript and native code.
 */

import { NativeModules, Platform } from 'react-native';
import Debug from 'debug';
import UDPDirectModule from 'react-native-udp-direct';

// Set up debug logging
const debug = Debug('one:network:directbuffer');
const log = (message: string, ...args: any[]) => {
  debug(message, ...args);
};

// Get the TurboModule
function getUDPDirectModule() {
  if (UDPDirectModule) {
    log('Using imported UDPDirectModule');
    return UDPDirectModule;
  }
  
  log('No UDPDirectModule implementation found');
  return null;
}

// Log diagnostics about the module availability
function logModuleDiagnostics() {
  log('--- DirectBuffer: UDPDirectModule Diagnostics ---');
  
  // Check TurboModule
  const turboAvailable = !!UDPDirectModule;
  log('TurboModule available:', turboAvailable);
  
  if (turboAvailable) {
    const methods = Object.getOwnPropertyNames(UDPDirectModule)
      .filter(prop => typeof UDPDirectModule[prop] === 'function');
    log('TurboModule methods:', methods.join(', '));
  }
  
  log('----------------------------------------');
}

// Run diagnostics on module load
logModuleDiagnostics();

/**
 * Check if direct buffer functionality is available on this platform
 */
export function isDirectBufferSupported(): boolean {
  return getUDPDirectModule() !== null;
}

/**
 * Direct Buffer class for efficient memory handling
 * 
 * This class manages a shared memory buffer that can be used
 * for zero-copy operations with native code.
 */
export class DirectBuffer {
  private bufferId: number;
  private size: number;
  private view: Uint8Array | null = null;
  
  /**
   * Create a direct buffer of the specified size
   * 
   * @param sizeOrBufferId Either the size for a new buffer or an existing buffer ID
   * @param existingBuffer Whether this is an existing buffer ID
   */
  private constructor(sizeOrBufferId: number, existingBuffer: boolean = false) {
    if (existingBuffer) {
      // Using an existing buffer
      this.bufferId = sizeOrBufferId;
      this.size = 0; // Size will be retrieved from native code
      log(`Wrapping existing buffer ${this.bufferId}`);
    } else {
      // Creating a new buffer
      this.bufferId = -1; // Will be set by allocate()
      this.size = sizeOrBufferId;
      log(`Creating new buffer of size ${this.size}`);
    }
  }
  
  /**
   * Create a new direct buffer
   * 
   * @param size Size of the buffer in bytes
   * @returns New DirectBuffer instance
   */
  public static async create(size: number): Promise<DirectBuffer> {
    const module = getUDPDirectModule();
    if (!module) {
      throw new Error('UDPDirectModule not available');
    }
    
    const buffer = new DirectBuffer(size);
    await buffer.allocate();
    return buffer;
  }
  
  /**
   * Wrap an existing buffer ID in a DirectBuffer object
   * 
   * @param bufferId ID of the existing buffer
   * @returns DirectBuffer instance wrapping the existing buffer
   */
  public static fromId(bufferId: number): DirectBuffer {
    const module = getUDPDirectModule();
    if (!module) {
      throw new Error('UDPDirectModule not available');
    }
    
    return new DirectBuffer(bufferId, true);
  }
  
  /**
   * Allocate the native buffer
   */
  private async allocate(): Promise<void> {
    if (this.bufferId !== -1) {
      // Buffer already allocated
      return;
    }
    
    const module = getUDPDirectModule();
    if (!module) {
      throw new Error('UDPDirectModule not available');
    }
    
    try {
      // Select allocation method – prefer new name `createUdpBuffer`, fall back to legacy `createSharedArrayBuffer`
      const alloc = (module as any).createUdpBuffer ?? (module as any).createSharedArrayBuffer;
      if (typeof alloc !== 'function') {
        const availableMethods = Object.getOwnPropertyNames(module).join(', ');
        throw new Error(`UDPDirectModule.createUdpBuffer/createSharedArrayBuffer is not a function. Available methods: ${availableMethods}`);
      }
      
      log(`Calling UDP buffer allocation with size ${this.size}`);
      const result = await alloc(this.size);
      
      // Handle different return value formats (HostObject or ID)
      // The JSI spec in NativeUdpModule.ts for createSharedArrayBuffer is Promise<SharedBufferHostObject>
      // However, the C++ layer might resolve with just the bufferId for some TurboModule versions or internal call paths.
      // The SharedBufferHostObject itself is expected to contain the bufferId.
      if (typeof result === 'object' && result !== null) {
        // Expecting a HostObject which should have a bufferId or id property
        if (typeof result.bufferId === 'number') {
          this.bufferId = result.bufferId;
        } else if (typeof result.id === 'number') { // Some HostObjects might use 'id'
          this.bufferId = result.id;
        } else if (result.constructor && result.constructor.name === 'SharedBufferHostObject' && typeof result._bufferId === 'number') {
          // Accessing a private/internal property if it's a known HostObject structure
          this.bufferId = result._bufferId;
           log('Accessed _bufferId from SharedBufferHostObject');
        } else {
          // If the object itself is the ID (less likely for HostObject but possible if native side changes)
          // Or if it's a different structure than expected.
          // For now, we assume the result object *is* the HostObject and we need to extract the ID.
          // If the result is a JSI HostObject, it *must* have a way to get the underlying ID or be used directly.
          // The README indicates createSharedArrayBuffer returns a Promise<SharedBufferHostObject>.
          // The SharedBufferHostObject in C++ has `bufferId_`.
          // Let's assume for now that if it's an object, it must have a bufferId property from the JSI call.
           throw new Error(`Unexpected object structure from createUdpBuffer. Expected bufferId property. Received: ${JSON.stringify(result)}`);
        }
      } else if (typeof result === 'number') {
        // Buffer ID returned directly
        this.bufferId = result;
      } else {
        throw new Error(`Unexpected buffer creation result type: ${typeof result}. Expected object (HostObject) or number (bufferId).`);
      }
      
      if (this.bufferId === undefined || this.bufferId === null || this.bufferId < 0) {
        throw new Error(`Invalid bufferId received from createUdpBuffer: ${this.bufferId}`);
      }

      log(`Buffer ${this.bufferId} allocated with size ${this.size} using createUdpBuffer`);
    } catch (error) {
      log('Error allocating buffer via createUdpBuffer:', error);
      throw new Error(`Failed to allocate direct buffer using createUdpBuffer: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Release the buffer
   */
  public async release(): Promise<boolean> {
    if (this.bufferId === -1) {
      // Already released
      return true;
    }
    
    const module = getUDPDirectModule();
    if (!module) {
      throw new Error('UDPDirectModule not available');
    }
    
    try {
      // Select release method – prefer new name `releaseUdpBuffer`, fall back to legacy `releaseSharedArrayBuffer`
      const release = (module as any).releaseUdpBuffer ?? (module as any).releaseSharedArrayBuffer;
      if (typeof release !== 'function') {
        const availableMethods = Object.getOwnPropertyNames(module).join(', ');
        throw new Error(`UDPDirectModule.releaseUdpBuffer/releaseSharedArrayBuffer is not a function. Available methods: ${availableMethods}`);
      }
      
      const result = await release(this.bufferId);
      
      this.bufferId = -1; // Mark as released on JS side
      this.view = null;
      
      log(`Buffer (formerly ID ${this.bufferId}, now -1) released via releaseUdpBuffer`);
      return true; // Indicate success
    } catch (error) {
      log('Error releasing buffer via releaseUdpBuffer:', error);
      
      // Keep bufferId as is if release failed, so retry might be possible or indicates a problem
      throw new Error(`Failed to release direct buffer using releaseUdpBuffer: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Get the buffer ID
   */
  public getId(): number {
    return this.bufferId;
  }
  
  /**
   * Get the buffer size
   */
  public async getSize(): Promise<number> {
    if (this.size > 0) {
      return this.size;
    }
    
    const module = getUDPDirectModule();
    if (!module || this.bufferId === -1) {
      throw new Error('Buffer not available');
    }
    
    try {
      const sizeMethod = module.getDirectBufferSize || module.getBufferSize;
      if (!sizeMethod) {
        throw new Error('No getDirectBufferSize or getBufferSize method available');
      }
      
      this.size = await sizeMethod(this.bufferId);
      return this.size;
    } catch (error) {
      log('Error getting buffer size:', error);
      throw new Error(`Failed to get direct buffer size: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Get a view of the buffer data
   * 
   * Note: Changes to this view are reflected in the native buffer
   */
  public async getView(): Promise<Uint8Array> {
    if (this.view) {
      return this.view;
    }
    
    const module = getUDPDirectModule();
    if (!module || this.bufferId === -1) {
      throw new Error('Buffer not available');
    }
    
    try {
      const viewMethod = module.getDirectBufferView || module.getBufferView;
      if (!viewMethod) {
        throw new Error('No getDirectBufferView or getBufferView method available');
      }
      
      const bufferView = await viewMethod(this.bufferId);
      
      if (!bufferView) {
        throw new Error('Failed to get buffer view - received null');
      }
      
      this.view = bufferView;
      return bufferView;
    } catch (error) {
      log('Error getting buffer view:', error);
      throw new Error(`Failed to get direct buffer view: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Write data to the buffer
   * 
   * @param data Data to write
   * @param offset Offset in the buffer (optional)
   */
  public async write(data: Uint8Array | string, offset: number = 0): Promise<number> {
    const module = getUDPDirectModule();
    if (!module || this.bufferId === -1) {
      throw new Error('Buffer not available');
    }
    
    try {
      const writeMethod = module.writeToDirectBuffer || module.writeToBuffer;
      if (!writeMethod) {
        throw new Error('No writeToDirectBuffer or writeToBuffer method available');
      }
      
      const bufferData = typeof data === 'string' ? 
        Buffer.from(data, 'utf-8') : 
        data;
      
      const bytesWritten = await writeMethod(
        this.bufferId, 
        bufferData, 
        offset
      );
      
      log(`Wrote ${bytesWritten} bytes to buffer ${this.bufferId} at offset ${offset}`);
      return bytesWritten;
    } catch (error) {
      log('Error writing to buffer:', error);
      throw new Error(`Failed to write to direct buffer: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Read data from the buffer
   * 
   * @param length Length to read (default: entire buffer)
   * @param offset Offset in the buffer (optional)
   */
  public async read(length?: number, offset: number = 0): Promise<Uint8Array> {
    const module = getUDPDirectModule();
    if (!module || this.bufferId === -1) {
      throw new Error('Buffer not available');
    }
    
    try {
      const size = await this.getSize();
      const readLength = length !== undefined ? length : size - offset;
      
      if (offset + readLength > size) {
        throw new Error(`Read would exceed buffer size (offset ${offset} + length ${readLength} > size ${size})`);
      }
      
      // Try to use getView and slice for efficiency if available
      if (this.view || (module.getDirectBufferView || module.getBufferView)) {
        const view = await this.getView();
        return view.slice(offset, offset + readLength);
      }
      
      // Fall back to readFromDirectBuffer if available
      const readMethod = module.readFromDirectBuffer || module.readFromBuffer;
      if (!readMethod) {
        throw new Error('No readFromDirectBuffer or readFromBuffer method available');
      }
      
      return readMethod(this.bufferId, readLength, offset);
    } catch (error) {
      log('Error reading from buffer:', error);
      throw new Error(`Failed to read from direct buffer: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Check if the buffer has been released
   */
  public isReleased(): boolean {
    return this.bufferId === -1;
  }
  
  /**
   * Clean up resources
   */
  public async destroy(): Promise<void> {
    try {
      await this.release();
    } catch (error) {
      log('Error during buffer destroy:', error);
    }
  }
}

/**
 * Simple DirectBuffer pool implementation
 */
export class DirectBufferPool {
  private buffers: Map<number, DirectBuffer> = new Map();
  private nextId: number = 1;
  
  /**
   * Create a new buffer in the pool
   */
  public async createBuffer(size: number): Promise<DirectBuffer> {
    const buffer = await DirectBuffer.create(size);
    this.buffers.set(this.nextId++, buffer);
    return buffer;
  }
  
  /**
   * Release a buffer back to the pool
   */
  public async releaseBuffer(buffer: DirectBuffer): Promise<boolean> {
    for (const [id, existingBuffer] of this.buffers.entries()) {
      if (existingBuffer === buffer) {
        const result = await buffer.release();
        this.buffers.delete(id);
        return result;
      }
    }
    return false;
  }
  
  /**
   * Clean up all buffers in the pool
   */
  public async releaseAll(): Promise<void> {
    for (const buffer of this.buffers.values()) {
      try {
        await buffer.release();
      } catch (error) {
        log('Error releasing buffer in pool cleanup:', error);
      }
    }
    this.buffers.clear();
  }
  
  /**
   * Get the number of buffers in the pool
   */
  public getBufferCount(): number {
    return this.buffers.size;
  }
}

// Singleton DirectBufferPool
let directBufferPool: DirectBufferPool | null = null;

/**
 * Get the singleton DirectBufferPool instance
 */
export function getDirectBufferPool(): DirectBufferPool {
  if (!directBufferPool) {
    directBufferPool = new DirectBufferPool();
  }
  return directBufferPool;
}

/**
 * Check if direct buffer support is available and properly configured
 */
export function checkDirectBufferSupport(): boolean {
  try {
    const module = getUDPDirectModule();
    if (!module) return false;
    
    // Check for essential methods with fall back to alternative names
    const hasCreateMethod = typeof module.createDirectBuffer === 'function' || 
                            typeof module.createBuffer === 'function';
                            
    const hasReleaseMethod = typeof module.releaseDirectBuffer === 'function' || 
                             typeof module.releaseBuffer === 'function';
    
    // Log results
    log(`DirectBuffer support check: createMethod=${hasCreateMethod}, releaseMethod=${hasReleaseMethod}`);
    
    return hasCreateMethod && hasReleaseMethod;
  } catch (error) {
    log('Error checking direct buffer support:', error);
    return false;
  }
}

/**
 * Create a new direct buffer
 */
export async function createDirectBuffer(size: number): Promise<DirectBuffer> {
  return DirectBuffer.create(size);
}

/**
 * Release a direct buffer
 */
export async function releaseDirectBuffer(buffer: DirectBuffer): Promise<boolean> {
  return buffer.release();
}

export default {
  DirectBuffer,
  createDirectBuffer,
  releaseDirectBuffer,
  isDirectBufferSupported,
  checkDirectBufferSupport
}; 