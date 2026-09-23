/**
 * IoM (self-device) invitation URL codec for the UVC lab lane.
 *
 * Wire format mirrors the ONE stack's canonical invitation: the invitation
 * travels as `{origin}/invites/inviteDevice/?invited=true&connectionMode=primed`
 * with the owner hint as `fe`/`fdi` query params and the pairing handshake as
 * an `encodeURIComponent(JSON)` fragment carrying `{token, url, publicKey,
 * pairingProtocolVersion, pairingMode: "primed", identityRelation:
 * "same-person", deviceEnrollmentPersonId, mode: "IoM"}`. The fragment `url`
 * is the Glue commserver both sides dial. The visible origin is only the UVC
 * lane entry point and is never fetched by the codec.
 *
 * The invitation fragment carries the canonical commserver URL returned by
 * PairingManager. The visible URL points back to the UVC lane so scanning it
 * opens the joining app; it is not a relay endpoint.
 *
 * The pairing protocol version is injected by the caller (it lives in
 * one.models, which this runtime-import-free module must not touch) so the
 * strict version check stays testable in jest.
 */

export interface UvcIoMInvite {
  token: string;
  /** Commserver both devices dial for discovery and pairing. */
  url: string;
  publicKey: string;
  pairingProtocolVersion: number;
  pairingMode: 'primed';
  identityRelation: 'same-person';
  /** Owner Person id hash; the acceptor must hold this exact identity. */
  deviceEnrollmentPersonId: string;
  mode: 'IoM';
  /** Owner email from the `fe` query param; the identity hint. */
  email: string;
}

const HEX_64 = /^[0-9a-fA-F]{64}$/;
// Pairing tokens use the one.core 64-char alphabet, not hex.
const TOKEN_PATTERN = /^[0-9a-zA-Z_-]{16,128}$/;
const INVITE_DEVICE_PATH = /\/(?:invites\/)?invitedevice(?:\/|$)/;
const INVITE_PARTNER_PATH = /\/(?:invites\/)?invitepartner(?:\/|$)/;

function reject(reason: string): never {
  throw new Error(`UVC lab: not a lane IoM invitation (${reason}).`);
}

function validateCommServerUrl(commServerUrl: string): void {
  let url: URL;
  try {
    url = new URL(commServerUrl);
  } catch {
    return reject('bad commserver');
  }
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return reject('bad commserver');
}

/** Expo Router can serialize a fragment before its search parameters. Restore
 * only the encoded JSON invitation shape; payload validation remains strict. */
export function normalizeUvcLabUrl(value: string): URL {
  const url = new URL(value);
  const separator = url.hash.indexOf('?');
  if (!url.search && /^#%7b/i.test(url.hash) && separator > 0) {
    const payload = url.hash.slice(0, separator);
    const query = new URLSearchParams(url.hash.slice(separator + 1));
    if (/%7d$/i.test(payload) && query.get('invited') === 'true') {
      url.search = query.toString();
      url.hash = payload;
    }
  }
  return url;
}

/** Mint the shareable IoM URL for a primed same-person invitation. */
export function buildUvcIoMInviteUrl(input: {
  appBaseUrl: string;
  email: string;
  person: string;
  token: string;
  url: string;
  publicKey: string;
  pairingProtocolVersion: number;
}): { invitationUrl: string } {
  const { appBaseUrl, email, person, token, url, publicKey, pairingProtocolVersion } = input;
  if (!email.includes('@')) reject('bad email');
  if (!TOKEN_PATTERN.test(token)) reject('bad token');
  validateCommServerUrl(url);
  let inviteUrl: URL;
  try {
    inviteUrl = new URL(appBaseUrl);
  } catch {
    return reject('bad app URL');
  }
  inviteUrl.searchParams.set('invited', 'true');
  inviteUrl.searchParams.set('connectionMode', 'primed');
  inviteUrl.searchParams.set('fe', email);
  inviteUrl.searchParams.set('fdi', person);
  inviteUrl.hash = encodeURIComponent(
    JSON.stringify({
      token,
      url,
      publicKey,
      pairingProtocolVersion,
      pairingMode: 'primed',
      identityRelation: 'same-person',
      deviceEnrollmentPersonId: person,
      mode: 'IoM',
    }),
  );
  return { invitationUrl: inviteUrl.toString() };
}

/**
 * Strictly validate an invitation URL; anything else fails fast. Only the
 * path (mode), the `fe`/`fdi` params and the fragment (token, commserver)
 * matter — the origin is never fetched.
 */
export function decodeUvcIoMInvite(invitationUrl: string, pairingProtocolVersion: number): UvcIoMInvite {
  let url: URL;
  try {
    url = normalizeUvcLabUrl(String(invitationUrl ?? '').trim());
  } catch {
    return reject('unparseable URL');
  }
  if (INVITE_PARTNER_PATH.test(url.pathname.toLowerCase())) return reject('wrong mode');
  const pathMode = INVITE_DEVICE_PATH.test(url.pathname.toLowerCase()) ? 'IoM' : undefined;
  if (!url.hash || url.hash.length <= 1) return reject('missing payload');
  let fragment: Record<string, unknown>;
  try {
    fragment = JSON.parse(decodeURIComponent(url.hash.slice(1))) as Record<string, unknown>;
  } catch {
    return reject('undecodable payload');
  }
  const embeddedMode = fragment.mode === 'IoM' ? 'IoM' : undefined;
  if (fragment.mode !== undefined && !embeddedMode) return reject('wrong mode');
  if (pathMode && embeddedMode && pathMode !== embeddedMode) return reject('mode conflict');
  if ((pathMode ?? embeddedMode) !== 'IoM') return reject('wrong mode');
  if (typeof fragment.token !== 'string' || !TOKEN_PATTERN.test(fragment.token)) return reject('bad token');
  if (typeof fragment.url !== 'string') return reject('bad commserver');
  validateCommServerUrl(fragment.url);
  if (typeof fragment.publicKey !== 'string' || fragment.publicKey.length < 32) return reject('bad public key');
  if (fragment.pairingProtocolVersion !== pairingProtocolVersion) return reject('protocol mismatch');
  if (fragment.pairingMode !== 'primed') return reject('bad pairing mode');
  if (fragment.identityRelation !== 'same-person') return reject('wrong mode');
  const email = url.searchParams.get('fe') ?? undefined;
  if (!email || !email.includes('@')) return reject('bad email');
  const queryPerson = url.searchParams.get('fdi') ?? undefined;
  const fragmentPerson = fragment.deviceEnrollmentPersonId;
  if (queryPerson !== undefined && fragmentPerson !== undefined && queryPerson !== fragmentPerson) {
    return reject('person conflict');
  }
  const person = queryPerson ?? fragmentPerson;
  if (typeof person !== 'string' || !HEX_64.test(person)) return reject('bad person');
  return {
    token: fragment.token,
    url: fragment.url,
    publicKey: fragment.publicKey,
    pairingProtocolVersion: fragment.pairingProtocolVersion,
    pairingMode: 'primed',
    identityRelation: 'same-person',
    deviceEnrollmentPersonId: person,
    mode: 'IoM',
    email,
  };
}
