/**
 * Interface representing a verifiable credential for device ownership
 * Following W3C Verifiable Credentials standard field names
 */
export interface VerifiableCredential {
  /** Unique identifier for the credential */
  id: string;
  
  /** Issuer of the credential (owner's Person ID) */
  issuer: string;
  
  /** Subject of the credential (device ID) */
  subject: string;
  
  /** JWT-style issuer field for ESP32 compatibility */
  iss?: string;
  
  /** JWT-style subject field for ESP32 compatibility */
  sub?: string;
  
  /** Device ID this credential is for */
  device_id: string;
  
  /** Device type */
  device_type: string;
  
  /** Issued at timestamp (Unix timestamp) */
  issued_at: number;
  
  /** Expiration timestamp (Unix timestamp, 0 for no expiration) */
  expires_at: number;
  
  /** Ownership type (owner, guest, etc.) */
  ownership: string;
  
  /** Permissions granted by this credential (comma-separated list) */
  permissions: string;
  
  /** Cryptographic proof of the credential's validity */
  proof: string;
  
  /** MAC address of the device (optional) */
  mac?: string;
  
  /** Whether the credential is currently valid */
  is_valid: boolean;
} 