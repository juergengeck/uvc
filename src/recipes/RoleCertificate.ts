/**
 * Role Certificate Recipe
 * 
 * Defines the recipe for role certificates used in role management.
 */

import type { Person } from '@refinio/one.core/lib/recipes.js';
import type { Recipe, OneObjectTypeNames } from '@refinio/one.core/lib/recipes.js';
import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { License } from '@refinio/one.models/lib/recipes/Certificates/License.js';
import { registerLicense } from '@refinio/one.models/lib/misc/Certificates/LicenseRegistry.js';

/**
 * License for assigning roles to users
 */
export const RoleLicense: License = Object.freeze({
    $type$: 'License',
    name: 'Role',
    description: '[signature.issuer] affirms that [person] has [role] in context of application [app].'
});

registerLicense(RoleLicense, 'RoleCertificate');

/**
 * Role certificate interface
 */
export interface IRoleCertificate {
    $type$: 'RoleCertificate';
    person: SHA256IdHash<Person>;
    role: string;
    app: string;
    license: SHA256Hash<License>;
}

/**
 * Role certificate recipe
 */
export const RoleCertificateRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'RoleCertificate',
    rule: [
        {
            itemprop: 'person',
            itemtype: { type: 'referenceToId', allowedTypes: new Set(['Person']) }
        },
        {
            itemprop: 'role'
        },
        {
            itemprop: 'app'
        },
        {
            itemprop: 'license',
            itemtype: { type: 'referenceToObj', allowedTypes: new Set(['License']) }
        }
    ]
};

// Only map RoleCertificate type, not Group
export const RoleCertificateReverseMap: [OneObjectTypeNames, Set<string>] = [
    'RoleCertificate',
    new Set(['person', 'role', 'app', 'license'])
];

// Export the RoleCertificate value object
export const RoleCertificate = {
    Recipe: RoleCertificateRecipe,
    ReverseMap: RoleCertificateReverseMap,
    License: RoleLicense,
    create: (person: SHA256IdHash<Person>, role: string, app: string, license: SHA256Hash<License>): IRoleCertificate => ({
        $type$: 'RoleCertificate',
        person,
        role,
        app,
        license
    })
};

// #### one.core interfaces ####
declare module '@OneObjectInterfaces' {
    export interface OneCertificateInterfaces {
        RoleCertificate: IRoleCertificate;
    }
}

export default RoleCertificate;