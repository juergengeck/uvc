/**
 * Network transport interfaces
 * 
 * This file contains clean interfaces for network transport
 * with proper separation of concerns.
 */

import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import { UdpRemoteInfo } from './UdpModel';

/**
 * QUIC Transport Interface
 * 
 * Core transport layer interface with no discovery functionality
 */
export interface IQuicTransport {
  // Core functionality
  init(options?: QuicTransportOptions): Promise<void>;
  listen(options?: QuicTransportOptions): Promise<void>;
  send(data: any, address: string, port: number): Promise<void>;
  close(): Promise<void>;
  
  // Status methods
  isInitialized(): boolean;
  getInfo(): Promise<{port: number, host: string} | null>;
  
  // Diagnostics
  runDiagnostics(): Promise<string>;
  
  // Datagram service types
  addService(serviceType: number, handler: (data: any, rinfo: UdpRemoteInfo) => void): void;
  removeService(serviceType: number): void;
  clearServices(): void;
  
  // Event handling using OEvent pattern
  on(event: 'ready' | 'close', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'message', listener: (data: Buffer, rinfo: UdpRemoteInfo) => void): this;
  
  // Optional properties (implementation specific)
  readonly socketId?: string | number;
  readonly stats?: TransportStats;
}

/**
 * Transport options for initialization
 */
export interface QuicTransportOptions {
  port?: number;
  host?: string;
  maxDatagramSize?: number;
  deviceId?: string;
}

/**
 * Transport statistics
 */
export interface TransportStats {
  packetsReceived: number;
  packetsSent: number;
  bytesReceived: number;
  bytesSent: number;
  errors: number;
}

/**
 * Discovery Protocol Interface
 * 
 * Separate from transport layer - handles device discovery
 */
export interface IDiscoveryProtocol {
  // Core functionality
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  
  // Device management
  getDevices(): Device[];
  getDevice(deviceId: string): Device | undefined;
  
  // Events
  readonly onDeviceDiscovered: EventEmitterLike;
  readonly onDeviceUpdated: EventEmitterLike;
  readonly onDeviceLost: EventEmitterLike;
}

/**
 * Device interface - using Device from recipes
 */
import type { Device as RecipeDevice } from '@src/recipes/device';
export type Device = RecipeDevice;

/**
 * Discovery Device type - extends Device with discovery-specific properties
 */
export interface DiscoveryDevice extends Device {
  // Device already has deviceId, deviceType, address, port from base Device interface
  // Just add discovery-specific runtime properties
  online?: boolean;
  lastSeen?: number;
  wifiStatus?: 'active' | 'inactive';  // WiFi connectivity status
  btleStatus?: 'active' | 'inactive';  // Bluetooth LE connectivity status
}

/**
 * Discovery message format
 */
export interface DiscoveryMessage {
  type: 'discovery_request' | 'discovery_response';
  deviceId: string;
  deviceName: string;
  deviceType: string;
  capabilities: string[];
  version: string;
  timestamp: number;
  localIPs?: string[];
  deviceStatus?: {
    blue_led?: string; // LED status: 'on', 'off', 'blink'
    [key: string]: any; // Other device-specific status
  };
}

/**
 * Verifiable Credential (VC) related interfaces
 */

/**
 * Structure for the 'proof' component of a Verifiable Credential.
 */
export interface VCProof {
  type: string;          // Signature suite used (e.g., "Ed25519Signature2020", "R1Signature2024")
  created?: string;      // ISO 8601 timestamp when the proof was created
  proofPurpose: string;  // e.g., "assertionMethod", "authentication"
  verificationMethod: string; // URI identifying the issuer's public key (e.g., did:one:person:<issuerPersonId>#keys-1)
  proofValue: string;      // The digital signature (e.g., Base64URL encoded)
}

/**
 * Structure for the 'credentialSubject' component of a DeviceIdentityCredential.
 */
export interface DeviceIdentityCredentialSubject {
  id: string;             // The unique Device ID (ideally a Person ID representing the device)
  publicKeyHex: string;   // Primary public signing key of the subject device (hex-encoded Ed25519)
  type?: string;            // e.g., "LamaDeviceApp", "LamaHardwarePeripheral"
  capabilities?: string[];  // Optional: List of capabilities asserted for this device
}

/**
 * DeviceIdentityCredential Recipe
 *
 * Represents an attestation about a device's identity and its primary authentication public key.
 * This will be stored as a ONE Object.
 */
export interface DeviceIdentityCredential {
  // Standard ONE Object fields
  $type$: 'DeviceIdentityCredential';
  id: string; // SHA256Hash<DeviceIdentityCredential> - Hash of the canonicalized content (excluding proof)
  owner: string; // SHA256IdHash<Person> - Typically the issuer
  controller?: string; // SHA256IdHash<Person> - Optional: Manages this VC, may be same as owner or subject

  credentialSubject: DeviceIdentityCredentialSubject;
  
  issuer: string; // SHA256IdHash<Person> - Issuer of the VC (MUST match owner for ONE object consistency)
  issuanceDate: string; // ISO 8601 timestamp (e.g., YYYY-MM-DDTHH:mm:ssZ)
  expirationDate?: string; // ISO 8601 timestamp (Optional)

  proof: VCProof; // The cryptographic proof/signature
}

/**
 * Service Types for QuicTransport
 * Prefixed with a byte in messages to route to the correct handler.
 */
export enum NetworkServiceType {
  DISCOVERY_SERVICE = 1,      // HTML-based device discovery broadcasts (unclaimed devices)
  CREDENTIAL_SERVICE = 2,     // Credential provisioning and ownership removal
  LED_CONTROL_SERVICE = 3,    // LED control commands to ESP32
  ESP32_DATA_SERVICE = 4,     // ESP32 general data messages (reserved for ESP32 use)
  JOURNAL_SYNC_SERVICE = 5,   // Journal-based data synchronization
  ATTESTATION_SERVICE = 6,    // True cryptographic attestations with signatures
  VC_EXCHANGE_SERVICE = 7,    // Verifiable Credential exchange for authentication
  HEARTBEAT_SERVICE = 8,      // Connection heartbeat messages
  // Gap for future services...
  ESP32_RESPONSE_SERVICE = 11, // ESP32 command responses (ownership ack, etc.)
}

/**
 * Message structure for requesting a VC.
 * App (verifier) sends to ESP32 (holder).
 */
export interface VCRequestMessage {
  type: 'request_vc';
  nonce?: string; // Optional: for request-response matching if needed
}

/**
 * Message structure for presenting a VC.
 * ESP32 (holder) sends to App (verifier).
 */
export interface VCPresentationMessage {
  type: 'present_vc';
  vc: DeviceIdentityCredential; // The VC object itself
  // Alternatively, vc could be a JSON string: vcJson: string;
}

/**
 * EventEmitter interface for type compatibility
 */
export interface EventEmitterLike {
  emit(event: string, ...args: any[]): boolean;
  on(event: string, listener: Function): this;
  addListener(event: string, listener: Function): this;
  once(event: string, listener: Function): this;
  removeListener(event: string, listener: Function): this;
  removeAllListeners(event?: string): this;
} 

export interface UdpBindOptions {
  address?: string;
  port: number;
}

