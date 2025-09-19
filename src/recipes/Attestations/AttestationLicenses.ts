/**
 * Attestation Licenses
 * 
 * Defines the rights granted when creating attestations.
 * In a federated world, licenses express what recipients can do with your data.
 */

import type { License } from '@refinio/one.models/lib/recipes/Certificates/License.js';

/**
 * Discovery License - Minimal rights for network participation
 * Grants only the rights needed for basic network routing and discovery.
 */
export const DiscoveryLicense: License = Object.freeze({
    $type$: 'License',
    name: 'Discovery',
    description: '[signature.issuer] grants the right to use this presence information for ' +
                 'network routing and discovery purposes only. Recipients may cache for up to 60 seconds. ' +
                 'This does NOT grant rights for tracking, correlation, or retention beyond the cache period.'
});

/**
 * Owned Device Discovery License - Restricted discovery for owned devices
 * Only the device owner can discover and interact with the device.
 */
export const OwnedDeviceDiscoveryLicense: License = Object.freeze({
    $type$: 'License',
    name: 'OwnedDeviceDiscovery',
    description: '[signature.issuer] grants discovery rights exclusively to [claim.owner]. ' +
                 'Other parties may NOT use this information for any purpose. ' +
                 'This attestation implements silent mode for owned devices.'
});

/**
 * Event Attestation License - For compliance and audit trails
 * Grants rights to use event records for verification and compliance.
 */
export const EventAttestationLicense: License = Object.freeze({
    $type$: 'License',
    name: 'EventAttestation',
    description: '[signature.issuer] grants the right to use this event record for ' +
                 'compliance verification, audit trails, and regulatory reporting. ' +
                 'Recipients MUST preserve the complete attestation chain when presenting to third parties. ' +
                 'This attestation may be retained indefinitely for compliance purposes.'
});

/**
 * Observation License - For sensor readings and observations
 * Grants rights to correlate observations with related events.
 */
export const ObservationLicense: License = Object.freeze({
    $type$: 'License',
    name: 'Observation',
    description: '[signature.issuer] grants the right to correlate this observation ' +
                 'with related events for verification purposes. ' +
                 'Recipients may NOT make claims beyond the stated measurements and confidence levels. ' +
                 'Observation data should be re-requested after [claim.validityPeriod] for accuracy.'
});

/**
 * Correlation License - For third-party verification
 * Grants rights to rely on correlation analysis.
 */
export const CorrelationLicense: License = Object.freeze({
    $type$: 'License',
    name: 'Correlation',
    description: '[signature.issuer] grants the right to rely on this correlation ' +
                 'analysis for verification and compliance purposes. ' +
                 'Recipients MUST include all referenced attestations when using this correlation. ' +
                 'Confidence levels and limitations must be preserved in any derivative use.'
});

/**
 * Chat Message License - For message attestations
 * Grants rights for chat messages in legal contexts.
 */
export const ChatMessageLicense: License = Object.freeze({
    $type$: 'License',
    name: 'ChatMessage',
    description: '[signature.issuer] attests to sending/receiving message [claim.messageId]. ' +
                 'This attestation may be presented as evidence of communication. ' +
                 'Recipients must preserve the complete message chain for context.'
});

/**
 * Device Capability License - For capability declarations
 * Grants rights to rely on device capability information.
 */
export const DeviceCapabilityLicense: License = Object.freeze({
    $type$: 'License',
    name: 'DeviceCapability',
    description: '[signature.issuer] grants the right to rely on these capability declarations ' +
                 'for service discovery and interaction. ' +
                 'Capabilities may change; request updates before critical operations.'
});

/**
 * Helper to determine if a license grants public discovery rights
 */
export function grantsPublicDiscovery(license: License): boolean {
    return license.name === 'Discovery' || 
           license.name === 'DeviceCapability';
}

/**
 * Helper to determine if a license restricts access to specific parties
 */
export function isRestrictedLicense(license: License): boolean {
    return license.name === 'OwnedDeviceDiscovery';
}

/**
 * Helper to extract validity period from license description
 * Returns seconds or null if not specified
 */
export function getLicenseValidityPeriod(license: License): number | null {
    if (license.name === 'Discovery') return 60; // 60 seconds
    if (license.name === 'Observation') return 3600; // 1 hour
    return null; // Indefinite
}