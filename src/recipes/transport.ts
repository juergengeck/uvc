import type { Recipe, RecipeRule } from '@refinio/one.core/lib/recipes.js'

/**
 * Transport Configuration - Stores transport configuration and connection details
 * 
 * This recipe defines transport configuration objects that can be stored
 * in the ONE system, allowing for multiple transport instances (e.g., multiple
 * commservers, P2P networks, BLE configurations) to be managed persistently.
 * 
 * Similar to how LLM objects work, TransportConfig objects are versioned
 * and stored in channels for content-addressed retrieval.
 */
export const TransportConfigRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'TransportConfig',
    rule: [
        {
            itemprop: '$type$',
            itemtype: { type: 'string', regexp: /^TransportConfig$/ }
        },
        {
            itemprop: 'name',
            itemtype: { type: 'string' },
            isId: true
        },
        {
            itemprop: 'transportType',
            itemtype: { 
                type: 'string',
                regexp: /^(comm_server|p2p_udp|ble_direct)$/
            }
        },
        {
            itemprop: 'active',
            itemtype: { type: 'boolean' }
        },
        {
            itemprop: 'deleted',
            itemtype: { type: 'boolean' }
        },
        {
            itemprop: 'creator',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            itemprop: 'created',
            itemtype: { type: 'number' }
        },
        {
            itemprop: 'modified',
            itemtype: { type: 'number' }
        },
        {
            itemprop: 'createdAt',
            itemtype: { type: 'string' }
        },
        {
            itemprop: 'lastUsed',
            itemtype: { type: 'string' }
        },
        
        // Transport-specific configuration
        {
            itemprop: 'commServerUrl',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            itemprop: 'reconnectInterval',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'maxReconnectAttempts',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'connectionTimeout',
            itemtype: { type: 'number' },
            optional: true
        },
        
        // P2P/UDP specific
        {
            itemprop: 'udpPort',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'discoveryInterval',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'discoveryTimeout',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'networkInterface',
            itemtype: { type: 'string' },
            optional: true
        },
        
        // BLE specific
        {
            itemprop: 'serviceUUID',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            itemprop: 'characteristicUUID',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            itemprop: 'scanTimeout',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'mtu',
            itemtype: { type: 'number' },
            optional: true
        },
        
        // Connection statistics and metadata
        {
            itemprop: 'totalConnections',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'connectionFailures',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'averageConnectionTime',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'bytesSent',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'bytesReceived',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'uptime',
            itemtype: { type: 'number' },
            optional: true
        },
        
        // Priority and preferences
        {
            itemprop: 'priority',
            itemtype: { 
                type: 'string',
                regexp: /^(low|medium|high)$/
            },
            optional: true
        },
        {
            itemprop: 'reliability',
            itemtype: { 
                type: 'string',
                regexp: /^(low|medium|high)$/
            },
            optional: true
        },
        {
            itemprop: 'capabilities',
            itemtype: { 
                type: 'array', 
                item: { 
                    type: 'string',
                    regexp: /^(bidirectional|reliable|encrypted|fileTransfer|offline)$/
                } 
            },
            optional: true
        }
    ]
};

/**
 * Connection Instance - Stores active connection state and metadata
 * 
 * This recipe defines connection instance objects that track active
 * connections for each transport. Similar to how LLM objects reference
 * Person objects, ConnectionInstance objects reference TransportConfig objects.
 */
export const ConnectionInstanceRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'ConnectionInstance',
    rule: [
        {
            itemprop: '$type$',
            itemtype: { type: 'string', regexp: /^ConnectionInstance$/ }
        },
        {
            itemprop: 'connectionId',
            itemtype: { type: 'string' },
            isId: true
        },
        {
            itemprop: 'transportConfigId',
            itemtype: { 
                type: 'referenceToId', 
                allowedTypes: new Set(['TransportConfig']) 
            }
        },
        {
            itemprop: 'status',
            itemtype: { 
                type: 'string',
                regexp: /^(connecting|connected|disconnecting|disconnected|error)$/
            }
        },
        {
            itemprop: 'targetDeviceId',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            itemprop: 'targetPersonId',
            itemtype: { 
                type: 'referenceToId', 
                allowedTypes: new Set(['Person']) 
            },
            optional: true
        },
        {
            itemprop: 'targetInstanceId',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            itemprop: 'targetAddress',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            itemprop: 'establishedAt',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            itemprop: 'lastActivity',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            itemprop: 'created',
            itemtype: { type: 'number' }
        },
        {
            itemprop: 'modified',
            itemtype: { type: 'number' }
        },
        
        // Connection quality metrics
        {
            itemprop: 'signalStrength',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'latency',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'bandwidth',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'packetLoss',
            itemtype: { type: 'number' },
            optional: true
        },
        {
            itemprop: 'stability',
            itemtype: { type: 'number' },
            optional: true
        }
    ]
};

// Export recipes as array to match one.models pattern
export default [TransportConfigRecipe, ConnectionInstanceRecipe]; 