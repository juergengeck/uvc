import { projectChatTail, projectConnection, projectJournalTail, projectRoleSnapshot } from '../projection.ts';

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
      { idHash: 'a', seq: 0, kind: 'cycle', summary: 'first', recordedAt: 1, signatures: [] },
      { idHash: 'b', seq: 1, kind: 'cycle', summary: 'second', recordedAt: 2, signatures: ['admin'] },
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
      lightState: null,
    });
  });

  it('renders partial readiness as nulls and empties, never throws', () => {
    expect(
      projectRoleSnapshot({ role: 'light', person: null, instanceId: undefined, connections: null, chatTail: null, journalTail: null }),
    ).toEqual({ role: 'light', person: null, instanceId: null, connections: [], chatTail: [], journalTail: [], cycles: [], lightState: null });
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
});
