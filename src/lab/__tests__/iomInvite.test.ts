import { assertUvcLabRoleEmail, buildUvcIoMInviteUrl, decodeUvcIoMInvite, normalizeUvcLabUrl, readUvcLabInviteIdentity } from '../iomInvite.ts';

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
  const roles = ['admin', 'doctor', 'lamp', 'sensor'];

  it.each(roles)('binds an invited %s role to its canonical lab identity', role => {
    const app = new URL(APP_BASE);
    app.searchParams.set('role', role);
    const { invitationUrl } = buildUvcIoMInviteUrl({ appBaseUrl: app.href, email: `${role}@lab.local`, person: PERSON, token: TOKEN, url: COMM_SERVER, publicKey: PUBLIC_KEY, pairingProtocolVersion: VERSION });
    expect(readUvcLabInviteIdentity(invitationUrl)).toEqual({ email: `${role}@lab.local`, person: PERSON });
    expect(new URL(invitationUrl).searchParams.has('role')).toBe(false);
    expect(assertUvcLabRoleEmail(role, `${role}@lab.local`)).toBe(role);
    for (const otherRole of roles.filter(other => other !== role)) {
      const tampered = new URL(invitationUrl);
      tampered.searchParams.set('role', otherRole);
      expect(readUvcLabInviteIdentity(tampered.href)).toEqual({ email: `${role}@lab.local`, person: PERSON });
    }
  });

  it('rejects arbitrary emails even when the URL names a valid role', () => {
    expect(() => assertUvcLabRoleEmail('doctor', 'patient@example.test')).toThrow('not the invited identity');
    expect(() => assertUvcLabRoleEmail('doctor', 'Doctor@lab.local')).toThrow('not the invited identity');
    expect(() => assertUvcLabRoleEmail('administrator', 'administrator@lab.local')).toThrow('unknown lane role');
  });

  it('strips role metadata from a base URL', () => {
    const { invitationUrl } = buildUvcIoMInviteUrl({ appBaseUrl: 'https://uvc.example.test/lab?role=lamp&fr=admin', email: 'doctor@lab.local', person: PERSON, token: TOKEN, url: COMM_SERVER, publicKey: PUBLIC_KEY, pairingProtocolVersion: VERSION });
    expect(new URL(invitationUrl).searchParams.has('role')).toBe(false);
    expect(new URL(invitationUrl).searchParams.has('fr')).toBe(false);
  });

  it('validates invited Person consistency before worker boot', () => {
    const url = new URL(built());
    url.searchParams.set('role', 'admin');
    url.searchParams.set('fdi', 'b'.repeat(64));
    expect(() => readUvcLabInviteIdentity(url.href)).toThrow('person conflict');
    url.searchParams.set('fdi', PERSON);
    url.hash = encodeURIComponent('null');
    expect(() => readUvcLabInviteIdentity(url.href)).toThrow('bad payload');
  });

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
   expect(readUvcLabInviteIdentity(expoUrl)).toEqual({ email: EMAIL, person: PERSON });
 });
