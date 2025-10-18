/**
 * Variable-Length Integer Encoding
 * RFC 9000 Section 16
 */

import {
  VARINT_1_BYTE_MAX,
  VARINT_2_BYTE_MAX,
  VARINT_4_BYTE_MAX,
  VARINT_8_BYTE_MAX
} from './constants';

/**
 * Encode a variable-length integer according to RFC 9000
 * Returns the encoded bytes
 */
export function encodeVarint(value: number | bigint): Uint8Array {
  const num = typeof value === 'bigint' ? value : BigInt(value);

  if (num < 0) {
    throw new Error('Variable-length integer cannot be negative');
  }

  if (num <= VARINT_1_BYTE_MAX) {
    // 1 byte: 00xxxxxx
    return new Uint8Array([Number(num)]);
  } else if (num <= VARINT_2_BYTE_MAX) {
    // 2 bytes: 01xxxxxx xxxxxxxx
    const bytes = new Uint8Array(2);
    bytes[0] = 0x40 | Number((num >> 8n) & 0x3fn);
    bytes[1] = Number(num & 0xffn);
    return bytes;
  } else if (num <= VARINT_4_BYTE_MAX) {
    // 4 bytes: 10xxxxxx xxxxxxxx xxxxxxxx xxxxxxxx
    const bytes = new Uint8Array(4);
    bytes[0] = 0x80 | Number((num >> 24n) & 0x3fn);
    bytes[1] = Number((num >> 16n) & 0xffn);
    bytes[2] = Number((num >> 8n) & 0xffn);
    bytes[3] = Number(num & 0xffn);
    return bytes;
  } else if (num <= VARINT_8_BYTE_MAX) {
    // 8 bytes: 11xxxxxx xxxxxxxx ... xxxxxxxx
    const bytes = new Uint8Array(8);
    bytes[0] = 0xc0 | Number((num >> 56n) & 0x3fn);
    bytes[1] = Number((num >> 48n) & 0xffn);
    bytes[2] = Number((num >> 40n) & 0xffn);
    bytes[3] = Number((num >> 32n) & 0xffn);
    bytes[4] = Number((num >> 24n) & 0xffn);
    bytes[5] = Number((num >> 16n) & 0xffn);
    bytes[6] = Number((num >> 8n) & 0xffn);
    bytes[7] = Number(num & 0xffn);
    return bytes;
  } else {
    throw new Error('Variable-length integer too large');
  }
}

/**
 * Decode a variable-length integer from a buffer
 * Returns { value, bytesRead }
 */
export function decodeVarint(buffer: Uint8Array, offset = 0): { value: bigint; bytesRead: number } {
  if (offset >= buffer.length) {
    throw new Error('Buffer too short to decode varint');
  }

  const firstByte = buffer[offset];
  const prefix = firstByte >> 6;

  switch (prefix) {
    case 0: // 1 byte
      return {
        value: BigInt(firstByte & 0x3f),
        bytesRead: 1
      };

    case 1: // 2 bytes
      if (offset + 2 > buffer.length) {
        throw new Error('Buffer too short for 2-byte varint');
      }
      return {
        value: BigInt(((firstByte & 0x3f) << 8) | buffer[offset + 1]),
        bytesRead: 2
      };

    case 2: // 4 bytes
      if (offset + 4 > buffer.length) {
        throw new Error('Buffer too short for 4-byte varint');
      }
      return {
        value: BigInt(
          ((firstByte & 0x3f) << 24) |
          (buffer[offset + 1] << 16) |
          (buffer[offset + 2] << 8) |
          buffer[offset + 3]
        ),
        bytesRead: 4
      };

    case 3: // 8 bytes
      if (offset + 8 > buffer.length) {
        throw new Error('Buffer too short for 8-byte varint');
      }
      return {
        value:
          (BigInt(firstByte & 0x3f) << 56n) |
          (BigInt(buffer[offset + 1]) << 48n) |
          (BigInt(buffer[offset + 2]) << 40n) |
          (BigInt(buffer[offset + 3]) << 32n) |
          (BigInt(buffer[offset + 4]) << 24n) |
          (BigInt(buffer[offset + 5]) << 16n) |
          (BigInt(buffer[offset + 6]) << 8n) |
          BigInt(buffer[offset + 7]),
        bytesRead: 8
      };

    default:
      throw new Error('Invalid varint prefix');
  }
}

/**
 * Get the encoded size of a varint without actually encoding it
 */
export function getVarintSize(value: number | bigint): number {
  const num = typeof value === 'bigint' ? value : BigInt(value);

  if (num <= VARINT_1_BYTE_MAX) return 1;
  if (num <= VARINT_2_BYTE_MAX) return 2;
  if (num <= VARINT_4_BYTE_MAX) return 4;
  if (num <= VARINT_8_BYTE_MAX) return 8;

  throw new Error('Variable-length integer too large');
}
