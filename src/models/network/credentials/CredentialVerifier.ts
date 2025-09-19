/**
 * Credential Verification Module
 * 
 * Provides device authentication without relying on TLS certificates.
 * This implements a custom credential system on top of our QUIC transport.
 */

import { IQuicTransport, NetworkServiceType } from '../interfaces';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import { fromBinary } from '@refinio/one.core/lib/system/expo/buffer.js';
import Debug from 'debug';

// Expo and TweetNaCl for crypto operations
import * as expoCrypto from 'expo-crypto';
import * as tweetnacl from 'tweetnacl';

// Import buffer conversion utilities from one.core
// Adjust the path if the primary export is different, e.g., directly from '@refinio/one.core/lib/system/buffer'
import { fromString } from '@refinio/one.core/lib/system/expo/buffer.js';

// Initialize debug but don't enable it - controlled by message bus
const debug = Debug('one:credentials:verifier');

// Simple Buffer implementation for React Native
const Buffer = {
  from: (data: string | Uint8Array, encoding: string = 'utf8'): Uint8Array => {
    if (typeof data === 'string') {
      if (encoding === 'utf8') {
        const encoder = new TextEncoder();
        return encoder.encode(data);
      } else if (encoding === 'hex') {
        const bytes = new Uint8Array(data.length / 2);
        for (let i = 0; i < data.length; i += 2) {
          bytes[i / 2] = parseInt(data.substr(i, 2), 16);
        }
        return bytes;
      }
      throw new Error(`Unsupported encoding: ${encoding}`);
    } else {
      // data is Uint8Array, return as-is
      return data;
    }
  },
  concat: (arrays: Uint8Array[]): Uint8Array => {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  }
};

// Extend Uint8Array prototype with toString method for hex conversion
declare global {
  interface Uint8Array {
    toString(encoding?: string): string;
  }
}

if (!Uint8Array.prototype.toString) {
  Uint8Array.prototype.toString = function(encoding: string = 'utf8'): string {
    if (encoding === 'hex') {
      return Array.from(this).map(b => b.toString(16).padStart(2, '0')).join('');
    } else if (encoding === 'utf8') {
      const decoder = new TextDecoder();
      return decoder.decode(this);
    }
    throw new Error(`Unsupported encoding: ${encoding}`);
  };
}

// --- Helper functions for Uint8Array and Hex conversion ---
function hexToUint8Array(hexString: string): Uint8Array {
  if (hexString.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  const byteArray = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < byteArray.length; i++){
    byteArray[i] = parseInt(hexString.substring(i * 2, i * 2 + 2), 16);
  }
  return byteArray;
}

function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''); // Simple hex conversion
}
// --- End Helper functions ---

/**
 * Credential types
 */
export enum CredentialType {
  CHALLENGE_REQUEST = 1,
  CHALLENGE_RESPONSE = 2,
  VERIFICATION_SUCCESS = 3,
  VERIFICATION_FAILURE = 4,
  OWNERSHIP_REMOVE_ACK = 5
}

/**
 * Credential status
 */
export enum CredentialStatus {
  UNKNOWN = 'unknown',
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected'
}

/**
 * Credential data structure
 */
export interface Credential {
  deviceId: string;
  publicKey: string; // Stored as hex
  issuedAt: number;
  expiresAt: number;
  signature: string; // Stored as hex
}

/**
 * Credential verification configuration
 */
export interface CredentialVerifierConfig {
  deviceId: string;
  // For tweetnacl.sign, secretKey is 64 bytes (seed + publicKey). Store as hex.
  secretKey: string; 
  publicKey: string; // Own public key, store as hex.
  
  challengeTimeout: number;
  credentialTtl: number;
}

/**
 * Credential Verifier
 * 
 * Handles device credentials verification and management using Expo/TweetNaCl crypto.
 */
export class CredentialVerifier {
  // Transport layer
  private transport: IQuicTransport;
  
  // Credential state
  private initialized: boolean = false;
  private pendingChallenges: Map<string, {
    deviceId: string;
    challenge: string;
    timestamp: number;
  }> = new Map();
  
  // Verified credentials cache
  private verifiedCredentials: Map<string, {
    credential: Credential;
    status: CredentialStatus;
    lastVerified: number;
  }> = new Map();
  
  // Events
  public readonly onCredentialVerified = new OEvent<(deviceId: string, credential: Credential) => void>();
  public readonly onCredentialRejected = new OEvent<(deviceId: string, reason: string) => void>();
  public readonly onError = new OEvent<(error: Error) => void>();
  
  // Default configuration
  private static DEFAULT_CONFIG: Partial<CredentialVerifierConfig> = {
    challengeTimeout: 30000, // 30 seconds
    credentialTtl: 86400000  // 24 hours
  };
  
  private config: CredentialVerifierConfig;
  
  /**
   * Create a credential verifier instance
   */
  constructor(
    config: CredentialVerifierConfig,
    transport: IQuicTransport
  ) {
    // Apply defaults
    this.config = {
      ...CredentialVerifier.DEFAULT_CONFIG as any,
      ...config
    };
    
    this.transport = transport;
    
    // Validate key lengths using helper function for hex conversion
    try {
      const secretKeyBytes = hexToUint8Array(this.config.secretKey); // hex string to bytes
      const publicKeyBytes = hexToUint8Array(this.config.publicKey); // hex string to bytes
      
      if (secretKeyBytes.length !== tweetnacl.sign.secretKeyLength) {
        throw new Error(`Secret key must be ${tweetnacl.sign.secretKeyLength} bytes`);
      }
      
      if (publicKeyBytes.length !== tweetnacl.sign.publicKeyLength) {
        throw new Error(`Public key must be ${tweetnacl.sign.publicKeyLength} bytes`);
      }
      
      console.log('[CredentialVerifier] Key validation successful');
    } catch (error) {
      console.error('[CredentialVerifier] Key validation failed:', error);
      throw error;
    }

    debug('Created CredentialVerifier');
  }
  
  /**
   * Initialize the credential verifier
   */
  public async init(): Promise<boolean> {
    if (this.initialized) {
      debug('Already initialized');
      return true;
    }
    
    debug('Initializing credential verifier');
    
    try {
      // Register credential service handler using NetworkServiceType
      this.transport.addService(NetworkServiceType.CREDENTIAL_SERVICE, this.handleCredentialMessage.bind(this));
      
      // Start credential cleanup timer
      setInterval(() => {
        this.cleanupExpiredCredentials();
      }, 3600000); // Run every hour
      
      this.initialized = true;
      debug('Credential verifier initialized successfully');
      return true;
    } catch (error) {
      debug('Error initializing credential verifier:', error);
      this.onError.emit(error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }
  
  /**
   * Verify a device's credential
   * 
   * @param deviceId The device ID to verify
   * @param address The device's network address
   * @param port The device's port
   * @returns Promise resolving to the verification result
   */
  public async verifyCredential(deviceId: string, address: string, port: number): Promise<boolean> {
    debug(`Verifying credential for device ${deviceId} at ${address}:${port}`);
    console.log(`[CredentialVerifier] Starting credential verification for device ${deviceId} at ${address}:${port}`);
    
    // Check if we have a recent verified credential
    const existing = this.verifiedCredentials.get(deviceId);
    if (existing && existing.status === CredentialStatus.VERIFIED) {
      const now = Date.now();
      if (now - existing.lastVerified < this.config.credentialTtl) {
        debug(`Using cached credential verification for ${deviceId}`);
        console.log(`[CredentialVerifier] Using cached credential for ${deviceId} (verified ${(now - existing.lastVerified) / 1000} seconds ago)`);
        return true;
      }
    }
    
    try {
      const challengeBytes = new Uint8Array(32);
      
      // Generate secure random challenge
      // In Node.js you'd use crypto.randomBytes, but for React Native we adapt:
      const randomValues = await expoCrypto.getRandomBytesAsync(32);
      for (let i = 0; i < 32; i++) {
        challengeBytes[i] = randomValues[i];
      }
      
      // Convert to hex for transport
      const challengeHex = Buffer.from(challengeBytes).toString('hex');
      
      // Store pending challenge
      this.pendingChallenges.set(challengeHex, {
        deviceId,
        challenge: challengeHex,
        timestamp: Date.now()
      });
      
      console.log(`[CredentialVerifier] Generated challenge for ${deviceId}: ${challengeHex.substring(0, 16)}... (full length: ${challengeHex.length})`);
      
      // Create challenge request
      const request = {
        type: CredentialType.CHALLENGE_REQUEST,
        deviceId: this.config.deviceId,
        challenge: challengeHex,
        timestamp: Date.now()
      };
      
      // Serialize message
      const packet = Buffer.concat([
        new Uint8Array([NetworkServiceType.CREDENTIAL_SERVICE]), // Use NetworkServiceType
        Buffer.from(JSON.stringify(request), 'utf8')    // JSON payload
      ]);
      
      console.log(`[CredentialVerifier] Sending challenge request to ${address}:${port}`);
      
      // Send challenge
      await this.transport.send(packet, address, port);
      
      debug(`Challenge request sent to ${deviceId}`);
      
      // Set up timeout
      const timeoutPromise = new Promise<boolean>((resolve) => {
        setTimeout(() => {
          // Check if challenge was verified
          const current = this.verifiedCredentials.get(deviceId);
          if (current && current.status === CredentialStatus.VERIFIED) {
            resolve(true);
          } else {
            // Clean up pending challenge
            if (this.pendingChallenges.has(challengeHex)) {
              this.pendingChallenges.delete(challengeHex);
              console.log(`[CredentialVerifier] Challenge timeout for ${deviceId}`);
            }
            resolve(false);
          }
        }, this.config.challengeTimeout);
      });
      
      // Wait for verification result or timeout
      return timeoutPromise;
    } catch (error) {
      console.error(`[CredentialVerifier] Error in verifyCredential for ${deviceId}:`, error);
      debug('Error verifying credential:', error);
      this.onError.emit(error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }
  
  /**
   * Handle incoming credential messages
   */
  private handleCredentialMessage(data: Buffer, rinfo: any): void {
    debug(`Received credential message from ${rinfo.address}:${rinfo.port} (${data.length} bytes)`);
    console.log(`[CredentialVerifier] Received credential message from ${rinfo.address}:${rinfo.port} (${data.length} bytes)`);
    
    try {
      // Work around buffer toString() issue
      let dataStr: string;
      const toStringResult = data.toString();
      
      // Check if toString() returned comma-separated decimal values
      if (toStringResult.includes(',') && /^\d+,\d+/.test(toStringResult)) {
        // Convert comma-separated decimal values to string
        const bytes = toStringResult.split(',').map(n => parseInt(n));
        dataStr = String.fromCharCode(...bytes);
      } else {
        dataStr = toStringResult;
      }
      
      // Parse message
      const message = JSON.parse(dataStr);
      
      if (!message.type) {
        console.warn(`[CredentialVerifier] Invalid credential message received: missing type`);
        debug('Invalid credential message:', message);
        return;
      }
      
      // Log message type
      let typeName = "UNKNOWN";
      switch (message.type) {
        case CredentialType.CHALLENGE_REQUEST:
          typeName = "CHALLENGE_REQUEST";
          break;
        case CredentialType.CHALLENGE_RESPONSE:
          typeName = "CHALLENGE_RESPONSE";
          break;
        case CredentialType.VERIFICATION_SUCCESS:
          typeName = "VERIFICATION_SUCCESS";
          break;
        case CredentialType.VERIFICATION_FAILURE:
          typeName = "VERIFICATION_FAILURE";
          break;
        case 'ownership_remove_ack':
          typeName = "OWNERSHIP_REMOVE_ACK";
          break;
      }
      
      console.log(`[CredentialVerifier] Message type: ${typeName} (${message.type}) from deviceId: ${message.deviceId || 'unknown'}`);
      
      // Handle based on message type
      switch (message.type) {
        case CredentialType.CHALLENGE_REQUEST:
          this.handleChallengeRequest(message, rinfo);
          break;
        case CredentialType.CHALLENGE_RESPONSE:
          this.handleChallengeResponse(message, rinfo);
          break;
        case 'ownership_remove_ack':
          // Handle ownership removal acknowledgment
          console.log(`[CredentialVerifier] Received ownership removal acknowledgment from ${message.device_id}: ${message.status} - ${message.message}`);
          // This is just an acknowledgment, no further action needed
          break;
        default:
          console.warn(`[CredentialVerifier] Unhandled credential message type: ${message.type}`);
          debug(`Unknown credential message type: ${message.type}`);
      }
    } catch (error) {
      console.error(`[CredentialVerifier] Error handling credential message:`, error);
      debug('Error handling credential message:', error);
    }
  }
  
  /**
   * Handle challenge request from another device
   */
  private async handleChallengeRequest(request: any, rinfo: any): Promise<void> {
    debug(`Handling challenge request from ${request.deviceId} (${rinfo.address}:${rinfo.port})`);
    console.log(`[CredentialVerifier] Handling challenge request from ${request.deviceId} (${rinfo.address}:${rinfo.port})`);
    console.log(`[CredentialVerifier] Challenge: ${request.challenge.substring(0, 16)}... (full length: ${request.challenge.length})`);
    
    try {
      // Sign the challenge
      console.log(`[CredentialVerifier] Signing challenge with our secretKey (length: ${this.config.secretKey.length})`);
      const signature = this.signChallenge(request.challenge);
      
      // Create challenge response
      const response = {
        type: CredentialType.CHALLENGE_RESPONSE,
        deviceId: this.config.deviceId,
        challenge: request.challenge,
        signature,
        publicKey: this.config.publicKey,
        timestamp: Date.now()
      };
      
      console.log(`[CredentialVerifier] Created response with signature: ${signature.substring(0, 16)}... (length: ${signature.length})`);
      
      // Serialize message
      const packet = Buffer.concat([
        new Uint8Array([NetworkServiceType.CREDENTIAL_SERVICE]), // Use NetworkServiceType
        Buffer.from(JSON.stringify(response), 'utf8')   // JSON payload
      ]);
      
      // Send response
      await this.transport.send(packet, rinfo.address, rinfo.port);
      console.log(`[CredentialVerifier] Challenge response sent to ${request.deviceId} at ${rinfo.address}:${rinfo.port}`);
      debug(`Challenge response sent to ${request.deviceId}`);
    } catch (error) {
      console.error(`[CredentialVerifier] Error handling challenge request from ${request.deviceId}:`, error);
      debug('Error handling challenge request:', error);
    }
  }

  /**
   * Handle challenge response from another device
   */
  private async handleChallengeResponse(response: any, rinfo: any): Promise<void> {
    debug(`Handling challenge response from ${response.deviceId}`);
    console.log(`[CredentialVerifier] Handling challenge response from ${response.deviceId}`);
    
    try {
      // Verify the challenge exists and is still valid
      const pending = this.pendingChallenges.get(response.challenge);
      if (!pending) {
        console.warn(`[CredentialVerifier] No pending challenge found for ${response.challenge.substring(0, 16)}...`);
        debug(`No pending challenge found for ${response.challenge}`);
        return;
      }
      
      // Check timeout
      if (Date.now() - pending.timestamp > this.config.challengeTimeout) {
        console.warn(`[CredentialVerifier] Challenge timeout for ${response.deviceId}`);
        this.pendingChallenges.delete(response.challenge);
        return;
      }
      
      // Verify the signature
      const isValid = this.verifySignature(response.challenge, response.signature, response.publicKey);
      
      if (isValid) {
        // Create credential
        const credential: Credential = {
          deviceId: response.deviceId,
          publicKey: response.publicKey,
          issuedAt: response.timestamp,
          expiresAt: response.timestamp + this.config.credentialTtl,
          signature: response.signature
        };
        
        // Store verified credential
        this.verifiedCredentials.set(response.deviceId, {
          credential,
          status: CredentialStatus.VERIFIED,
          lastVerified: Date.now()
        });
        
        console.log(`[CredentialVerifier] Credential verified for ${response.deviceId}`);
        debug(`Credential verified for ${response.deviceId}`);
        
        // Clean up pending challenge
        this.pendingChallenges.delete(response.challenge);
        
        // Emit verification event
        this.onCredentialVerified.emit(response.deviceId, credential);
      } else {
        console.warn(`[CredentialVerifier] Invalid signature from ${response.deviceId}`);
        debug(`Invalid signature from ${response.deviceId}`);
        
        // Store rejected credential
        this.verifiedCredentials.set(response.deviceId, {
          credential: {
            deviceId: response.deviceId,
            publicKey: response.publicKey,
            issuedAt: response.timestamp,
            expiresAt: 0,
            signature: response.signature
          },
          status: CredentialStatus.REJECTED,
          lastVerified: Date.now()
        });
        
        // Clean up pending challenge
        this.pendingChallenges.delete(response.challenge);
        
        // Emit rejection event
        this.onCredentialRejected.emit(response.deviceId, 'Invalid signature');
      }
    } catch (error) {
      console.error(`[CredentialVerifier] Error handling challenge response from ${response.deviceId}:`, error);
      debug('Error handling challenge response:', error);
    }
  }

  /**
   * Sign a challenge using our private key
   */
  private signChallenge(challenge: string): string {
    try {
      const challengeBytes = hexToUint8Array(challenge);
      const secretKeyBytes = hexToUint8Array(this.config.secretKey);
      
      const signature = tweetnacl.sign.detached(challengeBytes, secretKeyBytes);
      return uint8ArrayToHex(signature);
    } catch (error) {
      debug('Error signing challenge:', error);
      throw new Error(`Failed to sign challenge: ${error}`);
    }
  }

  /**
   * Verify a signature against a challenge and public key
   */
  private verifySignature(challenge: string, signature: string, publicKey: string): boolean {
    try {
      const challengeBytes = hexToUint8Array(challenge);
      const signatureBytes = hexToUint8Array(signature);
      const publicKeyBytes = hexToUint8Array(publicKey);
      
      return tweetnacl.sign.detached.verify(challengeBytes, signatureBytes, publicKeyBytes);
    } catch (error) {
      debug('Error verifying signature:', error);
      return false;
    }
  }

  /**
   * Clean up expired credentials and challenges
   */
  private cleanupExpiredCredentials(): void {
    const now = Date.now();
    
    // Clean up expired credentials
    for (const [deviceId, entry] of this.verifiedCredentials.entries()) {
      if (entry.credential.expiresAt > 0 && now > entry.credential.expiresAt) {
        debug(`Removing expired credential for ${deviceId}`);
        this.verifiedCredentials.delete(deviceId);
      }
    }
    
    // Clean up expired challenges
    for (const [challenge, entry] of this.pendingChallenges.entries()) {
      if (now - entry.timestamp > this.config.challengeTimeout) {
        debug(`Removing expired challenge for ${entry.deviceId}`);
        this.pendingChallenges.delete(challenge);
      }
    }
  }

  /**
   * Get credential status for a device
   */
  public getCredentialStatus(deviceId: string): CredentialStatus {
    const entry = this.verifiedCredentials.get(deviceId);
    return entry ? entry.status : CredentialStatus.UNKNOWN;
  }

  /**
   * Get verified credential for a device
   */
  public getCredential(deviceId: string): Credential | null {
    const entry = this.verifiedCredentials.get(deviceId);
    return entry && entry.status === CredentialStatus.VERIFIED ? entry.credential : null;
  }

  /**
   * Shutdown the credential verifier
   */
  public async shutdown(): Promise<void> {
    debug('Shutting down credential verifier');
    
    // Clear all pending challenges
    this.pendingChallenges.clear();
    
    // Clear verified credentials
    this.verifiedCredentials.clear();
    
    this.initialized = false;
  }
}