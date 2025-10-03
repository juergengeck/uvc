/**
 * QUIC VC Connection Manager
 * 
 * Implements QUICVC protocol - QUIC with Verifiable Credentials replacing TLS.
 * 
 * Architecture:
 * - VC-based initial handshake for authentication (replaces TLS 1.3)
 * - Derives session keys from credential exchange
 * - QUIC-style packet protection and encryption after handshake
 * - Secure heartbeat mechanism over encrypted channel
 * 
 * Connection flow:
 * 1. Initial packet with VC_INIT frame containing client credentials
 * 2. Server validates and responds with VC_RESPONSE frame
 * 3. Both parties derive shared secrets from credentials
 * 4. All subsequent packets use QUIC packet protection
 * 5. Heartbeats sent over secure channel with packet numbers
 * 
 * Security model:
 * - Authentication: Verifiable Credentials with challenge-response
 * - Encryption: AES-GCM with keys derived from VC exchange
 * - Integrity: HMAC with packet numbers for replay protection
 */

import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import { QuicModel } from './QuicModel';
import { VCManager, VerifiedVCInfo } from './vc/VCManager';
import { DeviceIdentityCredential, NetworkServiceType, IQuicTransport } from './interfaces';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import { createCryptoHash } from '@refinio/one.core/lib/system/crypto-helpers.js';
import * as expoCrypto from 'expo-crypto';
import * as tweetnacl from 'tweetnacl';
import Debug from 'debug';

const debug = Debug('one:quic:vc:connection');

// QUICVC packet types
export enum QuicVCPacketType {
    INITIAL = 0x00,      // Contains VC_INIT frame
    HANDSHAKE = 0x01,    // Contains VC_RESPONSE frame
    PROTECTED = 0x02,    // Regular data packets (encrypted)
    RETRY = 0x03         // Retry with different parameters
}

// QUICVC frame types
export enum QuicVCFrameType {
    VC_INIT = 0x10,      // Client credential presentation
    VC_RESPONSE = 0x11,  // Server credential response
    VC_ACK = 0x12,       // Acknowledge VC exchange
    STREAM = 0x08,       // Stream data (QUIC standard)
    ACK = 0x02,          // Acknowledgment (QUIC standard)
    HEARTBEAT = 0x20,    // Custom heartbeat frame
    DISCOVERY = 0x30,    // Device discovery announcement
    CONNECTION_CLOSE = 0x1C // Connection close frame
}

export interface QuicVCPacketHeader {
    type: QuicVCPacketType;
    version: number;
    dcid: Uint8Array;    // Destination Connection ID
    scid: Uint8Array;    // Source Connection ID
    packetNumber: bigint;
    headerLength?: number; // Total header length in bytes (for proper payload extraction)
}

export interface QuicVCConnection {
    // Connection identifiers
    deviceId: string;
    dcid: Uint8Array;
    scid: Uint8Array;
    
    // Network info
    address: string;
    port: number;
    
    // Connection state
    state: 'initial' | 'handshake' | 'established' | 'closed';
    isServer: boolean;
    
    // Packet tracking
    nextPacketNumber: bigint;
    highestReceivedPacket: bigint;
    ackQueue: bigint[];
    
    // Credentials
    localVC: DeviceIdentityCredential | null;
    remoteVC: VerifiedVCInfo | null;
    challenge: string;  // For mutual authentication
    
    // Crypto state
    initialKeys: CryptoKeys | null;
    handshakeKeys: CryptoKeys | null;
    applicationKeys: CryptoKeys | null;
    
    // Service type handlers (embedded in STREAM frames)
    serviceHandlers: Map<number, (data: Uint8Array, deviceId: string) => void>;
    
    // Timers
    handshakeTimeout: NodeJS.Timeout | null;
    heartbeatInterval: NodeJS.Timeout | null;
    idleTimeout: NodeJS.Timeout | null;
    
    // Metadata
    createdAt: number;
    lastActivity: number;
}

interface CryptoKeys {
    encryptionKey: Uint8Array;
    decryptionKey: Uint8Array;
    sendIV: Uint8Array;
    receiveIV: Uint8Array;
    sendHMAC: Uint8Array;
    receiveHMAC: Uint8Array;
}

export class QuicVCConnectionManager {
    private static instance: QuicVCConnectionManager;
    private connections: Map<string, QuicVCConnection> = new Map();
    private quicModel: QuicModel | null = null;
    private vcManager: VCManager | null = null;
    private ownPersonId: SHA256IdHash<Person>;
    private ownVC: DeviceIdentityCredential | null = null;
    
    // Configuration
    private readonly QUICVC_PORT = 49497; // All QUICVC communication on this port
    private readonly QUICVC_VERSION = 0x00000001; // Version 1
    private readonly HANDSHAKE_TIMEOUT = 5000; // 5 seconds
    private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds (as per ESP32 spec)
    private readonly IDLE_TIMEOUT = 120000; // 2 minutes (as per ESP32 spec)
    private readonly CONNECTION_ID_LENGTH = 16; // bytes
    
    // Events
    public readonly onConnectionEstablished = new OEvent<(deviceId: string, vcInfo: VerifiedVCInfo) => void>();
    public readonly onConnectionClosed = new OEvent<(deviceId: string, reason: string) => void>();
    public readonly onConnectionRetryNeeded = new OEvent<(deviceId: string, address: string, port: number) => void>();
    public readonly onHandshakeComplete = new OEvent<(deviceId: string) => void>();
    public readonly onPacketReceived = new OEvent<(deviceId: string, data: Uint8Array) => void>();
    public readonly onError = new OEvent<(deviceId: string, error: Error) => void>();
    public readonly onLEDResponse = new OEvent<(deviceId: string, response: any) => void>();
    public readonly onDeviceDiscovered = new OEvent<(event: any) => void>();
    
    private constructor(ownPersonId: SHA256IdHash<Person>) {
        this.ownPersonId = ownPersonId;
    }
    
    static getInstance(ownPersonId: SHA256IdHash<Person>): QuicVCConnectionManager {
        if (!QuicVCConnectionManager.instance) {
            QuicVCConnectionManager.instance = new QuicVCConnectionManager(ownPersonId);
        }
        return QuicVCConnectionManager.instance;
    }
    
    /**
     * Check if the manager is initialized with a credential
     */
    isInitialized(): boolean {
        return this.vcManager !== null && this.quicModel !== null && this.ownVC !== null;
    }
    
    /**
     * Get an existing connection by device ID
     */
    getConnection(deviceId: string): QuicVCConnection | undefined {
        for (const connection of this.connections.values()) {
            if (connection.deviceId === deviceId) {
                return connection;
            }
        }
        return undefined;
    }
    
    /**
     * Send a frame in a PROTECTED packet to an established connection
     */
    async sendProtectedFrame(deviceId: string, frameData: Uint8Array): Promise<void> {
        const connection = this.getConnection(deviceId);
        if (!connection) {
            throw new Error(`No connection found for device ${deviceId}`);
        }
        
        if (connection.state !== 'established') {
            throw new Error(`Connection to ${deviceId} is not established (state: ${connection.state})`);
        }
        
        // Create PROTECTED packet with the binary frame data
        const packet = this.createProtectedPacket(connection, frameData);
        
        // Send the packet
        await this.sendPacket(connection, packet);
        
        console.log(`[QuicVCConnectionManager] Sent PROTECTED frame to ${deviceId}, frame type: 0x${frameData[0].toString(16)}`);
    }
    
    /**
     * Initialize with transport and VCManager
     */
    async initialize(transport: IQuicTransport, vcManager: VCManager, ownVC?: DeviceIdentityCredential): Promise<void> {
        this.vcManager = vcManager;
        this.quicModel = QuicModel.getInstance();
        
        // QuicModel is a singleton that should already be initialized by the app
        // We just use the existing instance
        if (!this.quicModel.isInitialized()) {
            throw new Error('[QuicVCConnectionManager] QuicModel must be initialized before QuicVCConnectionManager');
        }
        console.log('[QuicVCConnectionManager] Using existing QuicModel singleton instance');
        this.ownVC = ownVC || null;
        
        // REMOVED: Direct listener to prevent duplicate packet processing
        // QuicVCConnectionManager is now only called through DeviceDiscoveryModel
        
        // Also listen for raw messages in case they're not caught by discovery
        if (transport && typeof transport.on === 'function') {
            transport.on('message', (data: Uint8Array, rinfo: any) => {
                // Check if this is a QUIC packet (first byte lower 2 bits indicate packet type)
                if (data.length > 0) {
                    const packetType = data[0] & 0x03;
                    // Handle HANDSHAKE (0x01) and PROTECTED (0x02) packets that aren't discovery
                    if (packetType === 0x01 || packetType === 0x02) {
                        console.log(`[QuicVCConnectionManager] Received QUIC packet type ${packetType} from ${rinfo.address}:${rinfo.port}`);
                        this.handleQuicVCPacket(data, rinfo);
                    }
                }
            });
        }
        
        debug('QuicVCConnectionManager initialized');
    }
    
    /**
     * Initiate QUIC-VC handshake with a device
     * @param credential The credential to use for this handshake (app credential, revocation credential, etc)
     */
    async initiateHandshake(deviceId: string, address: string, port: number, credential: any): Promise<void> {
        console.log(`[QuicVCConnectionManager] Initiating QUIC-VC handshake with ${deviceId} at ${address}:${port}`);
        
        // Pass the credential directly to connect
        await this.connect(deviceId, address, port, credential);
    }
    
    /**
     * Initiate QUICVC connection (client role)
     * @param credential The credential to use for this connection
     */
    async connect(deviceId: string, address: string, port: number, credential: any): Promise<void> {
        console.log(`[QuicVCConnectionManager] Initiating QUICVC connection to ${deviceId} at ${address}:${port}`);

        // Check if we already have a connection to this device
        const existingConnection = this.findConnectionByAddress(address, port);
        if (existingConnection && existingConnection.state === 'established') {
            console.log(`[QuicVCConnectionManager] Already have established connection to ${deviceId} - reusing it`);
            return;
        } else if (existingConnection && existingConnection.state === 'initial') {
            // Reuse the existing connection created by DISCOVERY frame
            console.log(`[QuicVCConnectionManager] Reusing existing connection in initial state`);

            // Update the connection with our credential
            existingConnection.localVC = credential;
            existingConnection.deviceId = deviceId;

            // Send VC_INIT packet now that we have a credential
            await this.sendInitialPacket(existingConnection);
            return;
        } else if (existingConnection && existingConnection.state !== 'established') {
            console.log(`[QuicVCConnectionManager] Have connection in ${existingConnection.state} state - closing and recreating`);
            this.closeConnection(existingConnection, 'Recreating for new operation');
        }
        
        // Generate connection IDs
        const dcid = tweetnacl.randomBytes(this.CONNECTION_ID_LENGTH);
        const scid = tweetnacl.randomBytes(this.CONNECTION_ID_LENGTH);
        
        // Create connection state
        const connection: QuicVCConnection = {
            deviceId,
            dcid,
            scid,
            address,
            port,
            state: 'initial',
            isServer: false,
            nextPacketNumber: 0n,
            highestReceivedPacket: -1n,
            ackQueue: [],
            localVC: credential,  // Use the provided credential
            remoteVC: null,
            challenge: this.generateChallenge(),
            initialKeys: null,
            handshakeKeys: null,
            applicationKeys: null,
            handshakeTimeout: null,
            heartbeatInterval: null,
            idleTimeout: null,
            createdAt: Date.now(),
            lastActivity: Date.now()
        };
        
        const connId = this.getConnectionId(dcid);
        this.connections.set(connId, connection);
        console.log(`[QuicVCConnectionManager] Created connection ${connId} for ${deviceId} at ${address}:${port}`);
        console.log(`[QuicVCConnectionManager] Connection details: DCID=${Array.from(dcid).map(b => b.toString(16).padStart(2, '0')).join(' ')}, SCID=${Array.from(scid).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
        
        // Set handshake timeout
        connection.handshakeTimeout = setTimeout(() => {
            this.handleHandshakeTimeout(connId);
        }, this.HANDSHAKE_TIMEOUT);
        
        // Send initial packet with VC_INIT frame
        await this.sendInitialPacket(connection);
    }
    
    /**
     * Send initial packet with credential
     */
    private async sendInitialPacket(connection: QuicVCConnection): Promise<void> {
        if (!connection.localVC) {
            throw new Error('No local credential available');
        }
        
        // Create VC_INIT frame
        const vcInitFrame = {
            type: QuicVCFrameType.VC_INIT,
            credential: connection.localVC,  // Use the connection's credential
            challenge: connection.challenge,
            timestamp: Date.now()
        };
        
        console.log('[QuicVCConnectionManager] Sending VC_INIT frame:', {
            frameType: 'VC_INIT (0x10)',
            credentialType: connection.localVC?.$type$ || 'unknown',
            toDevice: connection.deviceId,
            toAddress: `${connection.address}:${connection.port}`
        });
        
        // Create initial packet with VC_INIT frame
        const packet = this.createPacket(
            QuicVCPacketType.INITIAL,
            connection,
            JSON.stringify(vcInitFrame),
            QuicVCFrameType.VC_INIT
        );
        
        console.log('[QuicVCConnectionManager] Packet size:', packet.length, 'bytes');
        console.log('[QuicVCConnectionManager] First 20 bytes:', Array.from(packet.slice(0, 20)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
        
        // Send packet
        await this.sendPacket(connection, packet);
        
        debug(`Sent INITIAL packet to ${connection.deviceId}`);
    }
    
    /**
     * Handle incoming QUICVC packet
     */
    public async handleQuicVCPacket(data: Uint8Array, rinfo: { address: string, port: number }): Promise<void> {
        // console.log('[QuicVCConnectionManager] handleQuicVCPacket called with', data.length, 'bytes from', rinfo.address + ':' + rinfo.port);
        try {
            // Parse packet header
            const header = this.parsePacketHeader(data);
            if (!header) {
                console.warn('[QuicVCConnectionManager] Invalid packet header - ignoring malformed packet');
                debug('Invalid packet header');
                return;
            }
            // console.log('[QuicVCConnectionManager] Parsed header:', header);
            
            // Find or create connection
            let connection = this.findConnectionByIds(header.dcid, header.scid);
            // console.log('[QuicVCConnectionManager] Connection lookup by IDs:', connection ? 'found' : 'not found');
            
            // For ESP32 responses, also try to find by address/port if not found by IDs
            if (!connection) {
                connection = this.findConnectionByAddress(rinfo.address, rinfo.port);
                if (connection) {
                    console.log('[QuicVCConnectionManager] Found connection by address/port for ESP32 response');
                } else {
                    // console.log('[QuicVCConnectionManager] No connection found by address/port either');
                    // Log all existing connections for debugging
                    // console.log('[QuicVCConnectionManager] Existing connections:');
                    for (const [id, conn] of this.connections) {
                        // console.log(`  - ${id}: ${conn.address}:${conn.port}, deviceId: ${conn.deviceId}, state: ${conn.state}`);
                    }
                }
            }
            
            // console.log('[QuicVCConnectionManager] Final connection lookup result:', connection ? 'found' : 'not found');
            
            if (!connection) {
                if (header.type === QuicVCPacketType.INITIAL) {
                    // console.log('[QuicVCConnectionManager] Checking if INITIAL packet is discovery');
                    // Check if this is a discovery packet before creating connection
                    const payload = this.extractPayload(data, header);
                    if (payload.length > 3 && payload[0] === 0x30) { // DISCOVERY frame
                        // console.log('[QuicVCConnectionManager] Discovery packet detected - handling without connection');
                        await this.handleInitialPacket(null, data, header, rinfo);
                        return; // Don't create connection for discovery
                    }
                    console.log('[QuicVCConnectionManager] Not a discovery packet - creating new connection');
                    // New incoming connection (server role) for non-discovery packets
                    connection = await this.handleNewConnection(header, rinfo);
                    console.log('[QuicVCConnectionManager] New connection created:', connection ? 'success' : 'failed');
                } else if (header.type === QuicVCPacketType.PROTECTED) {
                    // ESP32 might send PROTECTED packets after authentication
                    // Don't create a new connection - this is likely a response to our handshake
                    console.error('[QuicVCConnectionManager] Received PROTECTED packet without connection - ESP32 response may have been lost', {
                        dcid: Array.from(header.dcid).map(b => b.toString(16).padStart(2, '0')).join(''),
                        scid: Array.from(header.scid).map(b => b.toString(16).padStart(2, '0')).join(''),
                        address: rinfo.address,
                        port: rinfo.port
                    });
                    return;
                } else if (header.type === QuicVCPacketType.RETRY) {
                    console.error('[QuicVCConnectionManager] RETRY packet without existing connection - invalid');
                    return;
                } else {
                    console.error('[QuicVCConnectionManager] No connection found for packet type:', header.type);
                    debug('No connection found for packet');
                    return;
                }
                
                if (!connection) {
                    console.error('[QuicVCConnectionManager] Failed to create connection');
                    return;
                }
            }
            
            // Update activity
            connection.lastActivity = Date.now();

            // Log raw packet info for debugging ESP32 response
            console.log(`[QuicVCConnectionManager] Processing packet type ${header.type} from ${rinfo.address}:${rinfo.port} for connection state: ${connection.state}`);
            console.log('[QuicVCConnectionManager] Packet header details:', {
                type: header.type,
                dcid: Array.from(header.dcid).map(b => b.toString(16).padStart(2, '0')).join(''),
                scid: Array.from(header.scid).map(b => b.toString(16).padStart(2, '0')).join(''),
                packetNumber: header.packetNumber?.toString(),
                dataLength: data.length
            });

            // Process packet based on type
            switch (header.type) {
                case QuicVCPacketType.INITIAL:
                    await this.handleInitialPacket(connection, data, header, rinfo);
                    break;
                case QuicVCPacketType.HANDSHAKE:
                    console.log('[QuicVCConnectionManager] Received HANDSHAKE packet from', connection.deviceId || connection.address);
                    // ESP32 sends VC_RESPONSE in HANDSHAKE packets
                    await this.handleHandshakePacket(connection, data, header);
                    break;
                case QuicVCPacketType.PROTECTED:
                    console.log('[QuicVCConnectionManager] Processing PROTECTED packet for device:', connection.deviceId || 'unknown');
                    await this.handleProtectedPacket(connection, data, header);
                    break;
                default:
                    debug(`Unknown packet type: ${header.type}`);
            }
        } catch (error) {
            console.error('[QuicVCConnectionManager] Error handling packet:', error);
        }
    }
    
    /**
     * Handle new incoming connection
     */
    private async handleNewConnection(header: QuicVCPacketHeader, rinfo: { address: string, port: number }): Promise<QuicVCConnection> {
        const connection: QuicVCConnection = {
            deviceId: '', // Will be set after VC verification
            dcid: header.scid, // Swap IDs for server
            scid: header.dcid,
            address: rinfo.address,
            port: rinfo.port,
            state: 'initial',
            isServer: true,
            nextPacketNumber: 0n,
            highestReceivedPacket: header.packetNumber,
            ackQueue: [header.packetNumber],
            localVC: this.ownVC,
            remoteVC: null,
            challenge: this.generateChallenge(),
            initialKeys: null,
            handshakeKeys: null,
            applicationKeys: null,
            serviceHandlers: new Map(), // Initialize service handlers
            handshakeTimeout: null,
            heartbeatInterval: null,
            idleTimeout: null,
            createdAt: Date.now(),
            lastActivity: Date.now()
        };
        
        // Store connection by our SCID - ESP32 will use this as DCID in its response
        const connId = this.getConnectionId(connection.scid);
        this.connections.set(connId, connection);
        
        return connection;
    }
    
    /**
     * Handle INITIAL packet with VC_INIT frame or DISCOVERY frame
     */
    private async handleInitialPacket(connection: QuicVCConnection | null, data: Uint8Array, header: QuicVCPacketHeader, rinfo: { address: string, port: number }): Promise<void> {
        console.log('[QuicVCConnectionManager] Handling INITIAL packet');
        // Extract payload (skip header)
        const payload = this.extractPayload(data, header);
        console.log('[QuicVCConnectionManager] Payload length:', payload.length);
        console.log('[QuicVCConnectionManager] First 20 payload bytes:', Array.from(payload.slice(0, 20)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

        // Check if this is a discovery frame first (no connection needed)
        if (payload.length > 3 && payload[0] === 0x30) { // Frame type 0x30 = DISCOVERY
            console.log('[QuicVCConnectionManager] Frame type 0x30 - handling as discovery');

            // If we have an active connection waiting for VC_RESPONSE, don't return early
            // The ESP32 broadcasts discovery packets while also processing ownership
            if (connection && connection.state === 'initial') {
                console.log('[QuicVCConnectionManager] Connection in initial state - not returning, waiting for VC_RESPONSE');
                await this.handleDiscoveryPacket(payload, header, rinfo);
                // Continue processing in case there are more frames in this packet
            } else {
                console.log('[QuicVCConnectionManager] No active connection - handling discovery and returning');
                await this.handleDiscoveryPacket(payload, header, rinfo);
                return; // Don't create or update connection for discovery
            }
        }

        // For non-discovery packets, we need a connection
        if (!connection) {
            console.error('[QuicVCConnectionManager] No connection for non-discovery INITIAL packet');
            return;
        }

        console.log('[QuicVCConnectionManager] Past initial checks, about to check frame type 0x30 again...');

        // Try to decode as ESP32 discovery format
        // ESP32 sends: frame_type(1) + length(2) + HTML/JSON
        try {
            if (payload.length > 3 && payload[0] === 0x30) { // Frame type 0x30 = DISCOVERY
                const frameLength = (payload[1] << 8) | payload[2];
                const jsonStart = 3; // Skip frame header

                if (payload.length >= jsonStart + frameLength) {
                    const contentBytes = payload.slice(jsonStart, jsonStart + frameLength);
                    const contentString = new TextDecoder().decode(contentBytes);
                    // console.log('[QuicVCConnectionManager] Discovery content:', contentString);

                    // Parse JSON (new compact format) or HTML (legacy)
                    if (contentString.startsWith('{')) {
                        // Parse compact JSON format (new)
                        // Format: {"t":"DevicePresence","i":"device-id","s":"online","o":"unclaimed"}
                        try {
                            const json = JSON.parse(contentString);
                            const discoveryData = {
                                id: json.i || json.id || json.deviceId,
                                type: json.t === 'DevicePresence' ? 'ESP32' : (json.type || json.deviceType || 'unknown'),
                                status: json.s || json.status || 'online',
                                ownership: json.o || json.ownership || 'unclaimed'
                            };
                            console.log('[QuicVCConnectionManager] Parsed discovery data from JSON:', discoveryData);

                            // Store device information in the connection
                            connection.deviceId = discoveryData.id;
                            connection.deviceType = discoveryData.type;
                            connection.isOwned = discoveryData.ownership !== 'unclaimed';

                            // Emit discovery event
                            this.onDeviceDiscovered.emit({
                                type: 'discovery',
                                deviceInfo: {
                                    deviceId: discoveryData.id,
                                    deviceType: discoveryData.type,
                                    isOwned: discoveryData.ownership !== 'unclaimed',
                                    ownership: discoveryData.ownership,
                                    status: discoveryData.status
                                },
                                address: rinfo.address,
                                port: rinfo.port
                            });
                        } catch (e) {
                            console.log('[QuicVCConnectionManager] Failed to parse JSON:', e.message);
                        }
                    } else if (contentString.startsWith('<!DOCTYPE html>')) {
                        // Parse HTML microdata for device information (legacy - will be removed)
                        const idMatch = contentString.match(/itemprop="id" content="([^"]+)"/);
                        const typeMatch = contentString.match(/itemprop="type" content="([^"]+)"/);
                        const statusMatch = contentString.match(/itemprop="status" content="([^"]+)"/);
                        const ownershipMatch = contentString.match(/itemprop="ownership" content="([^"]+)"/);

                        if (idMatch) {
                            const discoveryData = {
                                id: idMatch[1],
                                type: typeMatch ? typeMatch[1] : 'unknown',
                                status: statusMatch ? statusMatch[1] : 'unknown',
                                ownership: ownershipMatch ? ownershipMatch[1] : 'unknown'
                            };
                            console.log('[QuicVCConnectionManager] Parsed discovery data from HTML (legacy):', discoveryData);

                            // Store device information in the connection
                            connection.deviceId = discoveryData.id;
                            connection.deviceType = discoveryData.type;
                            connection.isOwned = discoveryData.ownership !== 'unclaimed';

                            // Emit discovery event for DeviceDiscoveryModel
                            this.onDeviceDiscovered.emit({
                                type: 'discovery',
                                deviceInfo: {
                                    deviceId: discoveryData.id,
                                    deviceType: discoveryData.type,
                                    isOwned: discoveryData.ownership !== 'unclaimed',
                                    ownership: discoveryData.ownership,
                                    status: discoveryData.status
                                },
                                address: rinfo.address,
                                port: rinfo.port
                            });
                        }
                    } else {
                        console.warn('[QuicVCConnectionManager] Unknown discovery format:', contentString.substring(0, 50));
                    }

                    // This is an ESP32 discovery packet, not a QUICVC handshake
                    // The device is broadcasting its availability
                    // We should not try to process this as a VC handshake
                    return;
                }
            }
        } catch (e) {
            console.warn('[QuicVCConnectionManager] Failed to parse as ESP32 discovery JSON:', e.message);
        }
        
        // Parse binary QUIC frames instead of JSON
        const frames = this.parseFrames(payload);
        console.log('[QuicVCConnectionManager] Parsed frames:', frames.length, 'frames');
        if (frames.length === 0) {
            console.warn('[QuicVCConnectionManager] No frames found in INITIAL packet');
            console.warn('[QuicVCConnectionManager] Raw payload (first 50 bytes):', Array.from(payload.slice(0, Math.min(50, payload.length))).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
            // Don't return here - the ESP32 might be sending a different format
            // Try to parse as raw JSON for VC_RESPONSE
            try {
                const jsonStr = new TextDecoder().decode(payload);
                console.log('[QuicVCConnectionManager] Attempting JSON parse of raw payload:', jsonStr.substring(0, 100));
                const responseData = JSON.parse(jsonStr);
                if (responseData.status) {
                    // This looks like a VC_RESPONSE without frame header
                    console.log('[QuicVCConnectionManager] Found raw VC_RESPONSE without frame header');
                    await this.handleVCResponseFrame(connection, responseData);
                    return;
                }
            } catch (e) {
                // Not JSON either
                console.log('[QuicVCConnectionManager] Payload is not JSON either');
            }
            return;
        }

        // Process ALL frames - ESP32 might send multiple frames in one packet
        // Priority: VC_RESPONSE > VC_INIT > DISCOVERY
        let handledVCResponse = false;
        let handledVCInit = false;

        for (const frame of frames) {
            if (frame.type === QuicVCFrameType.VC_RESPONSE && !handledVCResponse) {
                // Handle VC_RESPONSE frame (server credential response - ESP32 sends this in INITIAL packets)
                console.log('[QuicVCConnectionManager] Found VC_RESPONSE frame - handling as client');
                await this.handleVCResponseFrame(connection, frame);
                handledVCResponse = true;
            } else if (frame.type === QuicVCFrameType.VC_INIT && !handledVCInit) {
                // Handle VC_INIT frame (client credential presentation - we are acting as server)
                console.log('[QuicVCConnectionManager] Found VC_INIT frame - handling as server');
                await this.handleVCInitFrame(connection, frame);
                handledVCInit = true;
            } else if (frame.type === QuicVCFrameType.DISCOVERY) {
                // Handle DISCOVERY frame - ESP32 is broadcasting its presence
                // Don't stop processing other frames - just handle discovery and continue
                console.log('[QuicVCConnectionManager] Found DISCOVERY frame - device is broadcasting (continuing to check for other frames)');
                await this.handleDiscoveryFrame(connection, frame, rinfo);
            }
        }

        // If we handled a VC response or init, we're done
        if (handledVCResponse || handledVCInit) {
            return;
        }

        // If we only saw discovery frames, log but don't error
        if (frames.some(f => f.type === QuicVCFrameType.DISCOVERY)) {
            console.log('[QuicVCConnectionManager] Only DISCOVERY frames in packet - waiting for VC_RESPONSE');
            return;
        }

        // No recognized frames
        console.warn('[QuicVCConnectionManager] No recognized frames in INITIAL packet - ignoring');
        debug('Frame types received:', frames.map(f => f.type));
    }

    /**
     * Handle VC_INIT frame received from client
     */
    private async handleVCInitFrame(connection: QuicVCConnection, frame: any): Promise<void> {
        console.log('[QuicVCConnectionManager] Processing VC_INIT frame');
        
        // Verify credential
        if (this.vcManager) {
            const verifiedInfo = await this.vcManager.verifyCredential(frame.credential, frame.credential.credentialSubject.id);
            
            if (verifiedInfo && verifiedInfo.issuerPersonId === this.ownPersonId) {
                connection.remoteVC = verifiedInfo;
                connection.deviceId = verifiedInfo.subjectDeviceId;
                
                // Derive initial keys from credentials
                connection.initialKeys = await this.deriveInitialKeys(connection);
                
                // Send handshake response
                await this.sendHandshakePacket(connection);
                
                connection.state = 'handshake';
            } else {
                // Invalid credential
                this.closeConnection(connection, 'Invalid credential');
            }
        }
    }

    /**
     * Handle VC_RESPONSE frame received from server (ESP32)
     */
    private async handleVCResponseFrame(connection: QuicVCConnection, frame: any): Promise<void> {
        console.log('[QuicVCConnectionManager] Processing VC_RESPONSE frame from ESP32');
        console.log('[QuicVCConnectionManager] VC_RESPONSE frame data:', frame);
        
        // Extract device ID from the frame if not already set
        if (!connection.deviceId && frame.device_id) {
            connection.deviceId = frame.device_id;
            console.log('[QuicVCConnectionManager] Set device ID from VC_RESPONSE:', connection.deviceId);
        }
        
        // Parse the response to check ownership status
        if (frame.status === 'provisioned' || frame.status === 'already_owned' || frame.status === 'ownership_revoked') {
            console.log('[QuicVCConnectionManager] ESP32 operation successful:', frame.status);
            
            // Update connection state
            connection.state = 'established';
            if (frame.owner) {
                connection.remoteVC = { issuerPersonId: frame.owner };
            }
            
            // Complete handshake
            this.completeHandshake(connection);
            
            console.log('[QuicVCConnectionManager] ESP32 operation completed successfully:', frame.status);
            
            // Immediately update device ownership to prevent waiting for heartbeat
            if (frame.status === 'provisioned' && frame.owner && connection.deviceId) {
                try {
                    // Import DeviceDiscoveryModel dynamically to avoid circular dependency
                    const { DeviceDiscoveryModel } = await import('./DeviceDiscoveryModel');
                    const discoveryModel = DeviceDiscoveryModel.getInstance();
                    
                    // Update device ownership immediately
                    const device = discoveryModel.getDevice(connection.deviceId);
                    if (device) {
                        device.ownerId = frame.owner;
                        device.hasValidCredential = true;
                        discoveryModel.emitDeviceUpdate(connection.deviceId, { 
                            ownerId: frame.owner,
                            hasValidCredential: true 
                        });
                        console.log('[QuicVCConnectionManager] Immediately updated device ownership for', connection.deviceId);
                    }
                } catch (error) {
                    console.error('[QuicVCConnectionManager] Failed to update device ownership:', error);
                }
            }
            
            // DON'T close the connection - we need it for future LED commands!
            // The connection should remain open for the device's lifetime
            console.log('[QuicVCConnectionManager] Keeping connection open for future commands');
        } else if (frame.status === 'revoked') {
            // Ownership revoked - close the connection
            console.log('[QuicVCConnectionManager] Ownership revoked - closing connection');
            this.closeConnection(connection, `Ownership revoked`);
        } else {
            console.error('[QuicVCConnectionManager] ESP32 operation failed:', frame.status, frame.message);
            this.closeConnection(connection, `Ownership failed: ${frame.message || frame.status}`);
        }
    }
    
    /**
     * Handle DISCOVERY packet without creating a connection
     */
    private async handleDiscoveryPacket(payload: Uint8Array, header: QuicVCPacketHeader, rinfo: { address: string, port: number }): Promise<void> {
        try {
            const frameLength = (payload[1] << 8) | payload[2];
            const jsonStart = 3; // Skip frame header

            if (payload.length >= jsonStart + frameLength) {
                const contentBytes = payload.slice(jsonStart, jsonStart + frameLength);
                const contentString = new TextDecoder().decode(contentBytes);
                // console.log('[QuicVCConnectionManager] Discovery content:', contentString);

                // Parse JSON (new compact format) or HTML (legacy)
                let discoveryData: any = {};

                if (contentString.startsWith('{')) {
                    // Parse compact JSON format (new)
                    // Format: {"t":"DevicePresence","i":"device-id","s":"online","o":"unclaimed"}
                    const json = JSON.parse(contentString);
                    discoveryData = {
                        id: json.i || '',
                        type: json.t === 'DevicePresence' ? 'ESP32' : (json.type || 'unknown'),
                        status: json.s || 'online',
                        ownership: json.o || 'unclaimed'
                    };
                } else if (contentString.startsWith('<!DOCTYPE html>')) {
                    // Parse HTML microdata for device information (legacy - will be removed)
                    const idMatch = contentString.match(/itemprop="id" content="([^"]+)"/);
                    const typeMatch = contentString.match(/itemprop="type" content="([^"]+)"/);
                    const statusMatch = contentString.match(/itemprop="status" content="([^"]+)"/);
                    const ownershipMatch = contentString.match(/itemprop="ownership" content="([^"]+)"/);

                    discoveryData = {
                        id: idMatch ? idMatch[1] : '',
                        type: typeMatch ? typeMatch[1] : 'unknown',
                        status: statusMatch ? statusMatch[1] : 'online',
                        ownership: ownershipMatch ? ownershipMatch[1] : 'unclaimed'
                    };
                } else {
                    console.warn('[QuicVCConnectionManager] Unknown discovery format:', contentString.substring(0, 50));
                }

                // console.log('[QuicVCConnectionManager] Parsed discovery data:', discoveryData);

                // Emit discovery event without creating a connection
                this.onDeviceDiscovered.emit({
                    type: 'discovery',
                    deviceInfo: {
                        deviceId: discoveryData.id || '',
                        deviceType: discoveryData.type || 'ESP32',
                        isOwned: discoveryData.ownership !== 'unclaimed',
                        ownership: discoveryData.ownership || 'unclaimed',
                        status: discoveryData.status || 'online',
                        address: rinfo.address,
                        port: rinfo.port
                    },
                    address: rinfo.address,
                    port: rinfo.port,
                    scid: header.scid // Include SCID for consistent device identification
                });

                // console.log('[QuicVCConnectionManager] Emitted stateless discovery event for:', discoveryData.id);
            }
        } catch (error) {
            console.error('[QuicVCConnectionManager] Failed to parse discovery packet:', error);
        }
    }

    /**
     * Handle DISCOVERY frame from ESP32 devices (deprecated - use handleDiscoveryPacket)
     */
    private async handleDiscoveryFrame(connection: QuicVCConnection | null, frame: any, rinfo: { address: string, port: number }): Promise<void> {
        console.log('[QuicVCConnectionManager] Processing DISCOVERY frame');
        
        // Parse the discovery data (ESP32 sends JSON in the frame payload)
        try {
            const discoveryData = typeof frame.payload === 'string' 
                ? JSON.parse(frame.payload)
                : JSON.parse(new TextDecoder().decode(frame.payload));
            
            console.log('[QuicVCConnectionManager] Discovery data:', discoveryData);
            
            // Extract device information
            const deviceInfo = {
                deviceId: discoveryData.device_id || '',
                deviceType: discoveryData.device_type || 'ESP32',
                ownership: discoveryData.ownership || 'unclaimed',
                status: discoveryData.status || 'online',
                protocol: discoveryData.protocol || 'quicvc/1.0',
                capabilities: discoveryData.capabilities || [],
                address: rinfo.address,
                port: rinfo.port,
                lastSeen: Date.now()
            };
            
            // Update connection with device info if we have one
            if (connection) {
                connection.deviceId = deviceInfo.deviceId;
            }
            
            // Emit discovery event for the DeviceDiscoveryModel to handle
            this.onDeviceDiscovered.emit({
                type: 'discovery',
                deviceInfo,
                address: rinfo.address,
                port: rinfo.port
            });

            console.log('[QuicVCConnectionManager] Emitted device discovery event for:', deviceInfo.deviceId);

            // For unclaimed devices, the connection stays in 'initial' state
            // The app must explicitly initiate authentication when user claims the device
            // via initiateHandshake() or connect() methods which will reuse this connection

            if (deviceInfo.ownership === 'unclaimed' && connection) {
                console.log('[QuicVCConnectionManager] Device is unclaimed, connection ready for claiming');
                // Connection remains in 'initial' state until user claims via UI
            } else if (deviceInfo.ownership === 'claimed' && connection) {
                // For claimed devices, authentication may be needed if we're the owner
                console.log('[QuicVCConnectionManager] Device is claimed, authentication may be needed');
                // Authentication will be triggered by DeviceDiscoveryModel/ESP32ConnectionManager
            }

        } catch (error) {
            console.error('[QuicVCConnectionManager] Failed to parse discovery frame:', error);
        }
    }
    
    /**
     * Send HANDSHAKE packet with our credential
     */
    private async sendHandshakePacket(connection: QuicVCConnection): Promise<void> {
        if (!connection.localVC) {
            throw new Error('No local credential available');
        }
        
        // Create VC_RESPONSE frame
        const vcResponseFrame = {
            type: QuicVCFrameType.VC_RESPONSE,
            credential: connection.localVC,  // Use the connection's credential
            challenge: connection.challenge,
            ackChallenge: connection.remoteVC?.vc.proof?.proofValue, // Acknowledge their challenge
            timestamp: Date.now()
        };
        
        // Create handshake packet with VC_RESPONSE frame
        const packet = this.createPacket(
            QuicVCPacketType.HANDSHAKE,
            connection,
            JSON.stringify(vcResponseFrame),
            QuicVCFrameType.VC_RESPONSE
        );
        
        // Send packet
        await this.sendPacket(connection, packet);
        
        debug(`Sent HANDSHAKE packet to ${connection.deviceId}`);
    }
    
    /**
     * Handle HANDSHAKE packet
     */
    private async handleHandshakePacket(connection: QuicVCConnection, data: Uint8Array, header: QuicVCPacketHeader): Promise<void> {
        const payload = this.extractPayload(data, header);

        // ESP32 sends frames in binary format, not JSON
        const frames = this.parseFrames(payload);
        console.log('[QuicVCConnectionManager] HANDSHAKE packet contains', frames.length, 'frames');

        if (frames.length === 0) {
            console.warn('[QuicVCConnectionManager] No frames in HANDSHAKE packet');
            return;
        }

        // Look for VC_RESPONSE frame
        const vcResponseFrame = frames.find(f => f.type === QuicVCFrameType.VC_RESPONSE);
        if (vcResponseFrame) {
            console.log('[QuicVCConnectionManager] Found VC_RESPONSE in HANDSHAKE packet');
            await this.handleVCResponseFrame(connection, vcResponseFrame);
            return;
        }

        debug('No VC_RESPONSE frame in HANDSHAKE packet');
    }
    
    /**
     * Complete handshake and start heartbeat
     */
    private completeHandshake(connection: QuicVCConnection): void {
        // Clear handshake timeout
        if (connection.handshakeTimeout) {
            clearTimeout(connection.handshakeTimeout);
            connection.handshakeTimeout = null;
        }
        
        // Start heartbeat
        connection.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat(connection);
        }, this.HEARTBEAT_INTERVAL);
        
        // Set idle timeout
        this.resetIdleTimeout(connection);
        
        // Emit events
        this.onHandshakeComplete.emit(connection.deviceId);
        if (connection.remoteVC) {
            this.onConnectionEstablished.emit(connection.deviceId, connection.remoteVC);
        }
        
        console.log(`[QuicVCConnectionManager] QUICVC handshake complete with ${connection.deviceId}`);
    }
    
    /**
     * Handle encrypted PROTECTED packets
     */
    private async handleProtectedPacket(connection: QuicVCConnection, data: Uint8Array, header: QuicVCPacketHeader): Promise<void> {
        // For ESP32, it might send VC_RESPONSE in PROTECTED packets
        // Try to parse without decryption first (ESP32 might not encrypt yet)
        const payload = this.extractPayload(data, header);
        const frames = this.parseFrames(payload);
        
        // Check if it contains VC_RESPONSE (ESP32 ownership response)
        const vcResponseFrame = frames.find(frame => frame.type === QuicVCFrameType.VC_RESPONSE);
        if (vcResponseFrame) {
            console.log('[QuicVCConnectionManager] Found VC_RESPONSE in PROTECTED packet from ESP32');
            await this.handleVCResponseFrame(connection, vcResponseFrame);
            return;
        }
        
        // Otherwise, handle as normal encrypted PROTECTED packet
        if (connection.state !== 'established' || !connection.applicationKeys) {
            debug('Cannot handle protected packet - connection not established');
            return;
        }
        
        // Decrypt payload
        const decrypted = await this.decryptPacket(data, header, connection.applicationKeys);
        if (!decrypted) {
            debug('Failed to decrypt packet');
            return;
        }
        
        // Parse frames from decrypted data
        const decryptedFrames = this.parseFrames(decrypted);
        
        for (const frame of decryptedFrames) {
            switch (frame.type) {
                case QuicVCFrameType.HEARTBEAT:
                    this.handleHeartbeatFrame(connection, frame);
                    break;
                case QuicVCFrameType.STREAM:
                    // STREAM frames contain service type and data
                    this.handleStreamFrame(connection, frame);
                    break;
                case QuicVCFrameType.ACK:
                    // Handle acknowledgments
                    break;
            }
        }
        
        // Reset idle timeout
        this.resetIdleTimeout(connection);
    }
    
    /**
     * Send heartbeat over secure channel
     */
    private async sendHeartbeat(connection: QuicVCConnection): Promise<void> {
        if (connection.state !== 'established') return;
        
        const heartbeatFrame = {
            type: QuicVCFrameType.HEARTBEAT,
            timestamp: Date.now(),
            sequence: Number(connection.nextPacketNumber)
        };
        
        await this.sendProtectedPacket(connection, [heartbeatFrame]);
        debug(`Sent heartbeat to ${connection.deviceId}`);
    }
    
    /**
     * Send protected packet with encryption
     */
    private async sendProtectedPacket(connection: QuicVCConnection, frames: any[]): Promise<void> {
        if (!connection.applicationKeys) {
            throw new Error('No application keys available');
        }
        
        // Serialize frames
        const payload = JSON.stringify(frames);
        
        // Create and encrypt packet
        const packet = await this.createEncryptedPacket(
            QuicVCPacketType.PROTECTED,
            connection,
            payload,
            connection.applicationKeys
        );
        
        await this.sendPacket(connection, packet);
    }
    
    /**
     * Derive initial keys from credentials
     */
    private async deriveInitialKeys(connection: QuicVCConnection): Promise<CryptoKeys> {
        const salt = new TextEncoder().encode('quicvc-initial-salt-v1');
        
        // Combine credential data for key material
        const info = new TextEncoder().encode(
            connection.localVC?.id + connection.remoteVC?.vc.id
        );
        
        // Use HKDF to derive keys
        // Use SHA256 for key derivation (HKDF-like)
        const combined = new Uint8Array(salt.length + info.length);
        combined.set(salt);
        combined.set(info, salt.length);
        const hash = await expoCrypto.digestStringAsync(
            expoCrypto.CryptoDigestAlgorithm.SHA256,
            Buffer.from(combined).toString('base64'),
            { encoding: expoCrypto.CryptoEncoding.BASE64 }
        );
        const keyMaterial = Buffer.from(hash, 'base64').slice(0, 96); // 3 * 32 bytes
        
        return {
            encryptionKey: keyMaterial.slice(0, 32),
            decryptionKey: keyMaterial.slice(0, 32), // Same for initial
            sendIV: keyMaterial.slice(32, 48),
            receiveIV: keyMaterial.slice(32, 48),
            sendHMAC: keyMaterial.slice(64, 96),
            receiveHMAC: keyMaterial.slice(64, 96)
        };
    }
    
    /**
     * Derive handshake keys
     */
    private async deriveHandshakeKeys(connection: QuicVCConnection): Promise<CryptoKeys> {
        const salt = new TextEncoder().encode('quicvc-handshake-salt-v1');
        
        // Include challenges in key derivation
        const info = new TextEncoder().encode(
            connection.challenge + 
            connection.localVC?.proof?.proofValue +
            connection.remoteVC?.vc.proof?.proofValue
        );
        
        // Use SHA256 for key derivation (HKDF-like)
        const combined = new Uint8Array(salt.length + info.length);
        combined.set(salt);
        combined.set(info, salt.length);
        const hash1 = await expoCrypto.digestStringAsync(
            expoCrypto.CryptoDigestAlgorithm.SHA256,
            Buffer.from(combined).toString('base64'),
            { encoding: expoCrypto.CryptoEncoding.BASE64 }
        );
        const hash2 = await expoCrypto.digestStringAsync(
            expoCrypto.CryptoDigestAlgorithm.SHA256,
            hash1,
            { encoding: expoCrypto.CryptoEncoding.BASE64 }
        );
        const keyMaterial = Buffer.concat([
            Buffer.from(hash1, 'base64'),
            Buffer.from(hash2, 'base64')
        ]).slice(0, 192); // 6 * 32 bytes
        
        return {
            encryptionKey: keyMaterial.slice(0, 32),
            decryptionKey: keyMaterial.slice(32, 64),
            sendIV: keyMaterial.slice(64, 80),
            receiveIV: keyMaterial.slice(80, 96),
            sendHMAC: keyMaterial.slice(96, 128),
            receiveHMAC: keyMaterial.slice(128, 160)
        };
    }
    
    /**
     * Derive application keys (1-RTT keys)
     */
    private async deriveApplicationKeys(connection: QuicVCConnection): Promise<CryptoKeys> {
        const salt = new TextEncoder().encode('quicvc-application-salt-v1');
        
        // Use public keys from credentials
        const info = new TextEncoder().encode(
            connection.localVC?.credentialSubject.publicKeyHex +
            connection.remoteVC?.subjectPublicKeyHex
        );
        
        // Use SHA256 for key derivation (HKDF-like)
        const combined = new Uint8Array(salt.length + info.length);
        combined.set(salt);
        combined.set(info, salt.length);
        const hash1 = await expoCrypto.digestStringAsync(
            expoCrypto.CryptoDigestAlgorithm.SHA256,
            Buffer.from(combined).toString('base64'),
            { encoding: expoCrypto.CryptoEncoding.BASE64 }
        );
        const hash2 = await expoCrypto.digestStringAsync(
            expoCrypto.CryptoDigestAlgorithm.SHA256,
            hash1,
            { encoding: expoCrypto.CryptoEncoding.BASE64 }
        );
        const keyMaterial = Buffer.concat([
            Buffer.from(hash1, 'base64'),
            Buffer.from(hash2, 'base64')
        ]).slice(0, 192);
        
        return {
            encryptionKey: keyMaterial.slice(0, 32),
            decryptionKey: keyMaterial.slice(32, 64),
            sendIV: keyMaterial.slice(64, 80),
            receiveIV: keyMaterial.slice(80, 96),
            sendHMAC: keyMaterial.slice(96, 128),
            receiveHMAC: keyMaterial.slice(128, 160)
        };
    }
    
    /**
     * Helper methods
     */
    
    private getConnectionId(dcid: Uint8Array): string {
        return Array.from(dcid).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    private findConnectionByIds(dcid: Uint8Array, scid: Uint8Array): QuicVCConnection | undefined {
        // ESP32 response has: DCID = our SCID (from our initial packet)
        // So look up connection by the incoming packet's DCID
        const dcidStr = this.getConnectionId(dcid);
        let connection = this.connections.get(dcidStr);

        if (!connection) {
            // Fallback: search all connections
            const scidStr = this.getConnectionId(scid);
            for (const [_, conn] of this.connections) {
                if (this.getConnectionId(conn.scid) === dcidStr || this.getConnectionId(conn.dcid) === scidStr) {
                    connection = conn;
                    break;
                }
            }
        }
        
        // For ESP32 connections, derive deviceId from MAC address if not set
        if (connection && !connection.deviceId) {
            // Extract MAC from SCID (ESP32 puts MAC in first 6 bytes)
            const mac = Array.from(scid.slice(0, 6))
                .map(b => b.toString(16).padStart(2, '0'))
                .join(':');
            // Use hyphen format to match discovery format (esp32-XXXXXXXXXXXX)
            const derivedDeviceId = `esp32-${mac.replace(/:/g, '').toLowerCase()}`;
            
            console.log('[QuicVCConnectionManager] Deriving deviceId from ESP32 MAC:', {
                mac,
                derivedDeviceId,
                scid: Array.from(scid).map(b => b.toString(16).padStart(2, '0')).join('')
            });
            
            connection.deviceId = derivedDeviceId;
        }
        
        return connection;
    }
    
    /**
     * Find connection by address and port (for ESP32 responses)
     */
    private findConnectionByAddress(address: string, port: number): QuicVCConnection | undefined {
        for (const conn of this.connections.values()) {
            // Match any connection with the same address/port
            if (conn.address === address && conn.port === port) {
                return conn;
            }
        }
        return undefined;
    }
    
    private generateChallenge(): string {
        return Buffer.from(tweetnacl.randomBytes(32)).toString('hex');
    }
    
    private createPacket(type: QuicVCPacketType, connection: QuicVCConnection, payload: string, frameType?: QuicVCFrameType): Uint8Array {
        // Create proper packet format with frame structure for ESP32 compatibility
        const header = {
            type,
            version: this.QUICVC_VERSION,
            dcid: connection.dcid,
            scid: connection.scid,
            packetNumber: connection.nextPacketNumber++
        };

        // Serialize header
        const headerBytes = this.serializeHeader(header);

        // For INITIAL packets, create proper frame structure that ESP32 expects
        let frameBytes: Uint8Array;
        if (type === QuicVCPacketType.INITIAL && frameType !== undefined) {
            // Create frame: frame_type(1) + frame_length(2) + frame_data
            const payloadBytes = new TextEncoder().encode(payload);
            frameBytes = new Uint8Array(1 + 2 + payloadBytes.length);

            // Frame type (1 byte)
            frameBytes[0] = frameType;

            // Frame length (2 bytes, big-endian)
            const frameLength = payloadBytes.length;
            frameBytes[1] = (frameLength >> 8) & 0xFF;
            frameBytes[2] = frameLength & 0xFF;

            // Frame data
            frameBytes.set(payloadBytes, 3);
        } else {
            // For other packet types, use payload directly
            frameBytes = new TextEncoder().encode(payload);
        }

        // Update the length field in the header with actual payload length
        // For INITIAL packets: length field is at offset = flags(1) + version(4) + dcid_len(1) + dcid + scid_len(1) + scid + token_len(1)
        // Length field format: 2-byte varint encoding (payload_length + packet_number_length)
        if (type === QuicVCPacketType.INITIAL || type === QuicVCPacketType.HANDSHAKE) {
            const pnLength = 2; // We use 2-byte packet numbers
            const totalPayloadLength = frameBytes.length + pnLength;

            // Find the offset to the length field in the header
            let lengthOffset = 1 + 4 + 1 + header.dcid.length + 1 + header.scid.length;
            if (type === QuicVCPacketType.INITIAL) {
                lengthOffset += 1; // Skip token length field for INITIAL packets
            }

            // Write 2-byte varint (0x40 | (length >> 8), length & 0xFF)
            // Max length is 16383 for 2-byte varint
            if (totalPayloadLength <= 16383) {
                headerBytes[lengthOffset] = 0x40 | ((totalPayloadLength >> 8) & 0x3F);
                headerBytes[lengthOffset + 1] = totalPayloadLength & 0xFF;
            } else {
                console.warn('[QuicVCConnectionManager] Payload too large for 2-byte varint, truncating');
                headerBytes[lengthOffset] = 0x7F;
                headerBytes[lengthOffset + 1] = 0xFF;
            }
        }

        // Combine header and frames
        const packet = new Uint8Array(headerBytes.length + frameBytes.length);
        packet.set(headerBytes, 0);
        packet.set(frameBytes, headerBytes.length);

        return packet;
    }
    
    /**
     * Create a PROTECTED packet with binary frame data
     */
    private createProtectedPacket(connection: QuicVCConnection, frameData: Uint8Array): Uint8Array {
        // Create header for PROTECTED packet
        const header = {
            type: QuicVCPacketType.PROTECTED,
            version: this.QUICVC_VERSION,
            dcid: connection.dcid,
            scid: connection.scid,
            packetNumber: connection.nextPacketNumber++
        };
        
        // Serialize header
        const headerBytes = this.serializeHeader(header);
        
        // For PROTECTED packets, use the frame data as-is (it's already properly formatted)
        // The frameData already contains the frame type and payload
        
        // Combine header and frame data
        const packet = new Uint8Array(headerBytes.length + frameData.length);
        packet.set(headerBytes, 0);
        packet.set(frameData, headerBytes.length);
        
        console.log(`[QuicVCConnectionManager] Created PROTECTED packet: header ${headerBytes.length} bytes, frame ${frameData.length} bytes, total ${packet.length} bytes`);
        
        return packet;
    }
    
    private async createEncryptedPacket(
        type: QuicVCPacketType,
        connection: QuicVCConnection,
        payload: string,
        keys: CryptoKeys,
        frameType?: QuicVCFrameType
    ): Promise<Uint8Array> {
        // Create packet with encryption
        const packet = this.createPacket(type, connection, payload, frameType);
        
        // Encrypt payload portion
        // TODO: Implement proper AEAD encryption
        
        return packet;
    }
    
    private serializeHeader(header: QuicVCPacketHeader): Uint8Array {
        // QUIC spec-compliant header serialization per RFC 9000
        // For INITIAL packets: flags(1) + version(4) + dcid_len(1) + dcid + scid_len(1) + scid + token_len(varint) + token + length(varint) + pn(1-4)
        // For other long headers: flags(1) + version(4) + dcid_len(1) + dcid + scid_len(1) + scid + length(varint) + pn(1-4)

        // Calculate packet number length (use 2 bytes for now as per QUIC spec)
        const pnLength = 2;
        const pnLengthBits = pnLength - 1; // 0=1byte, 1=2bytes, 2=4bytes

        // Flags byte: bit 7 = long header (1), bits 5-4 = packet type for QUIC v1, bits 1-0 = packet number length - 1
        let flags: number;
        switch (header.type) {
            case QuicVCPacketType.INITIAL:
                flags = 0xC0 | pnLengthBits;  // Long header + INITIAL packet type + PN length
                break;
            case QuicVCPacketType.HANDSHAKE:
                flags = 0xD0 | pnLengthBits;  // Long header + HANDSHAKE packet type + PN length
                break;
            case QuicVCPacketType.PROTECTED:
                flags = 0x40 | pnLengthBits;  // Short header + PN length
                break;
            case QuicVCPacketType.RETRY:
                flags = 0xF0;  // Long header + RETRY packet type (no PN length)
                break;
            default:
                flags = 0x80 | (header.type & 0x03) | pnLengthBits;  // Fallback
        }

        // For INITIAL packets, calculate total size including token and length fields
        let totalSize: number;
        if (header.type === QuicVCPacketType.INITIAL) {
            // flags(1) + version(4) + dcid_len(1) + dcid + scid_len(1) + scid + token_len(1) + length(2) + pn(2)
            totalSize = 1 + 4 + 1 + header.dcid.length + 1 + header.scid.length + 1 + 2 + pnLength;
        } else if (header.type === QuicVCPacketType.PROTECTED) {
            // Short header: flags(1) + dcid + pn(2)
            totalSize = 1 + header.dcid.length + pnLength;
        } else {
            // Other long headers: flags(1) + version(4) + dcid_len(1) + dcid + scid_len(1) + scid + length(2) + pn(2)
            totalSize = 1 + 4 + 1 + header.dcid.length + 1 + header.scid.length + 2 + pnLength;
        }

        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);
        let offset = 0;

        view.setUint8(offset++, flags);

        if (header.type !== QuicVCPacketType.PROTECTED) {
            // Version (4 bytes, big-endian) - only for long headers
            view.setUint32(offset, header.version, false); offset += 4;
        }

        // DCID length and data (long header) or just DCID (short header)
        if (header.type !== QuicVCPacketType.PROTECTED) {
            view.setUint8(offset++, header.dcid.length);
        }
        new Uint8Array(buffer, offset, header.dcid.length).set(header.dcid);
        offset += header.dcid.length;

        if (header.type !== QuicVCPacketType.PROTECTED) {
            // SCID length and data (only for long headers)
            view.setUint8(offset++, header.scid.length);
            new Uint8Array(buffer, offset, header.scid.length).set(header.scid);
            offset += header.scid.length;

            // For INITIAL packets, add token length field (variable-length integer, using 1 byte = 0)
            if (header.type === QuicVCPacketType.INITIAL) {
                view.setUint8(offset++, 0x00); // Token length = 0 (no token)
                // No token bytes to write
            }

            // Length field (variable-length integer) - placeholder, will be set by caller with payload length
            // For now, use 2-byte varint (0x40 | length)
            // This will need to be updated with actual payload length by createPacket
            view.setUint8(offset++, 0x40); // 2-byte varint prefix
            view.setUint8(offset++, 0x00); // Placeholder for actual length
        }

        // Packet number (variable length based on pnLength)
        const pn = Number(header.packetNumber & 0xFFFFn); // Use lower 16 bits
        if (pnLength === 1) {
            view.setUint8(offset, pn & 0xFF);
        } else if (pnLength === 2) {
            view.setUint16(offset, pn & 0xFFFF, false); // big-endian
        } else if (pnLength === 4) {
            view.setUint32(offset, pn, false); // big-endian
        }

        return new Uint8Array(buffer);
    }
    
    private parsePacketHeader(data: Uint8Array): QuicVCPacketHeader | null {
        if (data.length < 10) return null; // Minimum header size

        const view = new DataView(data.buffer, data.byteOffset);
        let offset = 0;

        // Parse flags byte
        const flags = view.getUint8(offset++);
        const longHeader = (flags & 0x80) !== 0;
        const fixedBit = (flags & 0x40) !== 0;

        if (!longHeader) {
            console.warn('[QuicVCConnectionManager] Short header not supported');
            return null;
        }

        // For QUIC v1, the packet type is in bits 5-4 of the flags byte
        // 0xC0 = INITIAL, 0xE0 = HANDSHAKE, 0xD0 = 0-RTT, 0xF0 = RETRY
        let type: QuicVCPacketType;
        if ((flags & 0xF0) === 0xC0) {
            type = QuicVCPacketType.INITIAL;
        } else if ((flags & 0xF0) === 0xE0) {
            type = QuicVCPacketType.HANDSHAKE; // ESP32 sends 0xE0 for its VC_RESPONSE
        } else if ((flags & 0xF0) === 0xD0) {
            type = QuicVCPacketType.HANDSHAKE; // Also treat 0xD0 as handshake
        } else {
            // For simplicity, treat others as PROTECTED
            type = QuicVCPacketType.PROTECTED;
        }

        // Version
        const version = view.getUint32(offset, false); offset += 4;

        // DCID length and data
        const dcidLen = view.getUint8(offset++);
        if (data.length < offset + dcidLen + 1) return null;

        const dcid = new Uint8Array(data.buffer, data.byteOffset + offset, dcidLen);
        offset += dcidLen;

        // SCID length and data
        const scidLen = view.getUint8(offset++);
        if (data.length < offset + scidLen) return null;

        const scid = new Uint8Array(data.buffer, data.byteOffset + offset, scidLen);
        offset += scidLen;

        // Calculate header length based on packet type
        let headerLength = offset;
        let packetNumber = BigInt(0);

        // ESP32 doesn't always send a packet number, especially for simple responses
        // Check if we have enough data for packet number
        if (type === QuicVCPacketType.INITIAL) {
            // For INITIAL packets from ESP32
            // Token length (variable-length integer, but ESP32 uses 1 byte with value 0)
            if (data.length > offset) {
                const tokenLen = view.getUint8(offset++);
                offset += tokenLen; // Skip token bytes if any
            }

            // ESP32 might send a length field or might not
            // Check if there's more data that looks like a length field
            if (data.length >= offset + 2) {
                // Check if next bytes look like a reasonable length (< 1500 for typical MTU)
                const possibleLength = view.getUint16(offset, false);
                if (possibleLength > 0 && possibleLength < 1500) {
                    // This looks like a length field
                    offset += 2;
                }
            }

            // ESP32 might not send packet number for simple responses
            // Check if there's at least 1 byte left that could be packet number
            if (data.length > offset) {
                // Try to read 1-byte packet number
                packetNumber = BigInt(view.getUint8(offset));
                headerLength = offset + 1;
            } else {
                // No packet number, payload starts at current offset
                headerLength = offset;
            }

            return { type, version, dcid, scid, packetNumber, headerLength };
        } else if (type === QuicVCPacketType.HANDSHAKE) {
            // For HANDSHAKE packets from ESP32 (which contain VC_RESPONSE)
            // ESP32 sends frames directly after the header without packet number
            // The payload starts immediately after SCID
            headerLength = offset;
            return { type, version, dcid, scid, packetNumber, headerLength };
        } else {
            // For other packet types, try to read packet number if available
            if (data.length >= offset + 8) {
                packetNumber = view.getBigUint64(offset, false);
                headerLength = offset + 8;
            } else if (data.length >= offset + 1) {
                packetNumber = BigInt(view.getUint8(offset));
                headerLength = offset + 1;
            } else {
                headerLength = offset;
            }

            return { type, version, dcid, scid, packetNumber, headerLength };
        }
    }
    
    private extractPayload(data: Uint8Array, header: QuicVCPacketHeader): Uint8Array {
        // Use the header length calculated during parsing
        // This properly accounts for INITIAL packet structure with token and length fields
        const headerSize = (header as any).headerLength ||
            // Fallback for backward compatibility
            (1 + 4 + 1 + header.dcid.length + 1 + header.scid.length + 8);
        console.log('[QuicVCConnectionManager] Extracting payload: headerSize =', headerSize, 'dataLength =', data.length, 'payloadLength =', data.length - headerSize);
        return data.slice(headerSize);
    }
    
    private async decryptPacket(data: Uint8Array, header: QuicVCPacketHeader, keys: CryptoKeys): Promise<Uint8Array | null> {
        // TODO: Implement proper AEAD decryption
        return this.extractPayload(data, header);
    }
    
    private parseFrames(data: Uint8Array): any[] {
        console.log('[QuicVCConnectionManager] Parsing frames from', data.length, 'bytes');
        console.log('[QuicVCConnectionManager] First 20 bytes of frame data:', Array.from(data.slice(0, Math.min(20, data.length))).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

        const frames: any[] = [];
        let offset = 0;

        try {
            while (offset < data.length) {
                if (offset + 3 > data.length) break; // Need at least frame_type + length

                const frameType = data[offset];
                const length = (data[offset + 1] << 8) | data[offset + 2];
                offset += 3;

                console.log('[QuicVCConnectionManager] Frame type: 0x' + frameType.toString(16).padStart(2, '0'), 'length:', length);
                
                if (offset + length > data.length) {
                    console.warn('[QuicVCConnectionManager] Frame length extends beyond payload - ignoring rest of packet');
                    break; // Stop parsing but return what we have so far
                }
                
                const framePayload = data.slice(offset, offset + length);
                offset += length;
                
                // For now, try to parse frame payload as JSON if it looks like VC data
                let frame: any = { type: frameType, payload: framePayload };
                
                // Parse specific frame types
                if (frameType === QuicVCFrameType.VC_INIT || frameType === QuicVCFrameType.VC_RESPONSE) {
                    try {
                        const jsonData = JSON.parse(new TextDecoder().decode(framePayload));
                        frame = { ...frame, ...jsonData, type: frameType };
                    } catch (e) {
                        console.warn('[QuicVCConnectionManager] Frame payload is not JSON:', e.message);
                    }
                } else if (frameType === QuicVCFrameType.STREAM) {
                    // STREAM frames have stream ID as first byte, then data
                    if (framePayload.length > 0) {
                        const streamId = framePayload[0];
                        const streamData = framePayload.slice(1);
                        
                        // Try to parse stream data as JSON (ESP32 sends JSON for LED responses)
                        try {
                            const jsonData = JSON.parse(new TextDecoder().decode(streamData));
                            frame = { type: frameType, streamId, data: jsonData };
                            console.log('[QuicVCConnectionManager] Parsed STREAM frame:', { streamId, data: jsonData });
                        } catch (e) {
                            // If not JSON, keep as binary
                            frame = { type: frameType, streamId, data: streamData };
                        }
                    }
                } else if (frameType === QuicVCFrameType.HEARTBEAT) {
                    // Heartbeat frames contain JSON data
                    try {
                        const jsonData = JSON.parse(new TextDecoder().decode(framePayload));
                        frame = { ...frame, ...jsonData, type: frameType };
                    } catch (e) {
                        console.warn('[QuicVCConnectionManager] Heartbeat payload is not JSON:', e.message);
                    }
                }
                
                frames.push(frame);
            }
        } catch (error) {
            console.error('[QuicVCConnectionManager] Error parsing frames:', error);
        }
        
        console.log('[QuicVCConnectionManager] Parsed', frames.length, 'frames');
        return frames;
    }
    
    private handleHeartbeatFrame(connection: QuicVCConnection, frame: any): void {
        debug(`Received heartbeat from ${connection.deviceId}`);
        // Could send acknowledgment if needed
    }
    
    /**
     * Handle STREAM frame with embedded service type
     * STREAM frames carry service-type-specific data within QUICVC
     */
    private handleStreamFrame(connection: QuicVCConnection, frame: any): void {
        // STREAM frame format:
        // { type: STREAM, streamId: serviceType, data: serviceData }
        const streamId = frame.streamId;
        
        console.log('[QuicVCConnectionManager] Handling STREAM frame:', { 
            streamId, 
            data: frame.data,
            deviceId: connection.deviceId,
            connectionState: connection.state
        });
        
        // Check if this is an LED response (streamId 0x01)
        if (streamId === 0x01 && frame.data && typeof frame.data === 'object') {
            // This is an LED control response from ESP32
            if (frame.data.type === 'led_response' && frame.data.requestId) {
                console.log('[QuicVCConnectionManager] Received LED response:', {
                    data: frame.data,
                    deviceId: connection.deviceId,
                    hasDeviceId: !!connection.deviceId
                });
                
                // If no deviceId on connection, try to get it from the response
                if (!connection.deviceId && frame.data.device_id) {
                    connection.deviceId = frame.data.device_id;
                    console.log('[QuicVCConnectionManager] Set deviceId from LED response:', connection.deviceId);
                } else if (!connection.deviceId) {
                    // Last resort: derive from connection's SCID (ESP32 MAC)
                    const mac = Array.from(connection.scid.slice(0, 6))
                        .map(b => b.toString(16).padStart(2, '0'))
                        .join(':');
                    connection.deviceId = `esp32-${mac.replace(/:/g, '').toLowerCase()}`;
                    console.log('[QuicVCConnectionManager] Derived deviceId from connection SCID:', connection.deviceId);
                }
                
                // Emit LED response event for ESP32ConnectionManager to handle
                if (connection.deviceId) {
                    console.log('[QuicVCConnectionManager] Emitting onLEDResponse for device:', connection.deviceId);
                    this.onLEDResponse.emit(connection.deviceId, frame.data);
                } else {
                    console.error('[QuicVCConnectionManager] Cannot emit LED response - no deviceId on connection');
                }
                return;
            }
        }
        
        // Otherwise, check for service handlers
        const handler = connection.serviceHandlers?.get(streamId);
        if (handler) {
            const data = typeof frame.data === 'string' 
                ? new TextEncoder().encode(frame.data)
                : frame.data;
            handler(data, connection.deviceId);
        } else {
            debug(`No handler for stream ID ${streamId} from ${connection.deviceId}`);
        }
    }
    
    /**
     * Send data with service type over QUICVC
     * Service types are embedded in STREAM frames
     */
    async sendServiceData(deviceId: string, serviceType: number, data: Uint8Array): Promise<void> {
        const connection = this.getConnectionByDeviceId(deviceId);
        if (!connection || connection.state !== 'established') {
            throw new Error(`No established connection to ${deviceId}`);
        }
        
        const streamFrame = {
            type: QuicVCFrameType.STREAM,
            streamId: serviceType, // Use streamId to carry service type
            data: Buffer.from(data).toString('base64'), // Base64 for JSON transport
            timestamp: Date.now()
        };
        
        await this.sendProtectedPacket(connection, [streamFrame]);
        debug(`Sent service type ${serviceType} data to ${deviceId}`);
    }
    
    /**
     * Register service handler for a specific service type
     */
    registerServiceHandler(serviceType: number, handler: (data: Uint8Array, deviceId: string) => void): void {
        // Register globally and on all connections
        this.connections.forEach(conn => {
            if (!conn.serviceHandlers) {
                conn.serviceHandlers = new Map();
            }
            conn.serviceHandlers.set(serviceType, handler);
        });
    }
    
    private getConnectionByDeviceId(deviceId: string): QuicVCConnection | undefined {
        for (const conn of this.connections.values()) {
            if (conn.deviceId === deviceId) {
                return conn;
            }
        }
        return undefined;
    }
    
    /**
     * Send discovery broadcast using QUICVC INITIAL packets with DISCOVERY frame
     */
    async sendDiscoveryBroadcast(deviceInfo: {
        deviceId: string;
        deviceType: number;
        ownership: number;
        capabilities: Uint8Array;
    }): Promise<void> {
        // Create DISCOVERY frame
        const discoveryFrame = {
            type: QuicVCFrameType.DISCOVERY,
            deviceId: deviceInfo.deviceId,
            deviceType: deviceInfo.deviceType,
            ownership: deviceInfo.ownership, // 0x00=unclaimed, 0x01=claimed
            capabilities: Buffer.from(deviceInfo.capabilities).toString('base64'),
            timestamp: Date.now()
        };
        
        // Create INITIAL packet with DISCOVERY frame
        const dcid = new Uint8Array(0); // Empty DCID for broadcast
        const scid = tweetnacl.randomBytes(this.CONNECTION_ID_LENGTH); // Random SCID
        
        const packet = {
            type: QuicVCPacketType.INITIAL,
            version: this.QUICVC_VERSION,
            dcid,
            scid,
            packetNumber: 0n,
            payload: JSON.stringify(discoveryFrame)
        };
        
        const packetBytes = this.serializeDiscoveryPacket(packet);
        
        // Broadcast to 255.255.255.255:49497
        const quicModel = this.getQuicModel();
        await quicModel.send(packetBytes, '255.255.255.255', this.QUICVC_PORT);
        
        debug(`Sent QUICVC discovery broadcast for device ${deviceInfo.deviceId}`);
    }
    
    /**
     * Serialize discovery packet (simpler format for broadcast)
     */
    private serializeDiscoveryPacket(packet: {
        type: QuicVCPacketType;
        version: number;
        dcid: Uint8Array;
        scid: Uint8Array;
        packetNumber: bigint;
        payload: string;
    }): Uint8Array {
        const payloadBytes = new TextEncoder().encode(packet.payload);
        const buffer = new ArrayBuffer(1 + 4 + 1 + 1 + packet.dcid.length + packet.scid.length + payloadBytes.length);
        const view = new DataView(buffer);
        let offset = 0;
        
        view.setUint8(offset++, packet.type);
        view.setUint32(offset, packet.version); offset += 4;
        view.setUint8(offset++, packet.dcid.length);
        view.setUint8(offset++, packet.scid.length);
        
        new Uint8Array(buffer, offset, packet.dcid.length).set(packet.dcid);
        offset += packet.dcid.length;
        
        new Uint8Array(buffer, offset, packet.scid.length).set(packet.scid);
        offset += packet.scid.length;
        
        new Uint8Array(buffer, offset).set(payloadBytes);
        
        return new Uint8Array(buffer);
    }
    
    private async sendPacket(connection: QuicVCConnection, packet: Uint8Array): Promise<void> {
        try {
            const quicModel = this.getQuicModel();
            console.log(`[QuicVCConnectionManager] Sending packet to ${connection.address}:${connection.port}, size: ${packet.length} bytes`);
            await quicModel.send(packet, connection.address, connection.port);
            console.log(`[QuicVCConnectionManager] Packet sent successfully`);
        } catch (error) {
            console.error(`[QuicVCConnectionManager] Failed to send packet to ${connection.address}:${connection.port}:`, error);
            throw error;
        }
    }
    
    private getQuicModel(): QuicModel {
        if (!this.quicModel) {
            this.quicModel = QuicModel.getInstance();
        }
        return this.quicModel;
    }
    
    private resetIdleTimeout(connection: QuicVCConnection): void {
        if (connection.idleTimeout) {
            clearTimeout(connection.idleTimeout);
        }
        
        connection.idleTimeout = setTimeout(() => {
            this.closeConnection(connection, 'Idle timeout');
        }, this.IDLE_TIMEOUT);
    }
    
    private handleHandshakeTimeout(connId: string): void {
        const connection = this.connections.get(connId);
        if (connection && connection.state !== 'established') {
            this.closeConnection(connection, 'Handshake timeout');
        }
    }
    
    private closeConnection(connection: QuicVCConnection, reason: string): void {
        const connId = this.getConnectionId(connection.scid);
        
        console.log(`[QuicVCConnectionManager] ❌ CLOSING CONNECTION ${connId} for device ${connection.deviceId} - Reason: ${reason}`);
        console.log(`[QuicVCConnectionManager] Connection was in state: ${connection.state}`);
        console.log(`[QuicVCConnectionManager] Stack trace:`, new Error().stack?.split('\n').slice(1, 4).join('\n'));
        
        // Clear timers
        if (connection.handshakeTimeout) clearTimeout(connection.handshakeTimeout);
        if (connection.heartbeatInterval) clearInterval(connection.heartbeatInterval);
        if (connection.idleTimeout) clearTimeout(connection.idleTimeout);
        
        // Remove from map
        this.connections.delete(connId);
        
        // Emit event
        if (connection.deviceId) {
            this.onConnectionClosed.emit(connection.deviceId, reason);
        }
        
        console.log(`[QuicVCConnectionManager] Connection closed: ${connection.deviceId || 'unknown'} - ${reason}`);
    }
    
    /**
     * Public API
     */
    
    isConnected(deviceId: string): boolean {
        for (const conn of this.connections.values()) {
            if (conn.deviceId === deviceId && conn.state === 'established') {
                return true;
            }
        }
        return false;
    }
    
    async sendData(deviceId: string, data: Uint8Array): Promise<void> {
        const connection = Array.from(this.connections.values())
            .find(c => c.deviceId === deviceId && c.state === 'established');
        
        if (!connection) {
            throw new Error(`No established connection to ${deviceId}`);
        }
        
        const streamFrame = {
            type: QuicVCFrameType.STREAM,
            streamId: 0, // Single stream for now
            offset: 0,
            data: Array.from(data)
        };
        
        await this.sendProtectedPacket(connection, [streamFrame]);
    }
    
    disconnect(deviceId: string): void {
        const connection = Array.from(this.connections.values())
            .find(c => c.deviceId === deviceId);
        
        if (connection) {
            this.closeConnection(connection, 'User requested');
        }
    }
}