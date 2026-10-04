/**
 * Simulated hardware for the lab's demo room cleaning.
 *
 * The lamp runs its active treatment on command; the sensor measures the
 * treatment's irradiance whenever the lamp is lit during an open cycle. Durations here model the device's physical
 * run time — they are the simulation clock, not waits for data to settle.
 */

import { DEFAULT_TREATMENT, treatment, type Treatment, type TreatmentParameters } from './treatment.ts';

const TICK_MS = 1000;

type Sleep = (ms: number) => Promise<void>;

/** Device run time; `stop` rejects every pending tick so shutdown ends running cycles. */
export function createSimulationClock() {
  const timers = new Map<ReturnType<typeof setTimeout>, (error: Error) => void>();
  let stopped = false;
  return {
    sleep(ms: number): Promise<void> {
      if (stopped) return Promise.reject(new Error('UVC lab: device simulation stopped.'));
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { timers.delete(timer); resolve(); }, ms);
        timers.set(timer, reject);
      });
    },
    stop(): void {
      stopped = true;
      for (const [timer, reject] of timers) {
        clearTimeout(timer);
        reject(new Error('UVC lab: device simulation stopped.'));
      }
      timers.clear();
    },
  };
}

export interface LampCleaningOps {
  /** The lamp's active treatment, or null before one was saved. */
  readTreatment(): Promise<(Treatment & { planId: string }) | null>;
  planPhase(input: TreatmentParameters & { audience: string[] }): Promise<{ planId: string }>;
  startCycle(input: { planId: string; audience: string[] }): Promise<{ cycleId: string }>;
  readLightState(): Promise<{ on: boolean } | null>;
  setLightState(input: { on: boolean; reason: string; audience: string[] }): Promise<unknown>;
  recordEnergy(input: { cycleId: string; joulesMilli: number; audience: string[] }): Promise<unknown>;
  closeCycle(input: { cycleId: string; reason: string; audience: string[] }): Promise<{
    energyReadings: number;
    joulesMilliTotal: number;
    sensorReadings: number;
  }>;
}

/**
 * Runs one cycle of the lamp's active treatment; a lamp without a saved
 * treatment first records its factory treatment so every cycle references a
 * stored plan. Switching the lamp off interrupts metering and leaves the cycle
 * open. Returns the treatment and the closing summary only after a full run.
 */
export async function runLampCleaning(
  ops: LampCleaningOps,
  audience: string[],
  sleep: Sleep,
): Promise<{ treatment: Treatment; cycleId: string; energyReadings: number; joulesMilliTotal: number; sensorReadings: number }> {
  const saved = await ops.readTreatment();
  const active = saved ?? { planId: (await ops.planPhase({ ...DEFAULT_TREATMENT, audience })).planId, ...treatment(DEFAULT_TREATMENT) };
  const { planId, title, durationS, lampPowerMw } = active;
  const { cycleId } = await ops.startCycle({ planId, audience });
  await ops.setLightState({ on: true, reason: `${title} started`, audience });
  try {
    for (let second = 0; second < durationS; second += 1) {
      await sleep(TICK_MS);
      if (!(await ops.readLightState())?.on) {
        throw new Error(`UVC lab: ${title} interrupted because the lamp was switched off.`);
      }
      await ops.recordEnergy({ cycleId, joulesMilli: lampPowerMw, audience });
    }
  } finally {
    if ((await ops.readLightState())?.on) {
      await ops.setLightState({ on: false, reason: `${title} finished`, audience });
    }
  }
  const closed = await ops.closeCycle({ cycleId, reason: `${title} completed`, audience });
  const { planId: _planId, ...ran } = active;
  return { treatment: ran, cycleId, ...closed };
}

export interface SensorFollowerOps {
  lane: string;
  readLightState(): Promise<{ on: boolean } | null>;
  readSensorState(): Promise<{ on: boolean } | null>;
  readCycleEnded(cycleId: string): Promise<boolean | null>;
  /** Irradiance of the cycle's treatment in µW/cm², or null until the plan arrives. */
  readCycleIrradiance(cycleId: string): Promise<number | null>;
  setSensorState(input: { on: boolean; reason: string; audience: string[] }): Promise<unknown>;
  recordReading(input: { cycleId: string; irradianceUwCm2: number; audience: string[] }): Promise<unknown>;
}

/**
 * The sensor measures the lamp: while the lamp is on and a cycle is open it
 * switches itself on and records one reading per second for that cycle.
 * Manual sensor off pauses that cycle; switching the sensor on resumes it.
 * Observed versions only trigger a re-check; the decision always reads the
 * latest stored versions, since CHUM may deliver versions out of order.
 */
export function createSensorFollower(ops: SensorFollowerOps, audience: () => string[] | null, sleep: Sleep) {
  const cycles: string[] = [];
  let measuring: { cycleId: string; stop: boolean; done: Promise<void> } | null = null;
  let pausedCycle: string | null = null;
  type Target = { cycleId: string; irradianceUwCm2: number };
  let pending = Promise.resolve();
  let stopped = false;

  async function target(): Promise<Target | null> {
    if (!(await ops.readLightState())?.on) return null;
    for (let index = cycles.length - 1; index >= 0; index -= 1) {
      const cycleId = cycles[index];
      if ((await ops.readCycleEnded(cycleId)) !== false) continue;
      // The cycle's plan may arrive after the cycle; its arrival re-checks.
      const irradianceUwCm2 = await ops.readCycleIrradiance(cycleId);
      // A manual sensor off pauses this cycle until the sensor is switched on.
      if (pausedCycle === cycleId && !(await ops.readSensorState())?.on) return null;
      return irradianceUwCm2 === null ? null : { cycleId, irradianceUwCm2 };
    }
    return null;
  }

  async function measure({ cycleId, irradianceUwCm2 }: Target, recipients: string[], run: { stop: boolean }): Promise<void> {
    await ops.setSensorState({ on: true, reason: `Measuring cleaning cycle ${cycleId}`, audience: recipients });
    try {
      while (!run.stop) {
        await sleep(TICK_MS);
        if (run.stop) break;
        if (!(await ops.readSensorState())?.on) {
          pausedCycle = cycleId;
          break;
        }
        if (!(await ops.readLightState())?.on || (await ops.readCycleEnded(cycleId)) !== false) break;
        await ops.recordReading({ cycleId, irradianceUwCm2, audience: recipients });
      }
    } finally {
      run.stop = true;
      if ((await ops.readSensorState())?.on) {
        await ops.setSensorState({ on: false, reason: `Lamp off for cycle ${cycleId}`, audience: recipients });
      }
    }
  }

  async function reconcile(): Promise<void> {
    const recipients = audience();
    if (!recipients || stopped) return;
    if (measuring && !measuring.stop && !(await ops.readSensorState())?.on) {
      pausedCycle = measuring.cycleId;
      measuring.stop = true;
    }
    const next = await target();
    if (measuring && (measuring.stop || measuring.cycleId !== next?.cycleId)) {
      measuring.stop = true;
      await measuring.done;
      measuring = null;
    }
    if (!measuring && next && !stopped) {
      const run = { cycleId: next.cycleId, stop: false, done: Promise.resolve() };
      measuring = run;
      pausedCycle = null;
      run.done = measure(next, recipients, run)
        .catch(error => console.error('UVC lab: sensor measurement failed.', error))
        .finally(() => { if (measuring === run) measuring = null; });
    }
  }

  const queue = (): Promise<void> => {
    const next = pending.then(reconcile);
    pending = next.catch(error => console.error('UVC lab: sensor follower failed.', error));
    return next;
  };

  return {
    observe(type: string, obj: Record<string, unknown>): Promise<void> {
      if (type === 'UvcLaneCycle' && typeof obj.cycleId === 'string') {
        if (!cycles.includes(obj.cycleId)) cycles.push(obj.cycleId);
      } else if (type !== 'UvcLanePhase'
        && !(type === 'UvcLaneLightState' && obj.stateId === `${ops.lane}:light`)
        && !(type === 'UvcLaneSensorState' && obj.stateId === `${ops.lane}:sensor`)) {
        return pending;
      }
      return queue();
    },

    async stop(): Promise<void> {
      stopped = true;
      await pending;
      if (measuring) {
        measuring.stop = true;
        await measuring.done;
        measuring = null;
      }
    },
  };
}
