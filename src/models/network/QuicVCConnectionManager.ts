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
import { parseFromMicrodata } from '@src/utils/microdataHelpers';

// QUIC-VC protocol abstractions
import {
    QuicPacketType,
    QuicFrameType,
    QuicVCFrameType,
    buildLongHeaderPacket,
    buildShortHeaderPacket,
    parsePacketHeader as parseQuicPacketHeader,
    VCInitFrame,
    VCResponseFrame,
    StreamFrame,
    DiscoveryFrame,
    HeartbeatFrame,
    parseFrame,
    decodeVarint,
    encodeVarint,
    type QuicLongHeader,
    type QuicShortHeader
} from '@refinio/quicvc-protocol';

const debug = Debug('one:quic:vc:connection');

// QUICVC packet types
export enum QuicVCPacketType {
    INITIAL = 0x00,      // Contains VC_INIT frame
    HANDSHAKE = 0x01,    // Contains VC_RESPONSE frame
    PROTECTED = 0x02,    // Regular data packets (encrypted)
    RETRY = 0x03         // Retry with different parameters
}

// QuicVCFrameType is now imported from @refinio/quicvc-protocol

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
    sessionKey: Uint8Array | null;  // ESP32-style session key for XOR encryption

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
    private readonly CONNECTION_ID_LENGTH = 8; // bytes (ESP32 uses 8-byte DCID in short headers)

    // Encryption configuration (for debugging)
    private static ENABLE_ENCRYPTION = true; // Set to false to disable encryption for debugging
    
    // Events
    public readonly onConnectionEstablished = new OEvent<(deviceId: string, vcInfo: VerifiedVCInfo) => void>();
    public readonly onConnectionClosed = new OEvent<(deviceId: string, reason: string) => void>();
    public readonly onConnectionRetryNeeded = new OEvent<(deviceId: string, address: string, port: number) => void>();
    public readonly onHandshakeComplete = new OEvent<(deviceId: string) => void>();
    public readonly onPacketReceived = new OEvent<(deviceId: string, data: Uint8Array) => void>();
    public readonly onError = new OEvent<(deviceId: string, error: Error) => void>();
    public readonly onLEDResponse = new OEvent<(deviceId: string, response: any) => void>();
    public readonly onOwnershipRemovalAck = new OEvent<(deviceId: string, response: any) => void>();
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
        if (existingConnection) {
            console.log(`[QuicVCConnectionManager] Found existing connection to ${address}:${port} in state: ${existingConnection.state}`);

            // CRITICAL: When claiming/provisioning, always close old connections and start fresh
            // Old connections may be receiving stale discovery broadcasts that contradict the new ownership state
            console.log(`[QuicVCConnectionManager] Closing existing connection to ensure clean ownership claim`);
            this.closeConnection(existingConnection, 'Starting fresh for ownership claim');
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
            sessionKey: null,  // Will be derived when connection is established
            serviceHandlers: new Map(),
            handshakeTimeout: null,
            heartbeatInterval: null,
            idleTimeout: null,
            createdAt: Date.now(),
            lastActivity: Date.now()
        };

        // CRITICAL: Store connection by SCID (not DCID) because ESP32 will use our SCID as its DCID in responses
        // This allows findConnectionByIds() to match incoming packets correctly
        const connId = this.getConnectionId(scid);
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

                    // CRITICAL: If this is an INITIAL packet with DISCOVERY frame and connection is ESTABLISHED,
                    // this is likely a discovery broadcast AFTER ownership release.
                    // Don't reuse the established connection - treat as fresh discovery.
                    if (header.type === QuicVCPacketType.INITIAL && connection.state === 'established') {
                        const payload = this.extractPayload(data, header);
                        if (payload.length > 3 && payload[0] === 0x30) { // DISCOVERY frame
                            console.log('[QuicVCConnectionManager] INITIAL packet with DISCOVERY frame on established connection - treating as fresh discovery broadcast');
                            // Reset connection to null so it's handled as discovery without reusing established connection
                            connection = null;
                        }
                    }
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
            sessionKey: null,  // Will be derived when connection is established
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
        // Extract payload (skip header)
        const payload = this.extractPayload(data, header);

        // Check if this is a discovery frame first (no connection needed)
        if (payload.length > 3 && payload[0] === 0x30) { // Frame type 0x30 = DISCOVERY
            // If we have an active connection with a credential (ownership claim in progress),
            // IGNORE discovery packets entirely - don't let them interfere with the handshake
            if (connection && connection.state === 'initial' && connection.localVC) {
                console.log('[QuicVCConnectionManager] Ignoring discovery packet - ownership claim in progress');
                return;
            }

            // Otherwise, handle discovery normally
            await this.handleDiscoveryPacket(payload, header, rinfo);
            return; // Don't create or update connection for discovery
        }

        // For non-discovery packets, we need a connection
        if (!connection) {
            console.error('[QuicVCConnectionManager] No connection for non-discovery INITIAL packet');
            return;
        }

        // Parse binary QUIC frames
        const frames = this.parseFrames(payload, QuicVCPacketType.INITIAL);
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
        if (frame.status === 'provisioned') {
            // Device accepted our ownership claim
            console.log('[QuicVCConnectionManager] ESP32 provisioned successfully');
            console.log('[QuicVCConnectionManager] frame.owner:', frame.owner);

            // Update connection state
            connection.state = 'established';
            if (frame.owner) {
                connection.remoteVC = { issuerPersonId: frame.owner } as any;
                console.log('[QuicVCConnectionManager] Set connection.remoteVC to:', connection.remoteVC);

                // Derive session key from owner Person ID for ESP32 encryption
                try {
                    connection.sessionKey = await this.deriveSessionKey(frame.owner);
                    console.log('[QuicVCConnectionManager] Derived session key for ESP32 encryption');
                } catch (error) {
                    console.error('[QuicVCConnectionManager] Failed to derive session key:', error);
                }
            } else {
                console.warn('[QuicVCConnectionManager] No frame.owner in response, remoteVC will be null');
            }

            // Complete handshake and emit onConnectionEstablished
            this.completeHandshake(connection);

            console.log('[QuicVCConnectionManager] ESP32 provisioning completed successfully');
            console.log('[QuicVCConnectionManager] Keeping connection open for future commands');
        } else if (frame.status === 'already_owned') {
            // Device is already owned - check if it's us
            const storedOwner = frame.owner;

            if (storedOwner === this.ownPersonId) {
                // This is OUR device already - treat as provisioned
                console.log('[QuicVCConnectionManager] ✅ Device is already owned by current user');
                console.log('[QuicVCConnectionManager] Device owner:', storedOwner);
                console.log('[QuicVCConnectionManager] Current user:', this.ownPersonId);

                // Update connection state as if it was provisioned
                connection.state = 'established';
                connection.remoteVC = { issuerPersonId: storedOwner } as any;

                // Derive session key from owner Person ID for ESP32 encryption
                try {
                    connection.sessionKey = await this.deriveSessionKey(storedOwner);
                    console.log('[QuicVCConnectionManager] Derived session key for ESP32 encryption');
                } catch (error) {
                    console.error('[QuicVCConnectionManager] Failed to derive session key:', error);
                }

                // Complete handshake and emit onConnectionEstablished
                this.completeHandshake(connection);

                console.log('[QuicVCConnectionManager] Device recognized as already owned by us');
                console.log('[QuicVCConnectionManager] Keeping connection open for future commands');
            } else {
                // Device is owned by someone else
                console.error('[QuicVCConnectionManager] ❌ Device is owned by another user');
                console.error('[QuicVCConnectionManager] Device owner:', storedOwner);
                console.error('[QuicVCConnectionManager] Current user:', this.ownPersonId);

                // Close the connection - this device belongs to someone else
                this.closeConnection(connection, `Owned by different user: ${storedOwner}`)
            }
        } else if (frame.status === 'ownership_revoked') {
            // Ownership was revoked successfully
            console.log('[QuicVCConnectionManager] Ownership revoked successfully');
            // Close the connection so we can establish a fresh one when reclaiming
            console.log('[QuicVCConnectionManager] Closing connection to allow fresh reclaim');
            this.closeConnection(connection, 'Ownership revoked - ready for reclaim');
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
                console.log('[QuicVCConnectionManager] Discovery content:', contentString);

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
                } else if (contentString.startsWith('<!DOCTYPE html>') || contentString.startsWith('<html')) {
                    // Parse HTML microdata for device information
                    const deviceIdMatch = contentString.match(/itemprop="deviceId" content="([^"]+)"/);
                    const deviceTypeMatch = contentString.match(/itemprop="deviceType" content="([^"]+)"/);
                    const statusMatch = contentString.match(/itemprop="status" content="([^"]+)"/);
                    const ownershipMatch = contentString.match(/itemprop="ownership" content="([^"]+)"/);

                    discoveryData = {
                        id: deviceIdMatch ? deviceIdMatch[1] : '',
                        type: deviceTypeMatch ? (deviceTypeMatch[1] === '1' ? 'ESP32' : deviceTypeMatch[1]) : 'ESP32',
                        status: statusMatch ? statusMatch[1] : 'online',
                        ownership: ownershipMatch ? (ownershipMatch[1] === '0' ? 'unclaimed' : 'owned') : 'unclaimed'
                    };
                }

                // Emit discovery event without creating a connection
                const discoveryEvent = {
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
                };
                console.log('[QuicVCConnectionManager] *** EMITTING onDeviceDiscovered event:', discoveryEvent);
                this.onDeviceDiscovered.emit(discoveryEvent);
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

        // Parse the discovery data - supports both JSON and HTML microdata
        // NEVER throw - gracefully handle malformed data
        try {
            const contentString = typeof frame.payload === 'string'
                ? frame.payload
                : new TextDecoder().decode(frame.payload);

            let discoveryData: any = {};

            // Try JSON first (new compact format)
            if (contentString.startsWith('{')) {
                try {
                    const json = JSON.parse(contentString);
                    discoveryData = {
                        device_id: json.i || json.device_id || '',
                        device_type: json.t === 'DevicePresence' ? 'ESP32' : (json.device_type || json.type || 'ESP32'),
                        status: json.s || json.status || 'online',
                        ownership: json.o || json.ownership || 'unclaimed'
                    };
                } catch (jsonError) {
                    console.warn('[QuicVCConnectionManager] Discovery payload looks like JSON but failed to parse - ignoring');
                    return; // Silent return - don't throw
                }
            } else if (contentString.startsWith('<!DOCTYPE html>') || contentString.startsWith('<html')) {
                // Parse HTML microdata for device information
                // Support both "id" and "deviceId" property names
                const deviceIdMatch = contentString.match(/itemprop="(?:deviceId|id)" content="([^"]+)"/);
                // Support both "type" and "deviceType" property names
                const deviceTypeMatch = contentString.match(/itemprop="(?:deviceType|type)" content="([^"]+)"/);
                const statusMatch = contentString.match(/itemprop="status" content="([^"]+)"/);
                const ownershipMatch = contentString.match(/itemprop="ownership" content="([^"]+)"/);

                discoveryData = {
                    device_id: deviceIdMatch ? deviceIdMatch[1] : '',
                    device_type: deviceTypeMatch ? (deviceTypeMatch[1] === '1' ? 'ESP32' : deviceTypeMatch[1]) : 'ESP32',
                    status: statusMatch ? statusMatch[1] : 'online',
                    // Support both numeric (0/1) and string (unclaimed/claimed/owned) formats
                    ownership: ownershipMatch ?
                        (ownershipMatch[1] === '0' || ownershipMatch[1] === 'unclaimed' ? 'unclaimed' : 'owned') :
                        'unclaimed'
                };
            } else {
                // Unknown format - silently ignore
                console.log('[QuicVCConnectionManager] Discovery frame has unknown format - ignoring');
                return; // Silent return - don't throw
            }

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
                // If connection was previously established, clear session key since device has no owner
                if (connection.state === 'established' && connection.sessionKey) {
                    console.log('[QuicVCConnectionManager] Device became unclaimed - clearing session key and resetting state');
                    connection.sessionKey = null;
                    connection.state = 'initial';
                    connection.remoteVC = null;
                }
                // Connection remains in 'initial' state until user claims via UI
            } else if (deviceInfo.ownership === 'claimed' && connection) {
                // For claimed devices, authentication may be needed if we're the owner
                console.log('[QuicVCConnectionManager] Device is claimed, authentication may be needed');
                // Authentication will be triggered by DeviceDiscoveryModel/ESP32ConnectionManager
            }

        } catch (error) {
            // Silently handle all errors - never throw for malformed external data
            console.warn('[QuicVCConnectionManager] Failed to process discovery frame - ignoring:', error.message || error);
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
        const frames = this.parseFrames(payload, QuicVCPacketType.HANDSHAKE);
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
        console.log(`[QuicVCConnectionManager] connection.remoteVC:`, connection.remoteVC);
        if (connection.remoteVC) {
            console.log(`[QuicVCConnectionManager] Emitting onConnectionEstablished with vcInfo:`, connection.remoteVC);
            this.onConnectionEstablished.emit(connection.deviceId, connection.remoteVC);
        } else {
            console.warn(`[QuicVCConnectionManager] No remoteVC for ${connection.deviceId}, skipping onConnectionEstablished`);
        }

        console.log(`[QuicVCConnectionManager] QUICVC handshake complete with ${connection.deviceId}`);
    }
    
    /**
     * Handle encrypted PROTECTED packets
     */
    private async handleProtectedPacket(connection: QuicVCConnection, data: Uint8Array, header: QuicVCPacketHeader): Promise<void> {
        console.log('[QuicVCConnectionManager] Handling PROTECTED packet, connection state:', connection.state);

        // For ESP32 with session key encryption (XOR cipher)
        if (connection.state === 'established' && connection.sessionKey) {
            console.log('[QuicVCConnectionManager] Decrypting PROTECTED packet with session key');
            console.log('[QuicVCConnectionManager] Session key (first 16 bytes):',
                Array.from(connection.sessionKey.slice(0, 16)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

            // Extract encrypted payload
            let payload = this.extractPayload(data, header);
            console.log('[QuicVCConnectionManager] Encrypted payload (first 50 bytes):',
                Array.from(payload.slice(0, Math.min(50, payload.length))).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

            // Decrypt with XOR cipher (starts at byte 0 of payload - header already removed)
            const decrypted = this.decryptPayload(payload, connection.sessionKey, 0);
            console.log('[QuicVCConnectionManager] Decrypted payload (first 50 bytes):',
                Array.from(decrypted.slice(0, Math.min(50, decrypted.length))).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

            // Parse frames from decrypted payload
            let frames = this.parseFrames(decrypted, QuicVCPacketType.PROTECTED);
            console.log('[QuicVCConnectionManager] Parsed', frames.length, 'frames from decrypted payload');

            // ESP32 might send service packets directly (service_type byte + JSON) without frame headers
            // If no frames parsed, try parsing as raw service packet
            if (frames.length === 0 && decrypted.length > 1) {
                console.log('[QuicVCConnectionManager] No frames found - trying ESP32 service packet format');
                console.log('[QuicVCConnectionManager] Service type byte:', '0x' + decrypted[0].toString(16).padStart(2, '0'));

                const serviceType = decrypted[0];
                const jsonPayload = decrypted.slice(1);

                try {
                    const jsonStr = new TextDecoder().decode(jsonPayload);
                    console.log('[QuicVCConnectionManager] Decoded JSON:', jsonStr);
                    const data = JSON.parse(jsonStr);

                    // Create a synthetic STREAM frame
                    frames = [{
                        type: QuicFrameType.STREAM,
                        streamId: serviceType,
                        data
                    }];
                    console.log('[QuicVCConnectionManager] Created synthetic STREAM frame for service type', serviceType);
                } catch (e) {
                    console.error('[QuicVCConnectionManager] Failed to parse as service packet:', e);
                }
            }

            // Process frames
            for (const frame of frames) {
                console.log('[QuicVCConnectionManager] Processing frame type:', frame.type);
                switch (frame.type) {
                    case QuicVCFrameType.HEARTBEAT:
                        this.handleHeartbeatFrame(connection, frame);
                        break;
                    case QuicFrameType.STREAM:
                        // STREAM frames contain service type and data
                        this.handleStreamFrame(connection, frame);
                        break;
                    case QuicVCFrameType.VC_RESPONSE:
                        // ESP32 might send VC_RESPONSE in PROTECTED packets during provisioning
                        console.log('[QuicVCConnectionManager] Found VC_RESPONSE in PROTECTED packet');
                        await this.handleVCResponseFrame(connection, frame);
                        break;
                    case QuicFrameType.ACK:
                        // Handle acknowledgments
                        console.log('[QuicVCConnectionManager] Received ACK frame');
                        break;
                    default:
                        console.warn('[QuicVCConnectionManager] Unknown frame type:', frame.type);
                }
            }

            // Reset idle timeout
            this.resetIdleTimeout(connection);
            return;
        }

        // Fallback: Try to parse without decryption (for testing or unencrypted responses)
        console.log('[QuicVCConnectionManager] No session key or connection not established - trying unencrypted');
        const payload = this.extractPayload(data, header);
        const frames = this.parseFrames(payload, QuicVCPacketType.PROTECTED);

        // Check if it contains VC_RESPONSE (ESP32 ownership response during provisioning)
        const vcResponseFrame = frames.find(frame => frame.type === QuicVCFrameType.VC_RESPONSE);
        if (vcResponseFrame) {
            console.log('[QuicVCConnectionManager] Found VC_RESPONSE in unencrypted PROTECTED packet');
            await this.handleVCResponseFrame(connection, vcResponseFrame);
            return;
        }

        // If we get here and the connection isn't established, something's wrong
        if (connection.state !== 'established') {
            console.warn('[QuicVCConnectionManager] Received PROTECTED packet but connection not established and no VC_RESPONSE found');
            return;
        }

        console.warn('[QuicVCConnectionManager] PROTECTED packet could not be decrypted or parsed');
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

        // Serialize frames properly using QUIC frame format
        // Each frame should be a StreamFrame, HeartbeatFrame, etc.
        const serializedFrames: Uint8Array[] = [];
        for (const frame of frames) {
            if (frame.type === QuicFrameType.STREAM || frame.type === QuicVCFrameType.STREAM) {
                // Create proper StreamFrame
                const streamFrame = new StreamFrame(
                    BigInt(frame.streamId || 0),
                    frame.data instanceof Uint8Array ? frame.data : new Uint8Array(frame.data || []),
                    BigInt(frame.offset || 0),
                    frame.fin || false
                );
                serializedFrames.push(streamFrame.serialize());
            } else if (frame.type === QuicVCFrameType.HEARTBEAT) {
                // Create proper HeartbeatFrame
                const heartbeatFrame = new HeartbeatFrame({
                    timestamp: frame.timestamp || Date.now(),
                    device_id: connection.deviceId,
                    status: frame.status
                });
                serializedFrames.push(heartbeatFrame.serialize());
            } else {
                // Fallback to JSON for unknown frame types (temporary)
                console.warn(`[QuicVCConnectionManager] Unknown frame type ${frame.type}, falling back to JSON`);
                const jsonPayload = JSON.stringify(frame);
                const jsonBytes = new TextEncoder().encode(jsonPayload);
                serializedFrames.push(jsonBytes);
            }
        }

        // Concatenate all serialized frames into single payload
        const totalLength = serializedFrames.reduce((sum, frame) => sum + frame.length, 0);
        const payload = new Uint8Array(totalLength);
        let offset = 0;
        for (const frame of serializedFrames) {
            payload.set(frame, offset);
            offset += frame.length;
        }

        // Create and encrypt packet
        const packet = await this.createEncryptedPacket(
            QuicVCPacketType.PROTECTED,
            connection,
            Buffer.from(payload).toString('utf-8'), // Convert to string for encryption
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
     * Derive ESP32-style session key from owner Person ID
     * Matches ESP32 implementation: SHA256("quicvc-esp32-v1" + issuer + "esp32-session-key")
     */
    private async deriveSessionKey(ownerId: string): Promise<Uint8Array> {
        const salt = "quicvc-esp32-v1";
        const suffix = "esp32-session-key";
        const combined = salt + ownerId + suffix;

        console.log('[QuicVCConnectionManager] Deriving session key from owner ID:', ownerId, '(length:', ownerId.length, ')');

        // Use expo-crypto SHA256
        const hash = await expoCrypto.digestStringAsync(
            expoCrypto.CryptoDigestAlgorithm.SHA256,
            combined,
            { encoding: expoCrypto.CryptoEncoding.HEX }
        );

        // Convert hex string to Uint8Array (32 bytes)
        const keyBytes = new Uint8Array(32);
        for (let i = 0; i < 32; i++) {
            keyBytes[i] = parseInt(hash.substr(i * 2, 2), 16);
        }

        console.log('[QuicVCConnectionManager] Session key derived (first 16 bytes):',
            Array.from(keyBytes.slice(0, 16)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

        return keyBytes;
    }

    /**
     * XOR encryption/decryption (symmetric)
     * Matches ESP32 implementation: output[i] = input[i] ^ session_key[i % 32]
     *
     * IMPORTANT: ESP32 extracts payload first (after header), then encrypts starting at payload[0].
     * This means the key offset must start at 0 relative to the payload, not relative to the packet.
     */
    private encryptPayload(payload: Uint8Array, sessionKey: Uint8Array, startOffset: number): Uint8Array {
        if (!QuicVCConnectionManager.ENABLE_ENCRYPTION) {
            console.log('[QuicVCConnectionManager] Encryption disabled for debugging');
            return payload;
        }

        const encrypted = new Uint8Array(payload);
        // Encrypt starting at startOffset (byte 11 for PROTECTED packets)
        // Key offset starts at 0 relative to the start of encryption, matching ESP32
        let keyOffset = 0;
        for (let i = startOffset; i < payload.length; i++) {
            encrypted[i] = payload[i] ^ sessionKey[keyOffset % sessionKey.length];
            keyOffset++;
        }
        return encrypted;
    }

    /**
     * XOR decryption (same as encryption for XOR cipher)
     */
    private decryptPayload(payload: Uint8Array, sessionKey: Uint8Array, startOffset: number): Uint8Array {
        // XOR is symmetric, so decryption is the same as encryption
        return this.encryptPayload(payload, sessionKey, startOffset);
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
        // Use protocol abstractions for packet construction
        const packetNumber = connection.nextPacketNumber++;

        // Create frame bytes based on frame type
        let framePayload: Uint8Array;
        if (frameType !== undefined) {
            // Use VC-specific frame types with proper structure
            const payloadBytes = new TextEncoder().encode(payload);

            // Create frame with frame_type(1) + frame_length(varint) + frame_data
            const lengthVarint = encodeVarint(BigInt(payloadBytes.length));
            framePayload = new Uint8Array(1 + lengthVarint.length + payloadBytes.length);
            framePayload[0] = frameType;
            framePayload.set(lengthVarint, 1);
            framePayload.set(payloadBytes, 1 + lengthVarint.length);
        } else {
            // Plain payload
            framePayload = new TextEncoder().encode(payload);
        }

        // Build packet using protocol abstractions
        if (type === QuicVCPacketType.PROTECTED) {
            // Short header for PROTECTED packets
            const header: QuicShortHeader = {
                type: 'short',
                dcid: connection.dcid,
                packetNumber,
                packetNumberLength: 2
            };
            return buildShortHeaderPacket(header, framePayload);
        } else {
            // Long header for INITIAL/HANDSHAKE packets
            const header: QuicLongHeader = {
                type: 'long',
                packetType: type as number, // Maps to QuicPacketType enum
                version: this.QUICVC_VERSION,
                dcid: connection.dcid,
                scid: connection.scid,
                packetNumber,
                packetNumberLength: 2,
                token: type === QuicVCPacketType.INITIAL ? new Uint8Array(0) : undefined
            };
            return buildLongHeaderPacket(header, framePayload);
        }
    }
    
    /**
     * Create a PROTECTED packet with binary frame data
     * Applies ESP32-style XOR encryption if session key is available
     */
    private createProtectedPacket(connection: QuicVCConnection, frameData: Uint8Array): Uint8Array {
        // Build PROTECTED packet using protocol abstractions
        const packetNumber = connection.nextPacketNumber++;

        const header: QuicShortHeader = {
            type: 'short',
            dcid: connection.dcid,
            packetNumber,
            packetNumberLength: 2
        };

        // Build packet with short header
        let packet = buildShortHeaderPacket(header, frameData);

        // Packet is already built with header + frameData

        // Apply ESP32-style XOR encryption if we have a session key
        if (connection.sessionKey && QuicVCConnectionManager.ENABLE_ENCRYPTION) {
            // For PROTECTED packets (short header): flags(1) + dcid(length) + pn(2)
            // Encryption starts after these fields
            // ESP32 expects encryption to start at byte 11 (1 + 8 + 2 for 8-byte DCID)
            // But our DCID is 16 bytes, so adjust accordingly
            const encryptionOffset = 1 + connection.dcid.length + 2; // flags + dcid + packet_number

            console.log(`[QuicVCConnectionManager] Applying XOR encryption starting at byte ${encryptionOffset}`);
            console.log(`[QuicVCConnectionManager] DCID length: ${connection.dcid.length}, expected: 8`);
            console.log(`[QuicVCConnectionManager] Session key (first 16 bytes):`,
                Array.from(connection.sessionKey.slice(0, 16)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
            console.log(`[QuicVCConnectionManager] Packet before encryption (first 50 bytes):`,
                Array.from(packet.slice(0, Math.min(50, packet.length))).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

            packet = this.encryptPayload(packet, connection.sessionKey, encryptionOffset);

            console.log(`[QuicVCConnectionManager] Packet after encryption (first 50 bytes):`,
                Array.from(packet.slice(0, Math.min(50, packet.length))).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
        } else if (!connection.sessionKey) {
            console.warn('[QuicVCConnectionManager] No session key available for encryption - sending unencrypted PROTECTED packet');
        }

        console.log(`[QuicVCConnectionManager] Created PROTECTED packet: frame ${frameData.length} bytes, total ${packet.length} bytes`);

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

    // serializeHeader method removed - now using buildLongHeaderPacket/buildShortHeaderPacket from @refinio/quicvc-protocol

    private parsePacketHeader(data: Uint8Array): QuicVCPacketHeader | null {
        if (data.length < 10) return null; // Minimum header size

        // Use protocol library for all packets - ESP32 now sends RFC 9000 compliant varint encoding
        const { header, headerLength, payload } = parseQuicPacketHeader(data);

        // Convert protocol header to our format
        if (header.type === 'short') {
            return {
                type: QuicVCPacketType.PROTECTED,
                version: 0,
                dcid: header.dcid,
                scid: new Uint8Array(0), // Empty SCID for short header
                packetNumber: header.packetNumber,
                headerLength
            };
        } else {
            // Long header
            const packetType = header.packetType === 0 ? QuicVCPacketType.INITIAL :
                             header.packetType === 2 ? QuicVCPacketType.HANDSHAKE :
                             QuicVCPacketType.PROTECTED;

            return {
                type: packetType,
                version: header.version,
                dcid: header.dcid,
                scid: header.scid,
                packetNumber: header.packetNumber,
                headerLength
            };
        }
    }

    /** @deprecated Fallback parser removed - ESP32 now sends RFC 9000 compliant packets */
    private parsePacketHeaderFallback(data: Uint8Array): QuicVCPacketHeader | null {
        if (data.length < 10) return null;

        const view = new DataView(data.buffer, data.byteOffset);
        let offset = 0;

        const flags = view.getUint8(offset++);
        const longHeader = (flags & 0x80) !== 0;

        if (!longHeader) {
            // Short header - ESP32 uses 8-byte DCID
            const dcidLen = 8;
            if (data.length < 1 + dcidLen + 1) return null;

            const dcid = new Uint8Array(data.buffer, data.byteOffset + offset, dcidLen);
            offset += dcidLen;

            const pnLength = (flags & 0x03) + 1;
            let packetNumber = BigInt(0);

            if (offset + pnLength > data.length) return null;

            if (pnLength === 1) {
                packetNumber = BigInt(view.getUint8(offset));
            } else if (pnLength === 2) {
                packetNumber = BigInt(view.getUint16(offset, false));
            } else if (pnLength === 4) {
                packetNumber = BigInt(view.getUint32(offset, false));
            }

            offset += pnLength;

            return {
                type: QuicVCPacketType.PROTECTED,
                version: 0,
                dcid,
                scid: new Uint8Array(0),
                packetNumber,
                headerLength: offset
            };
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
            // Structure: [flags][version][dcid_len][dcid][scid_len][scid][token_len][token?][length][packet_num][payload]

            // Token length (1 byte for ESP32, value is 0)
            if (data.length > offset) {
                const tokenLen = view.getUint8(offset++);
                offset += tokenLen; // Skip token bytes if any (usually 0 for ESP32)
            }

            // Length field (2 bytes, big-endian) - length of (packet_number + payload)
            // ESP32 ALWAYS sends this field
            if (data.length < offset + 2) {
                console.error('[QuicVCConnectionManager] INITIAL packet too short for length field');
                return null;
            }

            const payloadLength = view.getUint16(offset, false); // Big-endian
            offset += 2; // Skip length field

            console.log(`[QuicVCConnectionManager] INITIAL packet length field: ${payloadLength} bytes (packet number + frames)`);

            // Packet number (1 byte for ESP32)
            if (data.length <= offset) {
                console.error('[QuicVCConnectionManager] INITIAL packet too short for packet number');
                return null;
            }

            packetNumber = BigInt(view.getUint8(offset));
            offset += 1; // Skip packet number
            headerLength = offset; // Payload starts here

            console.log(`[QuicVCConnectionManager] INITIAL packet parsed: packetNumber=${packetNumber}, headerLength=${headerLength}`);

            return { type, version, dcid, scid, packetNumber, headerLength };
        } else if (type === QuicVCPacketType.HANDSHAKE) {
            // For HANDSHAKE packets from ESP32 (which contain VC_RESPONSE)
            // RFC 9000 Section 17.2.4: HANDSHAKE packets have Length and Packet Number fields
            // Structure: [flags][version][dcid_len][dcid][scid_len][scid][length][packet_num][payload]
            // (No Token field, unlike INITIAL packets)

            // Length field (2 bytes, big-endian) - length of (packet_number + payload)
            if (data.length < offset + 2) {
                console.error('[QuicVCConnectionManager] HANDSHAKE packet too short for length field');
                return null;
            }

            const payloadLength = view.getUint16(offset, false); // Big-endian
            offset += 2; // Skip length field

            console.log(`[QuicVCConnectionManager] HANDSHAKE packet length field: ${payloadLength} bytes (packet number + frames)`);

            // Packet number (1 byte for ESP32)
            if (data.length <= offset) {
                console.error('[QuicVCConnectionManager] HANDSHAKE packet too short for packet number');
                return null;
            }

            packetNumber = BigInt(view.getUint8(offset));
            offset += 1; // Skip packet number
            headerLength = offset; // Payload starts here

            console.log(`[QuicVCConnectionManager] HANDSHAKE packet parsed: packetNumber=${packetNumber}, headerLength=${headerLength}`);

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
        // Payload extraction (header removed)
        return data.slice(headerSize);
    }
    
    private async decryptPacket(data: Uint8Array, header: QuicVCPacketHeader, keys: CryptoKeys): Promise<Uint8Array | null> {
        // TODO: Implement proper AEAD decryption
        return this.extractPayload(data, header);
    }
    
    private parseFrames(data: Uint8Array, packetType?: QuicVCPacketType): any[] {
        console.log('[QuicVCConnectionManager] Parsing frames from', data.length, 'bytes, packet type:', packetType !== undefined ? QuicVCPacketType[packetType] : 'unknown');
        console.log('[QuicVCConnectionManager] Raw frame data (first 50 bytes):',
            Array.from(data.slice(0, Math.min(50, data.length))).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

        // Frame parsing
        const frames: any[] = [];
        let offset = 0;

        try {
            while (offset < data.length) {
                if (offset + 2 > data.length) {
                    console.log('[QuicVCConnectionManager] Not enough data for frame header at offset', offset, '- stopping');
                    break; // Need at least frame_type + 1 byte for varint length
                }

                const frameType = data[offset];
                offset += 1;

                // RFC 9000 STREAM frames (types 0x08-0x0F) have a different format:
                // [type_with_flags][stream_id_varint][offset_varint?][length_varint?][data]
                // We need to parse them differently from other frames
                const isStreamFrame = (frameType >= 0x08 && frameType <= 0x0F);

                if (isStreamFrame) {
                    console.log('[QuicVCConnectionManager] Detected RFC 9000 STREAM frame type: 0x' + frameType.toString(16).padStart(2, '0'));
                    console.log('[QuicVCConnectionManager] Data at offset', offset, '(first 10 bytes):', Array.from(data.slice(offset, offset + 10)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

                    // Extract flags from frame type
                    const hasFin = (frameType & 0x01) !== 0;
                    const hasLen = (frameType & 0x02) !== 0;
                    const hasOff = (frameType & 0x04) !== 0;

                    // Parse stream ID (varint)
                    const streamIdResult = decodeVarint(data, offset);
                    if (streamIdResult.bytesRead === 0) {
                        console.warn('[QuicVCConnectionManager] Failed to decode stream ID varint');
                        break;
                    }
                    const streamId = Number(streamIdResult.value);
                    console.log('[QuicVCConnectionManager] Parsed stream_id:', streamId, '(bytes read:', streamIdResult.bytesRead + ')');
                    offset += streamIdResult.bytesRead;

                    // Parse offset if present (varint)
                    let streamOffset = 0;
                    if (hasOff) {
                        const offsetResult = decodeVarint(data, offset);
                        if (offsetResult.bytesRead === 0) {
                            console.warn('[QuicVCConnectionManager] Failed to decode stream offset varint');
                            break;
                        }
                        streamOffset = Number(offsetResult.value);
                        offset += offsetResult.bytesRead;
                    }

                    // Parse length if present (varint), otherwise read to end of packet
                    let dataLength;
                    if (hasLen) {
                        const lengthResult = decodeVarint(data, offset);
                        if (lengthResult.bytesRead === 0) {
                            console.warn('[QuicVCConnectionManager] Failed to decode stream length varint');
                            break;
                        }
                        dataLength = Number(lengthResult.value);
                        console.log('[QuicVCConnectionManager] Parsed length:', dataLength, '(bytes read:', lengthResult.bytesRead + ')');
                        offset += lengthResult.bytesRead;
                    } else {
                        // Length extends to end of packet
                        dataLength = data.length - offset;
                    }

                    console.log('[QuicVCConnectionManager] STREAM frame: stream_id=' + streamId + ', offset=' + streamOffset + ', length=' + dataLength + ', FIN=' + hasFin);
                    console.log('[QuicVCConnectionManager] Stream data starts at offset', offset, '(first 10 bytes):', Array.from(data.slice(offset, offset + 10)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));

                    if (offset + dataLength > data.length) {
                        console.warn('[QuicVCConnectionManager] STREAM data extends beyond packet');
                        break;
                    }

                    const streamData = data.slice(offset, offset + dataLength);
                    offset += dataLength;

                    // Parse the stream data as JSON or microdata
                    let frame: any = { type: QuicFrameType.STREAM, streamId, offset: streamOffset, data: null };
                    const dataStr = new TextDecoder().decode(streamData);

                    // Try JSON first
                    try {
                        const parsedData = JSON.parse(dataStr);
                        frame.data = parsedData;
                        console.log('[QuicVCConnectionManager] Parsed STREAM frame data as JSON:', parsedData);
                    } catch (jsonError) {
                        // If not JSON, try microdata (ESP32 responses)
                        if (dataStr.includes('<div') && dataStr.includes('itemscope')) {
                            console.log('[QuicVCConnectionManager] Trying to parse as microdata...');
                            try {
                                const parsedData = parseFromMicrodata(dataStr);
                                frame.data = parsedData;
                                console.log('[QuicVCConnectionManager] Parsed STREAM frame data as microdata:', parsedData);
                            } catch (microdataError) {
                                console.error('[QuicVCConnectionManager] Failed to parse as microdata:', microdataError.message);
                                console.error('[QuicVCConnectionManager] Stream data (first 20 bytes):', Array.from(streamData.slice(0, 20)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
                                console.error('[QuicVCConnectionManager] Stream data as string:', dataStr.substring(0, 200));
                                throw new Error(`Failed to parse STREAM frame data: ${microdataError.message}`);
                            }
                        } else {
                            console.error('[QuicVCConnectionManager] CRITICAL: STREAM frame data is not valid JSON or microdata');
                            console.error('[QuicVCConnectionManager] Stream data (first 20 bytes):', Array.from(streamData.slice(0, 20)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
                            console.error('[QuicVCConnectionManager] Stream data as string:', dataStr.substring(0, 100));
                            throw new Error(`Failed to parse STREAM frame data as JSON: ${jsonError.message}`);
                        }
                    }

                    frames.push(frame);
                    continue;
                }

                // Non-STREAM frames use the old format: [type][varint_length][payload]
                // Decode varint length (RFC 9000 compliant)
                const lengthResult = decodeVarint(data, offset);
                if (lengthResult.bytesRead === 0) {
                    console.warn('[QuicVCConnectionManager] Failed to decode varint length at offset', offset);
                    break;
                }
                const length = Number(lengthResult.value);
                const lengthBytes = lengthResult.bytesRead;

                console.log('[QuicVCConnectionManager] Frame at offset', offset - 1, '- Type: 0x' + frameType.toString(16).padStart(2, '0'), 'Length:', length, '(varint bytes:', lengthBytes + ') Data length:', data.length);

                offset += lengthBytes;

                if (offset + length > data.length) {
                    console.warn('[QuicVCConnectionManager] Frame length', length, 'extends beyond payload (available:', data.length - offset, 'bytes) - ignoring rest of packet');
                    console.warn('[QuicVCConnectionManager] This suggests corrupted data or wrong encoding');
                    break; // Stop parsing but return what we have so far
                }

                const framePayload = data.slice(offset, offset + length);
                offset += length;

                // For now, try to parse frame payload as JSON if it looks like VC data
                let frame: any = { type: frameType, payload: framePayload };

                // Parse specific frame types
                if (frameType === QuicVCFrameType.VC_INIT || frameType === QuicVCFrameType.VC_RESPONSE) {
                    try {
                        const payloadString = new TextDecoder().decode(framePayload);

                        // Try HTML parsing first (new format)
                        if (payloadString.startsWith('<!DOCTYPE html>') || payloadString.startsWith('<html')) {
                            // Parse HTML microdata
                            const htmlData: any = {};

                            // Extract all itemprop values using regex
                            const metaRegex = /<meta\s+itemprop="([^"]+)"\s+content="([^"]+)"/g;
                            let match;
                            while ((match = metaRegex.exec(payloadString)) !== null) {
                                const [, prop, value] = match;
                                // Convert type to number if it looks like a number
                                htmlData[prop] = /^\d+$/.test(value) ? parseInt(value, 10) : value;
                            }

                            frame = { ...frame, ...htmlData, type: frameType };
                            console.log('[QuicVCConnectionManager] Parsed HTML VC_RESPONSE:', htmlData);
                        } else {
                            // Fallback to JSON parsing (old format)
                            const jsonData = JSON.parse(payloadString);
                            frame = { ...frame, ...jsonData, type: frameType };
                        }
                    } catch (e) {
                        console.warn('[QuicVCConnectionManager] Frame payload is not JSON or HTML:', e.message);
                    }
                } else if (frameType === QuicVCFrameType.DISCOVERY) {
                    // DISCOVERY frames contain HTML or JSON payload that should NOT be parsed as more frames
                    // In INITIAL packets: Stop parsing (discovery broadcasts only contain discovery data)
                    // In HANDSHAKE packets: Continue parsing (may contain VC_RESPONSE after discovery)
                    frames.push(frame);

                    if (packetType === QuicVCPacketType.INITIAL) {
                        console.log('[QuicVCConnectionManager] DISCOVERY frame in INITIAL packet - stopping frame parsing (payload contains HTML/JSON, not frames)');
                        break;  // Stop parsing - discovery payload is not frames
                    } else {
                        console.log('[QuicVCConnectionManager] DISCOVERY frame in', packetType !== undefined ? QuicVCPacketType[packetType] : 'unknown', 'packet - continuing to parse remaining frames');
                        // Continue parsing - there may be more frames (like VC_RESPONSE) after this
                    }
                } else if (frameType === QuicVCFrameType.STREAM) {
                    // STREAM frames contain JSON with streamId and data fields
                    // Format: {"streamId": 3, "data": {...}}
                    try {
                        const jsonStr = new TextDecoder().decode(framePayload);
                        const streamFrame = JSON.parse(jsonStr);

                        if (streamFrame.streamId !== undefined && streamFrame.data !== undefined) {
                            // Parse the nested data field if it's a JSON string
                            let parsedData = streamFrame.data;
                            if (typeof streamFrame.data === 'string') {
                                try {
                                    parsedData = JSON.parse(streamFrame.data);
                                } catch (e) {
                                    // If parsing fails, keep as string
                                }
                            }

                            frame = {
                                type: frameType,
                                streamId: streamFrame.streamId,
                                data: parsedData
                            };
                            console.log('[QuicVCConnectionManager] Parsed STREAM frame:', {
                                streamId: streamFrame.streamId,
                                data: parsedData
                            });
                        } else {
                            // Fallback to old format: stream ID as first byte
                            const streamId = framePayload[0];
                            const streamData = framePayload.slice(1);
                            const jsonData = JSON.parse(new TextDecoder().decode(streamData));
                            frame = { type: frameType, streamId, data: jsonData };
                            console.log('[QuicVCConnectionManager] Parsed STREAM frame (legacy format):', { streamId, data: jsonData });
                        }
                    } catch (e) {
                        console.warn('[QuicVCConnectionManager] Failed to parse STREAM frame:', e.message);
                        // Keep as binary if parsing fails completely
                        frame = { type: frameType, streamId: 0, data: framePayload };
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

        // Check if this is an ownership removal acknowledgment (streamId 2 = credential service)
        if (streamId === 2 && frame.data) {
            // The ESP32 sends HTML microdata for ownership removal acks
            // Parse microdata if it's a string, otherwise use as-is if it's an object
            let responseData = frame.data;

            if (typeof frame.data === 'string' || frame.data instanceof Uint8Array) {
                // Try to parse as microdata
                try {
                    const htmlStr = typeof frame.data === 'string' ? frame.data : new TextDecoder().decode(frame.data);
                    console.log('[QuicVCConnectionManager] Parsing microdata response:', htmlStr.substring(0, 200));

                    // Extract status from microdata (simple regex extraction)
                    // Format: <span itemprop="status">ownership_removed</span>
                    const statusMatch = htmlStr.match(/<span itemprop="status">([^<]+)<\/span>/);
                    const status = statusMatch ? statusMatch[1] : null;

                    if (status === 'ownership_removed') {
                        responseData = { type: 'ownership_remove_ack', status };
                        console.log('[QuicVCConnectionManager] Parsed ownership_removed status from microdata');
                    }
                } catch (e) {
                    console.warn('[QuicVCConnectionManager] Failed to parse microdata:', e);
                }
            }

            // Check if this is an ownership removal ack (either JSON or parsed from microdata)
            if (responseData && typeof responseData === 'object' && responseData.type === 'ownership_remove_ack') {
                console.log('[QuicVCConnectionManager] Received ownership_remove_ack:', {
                    data: responseData,
                    deviceId: connection.deviceId
                });

                // Emit ownership removal ack event for ESP32ConnectionManager to handle
                if (connection.deviceId) {
                    console.log('[QuicVCConnectionManager] Emitting onOwnershipRemovalAck for device:', connection.deviceId);
                    this.onOwnershipRemovalAck.emit(connection.deviceId, responseData);
                } else {
                    console.error('[QuicVCConnectionManager] Cannot emit ownership removal ack - no deviceId on connection');
                }
                return;
            }
        }

        // Check if this is an LED response (streamId 3 = LED control service)
        if (streamId === 3 && frame.data && typeof frame.data === 'object') {
            // ESP32 sends microdata responses with $type$ field
            if (frame.data.$type$ === 'LEDStatusResponse' && frame.data.requestId) {
                console.log('[QuicVCConnectionManager] Received LED status:', {
                    data: frame.data,
                    deviceId: connection.deviceId,
                    hasDeviceId: !!connection.deviceId
                });

                // If no deviceId on connection, try to get it from the response
                if (!connection.deviceId && frame.data.deviceId) {
                    connection.deviceId = frame.data.deviceId;
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
            type: QuicFrameType.STREAM,
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
        if (!connection) {
            // Connection already closed or replaced
            return;
        }

        if (connection.state !== 'established') {
            // Before closing, check if there's a NEWER connection for this device
            // that's already established. If so, just clean up this timeout without emitting events.
            // Check by both deviceId AND address/port (deviceId might not be set yet in initial state)
            for (const [otherConnId, otherConn] of this.connections) {
                if (otherConnId !== connId &&
                    otherConn.state === 'established' &&
                    otherConn.createdAt > connection.createdAt) {

                    // Match by deviceId if both have it
                    const deviceIdMatch = connection.deviceId && otherConn.deviceId === connection.deviceId;

                    // Match by address/port as fallback (for connections in initial state without deviceId)
                    const addressMatch = connection.address === otherConn.address && connection.port === otherConn.port;

                    if (deviceIdMatch || addressMatch) {
                        // There's a newer, established connection - silently clean up this old one
                        console.log(`[QuicVCConnectionManager] Ignoring timeout for old connection ${connId} - found newer established connection at ${otherConn.address}:${otherConn.port}`);
                        // Clear timers
                        if (connection.handshakeTimeout) clearTimeout(connection.handshakeTimeout);
                        if (connection.heartbeatInterval) clearInterval(connection.heartbeatInterval);
                        if (connection.idleTimeout) clearTimeout(connection.idleTimeout);
                        // Remove from map silently
                        this.connections.delete(connId);
                        return;
                    }
                }
            }

            // No newer connection found - safe to close with event
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
            type: QuicFrameType.STREAM,
            streamId: 0, // Single stream for now
            offset: 0,
            data: Array.from(data)
        };
        
        await this.sendProtectedPacket(connection, [streamFrame]);
    }
    
    disconnect(deviceId: string, address?: string, port?: number): void {
        console.log(`[QuicVCConnectionManager] Disconnect called for device ${deviceId} at ${address}:${port}`);

        const connectionsToClose: QuicVCConnection[] = [];

        // If address/port provided, close ALL connections at that address/port
        // This is the reliable way - we know exactly which physical device to disconnect from
        if (address && port) {
            console.log(`[QuicVCConnectionManager] Closing connections by address/port: ${address}:${port}`);
            for (const conn of this.connections.values()) {
                if (conn.address === address && conn.port === port) {
                    console.log(`[QuicVCConnectionManager] Found connection at ${address}:${port} (deviceId: ${conn.deviceId}, state: ${conn.state})`);
                    connectionsToClose.push(conn);
                }
            }
        } else {
            // Fallback: try to find by deviceId only
            console.warn(`[QuicVCConnectionManager] No address/port provided, searching by deviceId only (unreliable)`);
            for (const conn of this.connections.values()) {
                if (conn.deviceId === deviceId) {
                    console.log(`[QuicVCConnectionManager] Found connection by deviceId: ${deviceId} at ${conn.address}:${conn.port}`);
                    connectionsToClose.push(conn);
                }
            }
        }

        // Close all found connections
        if (connectionsToClose.length > 0) {
            console.log(`[QuicVCConnectionManager] Closing ${connectionsToClose.length} connection(s)`);
            for (const connection of connectionsToClose) {
                this.closeConnection(connection, 'User requested disconnect');
            }
            console.log(`[QuicVCConnectionManager] ✅ Disconnected ${connectionsToClose.length} connection(s) for ${deviceId}`);
        } else {
            console.error(`[QuicVCConnectionManager] ❌ No connections found to disconnect for ${deviceId} at ${address}:${port}`);
        }
    }
}