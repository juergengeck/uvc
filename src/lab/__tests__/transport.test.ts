import {
  LaneNotReadyError,
  ensureExpectedIdentity,
  invitePair,
  mintIoMInvite,
  seedLaneMesh,
  sendChatAndAwaitArrival,
  snapshotRole,
  withOpRetry,
} from '../transport.ts';
import type { LaneClient, LaneSeed } from '../transport.ts';

const stubClient = (impl: Record<string, (params?: Record<string, unknown>) => unknown>): LaneClient => ({
  call: (handler: string, method: string, params?: Record<string, unknown>) => {
    const fn = impl[`${handler}.${method}`];
    if (!fn) return Promise.reject(new Error(`unexpected call ${handler}.${method}`));
    try {
      return Promise.resolve(fn(params) as never);
    } catch (error) {
      return Promise.reject(error);
    }
  },
});

describe('lane transport', () => {
  it('retries not-ready operations until the bound, then names the label', async () => {
    let attempts = 0;
    const value = await withOpRetry(
      'demo-op',
      async () => {
        attempts += 1;
        if (attempts < 3) throw new LaneNotReadyError('warming up');
        return 'live';
      },
      { timeoutMs: 5_000, intervalMs: 5 },
    );
    expect(value).toBe('live');
    expect(attempts).toBe(3);
    await expect(
      withOpRetry(
        'stuck-op',
        async () => {
          throw new LaneNotReadyError('never');
        },
        { timeoutMs: 50, intervalMs: 5 },
      ),
    ).rejects.toThrow('Lane stuck-op not ready within 50ms');
  });

  it('settles foreign failures immediately so side effects never run twice', async () => {
    let attempts = 0;
    await expect(
      withOpRetry(
        'side-effect',
        async () => {
          attempts += 1;
          throw new Error('real failure');
        },
        { timeoutMs: 5_000, intervalMs: 5 },
      ),
    ).rejects.toThrow('real failure');
    expect(attempts).toBe(1);
  });

  it('refuses foreign identities loudly, passes fresh roles silently', () => {
    expect(() => ensureExpectedIdentity({ role: 'admin', actual: 'p1' })).not.toThrow();
    expect(() => ensureExpectedIdentity({ role: 'admin', actual: 'p1', expected: 'p1' })).not.toThrow();
    expect(() => ensureExpectedIdentity({ role: 'admin', actual: 'p2', expected: 'p1' })).toThrow(
      /signed in as a different person.*clear the lane partition/,
    );
  });

  it('pairs inviter and joiner, then waits for both sides live', async () => {
    const seen: Record<string, unknown>[] = [];
    const inviter = stubClient({
      'connection.createInvite': params => {
        seen.push(params ?? {});
        return { url: 'lab://admin', publicKey: 'k', token: 't', pairingMode: 'primed' };
      },
      'connection.getStatus': (() => {
        let calls = 0;
        return () => ({ activeConnections: ++calls >= 2 ? 1 : 0 });
      })(),
    });
    const joiner = stubClient({
      'connection.connectWithInvite': params => {
        seen.push(params ?? {});
        return { person: 'joiner-person' };
      },
      'connection.getStatus': () => ({ activeConnections: 1 }),
    });
    await invitePair({ inviter, joiner, pairTimeoutMs: 5_000 });
    expect(seen[0]).toEqual({ mode: 'primed' });
    expect(seen[1]).toEqual({ url: 'lab://admin', publicKey: 'k', token: 't', pairingMode: 'primed' });
  });

  it('treats send-200 as insufficient and waits for arrival', async () => {
    const from = stubClient({
      'uvcLane.postLaneChat': () => ({ idHash: 'h', seq: 4 }),
    });
    let tails = 0;
    const to = stubClient({
      'uvcLane.tailLaneChat': () => {
        tails += 1;
        return { entries: tails >= 2 ? [{ seq: 4, text: 'dose logged' }] : [] };
      },
    });
    await expect(
      sendChatAndAwaitArrival({
        from,
        to,
        thread: 't',
        text: 'dose logged',
        audience: ['a'],
        arrivalTimeoutMs: 5_000,
      }),
    ).resolves.toEqual({ seq: 4 });
    expect(tails).toBeGreaterThanOrEqual(2);
  });

  it('assembles a role snapshot across threads, journals, and cycles', async () => {
    const client = stubClient({
      'uvcLane.whoAmI': () => ({ person: 'p', role: 'sensor', instanceId: 'i' }),
      'connection.listConnections': () => [{ remotePersonId: 'q', isConnected: true, isInternetOfMe: false }],
      'uvcLane.tailLaneChat': params => {
        if (params?.thread === 'known') return { entries: [{ seq: 0, sender: 'q', text: 'hi', sentAt: 1 }] };
        throw new Error('unknown thread');
      },
      'uvcLane.tailJournal': () => ({
        entries: [{ idHash: 'h', seq: 0, kind: 'cycle', summary: 'started', recordedAt: 2 }],
      }),
      'uvcLane.readCycle': params => {
        if (params?.cycleId === 'c1') {
          return {
            cycle: { planId: 'p1', endedAt: 9 },
            energyReadings: 2,
            sensorReadings: 1,
            signature: { signer: 'a', signerRole: 'admin' },
          };
        }
        throw new Error('unknown cycle');
      },
    });
    const snapshot = await snapshotRole({
      client,
      role: 'sensor',
      threads: ['known', 'missing'],
      journalStream: 'lane:sensor',
      cycleIds: ['c1', 'missing'],
    });
    expect(snapshot).toEqual({
      role: 'sensor',
      person: 'p',
      instanceId: 'i',
      connections: [{ remotePersonId: 'q', remoteInstanceId: null, isConnected: true, isInternetOfMe: false }],
      chatTail: [{ seq: 0, sender: 'q', text: 'hi', sentAt: 1 }],
      journalTail: [{ idHash: 'h', seq: 0, kind: 'cycle', summary: 'started', recordedAt: 2, signatures: [] }],
      cycles: [
        { cycleId: 'c1', planId: 'p1', ended: true, energyReadings: 2, sensorReadings: 1, signedBy: 'a', signerRole: 'admin' },
      ],
      lightState: null,
    });
  });

  it('seeds a mesh independently: pairs, chat, and QRs with logged failures', async () => {
    const calls: string[] = [];
    const meshClient = (role: string): LaneClient =>
      stubClient({
        'connection.createInvite': () => ({ url: `lab://${role}`, publicKey: 'k', token: `t-${role}`, pairingMode: 'primed' }),
        'connection.connectWithInvite': () => {
          calls.push(`accept-by-${role}`);
          return { person: `${role}-person` };
        },
        'connection.getStatus': () => ({ activeConnections: role === 'user' ? 0 : 1 }),
        'uvcLane.postLaneChat': () => ({ idHash: 'h', seq: 0 }),
        'uvcLane.tailLaneChat': () => ({ entries: [{ seq: 0, text: 'lane test live' }] }),
        'uvcLane.createIoMInvite': () => ({ invitationUrl: `https://x/${role}`, token: `iom-${role}`, person: `${role}-person` }),
      });
    const seed = {
      host: { stop: async () => undefined },
      clients: { admin: meshClient('admin'), user: meshClient('user') },
      persons: { admin: 'admin-person', user: 'user-person' },
    } as unknown as LaneSeed;
    const mesh = await seedLaneMesh({
      seed,
      lane: 'test',
      roles: ['admin', 'user'],
      relayUrl: 'wss://relay/comm',
      welcomeThread: 'test:welcome',
      pairTimeoutMs: 200,
      arrivalTimeoutMs: 5_000,
    });
    // The user side never reports live: the pair failure is logged, and the
    // mesh continues into chat and QRs instead of stopping.
    expect(mesh.log).toEqual([
      expect.stringMatching(/pair admin <-> user failed/),
      'welcome chat delivered on test:welcome',
      'iom qr ready for admin',
      'iom qr ready for user',
    ]);
    expect(mesh.invites.admin.invitationUrl).toBe('https://x/admin');
    expect(mesh.persons).toEqual({ admin: 'admin-person', user: 'user-person' });
    expect(calls).toEqual(['accept-by-user']);
  });

  it('mints IoM invites as QR payloads', async () => {
    const client = stubClient({
      'uvcLane.createIoMInvite': params => ({
        invitationUrl: `https://x/invite#${String(params?.relayUrl)}`,
        token: 'tok',
        person: 'p',
      }),
    });
    await expect(mintIoMInvite({ client, relayUrl: 'wss://relay/comm' })).resolves.toEqual({
      invitationUrl: 'https://x/invite#wss://relay/comm',
      token: 'tok',
      person: 'p',
    });
  });
});
