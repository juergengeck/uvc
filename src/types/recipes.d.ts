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
  Group,
  Recipe
} from '@refinio/one.core/lib/recipes';

import type {
  SHA256Hash,
  SHA256IdHash
} from '@refinio/one.core/lib/util/type-checks';

export type {
  Instance,
  Person,
  Group,
  Recipe,
  SHA256Hash,
  SHA256IdHash
}; 

export interface HEALTH_RECIPES {
  HealthDataRecipe: Recipe;
} 