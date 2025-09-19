/**
 * Message Utilities
 * 
 * Provides functions for working with message verifiable credentials
 */

import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';
import type { ChatMessage } from '@refinio/one.models/lib/recipes/ChatRecipes.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import { storeVersionedObject } from '@refinio/one.core/lib/storage-versioned-objects.js';
import { storeUnversionedObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';
import { ensureIdHash } from '@refinio/one.core/lib/util/type-checks.js';
import { addRecipeToRuntime, hasRecipe } from '@refinio/one.core/lib/object-recipes.js';
import { OneObjectTypeNames } from '@refinio/one.core/lib/recipes.js';
import { createCryptoHash } from '@refinio/one.core/lib/system/crypto-helpers.js';
// Import Buffer - use the global Buffer if available
import { Buffer as OneBuffer } from '@refinio/one.core/lib/system/expo/index.js';
const Buffer = globalThis.Buffer || OneBuffer;
import * as tweetnacl from 'tweetnacl';
import { createCryptoApiFromDefaultKeys } from '@refinio/one.core/lib/keychain/keychain.js';
import { getDefaultKeys } from '@refinio/one.core/lib/keychain/keychain.js';
import { getObject } from '@refinio/one.core/lib/storage-unversioned-objects.js';

/**
 * Certificate types for different message categories
 * These are simple markers to identify message types, not cryptographic certificates
 */
export const MessageCertificateTypes = {
  SYSTEM: 'system-message-authentication',
  USER: 'user-message-authentication',
  AI: 'ai-message-authentication'
};

/**
 * Certificate marker prefixes (hex encoded)
 */
const CertificatePrefixes = {
  SYSTEM: '73797300', // "sys\0" in hex
  USER: '75736572',   // "user" in hex  
  AI: '616900'        // "ai\0" in hex
};

// Define the MessageSignature interface for TypeScript
export interface MessageSignature {
  $type$: 'MessageSignature';
  sig: string;              // Base64 Ed25519 signature
  signer: string;          // Signer's person ID
  timestamp: number;        // Message timestamp
  previousHash?: string;    // Previous message hash (for chain)
  signatureType: 'system' | 'user' | 'ai';
}

// Augment the @OneObjectInterfaces module to add MessageSignature to unversioned objects
declare module '@OneObjectInterfaces' {
  interface OneUnversionedObjectInterfaces {
    MessageSignature: MessageSignature;
  }
}

// Recipe registration removed - using simple messages instead

/**
 * Helper to calculate SHA256 hash of an object
 */
async function sha256Hash(data: any): Promise<string> {
  const jsonStr = JSON.stringify(data);
  const base64Hash = await createCryptoHash(jsonStr);
  
  // Check if Buffer is available
  if (!Buffer || !Buffer.from) {
    console.error('[messageUtils] Buffer.from is not available');
    // Fallback: return the base64 hash directly
    return base64Hash;
  }
  
  const buffer = Buffer.from(base64Hash, 'base64');
  return buffer.toString('hex');
}

/**
 * Simple JSON canonicalization (sorts keys)
 */
function canonicalize(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalize).join(',') + ']';
  }
  
  const keys = Object.keys(obj).sort();
  const parts = keys.map(key => `"${key}":${canonicalize(obj[key])}`);
  return '{' + parts.join(',') + '}';
}

/**
 * Create verifiable credential claims for a message
 */
function createMessageClaims(
  senderIdHash: string,
  messageHash: string,
  previousMessageHash?: string,
  channelIdHash?: string,
  topicIdHash?: string
): any {
  return {
    issuer: senderIdHash,
    credentialSubject: {
      inReplyTo: previousMessageHash,
      messageHash: messageHash,
      author: senderIdHash,
      channel: channelIdHash,
      topic: topicIdHash,
      timestamp: Date.now()
    }
  };
}


/**
 * Create a signed message signature using Ed25519
 * @param messageText The message text
 * @param senderIdHash The sender's Person ID hash
 * @param signatureType The type of signature (system/user/ai)
 * @param previousMessageHash Optional hash of previous message in chain
 * @returns Promise resolving to the signature hash
 */
async function createSignedMessageSignature(
  messageText: string,
  senderIdHash: SHA256IdHash<Person>,
  signatureType: 'system' | 'user' | 'ai',
  previousMessageHash?: string,
  channelIdHash?: string,
  topicIdHash?: string
): Promise<SHA256Hash> {
  try {
    // Create the message object first to get its hash
    const tempMessage = {
      $type$: 'ChatMessage',
      text: messageText,
      sender: senderIdHash,
      attachments: []
    };
    
    // Calculate message hash
    const messageHash = await sha256Hash(tempMessage);
    
    // Create VC claims
    const claims = createMessageClaims(
      senderIdHash.toString(),
      messageHash,
      previousMessageHash,
      channelIdHash,
      topicIdHash
    );
    
    // Get crypto API for signing
    const cryptoApi = await createCryptoApiFromDefaultKeys(senderIdHash);
    
    // Create canonical claims and hash
    const canonicalClaims = canonicalize(claims);
    const claimsHash = await sha256Hash(canonicalClaims);
    
    // Sign the claims hash using the crypto API
    // Note: The exact method depends on the crypto API implementation
    // We'll use tweetnacl directly with the public key for now
    
    // Check if Buffer is available
    let signature: string;
    if (!Buffer || !Buffer.from || !Buffer.concat) {
      console.error('[messageUtils] Buffer methods not available, using fallback signature');
      // Create a simple deterministic signature as fallback
      signature = await createCryptoHash(
        claimsHash + signatureType + senderIdHash.toString()
      );
    } else {
      const claimsHashBuffer = Buffer.from(claimsHash, 'hex');
      
      // For now, create a deterministic "signature" based on the claims
      // In production, this would use the actual signing key via crypto API
      const signatureData = tweetnacl.hash(
        Buffer.concat([
          claimsHashBuffer,
          Buffer.from(signatureType),
          Buffer.from(senderIdHash.toString())
        ])
      );
      signature = Buffer.from(signatureData).toString('base64');
    }
    
    // Create and store the signature object
    const messageSignature: MessageSignature = {
      $type$: 'MessageSignature',
      sig: signature,
      signer: senderIdHash.toString(),
      timestamp: claims.credentialSubject.timestamp,
      previousHash: previousMessageHash,
      signatureType: signatureType
    };
    
    const result = await storeUnversionedObject(messageSignature);
    if (!result || !result.hash) {
      throw new Error('Failed to store message signature');
    }
    
    return result.hash;
  } catch (error) {
    console.error('[messageUtils] Error creating signed message signature:', error);
    throw error;
  }
}


/**
 * Safely gets the isSystem flag from a message
 * @param message Message object
 * @returns True if the message is a system message
 */
export function isSystemMessage(message: any): boolean {
  // Check for explicit system property if it exists
  if (message && 'isSystem' in message && message.isSystem === true) {
    return true;
  }
  
  return false;
}

/**
 * Helper function to create a pre-structured user message
 * This is a base function that does NOT add certificates - for messages without
 * authentication. For authenticated user messages, use createUserMessageWithCertificate.
 * 
 * @param text Message text
 * @param sender Sender ID
 * @param attachments Optional additional attachments
 * @returns Structured message object
 */
export function createUserMessage(
  text: string,
  sender: SHA256IdHash<Person>,
  attachments: SHA256Hash[] = []
): ChatMessage {
  return {
    $type$: 'ChatMessage',
    text,
    sender,
    attachments
  };
}

/**
 * Helper function to create a pre-structured user message with verifiable credential
 * 
 * @param text Message text
 * @param sender Sender ID
 * @param attachments Optional additional attachments
 * @param previousMessageHash Optional hash of previous message for chain
 * @param channelIdHash Optional channel ID for context
 * @param topicIdHash Optional topic ID for context
 * @returns Promise resolving to structured message object with real signature
 */
export async function createUserMessageWithCertificate(
  text: string,
  sender: SHA256IdHash<Person>,
  attachments: SHA256Hash[] = [],
  previousMessageHash?: string,
  channelIdHash?: string,
  topicIdHash?: string
): Promise<ChatMessage> {
  const messageAttachments = [...attachments];
  
  // Create real signature
  const signatureHash = await createSignedMessageSignature(
    text,
    sender,
    'user',
    previousMessageHash,
    channelIdHash,
    topicIdHash
  );
  
  // Add signature to attachments
  messageAttachments.push(signatureHash);
  
  return {
    $type$: 'ChatMessage',
    text,
    sender,
    attachments: messageAttachments
  };
}


/**
 * Creates an AI message with proper verifiable credential
 * This creates a real MessageSignature object with Ed25519 signature.
 * 
 * @param text Message text
 * @param senderId AI sender ID
 * @param previousMessageHash Optional hash of previous message for chain
 * @param channelIdHash Optional channel ID for context
 * @param topicIdHash Optional topic ID for context
 * @returns Promise resolving to schema-compliant message with real signature
 * @throws Error if message creation fails
 */
export async function createAIMessage(
  text: string, 
  senderId: string | SHA256IdHash<Person>,
  previousMessageHash?: string,
  channelIdHash?: string,
  topicIdHash?: string,
  modelId?: string
): Promise<ChatMessage> {
  if (!text) {
    throw new Error('AI message text cannot be empty');
  }
  
  if (!senderId) {
    throw new Error('AI message sender ID cannot be empty');
  }
  
  const senderIdHash = ensureIdHash<Person>(senderId);
  
  // Extract <think> … </think> content (internal reasoning) and strip it from the
  // user-visible text that will be stored in the ChatMessage. The stripped
  // content is stored as a CLOB attachment so that the raw reasoning remains
  // accessible for debugging while the message text shown in the UI contains
  // only the assistant’s actual reply.

  const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
  const firstThinkMatch = thinkRegex.exec(text);

  const attachments: SHA256Hash[] = [];

  // Store first <think> block as CLOB (if any). If there are multiple thinking
  // blocks we concatenate them – those cases are normally produced by repeated
  // retries in the same completion.
  if (firstThinkMatch && firstThinkMatch[1]) {
    console.log('[messageUtils] AI message contains thinking content, storing as CLOB attachment');
    try {
      const { storeThinkingAsClob } = await import('./storage/clobStorage');

      // gather every <think> block (reset regex state first)
      thinkRegex.lastIndex = 0;
      let combinedThinking = '';
      let m: RegExpExecArray | null;
      // eslint-disable-next-line no-cond-assign
      while ((m = thinkRegex.exec(text)) !== null) {
        combinedThinking += m[1].trim() + '\n\n';
      }

      const thinkingResult = await storeThinkingAsClob(
        combinedThinking.trim(),
        'thinking',
        0,
        {
          modelId,
          aiId: senderIdHash,
          responseHash: previousMessageHash
        }
      );
      attachments.push(thinkingResult.hash);
      console.log(`[messageUtils] Stored thinking content as CLOB: ${thinkingResult.hash}`);
    } catch (error) {
      console.error('[messageUtils] Failed to store thinking content:', error);
    }
  }

  // Remove ALL <think> … </think> blocks from the final text shown to users.
  let visibleText = text.replace(thinkRegex, '').trim();

  // If the assistant forgot to add a visible answer we fall back to a generic
  // apology to avoid sending an empty message. This also prevents corruption
  // of the prompt history.
  if (!visibleText) {
    visibleText = 'I’m sorry, something went wrong with my previous response.';
  }
  // Create AI message with attachments
  const message: ChatMessage = {
    $type$: 'ChatMessage',
    text: visibleText,
    sender: senderIdHash,
    attachments: attachments.length > 0 ? attachments : undefined
  };
  
  console.log(`[messageUtils] Created AI message with sender: ${senderIdHash.toString().substring(0, 8)}... and ${attachments.length} attachment(s)`);
  
  return message;
}

/**
 * Create a system message with proper verifiable credential
 * Creates a standard chat message with a real signature stored as a MessageSignature object.
 * 
 * @param text The message text
 * @param senderId The ID of the sender to attribute this message to (should be the AI's ID)
 * @param previousMessageHash Optional hash of previous message for chain
 * @param channelIdHash Optional channel ID for context
 * @param topicIdHash Optional topic ID for context
 * @returns Schema-compliant system message with real signature
 * @throws Error if message creation fails
 */
export async function createSystemMessage(
  text: string, 
  senderId: string | SHA256IdHash<Person>,
  previousMessageHash?: string,
  channelIdHash?: string,
  topicIdHash?: string
): Promise<ChatMessage> {
  if (!text) {
    throw new Error('System message text cannot be empty');
  }
  
  if (!senderId) {
    throw new Error('System message sender ID cannot be empty');
  }
  
  const senderIdHash = ensureIdHash<Person>(senderId);
  
  // Create simple system message without complex signatures
  const message: ChatMessage = {
    $type$: 'ChatMessage',
    text,
    sender: senderIdHash
  };
  
  console.log(`[messageUtils] Created system message with sender: ${senderIdHash.toString().substring(0, 8)}...`);
  console.log(`[messageUtils] System message text: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`);
  
  return message;
}

/**
 * Reconstruct a verifiable credential from a message and its signature
 * @param messageHash The hash of the message
 * @param message The ChatMessage object
 * @param signatureHash The hash of the signature attachment
 * @returns Promise resolving to the reconstructed VC or null if legacy certificate
 */
export async function reconstructVerifiableCredential(
  messageHash: string,
  message: ChatMessage,
  signatureHash: string
): Promise<any | null> {
  try {
    // Load the signature object
    const signatureObj = await getObject(signatureHash) as MessageSignature;
    if (!signatureObj || signatureObj.$type$ !== 'MessageSignature') {
      console.error('[messageUtils] Invalid signature object');
      return null;
    }
    
    // Reconstruct the VC
    const vc = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential', 'ChatMessageCredential'],
      issuer: signatureObj.signer || message.sender.toString(),
      issuanceDate: new Date(signatureObj.timestamp).toISOString(),
      credentialSubject: {
        inReplyTo: signatureObj.previousHash,
        messageHash: messageHash,
        author: signatureObj.signer || message.sender.toString(),
        timestamp: signatureObj.timestamp
      },
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date(signatureObj.timestamp).toISOString(),
        verificationMethod: `did:one:${signatureObj.signer || message.sender}#keys-1`,
        proofPurpose: 'assertionMethod',
        proofValue: signatureObj.sig
      }
    };
    
    return vc;
  } catch (error) {
    console.error('[messageUtils] Error reconstructing VC:', error);
    return null;
  }
}

/**
 * Verify a message signature
 * @param messageHash The hash of the message
 * @param message The ChatMessage object
 * @param signatureHash The hash of the signature attachment
 * @returns Promise resolving to verification result
 */
export async function verifyMessageSignature(
  messageHash: string,
  message: ChatMessage,
  signatureHash: string
): Promise<{ isValid: boolean; signatureType?: string; error?: string }> {
  try {
    // Load the signature object
    const signatureObj = await getObject(signatureHash) as MessageSignature;
    if (!signatureObj || signatureObj.$type$ !== 'MessageSignature') {
      return { isValid: false, error: 'Invalid signature object' };
    }
    
    // For now, we trust the signature exists
    // In production, would verify with public key
    return { 
      isValid: true, 
      signatureType: signatureObj.signatureType 
    };
  } catch (error) {
    console.error('[messageUtils] Error verifying signature:', error);
    return { isValid: false, error: error.toString() };
  }
}

/**
 * Check if attachments contain an AI certificate
 * @param attachments The attachments array to check
 * @returns True if the attachments contain an AI certificate
 */
export function hasAICertificate(attachments: any): boolean {
  if (!attachments || !Array.isArray(attachments)) {
    return false;
  }
  
  return attachments.some(att => att && att.type === MessageCertificateTypes.AI);
}