import {
  chatLine,
  columnModel,
  connectionLine,
  cycleLine,
  journalLine,
  shortId,
} from '../laneViewModel.ts';

describe('lane column view model', () => {
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
    expect(journalLine({ idHash: 'h', seq: 0, kind: 'signature', summary: 'signed', recordedAt: 1, signatures: [] })).toBe(
      '[signature] signed',
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
      journalTail: [{ idHash: 'h', seq: 0, kind: 'light', summary: 'ON', recordedAt: 1, signatures: [] }],
      cycles: [],
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
