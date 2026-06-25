import { getNetworkSettingsService } from './NetworkSettingsService';
import type {
  HeadlessAuthorityConfig,
  HeadlessAuthorityDevice,
  HeadlessAuthorityState,
  HeadlessAuthorityStatus,
  HeadlessAuthorityTrustDeviceRequest,
} from '@src/types/headlessAuthority';

type JsonValue = Record<string, any>;

function joinUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

async function parseJsonResponse(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Expected JSON response but received: ${text.slice(0, 160)}`);
  }
}

function normalizeStatus(payload: any, baseUrl: string): HeadlessAuthorityStatus {
  if (!payload || typeof payload !== 'object') {
    return { baseUrl, healthy: false, status: 'unknown' };
  }

  const endpoints = typeof payload.endpoints === 'object' && payload.endpoints
    ? payload.endpoints
    : {
        status: joinUrl(baseUrl, '/api/headless/status'),
        api: joinUrl(baseUrl, '/api/uvcAuthority/state'),
      };

  return {
    ...payload,
    baseUrl,
    endpoints,
    healthy: typeof payload.healthy === 'boolean'
      ? payload.healthy
      : payload.status !== 'error',
  };
}

function normalizeSensorReadings(payload: any): HeadlessAuthorityDevice['sensorReadings'] {
  if (Array.isArray(payload)) {
    return payload
      .filter((item) => item && typeof item === 'object' && typeof item.key === 'string')
      .map((item) => ({
        key: item.key,
        label: item.label,
        value: item.value ?? null,
        unit: item.unit,
        capturedAt: item.capturedAt,
      }));
  }

  if (payload && typeof payload === 'object') {
    return Object.entries(payload).map(([key, value]) => ({
      key,
      value: typeof value === 'object' && value !== null && 'value' in value
        ? (value as any).value
        : (value as any),
      unit: typeof value === 'object' && value !== null ? (value as any).unit : undefined,
      capturedAt: typeof value === 'object' && value !== null ? (value as any).capturedAt : undefined,
    }));
  }

  return [];
}

function normalizeDevice(payload: any): HeadlessAuthorityDevice {
  const id = String(
    payload?.id
    ?? payload?.deviceId
    ?? payload?.name
    ?? 'unknown-device'
  );

  return {
    id,
    name: payload?.name ?? payload?.deviceName ?? id,
    type: payload?.type ?? payload?.deviceType,
    role: payload?.role ?? payload?.deviceRole ?? 'unknown',
    address: payload?.address ?? payload?.host,
    port: typeof payload?.port === 'number' ? payload.port : undefined,
    mdnsName: payload?.mdnsName ?? payload?.hostName,
    online: typeof payload?.online === 'boolean'
      ? payload.online
      : typeof payload?.status === 'string'
        ? payload.status === 'online'
        : undefined,
    lastSeenAt: payload?.lastSeenAt ?? payload?.lastSeen ?? payload?.updatedAt,
    trustState: payload?.trustState ?? payload?.ownership ?? 'unknown',
    ownerId: payload?.ownerId,
    capabilities: Array.isArray(payload?.capabilities) ? payload.capabilities : [],
    sensorReadings: normalizeSensorReadings(payload?.sensorReadings ?? payload?.sensors),
    configuration: typeof payload?.configuration === 'object' && payload.configuration
      ? payload.configuration
      : undefined,
    metadata: typeof payload?.metadata === 'object' && payload.metadata
      ? payload.metadata
      : undefined,
  };
}

function normalizeDeviceList(payload: any): HeadlessAuthorityDevice[] {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.devices)
      ? payload.devices
      : [];

  return list.map(normalizeDevice);
}

function normalizeConfig(payload: any): HeadlessAuthorityConfig {
  if (!payload || typeof payload !== 'object') {
    return {};
  }
  return payload as HeadlessAuthorityConfig;
}

export class HeadlessAuthorityService {
  private static instance: HeadlessAuthorityService | null = null;

  public static getInstance(): HeadlessAuthorityService {
    if (!HeadlessAuthorityService.instance) {
      HeadlessAuthorityService.instance = new HeadlessAuthorityService();
    }
    return HeadlessAuthorityService.instance;
  }

  public getBaseUrl(): string {
    return getNetworkSettingsService().getHeadlessAuthorityUrl();
  }

  public async setBaseUrl(url: string): Promise<void> {
    await getNetworkSettingsService().setHeadlessAuthorityUrl(url);
  }

  public async resetBaseUrl(): Promise<void> {
    await getNetworkSettingsService().resetHeadlessAuthorityUrl();
  }

  public async fetchStatus(): Promise<HeadlessAuthorityStatus> {
    const baseUrl = this.getBaseUrl();
    const payload = await this.requestJson('/api/headless/status');
    return normalizeStatus(payload, baseUrl);
  }

  public async fetchState(): Promise<HeadlessAuthorityState> {
    const baseUrl = this.getBaseUrl();

    try {
      const payload = await this.requestJson('/api/uvcAuthority/state');
      return {
        status: normalizeStatus(payload?.status ?? payload, baseUrl),
        devices: normalizeDeviceList(payload?.devices),
        config: normalizeConfig(payload?.config),
        raw: payload,
      };
    } catch (error) {
      const [status, devices, config] = await Promise.all([
        this.fetchStatus(),
        this.requestOptionalJson('/api/uvcAuthority/devices'),
        this.requestOptionalJson('/api/uvcAuthority/config'),
      ]);

      return {
        status,
        devices: normalizeDeviceList(devices),
        config: normalizeConfig(config),
        raw: {
          fallbackReason: error instanceof Error ? error.message : String(error),
          status,
          devices,
          config,
        },
      };
    }
  }

  public async refreshDiscovery(): Promise<void> {
    await this.requestJson('/api/uvcAuthority/discovery/refresh', {
      method: 'POST',
      body: JSON.stringify({ requestedAt: new Date().toISOString() }),
    });
  }

  public async setDeviceTrust(request: HeadlessAuthorityTrustDeviceRequest): Promise<void> {
    await this.requestJson('/api/uvcAuthority/trustDevice', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  public async updateConfig(config: HeadlessAuthorityConfig | JsonValue): Promise<void> {
    await this.requestJson('/api/uvcAuthority/config', {
      method: 'POST',
      body: JSON.stringify({ config }),
    });
  }

  private async requestOptionalJson(path: string): Promise<any> {
    const baseUrl = this.getBaseUrl();
    const response = await fetch(joinUrl(baseUrl, path), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (response.status === 404) {
      return undefined;
    }

    if (!response.ok) {
      throw new Error(`Request failed for ${path}: ${response.status} ${response.statusText}`);
    }

    return parseJsonResponse(response);
  }

  private async requestJson(path: string, init?: RequestInit): Promise<any> {
    const baseUrl = this.getBaseUrl();
    const response = await fetch(joinUrl(baseUrl, path), {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });

    if (!response.ok) {
      const errorPayload = await response.text().catch(() => '');
      throw new Error(
        `Request failed for ${path}: ${response.status} ${response.statusText}` +
        (errorPayload ? ` - ${errorPayload.slice(0, 200)}` : '')
      );
    }

    return parseJsonResponse(response);
  }
}

export function getHeadlessAuthorityService(): HeadlessAuthorityService {
  return HeadlessAuthorityService.getInstance();
}
