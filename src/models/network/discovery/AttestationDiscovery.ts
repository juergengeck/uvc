/**
 * HTML-Based Discovery Protocol
 * 
 * Uses HTML-formatted discovery messages for device announcements.
 * Service type 1 is for discovery, type 6 reserved for true attestations.
 */

import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import Debug from 'debug';
import { storeUnversionedObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import { getObjectByHash } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';
import type { License } from '@refinio/one.models/lib/recipes/Certificates/License.js';

import type { IQuicTransport, Device, DiscoveryDevice } from '../interfaces';
import { NetworkServiceType } from '../interfaces';
import type { UdpRemoteInfo } from '../UdpModel';

import { Attestation, createAttestation, isAttestation } from '@src/recipes/Attestations/Attestation';
import { 
    DiscoveryLicense, 
    OwnedDeviceDiscoveryLicense,
    grantsPublicDiscovery,
    isRestrictedLicense,
    getLicenseValidityPeriod
} from '@src/recipes/Attestations/AttestationLicenses';
import { 
    createCompactDiscoveryHtml, 
    parseCompactDiscoveryHtml,
    createAttestationHtml 
} from './CompactAttestationFormat';

const debug = Debug('one:attestation:discovery');

/**
 * Configuration for attestation-based discovery
 */
export interface AttestationDiscoveryConfig {
    // Device information
    deviceId: string;
    deviceType: 'ESP32' | 'MobileApp' | 'Service';
    capabilities: string[];
    
    // Network configuration  
    port: number;
    broadcastInterval: number;
    
    // License configuration
    isOwned?: boolean;
    ownerId?: string;
}

/**
 * Device with attestation information
 */
export interface AttestationDevice extends Device {
    // Last attestation from this device
    lastAttestation?: Attestation;
    
    // License governing interaction
    license?: License;
    
    // Trust level based on attestations
    trustLevel?: number;
    
    // Online status
    online?: boolean;
    
    // Runtime properties
    lastSeen?: number;
}

/**
 * Attestation-based discovery implementation
 */
export class AttestationDiscovery {
    // Transport layer
    private transport: IQuicTransport;
    
    // Discovery state
    private discovering: boolean = false;
    private broadcastTimer: NodeJS.Timeout | null = null;
    private cleanupTimer: NodeJS.Timeout | null = null;
    
    // Device registry
    private devices: Map<string, AttestationDevice> = new Map();
    
    // License cache
    private licenseCache: Map<string, License> = new Map();
    
    // Current discovery attestation
    private currentAttestation: Attestation | null = null;
    
    // Configuration
    private readonly DEVICE_TIMEOUT = 30000; // 30 seconds
    private readonly CLEANUP_INTERVAL = 10000; // 10 seconds
    
    // Events
    public readonly onDeviceDiscovered = new OEvent<(device: AttestationDevice) => void>();
    public readonly onDeviceUpdated = new OEvent<(device: AttestationDevice) => void>();
    public readonly onDeviceLost = new OEvent<(deviceId: string) => void>();
    public readonly onAttestationReceived = new OEvent<(attestation: Attestation, device: AttestationDevice) => void>();
    public readonly onDeviceActivity = new OEvent<(deviceId: string, activityType: string) => void>();
    public readonly onError = new OEvent<(error: Error) => void>();
    
    constructor(
        private config: AttestationDiscoveryConfig,
        transport: IQuicTransport
    ) {
        this.transport = transport;
        debug('Created AttestationDiscovery with config:', config);
    }
    
    /**
     * Initialize discovery
     */
    async init(): Promise<boolean> {
        try {
            console.log('[AttestationDiscovery] Starting initialization...');
            
            // Register discovery handler on type 1
            console.log('[AttestationDiscovery] Registering discovery handler for service type:', NetworkServiceType.DISCOVERY_SERVICE);
            this.transport.addService(
                NetworkServiceType.DISCOVERY_SERVICE,
                this.handleAttestation.bind(this)
            );
            
            // Skip creating full attestation during init - will use compact format for discovery
            // Full attestations require ONE storage which may not be ready yet
            console.log('[AttestationDiscovery] Skipping attestation creation during init (will use compact format)');
            
            debug('AttestationDiscovery initialized');
            console.log('[AttestationDiscovery] Initialization successful');
            return true;
        } catch (error) {
            debug('Error initializing discovery:', error);
            console.error('[AttestationDiscovery] Initialization failed:', error);
            return false;
        }
    }
    
    /**
     * Start discovery broadcasts
     */
    async startDiscovery(): Promise<void> {
        console.log('[AttestationDiscovery] startDiscovery called, currently discovering:', this.discovering);
        
        if (this.discovering) {
            console.log('[AttestationDiscovery] Already discovering, returning early');
            return;
        }
        
        this.discovering = true;
        console.log('[AttestationDiscovery] Starting discovery with config:', {
            deviceId: this.config.deviceId,
            deviceType: this.config.deviceType,
            port: this.config.port,
            broadcastInterval: this.config.broadcastInterval
        });
        
        // Start cleanup timer for stale devices
        this.startCleanupTimer();
        
        // Broadcast immediately
        try {
            console.log('[AttestationDiscovery] Sending initial broadcast...');
            await this.broadcastDiscovery();
        } catch (error) {
            console.error('[AttestationDiscovery] Initial broadcast failed:', error);
            // Continue with discovery setup even if first broadcast fails
        }
        
        // Set up periodic broadcasts
        this.broadcastTimer = setInterval(async () => {
            try {
                console.log('[AttestationDiscovery] Sending periodic broadcast...');
                await this.broadcastDiscovery();
            } catch (error) {
                console.error('[AttestationDiscovery] Periodic broadcast failed:', error);
                // Continue with next broadcast
            }
        }, this.config.broadcastInterval);
        
        debug('Discovery started');
        console.log('[AttestationDiscovery] Discovery started successfully');
    }
    
    /**
     * Stop discovery broadcasts
     */
    async stopDiscovery(): Promise<void> {
        if (!this.discovering) return;
        
        this.discovering = false;
        
        if (this.broadcastTimer) {
            clearInterval(this.broadcastTimer);
            this.broadcastTimer = null;
        }
        
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        
        debug('Discovery stopped');
    }
    
    /**
     * Update ownership status (affects license)
     */
    async updateOwnership(isOwned: boolean, ownerId?: string): Promise<void> {
        this.config.isOwned = isOwned;
        this.config.ownerId = ownerId;
        
        // Update attestation with new license
        await this.updateDiscoveryAttestation();
        
        // If owned, stop public broadcasts
        if (isOwned) {
            debug('Device owned - entering silent mode');
            await this.stopDiscovery();
        } else {
            debug('Device not owned - public discovery enabled');
        }
    }
    
    /**
     * Create or update discovery attestation
     */
    private async updateDiscoveryAttestation(): Promise<void> {
        try {
            console.log('[AttestationDiscovery] Choosing license based on ownership:', this.config.isOwned);
            
            // Choose license based on ownership
            const license = this.config.isOwned 
                ? await this.getOrCreateLicense(OwnedDeviceDiscoveryLicense)
                : await this.getOrCreateLicense(DiscoveryLicense);
            
            console.log('[AttestationDiscovery] License obtained:', license);
            
            // Create claim
            const claim = new Map<string, any>([
                ['device', {
                    id: this.config.deviceId,
                    type: this.config.deviceType,
                    capabilities: this.config.capabilities
                }],
                ['network', {
                    address: await this.getLocalAddress(),
                    port: this.config.port,
                    protocol: 'udp'
                }],
                ['status', 'online']
            ]);
            
            // Add owner if owned
            if (this.config.isOwned && this.config.ownerId) {
                claim.set('owner', this.config.ownerId);
            }
            
            console.log('[AttestationDiscovery] Creating attestation with claim:', Array.from(claim.entries()));
            
            // Create attestation
            this.currentAttestation = await createAttestation(
                'DevicePresence',
                claim,
                license.$hash$,
                {
                    validUntil: Date.now() + 60000 // Valid for 60 seconds
                }
            );
            
            console.log('[AttestationDiscovery] Attestation created:', this.currentAttestation);
            
            // Store it
            await storeUnversionedObject(this.currentAttestation);
            
            console.log('[AttestationDiscovery] Attestation stored successfully');
        } catch (error) {
            console.error('[AttestationDiscovery] Error in updateDiscoveryAttestation:', error);
            throw error;
        }
    }
    
    /**
     * Broadcast discovery attestation
     */
    private async broadcastDiscovery(): Promise<void> {
        // For UDP discovery, use compact format
        const html = createCompactDiscoveryHtml(
            this.config.deviceId,
            this.config.deviceType,
            this.config.isOwned,
            this.config.ownerId
        );
        
        try {
            // Create packet with service type byte prefix
            const htmlBytes = new TextEncoder().encode(html);
            const packet = new Uint8Array(1 + htmlBytes.length);
            
            // Service type 1 = DISCOVERY_SERVICE (HTML format)
            packet[0] = NetworkServiceType.DISCOVERY_SERVICE;
            packet.set(htmlBytes, 1);
            
            // Broadcast packet
            if (!this.transport || typeof this.transport.send !== 'function') {
                throw new Error('Transport is not initialized or does not have send method');
            }
            
            // Check if transport is initialized
            if (typeof this.transport.isInitialized === 'function' && !this.transport.isInitialized()) {
                throw new Error('Transport is not initialized - cannot send discovery broadcast');
            }
            
            // Check if we're still discovering (in case stopDiscovery was called)
            if (!this.discovering) {
                console.log('[AttestationDiscovery] Discovery stopped, skipping broadcast');
                return;
            }
            
            await this.transport.send(
                packet,
                '255.255.255.255',
                this.config.port
            );
            
            debug('Broadcast discovery message (%d bytes)', packet.length);
            console.log('[AttestationDiscovery] Broadcast HTML discovery message:', {
                serviceType: NetworkServiceType.DISCOVERY_SERVICE,
                size: packet.length,
                preview: html.substring(0, 100)
            });
        } catch (error: any) {
            debug('Error broadcasting discovery:', error);
            console.error('[AttestationDiscovery] Error broadcasting:', error);
            console.error('[AttestationDiscovery] Error details:', {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                transportAvailable: !!this.transport,
                transportHasSend: this.transport && typeof this.transport.send === 'function',
                transportInitialized: this.transport && typeof this.transport.isInitialized === 'function' ? this.transport.isInitialized() : 'unknown'
            });
            
            // Check if it's a socket error that requires stopping discovery
            if (error?.message?.includes('Socket') && error?.message?.includes('not found')) {
                console.error('[AttestationDiscovery] Socket error detected - stopping discovery');
                await this.stopDiscovery();
            }
            
            this.onError.emit(error instanceof Error ? error : new Error(String(error)));
            // Don't crash the app on broadcast errors
        }
    }
    
    /**
     * Handle incoming attestation
     */
    private async handleAttestation(data: Uint8Array, rinfo: UdpRemoteInfo): Promise<void> {
        console.log('[AttestationDiscovery] handleAttestation called from', rinfo.address, ':', rinfo.port);
        console.log('[AttestationDiscovery] Data size:', data.length, 'bytes');
        console.log('[AttestationDiscovery] First byte (service type):', data[0]);
        
        // Log if this is from a potential ESP32 device
        if (rinfo.address !== '192.168.178.102' && rinfo.address.startsWith('192.168.')) {
            console.log('[AttestationDiscovery] *** POTENTIAL ESP32 MESSAGE from', rinfo.address);
        }
        
        try {
            // Skip the service type byte (already handled by transport layer)
            const htmlData = data.slice(1);
            const html = new TextDecoder().decode(htmlData);
            console.log('[AttestationDiscovery] HTML preview:', html.substring(0, 200));
            
            // Try compact format first (for UDP discovery)
            if (html.includes('DevicePresence')) {
                console.log('[AttestationDiscovery] DevicePresence found, parsing compact format...');
                const discovery = parseCompactDiscoveryHtml(html);
                if (discovery) {
                    console.log('[AttestationDiscovery] Parsed discovery:', {
                        deviceId: discovery.deviceId,
                        deviceType: discovery.deviceType,
                        isOwned: discovery.isOwned,
                        ownerId: discovery.ownerId
                    });
                    await this.handleCompactDiscovery(discovery, rinfo);
                    return;
                } else {
                    console.log('[AttestationDiscovery] Failed to parse compact discovery HTML');
                }
            }
            
            // Parse full attestation
            const attestation = await this.parseAttestation(data);
            if (!attestation) return;
            
            // Verify it's an attestation
            if (!isAttestation(attestation)) {
                debug('Received non-attestation object');
                return;
            }
            
            // Don't process our own attestations
            const deviceId = attestation.claim.get('device')?.id;
            if (deviceId === this.config.deviceId) return;
            
            // Track device activity to reset heartbeat timers
            if (deviceId && this.onDeviceActivity) {
              this.onDeviceActivity.emit(deviceId, 'attestation');
            }
            
            // Verify attestation (signature, expiry, etc.)
            if (!await this.verifyAttestation(attestation)) {
                debug('Attestation verification failed');
                return;
            }
            
            // Get license to understand our rights
            const license = await this.getLicense(attestation.license);
            if (!license) {
                debug('Could not retrieve license');
                return;
            }
            
            // Check if we have rights to process this attestation
            if (!await this.checkLicenseRights(attestation, license)) {
                debug('License does not grant us rights');
                return;
            }
            
            // Process based on attestation type
            if (attestation.attestationType === 'DevicePresence') {
                await this.handleDevicePresence(attestation, license, rinfo);
            }
            
            // Emit attestation received event
            const device = this.devices.get(deviceId);
            if (device) {
                this.onAttestationReceived.emit(attestation, device);
            }
            
        } catch (error) {
            debug('Error handling attestation:', error);
        }
    }
    
    /**
     * Handle device presence attestation
     */
    private async handleDevicePresence(
        attestation: Attestation, 
        license: License,
        rinfo: UdpRemoteInfo
    ): Promise<void> {
        const claim = attestation.claim;
        const deviceInfo = claim.get('device');
        const networkInfo = claim.get('network');
        
        if (!deviceInfo || !networkInfo) {
            debug('Invalid device presence attestation');
            return;
        }
        
        const deviceId = deviceInfo.id;
        
        // Create or update device record
        const device: AttestationDevice = {
            $type$: 'Device',
            deviceId: deviceId,
            name: deviceInfo.name || deviceId,
            deviceType: deviceInfo.type,
            address: rinfo.address,
            port: rinfo.port,
            lastSeen: Date.now(),
            online: true,  // Device is online since we just received a message from it
            capabilities: deviceInfo.capabilities || [],
            owner: undefined as any, // Will be set properly if device has an owner
            ownerId: undefined, // Will be set below if available
            lastAttestation: attestation,
            license: license,
            trustLevel: this.calculateTrustLevel(attestation, license),
            hasValidCredential: false,
            firstSeen: Date.now()
        };
        
        // Check if owned device (for UI display)
        const owner = claim.get('owner');
        if (owner) {
            device.ownerId = owner;
        }
        
        // Update device registry
        const existing = this.devices.get(deviceId);
        
        // Check if anything actually changed
        const hasChanged = !existing || 
            existing.address !== device.address ||
            existing.port !== device.port ||
            existing.trustLevel !== device.trustLevel ||
            existing.type !== device.type ||
            JSON.stringify(existing.capabilities) !== JSON.stringify(device.capabilities);
        
        // Always update device
        this.devices.set(deviceId, device);
        
        if (!existing) {
            this.onDeviceDiscovered.emit(device);
        } else if (hasChanged) {
            this.onDeviceUpdated.emit(device);
        }
    }
    
    /**
     * Get or create license
     */
    private async getOrCreateLicense(license: License): Promise<License & { $hash$: SHA256Hash<License> }> {
        // Check cache first
        const cached = Array.from(this.licenseCache.entries())
            .find(([_, l]) => l.name === license.name);
        
        if (cached) {
            return { ...cached[1], $hash$: cached[0] as SHA256Hash<License> };
        }
        
        // Store license
        const stored = await storeUnversionedObject(license);
        this.licenseCache.set(stored.$hash$, license);
        
        return { ...license, $hash$: stored.$hash$ };
    }
    
    /**
     * Get license by hash
     */
    private async getLicense(hash: SHA256Hash<License>): Promise<License | null> {
        // Check cache
        const cached = this.licenseCache.get(hash);
        if (cached) return cached;
        
        // Retrieve from storage
        try {
            const license = await getObjectByHash(hash) as License;
            if (license && license.$type$ === 'License') {
                this.licenseCache.set(hash, license);
                return license;
            }
        } catch (error) {
            debug('Error retrieving license:', error);
        }
        
        return null;
    }
    
    /**
     * Check if we have rights based on license
     */
    private async checkLicenseRights(attestation: Attestation, license: License): Promise<boolean> {
        // If it's a restricted license, check if we're the intended recipient
        if (isRestrictedLicense(license)) {
            const owner = attestation.claim.get('owner');
            return owner === this.config.deviceId;
        }
        
        // Public licenses grant rights to all
        return grantsPublicDiscovery(license);
    }
    
    /**
     * Handle compact discovery message
     */
    private async handleCompactDiscovery(
        discovery: { deviceId: string; deviceType: string; isOwned: boolean; ownerId?: string },
        rinfo: UdpRemoteInfo
    ): Promise<void> {
        console.log('[AttestationDiscovery] handleCompactDiscovery:', {
            discoveredDevice: discovery.deviceId,
            ourDevice: this.config.deviceId,
            deviceType: discovery.deviceType,
            from: `${rinfo.address}:${rinfo.port}`
        });
        
        // Don't process our own messages
        if (discovery.deviceId === this.config.deviceId) {
            console.log('[AttestationDiscovery] Ignoring our own discovery message');
            return;
        }
        
        // Track device activity to reset heartbeat timers
        this.onDeviceActivity.emit(discovery.deviceId, 'compact_discovery');
        
        // Create device record with ownership info from discovery
        const device: AttestationDevice = {
            $type$: 'Device',
            deviceId: discovery.deviceId,
            name: discovery.deviceId,
            deviceType: discovery.deviceType,
            address: rinfo.address,
            port: rinfo.port,
            lastSeen: Date.now(),
            online: true,  // Device is online since we just received a message from it
            capabilities: [],
            owner: discovery.ownerId as any || undefined as any, // Will be set properly if device has an owner
            ownerId: discovery.ownerId, // Keep for compatibility
            trustLevel: 0.3, // Basic trust for discovery
            hasValidCredential: false,
            firstSeen: Date.now()
        };
        
        // Update device registry
        const existing = this.devices.get(discovery.deviceId);
        
        // Check if anything actually changed
        const hasChanged = !existing || 
            existing.address !== device.address ||
            existing.port !== device.port ||
            existing.ownerId !== device.ownerId ||
            existing.type !== device.type;
        
        // Always update lastSeen
        this.devices.set(discovery.deviceId, device);
        
        console.log('[AttestationDiscovery] Device registry updated:', {
            deviceId: discovery.deviceId,
            totalDevices: this.devices.size,
            isNew: !existing,
            hasChanged,
            deviceKeys: Array.from(this.devices.keys()),
            allDevices: Array.from(this.devices.values()).map(d => ({
                id: d.deviceId,
                address: d.address,
                type: d.deviceType,
                ownerId: d.ownerId
            }))
        });
        
        if (!existing) {
            console.log('[AttestationDiscovery] Emitting onDeviceDiscovered for', device.deviceId);
            this.onDeviceDiscovered.emit(device);
        } else if (hasChanged) {
            console.log('[AttestationDiscovery] Device changed, emitting onDeviceUpdated for', device.deviceId);
            this.onDeviceUpdated.emit(device);
        } else {
            // Device unchanged, but still emit update to keep availability tracking current
            console.log('[AttestationDiscovery] Device unchanged, only updating lastSeen for', device.deviceId);
            // Emit a lightweight update event to update availability tracking
            this.onDeviceUpdated.emit(device);
        }
        
        debug('Discovered %s device: %s', 
            discovery.deviceType, 
            discovery.deviceId
        );
    }
    
    /**
     * Calculate trust level based on attestation and license
     */
    private calculateTrustLevel(attestation: Attestation, license: License): number {
        let trust = 0;
        
        // Valid attestation gives base trust
        trust += 0.5;
        
        // Known license type
        if (license.name && license.description) {
            trust += 0.2;
        }
        
        // Has references (part of a chain)
        if (attestation.references && attestation.references.length > 0) {
            trust += 0.3;
        }
        
        return Math.min(trust, 1.0);
    }
    
    /**
     * Verify attestation validity
     */
    private async verifyAttestation(attestation: Attestation): Promise<boolean> {
        // Check expiry
        if (attestation.validUntil && attestation.validUntil < Date.now()) {
            debug('Attestation expired');
            return false;
        }
        
        // ONE objects are inherently signed, so signature is valid
        // Additional verification can be added here
        
        return true;
    }
    
    /**
     * Get local network address
     */
    private async getLocalAddress(): Promise<string> {
        // Try to get the actual local IP address
        try {
            // In React Native, we can try to determine the local IP
            // For now, return a placeholder
            return '0.0.0.0';
        } catch (error) {
            console.log('[AttestationDiscovery] Error getting local address:', error);
            return '0.0.0.0';
        }
    }
    
    /**
     * Serialize attestation for network transmission
     */
    private async serializeAttestation(attestation: Attestation): Promise<Buffer> {
        // ONE objects are microdata - create minimal HTML representation
        const claimHtml = this.serializeClaim(attestation.claim, attestation.attestationType);
        
        // Create minimal HTML with microdata
        const html = `<!DOCTYPE html>
<html itemscope itemtype="https://refinio.one/Attestation">
<meta itemprop="$type$" content="Attestation">
<meta itemprop="attestationType" content="${attestation.attestationType}">
<meta itemprop="license" content="${attestation.license}">
<meta itemprop="timestamp" content="${attestation.timestamp.toISOString()}">
${attestation.validUntil ? `<meta itemprop="validUntil" content="${attestation.validUntil.toISOString()}">` : ''}
<div itemprop="claim">${claimHtml}</div>
${attestation.references ? attestation.references.map(ref => 
    `<link itemprop="references" href="one://${ref}">`
).join('') : ''}
</html>`;
        
        return Buffer.from(html, 'utf8');
    }
    
    /**
     * Serialize claim as microdata
     */
    private serializeClaim(claim: Map<string, any>, type: string): string {
        const entries: string[] = [];
        
        for (const [key, value] of claim) {
            if (typeof value === 'object' && value !== null) {
                // Nested object
                entries.push(`<div itemprop="${key}" itemscope>`);
                for (const [k, v] of Object.entries(value)) {
                    entries.push(`<meta itemprop="${k}" content="${this.escapeHtml(String(v))}">`);
                }
                entries.push('</div>');
            } else {
                // Simple value
                entries.push(`<meta itemprop="${key}" content="${this.escapeHtml(String(value))}">`);
            }
        }
        
        return `<div itemscope itemtype="https://refinio.one/${type}">${entries.join('')}</div>`;
    }
    
    /**
     * Escape HTML entities
     */
    private escapeHtml(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    
    /**
     * Parse attestation from network data
     */
    private async parseAttestation(data: Buffer): Promise<Attestation | null> {
        try {
            const html = data.toString('utf8');
            
            // Basic HTML microdata parser
            // In production, would use a proper microdata parser
            const attestation: any = {
                $type$: 'Attestation',
                claim: new Map()
            };
            
            // Extract meta properties
            const metaRegex = /<meta\s+itemprop="([^"]+)"\s+content="([^"]+)">/g;
            let match;
            while ((match = metaRegex.exec(html)) !== null) {
                const [_, prop, value] = match;
                if (prop === 'timestamp' || prop === 'validUntil') {
                    attestation[prop] = new Date(value);
                } else if (prop !== '$type$') {
                    attestation[prop] = value;
                }
            }
            
            // Extract claim (simplified - would need proper parser)
            const claimMatch = html.match(/<div itemprop="claim">([\s\S]*?)<\/div>/);
            if (claimMatch) {
                // Parse nested claim properties
                const claimHtml = claimMatch[1];
                let claimMetaMatch;
                while ((claimMetaMatch = metaRegex.exec(claimHtml)) !== null) {
                    const [_, prop, value] = claimMetaMatch;
                    attestation.claim.set(prop, value);
                }
            }
            
            // Extract references
            const linkRegex = /<link\s+itemprop="references"\s+href="one:\/\/([^"]+)">/g;
            const references = [];
            while ((match = linkRegex.exec(html)) !== null) {
                references.push(match[1]);
            }
            if (references.length > 0) {
                attestation.references = references;
            }
            
            return attestation as Attestation;
        } catch (error) {
            debug('Error parsing attestation:', error);
            return null;
        }
    }
    
    /**
     * Update device lastSeen to prevent cleanup
     * Used when heartbeat/ping is received
     */
    updateDeviceLastSeen(deviceId: string): void {
        const device = this.devices.get(deviceId);
        if (device) {
            device.lastSeen = Date.now();
            console.log('[AttestationDiscovery] Updated lastSeen for device', deviceId);
        }
    }
    
    /**
     * Get all discovered devices
     */
    getDevices(): DiscoveryDevice[] {
        const devices = Array.from(this.devices.values());
        console.log('[AttestationDiscovery] getDevices called, returning', devices.length, 'devices');
        if (devices.length > 0) {
            console.log('[AttestationDiscovery] Device IDs:', devices.map(d => d.deviceId));
        }
        // Convert AttestationDevice to DiscoveryDevice
        return devices as DiscoveryDevice[];
    }
    
    /**
     * Get specific device
     */
    getDevice(deviceId: string): DiscoveryDevice | undefined {
        return this.devices.get(deviceId) as DiscoveryDevice | undefined;
    }
    
    /**
     * Check if discovery is currently running
     */
    get isDiscovering(): boolean {
        return this.discovering;
    }
    
    /**
     * Update device ID (needed when identity changes)
     */
    updateDeviceId(deviceId: string): void {
        this.config.deviceId = deviceId;
        debug('Updated device ID to:', deviceId);
    }
    
    /**
     * Shutdown discovery
     */
    async shutdown(): Promise<void> {
        await this.stopDiscovery();
        this.devices.clear();
        this.licenseCache.clear();
    }
    
    /**
     * Start cleanup timer for stale devices
     */
    private startCleanupTimer(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }
        
        this.cleanupTimer = setInterval(() => {
            this.cleanupStaleDevices();
        }, this.CLEANUP_INTERVAL);
        
        console.log('[AttestationDiscovery] Started cleanup timer');
    }
    
    /**
     * Remove devices that haven't been seen recently
     */
    private cleanupStaleDevices(): void {
        const now = Date.now();
        const staleDevices: string[] = [];
        
        for (const [deviceId, device] of this.devices) {
            if (deviceId === this.config.deviceId) {
                // Don't remove ourselves
                continue;
            }
            
            if (now - device.lastSeen > this.DEVICE_TIMEOUT) {
                staleDevices.push(deviceId);
            }
        }
        
        for (const deviceId of staleDevices) {
            console.log(`[AttestationDiscovery] Removing stale device: ${deviceId} (not seen for ${this.DEVICE_TIMEOUT}ms)`);
            this.devices.delete(deviceId);
            this.onDeviceLost.emit(deviceId);
        }
        
        if (staleDevices.length > 0) {
            console.log(`[AttestationDiscovery] Cleaned up ${staleDevices.length} stale devices`);
        }
    }
    
}