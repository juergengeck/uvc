/**
 * ESP32 Connection Manager
 *
 * Manages secure connections to ESP32 devices using QUIC-VC protocol.
 * Ensures only authorized owners can control ESP32 devices.
 *
 * PERFORMANCE NOTE:
 * - All OEvent instances use parallel execution (executeSequentially: false)
 * - This prevents slow async listeners from blocking fast ones
 * - Event listeners should defer expensive async work using setImmediate()
 */

import { IQuicTransport, NetworkServiceType } from '../interfaces';
import { VCManager, VerifiedVCInfo } from '../vc/VCManager';
import { OEvent, EventTypes } from '@refinio/one.models/lib/misc/OEvent.js';
// Note: Removed buffer imports since we're using TextEncoder().encode() for crypto operations
import Debug from 'debug';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import { UdpRemoteInfo } from '../UdpModel';
import { QuicConnectionManager } from '../QuicConnectionManager';
import { QuicVCConnectionManager } from '../QuicVCConnectionManager';
import profiler from '@src/utils/performanceProfiler';
import { createCryptoApiFromDefaultKeys, getDefaultKeys } from '@refinio/one.core/lib/keychain/keychain.js';
import { DeviceDiscoveryModel } from '../DeviceDiscoveryModel';
import { convertToMicrodata } from '@src/utils/microdataHelpers';
import type { LEDControlCommand } from '@src/types/device-control-recipes';

const debug = Debug('one:esp32:connection');

export interface ESP32Device {
  id: string;
  name: string;
  type: string;
  address: string;
  port: number;
  capabilities: string[];
  lastSeen: number;
  vcInfo?: VerifiedVCInfo;
  isAuthenticated: boolean;
  ownerPersonId?: SHA256IdHash<Person>;
}

export interface ESP32Command {
  type: 'led_control' | 'status' | 'config' | 'data' | 'ping';
  command: string;
  deviceId: string;
  timestamp: number;
  action?: string;  // For LED control: 'blue_on', 'blue_off', 'toggle', 'blink'
  data?: any;
  manual?: boolean;  // For LED control commands
}

export interface ESP32Response {
  type: 'response' | 'error';
  requestId?: string;
  command: string;
  status: 'success' | 'error' | 'unauthorized' | 'sent';
  data?: any;
  message?: string;
  timestamp: number;
}

export class ESP32ConnectionManager {
  private static instance: ESP32ConnectionManager | null = null;
  
  private transport: IQuicTransport;
  private vcManager: VCManager;
  private quicVCManager: QuicVCConnectionManager;
  private ownPersonId: SHA256IdHash<Person>;
  private connectedDevices: Map<string, ESP32Device> = new Map();
  private pendingCommands: Map<string, { resolve: (response: ESP32Response) => void, reject: (error: Error) => void, timeout: NodeJS.Timeout }> = new Map();
  private connectionManager: QuicConnectionManager;
  
  // Command queue for each device
  private commandQueues: Map<string, Array<{
    command: ESP32Command;
    requestId: string;
    resolve: (response: ESP32Response) => void;
    reject: (error: Error) => void;
  }>> = new Map();
  
  // Currently processing command for each device
  private processingCommands: Map<string, string> = new Map(); // deviceId -> requestId

  // Authentication event deduplication
  private lastAuthenticatedTime: Map<string, number> = new Map(); // deviceId -> timestamp
  private readonly AUTH_EVENT_DEBOUNCE_MS = 1000; // Don't emit same device auth within 1 second

  // Events
  // IMPORTANT: Use parallel execution (false) for authentication events to avoid blocking
  // Multiple independent listeners need to react quickly without waiting for each other
  public readonly onDeviceAuthenticated = new OEvent<(device: ESP32Device) => void>(EventTypes.Default, false);
  public readonly onDeviceDisconnected = new OEvent<(deviceId: string) => void>(EventTypes.Default, false);
  public readonly onCommandResponse = new OEvent<(deviceId: string, response: ESP32Response) => void>(EventTypes.Default, false);
  public readonly onError = new OEvent<(error: Error) => void>(EventTypes.Default, false);
  
  /**
   * Emit authentication event with deduplication to prevent spam
   */
  private emitDeviceAuthenticated(device: ESP32Device): void {
    const now = Date.now();
    const lastEmitted = this.lastAuthenticatedTime.get(device.id);

    // Only emit if we haven't emitted for this device recently
    if (!lastEmitted || now - lastEmitted > this.AUTH_EVENT_DEBOUNCE_MS) {
      this.lastAuthenticatedTime.set(device.id, now);
      console.log(`[TRACE] Emitting onDeviceAuthenticated for ${device.id} at ${now}`);
      this.onDeviceAuthenticated.emit(device);
      console.log(`[TRACE] onDeviceAuthenticated.emit() completed for ${device.id} (took ${Date.now() - now}ms)`);
    } else {
      console.warn(`[TRACE] Authentication event DEBOUNCED for ${device.id} (last emit was ${now - lastEmitted}ms ago, threshold: ${this.AUTH_EVENT_DEBOUNCE_MS}ms)`);
    }
  }
  public readonly onAuthenticationFailed = new OEvent<(deviceId: string, reason: string) => void>(EventTypes.Default, false);
  public readonly onDeviceUnclaimed = new OEvent<(deviceId: string, message: string) => void>(EventTypes.Default, false);

  public static getInstance(transport?: IQuicTransport, vcManager?: VCManager, ownPersonId?: SHA256IdHash<Person>): ESP32ConnectionManager {
    if (!ESP32ConnectionManager.instance) {
      if (!transport || !vcManager || !ownPersonId) {
        throw new Error('ESP32ConnectionManager: Must provide transport, vcManager, and ownPersonId on first initialization');
      }
      ESP32ConnectionManager.instance = new ESP32ConnectionManager(transport, vcManager, ownPersonId);
    }
    return ESP32ConnectionManager.instance;
  }
  
  public static reset(): void {
    if (ESP32ConnectionManager.instance) {
      // Clear all devices and pending commands
      ESP32ConnectionManager.instance.connectedDevices.clear();
      ESP32ConnectionManager.instance.pendingCommands.forEach(pending => clearTimeout(pending.timeout));
      ESP32ConnectionManager.instance.pendingCommands.clear();

      // Clear command queues
      ESP32ConnectionManager.instance.commandQueues.forEach(queue => {
        queue.forEach(queuedCommand => {
          queuedCommand.reject(new Error('ESP32ConnectionManager reset'));
        });
      });
      ESP32ConnectionManager.instance.commandQueues.clear();
      ESP32ConnectionManager.instance.processingCommands.clear();

      ESP32ConnectionManager.instance = null;
    }
  }
  
  private constructor(transport: IQuicTransport, vcManager: VCManager, ownPersonId: SHA256IdHash<Person>) {
    this.transport = transport;
    this.vcManager = vcManager;
    this.ownPersonId = ownPersonId;
    this.connectionManager = QuicConnectionManager.getInstance();
    
    // Initialize QuicVCConnectionManager for QUIC-VC protocol
    this.quicVCManager = QuicVCConnectionManager.getInstance(ownPersonId);
    
    // Listen for LED responses from QUIC-VC STREAM frames
    this.quicVCManager.onLEDResponse.listen((deviceId: string, response: any) => {
      console.log(`[ESP32ConnectionManager] Received LED response via QUIC-VC for ${deviceId}:`, response);

      // Check if we have a pending command for this request
      if (response.requestId && this.pendingCommands.has(response.requestId)) {
        const pending = this.pendingCommands.get(response.requestId)!;
        clearTimeout(pending.timeout);
        this.pendingCommands.delete(response.requestId);

        // ESP32 sends microdata format with 'state' field (not 'blue_led')
        const esp32Response: ESP32Response = {
          type: 'response',
          status: 'success',
          message: 'LED command executed',
          timestamp: response.timestamp || Date.now(),
          requestId: response.requestId,
          command: 'led_control',
          data: {
            deviceId: response.deviceId || deviceId,
            state: response.state,
            timestamp: response.timestamp
          }
        };

        pending.resolve(esp32Response);
        console.log(`[ESP32ConnectionManager] Resolved LED command ${response.requestId} with success`);
      }
    });
    
    // Register service handler for LED control messages (service type 3)
    // This handles both commands TO the ESP32 and responses FROM the ESP32
    this.transport.addService(3, this.handleESP32Message.bind(this));
    
    // Register service handler for ESP32 command responses (service type 11)
    // This handles acknowledgments for ownership provisioning and other commands
    this.transport.addService(11, this.handleESP32CommandResponse.bind(this));
    
    // Register service handler for credential service (service type 2)
    // This handles ownership removal responses from ESP32
    this.transport.addService(2, this.handleCredentialMessage.bind(this));
    
    // Listen to VC verification events
    this.vcManager.onVCVerified.listen(this.handleVCVerified.bind(this));
    this.vcManager.onVCVerificationFailed.listen(this.handleVCVerificationFailed.bind(this));
    this.vcManager.onDeviceUnclaimed.listen(this.handleDeviceUnclaimed.bind(this));
    
    // Listen to QuicVCConnectionManager events permanently
    this.quicVCManager.onConnectionEstablished.listen((deviceId: string, vcInfo: any) => {
      console.log(`[ESP32ConnectionManager] QUIC-VC connection established with ${deviceId}`);
      const device = this.connectedDevices.get(deviceId);
      if (device) {
        device.isAuthenticated = true;
        device.vcInfo = vcInfo;
        console.log(`[ESP32ConnectionManager] Device ${deviceId} marked as authenticated`);
        this.emitDeviceAuthenticated(device);
      } else {
        console.warn(`[ESP32ConnectionManager] Device ${deviceId} not found during connection establishment`);
      }
    });

    // Listen for connection retry requests
    this.quicVCManager.onConnectionRetryNeeded.listen(async (deviceId: string, address: string, port: number) => {
      console.log(`[ESP32ConnectionManager] Connection retry needed for ${deviceId} at ${address}:${port}`);

      const device = this.connectedDevices.get(deviceId);
      if (device) {
        // Retry authentication with the device
        console.log(`[ESP32ConnectionManager] Retrying authentication with ${deviceId}`);
        const appCredential = await this.createAppCredential();

        try {
          await this.quicVCManager.initiateHandshake(deviceId, address, port, appCredential);
        } catch (error) {
          console.error(`[ESP32ConnectionManager] Failed to retry handshake with ${deviceId}:`, error);
        }
      }
    });
    
    // Listen to connection events
    this.connectionManager.onConnectionLost.listen((deviceId: string) => {
      const device = this.connectedDevices.get(deviceId);
      if (device) {
        device.isAuthenticated = false;
        this.onDeviceDisconnected.emit(deviceId);
        debug(`ESP32 device ${deviceId} disconnected (heartbeat timeout)`);
      }
    });

    debug('ESP32ConnectionManager initialized');
  }

  /**
   * Create a DeviceIdentityCredential for this mobile app
   */
  private async createAppCredential(): Promise<DeviceIdentityCredential> {
    // Get crypto API and keys from ONE platform (now imported at top)
    const cryptoApi = await createCryptoApiFromDefaultKeys(this.ownPersonId);
    const keys = await getDefaultKeys(this.ownPersonId);

    // Generate a unique device ID for this app instance
    const appDeviceId = `lama-app-${this.ownPersonId.substring(0, 8)}`;

    // Use our actual public signing key
    const publicKeyHex = keys.publicSignKey;

    const credential: DeviceIdentityCredential = {
      $type$: 'DeviceIdentityCredential',
      id: appDeviceId,
      owner: this.ownPersonId,
      issuer: this.ownPersonId,
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: appDeviceId,
        publicKeyHex: publicKeyHex,
        type: 'LamaDeviceApp',
        capabilities: ['authentication', 'device_control', 'ownership_management']
      },
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        verificationMethod: `${this.ownPersonId}#key-1`,
        proofPurpose: 'assertionMethod',
        proofValue: '' // Will be filled below
      }
    };

    // Sign the credential
    const credentialToSign = { ...credential };
    delete credentialToSign.proof.proofValue;
    const messageText = JSON.stringify(credentialToSign);
    const message = new TextEncoder().encode(messageText);
    const signature = await cryptoApi.sign(message);
    credential.proof.proofValue = signature.toString('base64');

    return credential;
  }

  /**
   * Create a DeviceIdentityCredential to claim ownership of an ESP32 device
   * This credential is issued BY the user FOR the ESP32 device
   */
  private async createOwnershipCredential(deviceId: string): Promise<DeviceIdentityCredential> {
    // Get crypto API and keys from ONE platform (now imported at top)
    const cryptoApi = await createCryptoApiFromDefaultKeys(this.ownPersonId);
    const keys = await getDefaultKeys(this.ownPersonId);

    // Get our actual public signing key
    const ourPublicKeyHex = keys.publicSignKey;

    // For ESP32, we don't have its public key yet (it's unclaimed)
    // Use a placeholder that ESP32 will update when it accepts ownership
    const devicePublicKeyHex = "0000000000000000000000000000000000000000000000000000000000000000";

    const credential: DeviceIdentityCredential = {
      $type$: 'DeviceIdentityCredential',
      id: `vc-${deviceId}-${Date.now()}`,
      owner: this.ownPersonId,  // The owner is the person issuing this credential
      issuer: this.ownPersonId,  // We are issuing this credential
      issuanceDate: new Date().toISOString(),
      expirationDate: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString(), // 10 years
      credentialSubject: {
        id: deviceId,  // CRITICAL: This MUST match the ESP32's device ID
        publicKeyHex: devicePublicKeyHex,
        type: 'ESP32',
        capabilities: ['led_control', 'credential_provisioning', 'wifi_provisioning']
      },
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        verificationMethod: `${this.ownPersonId}#key-1`,
        proofPurpose: 'assertionMethod',
        proofValue: '' // Will be filled below
      }
    };

    // Sign the credential using ONE.core crypto API
    // Create canonical representation without proof.proofValue
    const credentialToSign = { ...credential };
    delete credentialToSign.proof.proofValue;

    // Sign the credential
    const messageText = JSON.stringify(credentialToSign);
    const message = new TextEncoder().encode(messageText);
    const signature = await cryptoApi.sign(message);

    // Add the signature as base64
    credential.proof.proofValue = signature.toString('base64');

    console.log(`[ESP32ConnectionManager] Created signed ownership credential for ${deviceId}`);
    return credential;
  }

  /**
   * Initiate QUIC-VC authentication with an ESP32 device
   */
  public async authenticateDevice(deviceId: string, address: string, port: number): Promise<boolean> {
    console.log(`[ESP32ConnectionManager] Initiating QUIC-VC authentication with ESP32 device ${deviceId} at ${address}:${port}`);
    debug(`Initiating QUIC-VC authentication with ESP32 device ${deviceId} at ${address}:${port}`);
    
    // Always add/update device entry with address and port
    this.addDiscoveredDevice(deviceId, address, port, deviceId);
    
    // Check if already authenticated
    const device = this.connectedDevices.get(deviceId);
    if (device?.isAuthenticated) {
      debug(`Device ${deviceId} is already authenticated`);
      return true;
    }
    
    try {
      // Initialize QuicVCConnectionManager if not already initialized
      if (!this.quicVCManager.isInitialized()) {
        console.log('[ESP32ConnectionManager] Initializing QuicVCConnectionManager...');
        // Create credential for this app to present during QUIC-VC handshake
        const appCredential = await this.createAppCredential();
        console.log('[ESP32ConnectionManager] Created app credential:', appCredential.credentialSubject.id);
        await this.quicVCManager.initialize(this.transport as any, this.vcManager, appCredential);
      }
      
      // Check if we already have an established QUIC-VC connection
      const existingConnection = this.quicVCManager.getConnection?.(deviceId);
      if (existingConnection && existingConnection.state === 'established') {
        console.log(`[ESP32ConnectionManager] Already have established QUIC-VC connection for ${deviceId}`);
        // Update device state to authenticated
        const device = this.connectedDevices.get(deviceId);
        if (device && !device.isAuthenticated) {
          device.isAuthenticated = true;
          this.emitDeviceAuthenticated(device);
        }
        return true;
      }
      
      // Use QUIC-VC protocol for authentication (port 49497 as per ESP32 spec)
      const quicvcPort = 49497; // ESP32 QUIC-VC port
      console.log(`[ESP32ConnectionManager] Initiating QUIC-VC handshake with ${deviceId} at ${address}:${quicvcPort}`);
      debug(`Initiating QUIC-VC handshake for ${deviceId} at ${address}:${quicvcPort}`);
      
      // Set up event listeners for QUIC-VC connection events
      let authenticationCompleted = false;
      let isDeviceUnclaimed = false;
      
      // Listen for successful connection establishment
      const connectionListener = (connectedDeviceId: string, vcInfo: any) => {
        if (connectedDeviceId === deviceId) {
          console.log(`[ESP32ConnectionManager] QUIC-VC connection established with ${deviceId}`);
          authenticationCompleted = true;
          
          // Update device state
          const device = this.connectedDevices.get(deviceId);
          if (device) {
            device.isAuthenticated = true;
            device.vcInfo = vcInfo;
            this.emitDeviceAuthenticated(device);
          }
        }
      };
      
      // Listen for connection errors
      const errorListener = (errorDeviceId: string, error: Error) => {
        if (errorDeviceId === deviceId) {
          console.error(`[ESP32ConnectionManager] QUIC-VC connection error for ${deviceId}:`, error);
          authenticationCompleted = true;
          
          // Check if device is unclaimed
          if (error.message.includes('unclaimed') || error.message.includes('no_owner')) {
            isDeviceUnclaimed = true;
            this.onDeviceUnclaimed.emit(deviceId, 'Device is unclaimed');
          } else {
            this.onAuthenticationFailed.emit(deviceId, error.message);
          }
        }
      };
      
      const connectionUnsubscribe = this.quicVCManager.onConnectionEstablished.listen(connectionListener);
      const errorUnsubscribe = this.quicVCManager.onError.listen(errorListener);
      
      // Initiate QUIC-VC handshake with app credential
      const appCredential = await this.createAppCredential();
      await this.quicVCManager.initiateHandshake(deviceId, address, quicvcPort, appCredential);
      
      // Set timeout for authentication
      setTimeout(() => {
        connectionUnsubscribe();
        errorUnsubscribe();
        
        if (!authenticationCompleted) {
          console.warn(`[ESP32ConnectionManager] QUIC-VC authentication timeout for device ${deviceId}`);
          this.onAuthenticationFailed.emit(deviceId, 'QUIC-VC authentication timeout');
        }
      }, 10000); // 10 second timeout
      
      return true;
    } catch (error) {
      console.error(`[ESP32ConnectionManager] Failed to initiate QUIC-VC authentication with ${deviceId}:`, error);
      debug(`Failed to initiate QUIC-VC authentication with ${deviceId}:`, error);
      return false;
    }
  }


  /**
   * Claim ownership of an unclaimed ESP32 device
   *
   * ESP32 ownership flow:
   * 1. Establish QUIC-VC connection (send VC_INIT with DeviceIdentityCredential)
   * 2. ESP32 processes ownership claim and stores credential
   * 3. ESP32 responds with VC_RESPONSE to complete handshake
   * 4. Connection is now established, authenticated, and can be encrypted
   * 5. LED commands and other operations use the established QUIC-VC connection
   */
  public async claimDevice(deviceId: string, address: string, port: number): Promise<boolean> {
    const claimStart = Date.now();
    console.log(`[ESP32ConnectionManager] [T+0ms] Claiming ownership of ESP32 device ${deviceId} at ${address}:${port}`);

    // CRITICAL: Mark device as being claimed to prevent discovery broadcasts from overwriting ownership
    this.pendingClaims.add(deviceId);
    console.log(`[ESP32ConnectionManager] Added ${deviceId} to pendingClaims - discovery broadcasts will be ignored`);

    // Add device to our list
    this.addDiscoveredDevice(deviceId, address, port, deviceId);

    try {
      // Create ownership credential
      const credStart = Date.now();
      const ownershipCredential = await this.createOwnershipCredential(deviceId);
      console.log(`[ESP32ConnectionManager] [T+${Date.now() - claimStart}ms] Created signed ownership credential for device ${deviceId} (took ${Date.now() - credStart}ms)`);

      // Establish QUIC-VC connection first, then send ownership credential over it
      console.log(`[ESP32ConnectionManager] [T+${Date.now() - claimStart}ms] Establishing QUIC-VC connection with ${deviceId}`);

      // CRITICAL: Wait for provisioning_ack, NOT just connection establishment
      // The QUIC-VC connection establishes BEFORE ownership is saved to NVS
      // We must wait for the ESP32 to confirm ownership was successfully saved
      return new Promise<boolean>((resolve) => {
        let responded = false;

        // Listen for device authentication event (fired when provisioning_ack is received)
        const authListener = (authenticatedDevice: ESP32Device) => {
          if (authenticatedDevice.id === deviceId && !responded) {
            responded = true;
            const elapsed = Date.now() - claimStart;
            console.log(`[ESP32ConnectionManager] [T+${elapsed}ms] Device ${deviceId} ownership confirmed via provisioning_ack (total time: ${elapsed}ms)`);
            authUnsubscribe();
            closedUnsubscribe();
            clearTimeout(timeout);
            // Keep device in pendingClaims for 2 more seconds to ignore stale discovery broadcasts
            setTimeout(() => {
              this.pendingClaims.delete(deviceId);
              console.log(`[ESP32ConnectionManager] Removed ${deviceId} from pendingClaims - accepting discovery broadcasts again`);
            }, 2000);
            resolve(true);
          }
        };

        // Also listen for connection closed event (e.g., "already_owned" failure)
        const closedListener = (closedDeviceId: string, reason: string) => {
          if (closedDeviceId === deviceId && !responded) {
            // IGNORE closure for "Starting fresh" - that's intentional cleanup, not failure
            if (reason === 'Starting fresh for ownership claim' || reason.includes('Starting fresh')) {
              console.log(`[ESP32ConnectionManager] Ignoring intentional connection closure: ${reason}`);
              return;
            }

            responded = true;
            const elapsed = Date.now() - claimStart;
            console.warn(`[ESP32ConnectionManager] [T+${elapsed}ms] QUIC-VC connection closed for ${deviceId}: ${reason}`);
            authUnsubscribe();
            closedUnsubscribe();
            clearTimeout(timeout);
            // Remove from pendingClaims immediately on failure
            this.pendingClaims.delete(deviceId);
            resolve(false);
          }
        };

        const authUnsubscribe = this.onDeviceAuthenticated.listen(authListener);
        const closedUnsubscribe = this.quicVCManager.onConnectionClosed.listen(closedListener);

        // Timeout after 10 seconds (QUIC-VC handshake + ownership claim + NVS save)
        const timeout = setTimeout(() => {
          if (!responded) {
            responded = true;
            authUnsubscribe();
            closedUnsubscribe();
            // Remove from pendingClaims on timeout
            this.pendingClaims.delete(deviceId);
            console.warn(`[ESP32ConnectionManager] Ownership claim timeout for ${deviceId} - no provisioning_ack received`);
            resolve(false);
          }
        }, 10000);

        // Initiate QUIC-VC connection with ownership credential
        // This will send VC_INIT with the DeviceIdentityCredential
        // ESP32 will process ownership claim and respond with VC_RESPONSE
        this.quicVCManager.connect(deviceId, address, port, ownershipCredential)
          .catch((error) => {
            if (!responded) {
              responded = true;
              authUnsubscribe();
              closedUnsubscribe();
              clearTimeout(timeout);
              // Remove from pendingClaims on connection failure
              this.pendingClaims.delete(deviceId);
              console.error(`[ESP32ConnectionManager] Failed to establish QUIC-VC connection:`, error);
              resolve(false);
            }
          });
      });
    } catch (error) {
      console.error(`[ESP32ConnectionManager] Error claiming device ${deviceId}:`, error);
      // Remove from pendingClaims on exception
      this.pendingClaims.delete(deviceId);
      return false;
    }
  }

  /**
   * Send a command to an ESP32 device (requires authentication)
   */
  public async sendCommand(deviceId: string, command: ESP32Command): Promise<ESP32Response> {
    const operationId = `esp32_send_command_${deviceId}_${Date.now()}`;
    profiler.startOperation(operationId, { deviceId, commandType: command.type });
    
    const device = this.connectedDevices.get(deviceId);
    
    if (!device) {
      console.error(`[ESP32ConnectionManager] Device ${deviceId} not found`);
      profiler.endOperation(operationId, { error: 'device_not_found' });
      throw new Error(`Device ${deviceId} not found`);
    }
    
    if (!device.isAuthenticated) {
      console.error(`[ESP32ConnectionManager] Device ${deviceId} not authenticated`);
      console.error(`[ESP32ConnectionManager] Device details:`, device);
      profiler.endOperation(operationId, { error: 'not_authenticated' });
      throw new Error(`Device ${deviceId} not authenticated. Please authenticate first.`);
    }
    
    profiler.checkpoint('Validation complete');
    
    // Generate request ID for tracking
    const requestId = `${deviceId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    command.timestamp = Date.now();
    
    // Add command to queue
    return new Promise((resolve, reject) => {
      const queuedCommand = {
        command,
        requestId,
        resolve,
        reject
      };
      
      // Get or create queue for this device
      let queue = this.commandQueues.get(deviceId);
      if (!queue) {
        queue = [];
        this.commandQueues.set(deviceId, queue);
      }
      
      // Check if this is an LED command
      if (command.type === 'led_control' && command.action) {
        // Remove any older LED commands targeting the same state
        const targetState = command.action;
        queue = queue.filter(item => {
          if (item.command.type === 'led_control' && item.command.action === targetState) {
            // Drop this older command targeting same state
            console.log(`[ESP32ConnectionManager] Dropping redundant LED command ${item.requestId} (target: ${targetState})`);
            item.resolve({
              type: 'response',
              status: 'success',
              message: 'Superseded by newer command',
              timestamp: Date.now()
            });
            return false;
          }
          return true;
        });
        this.commandQueues.set(deviceId, queue);
      }
      
      // Add new command to queue
      queue.push(queuedCommand);
      console.log(`[ESP32ConnectionManager] Queued command ${requestId} for device ${deviceId}. Queue length: ${queue.length}`);
      
      // Process queue if not already processing
      if (!this.processingCommands.has(deviceId)) {
        this.processCommandQueue(deviceId);
      }
    });
  }

  /**
   * Process command queue for a device
   */
  private async processCommandQueue(deviceId: string): Promise<void> {
    const queue = this.commandQueues.get(deviceId);
    if (!queue || queue.length === 0) {
      this.processingCommands.delete(deviceId);
      return;
    }
    
    const queuedCommand = queue.shift()!;
    const { command, requestId, resolve, reject } = queuedCommand;
    
    // Mark as processing
    this.processingCommands.set(deviceId, requestId);
    
    const queueOperationId = `queue_process_${deviceId}_${requestId}`;
    profiler.startOperation(queueOperationId, { deviceId, requestId, commandType: command.type });
    
    try {
      // Send the actual command
      profiler.checkpoint('Processing from queue');
      const response = await this.sendCommandImmediate(deviceId, command, requestId);
      profiler.endOperation(queueOperationId, { success: true, status: response.status });
      resolve(response);
    } catch (error) {
      profiler.endOperation(queueOperationId, { success: false, error: String(error) });
      reject(error);
    } finally {
      // Process next command in queue
      this.processingCommands.delete(deviceId);
      this.processCommandQueue(deviceId);
    }
  }

  /**
   * Send a command immediately (used by queue processor)
   */
  private async sendCommandImmediate(deviceId: string, command: ESP32Command, requestId: string): Promise<ESP32Response> {
    profiler.startOperation('send_immediate', { deviceId, requestId });
    
    const device = this.connectedDevices.get(deviceId);
    if (!device) {
      profiler.endOperation('send_immediate', { error: 'device_not_found' });
      throw new Error(`Device ${deviceId} not found`);
    }
    
    profiler.checkpoint('Creating command packet');

    // ESP32 expects microdata HTML, not JSON
    // Convert command to LEDControlCommand object and then to microdata
    // ESP32 supports: 'on', 'off', 'toggle', 'blink', 'status'
    let ledState: string;
    if (command.action === 'blue_on' || command.action === 'on') {
      ledState = 'on';
    } else if (command.action === 'blue_off' || command.action === 'off') {
      ledState = 'off';
    } else if (command.action === 'toggle') {
      ledState = 'toggle';
    } else if (command.action === 'blink') {
      ledState = 'blink';
    } else if (command.action === 'status') {
      ledState = 'status';
    } else {
      // Default to 'off' for unknown actions
      console.warn(`[ESP32ConnectionManager] Unknown LED action: ${command.action}, defaulting to 'off'`);
      ledState = 'off';
    }

    const ledCommand: LEDControlCommand = {
      $type$: 'LEDControlCommand',
      deviceId: deviceId,
      state: ledState,
      timestamp: Date.now(),
      requestId,
      issuer: this.ownPersonId
    };

    // Convert to microdata HTML format
    const microdataHtml = convertToMicrodata(ledCommand);
    debug(`LED Command Microdata: ${microdataHtml.substring(0, 200)}...`);
    debug(`RequestId included: ${requestId}`);

    // Prepare microdata bytes for transmission
    const microdataBytes = new TextEncoder().encode(microdataHtml);
    
    try {
      // ESP32 expects STREAM frames (type 0x08) in PROTECTED packets for LED control
      // We need to send this through QuicVCConnectionManager
      
      // Check if we have an active QUIC-VC connection
      const connection = this.quicVCManager.getConnection?.(deviceId);
      console.log(`[ESP32ConnectionManager] Connection lookup for ${deviceId}:`, {
        found: !!connection,
        state: connection?.state,
        isEstablished: connection?.state === 'established'
      });
      
      if (connection && connection.state === 'established') {
        // Send as STREAM frame through QUIC-VC
        debug(`Sending LED command as QUIC-VC STREAM frame to ${deviceId}`);
        console.log(`[ESP32ConnectionManager] Using QUIC-VC connection for LED command to ${deviceId}`);
        
        // Create STREAM frame with RFC 9000 format:
        // [frame_type(1)][stream_id(varint)][data(N)]
        // Frame type: 0x08 (STREAM)
        // Stream ID: 3 (LED control stream as per ESP32 spec, encoded as varint)
        const frameBuffer = new ArrayBuffer(2 + microdataBytes.length);
        const frame = new Uint8Array(frameBuffer);
        frame[0] = 0x08; // STREAM frame type
        frame[1] = 0x03; // Stream ID 3 as varint (single byte for values < 64)
        frame.set(microdataBytes, 2); // Microdata HTML starts at byte 2
        
        // Send through QuicVCConnectionManager
        await this.quicVCManager.sendProtectedFrame?.(deviceId, frame);
        
        debug(`Sent LED command as QUIC-VC STREAM frame`);
      } else {
        // ERROR: ESP32 firmware only supports long header packets
        // Raw UDP packets use service type headers which ESP32 interprets as invalid short header packets
        console.error(`[ESP32ConnectionManager] No established QUIC-VC connection for ${deviceId} - LED commands require QUIC-VC`);
        console.error(`[ESP32ConnectionManager] Connection state:`, connection ? connection.state : 'no connection');
        
        // Try to wait for connection establishment if it's in progress
        if (connection && connection.state !== 'established') {
          console.log(`[ESP32ConnectionManager] Connection exists but not established (state: ${connection.state}) - waiting for establishment`);
          
          // If connection is in initial or handshake state, wait a bit for it to establish
          if (connection.state === 'initial' || connection.state === 'handshake') {
            console.log(`[ESP32ConnectionManager] Waiting up to 5 seconds for QUIC-VC connection to establish...`);
            
            // Wait for up to 5 seconds for the connection to establish
            const establishedConnection = await this.waitForConnectionEstablishment(deviceId, 5000);
            if (establishedConnection) {
              console.log(`[ESP32ConnectionManager] Connection established! Proceeding with LED command.`);
              // Retry the command now that connection is established
              const frameBuffer = new ArrayBuffer(2 + microdataBytes.length);
              const frame = new Uint8Array(frameBuffer);
              frame[0] = 0x08; // STREAM frame type
              frame[1] = 0x03; // Stream ID 3 as varint
              frame.set(microdataBytes, 2);

              await this.quicVCManager.sendProtectedFrame?.(deviceId, frame);
              debug(`Sent LED command as QUIC-VC STREAM frame after waiting for establishment`);
            } else {
              throw new Error(`Device ${deviceId} QUIC-VC connection failed to establish within 5 seconds. LED control requires established connection.`);
            }
          } else {
            throw new Error(`Device ${deviceId} QUIC-VC connection not established. Current state: ${connection.state}. LED control requires established connection.`);
          }
        } else if (!connection) {
          console.log(`[ESP32ConnectionManager] No QUIC-VC connection found for ${deviceId} - device needs to be paired first`);
          throw new Error(`Device ${deviceId} is not paired or QUIC-VC connection not established. LED control requires established connection.`);
        } else {
          throw new Error(`Device ${deviceId} QUIC-VC connection in unexpected state: ${connection.state}`);
        }
      }
      
      debug(`Command packet sent:`, {
        deviceId,
        address: device.address,
        port: device.port,
        commandType: command.type,
        commandAction: command.action || command.command,
        requestId,
        timestamp: new Date().toISOString(),
        method: connection ? 'QUIC-VC' : 'Raw UDP'
      });
    } catch (error) {
      profiler.endOperation('send_immediate', { sent: false, error: String(error) });
      throw error;
    }
    
    // Set up promise for response
    return new Promise((resolve, reject) => {
      // Set timeout for command response - LED commands should be fast
      const timeout = setTimeout(() => {
        console.warn(`[ESP32ConnectionManager] Command timeout for ${requestId} - no response received`);
        console.warn(`[ESP32ConnectionManager] Note: ESP32 firmware must echo back the requestId in its response`);
        console.warn(`[ESP32ConnectionManager] Expected response format: { "requestId": "${requestId}", "status": "success", "blue_led": "on/off" }`);
        this.pendingCommands.delete(requestId);
        
        // Don't fail the operation - we sent the command successfully
        // The ESP32 may not support responses yet
        resolve({
          type: 'response',
          status: 'sent' as const,
          message: 'Command sent. ESP32 firmware needs update to include requestId in responses.',
          command: command.type,
          timestamp: Date.now(),
          data: {
            deviceId: deviceId,
            command: command.type,
            action: command.action,
            warning: 'ESP32 did not send response with matching requestId'
          }
        });
      }, 3000); // 3 second timeout for LED commands
      
      this.pendingCommands.set(requestId, { resolve, reject, timeout });
      
      // Command already sent above via QUIC-VC or raw UDP
      profiler.endOperation('send_immediate', { sent: true });
      debug(`Command sent to ${deviceId}: ${command.action || command.command || 'unknown'}`);
    });
  }

  /**
   * Handle VC verification success
   * 
   * IMPORTANT: Device ownership is determined by the credential's issuer field.
   * 
   * Proper device provisioning flow:
   * 1. ESP32 starts unclaimed (no owner)
   * 2. User provisions ESP32 by issuing a DeviceIdentityCredential where:
   *    - issuer = user's Person ID (the owner)
   *    - credentialSubject.id = device ID
   * 3. ESP32 stores and presents this credential for authentication
   * 4. Ownership is verified by checking if credential.issuer matches our Person ID
   */
  private async handleVCVerified(verifiedInfo: VerifiedVCInfo): Promise<void> {
    const deviceId = verifiedInfo.subjectDeviceId;
    
    // Check if this is an ESP32 device by looking at the VC subject type
    // The device type should be in the VC, not inferred from the device ID
    
    debug(`ESP32 device ${deviceId} VC verified. Issuer: ${verifiedInfo.issuerPersonId}`);
    
    // Create or update device entry
    const existingDevice = this.connectedDevices.get(deviceId);
    
    // The owner is the issuer of the credential (who provisioned the device)
    // For proper QUICVC model, devices present credentials issued BY their owner
    const ownerPersonId = verifiedInfo.issuerPersonId;
    
    if (existingDevice) {
      // Update existing device entry
      existingDevice.vcInfo = verifiedInfo;
      existingDevice.isAuthenticated = true;
      existingDevice.ownerPersonId = ownerPersonId;
      existingDevice.lastSeen = Date.now();
      existingDevice.capabilities = verifiedInfo.vc.credentialSubject?.capabilities || existingDevice.capabilities;
      debug(`Updated existing device ${deviceId} - isAuthenticated: ${existingDevice.isAuthenticated}`);
      console.log(`[ESP32ConnectionManager] Device ${deviceId} authenticated - address: ${existingDevice.address}:${existingDevice.port}`);
      
      // For ESP32 devices, VC exchange is sufficient for authentication
      // We don't need QUIC connection for basic operations like LED control
      debug(`ESP32 device ${deviceId} authenticated via VC exchange - ready for commands`);
    } else {
      // This shouldn't happen - device should be added via addDiscoveredDevice first
      console.warn(`[ESP32ConnectionManager] Device ${deviceId} not found during VC verification - this is unexpected`);
      console.warn(`[ESP32ConnectionManager] Device should be added via discovery before authentication`);
      
      // Create new device entry with default values - but this is not ideal
      const device: ESP32Device = {
        id: deviceId,
        name: deviceId,
        type: verifiedInfo.vc.credentialSubject?.type || 'ESP32',
        address: '', // We don't have address info here - this is the problem
        port: 49497,
        capabilities: verifiedInfo.vc.credentialSubject?.capabilities || [],
        lastSeen: Date.now(),
        vcInfo: verifiedInfo,
        isAuthenticated: true,
        ownerPersonId: ownerPersonId
      };
      this.connectedDevices.set(deviceId, device);
      debug(`Created new device ${deviceId} - isAuthenticated: ${device.isAuthenticated} (WARNING: no address info)`);
    }
    
    // Get the device reference (either existing or newly created)
    const device = this.connectedDevices.get(deviceId)!;
    
    // Check if we are the owner
    if (ownerPersonId === this.ownPersonId) {
      debug(`We are the owner of ESP32 device ${deviceId}. Full control enabled.`);
      
      // Persist device ownership when we authenticate a device we own
      // This ensures owned devices are recovered after app restart
      try {
        // Use dynamic import to avoid circular dependency
        const { DeviceDiscoveryModel } = await import('../DeviceDiscoveryModel');
        const discoveryModel = DeviceDiscoveryModel.getInstance();
        await discoveryModel.registerDeviceOwner(deviceId, ownerPersonId);
        console.log(`[ESP32ConnectionManager] Persisted ownership for device ${deviceId}`);
      } catch (error) {
        console.error(`[ESP32ConnectionManager] Failed to persist device ownership:`, error);
      }
      
      // For ESP32 devices, we use simple UDP messaging instead of full QUIC
      // The VC exchange has already authenticated the device
      debug(`ESP32 device ${deviceId} ready for UDP-based commands`);
    } else {
      debug(`ESP32 device ${deviceId} is owned by ${ownerPersonId}. Limited access.`);
    }
    
    this.emitDeviceAuthenticated(device);
  }

  /**
   * Handle VC verification failure
   */
  private handleVCVerificationFailed(deviceId: string, reason: string): void {
    // Handle VC verification failure for any device attempting ESP32 authentication
    
    debug(`ESP32 device ${deviceId} VC verification failed: ${reason}`);
    
    // Mark device as not authenticated
    const device = this.connectedDevices.get(deviceId);
    if (device) {
      device.isAuthenticated = false;
      delete device.vcInfo;
    }
  }

  /**
   * Handle unclaimed device response
   */
  private handleDeviceUnclaimed(deviceId: string, message: string): void {
    debug(`Device ${deviceId} is unclaimed: ${message}`);
    debug(`ESP32 device ${deviceId} is unclaimed: ${message}`);
    
    // Update device as discovered but not authenticated
    const device = this.connectedDevices.get(deviceId);
    if (device) {
      device.isAuthenticated = false;
      delete device.vcInfo;
      delete device.ownerPersonId;
    }
    
    // This is not an authentication failure - it means the device is available for claiming
    debug(`Device ${deviceId} is available for ownership claim`);
    
    // Emit event for UI to handle ownership claiming
    this.onDeviceUnclaimed.emit(deviceId, message);
  }

  /**
   * Handle ESP32 command responses (service type 11)
   * These are responses to ownership provisioning and other commands
   */
  private async handleESP32CommandResponse(data: any, rinfo: UdpRemoteInfo): Promise<void> {
    debug(`Received command response from ${rinfo.address}:${rinfo.port}, type:`, typeof data);

    try {
      let jsonStr = '';
      
      // Handle different data types
      // Note: Data is processed directly from QUICVC packets
      if (data instanceof ArrayBuffer) {
        const uint8Array = new Uint8Array(data);
        jsonStr = new TextDecoder().decode(uint8Array);
      } else if (data instanceof Uint8Array) {
        jsonStr = new TextDecoder().decode(data);
      } else if (data && typeof data.toString === 'function' && (data._type === 'BLOB' || data._type === 'CLOB')) {
        jsonStr = data.toString();
      } else {
        console.error('[ESP32ConnectionManager] Unknown data type:', typeof data);
        return;
      }
      
      let message;
      try {
        message = JSON.parse(jsonStr);
        debug(`Parsed command response:`, message);
      } catch (parseError) {
        console.warn('[ESP32ConnectionManager] Failed to parse command response:', {
          from: `${rinfo.address}:${rinfo.port}`,
          error: parseError.message,
          preview: jsonStr.substring(0, 100)
        });
        return;
      }
      
      // Handle provisioning acknowledgment
      if (message.type === 'provisioning_ack') {
        const deviceId = message.device_id || message.deviceId; // Support both field names
        const ownerId = message.owner || message.owner_id; // Support both field names

        debug(`Received provisioning acknowledgment for device ${deviceId}, owner: ${ownerId}`);
        
        // Update device in our connected devices map IMMEDIATELY
        let device = this.connectedDevices.get(deviceId);
        if (!device) {
          // Device might not be in the map yet if this response came quickly
          // Create a basic device entry
          debug(`Device ${deviceId} not in map, creating entry`);
          device = {
            id: deviceId,
            name: deviceId,
            type: 'ESP32',
            address: rinfo.address,
            port: rinfo.port,
            capabilities: [],
            lastSeen: Date.now(),
            isAuthenticated: true,
            ownerPersonId: ownerId as SHA256IdHash<Person>
          };
          this.connectedDevices.set(deviceId, device);
        } else {
          device.ownerPersonId = ownerId as SHA256IdHash<Person>;
          device.isAuthenticated = true;
          debug(`Updated device ${deviceId} with owner ${ownerId}`);
        }
        
        // Emit device authenticated event IMMEDIATELY to trigger UI updates
        this.emitDeviceAuthenticated(device);
        
        // Do discovery model updates in parallel, not blocking the UI update
        Promise.resolve().then(async () => {
          try {
            // Track device activity to reset heartbeat timers
            const discoveryModel = DeviceDiscoveryModel.getInstance();
            if (discoveryModel) {
              // Do these operations in parallel for speed
              await Promise.all([
                discoveryModel.trackDeviceActivity(deviceId, 'provisioning_ack'),
                discoveryModel.registerDeviceOwner(deviceId, ownerId)
              ]);
              
              debug(`Registered device owner in discovery model`);
              
              // The device has just confirmed ownership via provisioning_ack
              if (ownerId === this.ownPersonId) {
                debug(`Device ${deviceId} ownership confirmed via provisioning_ack - already authenticated`);
                // Update discovery model to mark device as authenticated
                discoveryModel.updateDevice(deviceId, {
                  ownerId: ownerId,
                  hasValidCredential: true,
                  isAuthenticated: true
                });
              }
            }
          } catch (error) {
            console.error(`[ESP32ConnectionManager] Error updating discovery model:`, error);
          }
        });
      }
    } catch (error) {
      console.error(`[ESP32ConnectionManager] Error handling command response:`, error);
    }
  }

  /**
   * Handle credential service messages (service type 2)
   */
  private async handleCredentialMessage(data: any, rinfo: UdpRemoteInfo): Promise<void> {
    const msgReceived = Date.now();
    console.log(`[TRACE] ===== handleCredentialMessage CALLED from ${rinfo.address}:${rinfo.port} at ${msgReceived} =====`);
    debug(`[TRACE] Received credential message from ${rinfo.address}:${rinfo.port} at ${msgReceived}`);

    try {
      let jsonStr = '';

      // Handle different data types
      if (data instanceof ArrayBuffer) {
        const uint8Array = new Uint8Array(data);
        jsonStr = new TextDecoder().decode(uint8Array);
      } else if (data instanceof Uint8Array) {
        jsonStr = new TextDecoder().decode(data);
      } else if (data && typeof data.toString === 'function' && (data._type === 'BLOB' || data._type === 'CLOB')) {
        jsonStr = data.toString();
      } else {
        console.error('[ESP32ConnectionManager] Unknown data type:', typeof data);
        return;
      }

      const decodeTime = Date.now();
      console.log(`[TRACE] Decoded message (took ${decodeTime - msgReceived}ms)`);

      let message;
      try {
        message = JSON.parse(jsonStr);
        const parseTime = Date.now();
        console.log(`[TRACE] Parsed credential message (took ${parseTime - decodeTime}ms):`, message.type);
      } catch (parseError) {
        console.warn('[ESP32ConnectionManager] Failed to parse credential message:', parseError);
        return;
      }
      
      // Handle provisioning acknowledgment from ESP32
      if (message.type === 'provisioning_ack') {
        const ackReceived = Date.now();
        const deviceId = message.device_id || message.deviceId;
        const ownerId = message.owner || message.owner_id;

        console.log(`[ESP32ConnectionManager] [ACK] Received provisioning_ack for device ${deviceId}, owner: ${ownerId}`);

        // Update device in our connected devices map IMMEDIATELY
        let device = this.connectedDevices.get(deviceId);
        if (!device) {
          // Device might not be in the map yet if this response came quickly
          // Create a basic device entry
          debug(`Device ${deviceId} not in map, creating entry`);
          device = {
            id: deviceId,
            name: deviceId,
            type: 'ESP32',
            address: rinfo.address,
            port: rinfo.port,
            capabilities: [],
            lastSeen: Date.now(),
            isAuthenticated: true,
            ownerPersonId: ownerId as SHA256IdHash<Person>
          };
          this.connectedDevices.set(deviceId, device);
        } else {
          device.ownerPersonId = ownerId as SHA256IdHash<Person>;
          device.isAuthenticated = true;
          debug(`Updated device ${deviceId} with owner ${ownerId}`);
        }

        console.log(`[ESP32ConnectionManager] [ACK] Device updated, emitting authenticated event (processing took ${Date.now() - ackReceived}ms)`);

        // Emit device authenticated event IMMEDIATELY to trigger UI updates
        this.emitDeviceAuthenticated(device);
        
        // Do discovery model updates in parallel, not blocking the UI update
        Promise.resolve().then(async () => {
          try {
            // Track device activity to reset heartbeat timers
            const discoveryModel = DeviceDiscoveryModel.getInstance();
            if (discoveryModel) {
              // Do these operations in parallel for speed
              await Promise.all([
                discoveryModel.trackDeviceActivity(deviceId, 'provisioning_ack'),
                discoveryModel.registerDeviceOwner(deviceId, ownerId)
              ]);
              
              debug(`Registered device owner in discovery model`);
              
              // The device has just confirmed ownership via provisioning_ack
              if (ownerId === this.ownPersonId) {
                debug(`Device ${deviceId} ownership confirmed via provisioning_ack - already authenticated`);
                // Update discovery model to mark device as authenticated
                discoveryModel.updateDevice(deviceId, {
                  ownerId: ownerId,
                  hasValidCredential: true,
                  isAuthenticated: true
                });
              }
            }
          } catch (error) {
            console.error(`[ESP32ConnectionManager] Error updating discovery model:`, error);
          }
        });
        
        return; // Important: return early to avoid duplicate handling
      }
      
      // Handle ownership removal acknowledgment (DEPRECATED - kept for backward compatibility)
      // NOTE: Current ESP32 firmware does NOT send this ACK
      // We rely on discovery broadcasts with "unclaimed" status as implicit acknowledgment
      if (message.type === 'ownership_remove_ack') {
        const deviceId = message.device_id || message.deviceId;

        console.log(`[ESP32ConnectionManager] Received ownership_remove_ack from ${deviceId} (legacy behavior)`);

        // Update device state
        const device = this.connectedDevices.get(deviceId);
        if (device) {
          device.isAuthenticated = false;
          delete device.ownerPersonId;
          delete device.vcInfo;
        }

        // Notify discovery model
        try {
          // Use dynamic import to avoid circular dependency
          const { DeviceDiscoveryModel } = await import('../DeviceDiscoveryModel');
          const discoveryModel = DeviceDiscoveryModel.getInstance();
          if (discoveryModel) {
            // Track device activity
            discoveryModel.trackDeviceActivity(deviceId, 'ownership_remove_ack');

            // Emit device update to remove ownership from UI
            discoveryModel.updateDevice(deviceId, {
              ownerId: undefined,
              hasValidCredential: false
            });
          }
        } catch (error) {
          console.error('[ESP32ConnectionManager] Error updating discovery model:', error);
        }
      }
    } catch (error) {
      debug('Failed to parse credential message:', error);
      this.onError.emit(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Wait for a QUIC-VC connection to establish for a device
   */
  private async waitForConnectionEstablishment(deviceId: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      // Check periodically if connection is established
      const checkInterval = setInterval(() => {
        const connection = this.quicVCManager.getConnection?.(deviceId);
        
        if (connection && connection.state === 'established') {
          clearInterval(checkInterval);
          resolve(true);
          return;
        }
        
        // Check for timeout
        if (Date.now() - startTime >= timeoutMs) {
          clearInterval(checkInterval);
          console.warn(`[ESP32ConnectionManager] Connection establishment timeout for ${deviceId} after ${timeoutMs}ms`);
          resolve(false);
        }
      }, 100); // Check every 100ms
    });
  }

  /**
   * Handle incoming ESP32 messages (service type 3 - LED control)
   */
  private async handleESP32Message(data: any, rinfo: UdpRemoteInfo): Promise<void> {
    debug(`Received ESP32 message from ${rinfo.address}:${rinfo.port}`);
    
    try {
      let jsonStr = '';
      
      // Handle different data types
      // Note: Data is processed directly from QUICVC packets
      if (data instanceof ArrayBuffer) {
        const uint8Array = new Uint8Array(data);
        jsonStr = new TextDecoder().decode(uint8Array);
      } else if (data instanceof Uint8Array) {
        jsonStr = new TextDecoder().decode(data);
      } else if (data && typeof data.toString === 'function' && (data._type === 'BLOB' || data._type === 'CLOB')) {
        jsonStr = data.toString();
      } else {
        console.error('[ESP32ConnectionManager] Unknown data type:', typeof data);
        return;
      }
      
      let message;
      try {
        message = JSON.parse(jsonStr);
        debug(`Parsed LED response:`, message);
      } catch (parseError) {
        console.error(`[ESP32ConnectionManager] JSON parse error:`, parseError);
        console.error(`[ESP32ConnectionManager] First 200 chars of problematic JSON:`, jsonStr.substring(0, 200));
        // Log hex representation to see if there are hidden characters
        const hexStr = Array.from(new TextEncoder().encode(jsonStr.substring(0, 50)))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(' ');
        console.error(`[ESP32ConnectionManager] Hex of first 50 chars:`, hexStr);
        throw parseError;
      }
      
      // Handle heartbeat/ping from ESP32
      if (message.type === 'heartbeat' || message.type === 'ping') {
        const deviceId = message.device_id || message.deviceId;
        if (deviceId) {
          const device = this.connectedDevices.get(deviceId);
          if (device) {
            // Update lastSeen to keep device alive
            device.lastSeen = Date.now();
            debug(`Received heartbeat from ESP32 device ${deviceId}`);
            
            // Track device activity to reset heartbeat timers
            try {
              const discoveryModel = DeviceDiscoveryModel.getInstance();
              if (discoveryModel) {
                discoveryModel.trackDeviceActivity(deviceId, message.type);
              }
            } catch (error) {
              debug('Error tracking device activity:', error);
            }
          }
        }
        return;
      }
      
      if (message.type === 'led_status' || message.type === 'response' || message.type === 'error') {
        // Handle command response
        // ESP32 sends type:'led_status' for LED commands
        const response = message as ESP32Response;

        // Check if response includes requestId
        const requestId = message.requestId;
        
        if (requestId && this.pendingCommands.has(requestId)) {
          // Handle response with requestId
          const pending = this.pendingCommands.get(requestId)!;
          clearTimeout(pending.timeout);
          this.pendingCommands.delete(requestId);
          
          if (message.status === 'success') {
            // Add the actual response data
            response.status = 'success';
            response.data = {
              blue_led: message.blue_led,
              manual_control: message.manual_control
            };
            
            // Update LED status in discovery model
            if (message.blue_led && message.device_id) {
              try {
                // Use dynamic import to avoid circular dependency
                const { DeviceDiscoveryModel } = await import('../DeviceDiscoveryModel');
                const discoveryModel = DeviceDiscoveryModel.getInstance();
                if (discoveryModel && discoveryModel.updateDeviceLEDStatus) {
                  console.log(`[ESP32ConnectionManager] Updating LED status for ${message.device_id} to ${message.blue_led}`);
                  discoveryModel.updateDeviceLEDStatus(message.device_id, message.blue_led);
                }
              } catch (error) {
                console.error(`[ESP32ConnectionManager] Error updating LED status:`, error);
              }
            }
            
            pending.resolve(response);
          } else if (message.status === 'unauthorized') {
            pending.reject(new Error(`Unauthorized: ${response.message || 'ESP32 rejected command - not owner'}`));
          } else {
            pending.reject(new Error(response.message || 'Command failed'));
          }
        } else if (!requestId && this.pendingCommands.size > 0) {
          // ESP32 firmware doesn't include requestId - try to match by device
          console.warn(`[ESP32ConnectionManager] Received response without requestId from ${rinfo.address}:${rinfo.port}`);
          console.warn(`[ESP32ConnectionManager] Response:`, message);
          
          // Find the first pending command for a device at this address
          // This is a workaround for ESP32 firmware that doesn't echo requestId
          for (const [pendingId, pending] of this.pendingCommands.entries()) {
            // Extract deviceId from the requestId (format: deviceId-timestamp-random)
            const deviceIdFromRequest = pendingId.split('-')[0];
            const device = this.connectedDevices.get(deviceIdFromRequest);
            
            if (device && device.address === rinfo.address) {
              console.log(`[ESP32ConnectionManager] Matching response to pending command ${pendingId} by device address`);
              clearTimeout(pending.timeout);
              this.pendingCommands.delete(pendingId);
              
              if (message.status === 'success' || message.blue_led !== undefined) {
                response.status = 'success';
                response.data = {
                  blue_led: message.blue_led || message.blue_led_status,
                  manual_control: message.manual_control
                };
                pending.resolve(response);
              } else {
                pending.reject(new Error(response.message || 'Command failed'));
              }
              break; // Only match the first pending command
            }
          }
          
          // Find device by address for event emission
          const device = Array.from(this.connectedDevices.values()).find(
            d => d.address === rinfo.address && (d.port === rinfo.port || d.port === 49497)
          );
          
          if (device) {
            // Track device activity and update LED status
            try {
              const discoveryModel = DeviceDiscoveryModel.getInstance();
              if (discoveryModel) {
                discoveryModel.trackDeviceActivity(device.id, 'command_response');
                
                // Update device LED status in discovery model
                if (message.status === 'success' && message.blue_led) {
                  if (discoveryModel.updateDeviceLEDStatus) {
                    discoveryModel.updateDeviceLEDStatus(device.id, message.blue_led);
                    debug(`Updated LED status for ${device.id}: ${message.blue_led}`);
                  }
                }
              }
            } catch (error) {
              console.error(`[ESP32ConnectionManager] Error updating discovery model:`, error);
            }
            
            this.onCommandResponse.emit(device.id, response);
          }
        } else {
          // Fallback: ESP32 doesn't send back requestId, find by device
          console.log(`[ESP32ConnectionManager] No requestId in response, using fallback matching`);
          const device = Array.from(this.connectedDevices.values()).find(
            d => d.address === rinfo.address && (d.port === rinfo.port || d.port === 49497)
          );
          
          if (device) {
            debug(`Found device for response: ${device.id}`);
            
            // Track device activity to reset heartbeat timers
            try {
              const discoveryModel = DeviceDiscoveryModel.getInstance();
              if (discoveryModel) {
                discoveryModel.trackDeviceActivity(device.id, 'command_response_fallback');
              }
            } catch (error) {
              debug('Error tracking device activity:', error);
            }
            
            // Find the first pending command for this device
            console.log(`[ESP32ConnectionManager] Looking for pending commands for device ${device.id}`);
            console.log(`[ESP32ConnectionManager] Pending commands:`, Array.from(this.pendingCommands.keys()));
            for (const [pendingRequestId, pending] of this.pendingCommands) {
              if (pendingRequestId.startsWith(device.id)) {
                console.log(`[ESP32ConnectionManager] Found pending command: ${pendingRequestId}`);
                clearTimeout(pending.timeout);
                this.pendingCommands.delete(pendingRequestId);
                
                if (message.status === 'success') {
                  // Add the actual response data
                  response.status = 'success';
                  response.data = {
                    blue_led: message.blue_led,
                    manual_control: message.manual_control
                  };
                  
                  // Update device LED status in discovery model
                  try {
                    const { DeviceDiscoveryModel } = await import('../DeviceDiscoveryModel');
                    const discoveryModel = DeviceDiscoveryModel.getInstance();
                    if (discoveryModel && discoveryModel.updateDeviceLEDStatus) {
                      console.log(`[ESP32ConnectionManager] Updating LED status for ${device.id} to ${message.blue_led}`);
                      discoveryModel.updateDeviceLEDStatus(device.id, message.blue_led);
                      console.log(`[ESP32ConnectionManager] LED status updated successfully`);
                    }
                  } catch (error) {
                    console.error(`[ESP32ConnectionManager] Error updating LED status in discovery model:`, error);
                  }
                  
                  console.log(`[ESP32ConnectionManager] Resolving command with success response:`, response);
                  pending.resolve(response);
                  console.log(`[ESP32ConnectionManager] Promise resolved successfully`);
                } else if (message.status === 'unauthorized') {
                  console.log(`[ESP32ConnectionManager] Rejecting command as unauthorized`);
                  pending.reject(new Error(`Unauthorized: ${response.message || 'ESP32 rejected command - not owner'}`));
                } else {
                  console.log(`[ESP32ConnectionManager] Rejecting command with error:`, response.message || 'Command failed');
                  pending.reject(new Error(response.message || 'Command failed'));
                }
                
                this.onCommandResponse.emit(device.id, response);
                break;
              }
            }
          } else {
            console.warn(`[ESP32ConnectionManager] Could not find device for response from ${rinfo.address}:${rinfo.port}`);
          }
        }
      } else {
        debug('Unknown ESP32 message type:', message.type);
      }
    } catch (error) {
      debug('Failed to parse ESP32 message:', error);
      this.onError.emit(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Add a discovered device (before authentication)
   */
  public addDiscoveredDevice(deviceId: string, address: string, port: number, name?: string, ownerPersonId?: SHA256IdHash<Person>): void {
    const existingDevice = this.connectedDevices.get(deviceId);
    if (existingDevice) {
      // Update address and port if they changed
      existingDevice.address = address;
      existingDevice.port = port;
      existingDevice.lastSeen = Date.now();
      if (name) existingDevice.name = name;
      // IMPORTANT: Preserve authentication state when updating device info
      // Don't reset isAuthenticated or ownerPersonId if they're already set
      debug(`Updated discovered ESP32 device ${deviceId} at ${address}:${port}, auth=${existingDevice.isAuthenticated}`);
    } else {
      // Create new device entry
      const device: ESP32Device = {
        id: deviceId,
        name: name || deviceId,
        type: 'ESP32',
        address,
        port,
        capabilities: [],
        lastSeen: Date.now(),
        isAuthenticated: false, // Only trust credentials from device
        ownerPersonId: undefined // Don't trust stale ownership data
      };
      this.connectedDevices.set(deviceId, device);
      debug(`Added device ${deviceId} with owner: ${ownerPersonId || 'none'}`);
      debug(`Added discovered ESP32 device ${deviceId} at ${address}:${port}`);
    }
  }

  /**
   * Get connected device info
   */
  public getDevice(deviceId: string): ESP32Device | undefined {
    return this.connectedDevices.get(deviceId);
  }

  /**
   * Get all connected devices
   */
  public getDevices(): ESP32Device[] {
    return Array.from(this.connectedDevices.values());
  }

  /**
   * Check if we own a device
   */
  public isDeviceOwner(deviceId: string): boolean {
    const device = this.connectedDevices.get(deviceId);
    if (!device || !device.ownerPersonId || !this.ownPersonId) {
      return false;
    }
    
    // Direct match
    if (device.ownerPersonId === this.ownPersonId) {
      return true;
    }
    
    // Workaround for ESP32 truncated owner ID (63 chars instead of 64)
    if (device.ownerPersonId.length === 63 && 
        this.ownPersonId.length === 64 &&
        this.ownPersonId.startsWith(device.ownerPersonId)) {
      console.warn(`[ESP32ConnectionManager] Accepting truncated owner ID for device ${deviceId}`);
      return true;
    }
    
    return false;
  }
  
  /**
   * Update device information (used when recreating from heartbeat)
   */
  public updateDevice(deviceId: string, deviceInfo: any): void {
    const existingDevice = this.connectedDevices.get(deviceId);
    const device: ESP32Device = {
      id: deviceId,
      name: deviceInfo.name || existingDevice?.name || deviceId,
      type: 'ESP32',
      address: deviceInfo.address,
      port: deviceInfo.port,
      capabilities: deviceInfo.capabilities || existingDevice?.capabilities || [],
      lastSeen: Date.now(),
      isAuthenticated: existingDevice?.isAuthenticated || false,
      ownerPersonId: deviceInfo.ownerId || existingDevice?.ownerPersonId,
      vcInfo: existingDevice?.vcInfo
    };
    
    this.connectedDevices.set(deviceId, device);
    debug(`Updated device ${deviceId} from heartbeat: ${device.name} at ${device.address}:${device.port}`);
    
    // For ESP32 devices, we maintain the device info but don't need QUIC connection
    if (device.ownerPersonId === this.ownPersonId) {
      debug(`Owned device ${deviceId} info updated from heartbeat`);
    }
  }
  
  /**
   * Update device ownership information
   */
  public updateDeviceOwnership(
    deviceId: string, 
    address: string, 
    port: number, 
    name: string,
    ownerPersonId: SHA256IdHash<Person>
  ): void {
    const device = this.connectedDevices.get(deviceId) || {
      id: deviceId,
      name,
      type: 'ESP32',
      address,
      port,
      capabilities: [],
      lastSeen: Date.now(),
      isAuthenticated: false,
      ownerPersonId
    };
    
    device.address = address;
    device.port = port;
    device.ownerPersonId = ownerPersonId;
    device.lastSeen = Date.now();
    
    this.connectedDevices.set(deviceId, device);
    debug(`Updated device ${deviceId} with owner ${ownerPersonId}`);
  }
  
  /**
   * Check if a device is connected (authenticated and has active QUICVC connection)
   */
  public isDeviceConnected(deviceId: string): boolean {
    const device = this.connectedDevices.get(deviceId);
    if (!device || !device.isAuthenticated) {
      return false;
    }
    
    // For owned devices, check QUICVC connection status
    if (device.ownerPersonId === this.ownPersonId) {
      return this.connectionManager.isConnected(deviceId);
    }
    
    // For non-owned devices, just check authentication status
    return device.isAuthenticated;
  }

  /**
   * Remove a device
   */
  public removeDevice(deviceId: string): void {
    if (this.connectedDevices.delete(deviceId)) {
      // Close QUICVC connection if it exists
      this.connectionManager.closeConnection(deviceId);
      this.onDeviceDisconnected.emit(deviceId);
      debug(`Removed ESP32 device ${deviceId}`);
    }
  }

  // DEPRECATED: Pending ownership removal acknowledgments (no longer used)
  // We now rely on discovery broadcasts with "unclaimed" status as implicit ACK
  // Kept for potential backward compatibility but not actively managed
  private pendingOwnershipRemovals: Map<string, {
    resolve: () => void,
    reject: (error: Error) => void,
    timeout: NodeJS.Timeout
  }> = new Map();

  // Track devices currently being claimed (to prevent discovery broadcasts from overwriting ownership)
  private pendingClaims: Set<string> = new Set();

  // Track devices currently being released (to prevent discovery broadcasts from overwriting ownership)
  private pendingReleases: Set<string> = new Set();

  /**
   * Check if a device is currently being claimed
   * Used by DeviceDiscoveryModel to ignore stale "unclaimed" broadcasts during ownership claim
   */
  public isDeviceBeingClaimed(deviceId: string): boolean {
    return this.pendingClaims.has(deviceId);
  }

  /**
   * Check if a device is currently being released
   * Used by DeviceDiscoveryModel to ignore stale "claimed" broadcasts during ownership release
   */
  public isDeviceBeingReleased(deviceId: string): boolean {
    return this.pendingReleases.has(deviceId);
  }

  /**
   * Release ownership of a device (send ownership removal command and wait for acknowledgment)
   */
  public async releaseDevice(deviceId: string, address?: string, port?: number): Promise<boolean> {
    const device = this.connectedDevices.get(deviceId);

    // Always try to send the removal command if we have address and port
    // This ensures owned devices that haven't authenticated in this session still get the command
    const deviceAddress = device?.address || address;
    const devicePort = device?.port || port || 49497;

    if (!deviceAddress) {
      debug(`Cannot send removal command to ${deviceId} - no address available`);
      // Still remove from local list
      if (device) {
        this.removeDevice(deviceId);
      }
      return false;
    }

    // CRITICAL: Mark device as being released to prevent discovery broadcasts from overwriting ownership
    this.pendingReleases.add(deviceId);
    console.log(`[ESP32ConnectionManager] Added ${deviceId} to pendingReleases - discovery broadcasts will be ignored`);

    try {
      // ESP32 expects a simple JSON command on service type 2 (credential service)
      // Format: { "type": "ownership_remove", "senderPersonId": "<owner_id>" }
      const removalCommand = {
        type: 'ownership_remove',
        senderPersonId: this.ownPersonId,
        deviceId: deviceId,
        timestamp: Date.now()
      };

      debug(`Sending ownership removal command to ${deviceId} at ${deviceAddress}:${devicePort}`);
      console.log(`[ESP32ConnectionManager] Sending ownership_remove command to ${deviceId}:`, removalCommand);

      // Send as service type 2 (credential service) packet
      const jsonStr = JSON.stringify(removalCommand);
      const jsonBytes = new TextEncoder().encode(jsonStr);

      // Create packet with service type prefix
      const packet = new Uint8Array(jsonBytes.length + 1);
      packet[0] = 2; // Service type 2 (credential service)
      packet.set(jsonBytes, 1);

      // Send via transport
      await this.transport.send(
        packet,
        deviceAddress,
        devicePort
      );

      debug(`Ownership removal command sent to ${deviceId}`);
      console.log(`[ESP32ConnectionManager] Sent ownership_remove to ${deviceId} at ${deviceAddress}:${devicePort}`);

      // NOTE: We do NOT wait for an explicit ownership_remove_ack because:
      // 1. ESP32 firmware deliberately does not send ACK to avoid QUIC parsing conflicts
      // 2. The ESP32 sends an immediate discovery broadcast with "unclaimed" status
      // 3. DeviceDiscoveryModel will detect this broadcast and update device state
      // 4. This approach is more reliable as discovery is the source of truth
      console.log(`[ESP32ConnectionManager] Ownership removal sent - device will broadcast unclaimed status`);

      // Close QUIC-VC connection so we can reclaim fresh
      // CRITICAL: Pass address/port to ensure we close the correct connection
      this.quicVCManager.disconnect(deviceId, deviceAddress, devicePort);
      console.log(`[ESP32ConnectionManager] Closed QUIC-VC connection for ${deviceId} at ${deviceAddress}:${devicePort}`);

      // CRITICAL: Remove device from connectedDevices - do not reuse old connections
      // After releasing ownership, we CANNOT trust anything the ESP32 sends
      // Device must go through full authentication/discovery again
      this.removeDevice(deviceId);
      console.log(`[ESP32ConnectionManager] Removed ${deviceId} from connectedDevices - old state cleared`);

      // Keep device in pendingReleases for 2 more seconds to ignore stale discovery broadcasts
      setTimeout(() => {
        this.pendingReleases.delete(deviceId);
        console.log(`[ESP32ConnectionManager] Removed ${deviceId} from pendingReleases - accepting discovery broadcasts again`);
      }, 2000);

      return true;
    } catch (error) {
      debug(`Error releasing device ${deviceId}:`, error);
      console.error(`[ESP32ConnectionManager] Failed to release ${deviceId}:`, error);
      // Even on error, remove from local list - do not trust old state
      this.removeDevice(deviceId);
      // Remove from pendingReleases immediately on error
      this.pendingReleases.delete(deviceId);
      return false;
    }
  }

  /**
   * Restore authentication state from stored devices
   * This should be called after DeviceModel is initialized
   */
  public async restoreAuthenticationState(): Promise<void> {
    try {
      debug('Restoring authentication state from stored devices...');
      
      // Import DeviceModel to avoid circular dependency
      const deviceModel = await import('../../device/DeviceModel');
      const model = deviceModel.default.getInstance();
      
      if (!model.isInitialized()) {
        debug('DeviceModel not initialized, cannot restore authentication state');
        return;
      }
      
      // Get all stored devices
      const devices = await model.getDevices();
      
      for (const device of devices) {
        // Only process ESP32 devices that we own and have valid credentials
        if (device.deviceType === 'ESP32' && 
            device.hasValidCredential && 
            device.owner === this.ownPersonId) {
          
          debug(`Restoring authentication for device ${device.deviceId}`);
          
          // Check if device already exists in our map
          let esp32Device = this.connectedDevices.get(device.deviceId);
          
          if (!esp32Device) {
            // Create new device entry
            esp32Device = {
              id: device.deviceId,
              name: device.name,
              type: 'ESP32',
              address: device.address,
              port: device.port,
              capabilities: device.capabilities || [],
              lastSeen: device.lastSeen,
              isAuthenticated: true, // We own it and it has valid credentials
              ownerPersonId: device.owner
            };
            
            this.connectedDevices.set(device.deviceId, esp32Device);
            debug(`Created authenticated device entry for ${device.deviceId}`);
          } else {
            // Update existing device
            esp32Device.isAuthenticated = true;
            esp32Device.ownerPersonId = device.owner;
            debug(`Updated authentication state for existing device ${device.deviceId}`);
          }
          
          // Emit authentication event
          this.onDeviceAuthenticated.emit(esp32Device);
        }
      }
      
      debug(`Restored authentication state for ${this.connectedDevices.size} devices`);
    } catch (error) {
      debug('Error restoring authentication state:', error);
    }
  }

  /**
   * Shutdown the connection manager
   */
  public async shutdown(): Promise<void> {
    debug('Shutting down ESP32ConnectionManager...');

    // Clear pending commands
    for (const [requestId, pending] of this.pendingCommands) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection manager shutting down'));
    }
    this.pendingCommands.clear();

    // Clear command queues
    for (const [deviceId, queue] of this.commandQueues) {
      for (const queuedCommand of queue) {
        queuedCommand.reject(new Error('Connection manager shutting down'));
      }
    }
    this.commandQueues.clear();
    this.processingCommands.clear();

    // Close all QUICVC connections
    for (const deviceId of this.connectedDevices.keys()) {
      this.connectionManager.closeConnection(deviceId);
    }

    // Clear devices
    this.connectedDevices.clear();

    // Remove service handlers
    this.transport.removeService(3);  // LED control
    this.transport.removeService(11); // Command responses
    this.transport.removeService(2);  // Credential service

    debug('ESP32ConnectionManager shutdown complete');
  }
}