import { createIoMOps } from '../iomOps.ts';

const PERSON = 'a'.repeat(64);

function invitationUrl(): string {
  const url = new URL('https://uvc.example.test/invites/inviteDevice/');
  url.searchParams.set('fe', 'admin@example.test');
  url.searchParams.set('fdi', PERSON);
  url.hash = encodeURIComponent(
    JSON.stringify({
      token: 'token-1234567890',
      url: 'wss://api.glue.one/comm',
      publicKey: 'p'.repeat(64),
      pairingProtocolVersion: 2,
      pairingMode: 'primed',
      identityRelation: 'same-person',
      deviceEnrollmentPersonId: PERSON,
      mode: 'IoM',
    }),
  );
  return url.toString();
}

describe('IoM operation timeouts', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('clears the timeout when connectUsingInvitation rejects immediately', async () => {
    jest.useFakeTimers();
    const connectUsingInvitation = jest.fn().mockRejectedValue(new Error('commserver refused'));
    const ops = createIoMOps({
      connections: { pairing: { connectUsingInvitation } } as never,
      self: () => PERSON,
      email: 'admin@example.test',
      appBaseUrl: 'https://uvc.example.test/lab',
    });

    await expect(ops.acceptIoMInvite({ invitationUrl: invitationUrl(), timeoutMs: 30_000 })).rejects.toThrow(
      'commserver refused',
    );
    expect(jest.getTimerCount()).toBe(0);
  });

  it('unsubscribes a pending inviter when the pairing wait times out', async () => {
    jest.useFakeTimers();
    let listener: ((...args: unknown[]) => void) | undefined;
    const unlisten = jest.fn(() => {
      listener = undefined;
    });
    const ops = createIoMOps({
      connections: {
        pairing: {
          createInvitation: jest.fn().mockResolvedValue({
            token: 'token-1234567890',
            url: 'wss://api.glue.one/comm',
            publicKey: 'p'.repeat(64),
          }),
          onPairingSuccess: {
            listen: jest.fn((callback: (...args: unknown[]) => void) => {
              listener = callback;
              return unlisten;
            }),
          },
        },
      } as never,
      self: () => PERSON,
      email: 'admin@example.test',
      appBaseUrl: 'https://uvc.example.test/lab',
    });

    await ops.createIoMInvite();
    const pending = ops.awaitIoMInvite({ token: 'token-1234567890', timeoutMs: 50 });
    jest.advanceTimersByTime(50);
    await expect(pending).rejects.toThrow('timed out');
    expect(unlisten).toHaveBeenCalledTimes(1);
    expect(listener).toBeUndefined();
  });

  it('keeps a pairing result available when it commits before awaitIoMInvite', async () => {
    let listener: ((...args: unknown[]) => void) | undefined;
    const ops = createIoMOps({
      connections: {
        pairing: {
          createInvitation: jest.fn().mockResolvedValue({
            token: 'token-1234567890',
            url: 'wss://api.glue.one/comm',
            publicKey: 'p'.repeat(64),
          }),
          onPairingSuccess: {
            listen: jest.fn((callback: (...args: unknown[]) => void) => {
              listener = callback;
              return () => {
                listener = undefined;
              };
            }),
          },
        },
      } as never,
      self: () => PERSON,
      email: 'admin@example.test',
      appBaseUrl: 'https://uvc.example.test/lab',
    });

    await ops.createIoMInvite();
    listener?.(undefined, undefined, undefined, undefined, undefined, 'token-1234567890');
    await expect(ops.awaitIoMInvite({ token: 'token-1234567890', timeoutMs: 50 })).resolves.toEqual({ person: PERSON });
  });
});
