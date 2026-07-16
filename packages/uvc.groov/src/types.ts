export type GroovOutputKind = 'digital' | 'analog';

export interface LightState {
  kind: GroovOutputKind;
  enabled: boolean;
  intensity: number;
  rawValue: boolean | number;
  reachable: true;
  ioDevice: string;
  moduleIndex: number;
  channelIndex: number;
  observedAt: string;
}

export interface LightCommand {
  enabled: boolean;
  intensity?: number;
}

export interface LightController {
  readState(): Promise<LightState>;
  setLight(command: LightCommand): Promise<LightState>;
  emergencyOff(): Promise<LightState>;
}

export interface QuicVCConnectionLike {
  state: 'initial' | 'handshake' | 'established' | 'closed';
  peerPersonId: string | null;
  peerPublicKey?: string | null;
  /** Verified by QUICVC/ONE connection establishment; never sourced from mDNS. */
  peerInstanceId?: string | null;
  /** Verified signing key for peerInstanceId; never sourced from mDNS. */
  peerPublicSignKey?: string | null;
  peerSignAlgorithm?: 'ed25519' | 'ecdsa-p256-sha256' | null;
  peerTrustLevel?: string | null;
}

export interface QuicVCStreamServiceMessage {
  connectionId: string;
  deviceId: string;
  streamId: number;
  payload: Uint8Array;
  connection: QuicVCConnectionLike;
  timestamp: number;
}

export type QuicVCStreamServiceHandler = (
  message: QuicVCStreamServiceMessage,
) => void | Promise<void>;

/**
 * Structural subset of connection.core's QuicVCConnectionManager.
 * The real manager can be passed directly without a transport wrapper.
 */
export interface QuicVCStreamHost {
  registerStreamServiceHandler(
    streamId: number,
    handler: QuicVCStreamServiceHandler,
  ): () => void;
  sendStreamData(
    deviceId: string,
    streamId: number,
    data: Uint8Array,
    connectionId?: string,
  ): Promise<void>;
}

export type GroovAuthorityOperation = 'read' | 'write' | 'emergencyOff';

export interface GroovAuthorityAuthorizationRequest {
  operation: GroovAuthorityOperation;
  deviceId: string;
  connectionId: string;
  peerPersonId: string;
  peerTrustLevel: string | null;
}

export interface GroovAuthorityAuthorizationDecision {
  allowed: boolean;
  reason: string;
}

export type GroovAuthorityAuthorizer = (
  request: GroovAuthorityAuthorizationRequest,
) => Promise<GroovAuthorityAuthorizationDecision> | GroovAuthorityAuthorizationDecision;

export interface GroovAuthorityState {
  authority: {
    service: 'uvc-groov-authority';
    authorityId: string;
    role: 'groov-authority';
    healthy: true;
    updatedAt: string;
  };
  light: LightState;
}

export interface GroovAuthorityClientRequestOptions {
  connectionId?: string;
  timeoutMs?: number;
}
