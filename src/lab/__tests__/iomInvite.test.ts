import { buildUvcIoMInviteUrl, decodeUvcIoMInvite, normalizeUvcLabUrl } from '../iomInvite.ts';

const VERSION = 7;
const PERSON = 'a'.repeat(64);
const PUBLIC_KEY = 'k'.repeat(40);
const TOKEN = 'u0j_hEFqjQ93oS_GB8-Lxyz12';
const COMM_SERVER = 'wss://api.glue.one/comm';
const APP_BASE = 'https://projektor.one/browser/#/uvclab';
const EMAIL = 'admin@lab.local';

const built = (): string =>
  buildUvcIoMInviteUrl({ appBaseUrl: APP_BASE, email: EMAIL, person: PERSON, token: TOKEN, url: COMM_SERVER, publicKey: PUBLIC_KEY, pairingProtocolVersion: VERSION })
    .invitationUrl;

describe('lane IoM invitation codec', () => {
  it('round-trips a minted invitation', () => {
    const { invitationUrl } = buildUvcIoMInviteUrl({
      appBaseUrl: APP_BASE,
      email: EMAIL,
      person: PERSON,
      token: TOKEN,
      url: COMM_SERVER,
      publicKey: PUBLIC_KEY,
      pairingProtocolVersion: VERSION,
    });
    expect(invitationUrl).toContain('projektor.one/browser/');
    expect(decodeUvcIoMInvite(invitationUrl, VERSION)).toEqual({
      token: TOKEN,
      url: COMM_SERVER,
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
    expect(() => buildUvcIoMInviteUrl({ appBaseUrl: APP_BASE, email: 'nope', person: PERSON, token: TOKEN, url: COMM_SERVER, publicKey: PUBLIC_KEY, pairingProtocolVersion: VERSION })).toThrow(
      'bad email',
    );
  });

  it('rejects non-websocket pairing services', () => {
    expect(() => buildUvcIoMInviteUrl({
      appBaseUrl: APP_BASE,
      email: EMAIL,
      person: PERSON,
      token: TOKEN,
      url: 'https://api.glue.one/comm',
      publicKey: PUBLIC_KEY,
      pairingProtocolVersion: VERSION,
    })).toThrow('bad commserver');
  });
});

 it('restores Expo Router fragment-before-query serialization for joined devices', () => {
   const canonical = new URL(built());
   canonical.searchParams.set('role', 'admin');
   const expoUrl = `${canonical.origin}${canonical.pathname}${canonical.hash}${canonical.search}`;
   expect(normalizeUvcLabUrl(expoUrl).href).toBe(canonical.href);
   expect(decodeUvcIoMInvite(expoUrl, VERSION)).toEqual(decodeUvcIoMInvite(canonical.href, VERSION));
 });
