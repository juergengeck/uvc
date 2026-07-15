export const GROOV_AUTHORITY_STREAM_ID = 0x42;
export const GROOV_AUTHORITY_FRAME_VERSION = 1;

const HEADER_LENGTH = 8;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export const GroovAuthorityFrameType = {
  GetStateRequest: 1,
  GetStateResponse: 2,
  SetLightRequest: 3,
  SetLightResponse: 4,
  EmergencyOffRequest: 5,
  EmergencyOffResponse: 6,
  StateChangedEvent: 7,
  ErrorResponse: 255,
} as const;

export type GroovAuthorityFrameType =
  typeof GroovAuthorityFrameType[keyof typeof GroovAuthorityFrameType];

export type JsonRecord = Record<string, unknown>;

export interface GroovAuthorityFrame {
  frameType: GroovAuthorityFrameType;
  requestId: string;
  payload: JsonRecord;
}

export class GroovAuthorityProtocolError extends Error {
  constructor(
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'GroovAuthorityProtocolError';
  }
}

export function isGroovAuthorityFrameType(value: number): value is GroovAuthorityFrameType {
  return Object.values(GroovAuthorityFrameType).includes(value as GroovAuthorityFrameType);
}

export function isGroovAuthorityRequestType(frameType: GroovAuthorityFrameType): boolean {
  return frameType === GroovAuthorityFrameType.GetStateRequest
    || frameType === GroovAuthorityFrameType.SetLightRequest
    || frameType === GroovAuthorityFrameType.EmergencyOffRequest;
}

export function encodeGroovAuthorityFrame(
  frameType: GroovAuthorityFrameType,
  requestId: string,
  payload: JsonRecord = {},
): Uint8Array {
  if (!isGroovAuthorityFrameType(frameType)) {
    throw new GroovAuthorityProtocolError(`Unknown frame type ${frameType}`);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new GroovAuthorityProtocolError('Frame payload must be an object');
  }

  const normalizedRequestId = requestId.trim();
  const requestIdBytes = encoder.encode(normalizedRequestId);
  if (requestIdBytes.length === 0 || requestIdBytes.length > 0xffff) {
    throw new GroovAuthorityProtocolError(`Invalid requestId length ${requestIdBytes.length}`);
  }

  const payloadBytes = encoder.encode(JSON.stringify(payload));
  const frame = new Uint8Array(HEADER_LENGTH + requestIdBytes.length + payloadBytes.length);
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  view.setUint8(0, GROOV_AUTHORITY_FRAME_VERSION);
  view.setUint8(1, frameType);
  view.setUint16(2, requestIdBytes.length, false);
  view.setUint32(4, payloadBytes.length, false);
  frame.set(requestIdBytes, HEADER_LENGTH);
  frame.set(payloadBytes, HEADER_LENGTH + requestIdBytes.length);
  return frame;
}

export function decodeGroovAuthorityFrame(bytes: Uint8Array): GroovAuthorityFrame {
  if (bytes.length < HEADER_LENGTH) {
    throw new GroovAuthorityProtocolError('Groov authority frame is too short');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const requestIdLength = view.getUint16(2, false);
  const payloadLength = view.getUint32(4, false);
  const expectedLength = HEADER_LENGTH + requestIdLength + payloadLength;

  let requestId: string | undefined;
  if (requestIdLength > 0 && HEADER_LENGTH + requestIdLength <= bytes.length) {
    try {
      requestId = decoder.decode(bytes.slice(HEADER_LENGTH, HEADER_LENGTH + requestIdLength)).trim();
    } catch {
      throw new GroovAuthorityProtocolError('requestId is not valid UTF-8');
    }
  }

  const version = view.getUint8(0);
  if (version !== GROOV_AUTHORITY_FRAME_VERSION) {
    throw new GroovAuthorityProtocolError(`Unsupported frame version ${version}`, requestId);
  }

  const frameType = view.getUint8(1);
  if (!isGroovAuthorityFrameType(frameType)) {
    throw new GroovAuthorityProtocolError(`Unknown frame type ${frameType}`, requestId);
  }
  if (bytes.length !== expectedLength) {
    throw new GroovAuthorityProtocolError(
      `Invalid frame length ${bytes.length}, expected ${expectedLength}`,
      requestId,
    );
  }
  if (!requestId) {
    throw new GroovAuthorityProtocolError('requestId is required');
  }

  let payload: unknown;
  try {
    const payloadBytes = bytes.slice(HEADER_LENGTH + requestIdLength);
    payload = payloadBytes.length === 0 ? {} : JSON.parse(decoder.decode(payloadBytes));
  } catch {
    throw new GroovAuthorityProtocolError('Frame payload is not valid UTF-8 JSON', requestId);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new GroovAuthorityProtocolError('Frame payload must be an object', requestId);
  }

  return {
    frameType,
    requestId,
    payload: payload as JsonRecord,
  };
}
