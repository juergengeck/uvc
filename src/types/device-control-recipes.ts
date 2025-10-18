/**
 * Device Control Recipes for ONE Platform
 *
 * Defines recipes for device commands, responses, and credentials
 * as ONE objects that can be stored/transmitted as microdata.
 *
 * These recipes enable:
 * - Content-addressable device commands (commands are identified by their hash)
 * - Cryptographically verifiable command history
 * - Type-safe command/response structures
 * - Integration with ONE platform storage and versioning
 */

import { Recipe, RecipeRule } from '@refinio/one.core/lib/recipes';

// ============================================================================
// Device Identity Credential
// ============================================================================

export interface DeviceIdentityCredential {
  $type$: 'DeviceIdentityCredential';
  id: string;                    // Unique credential ID
  owner: string;                 // Owner Person ID (SHA256IdHash)
  issuer: string;                // Issuer Person ID (SHA256IdHash)
  issuanceDate: string;         // ISO 8601 date string
  expirationDate?: string;      // Optional expiration (ISO 8601)
  credentialSubject: {
    id: string;                  // Device identifier
    publicKeyHex: string;        // Device public key
    type: string;                // Device type (e.g., 'ESP32', 'LamaDeviceApp')
    capabilities: string[];      // Device capabilities
  };
  proof: {
    type: string;                // Proof type (e.g., 'Ed25519Signature2020')
    created: string;             // ISO 8601 date string
    verificationMethod: string;  // Reference to public key
    proofPurpose: string;        // e.g., 'assertionMethod'
    proofValue: string;          // Signature as base64
  };
}

/**
 * Recipe for DeviceIdentityCredential
 * Used for device authentication and ownership claims
 */
export const DeviceIdentityCredentialRecipe: Recipe = {
  $type$: 'Recipe',
  name: 'DeviceIdentityCredential',
  rule: [
    {
      itemprop: 'id',
      itemtype: { type: 'string' },
      isId: true
    },
    {
      itemprop: 'owner',
      itemtype: { type: 'referenceToId', allowedTypes: new Set(['Person']) }
    },
    {
      itemprop: 'issuer',
      itemtype: { type: 'referenceToId', allowedTypes: new Set(['Person']) }
    },
    {
      itemprop: 'issuanceDate',
      itemtype: { type: 'string' }  // ISO 8601 date
    },
    {
      itemprop: 'expirationDate',
      itemtype: { type: 'string' },  // ISO 8601 date
      optional: true
    },
    {
      itemprop: 'credentialSubject',
      itemtype: {
        type: 'object',
        rules: [
          {
            itemprop: 'id',
            itemtype: { type: 'string' }
          },
          {
            itemprop: 'publicKeyHex',
            itemtype: { type: 'string' }
          },
          {
            itemprop: 'type',
            itemtype: { type: 'string' }
          },
          {
            itemprop: 'capabilities',
            itemtype: {
              type: 'array',
              item: { type: 'string' }
            }
          }
        ]
      }
    },
    {
      itemprop: 'proof',
      itemtype: {
        type: 'object',
        rules: [
          {
            itemprop: 'type',
            itemtype: { type: 'string' }
          },
          {
            itemprop: 'created',
            itemtype: { type: 'string' }
          },
          {
            itemprop: 'verificationMethod',
            itemtype: { type: 'string' }
          },
          {
            itemprop: 'proofPurpose',
            itemtype: { type: 'string' }
          },
          {
            itemprop: 'proofValue',
            itemtype: { type: 'string' }
          }
        ]
      }
    }
  ]
};

// ============================================================================
// LED Control Command
// ============================================================================

export interface LEDControlCommand {
  $type$: 'LEDControlCommand';
  deviceId: string;                              // Target device ID
  state: 'on' | 'off';                           // LED state
  timestamp: number;                             // Unix timestamp in milliseconds
  requestId?: string;                            // Optional request ID for tracking
  issuer?: string;                               // Optional issuer Person ID
}

/**
 * Recipe for LEDControlCommand
 * Used to control ESP32 LED state
 */
export const LEDControlCommandRecipe: Recipe = {
  $type$: 'Recipe',
  name: 'LEDControlCommand',
  rule: [
    {
      itemprop: 'deviceId',
      itemtype: { type: 'string' },
      isId: true
    },
    {
      itemprop: 'state',
      itemtype: { type: 'string' }
    },
    {
      itemprop: 'timestamp',
      itemtype: { type: 'integer' },
      isId: true
    },
    {
      itemprop: 'requestId',
      itemtype: { type: 'string' },
      optional: true
    },
    {
      itemprop: 'issuer',
      itemtype: { type: 'referenceToId', allowedTypes: new Set(['Person']) },
      optional: true
    }
  ]
};

// ============================================================================
// LED Status Response
// ============================================================================

export interface LEDStatusResponse {
  $type$: 'LEDStatusResponse';
  deviceId: string;           // Source device ID
  state: 'on' | 'off';       // Current LED state
  timestamp: number;          // Unix timestamp in milliseconds
  requestId?: string;         // Optional request ID for correlation
  message?: string;           // Optional status message
}

/**
 * Recipe for LEDStatusResponse
 * Response from ESP32 after LED state change
 */
export const LEDStatusResponseRecipe: Recipe = {
  $type$: 'Recipe',
  name: 'LEDStatusResponse',
  rule: [
    {
      itemprop: 'deviceId',
      itemtype: { type: 'string' },
      isId: true
    },
    {
      itemprop: 'state',
      itemtype: { type: 'string' }
    },
    {
      itemprop: 'timestamp',
      itemtype: { type: 'integer' },
      isId: true
    },
    {
      itemprop: 'requestId',
      itemtype: { type: 'string' },
      optional: true
    },
    {
      itemprop: 'message',
      itemtype: { type: 'string' },
      optional: true
    }
  ]
};

// ============================================================================
// Device Discovery Frame
// ============================================================================

export interface DeviceDiscoveryInfo {
  $type$: 'DeviceDiscoveryInfo';
  deviceId: string;           // Device identifier
  deviceType: string;         // Device type (e.g., 'ESP32')
  address: string;            // IP address
  port: number;               // Port number
  timestamp: number;          // Unix timestamp in milliseconds
  hasOwner: boolean;          // Whether device is claimed
  ownerId?: string;           // Owner Person ID (if claimed)
  capabilities?: string[];    // Device capabilities
}

/**
 * Recipe for DeviceDiscoveryInfo
 * Used in DISCOVERY frames for device announcement
 */
export const DeviceDiscoveryInfoRecipe: Recipe = {
  $type$: 'Recipe',
  name: 'DeviceDiscoveryInfo',
  rule: [
    {
      itemprop: 'deviceId',
      itemtype: { type: 'string' },
      isId: true
    },
    {
      itemprop: 'deviceType',
      itemtype: { type: 'string' }
    },
    {
      itemprop: 'address',
      itemtype: { type: 'string' }
    },
    {
      itemprop: 'port',
      itemtype: { type: 'integer' }
    },
    {
      itemprop: 'timestamp',
      itemtype: { type: 'integer' },
      isId: true
    },
    {
      itemprop: 'hasOwner',
      itemtype: { type: 'boolean' }
    },
    {
      itemprop: 'ownerId',
      itemtype: { type: 'referenceToId', allowedTypes: new Set(['Person']) },
      optional: true
    },
    {
      itemprop: 'capabilities',
      itemtype: {
        type: 'array',
        item: { type: 'string' }
      },
      optional: true
    }
  ]
};

// ============================================================================
// Ownership Removal Command
// ============================================================================

export interface OwnershipRemovalCommand {
  $type$: 'OwnershipRemovalCommand';
  deviceId: string;           // Target device ID
  senderPersonId: string;     // Person ID of command sender
  timestamp: number;          // Unix timestamp in milliseconds
}

/**
 * Recipe for OwnershipRemovalCommand
 * Used to remove ownership from a device
 */
export const OwnershipRemovalCommandRecipe: Recipe = {
  $type$: 'Recipe',
  name: 'OwnershipRemovalCommand',
  rule: [
    {
      itemprop: 'deviceId',
      itemtype: { type: 'string' },
      isId: true
    },
    {
      itemprop: 'senderPersonId',
      itemtype: { type: 'referenceToId', allowedTypes: new Set(['Person']) }
    },
    {
      itemprop: 'timestamp',
      itemtype: { type: 'integer' },
      isId: true
    }
  ]
};

// ============================================================================
// Export all recipes for registration
// ============================================================================

/**
 * All device control recipes for registration with ONE.core
 */
export const DEVICE_CONTROL_RECIPES = {
  DeviceIdentityCredential: DeviceIdentityCredentialRecipe,
  LEDControlCommand: LEDControlCommandRecipe,
  LEDStatusResponse: LEDStatusResponseRecipe,
  DeviceDiscoveryInfo: DeviceDiscoveryInfoRecipe,
  OwnershipRemovalCommand: OwnershipRemovalCommandRecipe
};

/**
 * Register all device control recipes with ONE.core
 * Call this during app initialization
 */
export function registerDeviceControlRecipes() {
  // Note: ONE.core recipe registration would go here
  // For now, recipes are defined but not registered with the core
  // This will be integrated when we refactor to use convertObjToMicrodata
  console.log('[DeviceControlRecipes] Recipes defined:', Object.keys(DEVICE_CONTROL_RECIPES));
}
