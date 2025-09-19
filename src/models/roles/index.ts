/**
 * Role Module Index
 * 
 * Exports all role-related types and recipes.
 * Also registers role recipes with ONE's runtime.
 */

export * from './recipes';
export * from './role-utils';
export * from './BaseRoleModel';

// Register recipes with ONE
import { addRecipeToRuntime } from '@refinio/one.core/lib/object-recipes';
import { ROLE_RECIPES } from './recipes';

// Register all recipes
export function registerRoleRecipes(): void {
    ROLE_RECIPES.forEach(recipe => addRecipeToRuntime(recipe));
}

export default {
    registerRoleRecipes,
};