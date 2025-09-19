/**
 * Lama ConnectionsModel Integration
 * 
 * This module simply re-exports the standard ConnectionsModel from one.models,
 * following the same approach as one.leute for maximum compatibility.
 */

// Re-export the standard ConnectionsModel
export { default as ConnectionsModel } from '@refinio/one.models/lib/models/ConnectionsModel.js';

// Import necessary types
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';

/**
 * Lama-specific connection utilities (keeping existing utility functions)
 */

/**
 * Creates a map from person IDs to their connection information.
 * Useful for organizing connections by person.
 */
export function createPersonToConnectionsMap(
    connections: any[]
): Map<SHA256IdHash<Person>, any[]> {
    const connectionsMap = new Map<SHA256IdHash<Person>, any[]>();

    for (const conn of connections) {
        if (connectionsMap.has(conn.remotePersonId)) {
            const connectionsOfPerson = connectionsMap.get(conn.remotePersonId);
            if (connectionsOfPerson !== undefined) {
                connectionsOfPerson.push(conn);
            }
        } else {
            connectionsMap.set(conn.remotePersonId, [conn]);
        }
    }

    return connectionsMap;
}

/**
 * Utility functions for connection debugging and monitoring
 */
export const ConnectionsUtils = {
    /**
     * Log connection statistics for debugging
     */
    logConnectionStats(connectionsModel: any, prefix: string = '[Lama]'): void {
        try {
            const connections = connectionsModel.connectionsInfo();
            const onlineState = connectionsModel.onlineState;
            
            console.log(`${prefix} Connection Statistics:`, {
                totalConnections: connections.length,
                onlineState,
                connections: connections.map((conn: any) => ({
                    id: conn.id,
                    state: conn.state,
                    personId: conn.personId,
                    instanceId: conn.instanceId
                }))
            });
        } catch (error) {
            console.log(`${prefix} Failed to get connection stats:`, error);
        }
    },

    /**
     * Get connection status summary
     */
    getConnectionSummary(connectionsModel: any): { online: number; total: number; state: string } {
        try {
            const connections = connectionsModel.connectionsInfo();
            const onlineConnections = connections.filter((conn: any) => conn.state === 'connected');
            
            return {
                online: onlineConnections.length,
                total: connections.length,
                state: connectionsModel.onlineState ? 'online' : 'offline'
            };
        } catch (error) {
            return { online: 0, total: 0, state: 'error' };
        }
    }
}; 