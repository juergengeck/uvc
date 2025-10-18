/**
 * QUIC Frame Handling
 * RFC 9000 Section 19
 */

import {
  QuicFrameType,
  QuicVCFrameType,
  STREAM_FIN_BIT,
  STREAM_LEN_BIT,
  STREAM_OFF_BIT,
  QuicErrorCode
} from './constants';
import { encodeVarint, decodeVarint, getVarintSize } from './varint';

/**
 * Base frame interface
 */
export interface QuicFrame {
  type: number;
  serialize(): Uint8Array;
}

/**
 * STREAM Frame (RFC 9000 Section 19.8)
 * Format: [type(1)][stream_id(varint)][offset?(varint)][length?(varint)][data]
 */
export interface StreamFrameData {
  streamId: bigint;
  offset?: bigint;
  data: Uint8Array;
  fin?: boolean;
}

export class StreamFrame implements QuicFrame {
  type = QuicFrameType.STREAM;

  constructor(
    public streamId: bigint,
    public data: Uint8Array,
    public offset: bigint = 0n,
    public fin: boolean = false
  ) {}

  serialize(): Uint8Array {
    // Calculate frame type byte with flags
    let frameType = QuicFrameType.STREAM;

    if (this.fin) frameType |= STREAM_FIN_BIT;
    frameType |= STREAM_LEN_BIT; // Always include length
    if (this.offset > 0n) frameType |= STREAM_OFF_BIT;

    // Encode components
    const streamIdBytes = encodeVarint(this.streamId);
    const offsetBytes = this.offset > 0n ? encodeVarint(this.offset) : new Uint8Array(0);
    const lengthBytes = encodeVarint(this.data.length);

    // Calculate total size
    const size = 1 + streamIdBytes.length + offsetBytes.length + lengthBytes.length + this.data.length;
    const frame = new Uint8Array(size);

    let offset = 0;
    frame[offset++] = frameType;
    frame.set(streamIdBytes, offset);
    offset += streamIdBytes.length;

    if (this.offset > 0n) {
      frame.set(offsetBytes, offset);
      offset += offsetBytes.length;
    }

    frame.set(lengthBytes, offset);
    offset += lengthBytes.length;

    frame.set(this.data, offset);

    return frame;
  }

  static parse(buffer: Uint8Array, offset: number = 0): { frame: StreamFrame; bytesRead: number } {
    let pos = offset;
    const frameType = buffer[pos++];

    const hasFin = !!(frameType & STREAM_FIN_BIT);
    const hasLength = !!(frameType & STREAM_LEN_BIT);
    const hasOffset = !!(frameType & STREAM_OFF_BIT);

    const { value: streamId, bytesRead: streamIdBytes } = decodeVarint(buffer, pos);
    pos += streamIdBytes;

    let dataOffset = 0n;
    if (hasOffset) {
      const { value: offset, bytesRead: offsetBytes } = decodeVarint(buffer, pos);
      dataOffset = offset;
      pos += offsetBytes;
    }

    let dataLength: number;
    if (hasLength) {
      const { value: length, bytesRead: lengthBytes } = decodeVarint(buffer, pos);
      dataLength = Number(length);
      pos += lengthBytes;
    } else {
      // Length extends to end of packet
      dataLength = buffer.length - pos;
    }

    const data = buffer.slice(pos, pos + dataLength);
    pos += dataLength;

    return {
      frame: new StreamFrame(streamId, data, dataOffset, hasFin),
      bytesRead: pos - offset
    };
  }
}

/**
 * ACK Frame (RFC 9000 Section 19.3)
 * Simplified version for QUIC-VC
 */
export interface AckRange {
  gap: bigint;
  length: bigint;
}

export class AckFrame implements QuicFrame {
  type = QuicFrameType.ACK;

  constructor(
    public largestAcknowledged: bigint,
    public ackDelay: bigint,
    public firstAckRange: bigint,
    public ackRanges: AckRange[] = []
  ) {}

  serialize(): Uint8Array {
    const largestAckBytes = encodeVarint(this.largestAcknowledged);
    const ackDelayBytes = encodeVarint(this.ackDelay);
    const ackRangeCountBytes = encodeVarint(this.ackRanges.length);
    const firstAckRangeBytes = encodeVarint(this.firstAckRange);

    // Calculate ACK ranges size
    let ackRangesSize = 0;
    const ackRangeBytes: Uint8Array[] = [];
    for (const range of this.ackRanges) {
      const gapBytes = encodeVarint(range.gap);
      const lengthBytes = encodeVarint(range.length);
      ackRangeBytes.push(gapBytes, lengthBytes);
      ackRangesSize += gapBytes.length + lengthBytes.length;
    }

    const size = 1 + largestAckBytes.length + ackDelayBytes.length +
                 ackRangeCountBytes.length + firstAckRangeBytes.length + ackRangesSize;

    const frame = new Uint8Array(size);
    let offset = 0;

    frame[offset++] = QuicFrameType.ACK;
    frame.set(largestAckBytes, offset);
    offset += largestAckBytes.length;
    frame.set(ackDelayBytes, offset);
    offset += ackDelayBytes.length;
    frame.set(ackRangeCountBytes, offset);
    offset += ackRangeCountBytes.length;
    frame.set(firstAckRangeBytes, offset);
    offset += firstAckRangeBytes.length;

    for (const rangeBytes of ackRangeBytes) {
      frame.set(rangeBytes, offset);
      offset += rangeBytes.length;
    }

    return frame;
  }

  static parse(buffer: Uint8Array, offset: number = 0): { frame: AckFrame; bytesRead: number } {
    let pos = offset + 1; // Skip frame type

    const { value: largestAck, bytesRead: largestAckBytes } = decodeVarint(buffer, pos);
    pos += largestAckBytes;

    const { value: ackDelay, bytesRead: ackDelayBytes } = decodeVarint(buffer, pos);
    pos += ackDelayBytes;

    const { value: ackRangeCount, bytesRead: ackRangeCountBytes } = decodeVarint(buffer, pos);
    pos += ackRangeCountBytes;

    const { value: firstAckRange, bytesRead: firstAckRangeBytes } = decodeVarint(buffer, pos);
    pos += firstAckRangeBytes;

    const ackRanges: AckRange[] = [];
    for (let i = 0; i < Number(ackRangeCount); i++) {
      const { value: gap, bytesRead: gapBytes } = decodeVarint(buffer, pos);
      pos += gapBytes;

      const { value: length, bytesRead: lengthBytes } = decodeVarint(buffer, pos);
      pos += lengthBytes;

      ackRanges.push({ gap, length });
    }

    return {
      frame: new AckFrame(largestAck, ackDelay, firstAckRange, ackRanges),
      bytesRead: pos - offset
    };
  }
}

/**
 * CONNECTION_CLOSE Frame (RFC 9000 Section 19.19)
 */
export class ConnectionCloseFrame implements QuicFrame {
  type = QuicFrameType.CONNECTION_CLOSE_QUIC;

  constructor(
    public errorCode: QuicErrorCode | number,
    public frameType: bigint = 0n,
    public reasonPhrase: string = ''
  ) {}

  serialize(): Uint8Array {
    const errorCodeBytes = encodeVarint(this.errorCode);
    const frameTypeBytes = encodeVarint(this.frameType);
    const reasonBytes = new TextEncoder().encode(this.reasonPhrase);
    const reasonLengthBytes = encodeVarint(reasonBytes.length);

    const size = 1 + errorCodeBytes.length + frameTypeBytes.length +
                 reasonLengthBytes.length + reasonBytes.length;

    const frame = new Uint8Array(size);
    let offset = 0;

    frame[offset++] = QuicFrameType.CONNECTION_CLOSE_QUIC;
    frame.set(errorCodeBytes, offset);
    offset += errorCodeBytes.length;
    frame.set(frameTypeBytes, offset);
    offset += frameTypeBytes.length;
    frame.set(reasonLengthBytes, offset);
    offset += reasonLengthBytes.length;
    frame.set(reasonBytes, offset);

    return frame;
  }

  static parse(buffer: Uint8Array, offset: number = 0): { frame: ConnectionCloseFrame; bytesRead: number } {
    let pos = offset + 1; // Skip frame type

    const { value: errorCode, bytesRead: errorCodeBytes } = decodeVarint(buffer, pos);
    pos += errorCodeBytes;

    const { value: frameType, bytesRead: frameTypeBytes } = decodeVarint(buffer, pos);
    pos += frameTypeBytes;

    const { value: reasonLength, bytesRead: reasonLengthBytes } = decodeVarint(buffer, pos);
    pos += reasonLengthBytes;

    const reasonBytes = buffer.slice(pos, pos + Number(reasonLength));
    const reasonPhrase = new TextDecoder().decode(reasonBytes);
    pos += Number(reasonLength);

    return {
      frame: new ConnectionCloseFrame(Number(errorCode), frameType, reasonPhrase),
      bytesRead: pos - offset
    };
  }
}

/**
 * PING Frame (RFC 9000 Section 19.2)
 */
export class PingFrame implements QuicFrame {
  type = QuicFrameType.PING;

  serialize(): Uint8Array {
    return new Uint8Array([QuicFrameType.PING]);
  }

  static parse(buffer: Uint8Array, offset: number = 0): { frame: PingFrame; bytesRead: number } {
    return { frame: new PingFrame(), bytesRead: 1 };
  }
}

/**
 * PADDING Frame (RFC 9000 Section 19.1)
 */
export class PaddingFrame implements QuicFrame {
  type = QuicFrameType.PADDING;

  constructor(public length: number = 1) {}

  serialize(): Uint8Array {
    return new Uint8Array(this.length); // All zeros
  }

  static parse(buffer: Uint8Array, offset: number = 0): { frame: PaddingFrame; bytesRead: number } {
    let length = 0;
    while (offset + length < buffer.length && buffer[offset + length] === 0) {
      length++;
    }
    return { frame: new PaddingFrame(length), bytesRead: length };
  }
}

/**
 * Parse any QUIC frame from buffer
 */
export function parseFrame(buffer: Uint8Array, offset: number = 0): { frame: QuicFrame; bytesRead: number } {
  if (offset >= buffer.length) {
    throw new Error('Buffer too short to parse frame');
  }

  const frameType = buffer[offset];

  // Handle frame types
  if (frameType === QuicFrameType.PADDING) {
    return PaddingFrame.parse(buffer, offset);
  } else if (frameType === QuicFrameType.PING) {
    return PingFrame.parse(buffer, offset);
  } else if (frameType === QuicFrameType.ACK || frameType === QuicFrameType.ACK_ECN) {
    return AckFrame.parse(buffer, offset);
  } else if ((frameType & 0xf8) === QuicFrameType.STREAM) {
    // STREAM frames use bits 0x08-0x0f
    return StreamFrame.parse(buffer, offset);
  } else if (frameType === QuicFrameType.CONNECTION_CLOSE_QUIC || frameType === QuicFrameType.CONNECTION_CLOSE_APP) {
    return ConnectionCloseFrame.parse(buffer, offset);
  }

  throw new Error(`Unsupported frame type: 0x${frameType.toString(16)}`);
}

/**
 * Parse all frames from a packet payload
 */
export function parseFrames(payload: Uint8Array): QuicFrame[] {
  const frames: QuicFrame[] = [];
  let offset = 0;

  while (offset < payload.length) {
    const { frame, bytesRead } = parseFrame(payload, offset);
    frames.push(frame);
    offset += bytesRead;
  }

  return frames;
}
