/**
 * Attestation Recipe
 * 
 * Base recipe for all attestations in the system.
 * Every network message, event record, and trust claim is an attestation.
 */

import type { Recipe, OneObjectTypeNames } from '@refinio/one.core/lib/recipes.js';
import type { SHA256Hash } from '@refinio/one.core/lib/util/type-checks.js';
import type { License } from '@refinio/one.models/lib/recipes/Certificates/License.js';

/**
 * Base attestation interface
 * All attestations follow this structure
 */
export interface Attestation {
    $type$: 'Attestation';
    
    /**
     * Type of attestation (e.g., 'DevicePresence', 'EventOccurrence')
     */
    attestationType: string;
    
    /**
     * The claim being made
     * Structure depends on attestationType
     */
    claim: Map<string, any>;
    
    /**
     * License that defines what recipients can do with this attestation
     */
    license: SHA256Hash<License>;
    
    /**
     * When this attestation was created
     */
    timestamp: Date;
    
    /**
     * Optional references to other attestations
     * Used for building trust chains
     */
    references?: SHA256Hash<Attestation>[];
    
    /**
     * Optional expiration time
     * After this time, the attestation should not be relied upon
     */
    validUntil?: Date;
    
    /**
     * Optional subject reference
     * What this attestation is about (if applicable)
     */
    subject?: SHA256Hash;
}

/**
 * Recipe definition for Attestation
 */
export const AttestationRecipe: Recipe = {
    $type$: 'Recipe',
    name: 'Attestation',
    rule: [
        {
            itemprop: 'attestationType',
            itemtype: { type: 'string' }
        },
        {
            itemprop: 'claim',
            itemtype: { type: 'map' }
        },
        {
            itemprop: 'license',
            itemtype: { 
                type: 'referenceToObj', 
                allowedTypes: new Set(['License']) 
            }
        },
        {
            itemprop: 'timestamp',
            itemtype: { type: 'date' }
        },
        {
            itemprop: 'references',
            optional: true,
            itemtype: { 
                type: 'referenceToObj', 
                allowedTypes: new Set(['Attestation']) 
            }
        },
        {
            itemprop: 'validUntil',
            optional: true,
            itemtype: { type: 'date' }
        },
        {
            itemprop: 'subject',
            optional: true,
            itemtype: { 
                type: 'referenceToObj', 
                allowedTypes: new Set(['*']) 
            }
        }
    ]
};

/**
 * Reverse map for querying attestations by what they reference
 */
export const AttestationReverseMap: [OneObjectTypeNames, Set<string>] = [
    'Attestation',
    new Set(['*'])
];

/**
 * Type guard for Attestation
 */
export function isAttestation(obj: any): obj is Attestation {
    return obj && obj.$type$ === 'Attestation';
}

/**
 * Helper to create an attestation
 */
export async function createAttestation(
    attestationType: string,
    claim: Map<string, any>,
    license: SHA256Hash<License>,
    options?: {
        references?: SHA256Hash<Attestation>[];
        validUntil?: Date;
        subject?: SHA256Hash;
    }
): Promise<Attestation> {
    return {
        $type$: 'Attestation',
        attestationType,
        claim,
        license,
        timestamp: new Date(),
        ...(options?.references && { references: options.references }),
        ...(options?.validUntil && { validUntil: options.validUntil }),
        ...(options?.subject && { subject: options.subject })
    };
}

// #### one.core interfaces ####

declare module '@OneObjectInterfaces' {
    export interface OneUnversionedObjectInterfaces {
        Attestation: Attestation;
    }
}