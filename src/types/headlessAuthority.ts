export const DEFAULT_HEADLESS_AUTHORITY_URL = 'http://uvc-pi.local:3000';

export type HeadlessAuthorityTrustState =
  | 'trusted'
  | 'pending'
  | 'untrusted'
  | 'error'
  | 'unknown';

export type HeadlessAuthorityDeviceRole =
  | 'pi-authority'
  | 'light-source'
  | 'uvc-detector'
  | 'rgb-detector'
  | 'unknown';

export interface HeadlessAuthorityEndpointSet {
  status?: string;
  invite?: string;
  api?: string;
  ws?: string;
  [key: string]: unknown;
}

export interface HeadlessAuthorityStatus {
  service?: string;
  role?: string;
  ownerId?: string;
  personId?: string;
  instanceId?: string;
  healthy?: boolean;
  status?: string;
  version?: string;
  name?: string;
  startedAt?: string;
  updatedAt?: string;
  baseUrl?: string;
  mdns?: {
    serviceType?: string;
    serviceName?: string;
    host?: string;
    domain?: string;
    txt?: Record<string, string>;
    [key: string]: unknown;
  };
  endpoints?: HeadlessAuthorityEndpointSet;
  discovery?: {
    protocol?: string;
    peersSeen?: number;
    lastScanAt?: string;
    [key: string]: unknown;
  };
  trust?: {
    mode?: string;
    acceptedDevices?: number;
    pendingDevices?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface HeadlessAuthoritySensorReading {
  key: string;
  label?: string;
  value: string | number | boolean | null;
  unit?: string;
  capturedAt?: string;
}

export interface HeadlessAuthorityDevice {
  id: string;
  name?: string;
  type?: string;
  role?: HeadlessAuthorityDeviceRole | string;
  address?: string;
  port?: number;
  mdnsName?: string;
  online?: boolean;
  lastSeenAt?: string;
  trustState?: HeadlessAuthorityTrustState | string;
  ownerId?: string;
  capabilities?: string[];
  sensorReadings?: HeadlessAuthoritySensorReading[];
  configuration?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface HeadlessAuthorityDetectorConfig {
  deviceId?: string;
  enabled?: boolean;
  sampleIntervalMs?: number;
  sensorModel?: string;
  calibrationProfile?: string;
  [key: string]: unknown;
}

export interface HeadlessAuthorityConfig {
  discovery?: {
    enabled?: boolean;
    mode?: 'mdns' | 'udp' | 'hybrid' | string;
    intervalMs?: number;
    serviceType?: string;
    serviceName?: string;
    domain?: string;
    [key: string]: unknown;
  };
  trust?: {
    enabled?: boolean;
    ownerId?: string;
    requirePiAuthority?: boolean;
    autoTrustKnownDevices?: boolean;
    [key: string]: unknown;
  };
  lightSource?: {
    enabled?: boolean;
    kind?: string;
    host?: string;
    port?: number;
    channel?: string;
    intensity?: number;
    [key: string]: unknown;
  };
  detectors?: {
    uvc?: HeadlessAuthorityDetectorConfig;
    rgb?: HeadlessAuthorityDetectorConfig;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface HeadlessAuthorityState {
  status: HeadlessAuthorityStatus;
  devices: HeadlessAuthorityDevice[];
  config: HeadlessAuthorityConfig;
  raw?: Record<string, unknown>;
}

export interface HeadlessAuthorityTrustDeviceRequest {
  deviceId: string;
  trusted: boolean;
  reason?: string;
}
