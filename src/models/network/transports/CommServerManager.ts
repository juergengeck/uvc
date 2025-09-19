/**
 * CommServer Transport - Simple wrapper around ConnectionsModel for one.leute compatibility
 * 
 * This class provides a thin transport interface around ConnectionsModel to maintain
 * 100% compatibility with one.leute while allowing additional transports.
 */

import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import type Connection from '@refinio/one.models/lib/misc/Connection/Connection';
import type { Invitation } from '@refinio/one.models/lib/misc/ConnectionEstablishment/PairingManager.js';
import ConnectionsModel from '@refinio/one.models/lib/models/ConnectionsModel.js';
import GroupModel from '@refinio/one.models/lib/models/Leute/GroupModel';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import { TransportType, TransportStatus, type ITransport, type ConnectionTarget, type CommServerTransportConfig } from '../../../types/transport';
import BlacklistModel from '../../BlacklistModel';
import { getLogger } from '../../../utils/logger';

const log = getLogger('CommServerManager');

export default class CommServerManager implements ITransport {
  public readonly type = TransportType.COMM_SERVER;
  public status: TransportStatus = TransportStatus.UNINITIALIZED;
  public readonly config: CommServerTransportConfig;

  public onConnectionEstablished: OEvent<(connection: Connection) => void> = new OEvent();
  public onConnectionClosed: OEvent<(connectionId: string, reason?: string) => void> = new OEvent();
  public onMessageReceived: OEvent<(connectionId: string, message: any) => void> = new OEvent();
  public onError: OEvent<(error: any) => void> = new OEvent();
  public onStatusChanged: OEvent<(status: TransportStatus) => void> = new OEvent();
  
  private connectionsModel!: InstanceType<typeof ConnectionsModel>;
  private blacklistModel!: BlacklistModel;

  constructor(
    private leuteModel: InstanceType<typeof LeuteModel>,
    config: CommServerTransportConfig
  ) {
    this.config = config;
  }

  async init(): Promise<void> {
    // Ensure the Connection constructor is patched *before* any Connection objects are created
    try {
      const { installChumPluginPatch } = await import('../connections/installChumPluginPatch');
      installChumPluginPatch();
    } catch (e) {
      log.warn('[CommServerManager] Could not install ChumPlugin patch – CHUM sync may fail', e);
    }

    if (this.status !== TransportStatus.UNINITIALIZED) {
      log.warn(`Already initialized. Status: ${this.status}`);
      return;
    }

    log.info('🚀 Initializing CommServer transport...');
    this.setStatus(TransportStatus.INITIALIZING);

    try {
      const commServerUrl = this.config.options.commServerUrl;
      if (!commServerUrl) {
        throw new Error('CommServer URL not configured.');
      }

      // ChumPlugin is automatically injected by installChumPluginPatch above
      
      // Create ConnectionsModel exactly like one.leute
      this.connectionsModel = new ConnectionsModel(this.leuteModel, {
          commServerUrl,
          acceptIncomingConnections: true,
          acceptUnknownInstances: true,
          acceptUnknownPersons: false,
          allowPairing: true,
          allowDebugRequests: true,
          pairingTokenExpirationDuration: 60000 * 15, // 15 minutes like one.leute
          establishOutgoingConnections: true,
          incomingConnectionConfigurations: [
            {
              type: 'commserver',
              url: commServerUrl,
              catchAll: true,
            },
          ],
      });

      // Create BlacklistModel exactly like one.leute
      this.blacklistModel = new BlacklistModel();
      const blacklistGroup = await this.leuteModel.createGroup('blacklist');
      const everyoneGroup = await GroupModel.constructFromLatestProfileVersionByGroupName('everyone');
      await this.blacklistModel.init(blacklistGroup, everyoneGroup);
      // Note: Everyone group ID is not needed here since access grants are handled by LeuteAccessRightsManager

      // Set up basic event forwarding for transport interface compatibility
      this.connectionsModel.onConnectionsChange.listen(() => {
        // Forward connection events if needed by transport interface
      });

      this.connectionsModel.onOnlineStateChange.listen((isOnline: boolean) => {
        this.setStatus(isOnline ? TransportStatus.CONNECTED : TransportStatus.DISCONNECTED);
      });

      this.setStatus(TransportStatus.READY);
      log.info('✅ CommServer transport initialized');
    } catch (error) {
      log.error('❌ CommServer transport initialization failed', error);
      this.setStatus(TransportStatus.ERROR);
      this.onError.emit(error);
      throw error;
    }
  }

  async startNetworking(): Promise<void> {
    if (this.status !== TransportStatus.READY) {
      log.warn(`Cannot start networking. Status: ${this.status}`);
      return;
    }

    log.info('🌐 Starting CommServer networking...');
    this.setStatus(TransportStatus.CONNECTING);
    
    try {
      // Initialize ConnectionsModel exactly like one.leute - that's it!
      await this.connectionsModel.init(this.blacklistModel.blacklistGroupModel);

      // NOTE: Access grants are handled by LeuteAccessRightsManager, not here
      // This follows the one.leute pattern where only LeuteAccessRightsManager creates access grants
      // Removing duplicate access grant creation that was breaking CHUM sync
      
      log.info('✅ CommServer networking started');
      // Status will be updated by onOnlineStateChange listener
    } catch (error) {
      log.error('❌ CommServer networking start failed', error);
      this.setStatus(TransportStatus.ERROR);
      this.onError.emit(error);
    }
  }

  public async connect(_target: ConnectionTarget): Promise<Connection> {
    throw new Error('CommServer uses invitation-based pairing, not direct connect.');
  }

  public async disconnect(_connectionId: string): Promise<void> {
    // ConnectionsModel handles this internally
  }

  public async shutdown(): Promise<void> {
    this.setStatus(TransportStatus.DISCONNECTING);
    if (this.connectionsModel) {
      await this.connectionsModel.shutdown();
    }
    this.setStatus(TransportStatus.DISCONNECTED);
    log.info('🛑 CommServer transport shut down');
  }

  private setStatus(status: TransportStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.onStatusChanged.emit(status);
  }

  public getConnectionsModel(): ConnectionsModel {
    return this.connectionsModel;
  }

  public getPairingManager(): any {
    return this.connectionsModel?.pairing;
  }

  /**
   * Create an invitation for pairing with another device
   * Delegates to the underlying ConnectionsModel pairing manager
   */
  public async createInvitation(): Promise<Invitation> {
    if (!this.connectionsModel?.pairing) {
      throw new Error('Pairing manager not available - CommServer transport not properly initialized');
    }
    
    log.info('🔗 Creating invitation');
    return await this.connectionsModel.pairing.createInvitation();
  }

  /**
   * Connect using an invitation for pairing with another device
   * Delegates to the underlying ConnectionsModel pairing manager
   */
  public async connectUsingInvitation(invitation: Invitation) {
    log.info('🔗 Connecting using invitation');
    return await this.connectionsModel.pairing.connectUsingInvitation(invitation);
  }

  /**
   * Return this CommServerManager instance for compatibility
   */
  public getCommServerManager(): CommServerManager {
    return this;
  }
}