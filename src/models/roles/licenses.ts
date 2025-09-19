/**
 * Role Licenses
 * 
 * Defines licenses used in role management.
 */

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

// Register the license for use with RelationCertificate
registerLicense(RoleLicense, 'RelationCertificate');

export default {
    RoleLicense,
};