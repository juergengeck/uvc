/**
 * Role utilities and types
 */

import type { Person } from '@refinio/one.core/lib/recipes';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';
import type LeuteModel from '@refinio/one.models/lib/models/Leute/LeuteModel';
import type { RoleCertificate } from '@/utils/RoleCertificate';
import type { CertificateData } from '@refinio/one.models/lib/models/Leute/TrustedKeysManager';

/**
 * Available roles in the system
 */
export enum Role {
    ADMIN = 'admin',
    CLINIC = 'clinic',
    PHYSICIAN = 'physician',
    PATIENT = 'patient'
}

/**
 * Check if a person has a specific role
 */
export async function hasRole(
    leuteModel: LeuteModel,
    personId: SHA256IdHash<Person>,
    role: Role,
    appName: string
): Promise<boolean> {
    try {
        // Get all certificates for this person
        const certificatesData = await leuteModel.trust.getCertificatesOfType(
            personId,
            'RoleCertificate'
        );

        // Check for role certificate
        for (const certificateData of certificatesData) {
            const certificate = certificateData.certificate as RoleCertificate;
            if (
                certificate.app === appName &&
                certificate.role === role &&
                certificate.person === personId
            ) {
                return true;
            }
        }

        return false;
    } catch (error) {
        console.error('Error checking role:', error);
        return false;
    }
}

/**
 * Get all person IDs that have a specific role
 */
export async function getPersonIdsForRole(
    leuteModel: LeuteModel,
    role: Role,
    appName: string
): Promise<SHA256IdHash<Person>[]> {
    try {
        // Get all certificates for all persons
        const me = await leuteModel.me();
        const allPersons = me.identities();
        const allCertificates: CertificateData<RoleCertificate>[] = [];
        
        // Collect all role certificates
        for (const personId of allPersons) {
            const certificates = await leuteModel.trust.getCertificatesOfType(
                personId,
                'RoleCertificate'
            );
            allCertificates.push(...certificates);
        }
        
        // Filter for matching role certificates
        return allCertificates
            .filter(cert => {
                const certificate = cert.certificate;
                return certificate.app === appName && certificate.role === role;
            })
            .map(cert => cert.certificate.person);
    } catch (error) {
        console.error(`[role-utils] Error getting persons with role:`, error);
        return [];
    }
}

export default {
    Role,
};