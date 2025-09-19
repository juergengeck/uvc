/**
 * InviteManager
 * 
 * Manages sharing contact information through QR codes and invitation links
 * using the proper one.leute pattern for peer-to-peer connections.
 */

import type { Invitation } from '@refinio/one.models/lib/misc/ConnectionEstablishment/PairingManager.js';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel';
import type { TransportManager } from '../network/TransportManager';

import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import { StateMachine } from '@refinio/one.models/lib/misc/StateMachine.js';
import { TransportType } from '../../types/transport';
import { parseInvitationUrl } from '../../utils/invitation-url-parser';

export class InviteManager extends StateMachine<"Uninitialised" | "Initialised", "shutdown" | "init"> {
  public onUpdated: OEvent<() => void>;

  private leuteModel: LeuteModel;
  private transportManager: TransportManager;

  constructor(leuteModel: LeuteModel, transportManager: TransportManager) {
    super();
    
    this.leuteModel = leuteModel;
    this.transportManager = transportManager;

    // Set up state machine
    this.addState('Uninitialised');
    this.addState('Initialised');
    this.setInitialState('Uninitialised');
    this.addEvent('init');
    this.addEvent('shutdown');
    this.addTransition('init', 'Uninitialised', 'Initialised');
    this.addTransition('shutdown', 'Initialised', 'Uninitialised');

    this.onUpdated = new OEvent<() => void>();
  }

  async init(): Promise<void> {
    this.triggerEvent("init");
  }

  async shutdown(): Promise<void> {
    this.triggerEvent("shutdown");
  }

  /**
   * Generate invitation URL with clean, isolated flow
   * This method creates the invitation URL directly without any intermediate steps
   * that could interfere with clipboard operations.
   */
  async generateCleanInvitationUrl(domainName?: string): Promise<string> {
    console.log('[InviteManager] 🔧 CLEAN GENERATION: Starting isolated invitation URL generation...');
    
    if (!this.transportManager) {
      throw new Error('TransportManager not available');
    }
    
    // Get CommServerManager from TransportManager
    const commServerTransport = this.transportManager.getTransport(TransportType.COMM_SERVER);
    if (!commServerTransport) {
        throw new Error('CommServer transport not available');
    }
    
    console.log('[InviteManager] 🔧 CLEAN GENERATION: Creating raw invitation...');
    // @ts-expect-error - createInvitation is provided by CommServerManager implementation
    const rawInvitation = await commServerTransport.createInvitation();
    
    // 🔍 CRITICAL: Log the actual object structure to see what we're dealing with
    console.log('[InviteManager] 🔍 RAW INVITATION OBJECT ANALYSIS:');
    console.log('  - Type:', typeof rawInvitation);
    console.log('  - Constructor:', rawInvitation?.constructor?.name);
    console.log('  - Keys:', Object.keys(rawInvitation));
    console.log('  - Own property names:', Object.getOwnPropertyNames(rawInvitation));
    console.log('  - Prototype:', Object.getPrototypeOf(rawInvitation));
    console.log('  - JSON stringifiable:', JSON.stringify(rawInvitation));
    
    // 🔧 FORCE PLAIN OBJECT EXTRACTION: Extract values explicitly as strings
    const token = String(rawInvitation.token || '');
    const publicKey = String(rawInvitation.publicKey || '');
    const url = String(rawInvitation.url || '');
    
    console.log('[InviteManager] 🔧 EXTRACTED VALUES:');
    console.log('  - Token type:', typeof token, 'length:', token.length);
    console.log('  - PublicKey type:', typeof publicKey, 'length:', publicKey.length);
    console.log('  - URL type:', typeof url, 'length:', url.length);
    
    // Validate required fields
    if (!token || !publicKey || !url) {
      throw new Error(`Invalid invitation data: missing required fields - token:${!!token} publicKey:${!!publicKey} url:${!!url}`);
    }
    
    console.log('[InviteManager] 🔧 CLEAN GENERATION: Building invitation URL...');
    
    // Create invitation data object as PLAIN object (not from one.models)
    const invitationData = {
      token: token,
      publicKey: publicKey,
      url: url
    };
    
    // 🔍 VERIFY PLAIN OBJECT: Log the plain object we created
    console.log('[InviteManager] 🔍 PLAIN INVITATION DATA:');
    console.log('  - Type:', typeof invitationData);
    console.log('  - Constructor:', invitationData?.constructor?.name);
    console.log('  - Keys:', Object.keys(invitationData));
    console.log('  - JSON:', JSON.stringify(invitationData));
    
    // Serialize and encode the data
    const serializedData = JSON.stringify(invitationData);
    const encodedData = encodeURIComponent(serializedData);
    
    console.log('[InviteManager] 🔍 SERIALIZATION:');
    console.log('  - Serialized length:', serializedData.length);
    console.log('  - Encoded length:', encodedData.length);
    console.log('  - Serialized preview:', serializedData.substring(0, 100));
    
    // Get domain
    const finalDomain = domainName || this.getEddaDomainFromSettings();
    
    // Construct the complete URL as a plain string
    const completeUrl = `https://${finalDomain}/invites/invitePartner/?invited=true/#${encodedData}`;
    
    // 🔍 FINAL URL VERIFICATION: Ensure it's a plain string
    console.log('[InviteManager] 🔧 FINAL URL VERIFICATION:');
    console.log('  - URL type:', typeof completeUrl);
    console.log('  - URL constructor:', completeUrl?.constructor?.name);
    console.log('  - URL length:', completeUrl.length);
    console.log('  - URL preview:', completeUrl.substring(0, 100) + '...');
    
    // Return a guaranteed plain string
    return String(completeUrl);
  }

  /**
   * Generate invitation URL with comprehensive validation
   * Performs strict validation to ensure all required data is available
   */
  async generateInvitationUrl(domainName?: string): Promise<string> {
    console.log('[InviteManager] 🔍 Starting invitation generation with strict validation...');
    
    // 1. Validate TransportManager availability
    if (!this.transportManager) {
      throw new Error('FATAL: TransportManager not available - app not fully initialized');
    }

    // 2. Validate CommServer transport availability
    const commServerTransport = this.transportManager.getTransport(TransportType.COMM_SERVER);
    if (!commServerTransport) {
        throw new Error('FATAL: CommServer transport not available - network layer not initialized');
    }

    // 3. CRITICAL: Comprehensive user identity validation
    await this.validateUserIdentity();

    // 4. CRITICAL: Validate ConnectionsModel and pairing availability
    // @ts-expect-error - getCommServerManager exists on CommServerManager implementation
    const commServerManager = commServerTransport.getCommServerManager();
    if (!commServerManager) {
      throw new Error('FATAL: CommServerManager not available');
    }

    // Access the underlying ConnectionsModel to check pairing
    const connectionsModel = (commServerManager as any).connectionsModel;
    if (!connectionsModel) {
      throw new Error('FATAL: ConnectionsModel not available in CommServerManager');
    }

    if (!connectionsModel.pairing) {
      throw new Error('FATAL: Pairing functionality not available in ConnectionsModel');
    }

    console.log('[InviteManager] ✅ All prerequisites validated, creating invitation...');

    // 5. Create the invitation
    // @ts-expect-error - createInvitation exists on CommServerManager implementation
    const invitation = await commServerTransport.createInvitation();
    
    // 6. CRITICAL: Strict invitation validation
    await this.validateInvitationData(invitation);

    // 7. Build the invitation URL
    const invitationData = {
      token: invitation.token,
      publicKey: invitation.publicKey,
      url: invitation.url
    };

    const serializedData = JSON.stringify(invitationData);
    const encodedData = encodeURIComponent(serializedData);
    const finalDomain = domainName || this.getEddaDomainFromSettings();
    const fullUrl = `https://${finalDomain}/invites/invitePartner/?invited=true/#${encodedData}`;
    
    console.log('[InviteManager] ✅ Generated valid invitation URL:', fullUrl.substring(0, 100) + '...');
    console.log('[InviteManager] 🔍 FULL URL DEBUG:');
    console.log('  - Full URL:', fullUrl);
    console.log('  - URL length:', fullUrl.length);
    console.log('  - Contains edda.one:', fullUrl.includes('edda.one'));
    console.log('  - Contains JSON data:', fullUrl.includes('{'));
    console.log('  - Hash fragment:', fullUrl.split('#')[1]?.substring(0, 50) + '...');
    return fullUrl;
  }

  /**
   * Validate user identity and cryptographic setup
   */
  private async validateUserIdentity(): Promise<void> {
    console.log('[InviteManager] 🔍 Validating user identity...');
    
    try {
      // Check LeuteModel main identity
      const personId = await this.leuteModel.myMainIdentity();
      if (!personId) {
        throw new Error('LeuteModel.myMainIdentity() returned null/undefined');
      }
      
      // Validate person ID format
      if (typeof personId !== 'string' || personId.length === 0) {
        throw new Error(`Invalid person ID format: ${personId}`);
      }
      
      console.log('[InviteManager] ✅ Person ID valid:', personId.substring(0, 16) + '...');
      
      // Import required functions first
      const { getInstanceIdHash, getInstanceName } = await import('@refinio/one.core/lib/instance.js');
      const { getDefaultKeys } = await import('@refinio/one.core/lib/keychain/keychain.js');
      const { getObject } = await import('@refinio/one.core/lib/storage-unversioned-objects.js');
      
      // Validate instance setup
      const instanceId = getInstanceIdHash();
      if (!instanceId) {
        throw new Error('No instance ID available');
      }
      
      const instanceName = getInstanceName();
      if (!instanceName) {
        throw new Error('No instance name available');
      }
      
      console.log('[InviteManager] ✅ Instance validated:', instanceName, 'ID:', instanceId.substring(0, 16) + '...');
      
      // Validate cryptographic keys
      
      const keysHash = await getDefaultKeys(personId);
      if (!keysHash) {
        throw new Error('No default keys available for person ID');
      }
      
      const keys = await getObject(keysHash);
      if (!keys || !keys.publicKey) {
        throw new Error('Invalid keys object - missing public key');
      }
      
      // Validate public key format
      if (keys.publicKey.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(keys.publicKey)) {
        throw new Error(`Invalid public key format: ${keys.publicKey}`);
      }
      
      // SECURITY: Validate private key access through secure keychain (not stored in keys object)
      try {
        const { createCryptoApiFromDefaultKeys } = await import('@refinio/one.core/lib/keychain/keychain.js');
        const cryptoApi = await createCryptoApiFromDefaultKeys(personId);
        if (!cryptoApi) {
          throw new Error('Cannot create crypto API for private key access');
        }
      } catch (error) {
        throw new Error(`Cannot access private key through secure keychain: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      console.log('[InviteManager] ✅ Cryptographic keys validated');
      
    } catch (error) {
      console.error('[InviteManager] ❌ User identity validation failed:', error);
      throw new Error(`FATAL: User identity validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate invitation data structure and format
   */
  private async validateInvitationData(invitation: any): Promise<void> {
    console.log('[InviteManager] 🔍 Validating invitation data...');
    
    if (!invitation) {
      throw new Error('Invitation object is null or undefined');
    }

    const { token, publicKey, url } = invitation;

    if (!token || typeof token !== 'string' || token.length === 0) {
      throw new Error(`Invalid invitation token: ${token}`);
    }

    if (!publicKey || typeof publicKey !== 'string' || publicKey.length === 0) {
      throw new Error(`Invalid invitation public key: ${publicKey}`);
    }

    if (!url || typeof url !== 'string' || !url.startsWith('ws')) {
      throw new Error(`Invalid invitation URL: ${url}`);
    }
    
    console.log('[InviteManager] ✅ Invitation data is valid');
  }

  /**
   * Get edda domain from settings with fallback
   */
  private getEddaDomainFromSettings(): string {
    // In a real app, this would come from a settings service
    // For now, we hardcode the development domain
    console.warn('[InviteManager] ⚠️ Using hardcoded edda.dev.refinio.one domain. Implement settings service.');
    return 'edda.dev.refinio.one';
  }

  /**
   * Create CommServer invitation through TransportManager
   */
  async createCommServerInvitation(): Promise<Invitation> {
    if (!this.transportManager) {
        throw new Error('TransportManager not available');
    }
    const commServerTransport = this.transportManager.getTransport(TransportType.COMM_SERVER);
    if (!commServerTransport) {
        throw new Error('CommServer transport not available');
    }
    // @ts-expect-error - createInvitation exists on CommServerManager implementation
    return await commServerTransport.createInvitation();
  }

  /**
   * Accept invitation from URL
   */
  async acceptInvitationFromUrl(inviteUrl: string): Promise<void> {
    console.log(`[InviteManager] Accepting invitation from URL: ${inviteUrl}`);
    const parsed = parseInvitationUrl(inviteUrl);

    if (parsed.error || !parsed.invitation) {
      const errorMessage = `Failed to parse invitation URL: ${parsed.error || 'No invitation data found'}`;
      console.error(`[InviteManager] ${errorMessage}`);
      throw new Error(errorMessage);
    }
    
    console.log('[InviteManager] ✅ URL parsed successfully. Proceeding to connect.');
    await this.connectUsingInvitation(parsed.invitation);
  }

  /**
   * Connect using invitation data
   */
  async connectUsingInvitation(invitation: Invitation): Promise<void> {
    console.log('[InviteManager] 📞 Connecting using invitation...');
    
    // Validate the invitation object before use
    await this.validateInvitationData(invitation);

    if (!this.transportManager) {
        throw new Error('TransportManager is not initialized, cannot connect.');
    }
    const commServerTransport = this.transportManager.getTransport(TransportType.COMM_SERVER);
    if (!commServerTransport) {
        throw new Error('CommServer transport not available, cannot connect.');
    }

    try {
      // The actual connection logic using the validated invitation
      // @ts-expect-error - connectUsingInvitation exists on CommServerManager implementation
      await commServerTransport.connectUsingInvitation(invitation);
      console.log('[InviteManager] ✅ connectUsingInvitation call succeeded.');
      this.onUpdated.emit();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during connection';
      console.error(`[InviteManager] ❌ Connection failed: ${errorMessage}`);
      // Provide a clearer hint for the common "key mismatch" server error
      if (/key does not match your previous visit/i.test(errorMessage)) {
        throw new Error('This invitation cannot be used because it is tied to a different cryptographic key. Ask your partner to generate a FRESH invitation and try again.');
      }
      // Re-throw the original error for the caller UI otherwise
      throw new Error(`Failed to connect using invitation: ${errorMessage}`);
    }
  }

  /**
   * Generate QR code data
   */
  async generateQrCodeData(): Promise<string> {
    return await this.generateInvitationUrl();
  }

  /**
   * Generate deep link for invitations
   */
  async generateDeepLink(): Promise<string> {
    return await this.generateInvitationUrl();
  }

  /**
   * Generate text invitation
   */
  async generateTextInvite(): Promise<string> {
    const inviteUrl = await this.generateInvitationUrl();
    return `Join me on Lama! Use this link to connect: ${inviteUrl}`;
  }

  /**
   * Generate invite data for QR code
   */
  async generateInviteData(): Promise<string> {
    return await this.generateInvitationUrl();
  }
} 