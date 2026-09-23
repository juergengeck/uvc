/**
 * Simulated hardware for the lab's demo room cleaning.
 *
 * The lamp runs one fixed cycle on command; the sensor measures whenever the
 * lamp is lit during an open cycle. Durations here model the device's physical
 * run time — they are the simulation clock, not waits for data to settle.
 */

/** 3 mW/cm² = 30 W/m², so 10 s deliver the 300 J/m² target dose. Readings are whole mW/cm². */
export const DEMO_CLEANING = {
  title: 'Demo room cleaning',
  durationS: 10,
  irradianceMwCm2: 3,
  targetDoseJm2: 300,
  /** Lamp UV output per second of the cycle: 3 W → 3000 mJ. */
  energyPerSecondMilli: 3000,
} as const;

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
  planPhase(input: { title: string; targetDoseJm2: number; durationS: number; audience: string[] }): Promise<{ planId: string }>;
  startCycle(input: { planId: string; audience: string[] }): Promise<{ cycleId: string }>;
  setLightState(input: { on: boolean; reason: string; audience: string[] }): Promise<unknown>;
  recordEnergy(input: { cycleId: string; joulesMilli: number; audience: string[] }): Promise<unknown>;
  closeCycle(input: { cycleId: string; reason: string; audience: string[] }): Promise<{
    energyReadings: number;
    joulesMilliTotal: number;
    sensorReadings: number;
  }>;
}

/** Runs the demo cycle on the lamp worker; returns the closing summary. */
export async function runLampCleaning(
  ops: LampCleaningOps,
  audience: string[],
  sleep: Sleep,
): Promise<{ cycleId: string; energyReadings: number; joulesMilliTotal: number; sensorReadings: number }> {
  const { title, targetDoseJm2, durationS, energyPerSecondMilli } = DEMO_CLEANING;
  const { planId } = await ops.planPhase({ title, targetDoseJm2, durationS, audience });
  const { cycleId } = await ops.startCycle({ planId, audience });
  await ops.setLightState({ on: true, reason: `${title} started`, audience });
  try {
    for (let second = 0; second < durationS; second += 1) {
      await sleep(TICK_MS);
      await ops.recordEnergy({ cycleId, joulesMilli: energyPerSecondMilli, audience });
    }
  } finally {
    await ops.setLightState({ on: false, reason: `${title} finished`, audience });
  }
  const closed = await ops.closeCycle({ cycleId, reason: `${title} completed`, audience });
  return { cycleId, ...closed };
}

export interface SensorFollowerOps {
  lane: string;
  readLightState(): Promise<{ on: boolean } | null>;
  readCycleEnded(cycleId: string): Promise<boolean | null>;
  setSensorState(input: { on: boolean; reason: string; audience: string[] }): Promise<unknown>;
  recordReading(input: { cycleId: string; irradianceMwCm2: number; audience: string[] }): Promise<unknown>;
}

/**
 * The sensor measures the lamp: while the lamp is on and a cycle is open it
 * switches itself on and records one reading per second for that cycle.
 * Observed versions only trigger a re-check; the decision always reads the
 * latest stored versions, since CHUM may deliver versions out of order.
 */
export function createSensorFollower(ops: SensorFollowerOps, audience: () => string[] | null, sleep: Sleep) {
  const cycles: string[] = [];
  let measuring: { cycleId: string; stop: boolean; done: Promise<void> } | null = null;
  let pending = Promise.resolve();
  let stopped = false;

  async function target(): Promise<string | null> {
    if (!(await ops.readLightState())?.on) return null;
    for (let index = cycles.length - 1; index >= 0; index -= 1) {
      if ((await ops.readCycleEnded(cycles[index])) === false) return cycles[index];
    }
    return null;
  }

  async function measure(cycleId: string, recipients: string[], run: { stop: boolean }): Promise<void> {
    await ops.setSensorState({ on: true, reason: `Measuring cleaning cycle ${cycleId}`, audience: recipients });
    try {
      while (!run.stop) {
        await sleep(TICK_MS);
        if (run.stop) break;
        await ops.recordReading({ cycleId, irradianceMwCm2: DEMO_CLEANING.irradianceMwCm2, audience: recipients });
      }
    } finally {
      await ops.setSensorState({ on: false, reason: `Lamp off for cycle ${cycleId}`, audience: recipients });
    }
  }

  async function reconcile(): Promise<void> {
    const recipients = audience();
    if (!recipients || stopped) return;
    const next = await target();
    if (measuring && measuring.cycleId !== next) {
      measuring.stop = true;
      await measuring.done;
      measuring = null;
    }
    if (!measuring && next && !stopped) {
      const run = { cycleId: next, stop: false, done: Promise.resolve() };
      run.done = measure(next, recipients, run).catch(error => console.error('UVC lab: sensor measurement failed.', error));
      measuring = run;
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
      } else if (!(type === 'UvcLaneLightState' && obj.stateId === `${ops.lane}:light`)) {
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
