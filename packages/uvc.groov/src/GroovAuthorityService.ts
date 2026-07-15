import {
  decodeGroovAuthorityFrame,
  encodeGroovAuthorityFrame,
  GROOV_AUTHORITY_STREAM_ID,
  GroovAuthorityFrameType,
  GroovAuthorityProtocolError,
  isGroovAuthorityRequestType,
  type JsonRecord,
} from './protocol.js';
import type {
  GroovAuthorityAuthorizer,
  GroovAuthorityOperation,
  GroovAuthorityState,
  LightCommand,
  LightController,
  QuicVCStreamHost,
  QuicVCStreamServiceMessage,
} from './types.js';

export interface GroovAuthorityServiceConfig {
  authorityId: string;
}

export class GroovAuthorityService {
  private unregisterHandler: (() => void) | null = null;
  private readonly authorityId: string;

  constructor(
    private readonly quicManager: QuicVCStreamHost,
    private readonly controller: LightController,
    private readonly authorize: GroovAuthorityAuthorizer,
    config: GroovAuthorityServiceConfig,
  ) {
    this.authorityId = config.authorityId.trim();
    if (!this.authorityId) {
      throw new Error('Groov authority id is required');
    }
  }

  start(): void {
    if (this.unregisterHandler) {
      return;
    }
    this.unregisterHandler = this.quicManager.registerStreamServiceHandler(
      GROOV_AUTHORITY_STREAM_ID,
      (message) => this.handleMessage(message),
    );
  }

  stop(): void {
    this.unregisterHandler?.();
    this.unregisterHandler = null;
  }

  get active(): boolean {
    return this.unregisterHandler !== null;
  }

  private async handleMessage(message: QuicVCStreamServiceMessage): Promise<void> {
    let requestId = 'protocol';
    try {
      const frame = decodeGroovAuthorityFrame(message.payload);
      requestId = frame.requestId;
      if (!isGroovAuthorityRequestType(frame.frameType)) {
        throw new GroovAuthorityProtocolError(
          `Frame type ${frame.frameType} is not a request`,
          frame.requestId,
        );
      }

      switch (frame.frameType) {
        case GroovAuthorityFrameType.GetStateRequest: {
          await this.requireAuthorized(message, 'read');
          const state = await this.readAuthorityState();
          await this.send(message, GroovAuthorityFrameType.GetStateResponse, requestId, { state });
          return;
        }
        case GroovAuthorityFrameType.SetLightRequest: {
          await this.requireAuthorized(message, 'write');
          const command = parseLightCommand(frame.payload);
          const light = await this.controller.setLight(command);
          const state = this.wrapState(light);
          await this.send(message, GroovAuthorityFrameType.SetLightResponse, requestId, { state });
          return;
        }
        case GroovAuthorityFrameType.EmergencyOffRequest: {
          await this.requireAuthorized(message, 'emergencyOff');
          const light = await this.controller.emergencyOff();
          const state = this.wrapState(light);
          await this.send(message, GroovAuthorityFrameType.EmergencyOffResponse, requestId, { state });
          return;
        }
        default:
          throw new GroovAuthorityProtocolError(`Unsupported request frame ${frame.frameType}`, requestId);
      }
    } catch (error) {
      if (error instanceof GroovAuthorityProtocolError && error.requestId) {
        requestId = error.requestId;
      }
      await this.sendError(message, requestId, error);
    }
  }

  private async requireAuthorized(
    message: QuicVCStreamServiceMessage,
    operation: GroovAuthorityOperation,
  ): Promise<void> {
    if (message.connection.state !== 'established') {
      throw new AuthorityAccessError('connection_not_established', 'QUICVC connection is not established');
    }
    const peerPersonId = message.connection.peerPersonId;
    if (typeof peerPersonId !== 'string' || peerPersonId.trim().length === 0) {
      throw new AuthorityAccessError('peer_identity_missing', 'QUICVC peer identity is missing');
    }

    const decision = await this.authorize({
      operation,
      deviceId: message.deviceId,
      connectionId: message.connectionId,
      peerPersonId,
      peerTrustLevel: message.connection.peerTrustLevel ?? null,
    });
    if (!decision.allowed) {
      throw new AuthorityAccessError('authorization_denied', decision.reason);
    }
  }

  private async readAuthorityState(): Promise<GroovAuthorityState> {
    return this.wrapState(await this.controller.readState());
  }

  private wrapState(light: Awaited<ReturnType<LightController['readState']>>): GroovAuthorityState {
    return {
      authority: {
        service: 'uvc-groov-authority',
        authorityId: this.authorityId,
        role: 'groov-authority',
        healthy: true,
        updatedAt: light.observedAt,
      },
      light,
    };
  }

  private async send(
    message: QuicVCStreamServiceMessage,
    frameType: GroovAuthorityFrameType,
    requestId: string,
    payload: JsonRecord,
  ): Promise<void> {
    await this.quicManager.sendStreamData(
      message.deviceId,
      GROOV_AUTHORITY_STREAM_ID,
      encodeGroovAuthorityFrame(frameType, requestId, payload),
      message.connectionId,
    );
  }

  private async sendError(
    message: QuicVCStreamServiceMessage,
    requestId: string,
    error: unknown,
  ): Promise<void> {
    const normalized = normalizeError(error);
    await this.send(message, GroovAuthorityFrameType.ErrorResponse, requestId, normalized);
  }
}

class AuthorityAccessError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuthorityAccessError';
  }
}

function parseLightCommand(payload: JsonRecord): LightCommand {
  if (typeof payload.enabled !== 'boolean') {
    throw new GroovAuthorityProtocolError('SetLightRequest payload.enabled must be a boolean');
  }
  if (
    payload.intensity !== undefined
    && (
      typeof payload.intensity !== 'number'
      || !Number.isFinite(payload.intensity)
      || payload.intensity < 0
      || payload.intensity > 1
    )
  ) {
    throw new GroovAuthorityProtocolError(
      'SetLightRequest payload.intensity must be a finite number between 0 and 1',
    );
  }
  return {
    enabled: payload.enabled,
    ...(typeof payload.intensity === 'number' ? { intensity: payload.intensity } : {}),
  };
}

function normalizeError(error: unknown): JsonRecord {
  if (error instanceof AuthorityAccessError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof GroovAuthorityProtocolError) {
    return { code: 'protocol_error', message: error.message };
  }
  if (error instanceof Error) {
    return { code: 'operation_failed', message: error.message };
  }
  return { code: 'operation_failed', message: String(error) };
}
