#!/usr/bin/env node

import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const DEFAULT_API_URL = 'http://127.0.0.1:8788';
const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const options = {
    apiUrl: process.env.UVC_E2E_API_URL ?? DEFAULT_API_URL,
    timeoutMs: 5 * 60 * 1000,
    expectedKinds: ['expo', 'groov', 'esp32'],
    provisionHeadless: false,
    exerciseWrites: [],
    expectUncommissioned: [],
    expoDevice: process.env.UVC_EXPO_DEVICE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--') continue;
    if (token === '--api-url') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--api-url requires a URL');
      options.apiUrl = value.replace(/\/$/u, '');
      index += 1;
      continue;
    }
    if (token === '--timeout-ms') {
      const value = Number.parseInt(argv[index + 1] ?? '', 10);
      if (!Number.isInteger(value) || value <= 0) throw new Error('--timeout-ms requires a positive integer');
      options.timeoutMs = value;
      index += 1;
      continue;
    }
    if (token === '--expected-kinds') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--expected-kinds requires a comma-separated list');
      options.expectedKinds = value.split(',').map(kind => kind.trim()).filter(Boolean);
      index += 1;
      continue;
    }
    if (token === '--provision-headless') {
      options.provisionHeadless = true;
      continue;
    }
    if (token === '--expo-device') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--expo-device requires a physical device identifier');
      options.expoDevice = value;
      index += 1;
      continue;
    }
    if (token.startsWith('--exercise-write=')) {
      const kind = token.slice('--exercise-write='.length);
      if (kind !== 'groov' && kind !== 'esp32') throw new Error('--exercise-write must be groov or esp32');
      if (!options.exerciseWrites.includes(kind)) options.exerciseWrites.push(kind);
      continue;
    }
    if (token.startsWith('--expect-uncommissioned=')) {
      const kind = token.slice('--expect-uncommissioned='.length);
      if (kind !== 'groov' && kind !== 'esp32') throw new Error('--expect-uncommissioned must be groov or esp32');
      if (!options.expectUncommissioned.includes(kind)) options.expectUncommissioned.push(kind);
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  return options;
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error(`Invalid JSON from ${url}: ${error instanceof Error ? error.message : String(error)}\n${text}`);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}: ${text}`);
  return data;
}

async function postRunner(apiUrl, method, body, secret, timeoutMs = 20_000) {
  return await fetchJson(`${apiUrl}/api/uvc-test-runner/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-uvc-e2e-secret': secret,
    },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

function unwrap(result) {
  return result?.data ?? result;
}

async function waitForCompletion(options, secret) {
  const deadline = Date.now() + options.timeoutMs + 15_000;
  let latest;
  const deliveredActions = new Set();
  while (Date.now() < deadline) {
    latest = unwrap(await postRunner(options.apiUrl, 'getStatus', {}, secret, 10_000));
    const step = latest?.currentStep ? ` step=${latest.currentStep.number} ${latest.currentStep.title}` : '';
    process.stdout.write(`\r[uvc-full-protocol] status=${latest?.status ?? 'unknown'}${step}    `);
    if (latest?.status === 'success') {
      process.stdout.write('\n');
      return latest;
    }
    if (latest?.status === 'error' || latest?.status === 'stopped') {
      process.stdout.write('\n');
      throw new Error(
        `${latest.status}: ${latest.message ?? 'protocol did not complete'}`
        + `${latest.reportPath ? `; evidence=${latest.reportPath}` : ''}`,
      );
    }
    if (latest?.pendingAction?.type === 'pair-expo') {
      const actionKey = latest.pendingAction.invitation?.token;
      if (!actionKey) throw new Error('Cube returned an invalid Expo pairing action');
      if (!deliveredActions.has(actionKey)) {
        await deliverExpoPairingAction(options, latest.pendingAction);
        deliveredActions.add(actionKey);
      }
    }
    if (latest?.pendingAction?.type === 'expo-control') {
      const actionKey = latest.pendingAction.action?.actionId;
      if (!actionKey) throw new Error('Cube returned an invalid Expo control action');
      if (!deliveredActions.has(actionKey)) {
        await deliverExpoControlAction(options, latest.pendingAction, secret);
        deliveredActions.add(actionKey);
      }
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  process.stdout.write('\n');
  throw new Error(`Client timed out waiting for Cube after ${options.timeoutMs + 15_000}ms`);
}

async function deliverExpoControlAction(options, pendingAction, secret) {
  if (process.platform !== 'darwin') {
    throw new Error('Automatic physical Expo control currently requires macOS devicectl');
  }
  if (!options.expoDevice) {
    throw new Error(
      'Cube requested physical Expo control; provide --expo-device (or UVC_EXPO_DEVICE)',
    );
  }
  const envelope = encodeURIComponent(JSON.stringify({secret, action: pendingAction.action}));
  const payloadUrl = `uvc.one://integration/uvc-control#${envelope}`;
  await execFileAsync('xcrun', [
    'devicectl', 'device', 'process', 'launch',
    '--device', options.expoDevice,
    '--payload-url', payloadUrl,
    '--activate',
    'one.uvc',
  ], {maxBuffer: 1024 * 1024});
  process.stdout.write(`\n[uvc-full-protocol] requested Expo control action ${pendingAction.action.actionId}\n`);
}

async function deliverExpoPairingAction(options, action) {
  if (process.platform !== 'darwin') {
    throw new Error('Automatic physical Expo pairing currently requires macOS devicectl');
  }
  if (!options.expoDevice) {
    throw new Error(
      'Cube requested physical Expo pairing; provide --expo-device (or UVC_EXPO_DEVICE)',
    );
  }
  const fragment = encodeURIComponent(JSON.stringify(action.invitation));
  const payloadUrl = `uvc.one://invites/invitePartner/?invited=true#${fragment}`;
  await execFileAsync('xcrun', [
    'devicectl', 'device', 'process', 'launch',
    '--device', options.expoDevice,
    '--payload-url', payloadUrl,
    '--activate',
    'one.uvc',
  ], {maxBuffer: 1024 * 1024});
  process.stdout.write(`\n[uvc-full-protocol] delivered Cube invitation to physical Expo peer ${action.peerId}\n`);
}

const options = parseArgs(process.argv.slice(2));
const secret = process.env.UVC_E2E_SECRET;
if (!secret) throw new Error('UVC_E2E_SECRET must be set for the client and the running Cube');

const health = await fetchJson(`${options.apiUrl}/health`, {signal: AbortSignal.timeout(3000)});
if (health?.status !== 'ok' || health?.running !== true) {
  throw new Error(`UVC Cube test API is not healthy: ${JSON.stringify(health)}`);
}
if (!Array.isArray(health.operations) || !health.operations.includes('uvc-test-runner')) {
  throw new Error(`UVC Cube does not expose uvc-test-runner: ${JSON.stringify(health.operations ?? [])}`);
}

console.log(`[uvc-full-protocol] Cube API ready at ${options.apiUrl}`);
await postRunner(options.apiUrl, 'runFullProtocol', {
  timeoutMs: Math.min(options.timeoutMs, 240_000),
  expectedKinds: options.expectedKinds,
  provisionHeadless: options.provisionHeadless,
  exerciseWrites: options.exerciseWrites,
  expectUncommissioned: options.expectUncommissioned,
}, secret);

const finalStatus = await waitForCompletion(options, secret);
console.log(`[uvc-full-protocol] PASS: ${finalStatus.reportPath}`);
