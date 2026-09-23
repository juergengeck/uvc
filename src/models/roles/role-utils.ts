/**
 * Role utilities and types
 */

import type { Person } from '@refinio/one.core/lib/recipes.js';
import type { SHA256Hash, SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { RoleCertificate } from '@/utils/RoleCertificate';
import type { CertificateData } from '@refinio/one.models/lib/models/Leute/TrustedKeysManager.js';

type RoleCertificateData = CertificateData<RoleCertificate>;

interface RoleCertificateSource {
    trust: {
        getCertificatesOfType(
            data: SHA256Hash | SHA256IdHash,
            type: 'RoleCertificate'
        ): Promise<RoleCertificateData[]>;
    };
    me(): Promise<{identities(): Iterable<SHA256IdHash<Person>>}>;
}

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
 * UVC facility and operational roles
 */
export enum UvcRole {
    ADMIN = 'admin',
    DOCTOR = 'doctor',
    PHYSICIAN = 'physician',
    OPERATOR = 'operator',
    TECHNICIAN = 'technician',
    AUDITOR = 'auditor',
    PATIENT = 'patient',
    LAMP = 'lamp',
    SENSOR = 'sensor'
}

export interface RoleDescriptor {
    key: string;
    title: string;
    description: string;
    badgeIcon: string;
    color: string;
    authorityLevel: 'root' | 'clinical' | 'technical' | 'observational';
}

export const UVC_ROLE_DESCRIPTORS: Record<string, RoleDescriptor> = {
    admin: {
        key: 'admin',
        title: 'Facility Administrator',
        description: 'Administrative role for key certification and role issuance.',
        badgeIcon: 'shield-crown',
        color: '#dc2626',
        authorityLevel: 'root'
    },
    doctor: {
        key: 'doctor',
        title: 'Clinician / Physician',
        description: 'Authorized to approve disinfection phase protocols, cycle recipes, and trigger emergency stop.',
        badgeIcon: 'stethoscope',
        color: '#2563eb',
        authorityLevel: 'clinical'
    },
    physician: {
        key: 'physician',
        title: 'Attending Physician',
        description: 'Clinical authorization for intervention schedules and patient chamber safety protocols.',
        badgeIcon: 'doctor',
        color: '#3b82f6',
        authorityLevel: 'clinical'
    },
    operator: {
        key: 'operator',
        title: 'Technical Operator',
        description: 'Calibrates 254nm radiometer sensors, monitors quartz lamp tube burn hours, and starts runs.',
        badgeIcon: 'wrench',
        color: '#f59e0b',
        authorityLevel: 'technical'
    },
    technician: {
        key: 'technician',
        title: 'Biomedical Technician',
        description: 'Maintains sensor telemetry, hardware diagnostics, and chamber air handling validation.',
        badgeIcon: 'cog',
        color: '#eab308',
        authorityLevel: 'technical'
    },
    auditor: {
        key: 'auditor',
        title: 'Compliance Auditor',
        description: 'Read-only verification of sealed cryptographic cycle journal chains.',
        badgeIcon: 'clipboard-check',
        color: '#10b981',
        authorityLevel: 'observational'
    },
    patient: {
        key: 'patient',
        title: 'Patient / Subject',
        description: 'Read-only access to assigned cycle certificates and personal exposure logs.',
        badgeIcon: 'account',
        color: '#6b7280',
        authorityLevel: 'observational'
    },
    lamp: {
        key: 'lamp',
        title: 'UVC Emitter Fixture',
        description: 'Headless lamp device node providing UV-C 254nm germicidal output.',
        badgeIcon: 'lightbulb',
        color: '#a855f7',
        authorityLevel: 'technical'
    },
    sensor: {
        key: 'sensor',
        title: 'Radiometer / Dosimeter',
        description: 'Headless sensor node streaming real-time irradiance and cumulative dose metrics.',
        badgeIcon: 'gauge',
        color: '#06b6d4',
        authorityLevel: 'technical'
    }
};

/**
 * Check if a person has a specific role
 */
export async function hasRole(
    leuteModel: RoleCertificateSource,
    personId: SHA256IdHash<Person>,
    role: Role | UvcRole | string,
    appName: string = 'uvc'
): Promise<boolean> {
    try {
        // Get all certificates for this person
        const certificatesData = await leuteModel.trust.getCertificatesOfType(
            personId,
            'RoleCertificate'
        );

        // Check for role certificate
        for (const certificateData of certificatesData) {
            if (!certificateData.trusted) continue;
            const certificate = certificateData.certificate as RoleCertificate;
            if (
                (!appName || certificate.app === appName) &&
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
    leuteModel: RoleCertificateSource,
    role: Role | UvcRole | string,
    appName: string = 'uvc'
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
                return (
                    cert.trusted &&
                    (!appName || certificate.app === appName) &&
                    certificate.role === role
                );
            })
            .map(cert => cert.certificate.person);
    } catch (error) {
        console.error(`[role-utils] Error getting persons with role:`, error);
        return [];
    }
}

export default {
    Role,
    UvcRole,
    UVC_ROLE_DESCRIPTORS,
    hasRole,
    getPersonIdsForRole
};
