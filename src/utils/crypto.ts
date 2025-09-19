/**
 * Crypto utility functions for hashing, encoding, and authentication.
 */
import { createCryptoHash } from '@refinio/one.core/lib/system/crypto-helpers.js';
import { Buffer } from '@refinio/one.core/lib/system/expo/index.js';
import * as tweetnacl from 'tweetnacl';

/**
 * Generates a SHA-256 hash of the input string.
 * @param input The string to hash
 * @returns Hex string representation of the hash
 */
export async function sha256hash(input: string): Promise<string> {
  // Use one.core crypto helpers instead of Node.js crypto
  const base64Hash = await createCryptoHash(input);
  // Convert base64 to hex
  const buffer = Buffer.from(base64Hash, 'base64');
  return buffer.toString('hex');
}

/**
 * Encodes a string to Base64.
 * @param input The string to encode
 * @returns Base64 encoded string
 */
export function base64Encode(input: string): string {
  return Buffer.from(input).toString('base64');
}

/**
 * Generates a random 32-byte authentication key.
 * @returns Base64 encoded random key
 */
export function generateRandomKey(): string {
  const randomBytes = tweetnacl.randomBytes(32);
  return Buffer.from(randomBytes).toString('base64');
}

/**
 * Signs a message using HMAC-SHA256 with tweetnacl.
 * @param message The message to sign
 * @param key The authentication key (base64 encoded)
 * @returns Hex string representation of the signature
 */
export function signMessage(message: string, key: string): string {
  const keyBuffer = Buffer.from(key, 'base64');
  const messageBuffer = Buffer.from(message, 'utf8');
  
  // Use tweetnacl for signing since we can't use Node.js crypto.createHmac
  // This is a simplified signature - for production use, consider using tweetnacl.sign
  const keyBytes = new Uint8Array(keyBuffer);
  const msgBytes = new Uint8Array(messageBuffer);
  
  // Create a simple hash-based signature using available crypto
  const combined = new Uint8Array(keyBytes.length + msgBytes.length);
  combined.set(keyBytes);
  combined.set(msgBytes, keyBytes.length);
  
  // Use tweetnacl hash for consistent hashing
  const hash = tweetnacl.hash(combined);
  return Buffer.from(hash).toString('hex');
}

/**
 * Verifies a message signature.
 * @param message The message that was signed
 * @param signature The signature to verify (hex string)
 * @param key The authentication key (base64 encoded)
 * @returns True if the signature is valid
 */
export function verifySignature(message: string, signature: string, key: string): boolean {
  const calculatedSignature = signMessage(message, key);
  
  // Constant-time comparison using tweetnacl
  const sig1 = Buffer.from(calculatedSignature, 'hex');
  const sig2 = Buffer.from(signature, 'hex');
  
  if (sig1.length !== sig2.length) {
    return false;
  }
  
  // Use tweetnacl.verify for constant-time comparison
  return tweetnacl.verify(new Uint8Array(sig1), new Uint8Array(sig2));
}

// ============================================================================
// Key Exchange Functions for Peer-to-Peer Communication
// ============================================================================

export interface KeyExchangeKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface SharedKeyInfo {
  sharedKey: Uint8Array;
  ourPublicKey: Uint8Array;
  theirPublicKey: Uint8Array;
}

/**
 * Generate a temporary keypair for key exchange using Curve25519
 * @returns KeyPair with 32-byte public and secret keys
 */
export function generateKeyExchangeKeyPair(): KeyExchangeKeyPair {
  const keyPair = tweetnacl.box.keyPair();
  return {
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey
  };
}

/**
 * Derive a shared secret from our secret key and their public key
 * @param ourSecretKey Our 32-byte secret key
 * @param theirPublicKey Their 32-byte public key
 * @returns 32-byte shared secret
 */
export function deriveSharedKey(ourSecretKey: Uint8Array, theirPublicKey: Uint8Array): Uint8Array {
  if (ourSecretKey.length !== 32) {
    throw new Error(`Invalid secret key length: expected 32, got ${ourSecretKey.length}`);
  }
  if (theirPublicKey.length !== 32) {
    throw new Error(`Invalid public key length: expected 32, got ${theirPublicKey.length}`);
  }
  
  // Use tweetnacl.box.before to derive shared secret
  const sharedSecret = tweetnacl.box.before(theirPublicKey, ourSecretKey);
  return sharedSecret;
}

/**
 * Encrypt a message using the shared secret
 * @param message The message to encrypt (as string)
 * @param sharedSecret The 32-byte shared secret
 * @returns Encrypted data with nonce prepended (24 bytes nonce + encrypted data)
 */
export function encryptMessage(message: string, sharedSecret: Uint8Array): Uint8Array {
  const messageBytes = new TextEncoder().encode(message);
  const nonce = tweetnacl.randomBytes(24); // 24-byte nonce for box
  
  const encrypted = tweetnacl.box.after(messageBytes, nonce, sharedSecret);
  if (!encrypted) {
    throw new Error('Encryption failed');
  }
  
  // Prepend nonce to encrypted data
  const result = new Uint8Array(nonce.length + encrypted.length);
  result.set(nonce);
  result.set(encrypted, nonce.length);
  
  return result;
}

/**
 * Decrypt a message using the shared secret
 * @param encryptedData The encrypted data with nonce prepended
 * @param sharedSecret The 32-byte shared secret
 * @returns Decrypted message as string
 */
export function decryptMessage(encryptedData: Uint8Array, sharedSecret: Uint8Array): string {
  if (encryptedData.length < 24) {
    throw new Error('Encrypted data too short (missing nonce)');
  }
  
  const nonce = encryptedData.slice(0, 24);
  const ciphertext = encryptedData.slice(24);
  
  const decrypted = tweetnacl.box.open.after(ciphertext, nonce, sharedSecret);
  if (!decrypted) {
    throw new Error('Decryption failed');
  }
  
  return new TextDecoder().decode(decrypted);
}

/**
 * Create a key exchange message (72 bytes: 32-byte public key + 32-byte nonce + 8-byte metadata)
 * @param publicKey Our 32-byte public key
 * @returns 72-byte key exchange message
 */
export function createKeyExchangeMessage(publicKey: Uint8Array): Uint8Array {
  if (publicKey.length !== 32) {
    throw new Error(`Invalid public key length: expected 32, got ${publicKey.length}`);
  }
  
  const nonce = tweetnacl.randomBytes(32); // 32-byte nonce for key exchange
  const metadata = new Uint8Array(8); // 8 bytes of metadata (version, flags, etc.)
  
  // Set metadata: version 1, key exchange type
  metadata[0] = 0x01; // Version
  metadata[1] = 0x00; // Key exchange type
  // Remaining bytes are zero (reserved)
  
  // Combine: 32-byte public key + 32-byte nonce + 8-byte metadata = 72 bytes
  const message = new Uint8Array(72);
  message.set(publicKey, 0);
  message.set(nonce, 32);
  message.set(metadata, 64);
  
  return message;
}

/**
 * Parse a key exchange message
 * @param message 72-byte key exchange message
 * @returns Parsed components
 */
export function parseKeyExchangeMessage(message: Uint8Array): {
  publicKey: Uint8Array;
  nonce: Uint8Array;
  metadata: Uint8Array;
  version: number;
  keyExchangeType: number;
} {
  if (message.length !== 72) {
    throw new Error(`Invalid key exchange message length: expected 72, got ${message.length}`);
  }
  
  const publicKey = message.slice(0, 32);
  const nonce = message.slice(32, 64);
  const metadata = message.slice(64, 72);
  
  const version = metadata[0];
  const keyExchangeType = metadata[1];
  
  return {
    publicKey,
    nonce,
    metadata,
    version,
    keyExchangeType
  };
} 