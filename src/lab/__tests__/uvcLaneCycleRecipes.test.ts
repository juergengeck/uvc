import {
  UVC_LANE_CYCLE_TYPES,
  UvcLaneCycleRecipes,
  changeAttestationPayload,
  createUvcLaneChangeAttestation,
  createUvcLaneCycle,
  createUvcLaneCycleSignature,
  createUvcLaneEnergy,
  createUvcLaneJournal,
  createUvcLaneLightState,
  createUvcLaneLightChange,
  createUvcLanePhase,
  createUvcLaneReading,
  createUvcLaneSensorChange,
  createUvcLaneSensorState,
  createUvcLaneStreamHead,
} from '../uvcLaneCycleRecipes.ts';

const PERSON = 'e'.repeat(64);
const HASH = 'f'.repeat(64);

describe('UVC lane cycle recipes', () => {
  it('declares versioned cycle types with id rules', () => {
    expect([...UVC_LANE_CYCLE_TYPES]).toEqual([
      'UvcLanePhase',
      'UvcLaneCycle',
      'UvcLaneLightState',
      'UvcLaneLightChange',
      'UvcLaneSensorState',
      'UvcLaneSensorChange',
      'UvcLaneEnergy',
      'UvcLaneReading',
      'UvcLaneCycleSignature',
      'UvcLaneChangeAttestation',
      'UvcLaneJournal',
      'UvcLaneStreamHead',
    ]);
    const byName = new Map(UvcLaneCycleRecipes.map(recipe => [recipe.name, recipe]));
    const isId = (name: string): string[] =>
      (byName.get(name)?.rule ?? []).filter(rule => rule.isId).map(rule => rule.itemprop);
    expect(isId('UvcLanePhase')).toEqual(['planId']);
    expect(isId('UvcLaneCycle')).toEqual(['cycleId']);
    expect(isId('UvcLaneLightState')).toEqual(['stateId']);
    expect(isId('UvcLaneLightChange')).toEqual(['stream', 'seq']);
    expect(isId('UvcLaneSensorState')).toEqual(['stateId']);
    expect(isId('UvcLaneSensorChange')).toEqual(['stream', 'seq']);
    expect(isId('UvcLaneEnergy')).toEqual(['stream', 'seq']);
    expect(isId('UvcLaneReading')).toEqual(['stream', 'seq']);
    expect(isId('UvcLaneCycleSignature')).toEqual(['cycleId']);
    expect(isId('UvcLaneChangeAttestation')).toEqual(['scope']);
    expect(isId('UvcLaneJournal')).toEqual(['stream', 'seq']);
    expect(isId('UvcLaneStreamHead')).toEqual(['stream']);
  });

  it('creates phase, cycle, and light state records', () => {
    expect(
      createUvcLanePhase({ planId: 'p1', title: 'Ward round', targetDoseJm2: 400, durationS: 300, createdBy: PERSON, createdAt: 10 }),
    ).toEqual({
      $type$: 'UvcLanePhase',
      planId: 'p1',
      title: 'Ward round',
      targetDoseJm2: 400,
      durationS: 300,
      createdBy: PERSON,
      createdAt: 10,
    });
    expect(createUvcLaneCycle({ cycleId: 'c1', planId: 'p1', startedBy: PERSON, startedAt: 11 })).toEqual({
      $type$: 'UvcLaneCycle',
      cycleId: 'c1',
      planId: 'p1',
      startedBy: PERSON,
      startedAt: 11,
      endedAt: 0,
      endReason: '',
    });
    expect(createUvcLaneLightState({ stateId: 's', on: true, reason: 'cycle c1', updatedBy: PERSON, updatedAt: 12 })).toEqual({
      $type$: 'UvcLaneLightState',
      stateId: 's',
      on: 1,
      reason: 'cycle c1',
      updatedBy: PERSON,
      updatedAt: 12,
    });
    expect(createUvcLaneSensorState({ stateId: 'sensor', on: false, reason: 'manual off', updatedBy: PERSON, updatedAt: 13 })).toEqual({
      $type$: 'UvcLaneSensorState',
      stateId: 'sensor',
      on: 0,
      reason: 'manual off',
      updatedBy: PERSON,
      updatedAt: 13,
    });
  });

  it('creates metered streams, signatures, journals, and heads', () => {
    expect(
      createUvcLaneEnergy({ stream: 'c1:energy', seq: 0, joulesMilli: 1500, recordedBy: PERSON, recordedAt: 13 }),
    ).toEqual({
      $type$: 'UvcLaneEnergy',
      stream: 'c1:energy',
      seq: 0,
      joulesMilli: 1500,
      recordedBy: PERSON,
      recordedAt: 13,
      prev: '',
    });
    expect(
      createUvcLaneReading({ stream: 'c1:sensor', seq: 0, irradianceMwCm2: 42, recordedBy: PERSON, recordedAt: 14, prev: 'h' }),
    ).toMatchObject({ $type$: 'UvcLaneReading', seq: 0, irradianceMwCm2: 42, prev: 'h' });
    expect(
      createUvcLaneLightChange({ stream: 'lane:light-changes', seq: 0, on: false, reason: 'off', updatedBy: PERSON, recordedAt: 14 }),
    ).toMatchObject({ $type$: 'UvcLaneLightChange', seq: 0, on: 0, reason: 'off', prev: '' });
    expect(
      createUvcLaneSensorChange({ stream: 'lane:sensor-changes', seq: 0, on: true, reason: 'on', updatedBy: PERSON, recordedAt: 14 }),
    ).toMatchObject({ $type$: 'UvcLaneSensorChange', seq: 0, on: 1, reason: 'on', prev: '' });
    expect(
      createUvcLaneCycleSignature({ cycleId: 'c1', signerRole: 'admin', signer: PERSON, signedAt: 15, recordIds: [HASH] }),
    ).toEqual({
      $type$: 'UvcLaneCycleSignature',
      cycleId: 'c1',
      signerRole: 'admin',
      signer: PERSON,
      signedAt: 15,
      recordsJson: JSON.stringify([HASH]),
    });
    expect(createUvcLaneJournal({ stream: 'lane:admin', seq: 0, kind: 'cycle', summary: 'started', recordedAt: 16 })).toMatchObject({
      $type$: 'UvcLaneJournal',
      kind: 'cycle',
    });
    expect(createUvcLaneStreamHead({ stream: 'c1:energy', head: HASH, count: 1 })).toEqual({
      $type$: 'UvcLaneStreamHead',
      stream: 'c1:energy',
      head: HASH,
      count: 1,
    });
  });

  it('creates a canonical signed change attestation over exact object versions', () => {
    const input = {
      scope: 'c1',
      lane: 'lane',
      cycleId: 'c1',
      cycleVersion: HASH,
      lampRecords: [HASH],
      sensorRecords: ['a'.repeat(64)],
      signer: PERSON,
      signerRole: 'admin',
      signedAt: 17,
      signingKey: 'b'.repeat(64),
      adminRole: 'c'.repeat(64),
    };
    expect(changeAttestationPayload(input)).toBe(JSON.stringify(input));
    expect(createUvcLaneChangeAttestation({ ...input, signature: 'd'.repeat(128) })).toEqual({
      $type$: 'UvcLaneChangeAttestation',
      ...input,
      signature: 'd'.repeat(128),
    });
    expect(() => createUvcLaneChangeAttestation({ ...input, signature: 'bad' })).toThrow('signature');
  });

  it('rejects backward closes, empty signatures, and bad hashes', () => {
    expect(() =>
      createUvcLaneCycle({ cycleId: 'c', planId: 'p', startedBy: PERSON, startedAt: 10, endedAt: 9 }),
    ).toThrow('endedAt');
    expect(() =>
      createUvcLaneCycleSignature({ cycleId: 'c', signerRole: 'admin', signer: PERSON, signedAt: 1, recordIds: [] }),
    ).toThrow('recordIds');
    expect(() =>
      createUvcLaneCycleSignature({ cycleId: 'c', signerRole: 'admin', signer: PERSON, signedAt: 1, recordIds: ['nope'] }),
    ).toThrow('recordIds');
    expect(() => createUvcLaneStreamHead({ stream: 's', head: '', count: 0 })).toThrow('head');
    expect(() =>
      createUvcLaneEnergy({ stream: 's', seq: 0, joulesMilli: -1, recordedBy: PERSON, recordedAt: 0 }),
    ).toThrow('joulesMilli');
  });
});
