import type { Recipe } from '@refinio/one.core/lib/recipes.js';
import type { Organisation, Department, Room } from '@OneObjectInterfaces';

export const OrganisationRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Organisation',
    rule: [
        {
            itemprop: 'name',
            itemtype: { type: 'string' }
        },
        {
            itemprop: 'description',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            itemprop: 'owner',
            itemtype: { type: 'string' } // Person ID
        },
        {
            itemprop: 'created',
            itemtype: { type: 'number' }
        },
        {
            itemprop: 'modified',
            itemtype: { type: 'number' }
        },
        {
            itemprop: 'departments',
            itemtype: { type: 'stringifiable' },
            optional: true
        },
        {
            itemprop: 'settings',
            itemtype: { type: 'stringifiable' },
            optional: true
        }
    ]
};

export const DepartmentRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Department',
    rule: [
        {
            itemprop: 'name',
            itemtype: { type: 'string' }
        },
        {
            itemprop: 'description',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            itemprop: 'owner',
            itemtype: { type: 'string' } // Person ID
        },
        {
            itemprop: 'organisation',
            itemtype: { type: 'string' } // Organisation ID
        },
        {
            itemprop: 'created',
            itemtype: { type: 'number' }
        },
        {
            itemprop: 'modified',
            itemtype: { type: 'number' }
        },
        {
            itemprop: 'rooms',
            itemtype: { type: 'stringifiable' },
            optional: true
        },
        {
            itemprop: 'settings',
            itemtype: { type: 'stringifiable' },
            optional: true
        }
    ]
};

export const RoomRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Room',
    rule: [
        {
            itemprop: 'name',
            itemtype: { type: 'string' }
        },
        {
            itemprop: 'description',
            itemtype: { type: 'string' },
            optional: true
        },
        {
            itemprop: 'owner',
            itemtype: { type: 'string' } // Person ID
        },
        {
            itemprop: 'department',
            itemtype: { type: 'string' } // Department ID
        },
        {
            itemprop: 'created',
            itemtype: { type: 'number' }
        },
        {
            itemprop: 'modified',
            itemtype: { type: 'number' }
        },
        {
            itemprop: 'devices',
            itemtype: { type: 'stringifiable' },
            optional: true
        },
        {
            itemprop: 'settings',
            itemtype: { type: 'stringifiable' },
            optional: true
        }
    ]
};

// Re-export the types for convenience
export type { Organisation, Department, Room } from '@OneObjectInterfaces';

const OrganisationalRecipes: Recipe[] = [
    OrganisationRecipe,
    DepartmentRecipe,
    RoomRecipe
];

export default OrganisationalRecipes;