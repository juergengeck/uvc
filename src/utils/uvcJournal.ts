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
  isDemo: boolean;
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
  if (status === 'completed') return 'Disinfection completed';
  if (status === 'planned') return 'Disinfection planned';
  if (status === 'running') return 'Disinfection in progress';
  if (status === 'failed') return 'Disinfection failed';
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
    isDemo: false,
  };
}

function atTime(reference: Date, dayOffset: number, hour: number, minute: number): number {
  const value = new Date(reference);
  value.setDate(reference.getDate() + dayOffset);
  value.setHours(hour, minute, 0, 0);
  return value.getTime();
}

export function createUvcDemoJournal(reference = new Date()): UvcJournalRecord[] {
  const sharedResources = ['UVC lamp 01 · groov RIO', 'ESP32 room sensor'];
  return [
    {
      id: 'demo-treatment-room-03',
      timestamp: atTime(reference, 0, 9, 45),
      location: 'Treatment room 03',
      summary: 'Disinfection completed',
      status: 'completed',
      durationMinutes: 12,
      resources: sharedResources,
      sourceType: 'DisinfectionRun',
      isDemo: true,
    },
    {
      id: 'demo-bathroom-east',
      timestamp: atTime(reference, 0, 7, 20),
      location: 'Bathroom · east wing',
      summary: 'Disinfection completed',
      status: 'completed',
      durationMinutes: 8,
      resources: ['UVC lamp 01 · groov RIO'],
      sourceType: 'DisinfectionRun',
      isDemo: true,
    },
    {
      id: 'demo-operating-room-01',
      timestamp: atTime(reference, -1, 18, 10),
      location: 'Operating room 01',
      summary: 'Disinfection completed',
      status: 'completed',
      durationMinutes: 18,
      resources: sharedResources,
      sourceType: 'DisinfectionRun',
      isDemo: true,
    },
    {
      id: 'demo-treatment-room-02',
      timestamp: atTime(reference, 1, 16, 30),
      location: 'Treatment room 02',
      summary: 'Disinfection planned',
      status: 'planned',
      durationMinutes: 12,
      resources: ['UVC lamp 01 · groov RIO'],
      sourceType: 'DisinfectionRun',
      isDemo: true,
    },
  ];
}

export function uvcJournalRecords(events: unknown[] | null | undefined): {
  records: UvcJournalRecord[];
  showingDemo: boolean;
} {
  if (!events?.length) {
    return { records: createUvcDemoJournal(), showingDemo: true };
  }
  return {
    records: events
      .map(normalizeUvcJournalEvent)
      .sort((left, right) => right.timestamp - left.timestamp),
    showingDemo: false,
  };
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
      ? 'Disinfection completed'
      : run.status === 'planned'
        ? 'Disinfection planned'
        : run.status === 'running'
          ? 'Disinfection in progress'
          : 'Disinfection failed',
    status: run.status,
    durationMinutes: run.startedAt !== undefined && run.endedAt !== undefined
      ? Math.max(1, Math.round((run.endedAt - run.startedAt) / 60_000))
      : undefined,
    resources: resources.map(resource => resource.label),
    sourceType: run.$type$,
    isDemo: false,
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
