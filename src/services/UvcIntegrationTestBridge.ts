import type {SHA256IdHash} from '@refinio/one.core/lib/util/type-checks.js';
import type {Person} from '@refinio/one.core/lib/recipes.js';

import type {
  UvcControlTarget,
  UvcLightState,
  UvcSetLightInput,
} from '../models/device/DeviceControlModel';

const ID_HASH = /^[0-9a-f]{64}$/iu;

export interface UvcIntegrationControlAction {
  actionId: string;
  operation: 'esp32-led-cycle';
  deviceId: string;
  executorPersonId: SHA256IdHash<Person>;
}

export interface UvcIntegrationDeviceControl {
  readLight(target: UvcControlTarget): Promise<UvcLightState>;
  setLight(target: UvcControlTarget, desired: UvcSetLightInput): Promise<UvcLightState>;
}

/** Parse the development-only physical Expo automation URL. */
export function parseUvcIntegrationControlUrl(
  rawUrl: string,
  expectedSecret: string,
): UvcIntegrationControlAction | undefined {
  const url = new URL(rawUrl);
  if (url.protocol !== 'uvc.one:' || url.hostname !== 'integration' || url.pathname !== '/uvc-control') {
    return undefined;
  }
  const encodedEnvelope = url.hash.startsWith('#') ? url.hash.slice(1) : '';
  if (!encodedEnvelope) throw new Error('[UvcIntegrationBridge] control action has no envelope');
  const envelope = JSON.parse(decodeURIComponent(encodedEnvelope)) as {
    secret?: string;
    action?: Partial<UvcIntegrationControlAction>;
  };
  if (!expectedSecret || envelope.secret !== expectedSecret) {
    throw new Error('[UvcIntegrationBridge] rejected unauthenticated control action');
  }
  const input = envelope.action;
  if (!input) throw new Error('[UvcIntegrationBridge] control action has no payload');
  if (
    typeof input.actionId !== 'string'
    || !input.actionId.trim()
    || input.operation !== 'esp32-led-cycle'
    || typeof input.deviceId !== 'string'
    || !input.deviceId.trim()
    || typeof input.executorPersonId !== 'string'
    || !ID_HASH.test(input.executorPersonId)
  ) {
    throw new Error('[UvcIntegrationBridge] invalid control action payload');
  }
  return input as UvcIntegrationControlAction;
}

/**
 * Invoke the same DeviceControlModel methods as the Expo UI. Each transition
 * waits for the correlated producer-owned observation before continuing.
 */
export async function runUvcIntegrationControlAction(
  control: UvcIntegrationDeviceControl,
  action: UvcIntegrationControlAction,
): Promise<void> {
  const target: UvcControlTarget = {
    deviceId: action.deviceId,
    kind: 'esp32',
    executorPersonId: action.executorPersonId,
  };
  const baseline = await control.readLight(target);
  await requireState(control.setLight(target, {enabled: true}), true, 'LED ON');
  await requireState(control.setLight(target, {enabled: false}), false, 'LED OFF');
  await requireState(control.setLight(target, {
    enabled: baseline.enabled,
    ...(baseline.intensity === undefined ? {} : {intensity: baseline.intensity}),
  }), baseline.enabled, 'LED baseline restore');
  await requireState(control.readLight(target), baseline.enabled, 'LED final read');
}

async function requireState(
  pending: Promise<UvcLightState>,
  expected: boolean,
  label: string,
): Promise<void> {
  const observed = await pending;
  if (observed.enabled !== expected) {
    throw new Error(`[UvcIntegrationBridge] ${label} expected enabled=${String(expected)}, observed ${String(observed.enabled)}`);
  }
}
