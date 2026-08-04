import {OperationRegistry} from '@refinio/api/registry';
import {getChumSyncDiagnostics} from '@refinio/one.core/lib/chum-sync.js';
import {SettingsPlan, registerSettingsPlan} from '@refinio/settings.core';

import {cubeOneRuntime} from '../services/cube-one-runtime.js';
import {createUvcTestRunnerOperation} from '../services/test-runner-dashboard.js';
import {getCubeSettingsService} from '../services/cube-settings.js';
import {
  getDiscoveryRuntimeSnapshot,
  pushDiscoverySettings,
  refreshDiscoveryRuntime,
  setDiscoveryDeviceTrust,
} from '../services/peer-directory.js';

const registry = new OperationRegistry();
let registered = false;

export function registerUvcPlans(): OperationRegistry {
  if (registered) {
    return registry;
  }
  registerSettingsPlan(registry, new SettingsPlan(getCubeSettingsService()));
  registry.register('cubeIdentity', {
    get: async () => cubeOneRuntime.getIdentity(),
  }, {category: 'identity'});
  registry.register('phoneBook', {
    list: async () => cubeOneRuntime.phoneBookEntries(),
  }, {category: 'discovery'});
  registry.register('pairing', {
    createInvitation: async () => cubeOneRuntime.createInvitation(),
    connectUsingInvitation: async (invitation: {token: string; publicKey: string; url: string}) => (
      cubeOneRuntime.connectUsingInvitation(invitation as never)
    ),
  }, {category: 'connection'});
  registry.register('headlessProvisioning', {
    provision: async (input: {
      deviceId: string;
      assignedInstanceName: string;
    }) => cubeOneRuntime.provisionHeadlessDevice(input),
    createAssignment: async (input: {
      hardwareDeviceId: string;
      deviceKind: 'groov' | 'esp32';
      assignedEmail: string;
      assignedInstanceName: string;
    }) => cubeOneRuntime.createHeadlessIdentityAssignment(input),
    certifyIdentity: async (input: Parameters<typeof cubeOneRuntime.certifyHeadlessIdentity>[0]) => (
      cubeOneRuntime.certifyHeadlessIdentity(input)
    ),
    acceptAdminGrant: async (input: Parameters<typeof cubeOneRuntime.acceptHeadlessAdminGrant>[0]) => (
      cubeOneRuntime.acceptHeadlessAdminGrant(input)
    ),
  }, {category: 'identity'});
  registry.register('deviceControl', {
    readLight: async (input: {
      deviceId: string;
      kind: 'groov' | 'esp32';
      executorPersonId?: string;
    }) => cubeOneRuntime.readLight(input as never),
    setLight: async (input: {
      deviceId: string;
      kind: 'groov' | 'esp32';
      executorPersonId?: string;
      enabled: boolean;
      intensity?: number;
    }) => cubeOneRuntime.setLight(input as never),
  }, {category: 'device-control'});
  registry.register('journal', {
    listDeviceEvents: async (input?: {deviceId?: string}) => (
      cubeOneRuntime.journalEntries(input?.deviceId)
    ),
    listDisinfectionRuns: async () => cubeOneRuntime.disinfectionRecords(),
  }, {category: 'journal'});
  registry.register('chumDiagnostics', {
    get: async (input?: {traceLimit?: number}) => getChumSyncDiagnostics({
      traceLimit: input?.traceLimit,
    }),
  }, {category: 'diagnostics'});
  registry.register('discovery', {
    getRuntime: async () => getDiscoveryRuntimeSnapshot(),
    refreshRuntime: async () => refreshDiscoveryRuntime(),
    setDeviceTrust: async (params: {deviceId: string; trusted: boolean}) => (
      setDiscoveryDeviceTrust(params.deviceId, params.trusted)
    ),
    pushSettings: async () => pushDiscoverySettings(),
  }, {category: 'discovery'});
  registry.register('uvc-test-runner', createUvcTestRunnerOperation(), {
    category: 'integration',
    description: 'Cube-owned UVC full-protocol integration orchestration',
    version: '1.0.0',
  });
  registered = true;
  return registry;
}

export function listUvcPlans(): string[] {
  return registerUvcPlans().listOperations();
}

export async function invokeUvcPlan(
  operation: string,
  method: string,
  params?: unknown,
): Promise<unknown> {
  const result = await registerUvcPlans().execute(operation, method, params);
  return result.product;
}
