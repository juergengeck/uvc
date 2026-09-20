/**
 * IoM (self-device) invitation URL codec for the UVC lab lane.
 *
 * Wire format mirrors the ONE stack's canonical invitation: the invitation
 * travels as `{origin}/invites/inviteDevice/?invited=true&connectionMode=primed`
 * with the owner hint as `fe`/`fdi` query params and the pairing handshake as
 * an `encodeURIComponent(JSON)` fragment carrying `{token, url, publicKey,
 * pairingProtocolVersion, pairingMode: "primed", identityRelation:
 * "same-person", deviceEnrollmentPersonId, mode: "IoM"}`. The fragment `url`
 * is the join-side relay room; the origin is only an entry point and is
 * never fetched. Acceptance is paste-only; no route links to it.
 *
 * The pairing protocol version is injected by the caller (it lives in
 * one.models, which this runtime-import-free module must not touch) so the
 * strict version check stays testable in jest.
 */

export interface UvcIoMInvite {
  token: string;
  /** Join-side rendezvous room both devices dial through the relay. */
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

export function relayRoomUrl(relay: string, token: string, side: 'host' | 'join'): string {
  return `${relay}?token=${token}&side=${side}`;
}

function relayHttpOrigin(relayUrl: string): string {
  let url: URL;
  try {
    url = new URL(relayUrl);
  } catch {
    return reject('bad rendezvous');
  }
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return reject('bad rendezvous');
  return `${url.protocol === 'wss:' ? 'https:' : 'http:'}//${url.host}`;
}

/** Mint the shareable IoM URL for a primed same-person invitation. */
export function buildUvcIoMInviteUrl(input: {
  relayUrl: string;
  email: string;
  person: string;
  token: string;
  publicKey: string;
  pairingProtocolVersion: number;
}): { invitationUrl: string; joinRoomUrl: string } {
  const { relayUrl, email, person, token, publicKey, pairingProtocolVersion } = input;
  if (!email.includes('@')) reject('bad email');
  if (!TOKEN_PATTERN.test(token)) reject('bad token');
  const origin = relayHttpOrigin(relayUrl);
  const joinRoomUrl = relayRoomUrl(relayUrl, token, 'join');
  const inviteUrl = new URL(`${origin}/invites/inviteDevice/`);
  inviteUrl.searchParams.set('invited', 'true');
  inviteUrl.searchParams.set('connectionMode', 'primed');
  inviteUrl.searchParams.set('fe', email);
  inviteUrl.searchParams.set('fdi', person);
  inviteUrl.hash = encodeURIComponent(
    JSON.stringify({
      token,
      url: joinRoomUrl,
      publicKey,
      pairingProtocolVersion,
      pairingMode: 'primed',
      identityRelation: 'same-person',
      deviceEnrollmentPersonId: person,
      mode: 'IoM',
    }),
  );
  return { invitationUrl: inviteUrl.toString(), joinRoomUrl };
}

/**
 * Strictly validate an invitation URL; anything else fails fast. Only the
 * path (mode), the `fe`/`fdi` params and the fragment (token, relay room)
 * matter — the origin is never fetched.
 */
export function decodeUvcIoMInvite(invitationUrl: string, pairingProtocolVersion: number): UvcIoMInvite {
  let url: URL;
  try {
    url = new URL(String(invitationUrl ?? '').trim());
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
  if (typeof fragment.url !== 'string') return reject('bad rendezvous');
  relayHttpOrigin(fragment.url);
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
