import { createDeviceChatCommands, parseDeviceChatCommand } from '../deviceChatCommands.ts';

const PEER = 'b'.repeat(64);
const AUDIENCE = ['a'.repeat(64), PEER];

function lamp() {
  let state: { on: boolean; reason: string; updatedAt: number } | null = null;
  const setState = jest.fn(async (on: boolean, reason: string) => { state = { on, reason, updatedAt: 0 }; });
  const replies: string[] = [];
  const commands = createDeviceChatCommands({
    device: 'Lamp',
    readState: async () => state,
    setState,
    reply: async (_peer, text) => { replies.push(text); },
  });
  return { commands, setState, replies };
}

const incoming = (text: string, id = text) => ({ id, incoming: true, text });

describe('device chat commands', () => {
  it('accepts only on, off and status', () => {
    expect(parseDeviceChatCommand(' On ')).toBe('on');
    expect(parseDeviceChatCommand('off')).toBe('off');
    expect(parseDeviceChatCommand('STATUS')).toBe('status');
    expect(parseDeviceChatCommand('turn on')).toBeNull();
  });

  it('switches state and answers with the recorded status', async () => {
    const { commands, setState, replies } = lamp();
    commands.enable({ audience: AUDIENCE });

    await commands.receive(PEER, incoming('status'));
    await commands.receive(PEER, incoming('on'));
    await commands.receive(PEER, incoming('off'));

    expect(setState.mock.calls.map(([on, , audience]) => [on, audience])).toEqual([[true, AUDIENCE], [false, AUDIENCE]]);
    expect(replies[0]).toBe('Lamp has no recorded state.');
    expect(replies[1]).toMatch(/^Lamp is on · since /);
    expect(replies[2]).toMatch(/^Lamp is off · since /);
  });

  it('ignores own messages, non-commands, and runs nothing until enabled', async () => {
    const { commands, setState, replies } = lamp();
    await commands.receive(PEER, incoming('on'));
    commands.enable({ audience: AUDIENCE });
    await commands.receive(PEER, { id: 'own', incoming: false, text: 'on' });
    await commands.receive(PEER, incoming('Sensor is on · since 10:00'));

    expect(setState).not.toHaveBeenCalled();
    expect(replies).toEqual([]);
  });

  it('reports a failed command back to the sender', async () => {
    const replies: string[] = [];
    const commands = createDeviceChatCommands({
      device: 'Sensor',
      readState: async () => null,
      setState: async () => { throw new Error('storage offline'); },
      reply: async (_peer, text) => { replies.push(text); },
    });
    commands.enable({ audience: AUDIENCE });

    await commands.receive(PEER, incoming('on'));
    expect(replies).toEqual(['Sensor could not run "on": storage offline']);
  });

  it('rejects an audience that is not Person hashes', () => {
    expect(() => lamp().commands.enable({ audience: [] })).toThrow('non-empty Person-hash audience');
    expect(() => lamp().commands.enable({ audience: ['nope'] })).toThrow('non-empty Person-hash audience');
  });

  it('runs clean beside the command queue and refuses switching until it finishes', async () => {
    let finish!: (summary: string) => void;
    const replies: string[] = [];
    const clean = jest.fn(() => new Promise<string>(resolve => { finish = resolve; }));
    const setState = jest.fn(async () => undefined);
    const commands = createDeviceChatCommands({
      device: 'Lamp',
      readState: async () => ({ on: true, reason: 'Demo room cleaning started', updatedAt: 0 }),
      setState,
      reply: async (_peer, text) => { replies.push(text); },
      clean,
    });
    commands.enable({ audience: AUDIENCE });

    const cycle = commands.receive(PEER, incoming('clean'));
    await commands.receive(PEER, incoming('clean', 'second clean'));
    await commands.receive(PEER, incoming('off'));
    await commands.receive(PEER, incoming('status'));
    finish('Lamp cleaning finished');
    await cycle;

    expect(clean).toHaveBeenCalledTimes(1);
    expect(clean).toHaveBeenCalledWith(AUDIENCE);
    expect(setState).not.toHaveBeenCalled();
    expect(replies[0]).toBe('Lamp could not run "clean": a cleaning cycle is already running.');
    expect(replies[1]).toMatch(/^Lamp could not run "off": a cleaning cycle is running/);
    expect(replies[2]).toMatch(/^Lamp is on · since /);
    expect(replies[3]).toBe('Lamp cleaning finished');
  });

  it('ignores clean on a device without a cleaning runner', async () => {
    const { commands, replies } = lamp();
    commands.enable({ audience: AUDIENCE });
    await commands.receive(PEER, incoming('clean'));
    expect(replies).toEqual([]);
  });
});
