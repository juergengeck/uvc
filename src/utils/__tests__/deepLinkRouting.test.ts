import { isLabDeepLink } from '../deepLinkRouting';

describe('lab deep-link ownership', () => {
  it('leaves normal and Expo-serialized lab invitations to the lab worker', () => {
    expect(isLabDeepLink('http://localhost:8081/lab?invited=true#%7B%7D')).toBe(true);
    expect(isLabDeepLink('https://uvc.one/lab/#%7B%7D?invited=true')).toBe(true);
    expect(isLabDeepLink('exp://localhost:8081/--/lab?invited=true')).toBe(true);
  });

  it('keeps application invitations and unrelated routes with the app handler', () => {
    expect(isLabDeepLink('https://uvc.one/invites/inviteDevice?invited=true#%7B%7D')).toBe(false);
    expect(isLabDeepLink('https://uvc.one/contacts?next=/lab')).toBe(false);
    expect(isLabDeepLink('https://uvc.one/laboratory')).toBe(false);
    expect(isLabDeepLink('invalid')).toBe(false);
  });
});
