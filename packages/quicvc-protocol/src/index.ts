/**
 * @refinio/quicvc-protocol
 *
 * QUIC-VC Protocol Abstractions
 *
 * Provides RFC 9000 compliant QUIC packet and frame handling with
 * Verifiable Credential based authentication instead of TLS.
 *
 * QUIC-VC = QUIC wire format + VC-based auth (no TLS)
 */

// Constants and types
export * from './constants';
export * from './varint';

// Packet handling
export * from './packet';

// Standard QUIC frames
export * from './frames';

// VC-specific frames
export * from './vc-frames';

// Re-export commonly used types
export type {
  QuicHeader,
  QuicLongHeader,
  QuicShortHeader
} from './packet';

export type {
  QuicFrame,
  StreamFrameData,
  AckRange
} from './frames';

export type {
  DeviceIdentityCredential,
  VCResponseData,
  DiscoveryData,
  HeartbeatData
} from './vc-frames';
