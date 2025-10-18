#!/usr/bin/env ts-node
/**
 * Generate C header file from TypeScript protocol definitions
 * This ensures ESP32 C code and React Native TypeScript use the same constants
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HEADER_TEMPLATE = `/**
 * QUIC-VC Protocol Constants
 * Auto-generated from @refinio/quicvc-protocol TypeScript definitions
 * DO NOT EDIT MANUALLY
 *
 * QUIC-VC uses QUIC packet/frame structure (RFC 9000) with VC-based auth instead of TLS
 */

#ifndef QUICVC_PROTOCOL_H
#define QUICVC_PROTOCOL_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// QUIC-VC Version (based on QUIC v1)
#define QUICVC_VERSION 0x00000001

// Packet Types (from RFC 9000)
#define QUICVC_PACKET_TYPE_INITIAL    0x00
#define QUICVC_PACKET_TYPE_ZERO_RTT   0x01
#define QUICVC_PACKET_TYPE_HANDSHAKE  0x02
#define QUICVC_PACKET_TYPE_RETRY      0x03
#define QUICVC_PACKET_TYPE_ONE_RTT    0x04

// Header Flag Bits (from RFC 9000)
#define QUICVC_LONG_HEADER_BIT        0x80
#define QUICVC_FIXED_BIT              0x40
#define QUICVC_PACKET_TYPE_MASK       0x30
#define QUICVC_PACKET_NUMBER_LEN_MASK 0x03
#define QUICVC_SPIN_BIT               0x20
#define QUICVC_KEY_PHASE_BIT          0x04

// Standard QUIC Frame Types we use (RFC 9000)
#define QUICVC_FRAME_PADDING              0x00
#define QUICVC_FRAME_PING                 0x01
#define QUICVC_FRAME_ACK                  0x02
#define QUICVC_FRAME_STREAM               0x08
#define QUICVC_FRAME_CONNECTION_CLOSE     0x1c

// QUIC-VC Specific Frame Types (custom extensions)
#define QUICVC_FRAME_VC_INIT      0x10  // Replaces CRYPTO+TLS ClientHello
#define QUICVC_FRAME_VC_RESPONSE  0x11  // Replaces CRYPTO+TLS ServerHello
#define QUICVC_FRAME_VC_ACK       0x12  // VC handshake acknowledgment
#define QUICVC_FRAME_DISCOVERY    0x01  // Device discovery (uses PING semantics)
#define QUICVC_FRAME_HEARTBEAT    0x20  // Keep-alive heartbeat

// STREAM Frame Flag Bits (from RFC 9000)
#define QUICVC_STREAM_FIN_BIT 0x01
#define QUICVC_STREAM_LEN_BIT 0x02
#define QUICVC_STREAM_OFF_BIT 0x04

// Maximum Values
#define QUICVC_MAX_PACKET_SIZE           1200
#define QUICVC_MAX_CONNECTION_ID_LENGTH  20
#define QUICVC_DEFAULT_CONNECTION_ID_LENGTH 8

// Variable-Length Integer Limits (from RFC 9000)
#define QUICVC_VARINT_1_BYTE_MAX  63
#define QUICVC_VARINT_2_BYTE_MAX  16383
#define QUICVC_VARINT_4_BYTE_MAX  1073741823

// Standard QUIC Error Codes (RFC 9000)
#define QUICVC_ERROR_NO_ERROR                 0x00
#define QUICVC_ERROR_INTERNAL_ERROR           0x01
#define QUICVC_ERROR_CONNECTION_REFUSED       0x02
#define QUICVC_ERROR_FLOW_CONTROL_ERROR       0x03
#define QUICVC_ERROR_PROTOCOL_VIOLATION       0x0a

// QUIC-VC Specific Error Codes
#define QUICVC_ERROR_VC_VALIDATION_FAILED  0x0100
#define QUICVC_ERROR_VC_EXPIRED            0x0101
#define QUICVC_ERROR_VC_REVOKED            0x0102
#define QUICVC_ERROR_UNAUTHORIZED          0x0103
#define QUICVC_ERROR_DEVICE_ALREADY_OWNED  0x0104
#define QUICVC_ERROR_INVALID_CREDENTIAL    0x0105

// Variable-Length Integer Encoding/Decoding (from RFC 9000)
typedef struct {
    uint64_t value;
    uint8_t bytes_read;
} quicvc_varint_result_t;

/**
 * Encode a variable-length integer (RFC 9000)
 * Returns the number of bytes written to 'out'
 */
uint8_t quicvc_encode_varint(uint64_t value, uint8_t *out, size_t out_size);

/**
 * Decode a variable-length integer (RFC 9000)
 * Returns the decoded value and number of bytes read
 */
quicvc_varint_result_t quicvc_decode_varint(const uint8_t *data, size_t data_len);

/**
 * Get the size needed to encode a varint
 */
uint8_t quicvc_get_varint_size(uint64_t value);

/**
 * STREAM Frame Parser (RFC 9000 Section 19.8)
 *
 * STREAM frames have this format:
 *   Type (i) = 0x08..0x0f   (bits encode FIN, LEN, OFF flags)
 *   Stream ID (i)
 *   [Offset (i)]            (present if OFF bit set)
 *   [Length (i)]            (present if LEN bit set)
 *   Stream Data (..)
 *
 * Flag bits:
 *   0x01 = FIN (final stream data)
 *   0x02 = LEN (length field present)
 *   0x04 = OFF (offset field present)
 */

typedef struct {
    uint8_t frame_type;         // 0x08-0x0f (includes flags)
    uint64_t stream_id;
    uint64_t offset;            // 0 if OFF bit not set
    uint64_t length;            // data_len if LEN bit not set
    const uint8_t *data;        // Pointer to stream data
    size_t data_len;            // Length of stream data
    bool has_fin;               // FIN bit set
    bool has_len;               // LEN bit set
    bool has_off;               // OFF bit set
} quicvc_stream_frame_t;

typedef struct {
    quicvc_stream_frame_t frame;
    size_t bytes_consumed;      // Total bytes consumed from input
} quicvc_stream_parse_result_t;

/**
 * Parse a STREAM frame from buffer
 * Returns parsed frame info and number of bytes consumed
 * If bytes_consumed == 0, parsing failed
 */
quicvc_stream_parse_result_t quicvc_parse_stream_frame(
    const uint8_t *data,
    size_t data_len
);

/**
 * Serialize a STREAM frame to buffer
 * Returns number of bytes written, or 0 on error
 */
size_t quicvc_serialize_stream_frame(
    const quicvc_stream_frame_t *frame,
    uint8_t *out,
    size_t out_size
);

#ifdef __cplusplus
}
#endif

#endif /* QUICVC_PROTOCOL_H */
`;

const IMPL_TEMPLATE = `/**
 * QUIC-VC Protocol Implementation
 * Auto-generated from @refinio/quicvc-protocol TypeScript definitions
 * DO NOT EDIT MANUALLY
 */

#include "quicvc_protocol.h"
#include <string.h>

uint8_t quicvc_encode_varint(uint64_t value, uint8_t *out, size_t out_size) {
    if (value <= QUICVC_VARINT_1_BYTE_MAX) {
        if (out_size < 1) return 0;
        out[0] = (uint8_t)value;
        return 1;
    } else if (value <= QUICVC_VARINT_2_BYTE_MAX) {
        if (out_size < 2) return 0;
        out[0] = 0x40 | (uint8_t)((value >> 8) & 0x3F);
        out[1] = (uint8_t)(value & 0xFF);
        return 2;
    } else if (value <= QUICVC_VARINT_4_BYTE_MAX) {
        if (out_size < 4) return 0;
        out[0] = 0x80 | (uint8_t)((value >> 24) & 0x3F);
        out[1] = (uint8_t)((value >> 16) & 0xFF);
        out[2] = (uint8_t)((value >> 8) & 0xFF);
        out[3] = (uint8_t)(value & 0xFF);
        return 4;
    } else {
        if (out_size < 8) return 0;
        out[0] = 0xC0 | (uint8_t)((value >> 56) & 0x3F);
        out[1] = (uint8_t)((value >> 48) & 0xFF);
        out[2] = (uint8_t)((value >> 40) & 0xFF);
        out[3] = (uint8_t)((value >> 32) & 0xFF);
        out[4] = (uint8_t)((value >> 24) & 0xFF);
        out[5] = (uint8_t)((value >> 16) & 0xFF);
        out[6] = (uint8_t)((value >> 8) & 0xFF);
        out[7] = (uint8_t)(value & 0xFF);
        return 8;
    }
}

quicvc_varint_result_t quicvc_decode_varint(const uint8_t *data, size_t data_len) {
    quicvc_varint_result_t result = {0, 0};

    if (data_len < 1) {
        return result;
    }

    uint8_t first_byte = data[0];
    uint8_t prefix = first_byte >> 6;

    switch (prefix) {
        case 0: // 1 byte
            result.value = first_byte & 0x3F;
            result.bytes_read = 1;
            break;

        case 1: // 2 bytes
            if (data_len < 2) return result;
            result.value = ((uint64_t)(first_byte & 0x3F) << 8) | data[1];
            result.bytes_read = 2;
            break;

        case 2: // 4 bytes
            if (data_len < 4) return result;
            result.value = ((uint64_t)(first_byte & 0x3F) << 24) |
                          ((uint64_t)data[1] << 16) |
                          ((uint64_t)data[2] << 8) |
                          data[3];
            result.bytes_read = 4;
            break;

        case 3: // 8 bytes
            if (data_len < 8) return result;
            result.value = ((uint64_t)(first_byte & 0x3F) << 56) |
                          ((uint64_t)data[1] << 48) |
                          ((uint64_t)data[2] << 40) |
                          ((uint64_t)data[3] << 32) |
                          ((uint64_t)data[4] << 24) |
                          ((uint64_t)data[5] << 16) |
                          ((uint64_t)data[6] << 8) |
                          data[7];
            result.bytes_read = 8;
            break;
    }

    return result;
}

uint8_t quicvc_get_varint_size(uint64_t value) {
    if (value <= QUICVC_VARINT_1_BYTE_MAX) return 1;
    if (value <= QUICVC_VARINT_2_BYTE_MAX) return 2;
    if (value <= QUICVC_VARINT_4_BYTE_MAX) return 4;
    return 8;
}

quicvc_stream_parse_result_t quicvc_parse_stream_frame(
    const uint8_t *data,
    size_t data_len
) {
    quicvc_stream_parse_result_t result = {{0}, 0};

    if (data_len < 2) {
        return result; // Need at least frame type + 1 byte for stream ID
    }

    size_t offset = 0;

    // Parse frame type and extract flags
    uint8_t frame_type = data[offset++];
    if ((frame_type & 0xF8) != QUICVC_FRAME_STREAM) {
        return result; // Not a STREAM frame
    }

    result.frame.frame_type = frame_type;
    result.frame.has_fin = (frame_type & QUICVC_STREAM_FIN_BIT) != 0;
    result.frame.has_len = (frame_type & QUICVC_STREAM_LEN_BIT) != 0;
    result.frame.has_off = (frame_type & QUICVC_STREAM_OFF_BIT) != 0;

    // Parse Stream ID (varint)
    quicvc_varint_result_t stream_id_result = quicvc_decode_varint(&data[offset], data_len - offset);
    if (stream_id_result.bytes_read == 0) {
        return result;
    }
    result.frame.stream_id = stream_id_result.value;
    offset += stream_id_result.bytes_read;

    // Parse Offset if present (varint)
    if (result.frame.has_off) {
        quicvc_varint_result_t offset_result = quicvc_decode_varint(&data[offset], data_len - offset);
        if (offset_result.bytes_read == 0) {
            return result;
        }
        result.frame.offset = offset_result.value;
        offset += offset_result.bytes_read;
    } else {
        result.frame.offset = 0;
    }

    // Parse Length if present (varint)
    if (result.frame.has_len) {
        quicvc_varint_result_t length_result = quicvc_decode_varint(&data[offset], data_len - offset);
        if (length_result.bytes_read == 0) {
            return result;
        }
        result.frame.length = length_result.value;
        offset += length_result.bytes_read;
        result.frame.data_len = (size_t)result.frame.length;
    } else {
        // No length field - data extends to end of buffer
        result.frame.length = data_len - offset;
        result.frame.data_len = data_len - offset;
    }

    // Verify we have enough data
    if (offset + result.frame.data_len > data_len) {
        result.bytes_consumed = 0; // Invalid - not enough data
        return result;
    }

    // Point to stream data
    result.frame.data = &data[offset];
    result.bytes_consumed = offset + result.frame.data_len;

    return result;
}

size_t quicvc_serialize_stream_frame(
    const quicvc_stream_frame_t *frame,
    uint8_t *out,
    size_t out_size
) {
    if (!frame || !out || out_size < 2) {
        return 0;
    }

    size_t offset = 0;

    // Calculate frame type byte with flags
    uint8_t frame_type = QUICVC_FRAME_STREAM;
    if (frame->has_fin) frame_type |= QUICVC_STREAM_FIN_BIT;
    if (frame->has_len) frame_type |= QUICVC_STREAM_LEN_BIT;
    if (frame->has_off) frame_type |= QUICVC_STREAM_OFF_BIT;

    out[offset++] = frame_type;

    // Encode Stream ID
    uint8_t written = quicvc_encode_varint(frame->stream_id, &out[offset], out_size - offset);
    if (written == 0) return 0;
    offset += written;

    // Encode Offset if present
    if (frame->has_off) {
        written = quicvc_encode_varint(frame->offset, &out[offset], out_size - offset);
        if (written == 0) return 0;
        offset += written;
    }

    // Encode Length if present
    if (frame->has_len) {
        written = quicvc_encode_varint(frame->data_len, &out[offset], out_size - offset);
        if (written == 0) return 0;
        offset += written;
    }

    // Copy stream data
    if (frame->data && frame->data_len > 0) {
        if (offset + frame->data_len > out_size) {
            return 0; // Not enough space
        }
        memcpy(&out[offset], frame->data, frame->data_len);
        offset += frame->data_len;
    }

    return offset;
}
`;

function main() {
  const outputDir = path.join(__dirname, '..', 'c-headers');

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write header file
  fs.writeFileSync(path.join(outputDir, 'quicvc_protocol.h'), HEADER_TEMPLATE);
  console.log('Generated quicvc_protocol.h');

  // Write implementation file
  fs.writeFileSync(path.join(outputDir, 'quicvc_protocol.c'), IMPL_TEMPLATE);
  console.log('Generated quicvc_protocol.c');

  console.log('\nC headers generated successfully!');
  console.log(`Output directory: ${outputDir}`);
  console.log('\nCopy these files to your ESP32 project components/quicvc/include/ directory');
}

main();
