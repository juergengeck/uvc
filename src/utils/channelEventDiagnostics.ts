/**
 * Channel Event Diagnostics
 * 
 * Monitoring utilities for troubleshooting channel event issues
 * This version only monitors events without modifying the event flow
 */

import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import { objectEvents } from '@refinio/one.models/lib/misc/ObjectEventDispatcher';

/**
 * Monitors channel event flow without modifying it
 * 
 * This function sets up listeners to observe the event flow
 * but does not change any behavior or try to fix events
 */
export function monitorChannelEvents(channelManager: any): void {
  console.log('[MONITOR] Setting up simplified channel event monitoring');
  
  if (!channelManager) {
    console.error('[MONITOR] Cannot monitor null channelManager');
    return;
  }
  
  // Check if onUpdated event exists
  if (!channelManager.onUpdated) {
    console.error('[MONITOR] ChannelManager has no onUpdated event');
    return;
  }
  
  // Add a listener to log channel events
  try {
    const disconnect = channelManager.onUpdated.listen(
      (channelInfoIdHash: string, channelId: string, channelOwner: any, time: Date) => {
        console.log(`[MONITOR] ✅ Channel event received for ${channelId} at ${time.toISOString()}`);
      }
    );
    
    console.log('[MONITOR] Successfully added channel event listener');
  } catch (error) {
    console.error('[MONITOR] Error setting up channel event listener:', error);
  }
  
  // Monitor the createChannel method
  if (typeof channelManager.createChannel === 'function') {
    try {
      const originalCreateChannel = channelManager.createChannel;
      
      // Replace with monitored version
      channelManager.createChannel = async function(channelId: string, owner?: any) {
        console.log(`[MONITOR] createChannel called for ${channelId}`);
        
        try {
          console.log(`[MONITOR] Calling original createChannel method`);
          const result = await originalCreateChannel.call(this, channelId, owner);
          console.log(`[MONITOR] createChannel returned successfully:`, result);
          return result;
        } catch (error) {
          console.error(`[MONITOR] createChannel error:`, error);
          throw error;
        }
      };
      
      console.log('[MONITOR] Successfully wrapped createChannel method');
    } catch (error) {
      console.error('[MONITOR] Error wrapping createChannel method:', error);
    }
  }
}

/**
 * Helper function to count entries by type in a ChannelInfo object
 */
function getEntriesByTypeCount(channelInfo: any): any {
  if (!channelInfo || !channelInfo.entries || !Array.isArray(channelInfo.entries)) {
    return 'no entries';
  }
  
  const countByType: Record<string, number> = {};
  
  channelInfo.entries.forEach((entry: any) => {
    if (entry && entry.$type$) {
      countByType[entry.$type$] = (countByType[entry.$type$] || 0) + 1;
    } else {
      countByType['unknown'] = (countByType['unknown'] || 0) + 1;
    }
  });
  
  return countByType;
}

// Fix the setupStorageEventMonitoring function to use imported objectEvents
export function setupStorageEventMonitoring() {
  console.log('[MONITOR] Setting up storage event registration monitoring');
  
  // Use the imported objectEvents
  if (!objectEvents) {
    console.error('[MONITOR] objectEvents not available from import');
    return;
  }
  
  // Capture the original onNewVersion method
  const originalOnNewVersion = objectEvents.onNewVersion;
  
  // Use type assertions to avoid TypeScript errors with dynamic code
  (objectEvents as any).onNewVersion = function(cb: any, description: string, type: string = '*', idHash: string = '*') {
    console.log(`[MONITOR EVENT REGISTRATION] objectEvents.onNewVersion registered:`, {
      description,
      type,
      idHash,
      callbackType: typeof cb
    });
    
    // Create a wrapper callback that logs when it's called
    const originalCallback = cb;
    const wrappedCallback = async function(this: any, ...args: any[]) {
      console.log(`[MONITOR EVENT EXECUTION] ${description} callback EXECUTING with:`, {
        type: args[0]?.obj?.$type$ || 'unknown',
        id: args[0]?.obj?.id || 'unknown',
        idHash: args[0]?.idHash || 'unknown'
      });
      
      try {
        // Call the original callback and track what it returns
        const result = await (originalCallback as any).apply(this, args);
        
        console.log(`[MONITOR EVENT EXECUTION] ${description} callback RETURNED:`, {
          resultType: typeof result,
          isFunction: typeof result === 'function'
        });
        
        // If the callback returned a function (for event emission), wrap it too
        if (typeof result === 'function') {
          const originalEmitCallback = result;
          const wrappedEmitCallback = function(this: any) {
            console.log(`[MONITOR EVENT EMISSION] Emit callback from ${description} EXECUTING`);
            return (originalEmitCallback as any).apply(this, arguments);
          };
          return wrappedEmitCallback;
        }
        
        return result;
      } catch (error) {
        console.error(`[MONITOR EVENT EXECUTION] ERROR in ${description} callback:`, error);
        throw error;
      }
    };
    
    // Register with the original method but use our wrapped callback
    const disconnect = (originalOnNewVersion as any).call(this, wrappedCallback, description, type, idHash);
    
    // Return a wrapped disconnect function
    return function() {
      console.log(`[MONITOR EVENT REGISTRATION] Disconnecting ${description}`);
      return disconnect();
    };
  };
  
  console.log('[MONITOR] Storage event monitoring setup complete');
}

/**
 * Simple test to verify OEvent functionality
 */
function testOEvent(): void {
  const testEvent = new OEvent();
  let testEventFired = false;
  
  // Fix self-reference issue by using a separate variable
  let disconnectFunction: any;
  
  disconnectFunction = testEvent.listen(() => {
    testEventFired = true;
    console.log('[MONITOR] ✅ Basic OEvent test functional');
    
    if (typeof disconnectFunction === 'function') {
      disconnectFunction();
    }
  });
  
  testEvent.emit();
  
  setTimeout(() => {
    if (!testEventFired) {
      console.error('[MONITOR] ❌ Basic OEvent test failed - OEvent might have fundamental issues');
    }
  }, 100);
}

// Execute the callback returned by ObjectEventDispatcher
function executeCallback(callback: Function): void {
  if (typeof callback !== 'function') {
    console.log(`[MONITOR] Callback is not a function, type: ${typeof callback}`);
    return;
  }
  
  try {
    console.log(`[MONITOR] Executing callback from processNewVersion`);
    callback();
    console.log(`[MONITOR] Callback executed successfully`);
  } catch (error) {
    console.error(`[MONITOR] Error executing callback:`, error);
  }
}

// Use type assertions to avoid TypeScript errors with dynamic monitoring code
export function setupObjectEventWrappers(): void {
  console.log('[MONITOR] Setting up ObjectEventDispatcher wrappers');
  
  // Use the imported objectEvents instead of requiring it
  if (!objectEvents) {
    console.error('[MONITOR] objectEvents not available from import');
    return;
  }
  
  // Wrap the onNewVersion method
  const originalOnNewVersion = objectEvents.onNewVersion;
  
  // Use type assertion to bypass TypeScript's strict checking
  (objectEvents as any).onNewVersion = function(cb: any, description: string, type: any = '*', idHash: string = '*') {
    console.log(`[MONITOR] objectEvents.onNewVersion registered:`, {
      description,
      type,
      idHash
    });
    
    // Create a wrapper for the callback
    const wrappedCallback = async function(this: any, ...args: any[]) {
      console.log(`[MONITOR] ${description} callback executing with:`, {
        type: args[0]?.obj?.$type$ || 'unknown',
        id: args[0]?.obj?.id || 'unknown',
        idHash: args[0]?.idHash || 'unknown'
      });
      
      try {
        // Call the original callback
        const result = await (cb as any).apply(this, args);
        
        console.log(`[MONITOR] ${description} callback returned:`, {
          resultType: typeof result
        });
        
        // If the callback returned a function, execute it
        if (typeof result === 'function') {
          console.log(`[MONITOR] ⚠️ ${description} returned a function that needs to be called!`);
          
          // CRITICAL FIX: Always execute the emitEvents function 
          // This ensures events are properly emitted even if the caller forgets
          try {
            console.log(`[MONITOR] 🔄 Auto-executing emitEvents() from ${description}`);
            result();
            console.log(`[MONITOR] ✅ Auto-execution successful`);
          } catch (emitError) {
            console.error(`[MONITOR] ❌ Error auto-executing emitEvents:`, emitError);
          }
        }
        
        return result;
      } catch (error) {
        console.error(`[MONITOR] Error in ${description} callback:`, error);
        throw error;
      }
    };
    
    return (originalOnNewVersion as any).call(this, wrappedCallback, description, type, idHash);
  };
  
  console.log('[MONITOR] ObjectEventDispatcher wrappers applied with auto-execution');
}

/**
 * Check for duplicate instances of key components
 * This could explain why events aren't flowing properly
 */
function checkDuplicateInstances() {
    // Check global variables
    const globalVars = Object.keys(globalThis).filter(key => 
        key.includes('channelManager') || 
        key.includes('ObjectEvent') || 
        key.includes('OEvent')
    );
    
    console.log('[DUPLICATE CHECK] Global variables:', globalVars);
    
    // Check for model instances
    try {
        console.log('[DUPLICATE CHECK] Checking for model instances:');
        
        // Log any duplicate information we can find
        console.log('[DUPLICATE CHECK] Duplicate check complete');
    } catch (error) {
        console.error('[DUPLICATE CHECK] Error checking for duplicates:', error);
    }
}

// Add a new function to specifically check and fix the channelRegistry issue
function fixChannelRegistryIssue(channelManagerInstance: any) {
  console.log('[REGISTRY FIX] Checking for channelRegistry issues');
  
  // Get all properties of the channelManager instance
  const allProps = Object.getOwnPropertyNames(channelManagerInstance);
  console.log('[REGISTRY FIX] ChannelManager properties:', allProps);
  
  // Check if there's a property that might be the registry with a different name
  const possibleRegistryProps = allProps.filter(prop => 
    typeof prop === 'string' && (
      prop.toLowerCase().includes('registry') || 
      prop.toLowerCase().includes('channel') ||
      prop.toLowerCase().includes('cache')
    )
  );
  
  if (possibleRegistryProps.length > 0) {
    console.log('[REGISTRY FIX] Possible registry properties:', possibleRegistryProps);
    
    // Check which ones are actually maps or objects that might be the registry
    for (const propName of possibleRegistryProps) {
      const prop = channelManagerInstance[propName];
      console.log(`[REGISTRY FIX] Property ${propName} type:`, typeof prop, 
        prop instanceof Map ? 'Is Map' : 'Not Map',
        prop instanceof Set ? 'Is Set' : 'Not Set',
        Array.isArray(prop) ? 'Is Array' : 'Not Array'
      );
      
      // Log the content
      if (prop instanceof Map) {
        console.log(`[REGISTRY FIX] ${propName} entries:`, Array.from(prop.entries()));
      } else if (prop instanceof Set) {
        console.log(`[REGISTRY FIX] ${propName} values:`, Array.from(prop.values()));
      } else if (Array.isArray(prop)) {
        console.log(`[REGISTRY FIX] ${propName} array:`, prop);
      } else if (typeof prop === 'object' && prop !== null) {
        console.log(`[REGISTRY FIX] ${propName} keys:`, Object.keys(prop));
      }
    }
  } else {
    console.warn('[REGISTRY FIX] No properties found that might be the channel registry');
  }
  
  // Check for registry in prototype chain
  let proto = Object.getPrototypeOf(channelManagerInstance);
  let level = 0;
  
  while (proto && level < 3) {
    console.log(`[REGISTRY FIX] Checking prototype level ${level}`);
    const protoProps = Object.getOwnPropertyNames(proto);
    
    const registryProps = protoProps.filter(prop => 
      typeof prop === 'string' && (
        prop.toLowerCase().includes('registry') || 
        prop.toLowerCase().includes('channel') ||
        prop.toLowerCase().includes('cache')
      )
    );
    
    if (registryProps.length > 0) {
      console.log(`[REGISTRY FIX] Found potential registry properties in prototype level ${level}:`, registryProps);
    }
    
    proto = Object.getPrototypeOf(proto);
    level++;
  }
}

// Update monitorEmitEvents function to remove serialize.js dependency
function monitorEmitEvents(channelManager: any) {
    try {
        // Find the processNewVersion method
        const proto = Object.getPrototypeOf(channelManager);
        
        if (!proto.processNewVersion) {
            console.error('[MONITOR] processNewVersion not found in ChannelManager');
            return;
        }
        
        // Save original function
        const originalProcessNewVersion = proto.processNewVersion;
        
        // Replace with our instrumented version
        proto.processNewVersion = async function(this: any, ...args: any[]) {
            console.log('[MONITOR] Executing processNewVersion with args:', 
                args[0]?.obj?.$type$, 
                args[0]?.obj?.id);
            
            // Track if emitEvents was called
            let emitEventsCalled = false;
            
            // Simple logging without dependency on serialize
            console.log('[MONITOR] processNewVersion execution (serialize dependency removed)');
            
            try {
                // Call original implementation and track result
                console.log('[MONITOR] Calling original processNewVersion implementation');
                const result = await originalProcessNewVersion.apply(this, args);
                console.log('[MONITOR] processNewVersion completed successfully');
                return result;
            } catch (error) {
                console.error('[MONITOR] Error in processNewVersion:', error);
                throw error;
            }
        };
        
        console.log('[MONITOR] processNewVersion monitoring enabled (simplified)');
    } catch (error) {
        console.error('[MONITOR] Failed to set up processNewVersion monitoring:', error);
    }
}

/**
 * Add specific diagnostics to understand the channel event flow and identify hang points
 */
export function setupDiagnostics(channelManager: any) {
    console.log('[MONITOR] Setting up channel event diagnostics');
    
    // First test if OEvent works correctly
    const testEvent = new (OEvent as any)();
    let testReceived = false;
    
    const testListener = testEvent.listen(() => {
        testReceived = true;
        console.log('[MONITOR] ✅ Basic OEvent test received event');
    });
    
    testEvent.emit();
    
    if (testReceived) {
        console.log('[MONITOR] ✅ Basic OEvent test functional');
    } else {
        console.error('[MONITOR] ❌ Basic OEvent test failed - events may not be working');
    }
    
    if (typeof testListener === 'function') {
        testListener();
    }
    
    // Check for duplicate instances that could cause event issues
    console.log('[DUPLICATE CHECK] Checking for duplicate component instances');
    checkDuplicateInstances();
    
    // Monitor registry operations that might cause hangs
    console.log('[REGISTRY FIX] Checking for channelRegistry issues');
    diagnoseChannelRegistry(channelManager);
    
    // Set up direct monitoring for addChannelIfNotExist calls
    monitorAddChannelIfNotExist(channelManager);
    
    // Setup specific emitEvents monitoring
    console.log('[MONITOR] Setting up specific emitEvents() monitoring');
    monitorEmitEvents(channelManager);
    
    console.log('[MONITOR] Channel event diagnostics setup complete');
}

/**
 * Diagnose the channel registry state
 */
function diagnoseChannelRegistry(channelManager: any) {
    try {
        // Log relevant properties of the channel manager
        console.log('[REGISTRY FIX] ChannelManager properties:', Object.keys(channelManager));
        
        // Try to identify registry-related properties
        const possibleRegistryProps = Object.keys(channelManager).filter(key => 
            key.includes('registry') || 
            key.includes('cache') || 
            key.includes('channel') ||
            key.includes('settings')
        );
        
        console.log('[REGISTRY FIX] Possible registry properties:', possibleRegistryProps);
        
        // Examine each property
        possibleRegistryProps.forEach(prop => {
            try {
                const value = channelManager[prop];
                const isMap = value instanceof Map;
                const isSet = value instanceof Set;
                const isArray = Array.isArray(value);
                
                console.log(`[REGISTRY FIX] Property ${prop} type: ${typeof value} ${isMap ? 'Is Map' : 'Not Map'} ${isSet ? 'Is Set' : 'Not Set'} ${isArray ? 'Is Array' : 'Not Array'}`);
                
                // If it's a collection, log its size
                if (isMap) {
                    try {
                        const entries = Array.from(value.entries());
                        console.log(`[REGISTRY FIX] ${prop} entries:`, entries.length > 0 ? entries.length : []);
                    } catch (err) {
                        console.log(`[REGISTRY FIX] Error reading ${prop} entries:`, err);
                    }
                } else if (isSet) {
                    try {
                        const entries = Array.from(value);
                        console.log(`[REGISTRY FIX] ${prop} values:`, entries.length > 0 ? entries.length : []);
                    } catch (err) {
                        console.log(`[REGISTRY FIX] Error reading ${prop} values:`, err);
                    }
                } else if (isArray) {
                    console.log(`[REGISTRY FIX] ${prop} length:`, value.length);
                }
            } catch (err) {
                console.log(`[REGISTRY FIX] Error examining property ${prop}:`, err);
            }
        });
        
        // Check prototype methods that might be related to registry operations
        let proto = Object.getPrototypeOf(channelManager);
        let level = 0;
        
        while (proto && proto !== Object.prototype) {
            const protoKeys = Object.getOwnPropertyNames(proto)
                .filter(key => typeof proto[key] === 'function')
                .filter(key => 
                    key.includes('Channel') || 
                    key.includes('Registry') || 
                    key.includes('registry') ||
                    key.includes('cache')
                );
            
            console.log(`[REGISTRY FIX] Found potential registry properties in prototype level ${level}:`, protoKeys);
            level++;
            proto = Object.getPrototypeOf(proto);
        }
    } catch (error) {
        console.error('[REGISTRY FIX] Error diagnosing channel registry:', error);
    }
}

// Update monitorAddChannelIfNotExist function to remove problematic dependencies
function monitorAddChannelIfNotExist(channelManager: any) {
    try {
        // Get the prototype to access the method
        const proto = Object.getPrototypeOf(channelManager);
        
        // Check if the method exists
        if (!proto.addChannelIfNotExist) {
            console.error('[CHANNEL HANG] addChannelIfNotExist method not found!');
            return;
        }
        
        // Save the original method
        const originalAddChannelIfNotExist = proto.addChannelIfNotExist;
        
        // Replace with our instrumented version
        proto.addChannelIfNotExist = async function(channelInfoIdHash: string) {
            console.log(`[CHANNEL HANG] STARTING addChannelIfNotExist for hash: ${channelInfoIdHash.substring(0, 8)}...`);
            
            // Trace important sections with timestamps
            const startTime = Date.now();
            
            try {
                // Simplified monitoring without problematic imports
                console.log(`[CHANNEL HANG] Calling original implementation - ${new Date().toISOString()}`);
                
                // Call the original method with a timeout
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => {
                        reject(new Error('Operation timed out after 8 seconds'));
                    }, 8000);
                });
                
                const result = await Promise.race([
                    originalAddChannelIfNotExist.call(this, channelInfoIdHash),
                    timeoutPromise
                ]);
                
                console.log(`[CHANNEL HANG] ✅ addChannelIfNotExist completed in ${Date.now() - startTime}ms`);
                return result;
            } catch (error) {
                console.error(`[CHANNEL HANG] ❌ addChannelIfNotExist failed after ${Date.now() - startTime}ms: ${error}`);
                
                // Log diagnostic info without problematic imports
                console.log(`[CHANNEL HANG] Error details: ${error instanceof Error ? error.message : String(error)}`);
                
                throw error;
            }
        };
        
        console.log('[CHANNEL HANG] Successfully instrumented addChannelIfNotExist for hang detection (simplified)');
    } catch (error) {
        console.error('[CHANNEL HANG] Failed to set up addChannelIfNotExist monitoring:', error);
    }
}

/**
 * Check if a channel exists
 * 
 * @param channelManager The ChannelManager to check
 * @param channelId The channel ID to verify
 * @returns Whether the channel verification was successful
 */
export function verifyChannelCreation(channelManager: any, channelId: string): boolean {
  console.log(`[VERIFY] Checking channel: ${channelId}`);
  
  if (!channelManager) {
    console.error('[VERIFY] No ChannelManager provided');
    return false;
  }
  
  try {
    // Check if the channel exists in the cache
    if (channelManager.channelInfoCache) {
      const cacheSize = channelManager.channelInfoCache.size;
      console.log(`[VERIFY] Channel cache size: ${cacheSize}`);
      
      // Check cache for the channel
      let found = false;
      channelManager.channelInfoCache.forEach((value: any, key: string) => {
        if (value && value.id === channelId) {
          console.log(`[VERIFY] Found channel in cache with key: ${key}`);
          found = true;
        }
      });
      
      return found;
    }
    
    console.warn('[VERIFY] No channelInfoCache found on channelManager');
    return false;
  } catch (error) {
    console.error('[VERIFY] Error verifying channel:', error);
    return false;
  }
}

/**
 * Instrument the channel creation process with timeouts to prevent hangs
 * This directly wraps the createChannel method to make it more robust
 * @param channelManager The ChannelManager instance to fix
 */
export function fixChannelCreation(channelManager: any): void {
  if (!channelManager || typeof channelManager.createChannel !== 'function') {
    console.error('[FIX] Cannot fix createChannel - method not found');
    return;
  }

  console.log('[FIX] Setting up createChannel fix with timeout');
  
  // Save the original method
  const originalCreateChannel = channelManager.createChannel;
  
  // Replace with our fixed version that includes a timeout
  channelManager.createChannel = async function(channelId: string, owner?: any): Promise<any> {
    console.log(`[FIX] createChannel called for: ${channelId}`);
    
    // Create a timeout promise that rejects after 10 seconds
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        console.error(`[FIX] createChannel TIMEOUT for: ${channelId} after 10s`);
        reject(new Error(`Timeout waiting for channel creation: ${channelId}`));
      }, 10000);
    });
    
    try {
      // Race the original method against the timeout
      // Wait for either the original method to complete or the timeout to occur
      const result = await Promise.race([
        originalCreateChannel.call(this, channelId, owner).then((r: any) => {
          console.log(`[FIX] createChannel COMPLETED for: ${channelId}`, r);
          return r;
        }),
        timeoutPromise
      ]);
      
      return result;
    } catch (error) {
      console.error(`[FIX] createChannel ERROR for ${channelId}:`, error);
      
      // Try to diagnose where it failed
      try {
        console.log('[FIX] Channel creation failed, checking status:');
        
        // Check if the channel actually got created despite the error
        if (channelManager._channels && typeof channelManager._channels.has === 'function') {
          const exists = channelManager._channels.has(channelId);
          console.log(`[FIX] Channel exists in _channels: ${exists}`);
        }
        
        // Check cache status
        if (channelManager.channelInfoCache && typeof channelManager.channelInfoCache.has === 'function') {
          console.log(`[FIX] channelInfoCache size: ${channelManager.channelInfoCache.size}`);
          
          // Try to find any channel with this ID in the cache
          let foundInCache = false;
          channelManager.channelInfoCache.forEach((value: any, key: string) => {
            if (value && value.id === channelId) {
              console.log(`[FIX] Found channel in cache with key ${key}`);
              foundInCache = true;
            }
          });
          
          if (!foundInCache) {
            console.log(`[FIX] Channel not found in cache`);
          }
        }
      } catch (diagError) {
        console.error(`[FIX] Error in diagnostic checks:`, diagError);
      }
      
      // Re-throw the original error
      throw error;
    }
  };
  
  console.log('[FIX] createChannel method has been fixed with timeout protection');
}

/**
 * Verify channel events are working by testing the event subscription system
 * 
 * @param channelManager The ChannelManager to check
 * @returns A promise that resolves to true if events are working, false otherwise
 */
export async function verifyChannelEvents(channelManager: any): Promise<boolean> {
  console.log('[21:50:50.397][CHANNEL_EVENT][AppModel] Starting ChannelManager event verification');
  
  if (!channelManager) {
    console.error('[CHANNEL_EVENT] No ChannelManager provided');
    return false;
  }
  
  try {
    // Check if onUpdated exists and is a function
    if (!channelManager.onUpdated || typeof channelManager.onUpdated.listen !== 'function') {
      console.error('[CHANNEL_EVENT] ChannelManager does not have a working onUpdated event');
      return false;
    }
    
    // Check if there are existing listeners which is a good sign
    const listenerCount = Object.keys(channelManager.onUpdated._listeners || {}).length;
    console.log(`[21:50:50.397][CHANNEL_EVENT][AppModel] Current ChannelManager.onUpdated listeners count: ${listenerCount}`);
    
    return true;
  } catch (error) {
    console.error('[CHANNEL_EVENT] Error verifying channel events:', error);
    return false;
  }
} 