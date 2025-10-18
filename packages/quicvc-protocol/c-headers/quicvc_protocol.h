/**
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
