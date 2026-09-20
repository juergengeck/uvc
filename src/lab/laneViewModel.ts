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
