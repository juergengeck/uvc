import http from 'node:http';
import https from 'node:https';

import type { LightCommand, LightController, LightState, GroovOutputKind } from './types.js';

export interface GroovManageRequest {
  method: 'GET' | 'PUT';
  url: URL;
  headers: Record<string, string>;
  body?: string;
  tls: {
    rejectUnauthorized: boolean;
    ca?: string | Buffer;
  };
  timeoutMs: number;
}

export interface GroovManageResponse {
  status: number;
  body: unknown;
}

export type GroovManageRequester = (
  request: GroovManageRequest,
) => Promise<GroovManageResponse>;

export interface GroovManageLightControllerConfig {
  baseUrl: string;
  apiKey: string;
  ioDevice: string;
  moduleIndex: number;
  channelIndex: number;
  outputKind: GroovOutputKind;
  analogMin?: number;
  analogMax?: number;
  analogOffValue?: number;
  analogReadbackTolerance?: number;
  requestTimeoutMs?: number;
  rejectUnauthorized?: boolean;
  ca?: string | Buffer;
}

interface NormalizedConfig {
  baseUrl: URL;
  apiKey: string;
  ioDevice: string;
  moduleIndex: number;
  channelIndex: number;
  outputKind: GroovOutputKind;
  analogMin: number;
  analogMax: number;
  analogOffValue: number;
  analogReadbackTolerance: number;
  requestTimeoutMs: number;
  rejectUnauthorized: boolean;
  ca?: string | Buffer;
}

export class GroovManageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroovManageError';
  }
}

export class GroovManageLightController implements LightController {
  private readonly config: NormalizedConfig;

  constructor(
    config: GroovManageLightControllerConfig,
    private readonly requester: GroovManageRequester = nodeGroovManageRequester,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.config = normalizeConfig(config);
  }

  async readState(): Promise<LightState> {
    const kind = this.config.outputKind;
    const response = await this.request('GET', `${this.channelPath()}/${kind}/status`);
    const body = requireRecord(response.body, `${kind} status response`);
    if (body.qualityError === true) {
      throw new GroovManageError(`groov ${kind} channel reports a quality error`);
    }

    if (kind === 'digital') {
      if (typeof body.state !== 'boolean') {
        throw new GroovManageError('groov digital status response is missing boolean state');
      }
      return this.createState(body.state, body.state, body.state ? 1 : 0);
    }

    if (typeof body.value !== 'number' || !Number.isFinite(body.value)) {
      throw new GroovManageError('groov analog status response is missing finite numeric value');
    }
    const value = body.value;
    const tolerance = this.config.analogReadbackTolerance;
    if (value < this.config.analogMin - tolerance || value > this.config.analogMax + tolerance) {
      throw new GroovManageError(
        `Observed analog value ${value} is outside configured range ${this.config.analogMin}..${this.config.analogMax}`,
      );
    }
    const intensity = (value - this.config.analogMin)
      / (this.config.analogMax - this.config.analogMin);
    const enabled = Math.abs(value - this.config.analogOffValue) > tolerance;
    return this.createState(value, enabled, intensity);
  }

  async setLight(command: LightCommand): Promise<LightState> {
    validateCommand(command);
    if (this.config.outputKind === 'digital') {
      await this.request('PUT', `${this.channelPath()}/digital/state`, { value: command.enabled });
      const observed = await this.readState();
      if (observed.rawValue !== command.enabled) {
        throw new GroovManageError(
          `Digital readback mismatch: commanded ${command.enabled}, observed ${String(observed.rawValue)}`,
        );
      }
      return observed;
    }

    if (command.enabled && command.intensity === undefined) {
      throw new GroovManageError('intensity is required when enabling an analog output');
    }
    const targetValue = command.enabled
      ? this.config.analogMin
        + (this.config.analogMax - this.config.analogMin) * (command.intensity as number)
      : this.config.analogOffValue;
    await this.request('PUT', `${this.channelPath()}/analog/value`, { value: targetValue });
    const observed = await this.readState();
    if (
      typeof observed.rawValue !== 'number'
      || Math.abs(observed.rawValue - targetValue) > this.config.analogReadbackTolerance
    ) {
      throw new GroovManageError(
        `Analog readback mismatch: commanded ${targetValue}, observed ${String(observed.rawValue)}`,
      );
    }
    return observed;
  }

  async emergencyOff(): Promise<LightState> {
    return this.setLight({ enabled: false });
  }

  private channelPath(): string {
    const device = encodeURIComponent(this.config.ioDevice);
    return `/manage/api/v1/io/${device}/modules/${this.config.moduleIndex}/channels/${this.config.channelIndex}`;
  }

  private async request(
    method: 'GET' | 'PUT',
    path: string,
    body?: Record<string, boolean | number>,
  ): Promise<GroovManageResponse> {
    const url = new URL(path, this.config.baseUrl);
    const response = await this.requester({
      method,
      url,
      headers: {
        accept: 'application/json',
        apiKey: this.config.apiKey,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      tls: {
        rejectUnauthorized: this.config.rejectUnauthorized,
        ...(this.config.ca !== undefined ? { ca: this.config.ca } : {}),
      },
      timeoutMs: this.config.requestTimeoutMs,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new GroovManageError(`groov Manage ${method} ${path} failed with HTTP ${response.status}`);
    }
    return response;
  }

  private createState(
    rawValue: boolean | number,
    enabled: boolean,
    intensity: number,
  ): LightState {
    return {
      kind: this.config.outputKind,
      enabled,
      intensity,
      rawValue,
      reachable: true,
      ioDevice: this.config.ioDevice,
      moduleIndex: this.config.moduleIndex,
      channelIndex: this.config.channelIndex,
      observedAt: this.now().toISOString(),
    };
  }
}

export async function nodeGroovManageRequester(
  request: GroovManageRequest,
): Promise<GroovManageResponse> {
  const client = request.url.protocol === 'https:'
    ? https
    : request.url.protocol === 'http:'
      ? http
      : null;
  if (!client) {
    throw new GroovManageError(`Unsupported groov Manage protocol ${request.url.protocol}`);
  }

  return new Promise<GroovManageResponse>((resolve, reject) => {
    const req = client.request(request.url, {
      method: request.method,
      headers: request.headers,
      ...(request.url.protocol === 'https:'
        ? {
            rejectUnauthorized: request.tls.rejectUnauthorized,
            ...(request.tls.ca !== undefined ? { ca: request.tls.ca } : {}),
          }
        : {}),
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer | string) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body: unknown = undefined;
        if (text.length > 0) {
          try {
            body = JSON.parse(text);
          } catch {
            reject(new GroovManageError('groov Manage returned invalid JSON'));
            return;
          }
        }
        resolve({ status: response.statusCode ?? 0, body });
      });
    });
    req.on('error', (error) => reject(new GroovManageError(`groov Manage request failed: ${error.message}`)));
    req.setTimeout(request.timeoutMs, () => {
      req.destroy(new Error(`request timed out after ${request.timeoutMs}ms`));
    });
    if (request.body !== undefined) {
      req.write(request.body);
    }
    req.end();
  });
}

function normalizeConfig(config: GroovManageLightControllerConfig): NormalizedConfig {
  const apiKey = config.apiKey.trim();
  if (!apiKey) {
    throw new GroovManageError('groov Manage API key is required');
  }
  const ioDevice = config.ioDevice.trim();
  if (!ioDevice) {
    throw new GroovManageError('groov I/O device name is required');
  }
  requireIndex(config.moduleIndex, 'moduleIndex', 15);
  requireIndex(config.channelIndex, 'channelIndex', 63);

  let baseUrl: URL;
  try {
    baseUrl = new URL(config.baseUrl);
  } catch {
    throw new GroovManageError('groov Manage base URL is invalid');
  }
  if (baseUrl.protocol !== 'https:') {
    throw new GroovManageError('groov Manage base URL must use https');
  }
  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new GroovManageError('groov Manage base URL must not include credentials, query, or fragment');
  }
  if (config.outputKind !== 'digital' && config.outputKind !== 'analog') {
    throw new GroovManageError('outputKind must be digital or analog');
  }

  const analogMin = config.analogMin ?? 0;
  const analogMax = config.analogMax ?? 1;
  const analogOffValue = config.analogOffValue ?? analogMin;
  const analogReadbackTolerance = config.analogReadbackTolerance ?? 0.001;
  const requestTimeoutMs = config.requestTimeoutMs ?? 5000;
  for (const [name, value] of Object.entries({
    analogMin,
    analogMax,
    analogOffValue,
    analogReadbackTolerance,
    requestTimeoutMs,
  })) {
    if (!Number.isFinite(value)) {
      throw new GroovManageError(`${name} must be finite`);
    }
  }
  if (analogMax <= analogMin) {
    throw new GroovManageError('analogMax must be greater than analogMin');
  }
  if (analogOffValue < analogMin || analogOffValue > analogMax) {
    throw new GroovManageError('analogOffValue must be within the analog range');
  }
  if (analogReadbackTolerance < 0) {
    throw new GroovManageError('analogReadbackTolerance must not be negative');
  }
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new GroovManageError('requestTimeoutMs must be a positive integer');
  }

  return {
    baseUrl,
    apiKey,
    ioDevice,
    moduleIndex: config.moduleIndex,
    channelIndex: config.channelIndex,
    outputKind: config.outputKind,
    analogMin,
    analogMax,
    analogOffValue,
    analogReadbackTolerance,
    requestTimeoutMs,
    rejectUnauthorized: config.rejectUnauthorized ?? true,
    ...(config.ca !== undefined ? { ca: config.ca } : {}),
  };
}

function requireIndex(value: number, name: string, max: number): void {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new GroovManageError(`${name} must be an integer between 0 and ${max}`);
  }
}

function requireRecord(value: unknown, description: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GroovManageError(`${description} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function validateCommand(command: LightCommand): void {
  if (typeof command.enabled !== 'boolean') {
    throw new GroovManageError('enabled must be a boolean');
  }
  if (
    command.intensity !== undefined
    && (!Number.isFinite(command.intensity) || command.intensity < 0 || command.intensity > 1)
  ) {
    throw new GroovManageError('intensity must be a finite number between 0 and 1');
  }
}
