import {app} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

import type {UvcControlObservation, UvcStateEntry} from '@refinio/uvc.core';

import type {DiscoveryDeviceSnapshot, DiscoveryRuntimeSnapshot} from '@shared/contracts';
import {cubeOneRuntime, type CubeControlEvidence} from './cube-one-runtime.js';
import {getDiscoveryRuntimeSnapshot, refreshDiscoveryRuntime} from './peer-directory.js';

type HeadlessKind = 'groov' | 'esp32';
type RunnerStatus = 'idle' | 'running' | 'success' | 'error' | 'stopped';

interface RunnerStep {
  number: string;
  title: string;
}

interface StepProfile {
  number: number;
  total: number;
  title: string;
  status: 'PASS' | 'FAIL';
  durationMs: number;
}

interface RunnerSnapshot {
  status: RunnerStatus;
  message: string;
  currentStep: RunnerStep | null;
  logs: string[];
  startedAt?: string;
  finishedAt?: string;
  reportPath?: string;
  pendingAction?: RunnerPendingAction;
}

interface ExpoPairingAction {
  type: 'pair-expo';
  peerId: string;
  invitation: {
    token: string;
    publicKey: string;
    url: string;
  };
}

interface ExpoControlAction {
  type: 'expo-control';
  peerId: string;
  action: {
    actionId: string;
    operation: 'esp32-led-cycle';
    deviceId: string;
    executorPersonId: string;
  };
}

type RunnerPendingAction = ExpoPairingAction | ExpoControlAction;

export interface UvcFullProtocolOptions {
  timeoutMs?: number;
  expectedKinds?: string[];
  provisionHeadless?: boolean;
  exerciseWrites?: HeadlessKind[];
  expectUncommissioned?: HeadlessKind[];
}

interface NormalizedOptions {
  timeoutMs: number;
  expectedKinds: string[];
  provisionHeadless: boolean;
  exerciseWrites: HeadlessKind[];
  expectUncommissioned: HeadlessKind[];
}

const HEX = /^[0-9a-f]+$/iu;
const ID_HASH = /^[0-9a-f]{64}$/iu;
const MAX_LOG_LINES = 500;
const DEFAULT_EXPECTED_KINDS = ['expo', 'groov', 'esp32'];

class UvcTestRunnerDashboardService {
  private state: RunnerSnapshot = {
    status: 'idle',
    message: 'Ready',
    currentStep: null,
    logs: [],
  };
  private activeRun: Promise<void> | null = null;
  private stopRequested = false;
  private stepProfiles: StepProfile[] = [];
  private reportContent?: string;
  private expoPlanExecuted = false;

  async getStatus() {
    return {success: true, data: this.snapshot()};
  }

  async runFullProtocol(input?: UvcFullProtocolOptions) {
    if (this.activeRun) {
      return {success: false, error: 'A UVC integration run is already active', data: this.snapshot()};
    }

    const options = normalizeOptions(input);
    this.stopRequested = false;
    this.stepProfiles = [];
    this.reportContent = undefined;
    this.expoPlanExecuted = false;
    this.state = {
      status: 'running',
      message: 'UVC full protocol is running',
      currentStep: null,
      logs: [],
      startedAt: new Date().toISOString(),
    };

    this.activeRun = this.execute(options)
      .then(async () => {
        this.state.status = 'success';
        this.state.message = 'UVC full protocol passed';
        await this.writeReport('PASS');
      })
      .catch(async error => {
        if (this.stopRequested) {
          this.state.status = 'stopped';
          this.state.message = 'UVC full protocol stopped';
          this.appendLog('[runner] Stop requested');
        } else {
          this.state.status = 'error';
          this.state.message = error instanceof Error ? error.message : String(error);
          this.appendLog(`[runner] FAIL ${this.state.message}`);
        }
        await this.writeReport('FAIL');
      })
      .finally(() => {
        this.state.finishedAt = new Date().toISOString();
        this.state.currentStep = null;
        this.activeRun = null;
        this.stopRequested = false;
      });

    return {success: true, data: this.snapshot()};
  }

  async stop() {
    this.stopRequested = true;
    return {success: true, data: this.snapshot()};
  }

  async getProtocolReport() {
    if (!this.reportContent || !this.state.reportPath) {
      return {success: false, error: 'No UVC integration report is available'};
    }
    return {
      success: true,
      data: {
        path: this.state.reportPath,
        filename: path.basename(this.state.reportPath),
        content: this.reportContent,
      },
    };
  }

  private async execute(options: NormalizedOptions): Promise<void> {
    // expectedKinds controls physical discovery coverage. An explicit write
    // selection controls the executor path as well, so an ESP-only hardware
    // test does not implicitly require unrelated Groov I/O credentials.
    const explicitlySelectedControlKinds = [
      ...options.exerciseWrites,
      ...options.expectUncommissioned,
    ];
    const controlKinds = [...new Set(
      explicitlySelectedControlKinds.length > 0
        ? explicitlySelectedControlKinds
        : options.expectedKinds.filter(isHeadlessKind) as HeadlessKind[],
    )];
    const runStartedAt = Date.parse(this.state.startedAt ?? new Date().toISOString());
    let runtime: DiscoveryRuntimeSnapshot;
    let devices: DiscoveryDeviceSnapshot[] = [];
    const observations = new Map<HeadlessKind, UvcControlObservation>();
    const expoControlEvidence = new Map<HeadlessKind, CubeControlEvidence[]>();
    const totalSteps = 9;

    await this.step(1, totalSteps, 'Verify Cube identity and runtime', async () => {
      const identity = cubeOneRuntime.getIdentity();
      requireIdHash(identity.personId, 'Cube Person id');
      requireIdHash(identity.instanceId, 'Cube Instance id');
      requireHex(identity.publicKey, 'Cube encryption key');
      if (!identity.publicSignKey.trim()) throw new Error('Cube signing key is empty');
      this.appendLog(`  PASS Cube Person ${shortHash(identity.personId)} Instance ${shortHash(identity.instanceId)}`);
    });

    await this.step(2, totalSteps, 'Wait for physical peer discovery', async () => {
      await refreshDiscoveryRuntime();
      try {
        runtime = await waitFor(async () => {
          const snapshot = await getDiscoveryRuntimeSnapshot();
          const seen = new Set(snapshot.devices.map(device => normalizedKind(device.type)));
          return options.expectedKinds.every(kind => seen.has(kind)) ? snapshot : undefined;
        }, options.timeoutMs, () => this.throwIfStopped(), `physical peers: ${options.expectedKinds.join(', ')}`);
      } catch (error) {
        if (this.stopRequested) throw error;
        const snapshot = await getDiscoveryRuntimeSnapshot();
        const observed = [...new Set(snapshot.devices.map(device => normalizedKind(device.type)).filter(Boolean))];
        const missing = options.expectedKinds.filter(kind => !observed.includes(kind));
        throw new Error(
          `Missing physical peer kinds after ${options.timeoutMs}ms: ${missing.join(', ') || 'none'}; `
          + `observed: ${observed.join(', ') || 'none'}`,
        );
      }
      devices = selectExpectedDevices(runtime!, options.expectedKinds);
      this.appendLog(`  PASS discovered ${devices.map(device => `${normalizedKind(device.type)}:${device.name ?? device.id}`).join(', ')}`);
    });

    await this.step(3, totalSteps, 'Validate advertisement identity contracts', async () => {
      for (const device of devices) validateAdvertisement(device);
      this.appendLog('  PASS live advertisements are identity-bound or valid bootstrap records');
    });

    await this.step(4, totalSteps, 'Verify persisted Cube phone-book projection', async () => {
      const expectedIds = new Set(devices.map(device => device.id));
      await waitFor(async () => {
        const entries = await cubeOneRuntime.phoneBookEntries();
        const recorded = new Set(entries.map(entry => entry.deviceId));
        return [...expectedIds].every(id => recorded.has(id)) ? entries : undefined;
      }, Math.min(options.timeoutMs, 30_000), () => this.throwIfStopped(), 'Cube phone-book observations');
      this.appendLog(`  PASS phone-book contains live observations for ${expectedIds.size} peers`);
    });

    await this.step(5, totalSteps, 'Complete requested headless provisioning', async () => {
      const bootstrap = devices.filter(device => isHeadlessKind(device.type) && !device.ownerId);
      if (bootstrap.length > 0 && !options.provisionHeadless) {
        throw new Error(
          `Headless peers remain in bootstrap state: ${bootstrap.map(device => device.name ?? device.id).join(', ')}; `
          + 'rerun with --provision-headless to exercise the signed ceremony',
        );
      }
      for (const device of bootstrap) {
        const kind = normalizedKind(device.type) as HeadlessKind;
        this.appendLog(`  INFO provisioning ${kind}:${device.id}`);
        await cubeOneRuntime.provisionHeadlessDevice({
          deviceId: device.id,
          assignedInstanceName: `uvc-e2e-${kind}`,
        });
      }
      if (bootstrap.length > 0) {
        runtime = await waitFor(async () => {
          const snapshot = await getDiscoveryRuntimeSnapshot();
          const assignedKinds = new Set(snapshot.devices.filter(device => device.ownerId).map(device => normalizedKind(device.type)));
          return controlKinds.every(kind => assignedKinds.has(kind)) ? snapshot : undefined;
        }, options.timeoutMs, () => this.throwIfStopped(), 'headless identity-bound advertisements');
        devices = selectExpectedDevices(runtime!, options.expectedKinds);
      }
      this.appendLog(`  PASS ${bootstrap.length > 0 ? `${bootstrap.length} headless peers provisioned` : 'no bootstrap peers require provisioning'}`);
    });

    await this.step(6, totalSteps, 'Verify ONE pairing for identity-bound peers', async () => {
      let unpaired = devices.filter(device => !device.ownerId || !cubeOneRuntime.isPaired(device.ownerId));
      const unpairedExpo = unpaired.filter(device => normalizedKind(device.type) === 'expo' && device.ownerId);
      const unsupported = unpaired.filter(device => normalizedKind(device.type) !== 'expo' || !device.ownerId);
      if (unsupported.length > 0) {
        throw new Error(`Peers are not paired with Cube: ${unsupported.map(device => `${normalizedKind(device.type)}:${device.name ?? device.id}`).join(', ')}`);
      }
      if (unpairedExpo.length > 1) {
        throw new Error(`Expected at most one unpaired Expo peer, found ${unpairedExpo.length}`);
      }
      if (unpairedExpo.length === 1) {
        const expo = unpairedExpo[0];
        const invitation = await cubeOneRuntime.createInvitation();
        this.state.pendingAction = {
          type: 'pair-expo',
          peerId: expo.id,
          invitation: {
            token: invitation.token,
            publicKey: invitation.publicKey,
            url: invitation.url,
          },
        };
        this.appendLog(`  INFO waiting for the physical Expo peer ${expo.name ?? expo.id} to accept Cube's invitation`);
        try {
          await waitFor(async () => (
            cubeOneRuntime.isPaired(expo.ownerId!) ? true : undefined
          ), options.timeoutMs, () => this.throwIfStopped(), 'physical Expo invitation acceptance');
        } finally {
          this.state.pendingAction = undefined;
        }
        unpaired = devices.filter(device => !device.ownerId || !cubeOneRuntime.isPaired(device.ownerId));
      }
      if (unpaired.length > 0) {
        throw new Error(`Peers are not paired with Cube: ${unpaired.map(device => `${normalizedKind(device.type)}:${device.name ?? device.id}`).join(', ')}`);
      }
      this.appendLog(`  PASS ${devices.length} peer identities are paired with Cube`);
    });

    await this.step(7, totalSteps, 'Read headless device state through UvcControlPlan', async () => {
      for (const kind of controlKinds) {
        const device = requireAssignedDevice(devices, kind);
        const observation = await cubeOneRuntime.readLight({
          deviceId: device.id,
          kind,
          executorPersonId: device.ownerId as never,
        });
        if (options.expectUncommissioned.includes(kind)) {
          requireUncommissioned(observation, `${kind} read`);
          this.appendLog(`  PASS ${kind} executor returned correlated fail-closed observation: ${observation.error}`);
        } else {
          requireObserved(observation, `${kind} read`);
          observations.set(kind, observation);
          this.appendLog(`  PASS ${kind} observed enabled=${String(observation.enabled)}${observation.intensity === undefined ? '' : ` intensity=${observation.intensity}`}`);
        }
      }
    });

    await this.step(8, totalSteps, 'Exercise explicitly enabled hardware writes', async () => {
      for (const kind of options.exerciseWrites) {
        const device = requireAssignedDevice(devices, kind);
        const baseline = observations.get(kind);
        if (!baseline || typeof baseline.enabled !== 'boolean') {
          throw new Error(`${kind} has no observed baseline for a safe write and restore`);
        }
        if (kind === 'esp32') {
          const expo = devices.find(candidate => normalizedKind(candidate.type) === 'expo' && candidate.ownerId);
          if (!expo?.ownerId) {
            throw new Error('Physical Expo peer is required for the ESP32 LED integration exercise');
          }
          const expoOwnerId = expo.ownerId;
          // UDP discovery only proves that the development client is visible.
          // A Metro-restarted Expo runtime is ready to originate durable
          // control commands only after its initial trie write has crossed the
          // paired CHUM lane and Cube has projected that observation. Use that
          // protocol evidence as the control-action readiness boundary.
          await waitFor(async () => {
            return cubeOneRuntime.lastImportedDiscoveryAt(expoOwnerId) === undefined
              ? undefined
              : true;
          }, options.timeoutMs, () => this.throwIfStopped(), 'Expo CHUM/trie readiness');
          this.appendLog('  PASS Expo initial trie state reached Cube through paired CHUM');
          const cubeIdentity = cubeOneRuntime.getIdentity();
          const actionStartedAt = Date.now();
          const actionId = randomUUID();
          this.state.pendingAction = {
            type: 'expo-control',
            peerId: expo.id,
            action: {
              actionId,
              operation: 'esp32-led-cycle',
              deviceId: device.id,
              executorPersonId: cubeIdentity.personId,
            },
          };
          this.appendLog(`  INFO waiting for physical Expo peer ${expo.name ?? expo.id} to originate the ESP32 LED cycle`);
          let evidence: CubeControlEvidence[];
          try {
            evidence = await waitFor(async () => {
              const observed = await cubeOneRuntime.controlEvidence({
                deviceId: device.id,
                issuerPersonId: expoOwnerId as never,
                since: actionStartedAt,
              });
              const matching = observed.filter(item => item.command.executorPersonId === cubeIdentity.personId);
              return matching.length >= 5 ? matching : undefined;
            }, options.timeoutMs, () => this.throwIfStopped(), 'Expo-originated ESP32 LED cycle');
          } finally {
            this.state.pendingAction = undefined;
          }
          const cycle = requireExpoLedCycleEvidence(evidence, baseline.enabled);
          expoControlEvidence.set(kind, cycle);
          this.expoPlanExecuted = true;
          this.appendLog('  PASS Expo issued read, LED ON, LED OFF, baseline restore, and final read through paired CHUM');
          this.appendLog(`  PASS ESP32 producer readback restored enabled=${String(baseline.enabled)}`);
          continue;
        }
        const observation = await cubeOneRuntime.setLight({
          deviceId: device.id,
          kind,
          executorPersonId: device.ownerId as never,
          enabled: baseline.enabled,
          ...(baseline.intensity === undefined ? {} : {intensity: baseline.intensity}),
        });
        requireObserved(observation, `${kind} write`);
        if (observation.enabled !== baseline.enabled || observation.intensity !== baseline.intensity) {
          throw new Error(`${kind} same-state write readback does not match its baseline`);
        }
        this.appendLog(`  PASS ${kind} same-state write returned correlated readback`);
      }
      if (options.exerciseWrites.length === 0) this.appendLog('  PASS live writes disabled by safety policy');
    });

    await this.step(9, totalSteps, 'Verify command and observation journal evidence', async () => {
      for (const kind of controlKinds) {
        const device = requireAssignedDevice(devices, kind);
        const entries = await cubeOneRuntime.journalEntries(device.id);
        requireJournalEvent(entries, device.id, 'device-read', runStartedAt);
        requireJournalEvent(
          entries,
          device.id,
          options.expectUncommissioned.includes(kind) ? 'device-failed' : 'device-observed',
          runStartedAt,
        );
        if (options.exerciseWrites.includes(kind)) {
          if (kind === 'esp32' && expoControlEvidence.has(kind)) {
            if (expoControlEvidence.get(kind)!.length !== 5) {
              throw new Error('Expo LED cycle is missing correlated command/observation evidence');
            }
          } else {
            requireJournalEventCount(entries, device.id, 'device-set', 1, runStartedAt);
          }
        }
        this.appendLog(`  PASS ${kind} journal contains command and observed evidence`);
      }
      this.appendLog(this.expoPlanExecuted
        ? '  PASS Expo DeviceControlModel originated the physical ESP32 control sequence'
        : '  INFO Expo coverage was discovery and pairing because no ESP32 write exercise was requested');
    });
  }

  private async step(number: number, total: number, title: string, task: () => Promise<void>): Promise<void> {
    this.throwIfStopped();
    this.state.currentStep = {number: `${number}/${total}`, title};
    this.state.message = `Step ${number}/${total}: ${title}`;
    this.appendLog(`Step ${number}/${total} ${title}`);
    const started = Date.now();
    try {
      await task();
      this.stepProfiles.push({number, total, title, status: 'PASS', durationMs: Date.now() - started});
    } catch (error) {
      this.stepProfiles.push({number, total, title, status: 'FAIL', durationMs: Date.now() - started});
      throw error;
    }
  }

  private throwIfStopped(): void {
    if (this.stopRequested) throw new Error('UVC integration run stopped');
  }

  private appendLog(line: string): void {
    this.state.logs = [...this.state.logs, line].slice(-MAX_LOG_LINES);
  }

  private snapshot(): RunnerSnapshot {
    const pendingAction = this.state.pendingAction?.type === 'pair-expo'
      ? {
          ...this.state.pendingAction,
          invitation: {...this.state.pendingAction.invitation},
        }
      : this.state.pendingAction?.type === 'expo-control'
        ? {
            ...this.state.pendingAction,
            action: {...this.state.pendingAction.action},
          }
        : undefined;
    return {
      ...this.state,
      currentStep: this.state.currentStep ? {...this.state.currentStep} : null,
      logs: [...this.state.logs],
      ...(pendingAction ? {pendingAction} : {}),
    };
  }

  private async writeReport(result: 'PASS' | 'FAIL'): Promise<void> {
    const startedAt = this.state.startedAt ?? new Date().toISOString();
    const finishedAt = new Date().toISOString();
    const passed = this.stepProfiles.filter(step => step.status === 'PASS').length;
    const failed = this.stepProfiles.filter(step => step.status === 'FAIL').length;
    const reportsDir = path.join(app.getAppPath(), 'tests', 'integration', 'reports');
    const reportPath = path.join(reportsDir, `full-protocol-${slugTimestamp(startedAt)}.md`);
    const content = [
      '# UVC Integration Protocol Report',
      '',
      `| **Result** | **${result}** - ${passed} passed, ${failed} failed |`,
      `| **Duration** | ${Math.max(0, Math.round((Date.parse(finishedAt) - Date.parse(startedAt)) / 1000))}s |`,
      '',
      `- Started: ${startedAt}`,
      `- Finished: ${finishedAt}`,
      '- Owner: running uvc.cube process',
      '- State source: Cube runtime operations and persisted UVC trie projections',
      this.expoPlanExecuted
        ? '- Expo coverage: physical DeviceControlModel plan execution over paired CHUM with ESP32 readback'
        : '- Expo coverage: discovery and pairing; no Expo control exercise was requested',
      '',
      '## Step Profile',
      '',
      '| Step | Status | Duration | Title |',
      '| --- | --- | ---: | --- |',
      ...this.stepProfiles.map(step => `| ${step.number}/${step.total} | ${step.status} | ${formatDuration(step.durationMs)} | ${step.title} |`),
      '',
      '## Live Log',
      '',
      '```text',
      ...this.state.logs,
      '```',
      '',
    ].join('\n');
    await fs.mkdir(reportsDir, {recursive: true});
    await fs.writeFile(reportPath, content, 'utf8');
    this.reportContent = content;
    this.state.reportPath = reportPath;
    this.appendLog(`[runner] Report written to ${reportPath}`);
  }
}

function normalizeOptions(input?: UvcFullProtocolOptions): NormalizedOptions {
  const timeoutMs = input?.timeoutMs ?? 120_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 240_000) {
    throw new Error('timeoutMs must be an integer between 1000 and 240000');
  }
  const expectedKinds = input?.expectedKinds ?? DEFAULT_EXPECTED_KINDS;
  if (!Array.isArray(expectedKinds) || expectedKinds.length === 0) throw new Error('expectedKinds must not be empty');
  const normalizedKinds = [...new Set(expectedKinds.map(kind => normalizedKind(kind)).filter(Boolean))];
  if (normalizedKinds.length !== expectedKinds.length) throw new Error('expectedKinds contains blank or duplicate kinds');
  for (const kind of normalizedKinds) {
    if (!['expo', 'groov', 'esp32'].includes(kind)) throw new Error(`Unsupported integration peer kind: ${kind}`);
  }
  const exerciseWrites = input?.exerciseWrites ?? [];
  if (!Array.isArray(exerciseWrites) || exerciseWrites.some(kind => !isHeadlessKind(kind))) {
    throw new Error('exerciseWrites may contain only groov and esp32');
  }
  const expectUncommissioned = input?.expectUncommissioned ?? [];
  if (!Array.isArray(expectUncommissioned) || expectUncommissioned.some(kind => !isHeadlessKind(kind))) {
    throw new Error('expectUncommissioned may contain only groov and esp32');
  }
  if (exerciseWrites.some(kind => expectUncommissioned.includes(kind))) {
    throw new Error('An uncommissioned device cannot be selected for live writes');
  }
  return {
    timeoutMs,
    expectedKinds: normalizedKinds,
    provisionHeadless: input?.provisionHeadless === true,
    exerciseWrites: [...new Set(exerciseWrites)],
    expectUncommissioned: [...new Set(expectUncommissioned)],
  };
}

function selectExpectedDevices(runtime: DiscoveryRuntimeSnapshot, expectedKinds: string[]): DiscoveryDeviceSnapshot[] {
  return expectedKinds.map(kind => {
    const matches = runtime.devices.filter(device => normalizedKind(device.type) === kind && device.online !== false);
    if (matches.length !== 1) throw new Error(`Expected exactly one live ${kind} peer, found ${matches.length}`);
    return matches[0];
  });
}

function validateAdvertisement(device: DiscoveryDeviceSnapshot): void {
  const kind = normalizedKind(device.type);
  if (!device.address || !device.port) throw new Error(`${kind}:${device.id} has no routable endpoint`);
  requireHex(device.publicKey, `${kind}:${device.id} public key`);
  if (!device.ownerId) {
    if (!isHeadlessKind(kind) || device.trustState !== 'unprovisioned') {
      throw new Error(`${kind}:${device.id} claims no Person identity outside bootstrap state`);
    }
    return;
  }
  requireIdHash(device.instanceId ?? device.id, `${kind} Instance id`);
  requireIdHash(device.ownerId, `${kind} Person id`);
}

function requireAssignedDevice(devices: DiscoveryDeviceSnapshot[], kind: HeadlessKind): DiscoveryDeviceSnapshot {
  const device = devices.find(candidate => normalizedKind(candidate.type) === kind);
  if (!device || !device.ownerId) throw new Error(`No assigned ${kind} device is available`);
  return device;
}

function requireObserved(observation: UvcControlObservation, label: string): void {
  if (observation.status !== 'observed' || typeof observation.enabled !== 'boolean') {
    throw new Error(`${label} did not return observed hardware state: ${observation.error ?? observation.status}`);
  }
}

function requireObservedState(
  observation: UvcControlObservation,
  enabled: boolean,
  label: string,
): void {
  requireObserved(observation, label);
  if (observation.enabled !== enabled) {
    throw new Error(`${label} readback expected enabled=${String(enabled)}, observed ${String(observation.enabled)}`);
  }
}

function requireExpoLedCycleEvidence(
  evidence: CubeControlEvidence[],
  baselineEnabled: boolean,
): CubeControlEvidence[] {
  for (let index = 0; index <= evidence.length - 5; index += 1) {
    const cycle = evidence.slice(index, index + 5);
    const [baseline, enabled, disabled, restored, finalRead] = cycle;
    if (
      baseline.command.operation !== 'read'
      || enabled.command.operation !== 'set'
      || enabled.command.desiredEnabled !== true
      || disabled.command.operation !== 'set'
      || disabled.command.desiredEnabled !== false
      || restored.command.operation !== 'set'
      || restored.command.desiredEnabled !== baselineEnabled
      || finalRead.command.operation !== 'read'
    ) {
      continue;
    }
    requireObservedState(baseline.observation, baselineEnabled, 'Expo ESP32 baseline read');
    requireObservedState(enabled.observation, true, 'Expo ESP32 LED ON');
    requireObservedState(disabled.observation, false, 'Expo ESP32 LED OFF');
    requireObservedState(restored.observation, baselineEnabled, 'Expo ESP32 baseline restore');
    requireObservedState(finalRead.observation, baselineEnabled, 'Expo ESP32 final read');
    return cycle;
  }
  throw new Error('No complete Expo-originated ESP32 LED cycle was found in correlated evidence');
}

function requireUncommissioned(observation: UvcControlObservation, label: string): void {
  if (
    observation.status !== 'failed'
    || !observation.error?.endsWith('Groov Manage authority is not commissioned')
  ) {
    throw new Error(`${label} did not return the expected uncommissioned authority observation: ${observation.error ?? observation.status}`);
  }
}

function requireJournalEvent(
  entries: UvcStateEntry[],
  deviceId: string,
  eventType: string,
  since: number,
): void {
  const found = entries.some(entry => entry.$type$ === 'UvcJournalEvent'
    && entry.deviceId === deviceId
    && entry.eventType === eventType
    && entry.recordedAt >= since);
  if (!found) throw new Error(`Journal is missing ${eventType} evidence for ${deviceId}`);
}

function requireJournalEventCount(
  entries: UvcStateEntry[],
  deviceId: string,
  eventType: string,
  minimum: number,
  since: number,
): void {
  const count = entries.filter(entry => entry.$type$ === 'UvcJournalEvent'
    && entry.deviceId === deviceId
    && entry.eventType === eventType
    && entry.recordedAt >= since).length;
  if (count < minimum) {
    throw new Error(`Journal has ${count}/${minimum} required ${eventType} events for ${deviceId}`);
  }
}

function requireIdHash(value: string | undefined, label: string): void {
  if (!value || !ID_HASH.test(value)) throw new Error(`${label} is not a 64-character ONE id hash`);
}

function requireHex(value: string | undefined, label: string): void {
  if (!value || value.length % 2 !== 0 || !HEX.test(value)) throw new Error(`${label} is not non-empty even-length hex`);
}

function normalizedKind(value?: string): string {
  return value?.trim().toLowerCase() ?? '';
}

function isHeadlessKind(value?: string): value is HeadlessKind {
  const kind = normalizedKind(value);
  return kind === 'groov' || kind === 'esp32';
}

async function waitFor<T>(
  read: () => Promise<T | undefined>,
  timeoutMs: number,
  beforeRead: () => void,
  description: string,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    beforeRead();
    const result = await read();
    if (result !== undefined) return result;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${description}`);
}

function shortHash(value: string): string {
  return `${value.slice(0, 8)}…`;
}

function slugTimestamp(value: string): string {
  return value.replace(/[:.]/gu, '-');
}

function formatDuration(durationMs: number): string {
  return durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(2)}s`;
}

export const uvcTestRunnerDashboardService = new UvcTestRunnerDashboardService();

export function createUvcTestRunnerOperation() {
  return {
    getStatus: async () => await uvcTestRunnerDashboardService.getStatus(),
    runFullProtocol: async (input?: UvcFullProtocolOptions) => (
      await uvcTestRunnerDashboardService.runFullProtocol(input)
    ),
    stop: async () => await uvcTestRunnerDashboardService.stop(),
    getProtocolReport: async () => await uvcTestRunnerDashboardService.getProtocolReport(),
  };
}
