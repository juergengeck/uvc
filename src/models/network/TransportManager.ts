/**
 * TransportManager - Simple container for multiple transport types
 * CommServerManager, QuicTransport, BLETransport, etc. register themselves here
 */

import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import { TransportType } from '../../types/transport';
import type { ITransportManager, ITransport, ConnectionTarget, TransportPreferences } from '../../types/transport';
import type Connection from '@refinio/one.models/lib/misc/Connection/Connection';
import CommServerManager from './transports/CommServerManager';
import ChannelManager from '@refinio/one.models/lib/models/ChannelManager.js';
import LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import { getLogger } from '../../utils/logger';

const log = getLogger('TransportManager');

export class TransportManager implements ITransportManager {
  private static instance: TransportManager | null = null;
  private transports: Map<TransportType, ITransport> = new Map();
  private commServerManager!: CommServerManager;

  // Events
  public readonly onTransportRegistered = new OEvent<(transport: ITransport) => void>();
  public readonly onTransportUnregistered = new OEvent<(type: TransportType) => void>();
  public readonly onConnectionEstablished = new OEvent<(connection: Connection, transport: TransportType) => void>();
  public readonly onConnectionClosed = new OEvent<(connectionId: string, transport: TransportType, reason?: string) => void>();
  public readonly onTransportSelected = new OEvent<(type: TransportType, target: ConnectionTarget) => void>();

  constructor(
    private leuteModel: InstanceType<typeof LeuteModel>,
    channelManager: InstanceType<typeof ChannelManager>,
    private commServerUrl: string
  ) {
    log.info('🏗️ Creating transport manager...');
    
    // Create CommServerManager with proper config, passing models in constructor
    this.commServerManager = new CommServerManager(
      this.leuteModel,
      {
        type: TransportType.COMM_SERVER,
        options: {
          commServerUrl: this.commServerUrl,
          reconnectInterval: 5000,
          maxReconnectAttempts: 10,
          connectionTimeout: 30000
        }
      }
    );
    
    log.info('✅ Transport manager created');
  }

  async init(): Promise<void> {
    log.info('🚀 Initializing transport manager...');
    
    try {
      // Initialize CommServerManager first (now with no arguments)
      await this.commServerManager.init();
      
      // Register it as a transport
      this.registerTransport(this.commServerManager);
      
      log.info('✅ Transport manager initialized');
    } catch (error) {
      log.error('❌ Transport manager initialization failed', error);
      throw error;
    }
  }

  async startNetworking(): Promise<void> {
    log.info('🏁 Starting networking layer in TransportManager...');
    try {
      if (this.commServerManager) {
        await this.commServerManager.startNetworking();
        log.info('✅ CommServerManager networking started.');
      } else {
        log.warn('⚠️ CommServerManager not available to start networking.');
      }
    } catch (error) {
      log.error('❌ Failed to start networking layer', error);
      throw error;
    }
  }

  registerTransport(transport: ITransport): void {
    if (this.transports.has(transport.type)) {
      log.warn(`📡 Transport type ${transport.type} is already registered. Overwriting.`);
    }
    
    log.info(`📡 Registering transport: ${transport.type}`);
    this.transports.set(transport.type, transport);
    
    // Set up event forwarding
    if (transport.onConnectionEstablished) {
      transport.onConnectionEstablished.listen((connection: any) => {
        this.onConnectionEstablished.emit(connection, transport.type);
      });
    }
    
    if (transport.onConnectionClosed) {
      transport.onConnectionClosed.listen((connectionId: string, reason?: string) => {
        this.onConnectionClosed.emit(connectionId, transport.type, reason);
      });
    }
    
    this.onTransportRegistered.emit(transport);
    log.info(`✅ Transport registered: ${transport.type}`);
  }

  unregisterTransport(type: TransportType): void {
    const transport = this.transports.get(type);
    if (transport) {
      this.transports.delete(type);
      this.onTransportUnregistered.emit(type);
      log.info(`📡 Transport unregistered: ${type}`);
    }
  }

  getTransports(): Map<TransportType, ITransport> {
    return new Map(this.transports);
  }

  getTransport(type: TransportType): ITransport | undefined {
    return this.transports.get(type);
  }

  async initAllTransports(): Promise<void> {
    // Already handled in init()
  }

  async shutdownAllTransports(): Promise<void> {
    log.info('🛑 Shutting down all transports...');
    
    for (const [type, transport] of Array.from(this.transports)) {
      try {
        log.info(`🛑 Shutting down transport: ${type}`);
        await transport.shutdown();
      } catch (error) {
        log.error(`❌ Error shutting down transport ${type}:`, error);
      }
    }
    
    this.transports.clear();
    log.info('✅ All transports shut down');
  }

  async connectToDevice(target: ConnectionTarget, preferences?: TransportPreferences): Promise<Connection> {
    // Use CommServer transport by default
    const transport = this.getTransport(TransportType.COMM_SERVER);
    if (!transport) {
      throw new Error('No CommServer transport available');
    }
    
    this.onTransportSelected.emit(TransportType.COMM_SERVER, target);
    return transport.connect(target);
  }

  async connectViaTransport(type: TransportType, target: ConnectionTarget): Promise<Connection> {
    const transport = this.getTransport(type);
    if (!transport) {
      throw new Error(`Transport ${type} not available`);
    }
    
    this.onTransportSelected.emit(type, target);
    return transport.connect(target);
  }

  setTransportPreferences(preferences: TransportPreferences): void {
    // Store preferences for future use
  }

  getTransportPreferences(): TransportPreferences {
    return {
      preferred: [TransportType.COMM_SERVER],
      fallback: [],
      timeout: 30000,
      retryAttempts: 3
    };
  }

  async getConnectionQualities(): Promise<Map<string, any>> {
    return new Map();
  }

  // Convenience methods
  getCommServerManager(): CommServerManager {
    return this.commServerManager;
  }

  getConnectionsModel(): any { // Changed from ConnectionsModel to any as ConnectionsModel is removed
    if (!this.commServerManager) {
      throw new Error('CommServerManager not initialized');
    }
    return this.commServerManager.getConnectionsModel();
  }

  /**
   * Convenience helper used by higher-level features (e.g. ChatModel) to inspect the
   * currently established connections without having to access the full
   * ConnectionsModel API. The underlying one.models implementation already provides
   * a `connectionsInfo()` method that returns an array of connection/route objects.
   * We simply proxy that here so call-sites stay decoupled from the exact network
   * stack implementation.
   */
  async getActiveConnections(): Promise<any[]> {
    try {
      const cm = this.getConnectionsModel();
      if (cm && typeof cm.connectionsInfo === 'function') {
        // No filter – return all connection infos
        return cm.connectionsInfo();
      }
    } catch (err) {
      // Swallow errors here – callers will handle empty result gracefully
      log.warn('⚠️ TransportManager.getActiveConnections(): failed to retrieve connections info', err);
    }
    return [];
  }

  /**
   * Request a connection to a specific person ID
   * This will attempt to establish a connection through available transports
   */
  async requestConnection(personId: string): Promise<void> {
    try {
      log.info(`📡 Requesting connection to person ${personId.substring(0, 8)}...`);

      // Get the ConnectionsModel to establish connection
      const cm = this.getConnectionsModel();
      if (!cm) {
        throw new Error('ConnectionsModel not available');
      }

      // Check if we already have a connection
      const existingConnections = await this.getActiveConnections();
      const hasConnection = existingConnections.some(conn =>
        conn.remotePersonId === personId ||
        conn.targetPersonId === personId
      );

      if (hasConnection) {
        log.info(`✅ Connection already exists to ${personId.substring(0, 8)}`);
        return;
      }

      // Try to get the Someone object for this person
      const someone = await this.leuteModel.getSomeone(personId);
      if (!someone) {
        log.warn(`⚠️ No Someone object found for ${personId.substring(0, 8)} - cannot establish connection`);
        return;
      }

      // Get the main profile to access connection endpoints
      const profile = await someone.mainProfile();
      if (!profile || !profile.instanceEndpoints || profile.instanceEndpoints.length === 0) {
        log.warn(`⚠️ No instance endpoints found for ${personId.substring(0, 8)}`);
        return;
      }

      // Attempt to connect using the available endpoints
      for (const endpoint of profile.instanceEndpoints) {
        try {
          log.info(`🔌 Attempting connection to ${personId.substring(0, 8)} via ${endpoint.url}`);
          // ConnectionsModel will handle the actual connection establishment
          // through the CommServer based on the endpoint information

          // Note: The actual connection is established automatically by ConnectionsModel
          // when messages need to be sent. We just ensure the Someone object is available.
          log.info(`✅ Connection setup initiated for ${personId.substring(0, 8)}`);
          break;
        } catch (endpointError) {
          log.warn(`⚠️ Failed to connect via endpoint ${endpoint.url}:`, endpointError);
        }
      }
    } catch (error) {
      log.error(`❌ Failed to request connection to ${personId.substring(0, 8)}:`, error);
      throw error;
    }
  }

  static getInstance(): TransportManager | null {
    return TransportManager.instance;
  }

  static setInstance(instance: TransportManager): void {
    TransportManager.instance = instance;
  }
}
