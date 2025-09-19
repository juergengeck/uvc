/**
 * Type definitions for the multi-transport communication architecture
 */

import type Connection from '@refinio/one.models/lib/misc/Connection/Connection';
import type { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';

/**
 * Available transport types for connections
 */
export enum TransportType {
  /** CommServer transport for internet-based connections */
  COMM_SERVER = 'comm_server',
  /** P2P/UDP transport for local network connections */
  P2P_UDP = 'p2p_udp',
  /** BLE transport for offline/proximity connections */
  BLE_DIRECT = 'ble_direct',
  /** Future transport types can be added here */
}

/**
 * Transport status indicators
 */
export enum TransportStatus {
  /** Transport is not initialized */
  UNINITIALIZED = 'uninitialized',
  /** Transport is initializing */
  INITIALIZING = 'initializing',
  /** Transport is ready for connections */
  READY = 'ready',
  /** Transport is connecting */
  CONNECTING = 'connecting',
  /** Transport is connected and operational */
  CONNECTED = 'connected',
  /** Transport is disconnecting */
  DISCONNECTING = 'disconnecting',
  /** Transport is disconnected */
  DISCONNECTED = 'disconnected',
  /** Transport encountered an error */
  ERROR = 'error',
}

/**
 * Connection target specification
 */
export interface ConnectionTarget {
  /** Target device ID */
  deviceId?: string;
  /** Target person ID */
  personId?: string;
  /** Target instance ID */
  instanceId?: string;
  /** Transport-specific address (URL, IP, MAC, etc.) */
  address?: string;
  /** Additional connection metadata */
  metadata?: Record<string, any>;
}

/**
 * Connection context for transport selection
 */
export interface ConnectionContext {
  /** Connection requires internet access */
  requiresInternet?: boolean;
  /** Connection is on local network */
  isLocalNetwork?: boolean;
  /** Connection is for offline/proximity use */
  isOffline?: boolean;
  /** Required connection reliability level */
  reliability?: 'low' | 'medium' | 'high';
  /** Required latency level */
  latency?: 'low' | 'medium' | 'high';
  /** Required bandwidth */
  bandwidth?: 'low' | 'medium' | 'high';
  /** Connection priority */
  priority?: 'low' | 'medium' | 'high';
}

/**
 * Transport configuration options
 */
export interface TransportConfig {
  /** Transport type */
  type: TransportType;
  /** Transport-specific configuration */
  options: Record<string, any>;
}

/**
 * CommServer transport configuration
 */
export interface CommServerTransportConfig extends TransportConfig {
  type: TransportType.COMM_SERVER;
  options: {
    /** CommServer WebSocket URL */
    commServerUrl: string;
    /** Reconnection interval in milliseconds */
    reconnectInterval?: number;
    /** Maximum reconnection attempts */
    maxReconnectAttempts?: number;
    /** Connection timeout in milliseconds */
    connectionTimeout?: number;
  };
}

/**
 * P2P/UDP transport configuration
 */
export interface P2PTransportConfig extends TransportConfig {
  type: TransportType.P2P_UDP;
  options: {
    /** UDP port for discovery */
    udpPort: number;
    /** Discovery interval in milliseconds */
    discoveryInterval?: number;
    /** Discovery timeout in milliseconds */
    discoveryTimeout?: number;
    /** Local network interface to bind to */
    networkInterface?: string;
  };
}

/**
 * BLE transport configuration
 */
export interface BLETransportConfig extends TransportConfig {
  type: TransportType.BLE_DIRECT;
  options: {
    /** BLE service UUID */
    serviceUUID: string;
    /** BLE characteristic UUID */
    characteristicUUID: string;
    /** BLE scan timeout in milliseconds */
    scanTimeout?: number;
    /** Connection timeout in milliseconds */
    connectionTimeout?: number;
    /** Maximum transmission unit (MTU) for BLE */
    mtu?: number;
  };
}

/**
 * Union type for all transport configurations
 */
export type AnyTransportConfig = CommServerTransportConfig | P2PTransportConfig | BLETransportConfig;

/**
 * Transport interface that all transport implementations must follow
 */
export interface ITransport {
  /** Transport type identifier */
  readonly type: TransportType;
  
  /** Current transport status */
  readonly status: TransportStatus;
  
  /** Transport configuration */
  readonly config: AnyTransportConfig;
  
  // Lifecycle methods
  
  /** Initialize the transport */
  init(): Promise<void>;
  
  /** Connect to a target using this transport */
  connect(target: ConnectionTarget): Promise<Connection>;
  
  /** Disconnect a specific connection */
  disconnect(connectionId: string): Promise<void>;
  
  /** Shutdown the transport */
  shutdown(): Promise<void>;
  
  // Event system
  
  /** Event fired when a connection is established */
  onConnectionEstablished: OEvent<(connection: Connection) => void>;
  
  /** Event fired when a connection is closed */
  onConnectionClosed: OEvent<(connectionId: string, reason?: string) => void>;
  
  /** Event fired when a message is received */
  onMessageReceived: OEvent<(connectionId: string, message: any) => void>;
  
  /** Event fired when an error occurs */
  onError: OEvent<(error: TransportError) => void>;
  
  /** Event fired when transport status changes */
  onStatusChanged: OEvent<(status: TransportStatus) => void>;
  
  // Optional capabilities
  
  /** Check if transport can connect to a specific target */
  canConnectTo?(target: ConnectionTarget): Promise<boolean>;
  
  /** Get transport-specific connection quality metrics */
  getConnectionQuality?(connectionId: string): Promise<ConnectionQuality>;
  
  /** Get transport capabilities */
  getCapabilities?(): TransportCapabilities;
}

/**
 * Transport error information
 */
export interface TransportError {
  /** Error type */
  type: 'connection' | 'transport' | 'protocol' | 'timeout' | 'unknown';
  /** Error message */
  message: string;
  /** Original error object */
  originalError?: Error;
  /** Connection ID if error is connection-specific */
  connectionId?: string;
  /** Additional error context */
  context?: Record<string, any>;
}

/**
 * Connection quality metrics
 */
export interface ConnectionQuality {
  /** Signal strength (0-100) */
  signalStrength?: number;
  /** Latency in milliseconds */
  latency?: number;
  /** Bandwidth in bytes per second */
  bandwidth?: number;
  /** Packet loss percentage (0-100) */
  packetLoss?: number;
  /** Connection stability score (0-100) */
  stability?: number;
}

/**
 * Transport capabilities
 */
export interface TransportCapabilities {
  /** Supports bidirectional communication */
  bidirectional: boolean;
  /** Supports reliable message delivery */
  reliable: boolean;
  /** Supports encryption */
  encrypted: boolean;
  /** Maximum message size in bytes */
  maxMessageSize?: number;
  /** Supports file transfer */
  fileTransfer?: boolean;
  /** Supports offline operation */
  offline?: boolean;
  /** Typical latency range */
  latencyRange?: [number, number];
  /** Typical bandwidth range */
  bandwidthRange?: [number, number];
}

/**
 * Transport selection preferences
 */
export interface TransportPreferences {
  /** Preferred transport types in order */
  preferred: TransportType[];
  /** Fallback transport types */
  fallback: TransportType[];
  /** Connection timeout in milliseconds */
  timeout?: number;
  /** Retry attempts */
  retryAttempts?: number;
  /** Context for transport selection */
  context?: ConnectionContext;
}

/**
 * Transport manager interface
 */
export interface ITransportManager {
  /** Initialize the transport manager */
  init(): Promise<void>;
  
  /** Register a transport implementation */
  registerTransport(transport: ITransport): void;
  
  /** Unregister a transport implementation */
  unregisterTransport(type: TransportType): void;
  
  /** Get all registered transports */
  getTransports(): Map<TransportType, ITransport>;
  
  /** Get a specific transport */
  getTransport(type: TransportType): ITransport | undefined;
  
  /** Initialize all registered transports */
  initAllTransports(): Promise<void>;
  
  /** Shutdown all registered transports */
  shutdownAllTransports(): Promise<void>;
  
  /** Connect to a target using optimal transport */
  connectToDevice(target: ConnectionTarget, preferences?: TransportPreferences): Promise<Connection>;
  
  /** Connect using a specific transport */
  connectViaTransport(type: TransportType, target: ConnectionTarget): Promise<Connection>;
  
  /** Set default transport preferences */
  setTransportPreferences(preferences: TransportPreferences): void;
  
  /** Get current transport preferences */
  getTransportPreferences(): TransportPreferences;
  
  /** Get connection quality for all connections */
  getConnectionQualities(): Promise<Map<string, ConnectionQuality>>;
  
  // Events
  
  /** Event fired when a transport is registered */
  onTransportRegistered: OEvent<(transport: ITransport) => void>;
  
  /** Event fired when a transport is unregistered */
  onTransportUnregistered: OEvent<(type: TransportType) => void>;
  
  /** Event fired when any connection is established */
  onConnectionEstablished: OEvent<(connection: Connection, transport: TransportType) => void>;
  
  /** Event fired when any connection is closed */
  onConnectionClosed: OEvent<(connectionId: string, transport: TransportType, reason?: string) => void>;
  
  /** Event fired when transport selection occurs */
  onTransportSelected: OEvent<(type: TransportType, target: ConnectionTarget) => void>;
}

/**
 * Connection state information
 */
export interface ConnectionState {
  /** Connection ID */
  id: string;
  /** Transport type used for this connection */
  transport: TransportType;
  /** Connection target */
  target: ConnectionTarget;
  /** Connection status */
  status: 'connecting' | 'connected' | 'disconnecting' | 'disconnected';
  /** Connection establishment timestamp */
  establishedAt?: Date;
  /** Last activity timestamp */
  lastActivity?: Date;
  /** Connection quality metrics */
  quality?: ConnectionQuality;
  /** Connection metadata */
  metadata?: Record<string, any>;
}

/**
 * Transport statistics
 */
export interface TransportStats {
  /** Transport type */
  type: TransportType;
  /** Number of active connections */
  activeConnections: number;
  /** Total connections established */
  totalConnections: number;
  /** Total connection failures */
  connectionFailures: number;
  /** Average connection time */
  averageConnectionTime: number;
  /** Total bytes sent */
  bytesSent: number;
  /** Total bytes received */
  bytesReceived: number;
  /** Transport uptime in milliseconds */
  uptime: number;
} 