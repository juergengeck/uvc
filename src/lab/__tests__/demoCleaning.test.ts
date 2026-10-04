import { createSensorFollower, createSimulationClock, runLampCleaning } from '../demoCleaning.ts';
import { DEFAULT_TREATMENT } from '../treatment.ts';

const AUDIENCE = ['a'.repeat(64)];
const settle = () => new Promise(resolve => setImmediate(resolve));

describe('demo lamp cleaning', () => {
  it('records the factory treatment on first run, then runs one lit cycle metered per second', async () => {
    const calls: string[] = [];
    const ops = {
      readTreatment: jest.fn(async () => null),
      planPhase: jest.fn(async () => { calls.push('plan'); return { planId: 'plan' }; }),
      startCycle: jest.fn(async () => { calls.push('start'); return { cycleId: 'cycle' }; }),
      readLightState: async () => ({ on: true }),
      setLightState: jest.fn(async ({ on }: { on: boolean }) => { calls.push(on ? 'light on' : 'light off'); }),
      recordEnergy: jest.fn(async () => { calls.push('energy'); }),
      closeCycle: jest.fn(async () => { calls.push('close'); return { energyReadings: 10, joulesMilliTotal: 30_000, sensorReadings: 9 }; }),
    };
    const sleeps: number[] = [];

    const done = await runLampCleaning(ops, AUDIENCE, async ms => { sleeps.push(ms); });

    expect(ops.planPhase).toHaveBeenCalledWith({ ...DEFAULT_TREATMENT, audience: AUDIENCE });
    expect(calls).toEqual(['plan', 'start', 'light on', ...Array(10).fill('energy'), 'light off', 'close']);
    expect(ops.recordEnergy).toHaveBeenCalledWith({ cycleId: 'cycle', joulesMilli: 3000, audience: AUDIENCE });
    expect(sleeps).toEqual(Array(10).fill(1000));
    expect(done).toEqual({
      treatment: { ...DEFAULT_TREATMENT, durationS: 10 },
      cycleId: 'cycle', energyReadings: 10, joulesMilliTotal: 30_000, sensorReadings: 9,
    });
  });

  it('runs the saved treatment without planning a new one', async () => {
    const saved = { planId: 'ward', title: 'Ward', wavelengthNm: 222, irradianceUwCm2: 500, targetDoseJm2: 20, lampPowerMw: 800, durationS: 4 };
    const planPhase = jest.fn();
    const startCycle = jest.fn(async () => ({ cycleId: 'cycle' }));
    const recordEnergy = jest.fn(async () => undefined);
    const done = await runLampCleaning({
      readTreatment: async () => saved,
      planPhase,
      startCycle,
      readLightState: async () => ({ on: true }),
      setLightState: async () => undefined,
      recordEnergy,
      closeCycle: async () => ({ energyReadings: 4, joulesMilliTotal: 3200, sensorReadings: 3 }),
    }, AUDIENCE, async () => undefined);

    expect(planPhase).not.toHaveBeenCalled();
    expect(startCycle).toHaveBeenCalledWith({ planId: 'ward', audience: AUDIENCE });
    expect(recordEnergy.mock.calls.map(([input]) => (input as { joulesMilli: number }).joulesMilli)).toEqual([800, 800, 800, 800]);
    expect(done.treatment.title).toBe('Ward');
  });

  it('switches the lamp off and leaves the cycle open when the device stops mid-cycle', async () => {
    const clock = createSimulationClock();
    const setLightState = jest.fn(async () => undefined);
    const closeCycle = jest.fn();
    const running = runLampCleaning({
      readTreatment: async () => null,
      planPhase: async () => ({ planId: 'plan' }),
      startCycle: async () => ({ cycleId: 'cycle' }),
      readLightState: async () => ({ on: true }),
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

  it('stops metering and leaves the cycle open when the lamp is manually switched off', async () => {
    let lampOn = false;
    let elapsed = 0;
    const recordEnergy = jest.fn(async () => undefined);
    const closeCycle = jest.fn();
    const setLightState = jest.fn(async ({ on }: { on: boolean }) => { lampOn = on; });

    const running = runLampCleaning({
      readTreatment: async () => null,
      planPhase: async () => ({ planId: 'plan' }),
      startCycle: async () => ({ cycleId: 'cycle' }),
      readLightState: async () => ({ on: lampOn }),
      setLightState,
      recordEnergy,
      closeCycle,
    }, AUDIENCE, async () => {
      elapsed += 1;
      if (elapsed === 3) lampOn = false;
    });

    await expect(running).rejects.toThrow('interrupted because the lamp was switched off');
    expect(elapsed).toBe(3);
    expect(recordEnergy).toHaveBeenCalledTimes(2);
    expect(recordEnergy).toHaveBeenCalledWith({ cycleId: 'cycle', joulesMilli: 3000, audience: AUDIENCE });
    expect(closeCycle).not.toHaveBeenCalled();
    // The runner preserves the manual off state and its reason.
    expect(setLightState).toHaveBeenCalledTimes(1);
  });
});

describe('sensor follower', () => {
  function sensor() {
    let lampOn = false;
    let sensorOn = false;
    const ended = new Map<string, boolean>();
    const events: string[] = [];
    const ticks: Array<() => void> = [];
    const follower = createSensorFollower({
      lane: 'lab',
      readLightState: async () => ({ on: lampOn }),
      readSensorState: async () => ({ on: sensorOn }),
      readCycleEnded: async cycleId => ended.get(cycleId) ?? null,
      readCycleIrradiance: async () => 250,
      setSensorState: async ({ on }) => { sensorOn = on; events.push(on ? 'sensor on' : 'sensor off'); },
      recordReading: async ({ cycleId, irradianceUwCm2 }) => {
        if (!sensorOn) throw new Error('sensor must be active');
        events.push(`${cycleId} ${irradianceUwCm2}`);
      },
    }, () => AUDIENCE, () => new Promise(resolve => ticks.push(resolve)));
    const tick = async () => { ticks.shift()?.(); await settle(); };
    return {
      follower, events, tick,
      lamp: async (on: boolean) => { lampOn = on; await follower.observe('UvcLaneLightState', { stateId: 'lab:light', on: on ? 1 : 0 }); },
      sensorState: async (on: boolean, observe = true) => {
        sensorOn = on;
        if (observe) await follower.observe('UvcLaneSensorState', { stateId: 'lab:sensor', on: on ? 1 : 0 });
      },
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

    expect(events).toEqual(['sensor on', 'c1 250', 'c1 250', 'sensor off']);
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

    expect(events).toEqual(['sensor on', 'c1 250', 'sensor off']);
  });

  it('pauses on manual sensor off and resumes the same open cycle on manual on', async () => {
    const { follower, events, tick, lamp, cycle, sensorState } = sensor();
    await lamp(true);
    await cycle('c1', false);
    await tick();

    const off = sensorState(false);
    await settle();
    await tick();
    await off;
    expect(events).toEqual(['sensor on', 'c1 250']);

    // Repeated cycle/phase arrivals must not undo the manual off.
    await cycle('c1', false);
    await follower.observe('UvcLanePhase', { planId: 'plan' });
    await tick();
    expect(events).toEqual(['sensor on', 'c1 250']);

    await sensorState(true);
    await tick();
    const stopping = follower.stop();
    await settle();
    await tick();
    await stopping;
    expect(events).toEqual(['sensor on', 'c1 250', 'sensor on', 'c1 250', 'sensor off']);
  });

  it('checks the stored sensor state before writing even before its off event arrives', async () => {
    const { follower, events, tick, lamp, cycle, sensorState } = sensor();
    await lamp(true);
    await cycle('c1', false);
    await sensorState(false, false);
    await tick();
    expect(events).toEqual(['sensor on']);

    // A stale off version only triggers a read of the current stored on state.
    await sensorState(true);
    await follower.observe('UvcLaneSensorState', { stateId: 'other:sensor', on: 0 });
    await follower.observe('UvcLaneSensorState', { stateId: 'lab:sensor', on: 0 });
    await tick();
    const stopping = follower.stop();
    await settle();
    await tick();
    await stopping;
    expect(events).toEqual(['sensor on', 'sensor on', 'c1 250', 'sensor off']);
  });

  it('automatically resumes measurement after the lamp turns off and on in the same cycle', async () => {
    const { follower, events, tick, lamp, cycle } = sensor();
    await lamp(true);
    await cycle('c1', false);
    await tick();
    const off = lamp(false);
    await settle();
    await tick();
    await off;

    await lamp(true);
    await tick();
    const stopping = follower.stop();
    await settle();
    await tick();
    await stopping;
    expect(events).toEqual(['sensor on', 'c1 250', 'sensor off', 'sensor on', 'c1 250', 'sensor off']);
  });
});
