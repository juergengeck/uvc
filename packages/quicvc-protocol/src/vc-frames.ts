/**
 * QUIC-VC Specific Frames
 * Extension frames for Verifiable Credential based authentication
 */

import { QuicVCFrameType, QuicVCErrorCode } from './constants';
import { QuicFrame } from './frames';

/**
 * Device Identity Credential (simplified for QUIC-VC)
 */
export interface DeviceIdentityCredential {
  $type$: 'DeviceIdentityCredential';
  id: string;
  owner: string;  // Owner's Person ID
  issuer: string; // Issuer's Person ID (who created this credential)
  issuanceDate: string;
  expirationDate?: string;
  credentialSubject: {
    id: string; // Device ID
    publicKeyHex: string;
    type: string; // Device type (e.g., 'ESP32', 'LamaDeviceApp')
    capabilities: string[];
  };
  proof: {
    type: string; // e.g., 'Ed25519Signature2020'
    created: string;
    verificationMethod: string;
    proofPurpose: string;
    proofValue: string; // Base64-encoded signature
  };
}

/**
 * VC_INIT Frame - Initiates VC-based handshake
 * Replaces CRYPTO frame with TLS ClientHello in standard QUIC
 *
 * IMPORTANT: Now uses microdata format instead of JSON
 * - Credential is transmitted as HTML microdata string
 * - Provides content-addressability (SHA-256 hash = credential ID)
 * - Enables cryptographic verification of credentials
 */
export class VCInitFrame implements QuicFrame {
  type = QuicVCFrameType.VC_INIT;

  /**
   * @param credentialMicrodata - HTML microdata string of DeviceIdentityCredential
   * @param credential - Optional: Original credential object (for compatibility, not transmitted)
   */
  constructor(
    public credentialMicrodata: string,
    public credential?: DeviceIdentityCredential
  ) {}

  serialize(): Uint8Array {
    // Encode microdata string to UTF-8
    const microdataBytes = new TextEncoder().encode(this.credentialMicrodata);

    // Frame format: [type(1)][length(2)][microdata_utf8]
    const frame = new Uint8Array(3 + microdataBytes.length);
    frame[0] = this.type;
    frame[1] = (microdataBytes.length >> 8) & 0xff;
    frame[2] = microdataBytes.length & 0xff;
    frame.set(microdataBytes, 3);

    return frame;
  }

  static parse(buffer: Uint8Array, offset: number = 0): { frame: VCInitFrame; bytesRead: number } {
    let pos = offset;

    // Skip frame type
    pos++;

    // Read length (2 bytes, big-endian)
    const length = (buffer[pos] << 8) | buffer[pos + 1];
    pos += 2;

    // Extract microdata string
    const microdataBytes = buffer.slice(pos, pos + length);
    const microdataString = new TextDecoder().decode(microdataBytes);

    // Validate microdata structure
    if (!microdataString.includes('itemtype="//refin.io/DeviceIdentityCredential"')) {
      throw new Error('VC_INIT frame: invalid or missing DeviceIdentityCredential microdata');
    }

    return {
      frame: new VCInitFrame(microdataString),
      bytesRead: 3 + length
    };
  }
}

/**
 * VC_RESPONSE Frame - Response to VC handshake
 * Replaces CRYPTO frame with TLS ServerHello in standard QUIC
 *
 * IMPORTANT: Now uses microdata format instead of JSON
 * - Server credential transmitted as HTML microdata string
 * - Response status as simple structured data
 */
export interface VCResponseData {
  status: 'provisioned' | 'authenticated' | 'already_owned' | 'revoked' | 'error';
  device_id?: string;
  owner?: string;
  message?: string;
  error?: string;
  credentialMicrodata?: string;  // Server's credential as microdata
}

export class VCResponseFrame implements QuicFrame {
  type = QuicVCFrameType.VC_RESPONSE;

  /**
   * @param credentialMicrodata - Optional server credential as HTML microdata
   * @param response - Response data (status, device_id, etc.)
   */
  constructor(
    public credentialMicrodata: string | null,
    public response: VCResponseData
  ) {}

  serialize(): Uint8Array {
    // Encode credential microdata if present
    let microdataBytes: Uint8Array;
    let microdataLength: number;

    if (this.credentialMicrodata) {
      microdataBytes = new TextEncoder().encode(this.credentialMicrodata);
      microdataLength = microdataBytes.length;
    } else {
      microdataBytes = new Uint8Array(0);
      microdataLength = 0;
    }

    // Encode response data as JSON (small, fixed structure)
    const responseJson = JSON.stringify(this.response);
    const responseBytes = new TextEncoder().encode(responseJson);

    // Frame format: [type(1)][microdata_length(2)][microdata_utf8][response_length(2)][response_json]
    const frame = new Uint8Array(5 + microdataLength + responseBytes.length);
    let offset = 0;

    frame[offset++] = this.type;

    // Microdata length (2 bytes, big-endian)
    frame[offset++] = (microdataLength >> 8) & 0xff;
    frame[offset++] = microdataLength & 0xff;

    if (microdataLength > 0) {
      frame.set(microdataBytes, offset);
      offset += microdataLength;
    }

    // Response length (2 bytes, big-endian)
    frame[offset++] = (responseBytes.length >> 8) & 0xff;
    frame[offset++] = responseBytes.length & 0xff;
    frame.set(responseBytes, offset);

    return frame;
  }

  static parse(buffer: Uint8Array, offset: number = 0): { frame: VCResponseFrame; bytesRead: number } {
    let pos = offset;

    // Skip frame type
    pos++;

    // Read microdata length (2 bytes, big-endian)
    const microdataLength = (buffer[pos] << 8) | buffer[pos + 1];
    pos += 2;

    // Extract microdata if present
    let credentialMicrodata: string | null = null;
    if (microdataLength > 0) {
      const microdataBytes = buffer.slice(pos, pos + microdataLength);
      credentialMicrodata = new TextDecoder().decode(microdataBytes);
      pos += microdataLength;

      // Validate microdata structure if present
      if (!credentialMicrodata.includes('itemtype="//refin.io/DeviceIdentityCredential"')) {
        throw new Error('VC_RESPONSE frame: invalid credential microdata');
      }
    }

    // Read response length (2 bytes, big-endian)
    const responseLength = (buffer[pos] << 8) | buffer[pos + 1];
    pos += 2;

    // Parse response JSON
    const responseBytes = buffer.slice(pos, pos + responseLength);
    const responseStr = new TextDecoder().decode(responseBytes);
    const response = JSON.parse(responseStr) as VCResponseData;
    pos += responseLength;

    return {
      frame: new VCResponseFrame(credentialMicrodata, response),
      bytesRead: pos - offset
    };
  }
}

/**
 * VC_ACK Frame - Acknowledges VC handshake completion
 */
export class VCAckFrame implements QuicFrame {
  type = QuicVCFrameType.VC_ACK;

  constructor(
    public deviceId: string,
    public status: 'success' | 'failure',
    public message?: string
  ) {}

  serialize(): Uint8Array {
    const ackJson = JSON.stringify({
      type: this.type,
      device_id: this.deviceId,
      status: this.status,
      message: this.message
    });
    const jsonBytes = new TextEncoder().encode(ackJson);

    // Frame format: [type(1)][length(2)][json_payload]
    const frame = new Uint8Array(3 + jsonBytes.length);
    frame[0] = this.type;
    frame[1] = (jsonBytes.length >> 8) & 0xff;
    frame[2] = jsonBytes.length & 0xff;
    frame.set(jsonBytes, 3);

    return frame;
  }

  static parse(buffer: Uint8Array, offset: number = 0): { frame: VCAckFrame; bytesRead: number } {
    let pos = offset;

    // Skip frame type
    pos++;

    // Read length (2 bytes, big-endian)
    const length = (buffer[pos] << 8) | buffer[pos + 1];
    pos += 2;

    // Parse JSON payload
    const jsonBytes = buffer.slice(pos, pos + length);
    const jsonStr = new TextDecoder().decode(jsonBytes);
    const parsed = JSON.parse(jsonStr);

    return {
      frame: new VCAckFrame(
        parsed.device_id || parsed.deviceId,
        parsed.status,
        parsed.message
      ),
      bytesRead: 3 + length
    };
  }
}

/**
 * DISCOVERY Frame - Device discovery broadcast
 */
export interface DiscoveryData {
  deviceId: string;
  deviceType: number;
  ownership: number; // 0 = unclaimed, 1 = owned
  capabilities: string;
  timestamp: number;
}

export class DiscoveryFrame implements QuicFrame {
  type = QuicVCFrameType.DISCOVERY;

  constructor(public data: DiscoveryData) {}

  serialize(): Uint8Array {
    const discoveryJson = JSON.stringify({
      type: this.type,
      ...this.data
    });
    const jsonBytes = new TextEncoder().encode(discoveryJson);

    // Frame format: [type(1)][length(2)][json_payload]
    const frame = new Uint8Array(3 + jsonBytes.length);
    frame[0] = this.type;
    frame[1] = (jsonBytes.length >> 8) & 0xff;
    frame[2] = jsonBytes.length & 0xff;
    frame.set(jsonBytes, 3);

    return frame;
  }

  static parse(buffer: Uint8Array, offset: number = 0): { frame: DiscoveryFrame; bytesRead: number } {
    let pos = offset;

    // Skip frame type
    pos++;

    // Read length (2 bytes, big-endian)
    const length = (buffer[pos] << 8) | buffer[pos + 1];
    pos += 2;

    // Parse JSON payload
    const jsonBytes = buffer.slice(pos, pos + length);
    const jsonStr = new TextDecoder().decode(jsonBytes);
    const parsed = JSON.parse(jsonStr);

    return {
      frame: new DiscoveryFrame(parsed as DiscoveryData),
      bytesRead: 3 + length
    };
  }
}

/**
 * HEARTBEAT Frame - Keep-alive with optional status data
 */
export interface HeartbeatData {
  device_id?: string;
  timestamp: number;
  status?: any;
}

export class HeartbeatFrame implements QuicFrame {
  type = QuicVCFrameType.HEARTBEAT;

  constructor(public data: HeartbeatData) {}

  serialize(): Uint8Array {
    const heartbeatJson = JSON.stringify({
      type: this.type,
      ...this.data
    });
    const jsonBytes = new TextEncoder().encode(heartbeatJson);

    // Frame format: [type(1)][length(2)][json_payload]
    const frame = new Uint8Array(3 + jsonBytes.length);
    frame[0] = this.type;
    frame[1] = (jsonBytes.length >> 8) & 0xff;
    frame[2] = jsonBytes.length & 0xff;
    frame.set(jsonBytes, 3);

    return frame;
  }

  static parse(buffer: Uint8Array, offset: number = 0): { frame: HeartbeatFrame; bytesRead: number } {
    let pos = offset;

    // Skip frame type
    pos++;

    // Read length (2 bytes, big-endian)
    const length = (buffer[pos] << 8) | buffer[pos + 1];
    pos += 2;

    // Parse JSON payload
    const jsonBytes = buffer.slice(pos, pos + length);
    const jsonStr = new TextDecoder().decode(jsonBytes);
    const parsed = JSON.parse(jsonStr);

    return {
      frame: new HeartbeatFrame(parsed as HeartbeatData),
      bytesRead: 3 + length
    };
  }
}

/**
 * Parse VC-specific frames
 */
export function parseVCFrame(buffer: Uint8Array, offset: number = 0): { frame: QuicFrame; bytesRead: number } {
  if (offset >= buffer.length) {
    throw new Error('Buffer too short to parse VC frame');
  }

  const frameType = buffer[offset];

  switch (frameType) {
    case QuicVCFrameType.VC_INIT:
      return VCInitFrame.parse(buffer, offset);
    case QuicVCFrameType.VC_RESPONSE:
      return VCResponseFrame.parse(buffer, offset);
    case QuicVCFrameType.VC_ACK:
      return VCAckFrame.parse(buffer, offset);
    case QuicVCFrameType.DISCOVERY:
      return DiscoveryFrame.parse(buffer, offset);
    case QuicVCFrameType.HEARTBEAT:
      return HeartbeatFrame.parse(buffer, offset);
    default:
      throw new Error(`Unknown VC frame type: 0x${frameType.toString(16)}`);
  }
}
