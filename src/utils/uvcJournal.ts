import type {UvcDisinfectionRun, UvcRoomResource} from '@refinio/uvc.core';

export type UvcJournalStatus = 'completed' | 'planned' | 'running' | 'failed' | 'device' | 'note';

export interface UvcJournalRecord {
  id: string;
  timestamp: number;
  location: string;
  summary: string;
  status: UvcJournalStatus;
  durationMinutes?: number;
  resources: string[];
  sourceType: string;
  evidenceCount?: number;
}

interface UnknownRecord {
  [key: string]: unknown;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function validTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function firstString(data: UnknownRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function recordResources(data: UnknownRecord): string[] {
  const resources = new Set<string>();
  const configured = data.resources;
  if (Array.isArray(configured)) {
    configured.forEach(value => {
      if (typeof value === 'string' && value.trim()) resources.add(value.trim());
    });
  } else if (typeof configured === 'string' && configured.trim()) {
    resources.add(configured.trim());
  }

  const deviceName = firstString(data, ['deviceName', 'lampName', 'sensorName']);
  const deviceType = firstString(data, ['deviceType', 'resourceType']);
  if (deviceName) resources.add(deviceName);
  if (!deviceName && deviceType) resources.add(deviceType);
  return [...resources];
}

function statusFor(sourceType: string, data: UnknownRecord): UvcJournalStatus {
  const explicit = firstString(data, ['status', 'state'])?.toLowerCase();
  if (explicit === 'planned' || explicit === 'scheduled') return 'planned';
  if (explicit === 'completed' || explicit === 'complete' || explicit === 'finished') return 'completed';
  if (explicit === 'running' || explicit === 'active') return 'running';
  if (explicit === 'failed' || explicit === 'error') return 'failed';
  if (/disinfection|cleaning|treatment/i.test(sourceType)) return 'completed';
  if (/device/i.test(sourceType)) return 'device';
  return 'note';
}

function summaryFor(sourceType: string, data: UnknownRecord, status: UvcJournalStatus): string {
  const explicit = firstString(data, ['summary', 'title', 'text', 'description']);
  if (explicit) return explicit;

  if (sourceType === 'DeviceState') {
    const nextState = firstString(data, ['toState']);
    return nextState ? `Device state changed to ${nextState.replace(/_/g, ' ')}` : 'Device state changed';
  }
  if (sourceType === 'DeviceOwnership') {
    const action = firstString(data, ['action']);
    return action ? action.replace(/_/g, ' ') : 'Device ownership updated';
  }
  if (status === 'completed') return 'UVC cycle executed';
  if (status === 'planned') return 'UVC cycle planned';
  if (status === 'running') return 'UVC cycle in progress';
  if (status === 'failed') return 'UVC cycle failed';
  return sourceType === 'unknown' ? 'Journal entry' : sourceType.replace(/_/g, ' ');
}

function durationFor(data: UnknownRecord): number | undefined {
  const minutes = data.durationMinutes;
  if (typeof minutes === 'number' && Number.isFinite(minutes) && minutes > 0) return Math.round(minutes);
  const seconds = data.durationSeconds;
  if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
    return Math.max(1, Math.round(seconds / 60));
  }
  return undefined;
}

export function normalizeUvcJournalEvent(event: unknown, index: number): UvcJournalRecord {
  const outer = isRecord(event) ? event : {};
  const objectData = isRecord(outer.data) ? outer.data : {};
  const storedObject = isRecord(objectData.data) ? objectData.data : objectData;
  const payload = isRecord(storedObject.data) ? storedObject.data : storedObject;
  const sourceType = firstString(storedObject, ['type'])
    ?? firstString(outer, ['type'])
    ?? 'unknown';
  const timestamp = validTimestamp(storedObject.timestamp)
    ?? validTimestamp(objectData.creationTime)
    ?? Date.now();
  const deviceName = firstString(payload, ['deviceName']);
  const location = firstString(payload, ['roomName', 'room', 'location', 'area', 'facility'])
    ?? deviceName
    ?? (sourceType === 'DeviceState' || sourceType === 'DeviceOwnership' ? 'Unassigned device' : 'Journal');
  const status = statusFor(sourceType, payload);

  return {
    id: firstString(storedObject, ['id']) ?? firstString(objectData, ['id']) ?? `${sourceType}-${timestamp}-${index}`,
    timestamp,
    location,
    summary: summaryFor(sourceType, payload, status),
    status,
    durationMinutes: durationFor(payload),
    resources: recordResources(payload),
    sourceType,
  };
}

export function uvcJournalRecords(events: unknown[] | null | undefined): UvcJournalRecord[] {
  if (!events?.length) {
    return [];
  }
  return events
    .map(normalizeUvcJournalEvent)
    .sort((left, right) => right.timestamp - left.timestamp);
}

export function uvcDisinfectionRunRecords(records: Array<{
  run: UvcDisinfectionRun;
  resources: UvcRoomResource[];
}>): UvcJournalRecord[] {
  return records.map(({run, resources}) => ({
    id: run.runId,
    timestamp: run.startedAt ?? run.scheduledAt ?? run.createdAt,
    location: run.roomName,
    summary: run.status === 'completed'
      ? 'UVC cycle executed'
      : run.status === 'planned'
        ? 'UVC cycle planned'
        : run.status === 'running'
          ? 'UVC cycle in progress'
          : 'UVC cycle failed',
    status: run.status,
    durationMinutes: run.startedAt !== undefined && run.endedAt !== undefined
      ? Math.max(1, Math.round((run.endedAt - run.startedAt) / 60_000))
      : undefined,
    resources: resources.map(resource => resource.label),
    sourceType: run.$type$,
    evidenceCount: (run.startObservations?.size ?? 0) + (run.stopObservations?.size ?? 0),
  }));
}

export function localDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}
