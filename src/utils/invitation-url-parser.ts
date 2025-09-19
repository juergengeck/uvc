/**
 * Invitation URL Parser
 * 
 * Consolidated utility for parsing invitation URLs following the one.leute reference implementation.
 * Based on one.leute/src/utils/pairing.ts pattern.
 * 
 * Replaces duplicate logic from:
 * - InviteManager.extractInvitationFromHash()
 * - NetworkSettingsService.parseInvitationUrl()
 */

import { isInvitation } from '@refinio/one.models/lib/misc/ConnectionEstablishment/PairingManager.js';
import type { Invitation } from '@refinio/one.models/lib/misc/ConnectionEstablishment/PairingManager.js';

export type InvitationMode = 'IoM' | 'IoP';

export interface ParsedInvitation {
  mode: InvitationMode | undefined;
  invitation: Invitation | undefined;
  error?: string;
}

/**
 * Parse invitation URL following the one.leute pattern
 * 
 * @param invitationLink URL in format: https://edda.one/invites/invitePartner/?invited=true#[encoded-json]
 * @returns Parsed invitation with mode detection
 */
export function parseInvitationUrl(invitationLink: string): ParsedInvitation {
  try {
    // 1. Detect invitation mode based on URL pattern (from one.leute)
    let mode: InvitationMode | undefined;
    
    if (invitationLink.includes('invites/inviteDevice/?invited=true')) {
      mode = 'IoM';  // Instance of Machine (device)
    } else if (invitationLink.includes('invites/invitePartner/?invited=true')) {
      mode = 'IoP';  // Instance of Person (partner)
    }
    
    // 2. Extract and parse invitation data (from one.leute pattern)
    const invitation = getPairingInformation(invitationLink);
    
    if (!invitation) {
      return {
        mode,
        invitation: undefined,
        error: 'Failed to extract valid invitation data from URL'
      };
    }
    
    return {
      mode,
      invitation,
      error: undefined
    };
    
  } catch (error) {
    return {
      mode: undefined,
      invitation: undefined,
      error: error instanceof Error ? error.message : 'Unknown parsing error'
    };
  }
}

/**
 * Extract pairing information from invitation URL
 * Direct implementation from one.leute/src/utils/pairing.ts
 * 
 * @param invitationLink URL containing invitation data in hash fragment
 * @returns Invitation object if valid, undefined otherwise
 */
function getPairingInformation(invitationLink: string): Invitation | undefined {
  try {
    const invitation = JSON.parse(
      decodeURIComponent(invitationLink.split('#')[1])
    ) as Invitation;
    
    if (isInvitation(invitation)) {
      return invitation;
    }
    
    return undefined;
  } catch (_e) {
    return undefined;
  }
}

/**
 * Legacy compatibility function for existing InviteManager usage
 * Maps to the new parseInvitationUrl function
 * 
 * @param url Invitation URL
 * @returns Invitation data or null (legacy format)
 */
export function extractInvitationFromHash(url: string): any | null {
  const result = parseInvitationUrl(url);
  
  if (result.invitation) {
    // Return in the format expected by existing code
    return {
      token: result.invitation.token,
      publicKey: result.invitation.publicKey,
      url: result.invitation.url
    };
  }
  
  return null;
}

/**
 * Check if a URL is a valid invitation URL
 * 
 * @param url URL to check
 * @returns true if URL contains valid invitation data
 */
export function isValidInvitationUrl(url: string): boolean {
  const result = parseInvitationUrl(url);
  return result.invitation !== undefined && !result.error;
}

/**
 * Get invitation mode from URL without full parsing
 * 
 * @param url Invitation URL
 * @returns Invitation mode or undefined
 */
export function getInvitationMode(url: string): InvitationMode | undefined {
  if (url.includes('invites/inviteDevice/?invited=true')) {
    return 'IoM';
  } else if (url.includes('invites/invitePartner/?invited=true')) {
    return 'IoP';
  }
  return undefined;
} 