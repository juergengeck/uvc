/**
 * QUIC Protocol Constants
 * Based on RFC 9000 - QUIC: A UDP-Based Multiplexed and Secure Transport
 */

// QUIC Version
export const QUIC_VERSION_1 = 0x00000001;

// Packet Types (from long header bits 5-4)
export enum QuicPacketType {
  INITIAL = 0x00,      // 0b00 - Initial packet
  ZERO_RTT = 0x01,     // 0b01 - 0-RTT packet
  HANDSHAKE = 0x02,    // 0b10 - Handshake packet
  RETRY = 0x03,        // 0b11 - Retry packet
  ONE_RTT = 0x04       // Short header (1-RTT protected)
}

// Long header flag bits
export const LONG_HEADER_BIT = 0x80;      // Bit 7: Long header indicator
export const FIXED_BIT = 0x40;            // Bit 6: Fixed bit (always 1)
export const PACKET_TYPE_MASK = 0x30;     // Bits 5-4: Packet type
export const PACKET_NUMBER_LENGTH_MASK = 0x03; // Bits 1-0: Packet number length

// Short header flag bits
export const SPIN_BIT = 0x20;             // Bit 5: Spin bit
export const KEY_PHASE_BIT = 0x04;        // Bit 2: Key phase

// Standard QUIC Frame Types (RFC 9000)
export enum QuicFrameType {
  PADDING = 0x00,
  PING = 0x01,
  ACK = 0x02,
  ACK_ECN = 0x03,
  RESET_STREAM = 0x04,
  STOP_SENDING = 0x05,
  CRYPTO = 0x06,
  NEW_TOKEN = 0x07,
  STREAM = 0x08,           // Base for STREAM frames (0x08-0x0f)
  MAX_DATA = 0x10,
  MAX_STREAM_DATA = 0x11,
  MAX_STREAMS_BIDI = 0x12,
  MAX_STREAMS_UNI = 0x13,
  DATA_BLOCKED = 0x14,
  STREAM_DATA_BLOCKED = 0x15,
  STREAMS_BLOCKED_BIDI = 0x16,
  STREAMS_BLOCKED_UNI = 0x17,
  NEW_CONNECTION_ID = 0x18,
  RETIRE_CONNECTION_ID = 0x19,
  PATH_CHALLENGE = 0x1a,
  PATH_RESPONSE = 0x1b,
  CONNECTION_CLOSE_QUIC = 0x1c,
  CONNECTION_CLOSE_APP = 0x1d,
  HANDSHAKE_DONE = 0x1e,
}

// QUIC-VC Custom Frame Types (extension range)
// Using experimental frame type space (0x20-0xFF for custom extensions)
export enum QuicVCFrameType {
  VC_INIT = 0x10,          // VC handshake initiation
  VC_RESPONSE = 0x11,      // VC handshake response
  VC_ACK = 0x12,           // VC handshake acknowledgment
  DISCOVERY = 0x01,        // Device discovery (reusing PING semantics)
  HEARTBEAT = 0x20,        // Keep-alive heartbeat
}

// STREAM frame flag bits
export const STREAM_FIN_BIT = 0x01;       // Bit 0: FIN
export const STREAM_LEN_BIT = 0x02;       // Bit 1: Length present
export const STREAM_OFF_BIT = 0x04;       // Bit 2: Offset present

// Maximum values
export const MAX_PACKET_SIZE = 1200;      // Conservative MTU
export const MAX_CONNECTION_ID_LENGTH = 20;
export const DEFAULT_CONNECTION_ID_LENGTH = 8;

// Variable-length integer encoding
export const VARINT_1_BYTE_MAX = 63;      // 2^6 - 1
export const VARINT_2_BYTE_MAX = 16383;   // 2^14 - 1
export const VARINT_4_BYTE_MAX = 1073741823; // 2^30 - 1
export const VARINT_8_BYTE_MAX = 4611686018427387903n; // 2^62 - 1

// Transport parameters
export const DEFAULT_MAX_PACKET_SIZE = 65527;
export const DEFAULT_ACK_DELAY_EXPONENT = 3;
export const DEFAULT_MAX_ACK_DELAY = 25; // milliseconds

// Error codes (RFC 9000 Section 20)
export enum QuicErrorCode {
  NO_ERROR = 0x00,
  INTERNAL_ERROR = 0x01,
  CONNECTION_REFUSED = 0x02,
  FLOW_CONTROL_ERROR = 0x03,
  STREAM_LIMIT_ERROR = 0x04,
  STREAM_STATE_ERROR = 0x05,
  FINAL_SIZE_ERROR = 0x06,
  FRAME_ENCODING_ERROR = 0x07,
  TRANSPORT_PARAMETER_ERROR = 0x08,
  CONNECTION_ID_LIMIT_ERROR = 0x09,
  PROTOCOL_VIOLATION = 0x0a,
  INVALID_TOKEN = 0x0b,
  APPLICATION_ERROR = 0x0c,
  CRYPTO_BUFFER_EXCEEDED = 0x0d,
  KEY_UPDATE_ERROR = 0x0e,
  AEAD_LIMIT_REACHED = 0x0f,
  NO_VIABLE_PATH = 0x10,
}

// QUIC-VC specific error codes (application error space)
export enum QuicVCErrorCode {
  VC_VALIDATION_FAILED = 0x0100,
  VC_EXPIRED = 0x0101,
  VC_REVOKED = 0x0102,
  UNAUTHORIZED = 0x0103,
  DEVICE_ALREADY_OWNED = 0x0104,
  INVALID_CREDENTIAL = 0x0105,
}
