/**
 * Recipe Types
 * 
 * Re-exports core types from one.core.
 * This module serves as a central point for type imports in the application.
 * 
 * @module RecipeTypes
 */

import type { 
  Instance,
  Person,
  Group
} from '@refinio/one.core/lib/recipes.d.ts';

import type {
  SHA256Hash,
  SHA256IdHash
} from '@refinio/one.core/lib/util/type-checks';

export type {
  Instance,
  Person,
  Group,
  SHA256Hash,
  SHA256IdHash
}; 

// Add default export of empty object for type files
export default {};