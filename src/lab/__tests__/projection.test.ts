import {
  projectAttestations,
  projectChatTail,
  projectConnection,
  projectDeviceChanges,
  projectJournalTail,
  projectRoleSnapshot,
} from '../projection.ts';

describe('lane snapshot projection', () => {
  it('projects connections honestly, degrading unknown shapes to nulls', () => {
    expect(
      projectConnection({ remotePersonId: 'p', remoteInstanceId: 'i', isConnected: true, isInternetOfMe: false }),
    ).toEqual({ remotePersonId: 'p', remoteInstanceId: 'i', isConnected: true, isInternetOfMe: false });
    expect(projectConnection(null)).toEqual({
      remotePersonId: null,
      remoteInstanceId: null,
      isConnected: false,
      isInternetOfMe: false,
    });
    expect(projectConnection({ remotePersonId: 42, isConnected: 'yes', isInternetOfMe: 1 })).toEqual({
      remotePersonId: null,
      remoteInstanceId: null,
      isConnected: false,
      isInternetOfMe: false,
    });
  });

  it('sorts chat by seq, keeps the newest twenty, drops malformed rows', () => {
    const raw: unknown[] = [];
    for (let seq = 0; seq < 25; seq += 1) {
      raw.unshift({ seq, sender: 's', text: `m${seq}`, sentAt: seq });
    }
    raw.push({ seq: 'x', sender: 's', text: 'bad', sentAt: 1 });
    raw.push(null);
    const tail = projectChatTail(raw);
    expect(tail).toHaveLength(20);
    expect(tail[0]).toEqual({ seq: 5, sender: 's', text: 'm5', sentAt: 5 });
    expect(tail[19]).toEqual({ seq: 24, sender: 's', text: 'm24', sentAt: 24 });
  });

  it('sorts journal by recordedAt and keeps only string signatures', () => {
    const tail = projectJournalTail([
      { idHash: 'b', seq: 1, kind: 'cycle', summary: 'second', recordedAt: 2, signatures: ['admin', 7] },
      { idHash: 'a', seq: 0, kind: 'cycle', summary: 'first', recordedAt: 1 },
      { summary: 'no-id', recordedAt: 0 },
    ]);
    expect(tail).toEqual([
      { idHash: 'a', seq: 0, kind: 'cycle', summary: 'first', recordedAt: 1, signatures: [], verified: false },
      { idHash: 'b', seq: 1, kind: 'cycle', summary: 'second', recordedAt: 2, signatures: ['admin'], verified: false },
    ]);
  });

  it('assembles a full role snapshot from raw worker state', () => {
    const snapshot = projectRoleSnapshot({
      role: 'sensor',
      person: 'p1',
      instanceId: 'i1',
      connections: [{ remotePersonId: 'p2', isConnected: true, isInternetOfMe: false }],
      chatTail: [{ seq: 0, sender: 'p2', text: 'hello', sentAt: 10 }],
      journalTail: [],
    });
    expect(snapshot).toEqual({
      role: 'sensor',
      person: 'p1',
      instanceId: 'i1',
      connections: [{ remotePersonId: 'p2', remoteInstanceId: null, isConnected: true, isInternetOfMe: false }],
      chatTail: [{ seq: 0, sender: 'p2', text: 'hello', sentAt: 10 }],
      journalTail: [],
      cycles: [],
      deviceChanges: [],
      attestations: [],
      lightState: null,
      sensorState: null,
      automaticAttestation: null,
    });
  });

  it('renders partial readiness as nulls and empties, never throws', () => {
    expect(
      projectRoleSnapshot({ role: 'light', person: null, instanceId: undefined, connections: null, chatTail: null, journalTail: null }),
    ).toEqual({ role: 'light', person: null, instanceId: null, connections: [], chatTail: [], journalTail: [], cycles: [], deviceChanges: [], attestations: [], lightState: null, sensorState: null, automaticAttestation: null });
  });

  it('projects cycle states and drops entries without a cycle id', () => {
    const snapshot = projectRoleSnapshot({
      role: 'admin',
      person: 'p',
      instanceId: 'i',
      connections: [],
      chatTail: [],
      journalTail: [],
      cycles: [
        { cycleId: 'c1', planId: 'p1', ended: true, energyReadings: 2, sensorReadings: 2, signedBy: 'p', signerRole: 'admin' },
        { planId: 'p1' },
        null,
      ],
    });
    expect(snapshot.cycles).toEqual([
      { cycleId: 'c1', planId: 'p1', ended: true, energyReadings: 2, sensorReadings: 2, signedBy: 'p', signerRole: 'admin' },
    ]);
  });

  it('projects exact device versions and verified attestation metadata', () => {
    expect(projectDeviceChanges([
      { idHash: 'id', hash: 'exact', sourceRole: 'lamp', kind: 'light', summary: 'light on', recordedAt: 2, cycleId: null, attested: true },
      { idHash: 'bad', hash: 'bad', sourceRole: 'admin', kind: 'light', summary: 'bad', recordedAt: 1 },
    ])).toEqual([
      { idHash: 'id', hash: 'exact', sourceRole: 'lamp', kind: 'light', summary: 'light on', recordedAt: 2, cycleId: null, attested: true },
    ]);
    expect(projectAttestations([
      { scope: 'lane:standalone', cycleId: null, idHash: 'id', hash: 'exact', signer: 'admin', signerRole: 'admin', signedAt: 3, records: ['record'], verified: true },
    ])).toEqual([
      { scope: 'lane:standalone', cycleId: null, idHash: 'id', hash: 'exact', signer: 'admin', signerRole: 'admin', signedAt: 3, records: ['record'], verified: true },
    ]);
  });

  it('projects manual sensor activation and its attestable state change', () => {
    const change = { idHash: 'sensor-id', hash: 'sensor-version', sourceRole: 'sensor', kind: 'sensor', summary: 'sensor on', recordedAt: 4, cycleId: null, attested: false };
    const snapshot = projectRoleSnapshot({
      role: 'sensor', person: 'sensor', instanceId: 'instance', connections: [], chatTail: [], journalTail: [],
      sensorState: { on: true, reason: 'Manual lab simulation' }, deviceChanges: [change],
    });
    expect(snapshot.sensorState).toEqual({ on: true, reason: 'Manual lab simulation' });
    expect(snapshot.deviceChanges).toEqual([change]);
  });

  it('preserves automatic signing progress and failures for Admin', () => {
    const snapshot = projectRoleSnapshot({
      role: 'admin', person: 'admin', instanceId: 'instance', connections: [], chatTail: [], journalTail: [],
      automaticAttestation: { enabled: true, busy: false, error: 'Storage unavailable' },
    });
    expect(snapshot.automaticAttestation).toEqual({ enabled: true, busy: false, error: 'Storage unavailable' });
  });
});

describe('journal tail attestation collapsing', () => {
  it('keeps only the newest attestation per scope and every signed signal', () => {
    const row = (seq: number, kind: string, summary: string, scope?: string) => ({
      idHash: `h${seq}`, seq, kind, summary, recordedAt: 100 + seq, signatures: [], verified: true, ...(scope ? { scope } : {}),
    });
    const tail = projectJournalTail([
      row(1, 'signal', 'Lamp on'),
      row(2, 'attestation', '1 energy record', 'cycle'),
      row(3, 'attestation', '2 energy records', 'cycle'),
      row(4, 'attestation', '1 lamp change', 'standalone'),
      row(5, 'signal', 'Lamp off'),
      row(6, 'attestation', '2 lamp changes', 'standalone'),
    ]);
    expect(tail.map(entry => entry.summary)).toEqual(['Lamp on', '2 energy records', 'Lamp off', '2 lamp changes']);
  });
});
