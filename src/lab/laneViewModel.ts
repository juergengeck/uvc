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
  const state = cycle.signedBy ? `signed by ${cycle.signerRole ?? '?'}` : cycle.ended ? 'closed, unsigned' : 'open';
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
    return { title: 'Awaiting verification', detail: 'The cycle has ended. Waiting for Admin to verify its records.' };
  }
  return { title: 'Cleaning recorded', detail: 'Admin has verified the cycle records. Room readiness is not assessed by this simulation.' };
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
