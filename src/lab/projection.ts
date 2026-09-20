/**
 * Pure lane snapshot projection.
 *
 * A role snapshot is the per-column view the lane host renders: identity,
 * connections with IoM flags, chat tail, and journal tail. It is re-derived
 * on every read from worker state; the worker's replicated store stays the
 * source of truth and the snapshot is only a read of it. Partial readiness
 * renders honestly: anything not yet known is an empty list or null, never
 * an error.
 *
 * Runtime-import-free and side-effect-free so jest loads this exact module.
 */

export interface LaneConnectionView {
  remotePersonId: string | null;
  remoteInstanceId: string | null;
  isConnected: boolean;
  isInternetOfMe: boolean;
}

export interface ChatTailEntry {
  seq: number;
  sender: string;
  text: string;
  sentAt: number;
}

export interface JournalTailEntry {
  idHash: string;
  seq: number;
  kind: string;
  summary: string;
  recordedAt: number;
  signatures: string[];
}

export interface CycleStateView {
  cycleId: string;
  planId: string;
  ended: boolean;
  energyReadings: number;
  sensorReadings: number;
  signedBy: string | null;
  signerRole: string | null;
}

export interface RoleSnapshot {
  role: string;
  person: string | null;
  instanceId: string | null;
  connections: LaneConnectionView[];
  chatTail: ChatTailEntry[];
  journalTail: JournalTailEntry[];
  cycles: CycleStateView[];
  lightState: { on: boolean; reason?: string } | null;
}

const MAX_TAIL = 20;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function boolean(value: unknown): boolean {
  return value === true;
}

/** Normalize one raw connection info entry; unknown shapes degrade to nulls. */
export function projectConnection(raw: unknown): LaneConnectionView {
  if (!isRecord(raw)) return { remotePersonId: null, remoteInstanceId: null, isConnected: false, isInternetOfMe: false };
  return {
    remotePersonId: text(raw.remotePersonId),
    remoteInstanceId: text(raw.remoteInstanceId),
    isConnected: boolean(raw.isConnected),
    isInternetOfMe: boolean(raw.isInternetOfMe),
  };
}

/** Normalize one raw chat entry; entries without seq/text/sender are dropped. */
export function projectChatTail(raw: unknown[]): ChatTailEntry[] {
  const entries: ChatTailEntry[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const seq = number(item.seq);
    const sender = text(item.sender);
    const message = text(item.text);
    const sentAt = number(item.sentAt);
    if (seq === null || sender === null || message === null || sentAt === null) continue;
    entries.push({ seq, sender, text: message, sentAt });
  }
  return entries.sort((a, b) => a.seq - b.seq).slice(-MAX_TAIL);
}

/** Normalize one raw journal entry; entries without id/kind/summary are dropped. */
export function projectJournalTail(raw: unknown[]): JournalTailEntry[] {
  const entries: JournalTailEntry[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const idHash = text(item.idHash);
    const kind = text(item.kind);
    const summary = text(item.summary);
    const recordedAt = number(item.recordedAt);
    if (idHash === null || kind === null || summary === null || recordedAt === null) continue;
    const signatures = Array.isArray(item.signatures)
      ? item.signatures.filter((entry): entry is string => typeof entry === 'string')
      : [];
    const seq = number(item.seq);
    if (seq === null) continue;
    entries.push({ idHash, seq, kind, summary, recordedAt, signatures });
  }
  return entries.sort((a, b) => a.recordedAt - b.recordedAt).slice(-MAX_TAIL);
}

/** Normalize raw cycle states; entries without a cycle id are dropped. */
export function projectCycles(raw: unknown[]): CycleStateView[] {
  const states: CycleStateView[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const cycleId = text(item.cycleId);
    if (cycleId === null) continue;
    states.push({
      cycleId,
      planId: text(item.planId) ?? '',
      ended: boolean(item.ended),
      energyReadings: number(item.energyReadings) ?? 0,
      sensorReadings: number(item.sensorReadings) ?? 0,
      signedBy: text(item.signedBy),
      signerRole: text(item.signerRole),
    });
  }
  return states;
}

export function projectRoleSnapshot(input: {
  role: string;
  person: unknown;
  instanceId: unknown;
  connections: unknown;
  chatTail: unknown;
  journalTail: unknown;
  cycles?: unknown;
  lightState?: unknown;
}): RoleSnapshot {
  return {
    role: input.role,
    person: text(input.person),
    instanceId: text(input.instanceId),
    connections: (Array.isArray(input.connections) ? input.connections : []).map(projectConnection),
    chatTail: projectChatTail(Array.isArray(input.chatTail) ? input.chatTail : []),
    journalTail: projectJournalTail(Array.isArray(input.journalTail) ? input.journalTail : []),
    cycles: projectCycles(Array.isArray(input.cycles) ? input.cycles : []),
    lightState: isRecord(input.lightState)
      ? { on: boolean(input.lightState.on), reason: text(input.lightState.reason) ?? undefined }
      : null,
  };
}
