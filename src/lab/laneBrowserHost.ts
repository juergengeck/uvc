/**
 * Browser host spawn for lane workers.
 *
 * The bundler-specific piece lives here and only here: a same-origin worker
 * bundle URL (built into the web export's static assets) plus the `lane-key`
 * first message the worker entry expects. Everything above this seam
 * (bootLane, seedLaneMesh, snapshotRole) is bundler-agnostic and tested.
 *
 * Guards the Worker/global references so importing this module never crashes
 * a non-DOM realm; spawning throws an explicit error there instead.
 */

import type { SpawnedLaneWorker } from './hostSwitch.ts';
import type { LanePort } from './portIpc.ts';

export interface LaneWorkerLaunch {
  role: string;
  lane: string;
  email: string;
  secret: string;
  session: string;
  commServerUrl?: string;
  appBaseUrl: string;
  workerUrl: string;
}

export function spawnLaneWorker({
  role,
  lane,
  email,
  secret,
  session,
  commServerUrl,
  appBaseUrl,
  workerUrl,
}: LaneWorkerLaunch): SpawnedLaneWorker {
  const WorkerCtor =
    typeof globalThis !== 'undefined' ? (globalThis as unknown as { Worker?: unknown }).Worker : undefined;
  if (typeof WorkerCtor !== 'function') {
    throw new Error('UVC lab: lane workers need a DOM realm with Web Workers.');
  }
  const worker = new (WorkerCtor as new (url: string | URL) => Worker)(workerUrl);
  const port: LanePort = {
    postMessage: (message, transfer) => worker.postMessage(message, transfer as Transferable[]),
    addEventListener: (_type, listener) => {
      worker.addEventListener('message', event => listener(event as MessageEvent));
    },
  };
  worker.addEventListener('error', () => {
    // Errors also surface through boot-failed/failed IPC calls; the listener
    // exists so failures are never silent in the console.
  });
  worker.postMessage({ kind: 'lane-key', key: role, lane, email, secret, session, commServerUrl, appBaseUrl });
  return {
    port,
    terminate: () => worker.terminate(),
    onError: (callback: (error: Error) => void) =>
      worker.addEventListener('error', event => callback(new Error(event.message || 'Lane worker failed to load'))),
  };
}
