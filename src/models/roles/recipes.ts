/**
 * Role Model Recipes
 * 
 * Defines recipes for role management models.
 * Core recipes (like Access, Group) are handled by one.core.
 * This module only defines app-specific role recipes.
 */

import type { Recipe } from '@refinio/one.core/lib/recipes';
import type { Person } from '@refinio/one.core/lib/recipes';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';
import type { OneObjectTypeNames } from '@refinio/one.core/lib/recipes';

// Use core Group type
export type { Group } from '@refinio/one.core/lib/recipes';

/**
 * Role Certificate for assigning roles to persons
 */
export interface RoleCertificate {
    $type$: 'RoleCertificate';
    person: SHA256IdHash<Person>;
    role: string;
    app: string;
}

// Role certificate recipe
const RoleCertificateRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'RoleCertificate',
    rule: [
        { 
            itemprop: 'person',
            itemtype: { type: 'referenceToId', allowedTypes: new Set(['Person']) }
        },
        { 
            itemprop: 'role',
            itemtype: { type: 'string' }
        },
        { 
            itemprop: 'app',
            itemtype: { type: 'string' }
        }
    ]
};

// App-specific role recipes
export const RoleRecipes: Recipe[] = [RoleCertificateRecipe];

// No app-specific reverse maps needed - using core ones
export const RoleReverseMaps: [string, Set<string>][] = [];
export const RoleReverseMapsForIdObjects: [string, Set<string>][] = [];

export default {
    RoleRecipes,
    RoleReverseMaps,
    RoleReverseMapsForIdObjects,
};