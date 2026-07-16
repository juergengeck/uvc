import {
  decodeGroovAuthorityFrame,
  encodeGroovAuthorityFrame,
  GROOV_AUTHORITY_STREAM_ID,
  GroovAuthorityFrameType,
  GroovAuthorityProtocolError,
  type JsonRecord,
} from './protocol.js';
import type {
  GroovAuthorityClientRequestOptions,
  GroovAuthorityState,
  LightCommand,
  QuicVCStreamHost,
  QuicVCStreamServiceMessage,
} from './types.js';

interface PendingRequest {
  deviceId: string;
  connectionId?: string;
  expectedType: GroovAuthorityFrameType;
  resolve: (state: GroovAuthorityState) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export interface GroovAuthorityClientConfig {
  defaultTimeoutMs?: number;
  createRequestId?: () => string;
}

/**
 * Correlated client for the Groov authority application stream.
 *
 * A successful operation always contains state observed by the Groov authority;
 * command dispatch without a correlated response is rejected.
 */
export class GroovAuthorityClient {
  private unregisterHandler: (() => void) | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly defaultTimeoutMs: number;
  private readonly createRequestId: () => string;
  private requestSequence = 0;

  constructor(
    private readonly quicManager: QuicVCStreamHost,
    config: GroovAuthorityClientConfig = {},
  ) {
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 5_000;
    if (!Number.isFinite(this.defaultTimeoutMs) || this.defaultTimeoutMs <= 0) {
      throw new Error('Groov authority client timeout must be a positive finite number');
    }
    this.createRequestId = config.createRequestId ?? (() => {
      this.requestSequence += 1;
      return `groov-${Date.now()}-${this.requestSequence}`;
    });
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
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error('Groov authority client stopped'));
    }
    this.pending.clear();
  }

  readState(
    deviceId: string,
    options: GroovAuthorityClientRequestOptions = {},
  ): Promise<GroovAuthorityState> {
    return this.request(
      deviceId,
      GroovAuthorityFrameType.GetStateRequest,
      GroovAuthorityFrameType.GetStateResponse,
      {},
      options,
    );
  }

  setLight(
    deviceId: string,
    command: LightCommand,
    options: GroovAuthorityClientRequestOptions = {},
  ): Promise<GroovAuthorityState> {
    return this.request(
      deviceId,
      GroovAuthorityFrameType.SetLightRequest,
      GroovAuthorityFrameType.SetLightResponse,
      command as unknown as JsonRecord,
      options,
    );
  }

  emergencyOff(
    deviceId: string,
    options: GroovAuthorityClientRequestOptions = {},
  ): Promise<GroovAuthorityState> {
    return this.request(
      deviceId,
      GroovAuthorityFrameType.EmergencyOffRequest,
      GroovAuthorityFrameType.EmergencyOffResponse,
      {},
      options,
    );
  }

  private async request(
    deviceId: string,
    requestType: GroovAuthorityFrameType,
    expectedType: GroovAuthorityFrameType,
    payload: JsonRecord,
    options: GroovAuthorityClientRequestOptions,
  ): Promise<GroovAuthorityState> {
    this.start();
    const normalizedDeviceId = deviceId.trim();
    if (!normalizedDeviceId) {
      throw new Error('Groov authority device id is required');
    }
    const requestId = this.createRequestId().trim();
    if (!requestId || this.pending.has(requestId)) {
      throw new Error(`Groov authority request id is ${requestId ? 'not unique' : 'empty'}`);
    }
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error('Groov authority request timeout must be a positive finite number');
    }

    const response = new Promise<GroovAuthorityState>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Groov authority request ${requestId} timed out without observed state`));
      }, timeoutMs);
      this.pending.set(requestId, {
        deviceId: normalizedDeviceId,
        ...(options.connectionId ? { connectionId: options.connectionId } : {}),
        expectedType,
        resolve,
        reject,
        timeout,
      });
    });

    try {
      await this.quicManager.sendStreamData(
        normalizedDeviceId,
        GROOV_AUTHORITY_STREAM_ID,
        encodeGroovAuthorityFrame(requestType, requestId, payload),
        options.connectionId,
      );
    } catch (error) {
      const pending = this.pending.get(requestId);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pending.delete(requestId);
        pending.reject(normalizeClientError(error));
      }
    }
    return response;
  }

  private handleMessage(message: QuicVCStreamServiceMessage): void {
    let frame;
    try {
      frame = decodeGroovAuthorityFrame(message.payload);
    } catch {
      return;
    }
    const pending = this.pending.get(frame.requestId);
    if (!pending || pending.deviceId !== message.deviceId) {
      return;
    }
    if (pending.connectionId && pending.connectionId !== message.connectionId) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(frame.requestId);
    if (frame.frameType === GroovAuthorityFrameType.ErrorResponse) {
      const code = typeof frame.payload.code === 'string' ? frame.payload.code : 'operation_failed';
      const detail = typeof frame.payload.message === 'string' ? frame.payload.message : 'Groov authority rejected the operation';
      pending.reject(new GroovAuthorityProtocolError(`${code}: ${detail}`, frame.requestId));
      return;
    }
    if (frame.frameType !== pending.expectedType) {
      pending.reject(new GroovAuthorityProtocolError(
        `Unexpected response frame ${frame.frameType}; expected ${pending.expectedType}`,
        frame.requestId,
      ));
      return;
    }
    try {
      pending.resolve(parseAuthorityState(frame.payload));
    } catch (error) {
      pending.reject(normalizeClientError(error));
    }
  }
}

function parseAuthorityState(payload: JsonRecord): GroovAuthorityState {
  const state = payload.state;
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new GroovAuthorityProtocolError('Groov authority response is missing state');
  }
  const candidate = state as unknown as GroovAuthorityState;
  if (
    candidate.authority?.service !== 'uvc-groov-authority'
    || candidate.authority.healthy !== true
    || typeof candidate.authority.authorityId !== 'string'
    || typeof candidate.authority.updatedAt !== 'string'
    || !candidate.light
    || typeof candidate.light.enabled !== 'boolean'
    || typeof candidate.light.intensity !== 'number'
    || candidate.light.reachable !== true
    || typeof candidate.light.observedAt !== 'string'
  ) {
    throw new GroovAuthorityProtocolError('Groov authority response contains invalid observed state');
  }
  return candidate;
}

function normalizeClientError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
