/**
 * Dynamic Debug Control
 * 
 * This module provides runtime control over one.core and one.models debug logging.
 * It allows enabling detailed bus logging during connection attempts and disabling
 * it afterwards to reduce noise in normal operation.
 */

// Import with optional fallback for missing functions
let setLogLevel: (level: string) => void;
let getLogLevel: () => string;
let enableLogging: () => void;
let disableLogging: () => void;
let isLoggingEnabled: () => boolean;

try {
    const loggingConfig = require('@refinio/one.core/lib/system/expo/logging-config.js');
    setLogLevel = loggingConfig.setLogLevel || (() => {});
    getLogLevel = loggingConfig.getLogLevel || (() => 'info');
    enableLogging = loggingConfig.enableLogging || (() => {});
    disableLogging = loggingConfig.disableLogging || (() => {});
    isLoggingEnabled = loggingConfig.isLoggingEnabled || (() => false);
} catch (error) {
    console.warn('[DynamicDebug] Could not import logging-config, using fallbacks:', error);
    setLogLevel = () => {};
    getLogLevel = () => 'info';
    enableLogging = () => {};
    disableLogging = () => {};
    isLoggingEnabled = () => false;
}
// Import MessageBus with fallback
let createMessageBus: (name: string) => any;

try {
    const messageBus = require('@refinio/one.core/lib/message-bus.js');
    createMessageBus = messageBus.createMessageBus || (() => ({
        on: () => {},
        off: () => {},
        send: () => {}
    }));
} catch (error) {
    console.warn('[DynamicDebug] Could not import message-bus, using fallback:', error);
    createMessageBus = () => ({
        on: () => {},
        off: () => {},
        send: () => {}
    });
}

export interface DebugState {
    isEnabled: boolean;
    previousLogLevel: string | null;
    wasLoggingEnabled: boolean;
    busListeners: Array<() => void>;
}

// Global state for debug control
let debugState: DebugState = {
    isEnabled: false,
    previousLogLevel: null,
    wasLoggingEnabled: false,
    busListeners: []
};

// Message bus for listening to one.core events
let debugBus: any = null;

/**
 * Enable verbose debugging for connection attempts
 * Should be called before attempting connections
 */
export function enableConnectionDebug(): void {
    if (debugState.isEnabled) {
        console.log('[DynamicDebug] Debug already enabled, skipping');
        return;
    }

    console.log('[DynamicDebug] 🔊 Enabling enhanced connection debugging...');
    
    // Save current state
    debugState.previousLogLevel = getLogLevel();
    debugState.wasLoggingEnabled = isLoggingEnabled();
    
    // Enable comprehensive logging
    setLogLevel('debug');
    enableLogging();
    
    // Set up message bus listeners for one.core events
    try {
        debugBus = createMessageBus('lama-connection-debug');
        
        // Listen for all relevant debug events
        const debugTypes = ['log', 'debug', 'info', 'warn', 'error', 'alert'];
        
        debugTypes.forEach(type => {
            const listener = (source: string, ...messages: any[]) => {
                // Filter for connection-related messages
                if (isConnectionRelated(source, messages)) {
                    console.log(`[ONE_MODELS_BUS_${type.toUpperCase()}] ${source}`, ...messages);
                }
            };
            
            // Check if debugBus has the 'on' method before using it
            if (debugBus && typeof debugBus.on === 'function') {
                debugBus.on(type, listener);
                
                // Only add cleanup if 'off' method exists
                if (typeof debugBus.off === 'function') {
                    debugState.busListeners.push(() => debugBus.off(type, listener));
                } else {
                    // Fallback: just store a no-op cleanup function
                    debugState.busListeners.push(() => {});
                }
            }
        });
        
        console.log('[DynamicDebug] ✅ MessageBus listeners established');
    } catch (error) {
        console.warn('[DynamicDebug] Could not set up MessageBus listeners:', error);
    }
    
    // Enable environment-based debug flags - REDUCED to avoid spam
    process.env.ONE_CORE_MESSAGE_BUS_DEBUG = 'false';
    process.env.ONE_MODELS_DEBUG = 'false';
    process.env.ONE_NETWORK_DEBUG = 'false';
    process.env.ONE_NETWORK_DEBUG_LEVEL = 'error';
    process.env.ONE_MODELS_PAIRING_DEBUG = 'false';
    process.env.ONE_MODELS_CONNECTION_DEBUG = 'false';
    
    // CRITICAL: Add connection handover debugging - BUT MINIMAL
    process.env.ONE_CORE_COMM_SERVER_DEBUG = 'false';
    process.env.ONE_CORE_HANDOVER_DEBUG = 'false';
    
    debugState.isEnabled = true;
    console.log('[DynamicDebug] 🔊 Connection debugging enabled with handover tracking');
}

/**
 * Disable verbose debugging and restore previous state
 * Should be called after connection attempt completes (success or failure)
 */
export function disableConnectionDebug(): void {
    if (!debugState.isEnabled) {
        console.log('[DynamicDebug] Debug not enabled, skipping disable');
        return;
    }

    console.log('[DynamicDebug] 🔇 Disabling verbose connection debugging...');
    
    // Clean up message bus listeners
    debugState.busListeners.forEach((cleanup, index) => {
        try {
            if (typeof cleanup === 'function') {
                cleanup();
            }
        } catch (error) {
            // Silently skip cleanup errors - the bus might not support off()
        }
    });
    debugState.busListeners = [];
    
    // Restore previous logging state
    if (debugState.previousLogLevel) {
        setLogLevel(debugState.previousLogLevel);
    }
    
    if (!debugState.wasLoggingEnabled) {
        disableLogging();
    }
    
    // Disable environment debug flags
    process.env.ONE_CORE_MESSAGE_BUS_DEBUG = 'false';
    process.env.ONE_MODELS_DEBUG = 'false';
    process.env.ONE_NETWORK_DEBUG = 'false';
    process.env.ONE_NETWORK_DEBUG_LEVEL = 'error';
    
    // Reset state
    debugState = {
        isEnabled: false,
        previousLogLevel: null,
        wasLoggingEnabled: false,
        busListeners: []
    };
    
    console.log('[DynamicDebug] 🔇 Connection debugging disabled');
}

/**
 * Check if a message is connection-related and should be logged
 */
function isConnectionRelated(source: string, messages: any[]): boolean {
    const connectionKeywords = [
        'ConnectionsModel',
        'CommunicationServerListener', 
        'CommunicationServer',
        'CommServer',
        'IncomingConnection',
        'OutgoingConnection',
        'PairingManager',
        'LeuteConnectionsModule',
        'WebSocket',
        'connection',
        'pairing',
        'handshake',
        'register',
        'authentication',
        'invitation',
        'createInvitation',
        'acceptInvitation',
        'connectUsingInvitation',
        'token',
        'publicKey',
        'routing',
        'route',
        'message',
        'incoming',
        'protocol',
        'chum',
        'data',
        'receive',
        'send',
        'establishConnection',
        'Connection Lifecycle',
        'Step',
        'handover',
        'connection_handover',
        'communication_request',
        'ConnectionRouteManager',
        'acceptConnection',
        'exchangeConnectionGroupName',
        'sync'
    ];
    
    // Skip noise: storage locks, version merging, settings
    const noiseKeywords = [
        'SERIALIZE:EXPO',
        'Acquiring lock',
        'Fully released lock',
        'VersionMap',
        'VersionMerge',
        'ReverseMap',
        'diffObjects',
        'mergeObjects',
        'Settings',
        'propertyTree',
        'ChannelManager',
        'entryIterator',
        'singleChannelObjectIterator',
        'mergeIteratorMostCurrent',
        'getMatchingChannelInfos',
        'Channel has no head pointer'
    ];
    
    // Check if it's noise first
    const messageText = messages.join(' ');
    const isNoise = noiseKeywords.some(keyword =>
        messageText.includes(keyword) || source.includes(keyword)
    );
    
    if (isNoise) {
        return false;
    }
    
    // Check source
    const sourceMatches = connectionKeywords.some(keyword => 
        source.toLowerCase().includes(keyword.toLowerCase())
    );
    
    // Check message content
    const messageLower = messageText.toLowerCase();
    const messageMatches = connectionKeywords.some(keyword =>
        messageLower.includes(keyword.toLowerCase())
    );
    
    return sourceMatches || messageMatches;
}

/**
 * Wrapper function to enable debug, run a connection operation, then disable debug
 */
export async function withConnectionDebug<T>(
    operation: () => Promise<T>,
    operationName = 'connection operation'
): Promise<T> {
    console.log(`[DynamicDebug] 🎯 Starting ${operationName} with debug enabled`);
    
    enableConnectionDebug();
    
    try {
        const result = await operation();
        console.log(`[DynamicDebug] ✅ ${operationName} completed successfully`);
        return result;
    } catch (error) {
        console.log(`[DynamicDebug] ❌ ${operationName} failed:`, error);
        throw error;
    } finally {
        disableConnectionDebug();
    }
}

/**
 * Get current debug state for inspection
 */
export function getDebugState(): Readonly<DebugState> {
    return { ...debugState };
}

/**
 * Force disable all debugging (emergency stop)
 */
export function forceDisableAllDebug(): void {
    console.log('[DynamicDebug] 🚨 Force disabling all debug output');
    
    disableLogging();
    setLogLevel('error');
    
    // Disable all environment flags
    process.env.ONE_CORE_MESSAGE_BUS_DEBUG = 'false';
    process.env.ONE_MODELS_DEBUG = 'false';
    process.env.ONE_NETWORK_DEBUG = 'false';
    process.env.ONE_CORE_DEBUG = 'false';
    process.env.ONE_MODELS_CHANNEL_DEBUG = 'false';
    process.env.DEBUG = '';
    
    // Clean up any remaining listeners
    debugState.busListeners.forEach(cleanup => {
        try {
            cleanup();
        } catch {}
    });
    
    debugState = {
        isEnabled: false,
        previousLogLevel: null,
        wasLoggingEnabled: false,
        busListeners: []
    };
    
    console.log('[DynamicDebug] 🚨 All debug output force disabled');
} 