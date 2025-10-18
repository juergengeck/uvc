/**
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
