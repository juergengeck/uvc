import { createSensorFollower, createSimulationClock, DEMO_CLEANING, runLampCleaning } from '../demoCleaning.ts';

const AUDIENCE = ['a'.repeat(64)];
const settle = () => new Promise(resolve => setImmediate(resolve));

describe('demo lamp cleaning', () => {
  it('runs one lit cycle with an energy record per second, then switches off and closes', async () => {
    const calls: string[] = [];
    const ops = {
      planPhase: jest.fn(async () => { calls.push('plan'); return { planId: 'plan' }; }),
      startCycle: jest.fn(async () => { calls.push('start'); return { cycleId: 'cycle' }; }),
      setLightState: jest.fn(async ({ on }: { on: boolean }) => { calls.push(on ? 'light on' : 'light off'); }),
      recordEnergy: jest.fn(async () => { calls.push('energy'); }),
      closeCycle: jest.fn(async () => { calls.push('close'); return { energyReadings: 10, joulesMilliTotal: 30_000, sensorReadings: 9 }; }),
    };
    const sleeps: number[] = [];

    const done = await runLampCleaning(ops, AUDIENCE, async ms => { sleeps.push(ms); });

    expect(ops.planPhase).toHaveBeenCalledWith({
      title: DEMO_CLEANING.title, targetDoseJm2: 300, durationS: 10, audience: AUDIENCE,
    });
    expect(calls).toEqual(['plan', 'start', 'light on', ...Array(10).fill('energy'), 'light off', 'close']);
    expect(ops.recordEnergy).toHaveBeenCalledWith({ cycleId: 'cycle', joulesMilli: 3000, audience: AUDIENCE });
    expect(sleeps).toEqual(Array(10).fill(1000));
    expect(done).toEqual({ cycleId: 'cycle', energyReadings: 10, joulesMilliTotal: 30_000, sensorReadings: 9 });
  });

  it('switches the lamp off and leaves the cycle open when the device stops mid-cycle', async () => {
    const clock = createSimulationClock();
    const setLightState = jest.fn(async () => undefined);
    const closeCycle = jest.fn();
    const running = runLampCleaning({
      planPhase: async () => ({ planId: 'plan' }),
      startCycle: async () => ({ cycleId: 'cycle' }),
      setLightState,
      recordEnergy: async () => undefined,
      closeCycle,
    }, AUDIENCE, clock.sleep);
    await settle();
    clock.stop();

    await expect(running).rejects.toThrow('device simulation stopped');
    expect(setLightState.mock.calls.map(([input]) => (input as { on: boolean }).on)).toEqual([true, false]);
    expect(closeCycle).not.toHaveBeenCalled();
  });
});

describe('sensor follower', () => {
  function sensor() {
    let lampOn = false;
    const ended = new Map<string, boolean>();
    const events: string[] = [];
    const ticks: Array<() => void> = [];
    const follower = createSensorFollower({
      lane: 'lab',
      readLightState: async () => ({ on: lampOn }),
      readCycleEnded: async cycleId => ended.get(cycleId) ?? null,
      setSensorState: async ({ on }) => { events.push(on ? 'sensor on' : 'sensor off'); },
      recordReading: async ({ cycleId, irradianceMwCm2 }) => { events.push(`${cycleId} ${irradianceMwCm2}`); },
    }, () => AUDIENCE, () => new Promise(resolve => ticks.push(resolve)));
    const tick = async () => { ticks.shift()?.(); await settle(); };
    return {
      follower, events, tick,
      lamp: async (on: boolean) => { lampOn = on; await follower.observe('UvcLaneLightState', { stateId: 'lab:light', on: on ? 1 : 0 }); },
      cycle: async (cycleId: string, isEnded: boolean) => { ended.set(cycleId, isEnded); await follower.observe('UvcLaneCycle', { cycleId }); },
    };
  }

  it('measures only while the lamp is on during an open cycle', async () => {
    const { events, tick, lamp, cycle } = sensor();
    await lamp(true);
    expect(events).toEqual([]);
    await cycle('c1', false);
    await tick();
    await tick();
    // Stopping finishes the tick in flight, so release it while the stop is pending.
    const off = lamp(false);
    await settle();
    await tick();
    await off;

    expect(events).toEqual(['sensor on', 'c1 3', 'c1 3', 'sensor off']);
  });

  it('stops measuring when the cycle closes, and ignores other versions', async () => {
    const { follower, events, tick, lamp, cycle } = sensor();
    await cycle('c1', false);
    await follower.observe('UvcLaneLightState', { stateId: 'other:light', on: 1 });
    expect(events).toEqual([]);
    await lamp(true);
    await tick();
    const closed = cycle('c1', true);
    await settle();
    await tick();
    await closed;

    expect(events).toEqual(['sensor on', 'c1 3', 'sensor off']);
  });
});
