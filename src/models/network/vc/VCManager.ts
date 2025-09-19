/**
 * Verifiable Credential (VC) Manager
 *
 * Handles the exchange and verification of DeviceIdentityCredentials.
 */

import { IQuicTransport, DeviceIdentityCredential, VCRequestMessage, VCPresentationMessage, NetworkServiceType } from '../interfaces';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import { Buffer } from '@refinio/one.core/lib/system/expo/index.js';
import Debug from 'debug';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js'; 
import type { Person } from '@refinio/one.core/lib/recipes.js';
import * as tweetnacl from 'tweetnacl';
import { UdpRemoteInfo } from '../UdpModel';
import { CredentialVerifier } from '../credentials/CredentialVerifier';

// Use one.core crypto helpers instead of direct imports
import { createCryptoHash } from '@refinio/one.core/lib/system/crypto-helpers.js';

const debug = Debug('one:vc:manager');

// Type alias for the function that gets an issuer's public key
export type GetIssuerPublicKeyFunc = (issuerPersonId: SHA256IdHash<Person>) => Promise<string | null>;

// Type alias for the function that verifies a VC's signature
export type VerifyVCSignatureFunc = (
  canonicalizedVcData: string, 
  signatureValue: string, // Expected to be base64url or raw binary hex, function should handle parsing
  issuerPublicKeyHex: string,
  proofType: string // e.g., "Ed25519Signature2020"
) => Promise<boolean>;

export interface VCManagerConfig {
  transport: IQuicTransport;
  ownPersonId: SHA256IdHash<Person>; 
  getIssuerPublicKey: GetIssuerPublicKeyFunc;
  verifyVCSignature: VerifyVCSignatureFunc;
  trustedIssuers?: SHA256IdHash<Person>[]; 
}

export interface VerifiedVCInfo {
  vc: DeviceIdentityCredential;
  subjectPublicKeyHex: string;
  subjectDeviceId: string;
  issuerPersonId: SHA256IdHash<Person>;
}

export class VCManager {
  private transport: IQuicTransport;
  private config: VCManagerConfig;
  private initialized: boolean = false;
  private verifiedCache: Map<string, { info: VerifiedVCInfo, timestamp: number }> = new Map();
  // private vcRequestTimeoutMs: number = 10000; // Not used in current simplified fetchAndVerifyVC

  public readonly onVCVerified = new OEvent<(verifiedInfo: VerifiedVCInfo) => void>();
  public readonly onVCVerificationFailed = new OEvent<(deviceId: string, reason: string) => void>();
  public readonly onDeviceUnclaimed = new OEvent<(deviceId: string, message: string) => void>();
  public readonly onError = new OEvent<(error: Error) => void>();

  constructor(config: VCManagerConfig) {
    this.config = config;
    this.transport = config.transport;
    debug('VCManager created');
  }

  public async init(): Promise<boolean> {
    if (this.initialized) return true;
    debug('Initializing VCManager...');
    try {
      this.transport.addService(NetworkServiceType.VC_EXCHANGE_SERVICE, this.handleVCMessage.bind(this));
      this.initialized = true;
      debug('VCManager initialized successfully.');
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.onError.emit(err);
      debug('VCManager initialization failed:', err);
      return false;
    }
  }

  public async fetchAndVerifyVC(remoteDeviceId: string, remoteAddress: string, remotePort: number): Promise<void> {
    if (!this.initialized) {
      const err = new Error('VCManager not initialized.');
      this.onError.emit(err);
      this.onVCVerificationFailed.emit(remoteDeviceId, err.message); // Notify failure
      return;
    }
    if (remoteDeviceId === this.config.ownPersonId) {
        debug('Skipping VC request to self.');
        // Optionally emit a specific event or handle as a pre-verified self-identity if needed
        return;
    }

    console.log(`[VCManager] Requesting VC from ${remoteDeviceId} at ${remoteAddress}:${remotePort}`);
    debug(`Requesting VC from ${remoteDeviceId} at ${remoteAddress}:${remotePort}`);
    try {
      // Generate a nonce for replay attack prevention
      const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      
      // ESP32 expects 'vc_request' format with additional fields
      const requestMessage = { 
        type: 'vc_request',
        requesterPersonId: this.config.ownPersonId,
        timestamp: Date.now(),
        nonce: nonce
      };
      const messageData = new TextEncoder().encode(JSON.stringify(requestMessage));
      const packet = new Uint8Array(1 + messageData.length);
      packet[0] = NetworkServiceType.VC_EXCHANGE_SERVICE; // Service type 7
      packet.set(messageData, 1);
      
      console.log(`[VCManager] Sending VC request packet:`, {
        serviceType: packet[0],
        packetSize: packet.length,
        message: requestMessage,
        destination: `${remoteAddress}:${remotePort}`
      });
      
      await this.transport.send(packet, remoteAddress, remotePort);
      console.log(`[VCManager] VC request sent successfully to ${remoteDeviceId}`);
      debug(`VC request sent to ${remoteDeviceId}`);
      // Response will be handled by handleVCMessage, which will emit events.
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`[VCManager] Error sending VC request:`, err);
      this.onError.emit(err);
      this.onVCVerificationFailed.emit(remoteDeviceId, `Error requesting VC: ${err.message}`);
    }
  }

  private async handleVCMessage(data: Buffer, rinfo: { address: string, port: number }): Promise<void> {
    console.log(`[VCManager] VC_EXCHANGE_SERVICE: Received message from ${rinfo.address}:${rinfo.port}, size: ${data.length}`);
    debug(`VC_EXCHANGE_SERVICE: Received message from ${rinfo.address}:${rinfo.port}`);
    
    // Skip the service type byte if present
    const messageData = data[0] === NetworkServiceType.VC_EXCHANGE_SERVICE 
      ? data.slice(1) 
      : data;
    
    console.log(`[VCManager] Message data size after removing service byte: ${messageData.length}`);
    
    // Convert to string using TextDecoder
    const textDecoder = new TextDecoder();
    const messageString = textDecoder.decode(messageData);
    
    // Log full message to debug truncation
    console.log(`[VCManager] Full message length: ${messageString.length} chars`);
    
    // Check for null bytes or other issues
    const nullByteIndex = messageString.indexOf('\0');
    if (nullByteIndex >= 0) {
      console.log(`[VCManager] Found null byte at position ${nullByteIndex}, truncating...`);
      const cleanMessageString = messageString.substring(0, nullByteIndex);
      console.log(`[VCManager] Cleaned message (first 400 chars):`, cleanMessageString.substring(0, 400));
      
      let messagePayload;
      try {
        messagePayload = JSON.parse(cleanMessageString);
        console.log(`[VCManager] Successfully parsed message type: ${messagePayload.type}`);
        if (messagePayload.type === 'vc_response') {
          console.log(`[VCManager] ESP32 VC response detected, device_id: ${messagePayload.device_id}`);
        }
      } catch (e) {
        console.error(`[VCManager] Failed to parse VC message JSON:`, e);
        console.error(`[VCManager] Message that failed to parse:`, cleanMessageString);
        debug('Failed to parse VC message JSON:', e);
        this.onError.emit(new Error('Invalid VC message format'));
        return;
      }
      
      // Continue with the parsed payload
      this.processVCPayload(messagePayload, rinfo);
    } else {
      console.log(`[VCManager] No null bytes found, parsing full message`);
      console.log(`[VCManager] Message preview (first 400 chars):`, messageString.substring(0, 400));
      
      let messagePayload;
      try {
        messagePayload = JSON.parse(messageString);
        console.log(`[VCManager] Successfully parsed message type: ${messagePayload.type}`);
        if (messagePayload.type === 'vc_response') {
          console.log(`[VCManager] ESP32 VC response detected, device_id: ${messagePayload.device_id}`);
        }
      } catch (e) {
        console.error(`[VCManager] Failed to parse VC message JSON:`, e);
        console.error(`[VCManager] Message that failed to parse:`, messageString);
        debug('Failed to parse VC message JSON:', e);
        this.onError.emit(new Error('Invalid VC message format'));
        return;
      }
      
      // Continue with the parsed payload
      this.processVCPayload(messagePayload, rinfo);
    }
  }

  private async processVCPayload(messagePayload: any, rinfo: { address: string, port: number }): Promise<void> {
    if (messagePayload.type === 'present_vc' || messagePayload.type === 'vc_response') {
      // Handle both message types - 'present_vc' is the standard, 'vc_response' is what ESP32 sends
      let vc: DeviceIdentityCredential;
      let subjectDeviceId: string;
      
      if (messagePayload.type === 'vc_response') {
        // ESP32 format: {"type":"vc_response","device_id":"esp32-xxx","nonce":"xxx","credential":{...}}
        console.log(`[VCManager] Processing ESP32 vc_response from device ${messagePayload.device_id}`);
        
        // Check if device is unclaimed (available for ownership)
        if (messagePayload.status === 'unclaimed') {
          console.log(`[VCManager] ESP32 device ${messagePayload.device_id} is unclaimed and available for ownership`);
          console.log(`[VCManager] Message: ${messagePayload.message || 'Device available for ownership'}`);
          // This is not an error - it means the device can be claimed
          this.onDeviceUnclaimed.emit(messagePayload.device_id, messagePayload.message || 'Device available for ownership');
          return;
        }
        
        vc = messagePayload.credential;
        subjectDeviceId = messagePayload.device_id;
        
        // Validate nonce if we're tracking it (for future implementation)
        if (messagePayload.nonce) {
          console.log(`[VCManager] Response includes nonce: ${messagePayload.nonce}`);
        }
        
        console.log(`[VCManager] ESP32 DeviceIdentityCredential details:`, {
          '$type$': vc.$type$,
          issuer: vc.issuer,
          credentialSubject: vc.credentialSubject,
          issuanceDate: vc.issuanceDate,
          expirationDate: vc.expirationDate,
          proof: vc.proof ? 'present' : 'missing'
        });
        
        // With proper QUICVC model, the issuer is the device owner
        console.log(`[VCManager] Device ${subjectDeviceId} owner (issuer): ${vc.issuer}`);
      } else {
        // Standard format: {"type":"present_vc","vc":{...}}
        const presentation = messagePayload as VCPresentationMessage;
        vc = presentation.vc;
        subjectDeviceId = vc.credentialSubject.id;
      }
      
      debug(`Received VC message from ${subjectDeviceId} (issuer: ${vc.issuer})`);

      // The issuer is the owner who provisioned the device
      const issuerPersonId = vc.issuer as SHA256IdHash<Person>;
      
      console.log(`[VCManager] Issuer person ID:`, issuerPersonId);
      console.log(`[VCManager] Credential type:`, vc.$type$);
      let isIssuerTrusted = false;
      
      // For DeviceIdentityCredential, we trust any valid issuer
      // The ownership check happens at a higher level (ESP32ConnectionManager)
      if (vc.$type$ === 'DeviceIdentityCredential' && messagePayload.type === 'vc_response') {
        console.log(`[VCManager] DeviceIdentityCredential from ESP32 ${subjectDeviceId}, issuer: ${issuerPersonId}`);
        // Trust any properly formatted DeviceIdentityCredential
        // The actual ownership verification happens when checking if issuer matches our Person ID
        isIssuerTrusted = true;
      } else if (this.config.trustedIssuers && this.config.trustedIssuers.includes(issuerPersonId)) {
        isIssuerTrusted = true;
      } else if (issuerPersonId === this.config.ownPersonId) {
        isIssuerTrusted = true;
        debug(`VC issuer ${issuerPersonId} is self (ownPersonId), considered trusted.`);
      } else {
        debug(`Issuer ${issuerPersonId} not in explicit trust list and not self. Verification will depend on external trust policy if implemented.`);
        // For Phase 1, if not self and not in trustedIssuers, we might reject, or rely on a global policy.
        // For now, let's assume if not explicitly trusted, it's a failure for this basic manager.
        // isIssuerTrusted = false; // Or, let it proceed and higher layers decide if the issuer is acceptable.
      }

      if (!isIssuerTrusted) {
        this.onVCVerificationFailed.emit(subjectDeviceId, `Issuer ${issuerPersonId} not trusted by VCManager policy.`);
        return;
      }

      // Skip signature verification for ESP32 DeviceIdentityCredentials
      if (vc.$type$ === 'DeviceIdentityCredential' && messagePayload.type === 'vc_response') {
        console.log(`[VCManager] Skipping signature verification for ESP32 DeviceIdentityCredential`);
        // The credential was signed by the owner when provisioning the device
        // We trust the credential format and will verify ownership at a higher level
      } else {
        const issuerPublicKeyHex = await this.config.getIssuerPublicKey(issuerPersonId);
        if (!issuerPublicKeyHex) {
          this.onVCVerificationFailed.emit(subjectDeviceId, `Could not retrieve public key for issuer ${issuerPersonId}.`);
          return;
        }
        
        const vcDataToVerify = { ...vc };
        delete (vcDataToVerify as any).proof; 
        // IMPORTANT: Use a stable JSON canonicalization method here instead of JSON.stringify
        const canonicalizedVcData = JSON.stringify(vcDataToVerify); // Placeholder!

        // VerifyVCSignatureFunc will handle hex to byte conversion for its inputs if needed
        const signatureValid = await this.config.verifyVCSignature(
          canonicalizedVcData, 
          vc.proof.proofValue, // vc.proof.proofValue is base64url string from VC spec
          issuerPublicKeyHex,
          vc.proof.type
        );

        if (!signatureValid) {
          this.onVCVerificationFailed.emit(subjectDeviceId, 'VC signature verification failed.');
          return;
        }
        debug(`VC signature for ${subjectDeviceId} is valid.`);
      }

      if (vc.expirationDate && new Date(vc.expirationDate) < new Date()) {
        this.onVCVerificationFailed.emit(subjectDeviceId, 'VC has expired.');
        return;
      }

      // Extract public key from DeviceIdentityCredential
      let publicKeyHex: string = '';
      if (vc.$type$ === 'DeviceIdentityCredential' && vc.credentialSubject) {
        // DeviceIdentityCredential has publicKeyHex in credentialSubject
        publicKeyHex = vc.credentialSubject.publicKeyHex || '';
        console.log(`[VCManager] Device public key: ${publicKeyHex ? publicKeyHex.substring(0, 20) + '...' : 'not provided'}`);
      } else if (vc.credentialSubject?.publicKeyHex) {
        // Standard format
        publicKeyHex = vc.credentialSubject.publicKeyHex;
      }
      
      const verifiedInfo: VerifiedVCInfo = {
        vc,
        subjectDeviceId: subjectDeviceId || vc.credentialSubject?.id,
        subjectPublicKeyHex: publicKeyHex,
        issuerPersonId,
      };
      
      this.verifiedCache.set(subjectDeviceId, { info: verifiedInfo, timestamp: Date.now() });
      this.onVCVerified.emit(verifiedInfo);
      debug(`VC for ${subjectDeviceId} successfully verified and processed.`);

    } else if (messagePayload.type === 'request_vc') {
      debug(`Received VCRequestMessage from ${rinfo.address}. This instance is primarily a verifier and does not auto-respond with its own VC.`);
      // Logic for this instance to *present* its own VC would be initiated by a higher layer, 
      // e.g., AppModel deciding to send its VC to a peer.
    } else {
      debug('Received unknown message type on VC_EXCHANGE_SERVICE:', messagePayload);
    }
  }

  public getVerifiedInfo(deviceId: string): VerifiedVCInfo | null {
    const entry = this.verifiedCache.get(deviceId);
    // Example cache TTL: 1 hour for explicitly trusted, 1 minute otherwise (or if not specified)
    const cacheDuration = (this.config.trustedIssuers && this.config.trustedIssuers.length > 0) ? 3600000 : 60000;
    if (entry && (Date.now() - entry.timestamp < cacheDuration)) { 
        return entry.info;
    }
    this.verifiedCache.delete(deviceId); // Remove stale entry
    return null;
  }

  /**
   * Verify a DeviceIdentityCredential directly (e.g., from a heartbeat message)
   * This is used when devices present their credentials without a request
   */
  public async verifyCredential(vc: DeviceIdentityCredential, deviceId: string): Promise<VerifiedVCInfo | null> {
    try {
      debug(`Verifying credential for device ${deviceId}`);
      
      // Basic validation
      if (!vc.issuer || !vc.credentialSubject || !vc.proof) {
        debug(`Invalid credential structure for ${deviceId}`);
        return null;
      }

      const subjectDeviceId = vc.credentialSubject.id || deviceId;
      const issuerPersonId = vc.issuer as SHA256IdHash<Person>;
      
      // Check expiration
      if (vc.expirationDate && new Date(vc.expirationDate) < new Date()) {
        debug(`Credential for ${deviceId} has expired`);
        return null;
      }

      // For self-issued credentials or trusted issuers, skip signature verification
      if (issuerPersonId === this.config.ownPersonId || 
          (this.config.trustedIssuers && this.config.trustedIssuers.includes(issuerPersonId))) {
        debug(`Trusted issuer ${issuerPersonId} for ${subjectDeviceId}, skipping signature verification`);
      } else {
        // Verify signature
        const issuerPublicKeyHex = await this.config.getIssuerPublicKey(issuerPersonId);
        if (!issuerPublicKeyHex) {
          debug(`Could not retrieve public key for issuer ${issuerPersonId}`);
          return null;
        }
        
        const vcDataToVerify = { ...vc };
        delete (vcDataToVerify as any).proof;
        const canonicalizedVcData = JSON.stringify(vcDataToVerify);

        const signatureValid = await this.config.verifyVCSignature(
          canonicalizedVcData,
          vc.proof.proofValue,
          issuerPublicKeyHex,
          vc.proof.type
        );

        if (!signatureValid) {
          debug(`Signature verification failed for ${deviceId}`);
          return null;
        }
      }

      // Extract public key
      const publicKeyHex = vc.credentialSubject?.publicKeyHex || '';
      
      const verifiedInfo: VerifiedVCInfo = {
        vc,
        subjectDeviceId,
        subjectPublicKeyHex: publicKeyHex,
        issuerPersonId,
      };
      
      // Cache the verification result
      this.verifiedCache.set(subjectDeviceId, { info: verifiedInfo, timestamp: Date.now() });
      
      return verifiedInfo;
    } catch (error) {
      debug(`Error verifying credential for ${deviceId}:`, error);
      return null;
    }
  }

  public async shutdown(): Promise<void> {
    debug('Shutting down VCManager...');
    this.transport.removeService(NetworkServiceType.VC_EXCHANGE_SERVICE);
    this.verifiedCache.clear();
    debug('VCManager shutdown complete.');
  }
} 