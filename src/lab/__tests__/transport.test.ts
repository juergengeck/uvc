import {
  LaneNotReadyError,
  bootLane,
  ensureExpectedIdentity,
  invitePair,
  mintIoMInvite,
  seedLaneMesh,
  sendChatAndAwaitArrival,
  snapshotRole,
  withOpRetry,
} from '../transport.ts';
import type { LaneClient, LaneSeed } from '../transport.ts';
import { startLaneHost } from '../hostSwitch.ts';

jest.mock('../hostSwitch.ts', () => ({ startLaneHost: jest.fn() }));

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

  it('stops a booted host when a role anchor fails', async () => {
    const failure = new Error('anchor storage failed');
    const stop = jest.fn(async () => undefined);
    (startLaneHost as jest.Mock).mockResolvedValueOnce({
      clients: { admin: stubClient({
        'uvcLane.configureLane': () => ({ ready: true }),
        'uvcLane.ensureRoleAnchor': () => { throw failure; },
      }) },
      persons: { admin: 'admin-person' },
      stop,
    });
    await expect(bootLane({ lane: 'test', roles: ['admin'], spawn: jest.fn() })).rejects.toBe(failure);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('reports boot and role anchor progress', async () => {
    const stages: string[] = [];
    const stop = jest.fn();
    const host = {
      clients: { admin: stubClient({
        'uvcLane.configureLane': () => ({ ready: true }),
        'uvcLane.ensureRoleAnchor': () => ({ ready: true }),
      }) },
      persons: { admin: 'admin-person' },
      stop,
    };
    (startLaneHost as jest.Mock).mockResolvedValueOnce(host);
    const seed = await bootLane({ lane: 'test', roles: ['admin'], spawn: jest.fn(), onStage: stage => stages.push(stage) });
    expect(seed.host).toBe(host);
    expect(seed.persons).toEqual(host.persons);
    expect(stages).toEqual(['Booting 1 lane worker', 'Lane workers ready; anchoring roles', 'Anchoring admin', 'admin ready']);
    expect(stop).not.toHaveBeenCalled();
  });

  it('pairs inviter and joiner, then waits for both exact peer instances to be live', async () => {
    const seen: Record<string, unknown>[] = [];
    const inviter = stubClient({
      'uvcLane.whoAmI': () => ({ person: 'inviter-person', instanceId: 'inviter-instance' }),
      'connection.createInvite': params => {
        seen.push(params ?? {});
        return { url: 'lab://admin', publicKey: 'k', token: 't', pairingMode: 'primed' };
      },
      'connection.listConnections': (() => {
        let calls = 0;
        return () => [{ remotePersonId: 'joiner-person', remoteInstanceId: ++calls >= 2 ? 'joiner-instance' : 'other-instance', isConnected: true }];
      })(),
    });
    const joiner = stubClient({
      'uvcLane.whoAmI': () => ({ person: 'joiner-person', instanceId: 'joiner-instance' }),
      'connection.connectWithInvite': params => {
        seen.push(params ?? {});
        return { person: 'joiner-person' };
      },
      'connection.listConnections': () => [{ remotePersonId: 'inviter-person', remoteInstanceId: 'inviter-instance', isConnected: true }],
    });
    await invitePair({ inviter, joiner, pairTimeoutMs: 5_000 });
    expect(seen[0]).toEqual({ mode: 'primed' });
    expect(seen[1]).toEqual({ url: 'lab://admin', publicKey: 'k', token: 't', pairingMode: 'primed' });
  });

  it.each([
    { remotePersonId: 'unrelated-person', remoteInstanceId: 'joiner-instance', isConnected: true },
    { remotePersonId: 'joiner-person', remoteInstanceId: 'other-instance', isConnected: true },
    { remotePersonId: 'joiner-person', remoteInstanceId: 'joiner-instance', isConnected: false },
  ])('does not mistake unrelated or disconnected links for pairing readiness: %j', async connection => {
    const inviter = stubClient({
      'uvcLane.whoAmI': () => ({ person: 'inviter-person', instanceId: 'inviter-instance' }),
      'connection.createInvite': () => ({ url: 'lab://admin', publicKey: 'k', token: 't' }),
      'connection.listConnections': () => [connection],
    });
    const joiner = stubClient({
      'uvcLane.whoAmI': () => ({ person: 'joiner-person', instanceId: 'joiner-instance' }),
      'connection.connectWithInvite': () => true,
      'connection.listConnections': () => [{ remotePersonId: 'inviter-person', remoteInstanceId: 'inviter-instance', isConnected: true }],
    });
    await expect(invitePair({ inviter, joiner, pairTimeoutMs: 0 })).rejects.toThrow('exact peer Person and Instance');
  });

  it('requires the joiner to observe the inviter too', async () => {
    const inviter = stubClient({
      'uvcLane.whoAmI': () => ({ person: 'a', instanceId: 'ai' }),
      'connection.createInvite': () => ({ url: 'lab://admin', publicKey: 'k', token: 't' }),
      'connection.listConnections': () => [{ remotePersonId: 'b', remoteInstanceId: 'bi', isConnected: true }],
    });
    const joiner = stubClient({
      'uvcLane.whoAmI': () => ({ person: 'b', instanceId: 'bi' }),
      'connection.connectWithInvite': () => true,
      'connection.listConnections': () => [{ remotePersonId: 'other', remoteInstanceId: 'oi', isConnected: true }],
    });
    await expect(invitePair({ inviter, joiner, pairTimeoutMs: 0 })).rejects.toThrow('exact peer Person and Instance');
  });

  it('refuses to mint an invitation before both identities are known', async () => {
    const mint = jest.fn();
    const inviter = stubClient({
      'uvcLane.whoAmI': () => ({ person: 'a', instanceId: 'ai' }),
      'connection.createInvite': mint,
    });
    const joiner = stubClient({ 'uvcLane.whoAmI': () => ({ person: 'b', instanceId: '' }) });
    await expect(invitePair({ inviter, joiner })).rejects.toThrow('joiner did not report a Person and Instance');
    expect(mint).not.toHaveBeenCalled();
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
        return { entries: [] };
      },
      'uvcLane.tailJournal': () => ({
        entries: [{ idHash: 'h', seq: 0, kind: 'cycle', summary: 'started', recordedAt: 2, verified: false }],
      }),
      'uvcLane.readCycle': params => {
        if (params?.cycleId === 'c1') {
          return {
            cycle: { planId: 'p1', endedAt: 9 },
            energyReadings: 2,
            sensorReadings: 1,
            signature: { signer: 'a', signerRole: 'admin', verified: true },
          };
        }
        return { cycle: null, energyReadings: 0, sensorReadings: 0, signature: null };
      },
      'uvcLane.listChanges': () => ([{
        scope: 'c1',
        changes: [{ idHash: 'change-id', hash: 'change-hash', sourceRole: 'sensor', kind: 'reading', summary: 'reading', recordedAt: 3, cycleId: 'c1', attested: true }],
        attestation: { scope: 'c1', cycleId: 'c1', idHash: 'att-id', hash: 'att-hash', signer: 'a', signerRole: 'admin', signedAt: 4, records: ['change-hash'], verified: true },
      }]),
      'uvcLane.readLightState': () => null,
      'uvcLane.readSensorState': () => null,
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
      journalTail: [{ idHash: 'h', seq: 0, kind: 'cycle', summary: 'started', recordedAt: 2, signatures: [], verified: false }],
      cycles: [
        { cycleId: 'c1', planId: 'p1', ended: true, energyReadings: 2, sensorReadings: 1, signedBy: 'a', signerRole: 'admin' },
      ],
      deviceChanges: [{ idHash: 'change-id', hash: 'change-hash', sourceRole: 'sensor', kind: 'reading', summary: 'reading', recordedAt: 3, cycleId: 'c1', attested: true }],
      attestations: [{ scope: 'c1', cycleId: 'c1', idHash: 'att-id', hash: 'att-hash', signer: 'a', signerRole: 'admin', signedAt: 4, records: ['change-hash'], verified: true }],
      lightState: null,
      sensorState: null,
      automaticAttestation: null,
    });
  });

  it.each(['tailLaneChat', 'tailJournal', 'readCycle', 'listChanges', 'readLightState', 'readSensorState', 'readAutomaticAttestationStatus'])(
    'propagates %s failures instead of presenting an empty snapshot', async method => {
      const failure = new Error(`${method} storage unavailable`);
      const client = stubClient({
        'uvcLane.whoAmI': () => ({ person: 'p', instanceId: 'i' }),
        'connection.listConnections': () => [],
        'uvcLane.tailLaneChat': () => ({ entries: [] }),
        'uvcLane.tailJournal': () => ({ entries: [] }),
        'uvcLane.readCycle': () => ({ cycle: null }),
        'uvcLane.listChanges': () => [],
        'uvcLane.readLightState': () => null,
        'uvcLane.readSensorState': () => null,
        'uvcLane.readAutomaticAttestationStatus': () => ({ enabled: true, busy: false, error: null }),
        [`uvcLane.${method}`]: () => { throw failure; },
      });
      await expect(snapshotRole({ client, role: 'admin', threads: ['t'], journalStream: 'j', cycleIds: ['c'] })).rejects.toBe(failure);
    },
  );

  it('seeds a mesh with explicit failures and progress, leaving IoM invites for user actions', async () => {
    const calls: string[] = [];
    const stages: string[] = [];
    const meshClient = (role: string): LaneClient =>
      stubClient({
        'uvcLane.whoAmI': () => ({ person: `${role}-person`, instanceId: `${role}-instance` }),
        'connection.createInvite': () => ({ url: `lab://${role}`, publicKey: 'k', token: `t-${role}`, pairingMode: 'primed' }),
        'connection.connectWithInvite': () => {
          calls.push(`accept-by-${role}`);
          return { person: `${role}-person` };
        },
        'connection.listConnections': () => role === 'user' ? [] : [{ remotePersonId: 'user-person', remoteInstanceId: 'user-instance', isConnected: true }],
        'uvcLane.postLaneChat': () => ({ idHash: 'h', seq: 0 }),
        'uvcLane.tailLaneChat': () => ({ entries: [{ seq: 0, text: 'lane test live' }] }),
        'uvcLane.createIoMInvite': () => { calls.push(`mint-${role}`); return {}; },
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
      welcomeThread: 'test:welcome',
      pairTimeoutMs: 0,
      arrivalTimeoutMs: 5_000,
      onStage: stage => stages.push(stage),
    });
    // The user side never reports live: the pair failure is logged, and the
    // mesh continues into chat instead of stopping or minting invitations.
    expect(mesh.log).toEqual([
      expect.stringMatching(/pair admin <-> user failed/),
      'welcome chat delivered on test:welcome',
    ]);
    expect(mesh.failures).toEqual([mesh.log[0]]);
    expect(mesh.invites).toEqual({});
    expect(stages).toEqual(['Pairing admin <-> user', mesh.log[0], 'Sending welcome chat on test:welcome', mesh.log[1]]);
    expect(mesh.persons).toEqual({ admin: 'admin-person', user: 'user-person' });
    expect(calls).toEqual(['accept-by-user']);
  });

  it('supports a one-role lane without pairing, delivery claims, or invitation minting', async () => {
    const seed = { host: { stop: async () => undefined }, clients: { admin: stubClient({}) }, persons: { admin: 'p' } } as unknown as LaneSeed;
    const mesh = await seedLaneMesh({ seed, lane: 'test', roles: ['admin'], welcomeThread: 'welcome' });
    expect(mesh).toEqual({ persons: { admin: 'p' }, invites: {}, failures: [], log: ['welcome chat skipped: at least two roles are required'] });
  });

  it('mints IoM invites as QR payloads', async () => {
    const client = stubClient({
      'uvcLane.createIoMInvite': params => ({
        invitationUrl: `https://x/invite#${String(params)}`,
        token: 'tok',
        person: 'p',
      }),
    });
    await expect(mintIoMInvite({ client })).resolves.toEqual({
      invitationUrl: 'https://x/invite#undefined',
      token: 'tok',
      person: 'p',
    });
  });
});
