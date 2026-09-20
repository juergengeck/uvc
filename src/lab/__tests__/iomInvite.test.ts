import { buildUvcIoMInviteUrl, decodeUvcIoMInvite } from '../iomInvite.ts';

const VERSION = 7;
const PERSON = 'a'.repeat(64);
const PUBLIC_KEY = 'k'.repeat(40);
const TOKEN = 'u0j_hEFqjQ93oS_GB8-Lxyz12';
const RELAY = 'wss://relay.example.test/comm';
const EMAIL = 'admin@lab.local';

const built = (): string =>
  buildUvcIoMInviteUrl({ relayUrl: RELAY, email: EMAIL, person: PERSON, token: TOKEN, publicKey: PUBLIC_KEY, pairingProtocolVersion: VERSION })
    .invitationUrl;

describe('lane IoM invitation codec', () => {
  it('round-trips a minted invitation', () => {
    const { invitationUrl, joinRoomUrl } = buildUvcIoMInviteUrl({
      relayUrl: RELAY,
      email: EMAIL,
      person: PERSON,
      token: TOKEN,
      publicKey: PUBLIC_KEY,
      pairingProtocolVersion: VERSION,
    });
    expect(joinRoomUrl).toBe(`${RELAY}?token=${TOKEN}&side=join`);
    expect(decodeUvcIoMInvite(invitationUrl, VERSION)).toEqual({
      token: TOKEN,
      url: joinRoomUrl,
      publicKey: PUBLIC_KEY,
      pairingProtocolVersion: VERSION,
      pairingMode: 'primed',
      identityRelation: 'same-person',
      deviceEnrollmentPersonId: PERSON,
      mode: 'IoM',
      email: EMAIL,
    });
  });

  it('rejects protocol mismatch', () => {
    expect(() => decodeUvcIoMInvite(built(), VERSION + 1)).toThrow('protocol mismatch');
  });

  it('rejects partner-mode paths', () => {
    const url = new URL(built());
    url.pathname = '/invites/invitePartner/';
    expect(() => decodeUvcIoMInvite(url.toString(), VERSION)).toThrow('wrong mode');
  });

  it('rejects missing payload', () => {
    const url = new URL(built());
    url.hash = '';
    expect(() => decodeUvcIoMInvite(url.toString(), VERSION)).toThrow('missing payload');
  });

  it('rejects tampered tokens and person conflicts', () => {
    const tamper = (mutate: (fragment: Record<string, unknown>, url: URL) => void): string => {
      const url = new URL(built());
      const fragment = JSON.parse(decodeURIComponent(url.hash.slice(1))) as Record<string, unknown>;
      mutate(fragment, url);
      url.hash = encodeURIComponent(JSON.stringify(fragment));
      return url.toString();
    };
    expect(() => decodeUvcIoMInvite(tamper(fragment => { fragment.token = 'short'; }), VERSION)).toThrow('bad token');
    const conflictUrl = tamper((fragment, url) => {
      fragment.deviceEnrollmentPersonId = 'b'.repeat(64);
      url.searchParams.set('fdi', PERSON);
    });
    expect(() => decodeUvcIoMInvite(conflictUrl, VERSION)).toThrow('person conflict');
  });

  it('rejects bad email and unparseable input', () => {
    const url = new URL(built());
    url.searchParams.set('fe', 'not-an-email');
    expect(() => decodeUvcIoMInvite(url.toString(), VERSION)).toThrow('bad email');
    expect(() => decodeUvcIoMInvite(':::not-a-url:::', VERSION)).toThrow();
    expect(() => buildUvcIoMInviteUrl({ relayUrl: RELAY, email: 'nope', person: PERSON, token: TOKEN, publicKey: PUBLIC_KEY, pairingProtocolVersion: VERSION })).toThrow(
      'bad email',
    );
  });
});
