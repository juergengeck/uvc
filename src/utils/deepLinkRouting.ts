/** Lab workers own their pairing flow; the main app must not consume its token. */
export function isLabDeepLink(value: string): boolean {
  try {
    return /^\/(?:--\/)?lab\/?$/.test(new URL(value).pathname);
  } catch {
    return false;
  }
}
