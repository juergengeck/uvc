import type { DeviceSettings } from '@src/recipes/device';

export const ESP32_CAM_STREAM_URL_KEY = 'esp32Cam.streamUrl';
export const ESP32_CAM_SNAPSHOT_URL_KEY = 'esp32Cam.snapshotUrl';
export const ESP32_CAM_CONTROL_URL_KEY = 'esp32Cam.controlUrl';

export interface Esp32CamEndpoints {
  controlUrl: string;
  snapshotUrl: string;
  streamUrl: string;
}

type CustomFieldsLike =
  | DeviceSettings['customFields']
  | Map<string, string>
  | Record<string, string>
  | undefined
  | null;

function coerceHttpUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `http://${trimmed}`;
}

function extractHost(address: string): string {
  const normalized = coerceHttpUrl(address);

  try {
    const url = new URL(normalized);
    return url.hostname || address.trim();
  } catch {
    return address.trim();
  }
}

function customFieldEntries(customFields: CustomFieldsLike): Array<[string, string]> {
  if (!customFields) {
    return [];
  }

  if (customFields instanceof Map) {
    return Array.from(customFields.entries()).filter(
      (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'
    );
  }

  if (typeof customFields === 'object') {
    return Object.entries(customFields).filter(
      (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'
    );
  }

  return [];
}

function readCustomField(customFields: CustomFieldsLike, key: string): string | undefined {
  return customFieldEntries(customFields).find(([entryKey]) => entryKey === key)?.[1];
}

export function isEsp32CamCandidate(
  deviceType?: string,
  address?: string,
  capabilities: string[] = []
): boolean {
  const normalizedAddress = address?.trim() ?? '';
  if (!normalizedAddress || normalizedAddress.toLowerCase() === 'unknown' || normalizedAddress.toUpperCase() === 'BLE') {
    return false;
  }

  const lowerType = deviceType?.toLowerCase() ?? '';
  if (lowerType.includes('esp32')) {
    return true;
  }

  const normalizedCapabilities = new Set(capabilities.map(capability => capability.toLowerCase()));
  return ['camera', 'capture', 'esp32-cam', 'snapshot', 'stream', 'video'].some(capability =>
    normalizedCapabilities.has(capability)
  );
}

export function buildDefaultEsp32CamEndpoints(address: string): Esp32CamEndpoints {
  const host = extractHost(address);
  const controlUrl = `http://${host}`;

  return {
    controlUrl,
    snapshotUrl: `${controlUrl}/capture`,
    streamUrl: `http://${host}:81/stream`,
  };
}

export function resolveEsp32CamEndpoints(address: string, customFields?: CustomFieldsLike): Esp32CamEndpoints {
  const defaults = buildDefaultEsp32CamEndpoints(address);

  return {
    controlUrl: readCustomField(customFields, ESP32_CAM_CONTROL_URL_KEY) || defaults.controlUrl,
    snapshotUrl: readCustomField(customFields, ESP32_CAM_SNAPSHOT_URL_KEY) || defaults.snapshotUrl,
    streamUrl: readCustomField(customFields, ESP32_CAM_STREAM_URL_KEY) || defaults.streamUrl,
  };
}

export function mergeEsp32CamCustomFields(
  customFields: CustomFieldsLike,
  endpoints: Esp32CamEndpoints
): Map<string, string> {
  const nextFields = new Map(customFieldEntries(customFields));

  const nextValues = [
    [ESP32_CAM_CONTROL_URL_KEY, coerceHttpUrl(endpoints.controlUrl)],
    [ESP32_CAM_SNAPSHOT_URL_KEY, coerceHttpUrl(endpoints.snapshotUrl)],
    [ESP32_CAM_STREAM_URL_KEY, coerceHttpUrl(endpoints.streamUrl)],
  ] as const;

  nextValues.forEach(([key, value]) => {
    if (value) {
      nextFields.set(key, value);
    } else {
      nextFields.delete(key);
    }
  });

  return nextFields;
}

export function appendCacheBust(url: string, token: number): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_ts=${token}`;
}
