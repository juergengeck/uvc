import type { Person } from '@refinio/one.core/lib/recipes';
import type { Recipe, OneObjectTypeNames } from '@refinio/one.core/lib/recipes';
import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';
import type { License } from '@refinio/one.models/lib/recipes/Certificates/License';
import { registerLicense } from '@refinio/one.models/lib/misc/Certificates/LicenseRegistry';

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
export interface RoleCertificate {
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

export default RoleCertificateRecipe; 