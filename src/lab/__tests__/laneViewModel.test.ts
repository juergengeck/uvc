import {
  chatLine,
  columnModel,
  connectionLine,
  cycleLine,
  isIoMPairingTimeout,
  journalLine,
  journalModel,
  roomCleaningStatus,
  shortId,
} from '../laneViewModel.ts';

describe('lane column view model', () => {
  it('reports cleaning progress without equating signed records with room readiness', () => {
    const cycle = { cycleId: 'c', planId: 'p', ended: true, startedAt: 1, endedAt: 2, energyReadings: 2, sensorReadings: 1, signedBy: 'a', signerRole: 'admin' };
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
      detail: 'Clinic has verified the cycle records. Room readiness is not assessed by this simulation.',
    });
    // A previous verified cycle must not conceal an open cycle or a newer incomplete record.
    const open = { ...cycle, cycleId: 'open', ended: false };
    expect(roomCleaningStatus([open, cycle], ['open', 'c']).title).toBe('Cleaning in progress');
    const incomplete = { ...cycle, cycleId: 'new', energyReadings: 0 };
    expect(roomCleaningStatus([incomplete, cycle], ['c', 'new']).title).toBe('Cleaning not confirmed');
  });

  it('recognizes expired IoM invitations as renewable timeouts', () => {
    expect(isIoMPairingTimeout(new Error('UVC lab: IoM pairing timed out waiting for the second device.'))).toBe(true);
    expect(isIoMPairingTimeout(new Error('UVC lab: IoM pairing timed out.'))).toBe(true);
    expect(isIoMPairingTimeout(new Error('UVC lab: unknown IoM invitation token.'))).toBe(false);
    expect(isIoMPairingTimeout(new Error('commserver refused'))).toBe(false);
    expect(isIoMPairingTimeout('UVC lab: IoM pairing timed out.')).toBe(true);
  });

  it('folds each cleaning cycle and its rows into one transaction card', () => {
    const started = { idHash: 's', seq: 1, kind: 'cycle', summary: 'started cleaning cycle c1 for p1', recordedAt: 10, signatures: [], verified: false };
    const closed = { idHash: 'c', seq: 2, kind: 'cycle', summary: 'closed cleaning cycle c1 (done): 2 energy records, 20 mJ delivered, 1 sensor readings', recordedAt: 30, signatures: [], verified: false };
    const attested = { idHash: 'a', seq: 3, kind: 'attestation', summary: 'Clinic attested to 2 energy records and 1 sensor reading', recordedAt: 40, signatures: ['h'], verified: true, scope: 'c1' };
    const lampOn = { idHash: 'l', seq: 4, kind: 'signal', summary: 'Lamp on', recordedAt: 50, signatures: ['h'], verified: true };
    const standaloneScope = { idHash: 'x', seq: 5, kind: 'attestation', summary: 'Clinic attested to 1 lamp change and 0 sensor changes', recordedAt: 60, signatures: ['h'], verified: true, scope: 'lab:standalone' };
    const cycles = [
      { cycleId: 'c1', planId: 'p1', ended: true, startedAt: 5, endedAt: 35, energyReadings: 2, sensorReadings: 1, signedBy: 'admin', signerRole: 'admin' },
      { cycleId: 'c2', planId: 'p1', ended: false, startedAt: 65, endedAt: 0, energyReadings: 1, sensorReadings: 0, signedBy: null, signerRole: null },
    ];
    const model = journalModel(cycles, [started, closed, attested, lampOn, standaloneScope], ['c1', 'c2']);
    expect(model.transactions.map(tx => tx.title)).toEqual(['Room cleaning 2', 'Room cleaning 1']);
    const [open, done] = model.transactions;
    expect(open.status).toBe('open');
    expect(open.summary).toBe('Open · 1 energy · 0 readings');
    expect(open.entries).toEqual([]);
    expect(done.status).toBe('success');
    expect(done.summary).toBe('Closed · 2 energy · 1 readings · Verified');
    expect(done.entries).toEqual([started, closed, attested]);
    expect(model.standalone).toEqual([standaloneScope, lampOn]);
  });

  it('marks ended cleanings failed when incomplete and pending while unverified', () => {
    const incomplete = { cycleId: 'c1', planId: 'p1', ended: true, startedAt: 1, endedAt: 2, energyReadings: 2, sensorReadings: 0, signedBy: null, signerRole: null };
    const unverified = { cycleId: 'c2', planId: 'p1', ended: true, startedAt: 3, endedAt: 4, energyReadings: 2, sensorReadings: 1, signedBy: null, signerRole: null };
    const model = journalModel([incomplete, unverified], [], ['c1', 'c2']);
    expect(model.transactions.map(tx => [tx.title, tx.status, tx.summary])).toEqual([
      ['Room cleaning 2', 'pending', 'Closed · 2 energy · 1 readings · Awaiting Clinic verification'],
      ['Room cleaning 1', 'failed', 'Closed · 2 energy · 0 readings · Incomplete record'],
    ]);
  });

  it('attributes device rows recorded during a cleaning to its card', () => {
    const cleaning = { cycleId: 'c1', planId: 'p1', ended: true, startedAt: 100, endedAt: 200, energyReadings: 2, sensorReadings: 1, signedBy: 'admin', signerRole: 'admin' };
    const lampOn = { idHash: 'l1', seq: 1, kind: 'signal', summary: 'Lamp on', recordedAt: 110, signatures: ['h'], verified: true };
    const lampOff = { idHash: 'l2', seq: 2, kind: 'light', summary: 'light source OFF (done)', recordedAt: 190, signatures: [], verified: false };
    const manual = { idHash: 'l3', seq: 3, kind: 'signal', summary: 'Lamp on', recordedAt: 250, signatures: ['h'], verified: true };
    const treatment = { idHash: 't', seq: 4, kind: 'phase', summary: 'saved treatment p1', recordedAt: 120, signatures: [], verified: false };
    const model = journalModel([cleaning], [lampOn, lampOff, manual, treatment], ['c1']);
    expect(model.transactions[0].entries).toEqual([lampOn, lampOff]);
    expect(model.standalone).toEqual([manual, treatment]);
  });

  it('keeps late signed cycle events in their scoped card instead of a newer cycle', () => {
    const closed = { cycleId: 'c1', planId: 'p1', ended: true, startedAt: 100, endedAt: 200, energyReadings: 2, sensorReadings: 1, signedBy: 'admin', signerRole: 'admin' };
    const next = { ...closed, cycleId: 'c2', startedAt: 250, ended: false, endedAt: 0 };
    const late = { idHash: 'late', seq: 2, kind: 'signal', summary: 'Lamp off', recordedAt: 300, signatures: ['h'], verified: true, scope: 'c1' };
    const original = { idHash: 'original', seq: 1, kind: 'signal', summary: 'Sensor off', recordedAt: 190, signatures: ['h'], verified: true, scope: 'lab:standalone' };
    const model = journalModel([closed, next], [late, original], ['c1', 'c2']);
    expect(model.transactions[0].entries).toEqual([]);
    expect(model.transactions[1].entries).toEqual([original, late]);
    expect(model.standalone).toEqual([]);
  });

  it('attributes rows after an open cleaning started and ignores unknown windows', () => {
    const during = { idHash: 'd', seq: 2, kind: 'sensor', summary: 'sensor ON', recordedAt: 150, signatures: [], verified: false };
    const before = { idHash: 'b', seq: 1, kind: 'sensor', summary: 'sensor OFF', recordedAt: 50, signatures: [], verified: false };
    const open = { cycleId: 'c1', planId: 'p1', ended: false, startedAt: 100, endedAt: 0, energyReadings: 1, sensorReadings: 0, signedBy: null, signerRole: null };
    const running = journalModel([open], [during, before], ['c1']);
    expect(running.transactions[0].entries).toEqual([during]);
    expect(running.standalone).toEqual([before]);
    const timeless = { ...open, startedAt: 0 };
    const unknown = journalModel([timeless], [during], ['c1']);
    expect(unknown.transactions[0].entries).toEqual([]);
    expect(unknown.standalone).toEqual([during]);
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
      cycleLine({ cycleId: 'c', planId: 'p', ended: true, startedAt: 1, endedAt: 2, energyReadings: 2, sensorReadings: 1, signedBy: 'a', signerRole: 'admin' }),
    ).toBe('cycle c: signed by Clinic, 2 energy / 1 readings');
    expect(
      cycleLine({ cycleId: 'c', planId: 'p', ended: false, startedAt: 1, endedAt: 0, energyReadings: 0, sensorReadings: 0, signedBy: null, signerRole: null }),
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
