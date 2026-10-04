/**
 * Pure column view assembly for the lane route.
 *
 * Turns worker snapshots plus column UI state (paused, invite, error, seed
 * log) into display lines. No React, no platform imports — jest loads this
 * exact module.
 */

import type {
  ChatTailEntry,
  CycleStateView,
  JournalTailEntry,
  LaneConnectionView,
  RoleSnapshot,
} from './projection.ts';

/** Outcome of one room-cleaning transaction: verified success, ended failure, still running, or ended and awaiting verification. */
export type CleaningTransactionStatus = 'success' | 'failed' | 'open' | 'pending';

export interface CleaningTransaction {
  cycleId: string;
  /** 1-based session number from the known cycle order; 0 when unknown. */
  number: number;
  status: CleaningTransactionStatus;
  title: string;
  /** One-line outcome, e.g. 'Closed · 12 energy · 10 readings · Verified'. */
  summary: string;
  cycle: CycleStateView;
  /** Grouped journal rows in chronological order, shown when the card expands. */
  entries: JournalTailEntry[];
}

export interface JournalModel {
  /** One card per cleaning cycle, newest first. */
  transactions: CleaningTransaction[];
  /** Ungrouped rows, newest first. */
  standalone: JournalTailEntry[];
}

/** A cycle journal row names its cycle (`started/closed cleaning cycle <id> ...`). */
function cycleEntryCycleId(entry: JournalTailEntry, cycleIds: readonly string[]): string | null {
  if (entry.kind !== 'cycle') return null;
  return cycleIds.find(cycleId => entry.summary.includes(cycleId)) ?? null;
}

/** Device rows carry no cycle link; the cleaning they happened during owns them. */
const WINDOWED_KINDS = new Set(['signal', 'light', 'sensor', 'attestation']);

/**
 * The cleaning whose time window holds this row: [startedAt, endedAt], open
 * cleanings reaching into the present. Overlapping windows (a second cycle
 * started before the first closed) attribute to the latest-started cleaning.
 * Cycles without a known start never claim rows.
 */
function windowOwner(entry: JournalTailEntry, cycles: readonly CycleStateView[]): string | null {
  if (!WINDOWED_KINDS.has(entry.kind)) return null;
  let owner: string | null = null;
  let latestStart = 0;
  for (const cycle of cycles) {
    if (cycle.startedAt <= 0) continue;
    const end = cycle.ended ? cycle.endedAt : Number.POSITIVE_INFINITY;
    if (cycle.ended && end <= 0) continue;
    if (entry.recordedAt < cycle.startedAt || entry.recordedAt > end) continue;
    if (cycle.startedAt < latestStart) continue;
    latestStart = cycle.startedAt;
    owner = cycle.cycleId;
  }
  return owner;
}

function transactionStatus(cycle: CycleStateView): { status: CleaningTransactionStatus; outcome: string } {
  if (!cycle.ended) return { status: 'open', outcome: 'Open' };
  const complete = cycle.energyReadings > 0 && cycle.sensorReadings > 0;
  const verified = cycle.signerRole === 'admin' && cycle.signedBy !== null;
  if (complete && verified) return { status: 'success', outcome: 'Verified' };
  if (!complete) return { status: 'failed', outcome: 'Incomplete record' };
  return { status: 'pending', outcome: 'Awaiting Clinic verification' };
}

/**
 * Fold each cleaning cycle and its journal rows into one transaction card.
 * Attestation rows scoped to a cycle and the cycle's own started/closed rows
 * move inside the card, as do the device rows recorded while it ran (lamp and
 * sensor switches carry no cycle link, so their cleaning owns them by time).
 * Config rows (roles, treatments) and rows outside every cleaning window stay
 * standalone. Pure view assembly: the snapshot (and the XLSX export) keeps
 * the flat tail.
 */
export function journalModel(
  cycles: CycleStateView[],
  journalTail: JournalTailEntry[],
  cycleIds: readonly string[],
): JournalModel {
  const byCycle = new Map<string, JournalTailEntry[]>();
  const standalone: JournalTailEntry[] = [];
  for (const entry of journalTail) {
    const direct = (entry.kind === 'attestation' || entry.kind === 'signal') && entry.scope && cycleIds.includes(entry.scope)
      ? entry.scope
      : cycleEntryCycleId(entry, cycleIds);
    const owner = direct ?? windowOwner(entry, cycles);
    if (owner !== null) {
      const grouped = byCycle.get(owner) ?? [];
      grouped.push(entry);
      byCycle.set(owner, grouped);
    } else {
      standalone.push(entry);
    }
  }
  const order = new Map(cycleIds.map((cycleId, index) => [cycleId, index]));
  const transactions = cycles.map(cycle => {
    const { status, outcome } = transactionStatus(cycle);
    const number = (order.get(cycle.cycleId) ?? -1) + 1;
    const counts = `${cycle.energyReadings} energy · ${cycle.sensorReadings} readings`;
    const summary = cycle.ended ? `Closed · ${counts} · ${outcome}` : `Open · ${counts}`;
    const entries = [...(byCycle.get(cycle.cycleId) ?? [])]
      .sort((a, b) => a.recordedAt - b.recordedAt || a.seq - b.seq);
    return {
      cycleId: cycle.cycleId,
      number,
      status,
      title: number > 0 ? `Room cleaning ${number}` : 'Room cleaning',
      summary,
      cycle,
      entries,
    };
  }).sort((a, b) => b.number - a.number || a.cycleId.localeCompare(b.cycleId));
  standalone.sort((a, b) => b.recordedAt - a.recordedAt || b.seq - a.seq);
  return { transactions, standalone };
}

/**
 * An expired IoM invitation is renewable, not a failure: the worker reports
 * the pairing wait timing out, and the column mints a fresh invitation in its
 * place. Matches both worker timeout labels across the IPC boundary, where
 * only the message text survives.
 */
export function isIoMPairingTimeout(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return text.includes('IoM pairing timed out');
}

export function shortId(hash: string | null): string {
  if (!hash) return '—';
  return hash.length > 12 ? hash.slice(0, 12) : hash;
}

export function connectionLine(connection: LaneConnectionView): string {
  const state = connection.isConnected ? 'connected' : 'known';
  const peer = shortId(connection.remotePersonId);
  return `${state} ⇄ ${peer}${connection.isInternetOfMe ? ' (IoM)' : ''}`;
}

export function chatLine(entry: ChatTailEntry): string {
  return `${shortId(entry.sender)}: ${entry.text}`;
}

export function journalLine(entry: JournalTailEntry): string {
  return `[${entry.kind}] ${entry.summary}`;
}

export function cycleLine(cycle: CycleStateView): string {
  const state = cycle.signedBy ? `signed by ${cycle.signerRole === 'admin' ? 'Clinic' : cycle.signerRole ?? '?'}` : cycle.ended ? 'closed, unsigned' : 'open';
  return `cycle ${shortId(cycle.cycleId)}: ${state}, ${cycle.energyReadings} energy / ${cycle.sensorReadings} readings`;
}

/** A signed record is evidence of a cycle, not a room-release decision. */
export function roomCleaningStatus(
  cycles: CycleStateView[],
  knownCycleIds: string[],
  unavailable = false,
): { title: string; detail: string } {
  if (unavailable || knownCycleIds.some(id => !cycles.some(cycle => cycle.cycleId === id))) {
    return { title: 'Updating cleaning status', detail: 'Waiting for the latest cleaning record.' };
  }
  if (!cycles.length) {
    return { title: 'Awaiting cleaning', detail: 'No room cleaning has been recorded.' };
  }
  if (cycles.some(cycle => !cycle.ended)) {
    return { title: 'Cleaning in progress', detail: 'The cleaning cycle has not finished.' };
  }
  const latestId = knownCycleIds[knownCycleIds.length - 1];
  const cycle = cycles.find(cycle => cycle.cycleId === latestId) ?? cycles[cycles.length - 1];
  if (!cycle.energyReadings || !cycle.sensorReadings) {
    return { title: 'Cleaning not confirmed', detail: 'The cycle ended without a complete cleaning record.' };
  }
  if (!cycle.signedBy || cycle.signerRole !== 'admin') {
    return { title: 'Awaiting verification', detail: 'The cycle has ended. Waiting for Clinic to verify its records.' };
  }
  return { title: 'Cleaning recorded', detail: 'Clinic has verified the cycle records. Room readiness is not assessed by this simulation.' };
}

export interface ColumnModel {
  role: string;
  title: string;
  badge: 'live' | 'paused' | 'error';
  ownerLine: string;
  instanceLine: string;
  connectionLines: string[];
  chatLines: string[];
  journalLines: string[];
  cycleLines: string[];
  notice: string | null;
}

export function columnModel(
  snapshot: RoleSnapshot,
  ui: { paused: boolean; error?: string },
): ColumnModel {
  const liveConnections = snapshot.connections.filter(entry => entry.isConnected).length;
  return {
    role: snapshot.role,
    title: snapshot.role,
    badge: ui.error ? 'error' : ui.paused ? 'paused' : 'live',
    ownerLine: `owner ${shortId(snapshot.person)}`,
    instanceLine: `instance ${shortId(snapshot.instanceId)} · ${liveConnections} live links`,
    connectionLines: snapshot.connections.map(connectionLine),
    chatLines: snapshot.chatTail.map(chatLine),
    journalLines: snapshot.journalTail.map(journalLine),
    cycleLines: snapshot.cycles.map(cycleLine),
    notice: ui.error ?? null,
  };
}
