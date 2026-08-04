#!/usr/bin/env node

const DEFAULT_API_URL = 'http://127.0.0.1:8788';
const API_TIMEOUT_MS = 30_000;
const DISCOVERY_TIMEOUT_MS = 20_000;
const DEFAULT_ON_HOLD_MS = 3000;

const options = parseArgs(process.argv.slice(2));
const secret = process.env.UVC_E2E_SECRET;
if (!secret) {
  throw new Error('UVC_E2E_SECRET must be set for the test and the running Cube');
}

const health = await fetchJson(`${options.apiUrl}/health`, {
  signal: AbortSignal.timeout(3000),
});
if (health?.status !== 'ok' || health?.running !== true) {
  throw new Error(`UVC Cube test API is not healthy: ${JSON.stringify(health)}`);
}
for (const operation of ['cubeIdentity', 'discovery', 'deviceControl', 'journal']) {
  if (!health.operations?.includes(operation)) {
    throw new Error(`UVC Cube does not expose required operation ${operation}`);
  }
}

const identity = await postPlan('cubeIdentity', 'get');
requireIdHash(identity?.personId, 'Cube Person id');

const device = await waitForEsp32(options.deviceId);
const startedAt = Date.now();
let testError;

console.log(`[esp32-led] device=${device.id} endpoint=${device.address}:${device.port}`);

try {
  const baseline = requireObserved(
    await readLight(device.id, identity.personId),
    undefined,
    'baseline read',
  );
  console.log(`[esp32-led] baseline enabled=${baseline.enabled}`);

  requireObserved(
    await setLight(device.id, identity.personId, true),
    true,
    'LED ON command',
  );
  requireObserved(
    await readLight(device.id, identity.personId),
    true,
    'LED ON readback',
  );
  console.log(`[esp32-led] firmware controller acknowledged ON; holding for ${options.onHoldMs}ms`);
  await new Promise(resolve => setTimeout(resolve, options.onHoldMs));

  requireObserved(
    await setLight(device.id, identity.personId, false),
    false,
    'LED OFF command',
  );
  requireObserved(
    await readLight(device.id, identity.personId),
    false,
    'LED OFF readback',
  );
  console.log('[esp32-led] firmware controller acknowledged OFF');

  const entries = await postPlan('journal', 'listDeviceEvents', {deviceId: device.id});
  requireJournalEvidence(entries, device.id, startedAt);
  const visibleRecords = await postPlan('journal', 'listRecords');
  requireVisibleJournalRecords(visibleRecords, device.id, startedAt);
} catch (error) {
  testError = error;
}

let cleanupError;
try {
  requireObserved(
    await setLight(device.id, identity.personId, false),
    false,
    'cleanup LED OFF command',
  );
  requireObserved(
    await readLight(device.id, identity.personId),
    false,
    'cleanup LED OFF readback',
  );
} catch (error) {
  cleanupError = error;
}

if (testError && cleanupError) {
  throw new AggregateError([testError, cleanupError], 'LED cycle and OFF cleanup both failed');
}
if (testError) throw testError;
if (cleanupError) throw cleanupError;

console.log('[esp32-led] PASS: firmware controller acknowledged ON then OFF; final state is OFF');

function parseArgs(argv) {
  const parsed = {
    apiUrl: process.env.UVC_E2E_API_URL ?? DEFAULT_API_URL,
    deviceId: process.env.UVC_ESP32_DEVICE_ID,
    onHoldMs: Number(process.env.UVC_LED_ON_HOLD_MS ?? DEFAULT_ON_HOLD_MS),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--') continue;
    if (token === '--api-url') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--api-url requires a URL');
      parsed.apiUrl = value.replace(/\/$/u, '');
      index += 1;
      continue;
    }
    if (token === '--device-id') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--device-id requires an ESP32 device id');
      parsed.deviceId = value;
      index += 1;
      continue;
    }
    if (token === '--on-hold-ms') {
      const value = Number.parseInt(argv[index + 1] ?? '', 10);
      if (!Number.isInteger(value) || value < 0) {
        throw new Error('--on-hold-ms requires a non-negative integer');
      }
      parsed.onHoldMs = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  if (!Number.isFinite(parsed.onHoldMs) || parsed.onHoldMs < 0) {
    throw new Error('UVC_LED_ON_HOLD_MS must be a non-negative number');
  }
  return parsed;
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`Invalid JSON from ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}: ${text}`);
  return data;
}

async function postPlan(operation, method, body = {}) {
  return await fetchJson(`${options.apiUrl}/api/${operation}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-uvc-e2e-secret': secret,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
}

function selectEsp32(runtime, requestedId) {
  if (!Array.isArray(runtime?.devices)) {
    throw new Error(`Discovery returned no device list: ${JSON.stringify(runtime)}`);
  }
  const candidates = runtime.devices.filter(device => (
    device.type?.trim().toLowerCase() === 'esp32'
    && device.online !== false
    && device.trustState !== 'unprovisioned'
    && (!requestedId || device.id === requestedId)
  ));
  if (candidates.length > 1) {
    throw new Error(
      requestedId
        ? `Found multiple live commissioned ESP32 devices with id ${requestedId}`
        : `Found ${candidates.length} live commissioned ESP32 devices; use --device-id to select one`,
    );
  }
  if (candidates.length === 0) return undefined;
  const [device] = candidates;
  if (!device.address || !device.port) throw new Error(`ESP32 ${device.id} has no routable endpoint`);
  return device;
}

async function waitForEsp32(requestedId) {
  await postPlan('discovery', 'refreshRuntime');
  const deadline = Date.now() + DISCOVERY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const device = selectEsp32(
      await postPlan('discovery', 'getRuntime'),
      requestedId,
    );
    if (device) return device;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(
    requestedId
      ? `Timed out waiting for live commissioned ESP32 ${requestedId}`
      : 'Timed out waiting for one live commissioned ESP32',
  );
}

async function readLight(deviceId, executorPersonId) {
  return await postPlan('deviceControl', 'readLight', {
    deviceId,
    kind: 'esp32',
    executorPersonId,
  });
}

async function setLight(deviceId, executorPersonId, enabled) {
  return await postPlan('deviceControl', 'setLight', {
    deviceId,
    kind: 'esp32',
    executorPersonId,
    enabled,
  });
}

function requireObserved(observation, expectedEnabled, label) {
  if (
    observation?.$type$ !== 'UvcControlObservation'
    || observation.status !== 'observed'
    || typeof observation.enabled !== 'boolean'
    || typeof observation.observedAt !== 'number'
    || typeof observation.command !== 'string'
  ) {
    throw new Error(`${label} did not return correlated observed state: ${JSON.stringify(observation)}`);
  }
  if (expectedEnabled !== undefined && observation.enabled !== expectedEnabled) {
    throw new Error(`${label} expected enabled=${expectedEnabled}, observed ${observation.enabled}`);
  }
  return observation;
}

function requireJournalEvidence(entries, deviceId, since) {
  if (!Array.isArray(entries)) throw new Error('Journal did not return an entry list');
  const current = entries.filter(entry => (
    entry?.$type$ === 'UvcJournalEvent'
    && entry.deviceId === deviceId
    && entry.recordedAt >= since
  ));
  const setEvents = current.filter(entry => entry.eventType === 'device-set' && entry.command);
  const observedEvents = current.filter(entry => (
    entry.eventType === 'device-observed'
    && entry.command
    && entry.observation
  ));
  if (setEvents.length < 2 || observedEvents.length < 4) {
    throw new Error(
      `Journal evidence incomplete: device-set=${setEvents.length}/2, device-observed=${observedEvents.length}/4`,
    );
  }
  const observedCommands = new Set(observedEvents.map(entry => entry.command));
  if (setEvents.some(entry => !observedCommands.has(entry.command))) {
    throw new Error('Journal is missing correlated observations for an LED write command');
  }
}

function requireVisibleJournalRecords(records, deviceId, since) {
  if (!Array.isArray(records)) throw new Error('Visible Journal projection did not return a record list');
  const switches = records.filter(record => (
    record?.kind === 'device-control'
    && record.location === deviceId
    && record.timestamp >= since
    && record.status === 'completed'
    && record.operation === 'set'
  ));
  if (!switches.some(record => record.desiredEnabled === true && record.observedEnabled === true)) {
    throw new Error('Visible Journal projection is missing the observed LED ON command');
  }
  if (!switches.some(record => record.desiredEnabled === false && record.observedEnabled === false)) {
    throw new Error('Visible Journal projection is missing the observed LED OFF command');
  }
}

function requireIdHash(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/iu.test(value)) {
    throw new Error(`${label} is not a 64-character ONE id hash`);
  }
}
