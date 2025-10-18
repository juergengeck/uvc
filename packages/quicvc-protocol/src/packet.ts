/**
 * QUIC Packet Header Handling
 * RFC 9000 Section 17
 */

import {
  QUIC_VERSION_1,
  QuicPacketType,
  LONG_HEADER_BIT,
  FIXED_BIT,
  PACKET_NUMBER_LENGTH_MASK,
  MAX_CONNECTION_ID_LENGTH,
  DEFAULT_CONNECTION_ID_LENGTH
} from './constants';
import { encodeVarint, decodeVarint } from './varint';

export interface QuicLongHeader {
  type: 'long';
  packetType: QuicPacketType;
  version: number;
  dcid: Uint8Array;
  scid: Uint8Array;
  token?: Uint8Array;  // Only for INITIAL packets
  packetNumber: bigint;
  packetNumberLength: number; // 1-4 bytes
}

export interface QuicShortHeader {
  type: 'short';
  dcid: Uint8Array;
  packetNumber: bigint;
  packetNumberLength: number; // 1-4 bytes
  spinBit?: boolean;
  keyPhase?: boolean;
}

export type QuicHeader = QuicLongHeader | QuicShortHeader;

/**
 * Build a QUIC long header packet
 */
export function buildLongHeaderPacket(
  header: QuicLongHeader,
  payload: Uint8Array
): Uint8Array {
  const packetNumberBytes = encodePacketNumber(header.packetNumber, header.packetNumberLength);

  // Calculate sizes
  const dcidLength = header.dcid.length;
  const scidLength = header.scid.length;

  if (dcidLength > MAX_CONNECTION_ID_LENGTH || scidLength > MAX_CONNECTION_ID_LENGTH) {
    throw new Error('Connection ID too long');
  }

  let size = 1 + // First byte (flags)
             4 + // Version
             1 + dcidLength + // DCID length + DCID
             1 + scidLength; // SCID length + SCID

  // Token for INITIAL packets
  let tokenLengthBytes: Uint8Array | undefined;
  if (header.packetType === QuicPacketType.INITIAL) {
    const tokenLength = header.token?.length || 0;
    tokenLengthBytes = encodeVarint(tokenLength);
    size += tokenLengthBytes.length + tokenLength;
  }

  // Length field (variable-length integer encoding remaining length)
  const remainingLength = packetNumberBytes.length + payload.length;
  const lengthBytes = encodeVarint(remainingLength);
  size += lengthBytes.length;

  // Packet number and payload
  size += packetNumberBytes.length + payload.length;

  const packet = new Uint8Array(size);
  let offset = 0;

  // First byte: Long header bit | Fixed bit | Packet type | Reserved bits | Packet number length
  const pnLengthBits = packetNumberBytes.length - 1; // 0-3 for 1-4 bytes
  packet[offset++] = LONG_HEADER_BIT | FIXED_BIT |
                     ((header.packetType & 0x03) << 4) |
                     (pnLengthBits & PACKET_NUMBER_LENGTH_MASK);

  // Version (4 bytes, big-endian)
  packet[offset++] = (header.version >> 24) & 0xff;
  packet[offset++] = (header.version >> 16) & 0xff;
  packet[offset++] = (header.version >> 8) & 0xff;
  packet[offset++] = header.version & 0xff;

  // DCID length and value
  packet[offset++] = dcidLength;
  packet.set(header.dcid, offset);
  offset += dcidLength;

  // SCID length and value
  packet[offset++] = scidLength;
  packet.set(header.scid, offset);
  offset += scidLength;

  // Token (INITIAL packets only)
  if (header.packetType === QuicPacketType.INITIAL && tokenLengthBytes) {
    packet.set(tokenLengthBytes, offset);
    offset += tokenLengthBytes.length;
    if (header.token) {
      packet.set(header.token, offset);
      offset += header.token.length;
    }
  }

  // Length field
  packet.set(lengthBytes, offset);
  offset += lengthBytes.length;

  // Packet number
  packet.set(packetNumberBytes, offset);
  offset += packetNumberBytes.length;

  // Payload
  packet.set(payload, offset);

  return packet;
}

/**
 * Build a QUIC short header packet (1-RTT)
 */
export function buildShortHeaderPacket(
  header: QuicShortHeader,
  payload: Uint8Array
): Uint8Array {
  const packetNumberBytes = encodePacketNumber(header.packetNumber, header.packetNumberLength);

  const dcidLength = header.dcid.length;
  const size = 1 + dcidLength + packetNumberBytes.length + payload.length;

  const packet = new Uint8Array(size);
  let offset = 0;

  // First byte: Short header (0) | Fixed bit | Spin bit | Reserved | Key phase | Packet number length
  const pnLengthBits = packetNumberBytes.length - 1;
  let firstByte = FIXED_BIT | (pnLengthBits & PACKET_NUMBER_LENGTH_MASK);

  if (header.spinBit) {
    firstByte |= 0x20; // Spin bit
  }
  if (header.keyPhase) {
    firstByte |= 0x04; // Key phase bit
  }

  packet[offset++] = firstByte;

  // DCID (no length byte for short header)
  packet.set(header.dcid, offset);
  offset += dcidLength;

  // Packet number
  packet.set(packetNumberBytes, offset);
  offset += packetNumberBytes.length;

  // Payload
  packet.set(payload, offset);

  return packet;
}

/**
 * Parse a QUIC packet header
 */
export function parsePacketHeader(packet: Uint8Array): { header: QuicHeader; headerLength: number; payload: Uint8Array } {
  if (packet.length < 1) {
    throw new Error('Packet too short');
  }

  let offset = 0;
  const firstByte = packet[offset++];

  // Check if long header
  if (firstByte & LONG_HEADER_BIT) {
    return parseLongHeader(packet, firstByte);
  } else {
    return parseShortHeader(packet, firstByte);
  }
}

function parseLongHeader(packet: Uint8Array, firstByte: number): { header: QuicLongHeader; headerLength: number; payload: Uint8Array } {
  let offset = 1;

  // Extract packet type and packet number length
  const packetType = (firstByte >> 4) & 0x03;
  const packetNumberLength = (firstByte & PACKET_NUMBER_LENGTH_MASK) + 1;

  // Version (4 bytes)
  if (offset + 4 > packet.length) throw new Error('Packet too short for version');
  const version = (packet[offset] << 24) | (packet[offset + 1] << 16) |
                  (packet[offset + 2] << 8) | packet[offset + 3];
  offset += 4;

  // DCID
  if (offset >= packet.length) throw new Error('Packet too short for DCID length');
  const dcidLength = packet[offset++];
  if (offset + dcidLength > packet.length) throw new Error('Packet too short for DCID');
  const dcid = packet.slice(offset, offset + dcidLength);
  offset += dcidLength;

  // SCID
  if (offset >= packet.length) throw new Error('Packet too short for SCID length');
  const scidLength = packet[offset++];
  if (offset + scidLength > packet.length) throw new Error('Packet too short for SCID');
  const scid = packet.slice(offset, offset + scidLength);
  offset += scidLength;

  // Token (INITIAL packets only)
  let token: Uint8Array | undefined;
  if (packetType === QuicPacketType.INITIAL) {
    const { value: tokenLength, bytesRead } = decodeVarint(packet, offset);
    offset += bytesRead;
    if (tokenLength > 0) {
      if (offset + Number(tokenLength) > packet.length) {
        throw new Error('Packet too short for token');
      }
      token = packet.slice(offset, offset + Number(tokenLength));
      offset += Number(tokenLength);
    }
  }

  // Length field
  const { value: payloadLength, bytesRead: lengthBytesRead } = decodeVarint(packet, offset);
  offset += lengthBytesRead;

  // Packet number
  if (offset + packetNumberLength > packet.length) {
    throw new Error('Packet too short for packet number');
  }
  const packetNumber = decodePacketNumber(packet.slice(offset, offset + packetNumberLength));
  offset += packetNumberLength;

  // Payload
  const expectedEnd = offset + Number(payloadLength) - packetNumberLength;
  if (expectedEnd > packet.length) {
    throw new Error(`Packet too short for payload: expected ${expectedEnd}, got ${packet.length}`);
  }
  const payload = packet.slice(offset, expectedEnd);

  return {
    header: {
      type: 'long',
      packetType,
      version,
      dcid,
      scid,
      token,
      packetNumber,
      packetNumberLength
    },
    headerLength: offset,
    payload
  };
}

function parseShortHeader(packet: Uint8Array, firstByte: number): { header: QuicShortHeader; headerLength: number; payload: Uint8Array } {
  let offset = 1;

  // Extract packet number length, spin bit, key phase
  const packetNumberLength = (firstByte & PACKET_NUMBER_LENGTH_MASK) + 1;
  const spinBit = !!(firstByte & 0x20);
  const keyPhase = !!(firstByte & 0x04);

  // DCID (use default length for short header)
  const dcidLength = DEFAULT_CONNECTION_ID_LENGTH;
  if (offset + dcidLength > packet.length) throw new Error('Packet too short for DCID');
  const dcid = packet.slice(offset, offset + dcidLength);
  offset += dcidLength;

  // Packet number
  if (offset + packetNumberLength > packet.length) {
    throw new Error('Packet too short for packet number');
  }
  const packetNumber = decodePacketNumber(packet.slice(offset, offset + packetNumberLength));
  offset += packetNumberLength;

  // Payload (rest of packet)
  const payload = packet.slice(offset);

  return {
    header: {
      type: 'short',
      dcid,
      packetNumber,
      packetNumberLength,
      spinBit,
      keyPhase
    },
    headerLength: offset,
    payload
  };
}

/**
 * Encode packet number to specified byte length
 */
function encodePacketNumber(pn: bigint, length: number): Uint8Array {
  if (length < 1 || length > 4) {
    throw new Error('Packet number length must be 1-4 bytes');
  }

  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[length - 1 - i] = Number((pn >> BigInt(i * 8)) & 0xffn);
  }
  return bytes;
}

/**
 * Decode packet number from bytes
 */
function decodePacketNumber(bytes: Uint8Array): bigint {
  let pn = 0n;
  for (let i = 0; i < bytes.length; i++) {
    pn = (pn << 8n) | BigInt(bytes[i]);
  }
  return pn;
}

/**
 * Generate random connection ID
 */
export function generateConnectionId(length: number = DEFAULT_CONNECTION_ID_LENGTH): Uint8Array {
  // Use ONE.core's crypto abstraction which works across all platforms
  const { createRandomNonce } = require('@refinio/one.core/lib/crypto/encryption.js');
  const nonce = createRandomNonce();

  // If we need more/less bytes than the nonce size, adjust
  if (length === nonce.length) {
    return nonce;
  }

  const cid = new Uint8Array(length);
  if (length <= nonce.length) {
    cid.set(nonce.subarray(0, length));
  } else {
    // Need multiple nonces
    let offset = 0;
    while (offset < length) {
      const chunk = createRandomNonce();
      const remaining = length - offset;
      const toCopy = Math.min(remaining, chunk.length);
      cid.set(chunk.subarray(0, toCopy), offset);
      offset += toCopy;
    }
  }
  return cid;
}
