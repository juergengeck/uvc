import {
  UVC_LAB_ROLES,
  UVC_LANE_TYPES,
  UvcLaneRecipes,
  createUvcLaneChat,
  createUvcLaneRole,
  createUvcLaneThread,
} from '../uvcLabRecipes.ts';

const PERSON = 'f'.repeat(64);

describe('UVC lane recipes', () => {
  it('declares versioned lane types with id rules', () => {
    expect(UVC_LANE_TYPES).toEqual(['UvcLaneRole', 'UvcLaneChat', 'UvcLaneThread']);
    const byName = new Map(UvcLaneRecipes.map(recipe => [recipe.name, recipe]));
    const isId = (name: string): string[] =>
      (byName.get(name)?.rule ?? []).filter(rule => rule.isId).map(rule => rule.itemprop);
    expect(isId('UvcLaneRole')).toEqual(['lane', 'role']);
    expect(isId('UvcLaneChat')).toEqual(['thread', 'seq']);
    expect(isId('UvcLaneThread')).toEqual(['thread']);
  });

  it('names the lane roles', () => {
    expect([...UVC_LAB_ROLES]).toEqual(['admin', 'doctor', 'lamp', 'sensor', 'user', 'light']);
  });

  it('creates a role anchor', () => {
    expect(createUvcLaneRole({ lane: 'lane-1', role: 'admin', person: PERSON, registeredAt: 7 })).toEqual({
      $type$: 'UvcLaneRole',
      lane: 'lane-1',
      role: 'admin',
      person: PERSON,
      registeredAt: 7,
    });
  });

  it('creates chat and thread records', () => {
    expect(
      createUvcLaneChat({ thread: 'lane-1:admin', seq: 0, sender: PERSON, text: 'hello', sentAt: 9 }),
    ).toEqual({
      $type$: 'UvcLaneChat',
      thread: 'lane-1:admin',
      seq: 0,
      sender: PERSON,
      text: 'hello',
      sentAt: 9,
      prev: '',
    });
    expect(createUvcLaneThread({ thread: 'lane-1:admin', head: 'h', count: 1 })).toEqual({
      $type$: 'UvcLaneThread',
      thread: 'lane-1:admin',
      head: 'h',
      count: 1,
    });
  });

  it('rejects unknown roles, bad hashes, and empty text', () => {
    expect(() => createUvcLaneRole({ lane: 'l', role: 'janitor', person: PERSON, registeredAt: 0 })).toThrow(
      'unknown lane role',
    );
    expect(() => createUvcLaneRole({ lane: '', role: 'admin', person: PERSON, registeredAt: 0 })).toThrow('lane');
    expect(() => createUvcLaneRole({ lane: 'l', role: 'admin', person: 'nope', registeredAt: 0 })).toThrow('person');
    expect(() =>
      createUvcLaneChat({ thread: 't', seq: 0, sender: PERSON, text: '  ', sentAt: 0 }),
    ).toThrow('text');
    expect(() =>
      createUvcLaneChat({ thread: 't', seq: -1, sender: PERSON, text: 'x', sentAt: 0 }),
    ).toThrow('seq');
    expect(() => createUvcLaneThread({ thread: 't', head: '', count: 0 })).toThrow('head');
  });
});
