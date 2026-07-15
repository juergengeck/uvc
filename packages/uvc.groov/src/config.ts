import { readFile } from 'node:fs/promises';

import {
  GroovManageLightController,
  type GroovManageLightControllerConfig,
} from './GroovManageLightController.js';
import { GroovAuthorityService } from './GroovAuthorityService.js';
import type {
  GroovAuthorityAuthorizer,
  QuicVCStreamHost,
} from './types.js';

export interface GroovAuthorityEnvironmentConfig {
  authorityId: string;
  controller: GroovManageLightControllerConfig;
  caFile?: string;
}

export interface CreateGroovAuthorityRuntimeOptions {
  quicManager: QuicVCStreamHost;
  authorize: GroovAuthorityAuthorizer;
  env?: NodeJS.ProcessEnv;
}

export function parseGroovAuthorityEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): GroovAuthorityEnvironmentConfig {
  const outputKind = required(env, 'GROOV_OUTPUT_KIND');
  if (outputKind !== 'digital' && outputKind !== 'analog') {
    throw new Error('GROOV_OUTPUT_KIND must be digital or analog');
  }

  const caFile = optional(env, 'GROOV_TLS_CA_FILE');
  const analogMin = optionalNumber(env, 'GROOV_ANALOG_MIN');
  const analogMax = optionalNumber(env, 'GROOV_ANALOG_MAX');
  const analogOffValue = optionalNumber(env, 'GROOV_ANALOG_OFF_VALUE');
  const analogReadbackTolerance = optionalNumber(env, 'GROOV_ANALOG_READBACK_TOLERANCE');
  const requestTimeoutMs = optionalNumber(env, 'GROOV_REQUEST_TIMEOUT_MS');
  return {
    authorityId: required(env, 'GROOV_AUTHORITY_ID'),
    controller: {
      baseUrl: required(env, 'GROOV_MANAGE_BASE_URL'),
      apiKey: required(env, 'GROOV_MANAGE_API_KEY'),
      ioDevice: optional(env, 'GROOV_IO_DEVICE') ?? 'local',
      moduleIndex: requiredNumber(env, 'GROOV_MODULE_INDEX'),
      channelIndex: requiredNumber(env, 'GROOV_CHANNEL_INDEX'),
      outputKind,
      ...(analogMin !== undefined
        ? { analogMin }
        : {}),
      ...(analogMax !== undefined
        ? { analogMax }
        : {}),
      ...(analogOffValue !== undefined
        ? { analogOffValue }
        : {}),
      ...(analogReadbackTolerance !== undefined
        ? { analogReadbackTolerance }
        : {}),
      ...(requestTimeoutMs !== undefined
        ? { requestTimeoutMs }
        : {}),
      rejectUnauthorized: optionalBoolean(env, 'GROOV_TLS_REJECT_UNAUTHORIZED') ?? true,
    },
    ...(caFile ? { caFile } : {}),
  };
}

export async function createGroovAuthorityRuntime(
  options: CreateGroovAuthorityRuntimeOptions,
): Promise<{
  service: GroovAuthorityService;
  controller: GroovManageLightController;
}> {
  const config = parseGroovAuthorityEnvironment(options.env);
  const ca = config.caFile ? await readFile(config.caFile) : undefined;
  const controller = new GroovManageLightController({
    ...config.controller,
    ...(ca !== undefined ? { ca } : {}),
  });
  const service = new GroovAuthorityService(
    options.quicManager,
    controller,
    options.authorize,
    { authorityId: config.authorityId },
  );
  return { service, controller };
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = optional(env, name);
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optional(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function requiredNumber(env: NodeJS.ProcessEnv, name: string): number {
  const value = optionalNumber(env, name);
  if (value === undefined) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optionalNumber(env: NodeJS.ProcessEnv, name: string): number | undefined {
  const raw = optional(env, name);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
  return value;
}

function optionalBoolean(env: NodeJS.ProcessEnv, name: string): boolean | undefined {
  const raw = optional(env, name);
  if (raw === undefined) {
    return undefined;
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  throw new Error(`${name} must be true or false`);
}
