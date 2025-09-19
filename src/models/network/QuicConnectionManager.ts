/**
 * QUICVC Connection Manager
 * 
 * Manages established QUICVC connections with heartbeat/keepalive
 * for owned devices. Separate from discovery layer.
 */

import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import { QuicModel } from './QuicModel';
import Debug from 'debug';

const debug = Debug('one:quic:connection');

export interface QuicConnection {
    deviceId: string;
    address: string;
    port: number;
    isConnected: boolean;
    lastHeartbeat: number;
    heartbeatInterval: NodeJS.Timeout | null;
    heartbeatTimeout: NodeJS.Timeout | null;
    sequenceNumber: number;
}

export interface HeartbeatMessage {
    type: 'heartbeat' | 'heartbeat_response';
    deviceId: string;
    timestamp: number;
    sequence: number;
}

export class QuicConnectionManager {
    private static instance: QuicConnectionManager;
    private connections: Map<string, QuicConnection> = new Map();
    private quicModel: QuicModel | null = null;
    
    // Configuration
    private readonly HEARTBEAT_INTERVAL = 10000; // 10 seconds
    private readonly HEARTBEAT_TIMEOUT = 30000; // 30 seconds - mark as disconnected
    private readonly SERVICE_TYPE_HEARTBEAT = 4; // ESP32 sends heartbeats on type 4
    
    // Events
    public readonly onConnectionEstablished = new OEvent<(deviceId: string) => void>();
    public readonly onConnectionLost = new OEvent<(deviceId: string) => void>();
    public readonly onHeartbeatReceived = new OEvent<(deviceId: string) => void>();
    
    private constructor() {
        // Don't initialize QuicModel in constructor to avoid circular dependency
        // It will be lazily initialized when needed
    }
    
    static getInstance(): QuicConnectionManager {
        if (!QuicConnectionManager.instance) {
            QuicConnectionManager.instance = new QuicConnectionManager();
        }
        return QuicConnectionManager.instance;
    }
    
    /**
     * Get QuicModel instance lazily to avoid circular dependency
     */
    private getQuicModel(): QuicModel {
        if (!this.quicModel) {
            this.quicModel = QuicModel.getInstance();
            this.setupHeartbeatHandler();
        }
        return this.quicModel;
    }
    
    /**
     * Establish a managed connection with heartbeat
     */
    establishConnection(deviceId: string, address: string, port: number): void {
        console.log(`[QuicConnectionManager] Establishing connection to ${deviceId} at ${address}:${port}`);
        
        // Clean up any existing connection
        this.closeConnection(deviceId);
        
        // Create new connection
        const connection: QuicConnection = {
            deviceId,
            address,
            port,
            isConnected: true,
            lastHeartbeat: Date.now(),
            heartbeatInterval: null,
            heartbeatTimeout: null,
            sequenceNumber: 0
        };
        
        // Start heartbeat
        connection.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat(connection);
        }, this.HEARTBEAT_INTERVAL);
        
        // Set initial timeout
        this.resetHeartbeatTimeout(connection);
        
        this.connections.set(deviceId, connection);
        this.onConnectionEstablished.emit(deviceId);
        
        // Send initial heartbeat
        this.sendHeartbeat(connection);
    }
    
    /**
     * Close a managed connection
     */
    closeConnection(deviceId: string): void {
        const connection = this.connections.get(deviceId);
        if (!connection) return;
        
        console.log(`[QuicConnectionManager] Closing connection to ${deviceId}`);
        
        // Clear timers
        if (connection.heartbeatInterval) {
            clearInterval(connection.heartbeatInterval);
        }
        if (connection.heartbeatTimeout) {
            clearTimeout(connection.heartbeatTimeout);
        }
        
        // Remove from map
        this.connections.delete(deviceId);
        
        if (connection.isConnected) {
            this.onConnectionLost.emit(deviceId);
        }
    }
    
    /**
     * Send heartbeat to device
     */
    private async sendHeartbeat(connection: QuicConnection): Promise<void> {
        if (!connection.isConnected) return;
        
        try {
            const heartbeat: HeartbeatMessage = {
                type: 'heartbeat',
                deviceId: connection.deviceId,
                timestamp: Date.now(),
                sequence: ++connection.sequenceNumber
            };
            
            // Create packet without Buffer.concat for React Native compatibility
            const heartbeatJson = JSON.stringify(heartbeat);
            const jsonBytes = new TextEncoder().encode(heartbeatJson);
            const packet = new Uint8Array(1 + jsonBytes.length);
            packet[0] = this.SERVICE_TYPE_HEARTBEAT;
            packet.set(jsonBytes, 1);
            
            const quicModel = this.getQuicModel();
            await quicModel.send(packet, connection.address, connection.port);
            debug(`Sent heartbeat to ${connection.deviceId} (seq: ${heartbeat.sequence})`);
        } catch (error) {
            console.error(`[QuicConnectionManager] Error sending heartbeat to ${connection.deviceId}:`, error);
        }
    }
    
    /**
     * Handle incoming heartbeat messages
     */
    private setupHeartbeatHandler(): void {
        // DISABLED: DeviceDiscoveryModel already handles service type 4 (ESP32_DATA_SERVICE)
        // Having two handlers for the same service type causes conflicts
        // DeviceDiscoveryModel handles heartbeats with credentials for device recovery
        return;
        
        /*
        if (!this.quicModel) {
            console.error('[QuicConnectionManager] Cannot setup heartbeat handler - QuicModel not initialized');
            return;
        }
        
        this.quicModel.addService(this.SERVICE_TYPE_HEARTBEAT, (data: any, rinfo: any) => {
            try {
                // Extract JSON payload (service type byte already stripped by UdpServiceTransport)
                let payload: string;
                if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
                    // Convert to Uint8Array if needed
                    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
                    // Service type byte already stripped, decode directly
                    payload = new TextDecoder().decode(bytes);
                } else {
                    console.warn('[QuicConnectionManager] Unexpected data format:', typeof data);
                    return;
                }
                
                // Validate payload before parsing
                if (!payload || payload.trim().length === 0) {
                    debug('[QuicConnectionManager] Empty heartbeat payload received');
                    return;
                }
                
                // Log the payload for debugging malformed messages
                if (payload.length > 0 && payload[0] !== '{' && payload[0] !== '[') {
                    console.warn('[QuicConnectionManager] Invalid JSON payload received:', {
                        from: `${rinfo.address}:${rinfo.port}`,
                        firstChar: payload.charCodeAt(0),
                        preview: payload.substring(0, 50)
                    });
                    return;
                }
                
                let message: HeartbeatMessage;
                try {
                    message = JSON.parse(payload);
                } catch (parseError) {
                    console.warn('[QuicConnectionManager] Failed to parse heartbeat JSON:', {
                        from: `${rinfo.address}:${rinfo.port}`,
                        error: parseError.message,
                        payload: payload.substring(0, 100) // Log first 100 chars for debugging
                    });
                    return;
                }
                
                if (message.type === 'heartbeat_response') {
                    const connection = this.connections.get(message.deviceId);
                    if (connection) {
                        connection.lastHeartbeat = Date.now();
                        this.resetHeartbeatTimeout(connection);
                        this.onHeartbeatReceived.emit(message.deviceId);
                        debug(`Received heartbeat response from ${message.deviceId} (seq: ${message.sequence})`);
                    }
                } else {
                    debug(`[QuicConnectionManager] Received non-heartbeat message type: ${message.type}`);
                }
            } catch (error) {
                // This should only catch truly unexpected errors now
                console.error('[QuicConnectionManager] Unexpected error in heartbeat handler:', error);
            }
        });
        */
    }
    
    /**
     * Reset heartbeat timeout for a connection
     */
    private resetHeartbeatTimeout(connection: QuicConnection): void {
        // Clear existing timeout
        if (connection.heartbeatTimeout) {
            clearTimeout(connection.heartbeatTimeout);
        }
        
        // Set new timeout
        connection.heartbeatTimeout = setTimeout(() => {
            if (connection.isConnected) {
                console.log(`[QuicConnectionManager] Connection timeout for ${connection.deviceId}`);
                connection.isConnected = false;
                this.onConnectionLost.emit(connection.deviceId);
                
                // Don't remove the connection, just mark as disconnected
                // This allows reconnection without losing state
            }
        }, this.HEARTBEAT_TIMEOUT);
    }
    
    /**
     * Check if a device is connected
     */
    isConnected(deviceId: string): boolean {
        const connection = this.connections.get(deviceId);
        return connection?.isConnected || false;
    }
    
    /**
     * Get connection info
     */
    getConnection(deviceId: string): QuicConnection | undefined {
        return this.connections.get(deviceId);
    }
    
    /**
     * Get all connections
     */
    getAllConnections(): QuicConnection[] {
        return Array.from(this.connections.values());
    }
    
    /**
     * Send data to a connected device
     */
    async sendToDevice(deviceId: string, serviceType: number, data: any): Promise<void> {
        const connection = this.connections.get(deviceId);
        if (!connection || !connection.isConnected) {
            throw new Error(`Device ${deviceId} is not connected`);
        }
        
        // Create packet without Buffer.concat for React Native compatibility
        const dataJson = JSON.stringify(data);
        const jsonBytes = new TextEncoder().encode(dataJson);
        const packet = new Uint8Array(1 + jsonBytes.length);
        packet[0] = serviceType;
        packet.set(jsonBytes, 1);
        
        const quicModel = this.getQuicModel();
        await quicModel.send(packet, connection.address, connection.port);
    }
}