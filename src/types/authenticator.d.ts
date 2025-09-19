/**
 * Authenticator Type Declarations
 * 
 * These types match the one.models MultiUser API exactly.
 */

import type { Recipe } from '@refinio/one.core/lib/recipes';
import type { OneObjectTypeNames, OneVersionedObjectTypeNames } from '@refinio/one.core/lib/recipes';
import type { AuthenticatorOptions } from '@refinio/one.models/lib/models/Authenticator/Authenticator.js';

// Re-export the base authenticator options
export type { AuthenticatorOptions } from '@refinio/one.models/lib/models/Authenticator/Authenticator.js';

// No extensions - use the types exactly as defined in one.models
export default {}; 