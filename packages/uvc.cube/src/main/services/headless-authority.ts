import type {
  DiscoveryConfigSnapshot,
  DiscoveryDeviceSnapshot,
  DiscoveryRuntimeSnapshot,
  DiscoveryStatusSnapshot,
  SettingsSnapshot,
} from '@shared/contracts';
import {
  UVC_DEFAULT_AUTHORITY_URL,
  UVC_DISCOVERY_DEFAULTS,
  UVC_DISCOVERY_SECTION_ID,
} from '@shared/settings/registry';

import { getCubeSettingsService } from './cube-settings.js';

function joinUrl(baseUrl: string, route: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
  return `${normalizedBase}${normalizedRoute}`;
}

async function parseJsonResponse(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON but received: ${text.slice(0, 160)}`);
  }
}

function normalizeStatus(payload: any): DiscoveryStatusSnapshot {
  if (!payload || typeof payload !== 'object') {
    return { healthy: false, status: 'unknown' };
  }

  return {
    service: payload.service,
    role: payload.role,
    status: payload.status,
    healthy: typeof payload.healthy === 'boolean' ? payload.healthy : payload.status !== 'error',
    ownerId: payload.ownerId ?? payload.personId,
    instanceId: payload.instanceId,
    updatedAt: payload.updatedAt,
    mdns: typeof payload.mdns === 'object' && payload.mdns ? {
      serviceType: payload.mdns.serviceType,
      serviceName: payload.mdns.serviceName,
      host: payload.mdns.host,
      domain: payload.mdns.domain,
      txt: payload.mdns.txt,
    } : undefined,
    discovery: typeof payload.discovery === 'object' && payload.discovery ? {
      protocol: payload.discovery.protocol,
      peersSeen: payload.discovery.peersSeen,
      lastScanAt: payload.discovery.lastScanAt,
    } : undefined,
  };
}

function normalizeDevice(payload: any): DiscoveryDeviceSnapshot {
  const id = String(payload?.id ?? payload?.deviceId ?? payload?.name ?? 'unknown-device');

  return {
    id,
    name: payload?.name ?? payload?.deviceName ?? id,
    type: payload?.type ?? payload?.deviceType,
    role: payload?.role ?? payload?.deviceRole,
    address: payload?.address ?? payload?.host,
    port: typeof payload?.port === 'number' ? payload.port : undefined,
    mdnsName: payload?.mdnsName ?? payload?.hostName,
    online: typeof payload?.online === 'boolean'
      ? payload.online
      : typeof payload?.status === 'string'
        ? payload.status === 'online'
        : undefined,
    connected: typeof payload?.connected === 'boolean'
      ? payload.connected
      : typeof payload?.isConnected === 'boolean'
        ? payload.isConnected
        : typeof payload?.hasValidCredential === 'boolean'
          ? payload.hasValidCredential
          : typeof payload?.isAuthenticated === 'boolean'
            ? payload.isAuthenticated
            : undefined,
    ownerId: payload?.ownerId ?? payload?.ownerPersonId,
    lastSeenAt: payload?.lastSeenAt ?? payload?.lastSeen ?? payload?.updatedAt,
    trustState: payload?.trustState ?? payload?.ownership ?? 'unknown',
    capabilities: Array.isArray(payload?.capabilities) ? payload.capabilities : [],
  };
}

function normalizeDeviceList(payload: any): DiscoveryDeviceSnapshot[] {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.devices)
      ? payload.devices
      : [];

  return list.map(normalizeDevice);
}

function normalizeConfig(payload: any): DiscoveryConfigSnapshot {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  return payload as DiscoveryConfigSnapshot;
}

function getAuthorityUrl(settings: SettingsSnapshot): string {
  const section = settings[UVC_DISCOVERY_SECTION_ID] ?? {};
  const authorityUrl = typeof section.authorityUrl === 'string' && section.authorityUrl.trim()
    ? section.authorityUrl.trim()
    : UVC_DEFAULT_AUTHORITY_URL;
  return authorityUrl;
}

async function requestJson(baseUrl: string, route: string, init?: RequestInit): Promise<any> {
  const response = await fetch(joinUrl(baseUrl, route), {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const payload = await response.text().catch(() => '');
    throw new Error(
      `Request failed for ${route}: ${response.status} ${response.statusText}` +
      (payload ? ` - ${payload.slice(0, 200)}` : ''),
    );
  }

  return parseJsonResponse(response);
}

async function requestOptionalJson(baseUrl: string, route: string): Promise<any> {
  const response = await fetch(joinUrl(baseUrl, route), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (response.status === 404) {
    return undefined;
  }

  if (!response.ok) {
    throw new Error(`Request failed for ${route}: ${response.status} ${response.statusText}`);
  }

  return parseJsonResponse(response);
}

function buildDiscoveryConfig(settings: SettingsSnapshot): DiscoveryConfigSnapshot {
  const device = settings.device ?? {};
  const discovery = settings[UVC_DISCOVERY_SECTION_ID] ?? {};

  const serviceType = typeof discovery.serviceType === 'string' && discovery.serviceType.trim()
    ? discovery.serviceType.trim()
    : UVC_DISCOVERY_DEFAULTS.serviceType;
  const serviceName = typeof discovery.serviceName === 'string' && discovery.serviceName.trim()
    ? discovery.serviceName.trim()
    : UVC_DISCOVERY_DEFAULTS.serviceName;
  const domain = typeof discovery.domain === 'string' && discovery.domain.trim()
    ? discovery.domain.trim()
    : UVC_DISCOVERY_DEFAULTS.domain;
  const intervalMs = typeof discovery.discoveryIntervalMs === 'number'
    ? discovery.discoveryIntervalMs
    : Number(discovery.discoveryIntervalMs ?? UVC_DISCOVERY_DEFAULTS.discoveryIntervalMs);

  return {
    discovery: {
      enabled: Boolean(device.discoveryEnabled) && Boolean(discovery.mdnsEnabled ?? true),
      mode: typeof discovery.discoveryMode === 'string' ? discovery.discoveryMode : UVC_DISCOVERY_DEFAULTS.discoveryMode,
      intervalMs: Number.isFinite(intervalMs) ? Math.max(1000, intervalMs) : UVC_DISCOVERY_DEFAULTS.discoveryIntervalMs,
      serviceType,
      serviceName,
      domain,
    },
    trust: {
      autoTrustKnownDevices: Boolean(device.autoTrustKnownPersonDevices),
    },
  };
}

export async function getDiscoveryRuntimeSnapshot(): Promise<DiscoveryRuntimeSnapshot> {
  const settings = await getCubeSettingsService().getSettings();
  const authorityUrl = getAuthorityUrl(settings);

  try {
    const payload = await requestJson(authorityUrl, '/api/uvcAuthority/state');
    return {
      authorityUrl,
      status: normalizeStatus(payload?.status ?? payload),
      devices: normalizeDeviceList(payload?.devices),
      config: normalizeConfig(payload?.config),
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    const [statusPayload, devicesPayload, configPayload] = await Promise.all([
      requestJson(authorityUrl, '/api/headless/status'),
      requestOptionalJson(authorityUrl, '/api/uvcAuthority/devices'),
      requestOptionalJson(authorityUrl, '/api/uvcAuthority/config'),
    ]);

    return {
      authorityUrl,
      status: normalizeStatus(statusPayload),
      devices: normalizeDeviceList(devicesPayload),
      config: normalizeConfig(configPayload),
      fetchedAt: new Date().toISOString(),
    };
  }
}

export async function refreshDiscoveryRuntime(): Promise<DiscoveryRuntimeSnapshot> {
  const settings = await getCubeSettingsService().getSettings();
  const authorityUrl = getAuthorityUrl(settings);

  await requestJson(authorityUrl, '/api/uvcAuthority/discovery/refresh', {
    method: 'POST',
    body: JSON.stringify({ requestedAt: new Date().toISOString() }),
  });

  return getDiscoveryRuntimeSnapshot();
}

export async function setDiscoveryDeviceTrust(deviceId: string, trusted: boolean): Promise<DiscoveryRuntimeSnapshot> {
  const settings = await getCubeSettingsService().getSettings();
  const authorityUrl = getAuthorityUrl(settings);

  await requestJson(authorityUrl, '/api/uvcAuthority/trustDevice', {
    method: 'POST',
    body: JSON.stringify({ deviceId, trusted }),
  });

  return getDiscoveryRuntimeSnapshot();
}

export async function pushDiscoverySettings() {
  const settings = await getCubeSettingsService().getSettings();
  const authorityUrl = getAuthorityUrl(settings);
  const config = buildDiscoveryConfig(settings);

  await requestJson(authorityUrl, '/api/uvcAuthority/config', {
    method: 'POST',
    body: JSON.stringify({ config }),
  });

  return {
    config,
    runtime: await getDiscoveryRuntimeSnapshot(),
  };
}
