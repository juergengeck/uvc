/**
 * Event Debugging Utilities
 * 
 * This file contains utilities for debugging event emissions in the application.
 */

// Import our utils message bus for debug events
import messageBusUtils from '../utils/message-bus';

/**
 * Patch the emit method of an OEvent to add debugging
 * @param event The OEvent to patch
 * @param eventName A descriptive name for the event
 * @returns The original event (patched in place)
 */
export function debugEvent<T extends Function>(event: any, eventName: string): any {
    if (!event || typeof event.emit !== 'function') {
        console.warn(`[EventDebug] Could not patch event '${eventName}' - not a valid event object`);
        return event;
    }

    const originalEmit = event.emit;
    
    // Replace the emit method with our debugging version
    event.emit = function(this: any, ...args: any[]) {
        console.log(`[EventDebug] Emitting event '${eventName}' with ${args.length} arguments`, 
                  args.length === 1 ? args[0] : args);
        
        const listenerCount = event._listeners ? event._listeners.length : 'unknown';
        console.log(`[EventDebug] Event '${eventName}' has ${listenerCount} listeners`);
        
        // Call the original emit method and return its result
        try {
            const result = originalEmit.apply(this, args);
            console.log(`[EventDebug] Event '${eventName}' emitted successfully`);
            return result;
        } catch (error) {
            console.error(`[EventDebug] Error emitting event '${eventName}':`, error);
            throw error;
        }
    };
    
    // Also patch the listen method to debug listener registrations
    const originalListen = event.listen;
    if (typeof originalListen === 'function') {
        event.listen = function(this: any, listener: Function) {
            console.log(`[EventDebug] Adding listener to event '${eventName}'`);
            
            // Call original listen but capture disconnect function
            const disconnectFn = originalListen.call(this, function(this: any, ...args: any[]) {
                console.log(`[EventDebug] Listener for event '${eventName}' called with ${args.length} arguments`);
                try {
                    const listenerResult = listener.apply(this, args);
                    console.log(`[EventDebug] Listener for event '${eventName}' executed successfully`);
                    return listenerResult;
                } catch (error) {
                    console.error(`[EventDebug] Error in listener for event '${eventName}':`, error);
                    throw error;
                }
            });
            
            const listenerCount = event._listeners ? event._listeners.length : 'unknown';
            console.log(`[EventDebug] Event '${eventName}' now has ${listenerCount} listeners`);
            
            // Create a wrapper around the disconnect function to track when it's called
            if (typeof disconnectFn === 'function') {
                return function disconnectWithLogging() {
                    console.log(`[EventDebug] Removing listener from event '${eventName}'`);
                    
                    // Call the original disconnect function
                    try {
                        disconnectFn();
                        
                        // Log the new count after removal
                        const newCount = event._listeners ? event._listeners.length : 'unknown';
                        console.log(`[EventDebug] Event '${eventName}' now has ${newCount} listeners after removal`);
                        
                        // Emit a specific event to our message bus for tracking
                        messageBusUtils.debugLog('EVENT_DEBUG', 'events.ts', `Listener removed from ${eventName}, remaining: ${newCount}`);
                    } catch (error) {
                        console.error(`[EventDebug] Error removing listener from event '${eventName}':`, error);
                        throw error;
                    }
                };
            }
            
            return disconnectFn;
        };
    }
    
    return event;
}

export class TypedEvent<T> {
    private listeners: ((data: T) => void | Promise<void>)[] = [];

    public listen(listener: (data: T) => void | Promise<void>): void {
        this.listeners.push(listener);
    }

    public async emit(data: T): Promise<void> {
        for (const listener of this.listeners) {
            await listener(data);
        }
    }

    public remove(listener: (data: T) => void | Promise<void>): void {
        const index = this.listeners.indexOf(listener);
        if (index !== -1) {
            this.listeners.splice(index, 1);
        }
    }

    public clear(): void {
        this.listeners = [];
    }
}

export default {
    TypedEvent
};