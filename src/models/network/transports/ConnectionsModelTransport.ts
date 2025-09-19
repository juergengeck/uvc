/**
 * ConnectionsModelTransport - Wraps one.models ConnectionsModel as an ITransport
 * 
 * This transport implementation provides a unified interface for the existing
 * one.models ConnectionsModel, allowing it to be managed by TransportManager
 * alongside other transport types (P2P UDP, BLE, etc.).
 * 
 * ARCHITECTURE: This transport REUSES the ConnectionsModel instance from CommServerManager
 * to prevent duplicate instances and competing registrations on the same comm server.
 */

import type { default as Connection } from '@refinio/one.models/lib/misc/Connection/Connection';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import ConnectionsModel from '@refinio/one.models/lib/models/ConnectionsModel.js';
import LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel.js';
import BlacklistModel from '../../BlacklistModel';
import { connectionLogger } from '../DebugConnectionLogs';

import {
  TransportType,
  TransportStatus,
  type ITransport,
  type ConnectionTarget,
  type TransportError,
  type ConnectionQuality,
  type TransportCapabilities,
  type CommServerTransportConfig
} from '../../../types/transport';

export class ConnectionsModelTransport implements ITransport {
  public readonly type = TransportType.COMM_SERVER;
  public status: TransportStatus = TransportStatus.UNINITIALIZED;
  public config: CommServerTransportConfig;

  // Events
  public readonly onConnectionEstablished = new OEvent<(connection: Connection) => void>();
  public readonly onConnectionClosed = new OEvent<(connectionId: string, reason?: string) => void>();
  public readonly onMessageReceived = new OEvent<(connectionId: string, message: any) => void>();
  public readonly onError = new OEvent<(error: TransportError) => void>();
  public readonly onStatusChanged = new OEvent<(status: TransportStatus) => void>();

  private connectionsModel!: ConnectionsModel;
  private leuteModel: InstanceType<typeof LeuteModel>;
  private blacklistModel: BlacklistModel;
  private isShuttingDown = false;

  constructor(
    leuteModel: InstanceType<typeof LeuteModel>, 
    blacklistModel: BlacklistModel,
    config: CommServerTransportConfig
  ) {
    connectionLogger.log('ConnectionsModelTransport: constructor called');
    this.leuteModel = leuteModel;
    this.blacklistModel = blacklistModel;
    this.config = config;
    
    console.log('[ConnectionsModelTransport] Constructor complete - will reuse CommServerManager ConnectionsModel');
  }

  /**
   * Set the ConnectionsModel instance from CommServerManager
   * This prevents duplicate ConnectionsModel instances competing for the same comm server
   */
  setConnectionsModel(connectionsModel: ConnectionsModel): void {
    connectionLogger.log('[ConnectionsModelTransport] Reusing ConnectionsModel from CommServerManager');
    this.connectionsModel = connectionsModel;
    this.setupEventForwarding();
    this.updateStatus(TransportStatus.CONNECTED);
    connectionLogger.log('[ConnectionsModelTransport] ✅ Configured to reuse existing ConnectionsModel');
  }

  async initialize(): Promise<void> {
    connectionLogger.log('[ConnectionsModelTransport] Initialize called - waiting for ConnectionsModel from CommServerManager');
    
    // Don't create our own ConnectionsModel - wait for it to be set by CommServerManager
    if (!this.connectionsModel) {
      throw new Error('ConnectionsModel not set - call setConnectionsModel() first');
    }
    
    connectionLogger.log('[ConnectionsModelTransport] ✅ Initialized successfully with shared ConnectionsModel');
  }

  // Add missing init method for ITransport interface compatibility
  async init(): Promise<void> {
    return this.initialize();
  }

  /**
   * Connect to a target using ConnectionsModel
   */
  async connect(target: ConnectionTarget): Promise<Connection> {
    connectionLogger.log('[ConnectionsModelTransport] Connecting to target:', target);
    
    if (!this.connectionsModel) {
      throw new Error('ConnectionsModel not initialized');
    }

    try {
      this.status = TransportStatus.CONNECTING;
      this.onStatusChanged.emit(this.status);
      
      connectionLogger.log('[ConnectionsModelTransport] Connecting to target:', target);
      
      if (target.address) {
        // Follow one.leute pattern: just call connectUsingInvitation and let CHUM protocol handle everything
        connectionLogger.log('[ConnectionsModelTransport] Initiating pairing with invitation...');
        await this.connectionsModel.pairing.connectUsingInvitation(target.address as any);
        connectionLogger.log('[ConnectionsModelTransport] ✅ Pairing completed - CHUM protocol handled internally');
        
        this.status = TransportStatus.CONNECTED;
        this.onStatusChanged.emit(this.status);
        
        // Return a minimal connection placeholder - the real connections are handled internally by ConnectionsModel
        const placeholderConnection = {
          id: `chum-connection-${Date.now()}`,
          send: (message: any) => {
            connectionLogger.log('[ConnectionsModelTransport] Placeholder connection send called - this should not be used directly');
            console.warn('[ConnectionsModelTransport] Direct connection.send() called - CHUM protocol should handle messaging internally');
          },
          close: () => {
            connectionLogger.log('[ConnectionsModelTransport] Placeholder connection close called');
          }
        } as unknown as Connection;
        
        connectionLogger.log('[ConnectionsModelTransport] ✅ Connection established - CHUM protocol active');
        return placeholderConnection;
        
      } else {
        throw new Error('No connection address provided in target');
      }
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      connectionLogger.logError('[ConnectionsModelTransport] Connection failed:', {}, err);
      this.status = TransportStatus.ERROR;
      this.onStatusChanged.emit(this.status);
      
      const transportError: TransportError = {
        type: 'connection',
        message: `Connection failed: ${err.message}`,
        originalError: err
      };
      this.onError.emit(transportError);
      
      throw err;
    }
  }

  /**
   * Disconnect a specific connection
   */
  async disconnect(connectionId: string): Promise<void> {
    connectionLogger.log('[ConnectionsModelTransport] Disconnecting connection:', connectionId);
    
    if (!this.connectionsModel) {
      console.warn('[ConnectionsModelTransport] ConnectionsModel not available for disconnect');
      return;
    }

    try {
      // ConnectionsModel handles disconnections internally
      // We emit the event to notify TransportManager
      this.onConnectionClosed.emit(connectionId, 'Requested disconnect');
      
      connectionLogger.log('[ConnectionsModelTransport] ✅ Connection disconnected:', connectionId);
      
    } catch (error) {
      console.error('[ConnectionsModelTransport] Error disconnecting:', error);
      
      const transportError: TransportError = {
        type: 'connection',
        message: `Disconnect failed: ${error instanceof Error ? error.message : String(error)}`,
        originalError: error instanceof Error ? error : new Error(String(error)),
        connectionId
      };
      this.onError.emit(transportError);
    }
  }

  /**
   * Shutdown the transport
   */
  async shutdown(): Promise<void> {
    connectionLogger.log('[ConnectionsModelTransport] Shutting down...');
    this.isShuttingDown = true;
    this.updateStatus(TransportStatus.DISCONNECTING);
      if (this.connectionsModel) {
        await this.connectionsModel.shutdown();
    }
    this.updateStatus(TransportStatus.DISCONNECTED);
    connectionLogger.log('[ConnectionsModelTransport] ✅ Shutdown complete');
  }

  /**
   * Check if transport can connect to a specific target
   */
  async canConnectTo(target: ConnectionTarget): Promise<boolean> {
    // ConnectionsModel can connect to targets with invitation URLs/addresses
    return !!(target.address || target.personId || target.instanceId);
  }

  /**
   * Get transport capabilities
   */
  getCapabilities(): TransportCapabilities {
    return {
      bidirectional: true,
      reliable: true,
      encrypted: true,
      maxMessageSize: 1024 * 1024, // 1MB typical WebSocket limit
      fileTransfer: true,
      offline: false, // Requires internet connection
      latencyRange: [50, 500], // Typical internet latency
      bandwidthRange: [1000, 100000000] // 1KB/s to 100MB/s
    };
  }

  /**
   * Get the ConnectionsModel instance - for TransportManager compatibility
   */
  getConnectionsModel(): ConnectionsModel {
    return this.connectionsModel;
  }

  /**
   * Set up event forwarding from ConnectionsModel to transport events
   */
  private setupEventForwarding(): void {
    if (!this.connectionsModel) {
      connectionLogger.logError('[ConnectionsModelTransport] Cannot setup event forwarding, ConnectionsModel is null', {}, new Error('ConnectionsModel is null'));
      return;
    }

    connectionLogger.log('[ConnectionsModelTransport] 👂 Setting up event forwarding for ConnectionsModel events...');

    if (this.connectionsModel.onOnlineStateChanged) {
        this.connectionsModel.onOnlineStateChanged.listen((isOnline: boolean) => {
            connectionLogger.log(`[ConnectionsModelTransport] ⚡️ EVENT: onOnlineStateChanged -> isOnline: ${isOnline}`);
        });
    }

    if (this.connectionsModel.onConnectionOpened) {
        this.connectionsModel.onConnectionOpened.listen((connection: Connection) => {
            connectionLogger.logConnection(
              '[ConnectionsModelTransport] ⚡️ EVENT: onConnectionOpened',
              connection,
              'Connection opened'
            );
            this.onConnectionEstablished.emit(connection);
        });
    }

    if (this.connectionsModel.onConnectionClosed) {
        this.connectionsModel.onConnectionClosed.listen((connection: Connection) => {
            connectionLogger.logConnection(
              '[ConnectionsModelTransport] ⚡️ EVENT: onConnectionClosed',
              connection,
              'Connection closed'
            );
            this.onConnectionClosed.emit(connection.id.toString(), 'closed by peer');
        });
    }

    // Note: Pairing events are handled by LeuteAccessRightsManager - no duplicate listeners needed
    if (this.connectionsModel.pairing) {
        connectionLogger.log('[ConnectionsModelTransport] 👂 Pairing system found - events handled by LeuteAccessRightsManager');
    } else {
        console.warn('[ConnectionsModelTransport] ⚠️ Pairing system not found on ConnectionsModel.');
    }

    connectionLogger.log('[ConnectionsModelTransport] ✅ Event forwarding setup complete.');
  }

  private updateStatus(newStatus: TransportStatus): void {
    this.status = newStatus;
    this.onStatusChanged.emit(this.status);
  }
} 