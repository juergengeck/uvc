import {
  chatLine,
  columnModel,
  connectionLine,
  cycleLine,
  journalLine,
  roomCleaningStatus,
  shortId,
} from '../laneViewModel.ts';

describe('lane column view model', () => {
  it('reports cleaning progress without equating signed records with room readiness', () => {
    const cycle = { cycleId: 'c', planId: 'p', ended: true, energyReadings: 2, sensorReadings: 1, signedBy: 'a', signerRole: 'admin' };
    expect(roomCleaningStatus([], []).title).toBe('Awaiting cleaning');
    expect(roomCleaningStatus([cycle], ['c'], true).title).toBe('Updating cleaning status');
    expect(roomCleaningStatus([cycle], ['c', 'new']).title).toBe('Updating cleaning status');
    expect(roomCleaningStatus([{ ...cycle, ended: false }], ['c']).title).toBe('Cleaning in progress');
    expect(roomCleaningStatus([{ ...cycle, energyReadings: 0 }], ['c']).title).toBe('Cleaning not confirmed');
    expect(roomCleaningStatus([{ ...cycle, sensorReadings: 0 }], ['c']).title).toBe('Cleaning not confirmed');
    expect(roomCleaningStatus([{ ...cycle, signedBy: null }], ['c']).title).toBe('Awaiting verification');
    expect(roomCleaningStatus([{ ...cycle, signerRole: 'lamp' }], ['c']).title).toBe('Awaiting verification');
    expect(roomCleaningStatus([cycle], ['c'])).toEqual({
      title: 'Cleaning recorded',
      detail: 'Admin has verified the cycle records. Room readiness is not assessed by this simulation.',
    });
    // A previous verified cycle must not conceal an open cycle or a newer incomplete record.
    const open = { ...cycle, cycleId: 'open', ended: false };
    expect(roomCleaningStatus([open, cycle], ['open', 'c']).title).toBe('Cleaning in progress');
    const incomplete = { ...cycle, cycleId: 'new', energyReadings: 0 };
    expect(roomCleaningStatus([incomplete, cycle], ['c', 'new']).title).toBe('Cleaning not confirmed');
  });

  it('shortens hashes and degrades missing ones', () => {
    expect(shortId('a'.repeat(64))).toBe('a'.repeat(12));
    expect(shortId(null)).toBe('—');
    expect(shortId('short')).toBe('short');
  });

  it('badges IoM links on connection lines', () => {
    expect(connectionLine({ remotePersonId: 'p', remoteInstanceId: null, isConnected: true, isInternetOfMe: true })).toBe(
      'connected ⇄ p (IoM)',
    );
    expect(connectionLine({ remotePersonId: null, remoteInstanceId: null, isConnected: false, isInternetOfMe: false })).toBe(
      'known ⇄ —',
    );
  });

  it('summarizes chats, journals, and cycles', () => {
    expect(chatLine({ seq: 0, sender: 's', text: 'hi', sentAt: 1 })).toBe('s: hi');
    expect(journalLine({ idHash: 'h', seq: 0, kind: 'attestation', summary: 'signed', recordedAt: 1, signatures: [], verified: true })).toBe(
      '[attestation] signed',
    );
    expect(
      cycleLine({ cycleId: 'c', planId: 'p', ended: true, energyReadings: 2, sensorReadings: 1, signedBy: 'a', signerRole: 'admin' }),
    ).toBe('cycle c: signed by admin, 2 energy / 1 readings');
    expect(
      cycleLine({ cycleId: 'c', planId: 'p', ended: false, energyReadings: 0, sensorReadings: 0, signedBy: null, signerRole: null }),
    ).toBe('cycle c: open, 0 energy / 0 readings');
  });

  it('assembles a column with live, paused, and error badges', () => {
    const snapshot = {
      role: 'light',
      person: 'p',
      instanceId: 'i',
      connections: [{ remotePersonId: 'q', remoteInstanceId: null, isConnected: true, isInternetOfMe: false }],
      chatTail: [],
      journalTail: [{ idHash: 'h', seq: 0, kind: 'light', summary: 'ON', recordedAt: 1, signatures: [], verified: false }],
      cycles: [],
      deviceChanges: [],
      attestations: [],
    };
    const live = columnModel(snapshot, { paused: false });
    expect(live.badge).toBe('live');
    expect(live.ownerLine).toBe('owner p');
    expect(live.instanceLine).toBe('instance i · 1 live links');
    expect(live.journalLines).toEqual(['[light] ON']);
    expect(live.notice).toBeNull();
    expect(columnModel(snapshot, { paused: true }).badge).toBe('paused');
    const failed = columnModel(snapshot, { paused: false, error: 'pair failed' });
    expect(failed.badge).toBe('error');
    expect(failed.notice).toBe('pair failed');
  });
});
