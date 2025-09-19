import { SET_ACCESS_MODE } from '@refinio/one.core/lib/storage-base-common.js';
import { Buffer } from '@refinio/one.core/lib/system/expo/index.js';
import { createCryptoHash } from '@refinio/one.core/lib/system/crypto-helpers.js';

/**
 * Build an IdAccess object array for use with the `createAccess` helper from ONE.core.
 * This replicates the exact signature used in one.leute so we don’t spread
 * inline object-literals (and potential typos) all over the code base.
 *
 * @param objectId    The hash of the object (or version) we want to grant access to
 * @param personIds   Optional list of person hashes to grant explicit access to
 * @param groupIds    Optional list of group hashes to grant access through groups
 */
export function buildAccessGrant(
  objectId: string,
  personIds: string[] = [],
  groupIds: string[] = [],
  useId: boolean = false // when true, create an IdAccess instead of Access
) {
  // ONE platform requires that access grants have either persons OR groups, not empty arrays for both
  // If both are empty, skip creating the access grant entirely
  if (personIds.length === 0 && groupIds.length === 0) {
    console.warn('[buildAccessGrant] Skipping access grant creation - both personIds and groupIds are empty');
    return [];
  }

  if (useId) {
    // Explicitly requested IdAccess variant
    return [{
      id: objectId as any,
      person: personIds as any,
      group: groupIds as any,
      mode: SET_ACCESS_MODE.ADD
    }];
  }

  /*
   * ONE.core replication (CHUM exporter) expects regular `Access` objects (with the
   * `object` field) for versioned objects like ChatMessage, ChannelEntry, etc.
   * The previous implementation always created `IdAccess` variants which are
   * ignored by the exporter, resulting in remote peers never receiving the newly
   * created data.  We now generate the correct `Access` form by default.
   */
  return [{
    object: objectId as any,
    person: personIds as any,
    group: groupIds as any,
    mode: SET_ACCESS_MODE.ADD
  }];
}

/**
 * Convert the base64-url encoded token string returned from PairingManager.createInvitation()
 * into the 64-character hexadecimal SHA-256 object ID that ONE.core expects when calling
 * createAccess().  If the input does not look like a base64 string the original value is
 * returned unchanged so callers can be liberal in what they accept.
 */
export async function tokenToHex(token: string): Promise<string> {
  // 1. If it already looks like a 64-character lowercase hex string → return
  if (/^[0-9a-f]{64}$/.test(token)) {
    return token;
  }

  // 2. Try base-64-url decode → hex
  try {
    const padding = '='.repeat((4 - (token.length % 4)) % 4);
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/') + padding;
    const bytes = Buffer.from(base64, 'base64');
    if (bytes.length === 32) {
      return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (_e) {
    /* fall through */
  }

  // 3. Fallback: derive SHA-256 with one.core helper (platform-agnostic)
  try {
    const hashHex = await createCryptoHash(token);
    if (hashHex) return hashHex as string;
  } catch (_e) {
    /* ignore */
  }

  console.warn('[access] tokenToHex: unable to derive 64-char hex, returning original');
  return token;
} 