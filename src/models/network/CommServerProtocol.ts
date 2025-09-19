/**
 * CommServerProtocol - Handles the CommServer authentication protocol
 * 
 * Implements the 3-step CommServer authentication flow:
 * 1. register - Send public key to CommServer
 * 2. authentication_request - Receive challenge, process it, send response  
 * 3. authentication_success - Receive confirmation, connection is ready
 */

import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import { createCryptoApiFromDefaultKeys } from '@refinio/one.core/lib/keychain/keychain.js';
import { ensurePublicKey } from '@refinio/one.core/lib/crypto/encryption.js';
import { hexToUint8Array, uint8arrayToHexString } from '@refinio/one.core/lib/util/arraybuffer-to-and-from-hex-string.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import Debug from 'debug';

const debug = Debug('one:commserver:protocol');

export interface CommServerMessage {
  command: string;
  [key: string]: any;
}

export interface AuthenticationRequest {
  command: 'authentication_request';
  challenge: string; // base64 encoded
  publicKey: string; // hex encoded CommServer public key
}

export interface AuthenticationResponse {
  command: 'authentication_response';
  response: string; // hex encoded encrypted response
}

export interface AuthenticationSuccess {
  command: 'authentication_success';
  pingInterval?: number;
}

export class CommServerProtocol {
  private cryptoApi: any;
  private isAuthenticated = false;
  private publicKeyHex: string | null = null;
  private personId: SHA256IdHash<Person> | null = null;

  // Events
  public readonly onAuthenticated = new OEvent<() => void>();
  public readonly onError = new OEvent<(error: Error) => void>();
  public readonly onMessage = new OEvent<(message: CommServerMessage) => void>();

  constructor() {
    // Crypto will be initialized when personId is set
  }

  private async initializeCrypto(): Promise<void> {
    if (!this.personId) {
      throw new Error('PersonId must be set before initializing crypto');
    }

    try {
      // CORRECTED: Use PairingManager pattern - get instance first, then keys for that instance
      const { getLocalInstanceOfPerson } = await import('@refinio/one.models/lib/misc/instance');
      const { getDefaultKeys } = await import('@refinio/one.core/lib/keychain/keychain.js');
      const { getObject } = await import('@refinio/one.core/lib/storage-unversioned-objects.js');
      
      console.log('🔑 [KEY_DEBUG] CommServerProtocol.initializeCrypto() - PersonId:', this.personId);
      
      const defaultInstance = await getLocalInstanceOfPerson(this.personId);
      console.log('🔑 [KEY_DEBUG] CommServerProtocol.initializeCrypto() - DefaultInstance:', defaultInstance);
      
      const keysHash = await getDefaultKeys(defaultInstance);
      console.log('🔑 [KEY_DEBUG] CommServerProtocol.initializeCrypto() - KeysHash:', keysHash);
      
      const keys = await getObject(keysHash);
      console.log('🔑 [KEY_DEBUG] CommServerProtocol.initializeCrypto() - PublicKey:', keys.publicKey);
      
      this.cryptoApi = await createCryptoApiFromDefaultKeys(defaultInstance);
      debug('CryptoApi initialized for CommServer protocol');
    } catch (error) {
      debug('Failed to initialize CryptoApi:', error);
      this.onError.emit(new Error(`Failed to initialize crypto: ${error}`));
    }
  }

  /**
   * Set the person ID and public key for this instance
   */
  public async setIdentity(personId: SHA256IdHash<Person>, publicKeyHex: string): Promise<void> {
    this.personId = personId;
    this.publicKeyHex = publicKeyHex;
    await this.initializeCrypto();
    debug('Identity set for CommServer protocol:', publicKeyHex.slice(0, 16) + '...');
  }

  /**
   * Handle incoming message from CommServer
   */
  public async handleMessage(message: CommServerMessage): Promise<CommServerMessage | null> {
    debug('Handling CommServer message:', message.command);

    switch (message.command) {
      case 'authentication_request':
        return this.handleAuthenticationRequest(message as AuthenticationRequest);
      
      case 'authentication_success':
        return this.handleAuthenticationSuccess(message as AuthenticationSuccess);
      
      case 'comm_ping':
        return this.handlePing();
      
      default:
        // Pass through other messages
        this.onMessage.emit(message);
        return null;
    }
  }

  /**
   * Create registration message
   */
  public createRegistrationMessage(): CommServerMessage | null {
    if (!this.publicKeyHex) {
      debug('Cannot create registration - no public key set');
      return null;
    }

    return {
      command: 'register',
      publicKey: this.publicKeyHex,
      listening: true
    };
  }

  /**
   * Handle authentication_request from CommServer
   */
  private async handleAuthenticationRequest(message: AuthenticationRequest): Promise<AuthenticationResponse | null> {
    debug('Processing authentication_request...');

    if (!this.cryptoApi) {
      debug('CryptoApi not available for authentication');
      this.onError.emit(new Error('CryptoApi not initialized'));
      return null;
    }

    try {
      // 1. Decode base64 challenge to Uint8Array
      const challengeBase64 = message.challenge;
      const challengeBytes = new Uint8Array(Buffer.from(challengeBase64, 'base64'));
      debug('Challenge decoded, length:', challengeBytes.length);

      // 2. Convert CommServer public key from hex to PublicKey type
      const commServerPublicKeyBytes = hexToUint8Array(message.publicKey as any);
      const commServerPublicKey = ensurePublicKey(commServerPublicKeyBytes);
      debug('CommServer public key processed');

      // 3. Decrypt the challenge
      const decryptedChallenge = await this.cryptoApi.decrypt(challengeBytes, commServerPublicKey);
      debug('Challenge decrypted, length:', decryptedChallenge.length);

      // 4. Apply bit negation (CommServer requirement)
      const processedChallenge = new Uint8Array(decryptedChallenge.length);
      for (let i = 0; i < decryptedChallenge.length; i++) {
        processedChallenge[i] = decryptedChallenge[i] ^ 0xFF;
      }
      debug('Challenge processed with bit negation');

      // 5. Encrypt the processed challenge with CommServer's public key
      const encryptedResponse = await this.cryptoApi.encryptAndEmbedNonce(processedChallenge, commServerPublicKeyBytes);
      debug('Response encrypted, length:', encryptedResponse.length);

      // 6. Convert to hex for transmission
      const responseHex = uint8arrayToHexString(encryptedResponse);
      debug('Authentication response ready, hex length:', responseHex.length);

      return {
        command: 'authentication_response',
        response: responseHex
      };

    } catch (error) {
      debug('Authentication request processing failed:', error);
      this.onError.emit(new Error(`Authentication failed: ${error}`));
      return null;
    }
  }

  /**
   * Handle authentication_success from CommServer
   */
  private handleAuthenticationSuccess(message: AuthenticationSuccess): null {
    debug('Authentication successful!');
    this.isAuthenticated = true;
    
    if (message.pingInterval) {
      debug('CommServer ping interval:', message.pingInterval);
    }

    this.onAuthenticated.emit();
    return null;
  }

  /**
   * Handle comm_ping from CommServer
   */
  private handlePing(): CommServerMessage {
    debug('Responding to CommServer ping');
    return {
      command: 'comm_pong'
    };
  }

  /**
   * Check if authenticated with CommServer
   */
  public isAuthenticatedWithCommServer(): boolean {
    return this.isAuthenticated;
  }

  /**
   * Reset authentication state
   */
  public reset(): void {
    this.isAuthenticated = false;
    debug('CommServer protocol reset');
  }
} 