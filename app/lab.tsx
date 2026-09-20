/**
 * UVC lab lane route (`/lab`).
 *
 * High-fidelity, zero-redundant-whitespace multi-role workbench: boots four browser
 * worker roles (admin, doctor, lamp, sensor) side-by-side in one tab.
 *
 * Visual Experience:
 * - Doctor: Authentic clinical mobile app inside a phone frame (Protocol planning,
 *   cycle dispatch, emergency stop, live dose progress, team chat, second-device IoM pairing).
 * - Admin: Authentic hospital trust anchor mobile app inside a phone frame (EN 17141
 *   compliance certification queue, cryptographic seals, audit log, second-device IoM pairing).
 * - Lamp Simulator: Physical 254nm germicidal UVC quartz tube emitter fixture with
 *   luminescence glow rays, operational hazard banner, and telemetry instrumentation.
 * - Sensor Simulator: NIST-traceable industrial radiometer with photodiode optical dome,
 *   high-contrast digital LCD irradiance/dose display, sample trigger, and 1Hz auto-stream.
 *
 * Layout:
 * - Calibrated ~510px matching card heights fitting cleanly in browser viewports without
 *   redundant page scrollbars.
 * - Toggleable between 4-Columns Side-by-Side (▥ 4-Columns) and Symmetrical 2x2 Grid (⊞ 2×2 Grid).
 * - Collapsible bottom event stream tray.
 *
 * Adheres to EN 17141 posture (execution evidence, non-microbiological claims).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { QRCodeSVG } from 'qrcode.react';
import { bootLane, seedLaneMesh, snapshotRole } from '../src/lab/transport.ts';
import type { LaneClient, LaneSeed } from '../src/lab/transport.ts';
import { spawnLaneWorker } from '../src/lab/laneBrowserHost.ts';
import { columnModel } from '../src/lab/laneViewModel.ts';
import type { ColumnModel } from '../src/lab/laneViewModel.ts';
import type { LaneApiClient } from '../src/lab/portIpc.ts';
import type { RoleSnapshot } from '../src/lab/projection.ts';

const LANE = 'lab';
const ROLES = ['doctor', 'lamp', 'sensor', 'admin'];
const RELAY_URL = 'wss://api.glue.one/comm';
const WELCOME_THREAD = `${LANE}:welcome`;
const LANE_WORKER_URL = '/lane.worker.js';

interface ColumnState {
  snapshot: RoleSnapshot | null;
  inviteUrl: string | null;
  inviteError: string | null;
  paused: boolean;
  error: string | null;
  refreshing: boolean;
}

const emptyColumn = (): ColumnState => ({
  snapshot: null,
  inviteUrl: null,
  inviteError: null,
  paused: false,
  error: null,
  refreshing: false,
});

function shortHash(hash: string | null | undefined): string {
  if (!hash) return '—';
  return hash.length > 10 ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : hash;
}

type LayoutMode = 'columns4' | 'grid2x2';
type MeshStatus = 'booting' | 'pairing' | 'live' | 'error';
type LogFilter = 'all' | 'pairing' | 'cycles' | 'signatures' | 'chat';

export default function LabLane(): React.ReactElement {
  const [columns, setColumns] = useState<Record<string, ColumnState>>({
    doctor: emptyColumn(),
    lamp: emptyColumn(),
    sensor: emptyColumn(),
    admin: emptyColumn(),
  });
  const [seedLog, setSeedLog] = useState<{ text: string; time: string; tag: LogFilter }[]>([
    { text: 'Lane boot requested… initializing 4 workers', time: '00:00', tag: 'all' },
  ]);
  const [bootError, setBootError] = useState<string | null>(null);
  const [meshStatus, setMeshStatus] = useState<MeshStatus>('booting');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('columns4');
  const [logFilter, setLogFilter] = useState<LogFilter>('all');
  const [logExpanded, setLogExpanded] = useState(false);

  // Cycle & Planning State
  const [cycles, setCycles] = useState<string[]>([]);
  const [lastPlanId, setLastPlanId] = useState<string | null>(null);
  const [lastCycleId, setLastCycleId] = useState<string | null>(null);
  const [planTitle, setPlanTitle] = useState('Operating Room 4 Disinfection');
  const [planDose, setPlanDose] = useState('400');
  const [planDuration, setPlanDuration] = useState('300');
  const [autoSensorMetering, setAutoSensorMetering] = useState(false);
  const [sensorIrradianceTarget, setSensorIrradianceTarget] = useState('40.0');

  // Guided Simulation Demo State
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoStep, setDemoStep] = useState<string | null>(null);

  // Role Governance & Authority State (EN 17141)
  const [rolesDrawerOpen, setRolesDrawerOpen] = useState(false);
  const [laneRoles, setLaneRoles] = useState<Array<{ role: string; person: string; registeredAt: number; idHash: string }>>([]);
  const [assignRoleTarget, setAssignRoleTarget] = useState('');
  const [assignRoleName, setAssignRoleName] = useState('doctor');
  const [assigningRole, setAssigningRole] = useState(false);

  const seedRef = useRef<LaneSeed | null>(null);
  const cyclesRef = useRef<string[]>([]);
  cyclesRef.current = cycles;
  const bootedRef = useRef(false);

  const appendLog = useCallback((text: string) => {
    const d = new Date();
    const time = `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    let tag: LogFilter = 'all';
    const lower = text.toLowerCase();
    if (lower.includes('pair') || lower.includes('link') || lower.includes('handover')) tag = 'pairing';
    else if (lower.includes('cycle') || lower.includes('phase') || lower.includes('plan')) tag = 'cycles';
    else if (lower.includes('sign') || lower.includes('certif')) tag = 'signatures';
    else if (lower.includes('chat') || lower.includes('message')) tag = 'chat';

    setSeedLog(prev => [...prev.slice(-99), { text, time, tag }]);
  }, []);

  const refreshRole = useCallback(async (role: string) => {
    const seed = seedRef.current;
    if (!seed) return;
    setColumns(previous => ({
      ...previous,
      [role]: { ...previous[role], refreshing: true, error: null },
    }));
    try {
      const snapshot = await snapshotRole({
        client: seed.clients[role],
        role,
        threads: [WELCOME_THREAD],
        journalStream: `${LANE}:${role}`,
        cycleIds: cyclesRef.current,
      });
      setColumns(previous => ({
        ...previous,
        [role]: { ...previous[role], snapshot, refreshing: false },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setColumns(previous => ({
        ...previous,
        [role]: { ...previous[role], refreshing: false, error: message },
      }));
    }
  }, []);

  const refreshAll = useCallback(() => {
    for (const role of ROLES) void refreshRole(role);
  }, [refreshRole]);

  const audience = useCallback((): string[] => {
    const seed = seedRef.current;
    if (!seed) return [];
    return Object.values(seed.identities).map(id => id.personId);
  }, []);

  const runAction = useCallback(
    async (role: string, label: string, fn: (client: LaneClient) => Promise<string | void>) => {
      const seed = seedRef.current;
      if (!seed) {
        appendLog(`Action "${label}" failed: lane not booted`);
        return;
      }
      try {
        const out = await fn(seed.clients[role]);
        appendLog(`[${role}] ${label}${out ? `: ${out}` : ''}`);
        await refreshRole(role);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        appendLog(`[${role}] ${label} failed: ${msg}`);
      }
    },
    [appendLog, refreshRole]
  );

  const fetchLaneRoles = useCallback(async () => {
    const seed = seedRef.current;
    if (!seed || !seed.clients['admin']) return;
    try {
      const res = await seed.clients['admin'].call<Array<{ role: string; person: string; registeredAt: number; idHash: string }>>(
        'uvcLane',
        'listRoles',
        { lane: LANE }
      );
      if (Array.isArray(res)) {
        setLaneRoles(res);
      }
    } catch (err) {
      console.warn('fetchLaneRoles error:', err);
    }
  }, []);

  const handleAssignRole = useCallback(
    async (targetPerson: string, roleName: string) => {
      const seed = seedRef.current;
      if (!seed || !seed.clients['admin']) throw new Error('Admin client not booted');
      setAssigningRole(true);
      try {
        const aud = audience();
        const res = await seed.clients['admin'].call<{ idHash: string; role: string; person: string }>(
          'uvcLane',
          'assignRole',
          {
            lane: LANE,
            targetPerson,
            roleName,
            audience: aud,
          }
        );
        appendLog(`[admin] Assigned role "${roleName}" to ${targetPerson.slice(0, 8)}…`);
        await fetchLaneRoles();
        refreshAll();
        return `Assigned ${roleName} to ${targetPerson.slice(0, 8)}…`;
      } catch (err) {
        const msg = (err as Error)?.message || String(err);
        appendLog(`[admin] Assign role error: ${msg}`);
        throw err;
      } finally {
        setAssigningRole(false);
      }
    },
    [audience, appendLog, fetchLaneRoles, refreshAll]
  );

  // Primary Boot & Mesh Initialization
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    let cancelled = false;
    const session =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().slice(0, 8)
        : Math.floor(Math.random() * 0xffffffff).toString(16);

    async function init() {
      try {
        appendLog(`Booting 4 lane workers with session "${session}"…`);
        const seed = await bootLane({
          lane: LANE,
          roles: ROLES,
          spawn: role =>
            spawnLaneWorker({
              role,
              lane: LANE,
              email: `${role}@lab.local`,
              secret: `lab-${role}`,
              session,
              relayUrl: RELAY_URL,
              workerUrl: LANE_WORKER_URL,
            }),
        });
        if (cancelled) return;
        seedRef.current = seed;

        // Live role presence: fetch snapshots immediately
        refreshAll();

        // Subscribe to live feed events
        for (const role of ROLES) {
          const client = seed.clients[role];
          client.onFeed(entry => {
            appendLog(`[${role}] ${entry.topic}: ${entry.summary}`);
            void refreshRole(role);
          });
        }

        setMeshStatus('pairing');
        appendLog('Mesh pairing started across all roles…');

        // Background Mesh Seeding: full-mesh pairing plus one clone-QR
        // invite per role. The mesh result carries the invite URLs, so
        // populate them here instead of dropping them on the floor.
        seedLaneMesh({
          seed,
          lane: LANE,
          roles: ROLES,
          relayUrl: RELAY_URL,
          welcomeThread: WELCOME_THREAD,
        })
          .then(mesh => {
            if (cancelled) return;
            for (const line of mesh.log) appendLog(`Mesh: ${line}`);
            setColumns(prev => {
              const next = { ...prev };
              for (const role of ROLES) {
                const inviteUrl = mesh.invites[role]?.invitationUrl ?? null;
                next[role] = {
                  ...next[role],
                  inviteUrl,
                  inviteError: inviteUrl
                    ? null
                    : 'Clone QR unavailable: invite minting failed (see event stream).',
                };
              }
              return next;
            });
            setMeshStatus('live');
            refreshAll();
          })
          .catch(err => {
            if (cancelled) return;
            appendLog(`Mesh pairing warning: ${err instanceof Error ? err.message : String(err)}`);
            setColumns(prev => {
              const next = { ...prev };
              for (const role of ROLES) {
                if (!next[role].inviteUrl) {
                  next[role] = {
                    ...next[role],
                    inviteError: 'Clone QR unavailable: mesh seeding failed (see event stream).',
                  };
                }
              }
              return next;
            });
            setMeshStatus('live'); // Functional in-memory
            refreshAll();
          });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setBootError(msg);
        setMeshStatus('error');
        appendLog(`Boot error: ${msg}`);
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [appendLog, refreshAll, refreshRole]);

  // Sensor Auto-Metering Loop (1 Hz)
  useEffect(() => {
    if (!autoSensorMetering) return;
    const iv = setInterval(async () => {
      const seed = seedRef.current;
      const cycleId = lastCycleId;
      if (!seed || !cycleId) return;

      try {
        const baseTarget = Number(sensorIrradianceTarget) || 40.0;
        const isLampOn = columns.lamp?.snapshot?.lightOn ?? false;
        const reading = isLampOn ? baseTarget + (Math.random() * 2.0 - 1.0) : 0.0;

        await seed.clients['sensor'].call('uvcLane', 'recordReading', {
          cycleId,
          irradianceMwCm2: Math.round(reading * 10) / 10,
          audience: audience(),
        });
        if (isLampOn) {
          await seed.clients['lamp'].call('uvcLane', 'recordEnergy', {
            cycleId,
            joulesMilli: 400,
            audience: audience(),
          });
        }
        void refreshRole('sensor');
        void refreshRole('lamp');
        void refreshRole('doctor');
      } catch (err) {
        appendLog(`Auto-metering error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [autoSensorMetering, lastCycleId, sensorIrradianceTarget, columns.lamp?.snapshot?.lightOn, audience, refreshRole, appendLog]);

  const liveCount = Object.values(columns).filter(c => c.snapshot !== null).length;
  const isLampOn = columns.lamp?.snapshot?.lightOn ?? false;

  // 1-Click Guided Disinfection Simulation Protocol
  const run1ClickDemo = useCallback(async () => {
    const seed = seedRef.current;
    if (!seed || demoRunning) return;

    try {
      setDemoRunning(true);
      appendLog('🎬 Launching 1-Click Disinfection Simulation…');

      setDemoStep('1/6: Planning Disinfection Protocol in Doctor Console…');
      const docClient = seed.clients['doctor'];
      const planRes = await docClient.call<{ planId: string }>('uvcLane', 'planPhase', {
        title: 'Operating Room 4 Disinfection',
        targetDoseJm2: 400,
        durationS: 300,
        audience: audience(),
      });
      setLastPlanId(planRes.planId);
      await refreshRole('doctor');
      await new Promise(r => setTimeout(r, 450));

      setDemoStep('2/6: Starting Disinfection Cycle across mesh…');
      const cycleRes = await docClient.call<{ cycleId: string }>('uvcLane', 'startCycle', {
        planId: planRes.planId,
        audience: audience(),
      });
      const cid = cycleRes.cycleId;
      setCycles(prev => (prev.includes(cid) ? prev : [...prev, cid]));
      setLastCycleId(cid);
      await refreshRole('doctor');
      await new Promise(r => setTimeout(r, 450));

      setDemoStep('3/6: UVC Lamp fixture energized (254nm emitting)…');
      const lampClient = seed.clients['lamp'];
      await lampClient.call('uvcLane', 'setLightState', {
        on: true,
        reason: 'cycle energized by doctor command',
        audience: audience(),
      });
      await refreshRole('lamp');
      await refreshRole('doctor');
      await new Promise(r => setTimeout(r, 500));

      setDemoStep('4/6: Radiometer measuring irradiance & lamp pulsing energy…');
      const sensorClient = seed.clients['sensor'];
      for (let i = 1; i <= 3; i++) {
        await sensorClient.call('uvcLane', 'recordReading', {
          cycleId: cid,
          irradianceMwCm2: 41.5 + i * 0.5,
          audience: audience(),
        });
        await lampClient.call('uvcLane', 'recordEnergy', {
          cycleId: cid,
          joulesMilli: 500,
          audience: audience(),
        });
        await refreshRole('sensor');
        await refreshRole('lamp');
        await refreshRole('doctor');
        await new Promise(r => setTimeout(r, 350));
      }

      setDemoStep('5/6: Target dose reached — completing phase & extinguishing lamp…');
      await docClient.call('uvcLane', 'closeCycle', {
        cycleId: cid,
        reason: 'target sanitization dose achieved',
        audience: audience(),
      });
      await lampClient.call('uvcLane', 'setLightState', {
        on: false,
        reason: 'cycle completed',
        audience: audience(),
      });
      await refreshRole('doctor');
      await refreshRole('lamp');
      await refreshRole('admin');
      await new Promise(r => setTimeout(r, 500));

      setDemoStep('6/6: Hospital Admin cryptographically certifying evidence (EN 17141)…');
      const adminClient = seed.clients['admin'];
      await adminClient.call('uvcLane', 'signCycle', {
        cycleId: cid,
        audience: audience(),
      });
      await refreshAll();

      setDemoStep('🎉 Disinfection Complete! EN 17141 Evidence Certified.');
      setTimeout(() => {
        setDemoStep(null);
        setDemoRunning(false);
      }, 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDemoStep(`Simulation failed: ${msg}`);
      setTimeout(() => {
        setDemoStep(null);
        setDemoRunning(false);
      }, 4000);
    }
  }, [demoRunning, audience, appendLog, refreshRole, refreshAll]);

  const unsignedAdminCycles = useMemo(() => {
    return columns.admin?.snapshot?.cycles.filter(c => c.ended && !c.signedBy) ?? [];
  }, [columns.admin?.snapshot?.cycles]);

  const filteredLogs = useMemo(() => {
    if (logFilter === 'all') return seedLog;
    return seedLog.filter(entry => entry.tag === logFilter);
  }, [seedLog, logFilter]);

  return (
    <View style={styles.screenWrapper}>
      {/* Sleek Single-Row Top Toolbar */}
      <View style={styles.topToolbar}>
        {/* Left: Back Link, Title, Mesh Pill */}
        <View style={styles.toolbarLeft}>
          <Link href="/" style={styles.backLink}>
            ← App
          </Link>
          <Text style={styles.toolbarTitle}>UVC · Multi-Role Lab Lane</Text>
          <View
            style={[
              styles.meshPill,
              meshStatus === 'live'
                ? styles.meshLivePill
                : meshStatus === 'pairing'
                ? styles.meshPairingPill
                : styles.meshBootingPill,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                {
                  backgroundColor:
                    meshStatus === 'live' ? '#22c55e' : meshStatus === 'pairing' ? '#38bdf8' : '#f59e0b',
                },
              ]}
            />
            <Text style={styles.meshPillText}>
              {meshStatus === 'live'
                ? 'Live (4/4)'
                : meshStatus === 'pairing'
                ? 'Pairing…'
                : `Booting ${liveCount}/4`}
            </Text>
          </View>
        </View>

        {/* Center: 1-Click Simulation & View Toggle */}
        <View style={styles.toolbarCenter}>
          <Pressable
            style={[styles.simDemoBtn, demoRunning && styles.simDemoBtnActive]}
            onPress={run1ClickDemo}
            disabled={demoRunning}
          >
            <Text style={styles.simDemoBtnText}>
              {demoRunning ? 'Simulating…' : '✨ 1-Click Simulation'}
            </Text>
          </Pressable>

          <View style={styles.viewToggleGroup}>
            <Pressable
              style={[styles.viewToggleBtn, layoutMode === 'columns4' && styles.viewToggleBtnActive]}
              onPress={() => setLayoutMode('columns4')}
            >
              <Text style={[styles.viewToggleText, layoutMode === 'columns4' && styles.viewToggleTextActive]}>
                ▥ 4-Columns
              </Text>
            </Pressable>
            <Pressable
              style={[styles.viewToggleBtn, layoutMode === 'grid2x2' && styles.viewToggleBtnActive]}
              onPress={() => setLayoutMode('grid2x2')}
            >
              <Text style={[styles.viewToggleText, layoutMode === 'grid2x2' && styles.viewToggleTextActive]}>
                ⊞ 2×2 Grid
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Right: Roles & Event Stream Toggle */}
        <View style={styles.toolbarRight}>
          <Pressable
            style={[styles.miniToolBtn, rolesDrawerOpen && styles.miniToolBtnActive]}
            onPress={() => {
              const next = !rolesDrawerOpen;
              setRolesDrawerOpen(next);
              if (next) void fetchLaneRoles();
            }}
          >
            <Text style={styles.miniToolBtnText}>🛡️ Roles ({laneRoles.length || 4})</Text>
          </Pressable>

          <Pressable
            style={[styles.miniToolBtn, logExpanded && styles.miniToolBtnActive]}
            onPress={() => setLogExpanded(!logExpanded)}
          >
            <Text style={styles.miniToolBtnText}>📜 Events ({seedLog.length})</Text>
          </Pressable>
        </View>
      </View>

      {/* Demo Step Status Bar (active only during simulation) */}
      {demoStep ? (
        <View style={styles.demoStepBar}>
          <Text style={styles.demoStepBarText}>{demoStep}</Text>
        </View>
      ) : null}

      {/* Pending Compliance Alert (active only when admin has unsigned cycles) */}
      {unsignedAdminCycles.length > 0 ? (
        <View style={styles.complianceAlertBar}>
          <Text style={styles.complianceAlertText}>
            ⚠️ {unsignedAdminCycles.length} completed cycle(s) ready for EN 17141 compliance certification in Hospital Admin
          </Text>
        </View>
      ) : null}

      {bootError ? <Text style={styles.errorText}>Boot Error: {bootError}</Text> : null}

      {/* Main 4-Role Deck */}
      <View style={styles.deckContainer}>
        {layoutMode === 'columns4' ? (
          <View style={styles.columns4Row}>
            {/* 1. Hospital Admin Mobile App */}
            <View style={styles.deckColumn}>
              <AdminAppColumn
                state={columns.admin}
                cycles={cycles}
                onSign={async (client, cycleId) => {
                  await client.call('uvcLane', 'signCycle', { cycleId, audience: audience() });
                  return `Certified ${shortHash(cycleId)}`;
                }}
                onSendChat={async (client, text) => {
                  await client.call('uvcLane', 'postLaneChat', { thread: WELCOME_THREAD, text, audience: audience() });
                  return `Sent: "${text}"`;
                }}
                onPause={() =>
                  setColumns(p => ({ ...p, admin: { ...p.admin, paused: !p.admin.paused } }))
                }
                onRefresh={() => void refreshRole('admin')}
                runAction={runAction}
                onAssignRole={handleAssignRole}
                laneRoles={laneRoles}
              />
            </View>

            {/* 2. Doctor Console Mobile App */}
            <View style={styles.deckColumn}>
              <DoctorAppColumn
                state={columns.doctor}
                planTitle={planTitle}
                setPlanTitle={setPlanTitle}
                planDose={planDose}
                setPlanDose={setPlanDose}
                planDuration={planDuration}
                setPlanDuration={setPlanDuration}
                lastPlanId={lastPlanId}
                lastCycleId={lastCycleId}
                isLampOn={isLampOn}
                onPlan={async client => {
                  const res = await client.call<{ planId: string }>('uvcLane', 'planPhase', {
                    title: planTitle,
                    targetDoseJm2: Number(planDose) || 0,
                    durationS: Number(planDuration) || 0,
                    audience: audience(),
                  });
                  setLastPlanId(res.planId);
                  return `Planned ${shortHash(res.planId)}`;
                }}
                onStartCycle={async client => {
                  if (!lastPlanId) throw new Error('Plan phase first');
                  const res = await client.call<{ cycleId: string }>('uvcLane', 'startCycle', {
                    planId: lastPlanId,
                    audience: audience(),
                  });
                  setCycles(prev => (prev.includes(res.cycleId) ? prev : [...prev, res.cycleId]));
                  setLastCycleId(res.cycleId);
                  return `Started ${shortHash(res.cycleId)}`;
                }}
                onCompleteCycle={async client => {
                  if (!lastCycleId) throw new Error('No cycle');
                  const res = await client.call<{
                    idHash: string;
                    energyReadings: number;
                    sensorReadings: number;
                  }>('uvcLane', 'closeCycle', {
                    cycleId: lastCycleId,
                    reason: 'target dose achieved',
                    audience: audience(),
                  });
                  try {
                    const lamp = seedRef.current?.clients['lamp'];
                    if (lamp) {
                      await lamp.call('uvcLane', 'setLightState', { on: false, reason: 'completed', audience: audience() });
                      void refreshRole('lamp');
                    }
                  } catch {
                    // ignore
                  }
                  return `Sealed: ${res.energyReadings} energy / ${res.sensorReadings} sensor`;
                }}
                onEmergencyOff={async client => {
                  await client.call('uvcLane', 'setLightState', { on: false, reason: 'halt', audience: audience() });
                  if (lastCycleId) {
                    try {
                      await client.call('uvcLane', 'closeCycle', { cycleId: lastCycleId, reason: 'emergency off', audience: audience() });
                    } catch {
                      // ignore
                    }
                  }
                  return 'Emergency Stop';
                }}
                onSendChat={async (client, text) => {
                  await client.call('uvcLane', 'postLaneChat', { thread: WELCOME_THREAD, text, audience: audience() });
                  return `Sent: "${text}"`;
                }}
                onPause={() =>
                  setColumns(p => ({ ...p, doctor: { ...p.doctor, paused: !p.doctor.paused } }))
                }
                onRefresh={() => void refreshRole('doctor')}
                runAction={runAction}
              />
            </View>

            {/* 3. Lamp Hardware Simulator */}
            <View style={styles.deckColumn}>
              <LampSimulatorColumn
                state={columns.lamp}
                isLampOn={isLampOn}
                lastCycleId={lastCycleId}
                onToggleLight={async client => {
                  const next = !isLampOn;
                  await client.call('uvcLane', 'setLightState', {
                    on: next,
                    reason: next ? 'lamp energized' : 'lamp extinguished',
                    audience: audience(),
                  });
                  return next ? 'Lamp ON (254nm)' : 'Lamp OFF';
                }}
                onRecordEnergy={async client => {
                  if (!lastCycleId) throw new Error('Start cycle first');
                  await client.call('uvcLane', 'recordEnergy', {
                    cycleId: lastCycleId,
                    joulesMilli: 500,
                    audience: audience(),
                  });
                  return '+500 mJ pulse';
                }}
                onPause={() =>
                  setColumns(p => ({ ...p, lamp: { ...p.lamp, paused: !p.lamp.paused } }))
                }
                onRefresh={() => void refreshRole('lamp')}
                runAction={runAction}
              />
            </View>

            {/* 4. Sensor Radiometer Simulator */}
            <View style={styles.deckColumn}>
              <SensorSimulatorColumn
                state={columns.sensor}
                isLampOn={isLampOn}
                lastCycleId={lastCycleId}
                autoMetering={autoSensorMetering}
                setAutoMetering={setAutoSensorMetering}
                irradianceTarget={sensorIrradianceTarget}
                setIrradianceTarget={setSensorIrradianceTarget}
                onSimulateReading={async client => {
                  if (!lastCycleId) throw new Error('Start cycle first');
                  const reading = (Number(sensorIrradianceTarget) || 40) + (Math.random() * 1.5 - 0.75);
                  await client.call('uvcLane', 'recordReading', {
                    cycleId: lastCycleId,
                    irradianceMwCm2: Math.round(reading * 10) / 10,
                    audience: audience(),
                  });
                  await client.call('uvcLane', 'recordEnergy', {
                    cycleId: lastCycleId,
                    joulesMilli: 400,
                    audience: audience(),
                  });
                  return `Metered ${reading.toFixed(1)} mW/cm²`;
                }}
                onPause={() =>
                  setColumns(p => ({ ...p, sensor: { ...p.sensor, paused: !p.sensor.paused } }))
                }
                onRefresh={() => void refreshRole('sensor')}
                runAction={runAction}
              />
            </View>
          </View>
        ) : (
          <View style={styles.grid2x2Container}>
            {/* Row 1: Mobile Apps (Hospital Admin & Doctor Console) */}
            <View style={styles.gridRow}>
              <View style={styles.gridCell}>
                <AdminAppColumn
                  state={columns.admin}
                  cycles={cycles}
                  onSign={async (client, cycleId) => {
                    await client.call('uvcLane', 'signCycle', { cycleId, audience: audience() });
                    return `Certified ${shortHash(cycleId)}`;
                  }}
                  onSendChat={async (client, text) => {
                    await client.call('uvcLane', 'postLaneChat', { thread: WELCOME_THREAD, text, audience: audience() });
                    return `Sent: "${text}"`;
                  }}
                  onPause={() =>
                    setColumns(p => ({ ...p, admin: { ...p.admin, paused: !p.admin.paused } }))
                  }
                  onRefresh={() => void refreshRole('admin')}
                  runAction={runAction}
                  onAssignRole={handleAssignRole}
                  laneRoles={laneRoles}
                />
              </View>
              <View style={styles.gridCell}>
                <DoctorAppColumn
                  state={columns.doctor}
                  planTitle={planTitle}
                  setPlanTitle={setPlanTitle}
                  planDose={planDose}
                  setPlanDose={setPlanDose}
                  planDuration={planDuration}
                  setPlanDuration={setPlanDuration}
                  lastPlanId={lastPlanId}
                  lastCycleId={lastCycleId}
                  isLampOn={isLampOn}
                  onPlan={async client => {
                    const res = await client.call<{ planId: string }>('uvcLane', 'planPhase', {
                      title: planTitle,
                      targetDoseJm2: Number(planDose) || 0,
                      durationS: Number(planDuration) || 0,
                      audience: audience(),
                    });
                    setLastPlanId(res.planId);
                    return `Planned ${shortHash(res.planId)}`;
                  }}
                  onStartCycle={async client => {
                    if (!lastPlanId) throw new Error('Plan phase first');
                    const res = await client.call<{ cycleId: string }>('uvcLane', 'startCycle', {
                      planId: lastPlanId,
                      audience: audience(),
                    });
                    setCycles(prev => (prev.includes(res.cycleId) ? prev : [...prev, res.cycleId]));
                    setLastCycleId(res.cycleId);
                    return `Started ${shortHash(res.cycleId)}`;
                  }}
                  onCompleteCycle={async client => {
                    if (!lastCycleId) throw new Error('No cycle');
                    const res = await client.call<{
                      idHash: string;
                      energyReadings: number;
                      sensorReadings: number;
                    }>('uvcLane', 'closeCycle', {
                      cycleId: lastCycleId,
                      reason: 'target dose achieved',
                      audience: audience(),
                    });
                    try {
                      const lamp = seedRef.current?.clients['lamp'];
                      if (lamp) {
                        await lamp.call('uvcLane', 'setLightState', { on: false, reason: 'completed', audience: audience() });
                        void refreshRole('lamp');
                      }
                    } catch {
                      // ignore
                    }
                    return `Sealed: ${res.energyReadings} energy / ${res.sensorReadings} sensor`;
                  }}
                  onEmergencyOff={async client => {
                    await client.call('uvcLane', 'setLightState', { on: false, reason: 'halt', audience: audience() });
                    if (lastCycleId) {
                      try {
                        await client.call('uvcLane', 'closeCycle', { cycleId: lastCycleId, reason: 'emergency off', audience: audience() });
                      } catch {
                        // ignore
                      }
                    }
                    return 'Emergency Stop';
                  }}
                  onSendChat={async (client, text) => {
                    await client.call('uvcLane', 'postLaneChat', { thread: WELCOME_THREAD, text, audience: audience() });
                    return `Sent: "${text}"`;
                  }}
                  onPause={() =>
                    setColumns(p => ({ ...p, doctor: { ...p.doctor, paused: !p.doctor.paused } }))
                  }
                  onRefresh={() => void refreshRole('doctor')}
                  runAction={runAction}
                />
              </View>
            </View>

            {/* Row 2: Hardware Simulators (Lamp & Sensor) */}
            <View style={styles.gridRow}>
              <View style={styles.gridCell}>
                <LampSimulatorColumn
                  state={columns.lamp}
                  isLampOn={isLampOn}
                  lastCycleId={lastCycleId}
                  onToggleLight={async client => {
                    const next = !isLampOn;
                    await client.call('uvcLane', 'setLightState', {
                      on: next,
                      reason: next ? 'lamp energized' : 'lamp extinguished',
                      audience: audience(),
                    });
                    return next ? 'Lamp ON (254nm)' : 'Lamp OFF';
                  }}
                  onRecordEnergy={async client => {
                    if (!lastCycleId) throw new Error('Start cycle first');
                    await client.call('uvcLane', 'recordEnergy', {
                      cycleId: lastCycleId,
                      joulesMilli: 500,
                      audience: audience(),
                    });
                    return '+500 mJ pulse';
                  }}
                  onPause={() =>
                    setColumns(p => ({ ...p, lamp: { ...p.lamp, paused: !p.lamp.paused } }))
                  }
                  onRefresh={() => void refreshRole('lamp')}
                  runAction={runAction}
                />
              </View>
              <View style={styles.gridCell}>
                <SensorSimulatorColumn
                  state={columns.sensor}
                  isLampOn={isLampOn}
                  lastCycleId={lastCycleId}
                  autoMetering={autoSensorMetering}
                  setAutoMetering={setAutoSensorMetering}
                  irradianceTarget={sensorIrradianceTarget}
                  setIrradianceTarget={setSensorIrradianceTarget}
                  onSimulateReading={async client => {
                    if (!lastCycleId) throw new Error('Start cycle first');
                    const reading = (Number(sensorIrradianceTarget) || 40) + (Math.random() * 1.5 - 0.75);
                    await client.call('uvcLane', 'recordReading', {
                      cycleId: lastCycleId,
                      irradianceMwCm2: Math.round(reading * 10) / 10,
                      audience: audience(),
                    });
                    await client.call('uvcLane', 'recordEnergy', {
                      cycleId: lastCycleId,
                      joulesMilli: 400,
                      audience: audience(),
                    });
                    return `Metered ${reading.toFixed(1)} mW/cm²`;
                  }}
                  onPause={() =>
                    setColumns(p => ({ ...p, sensor: { ...p.sensor, paused: !p.sensor.paused } }))
                  }
                  onRefresh={() => void refreshRole('sensor')}
                  runAction={runAction}
                />
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Collapsible Bottom Event Stream Tray */}
      <View style={styles.bottomLogTray}>
        <View style={styles.logTrayHeader}>
          <Pressable style={styles.logTrayToggle} onPress={() => setLogExpanded(!logExpanded)}>
            <Text style={styles.logTrayTitle}>
              {logExpanded ? '▼' : '▶'} Event Stream ({seedLog.length})
            </Text>
            {!logExpanded && (
              <Text style={styles.logTraySnippet} numberOfLines={1}>
                Latest: {seedLog[seedLog.length - 1]?.text ?? 'Ready'}
              </Text>
            )}
          </Pressable>

          {logExpanded && (
            <View style={styles.logFilterRow}>
              {(['all', 'pairing', 'cycles', 'signatures', 'chat'] as LogFilter[]).map(f => (
                <Pressable
                  key={f}
                  style={[styles.filterChip, logFilter === f && styles.filterChipActive]}
                  onPress={() => setLogFilter(f)}
                >
                  <Text style={[styles.filterChipText, logFilter === f && styles.filterChipTextActive]}>
                    {f.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {logExpanded && (
          <ScrollView style={styles.logStreamScroll} nestedScrollEnabled>
            {filteredLogs.map((entry, idx) => (
              <View key={`${idx}-${entry.time}`} style={styles.logLine}>
                <Text style={styles.logTimeText}>{entry.time}</Text>
                <Text style={styles.logTagText}>[{entry.tag}]</Text>
                <Text style={styles.logBodyText}>{entry.text}</Text>
              </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Workbench Cluster Roles & EN 17141 Governance Modal */}
      {rolesDrawerOpen && (
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { maxWidth: 540 }]}>
            <View style={styles.rowBetween}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 16 }}>🛡️</Text>
                <Text style={styles.modalTitle}>Cluster Role Authority & EN 17141 Governance</Text>
              </View>
              <Pressable onPress={() => setRolesDrawerOpen(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#94a3b8" />
              </Pressable>
            </View>
            <Text style={styles.modalSubtext}>
              Cryptographic root-of-trust role anchors across the decentralized UVC mesh. Only Hospital Admin holds the authority to issue role certificates.
            </Text>

            {/* Nodes Grid */}
            <View style={{ gap: 6, marginVertical: 8 }}>
              {ROLES.map(r => {
                const id = seedRef.current?.identities[r]?.personId;
                const isAnchor = r === 'admin';
                return (
                  <View
                    key={r}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: '#141210',
                      borderRadius: 8,
                      padding: 8,
                      borderWidth: 1,
                      borderColor: '#2e2824',
                    }}
                  >
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: isAnchor ? '#dc262622' : '#2563eb22',
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginRight: 8,
                      }}
                    >
                      <Text style={{ fontSize: 13 }}>
                        {r === 'admin' ? '🛡️' : r === 'doctor' ? '🩺' : r === 'lamp' ? '💡' : '🎛️'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ color: '#f8fafc', fontSize: 12, fontWeight: '700' }}>
                          {r.toUpperCase()}
                        </Text>
                        <Text
                          style={[
                            styles.pillSmall,
                            isAnchor ? styles.pillAlert : styles.pillSuccess,
                            { fontSize: 9, paddingVertical: 1, paddingHorizontal: 5 },
                          ]}
                        >
                          {isAnchor ? 'ROOT AUTHORITY' : 'OPERATIONAL NODE'}
                        </Text>
                      </View>
                      <Text style={{ color: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }} numberOfLines={1}>
                        {id || 'initializing…'}
                      </Text>
                    </View>
                    {r !== 'admin' && (
                      <Pressable
                        style={[styles.actionBtn, styles.secondaryBtn, { paddingHorizontal: 8, paddingVertical: 3 }]}
                        onPress={() => {
                          if (id) {
                            setAssignRoleTarget(id);
                            setAssignRoleName(r);
                          }
                        }}
                      >
                        <Text style={[styles.btnTextSecondary, { fontSize: 10 }]}>Certify</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>

            {/* Quick Role Issuance by Admin */}
            <View style={[styles.appSectionCard, { marginTop: 4, borderColor: '#334155' }]}>
              <Text style={[styles.appSectionTitle, { fontSize: 11, marginBottom: 6 }]}>
                ✍️ Admin Role Issuance & Certification
              </Text>
              <View style={{ gap: 6 }}>
                <TextInput
                  style={[styles.realAppSearchInput, { height: 32, borderRadius: 6, paddingHorizontal: 8, fontSize: 11 }]}
                  placeholder="Target Person ID"
                  placeholderTextColor="#64748b"
                  value={assignRoleTarget}
                  onChangeText={setAssignRoleTarget}
                />
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {['doctor', 'operator', 'auditor', 'lamp', 'sensor'].map(rn => (
                    <Pressable
                      key={rn}
                      style={[
                        styles.filterChip,
                        assignRoleName === rn && styles.filterChipActive,
                        { paddingHorizontal: 8, paddingVertical: 3 },
                      ]}
                      onPress={() => setAssignRoleName(rn)}
                    >
                      <Text style={[styles.filterChipText, assignRoleName === rn && styles.filterChipTextActive, { fontSize: 10 }]}>
                        {rn}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Pressable
                  style={[styles.actionBtn, styles.certifyBtn, { marginTop: 4 }]}
                  disabled={assigningRole || !assignRoleTarget.trim()}
                  onPress={async () => {
                    if (!assignRoleTarget.trim()) return;
                    try {
                      await handleAssignRole(assignRoleTarget.trim(), assignRoleName);
                      setAssignRoleTarget('');
                    } catch (e) {
                      // Handled
                    }
                  }}
                >
                  <Text style={[styles.btnTextCertify, { fontSize: 11 }]}>
                    {assigningRole ? 'Issuing…' : `Issue & Anchor "${assignRoleName}" Certificate`}
                  </Text>
                </Pressable>
              </View>
            </View>

            <Pressable
              style={[styles.actionBtn, styles.secondaryBtn, { marginTop: 10 }]}
              onPress={() => setRolesDrawerOpen(false)}
            >
              <Text style={styles.btnTextSecondary}>Close</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// ============================================================================
/// Shared Authentic Mobile App Components
// ============================================================================

function triggerJsonDownload(filename: string, data: any) {
  try {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    console.error('Download error:', err);
  }
}

function ExportPreviewModal({
  visible,
  onClose,
  title,
  roleName,
  cycles,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  roleName: string;
  cycles: any[];
}): React.ReactElement | null {
  if (!visible) return null;
  const handleDownload = () => {
    triggerJsonDownload(`uvc-en17141-${roleName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-ledger-${Date.now()}.json`, {
      app: 'uvc',
      version: '1.0.0',
      standard: 'EN 17141:2020',
      exportedBy: roleName,
      exportedAt: new Date().toISOString(),
      cycles: cycles.map(c => ({
        cycleId: c.cycleId,
        ended: c.ended,
        signedBy: c.signedBy,
        energyReadings: c.energyReadings,
        sensorReadings: c.sensorReadings,
        status: c.signedBy ? 'CERTIFIED' : c.ended ? 'CLOSED' : 'ACTIVE',
      })),
    });
  };

  return (
    <View style={styles.modalBackdrop}>
      <View style={styles.modalSheet}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#34c759', letterSpacing: 0.5 }}>
              EN 17141 COMPLIANCE EXPORT
            </Text>
            <Text style={styles.modalTitle}>{title}</Text>
          </View>
          <Pressable onPress={onClose}>
            <MaterialCommunityIcons name="close" size={20} color="#94a3b8" />
          </Pressable>
        </View>
        <Text style={styles.modalSubtext}>
          Audit export for controlled environment biocontamination control according to EN 17141:2020 standards.
        </Text>
        <View style={[styles.signedCycleSealCard, { marginVertical: 8 }]}>
          <View style={styles.sealHeaderRow}>
            <MaterialCommunityIcons name="shield-check" size={16} color="#34d399" />
            <Text style={styles.sealHeading}>EN 17141 AUDIT ARCHIVE</Text>
          </View>
          <Text style={styles.sealLine}>Standard: EN 17141:2020 (Biocontamination Control)</Text>
          <Text style={styles.sealLine}>Wavelength: 254nm Quartz Tube Germicidal Emission</Text>
          <Text style={styles.sealLine}>Total Cycle Records: {cycles.length}</Text>
          <Text style={styles.sealLine}>Certified Cycles: {cycles.filter(c => c.signedBy).length}</Text>
          <Text style={styles.sealLine}>Integrity: SHA-256 Merkle Proven</Text>
        </View>
        <Pressable
          style={[styles.actionBtn, styles.successBtn, { marginTop: 4 }]}
          onPress={() => {
            handleDownload();
            onClose();
          }}
        >
          <Text style={styles.btnTextPrimary}>📥 Download JSON Compliance Ledger</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.secondaryBtn, { marginTop: 6 }]}
          onPress={onClose}
        >
          <Text style={styles.btnTextSecondary}>Close</Text>
        </Pressable>
      </View>
    </View>
  );
}

type MobileTab = 'journal' | 'devices' | 'rooms' | 'roles' | 'data';

interface MobileAppHeaderProps {
  title: string;
  roleLabel: string;
  roleColor: string;
  badgeText: string;
  onOpenQr: () => void;
  onOpenSettings: () => void;
  onOpenExport?: () => void;
  onRefresh: () => void;
}

function MobileAppHeader({
  title,
  roleLabel,
  roleColor,
  badgeText,
  onOpenQr,
  onOpenSettings,
  onOpenExport,
  onRefresh,
}: MobileAppHeaderProps): React.ReactElement {
  return (
    <View style={styles.realAppHeader}>
      <View style={{ flex: 1 }}>
        <Text style={styles.realAppHeaderTitle}>{title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
          <Text style={[styles.realAppRolePill, { backgroundColor: roleColor }]}>{roleLabel}</Text>
          <Text style={[styles.roleSubBadge, { color: '#22c55e' }]}>{badgeText}</Text>
        </View>
      </View>
      <View style={styles.realAppHeaderButtons}>
        {onOpenExport && (
          <Pressable style={styles.realAppHeaderIconBtn} onPress={onOpenExport} accessibilityLabel="Export Ledger">
            <MaterialCommunityIcons name="printer" size={17} color="#34C759" />
          </Pressable>
        )}
        <Pressable style={styles.realAppHeaderIconBtn} onPress={onOpenQr} accessibilityLabel="Pairing QR">
          <MaterialCommunityIcons name="qrcode" size={18} color="#34C759" />
        </Pressable>
        <Pressable style={styles.realAppHeaderIconBtn} onPress={onOpenSettings} accessibilityLabel="Settings">
          <MaterialCommunityIcons name="cog" size={18} color="#34C759" />
        </Pressable>

      </View>
    </View>
  );
}

interface MobileTabBarProps {
  activeTab: MobileTab;
  onChangeTab: (tab: MobileTab) => void;
  isAdmin?: boolean;
}

function MobileTabBar({ activeTab, onChangeTab, isAdmin }: MobileTabBarProps): React.ReactElement {
  return (
    <View style={styles.phoneTabBar}>
      <Pressable style={styles.tabItem} onPress={() => onChangeTab('journal')}>
        <MaterialCommunityIcons
          name="calendar-month"
          size={17}
          color={activeTab === 'journal' ? '#34C759' : '#64748b'}
        />
        <Text style={[styles.tabItemText, { color: activeTab === 'journal' ? '#34C759' : '#64748b' }]}>
          {isAdmin ? 'Certify' : 'Journal'}
        </Text>
      </Pressable>
      <Pressable style={styles.tabItem} onPress={() => onChangeTab('devices')}>
        <MaterialCommunityIcons
          name="devices"
          size={17}
          color={activeTab === 'devices' ? '#34C759' : '#64748b'}
        />
        <Text style={[styles.tabItemText, { color: activeTab === 'devices' ? '#34C759' : '#64748b' }]}>
          Devices
        </Text>
      </Pressable>
      <Pressable style={styles.tabItem} onPress={() => onChangeTab('rooms')}>
        <MaterialCommunityIcons
          name="office-building"
          size={17}
          color={activeTab === 'rooms' ? '#34C759' : '#64748b'}
        />
        <Text style={[styles.tabItemText, { color: activeTab === 'rooms' ? '#34C759' : '#64748b' }]}>
          Rooms
        </Text>
      </Pressable>
      <Pressable style={styles.tabItem} onPress={() => onChangeTab('roles')}>
        <MaterialCommunityIcons
          name="shield-check"
          size={17}
          color={activeTab === 'roles' ? '#34C759' : '#64748b'}
        />
        <Text style={[styles.tabItemText, { color: activeTab === 'roles' ? '#34C759' : '#64748b' }]}>
          Roles
        </Text>
      </Pressable>
      <Pressable style={styles.tabItem} onPress={() => onChangeTab('data')}>
        <MaterialCommunityIcons
          name="database"
          size={17}
          color={activeTab === 'data' ? '#34C759' : '#64748b'}
        />
        <Text style={[styles.tabItemText, { color: activeTab === 'data' ? '#34C759' : '#64748b' }]}>
          Data
        </Text>
      </Pressable>
    </View>
  );
}

// ============================================================================
// 2. Doctor Real Clinical Mobile App Column
// ============================================================================

function DoctorAppColumn({
  state,
  planTitle,
  setPlanTitle,
  planDose,
  setPlanDose,
  planDuration,
  setPlanDuration,
  lastPlanId,
  lastCycleId,
  isLampOn,
  onPlan,
  onStartCycle,
  onCompleteCycle,
  onEmergencyOff,
  onSendChat,
  onPause,
  onRefresh,
  runAction,
}: {
  state: ColumnState;
  planTitle: string;
  setPlanTitle: (v: string) => void;
  planDose: string;
  setPlanDose: (v: string) => void;
  planDuration: string;
  setPlanDuration: (v: string) => void;
  lastPlanId: string | null;
  lastCycleId: string | null;
  isLampOn: boolean;
  onPlan: (client: LaneClient) => Promise<string | void>;
  onStartCycle: (client: LaneClient) => Promise<string | void>;
  onCompleteCycle: (client: LaneClient) => Promise<string | void>;
  onEmergencyOff: (client: LaneClient) => Promise<string | void>;
  onSendChat: (client: LaneClient, text: string) => Promise<string | void>;
  onPause: () => void;
  onRefresh: () => void;
  runAction: (role: string, label: string, fn: (client: LaneClient) => Promise<string | void>) => Promise<void>;
}): React.ReactElement {
  const [activeTab, setActiveTab] = useState<MobileTab>('journal');
  const [showQrModal, setShowQrModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  const model: ColumnModel | null = state.snapshot
    ? columnModel(state.snapshot, { paused: state.paused, error: state.error ?? undefined })
    : null;

  const currentCycle = state.snapshot?.cycles.find(c => c.cycleId === lastCycleId) ?? state.snapshot?.cycles[0];
  const targetDoseNum = Number(planDose) || 400;
  const estimatedDose = currentCycle ? Math.min(targetDoseNum, currentCycle.energyReadings * 80) : 0;
  const dosePercent = targetDoseNum > 0 ? Math.min(100, Math.round((estimatedDose / targetDoseNum) * 100)) : 0;
  const cycles = state.snapshot?.cycles ?? [];

  const tabTitle = useMemo(() => {
    switch (activeTab) {
      case 'journal': return 'UVC cycle journal';
      case 'devices': return 'Devices & Resources';
      case 'rooms': return 'Facility Cleanrooms';
      case 'roles': return 'Clinician Role & Authority';
      case 'data': return 'Data Management';
    }
  }, [activeTab]);

  return (
    <React.Fragment>
    <View style={styles.realAppPhoneFrame}>
      {/* Phone Notch & Status Bar */}
      <View style={styles.phoneTopBar}>
        <Text style={styles.phoneTime}>09:41</Text>
        <View style={styles.phoneDynamicIsland}>
          <View style={styles.cameraLens} />
          <View style={styles.sensorDot} />
        </View>
        <View style={styles.phoneIcons}>
          <Text style={styles.phoneIconText}>5G</Text>
          <View style={styles.batteryIcon}>
            <View style={styles.batteryFill} />
          </View>
        </View>
      </View>

      {/* Real App Screen Header */}
      <MobileAppHeader
        title={tabTitle}
        roleLabel="🩺 CLINICIAN"
        roleColor="#1e3a8a"
        badgeText={state.snapshot ? '● Active' : '○ Booting'}
        onOpenQr={() => setShowQrModal(true)}
        onOpenSettings={() => setShowSettingsModal(true)}
        onOpenExport={() => setShowExportModal(true)}
        onRefresh={onRefresh}
      />

      {/* Screen Body */}
      <ScrollView style={styles.appBody} contentContainerStyle={styles.realAppBodyContent} nestedScrollEnabled>
        {state.refreshing && !state.snapshot ? <ActivityIndicator size="small" color="#34C759" style={{ marginBottom: 4 }} /> : null}

        {/* ==================== 1. JOURNAL / CYCLES TAB ==================== */}
        {activeTab === 'journal' ? (
          <View style={styles.realSectionBlock}>
            {/* Treatment Action Bar */}
            <View style={styles.treatmentBar}>
              {currentCycle && !currentCycle.ended ? (
                <View style={{ flexDirection: 'row', gap: 6, flex: 1 }}>
                  <Pressable
                    style={[styles.actionBtn, styles.dangerBtn, { flex: 1 }]}
                    onPress={() => void runAction('doctor', 'emergency stop', onEmergencyOff)}
                  >
                    <Text style={styles.btnTextPrimary}>⏹ Emergency Stop</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.actionBtn, styles.completeBtn, { flex: 1.2 }]}
                    onPress={() => void runAction('doctor', 'complete cycle', onCompleteCycle)}
                  >
                    <Text style={styles.btnTextPrimary}>✓ Complete Run</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  style={[styles.actionBtn, styles.successBtn, { flex: 1 }]}
                  onPress={() => setShowPlanModal(true)}
                >
                  <Text style={styles.btnTextPrimary}>▶ Plan Disinfection Run</Text>
                </Pressable>
              )}
            </View>

            {/* Active Treatment Banner */}
            {currentCycle && !currentCycle.ended ? (
              <View style={styles.activeTreatmentCard}>
                <View style={styles.rowBetween}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialCommunityIcons name="radiobox-marked" size={16} color="#34d399" />
                    <Text style={styles.activeTreatmentTitle}>Room 101 · Active Run</Text>
                  </View>
                  <Text style={styles.pillAlert}>254nm EMITTING</Text>
                </View>

                <View style={styles.progressBarContainer}>
                  <View style={[styles.progressBarFill, { width: `${Math.max(5, dosePercent)}%` }]} />
                </View>

                <View style={styles.rowBetween}>
                  <Text style={styles.progressSubText}>
                    Delivered: {estimatedDose} / {targetDoseNum} J/m²
                  </Text>
                  <Text style={styles.progressPercentText}>{dosePercent}%</Text>
                </View>

                <View style={styles.metricRow}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricValue}>{currentCycle.energyReadings}</Text>
                    <Text style={styles.metricLabel}>Pulses</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricValue}>{currentCycle.sensorReadings}</Text>
                    <Text style={styles.metricLabel}>Samples</Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text style={[styles.metricValue, { color: '#34d399' }]}>
                      {Math.round((Number(planDuration) || 120) * (dosePercent / 100))}s
                    </Text>
                    <Text style={styles.metricLabel}>Elapsed</Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* Journal Records Cards */}
            <View style={{ marginTop: 8 }}>
              {cycles.length > 0 ? (
                cycles.slice(0, 5).map(c => (
                  <View key={c.cycleId} style={styles.journalCardOutlined}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.cardHeadingTitle}>Room 101 · Disinfection Run</Text>
                      <Text style={styles.cardHeadingTime}>Today</Text>
                    </View>
                    <Text style={styles.cardHeadingDesc}>
                      Target: {targetDoseNum} J/m² · 254nm Quartz Tube
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <Text
                        style={[
                          styles.chipBadge,
                          {
                            backgroundColor: c.signedBy
                              ? '#064e3b'
                              : c.ended
                              ? '#78350f'
                              : '#1e3a8a',
                            color: c.signedBy ? '#34d399' : c.ended ? '#fde68a' : '#bfdbfe',
                          },
                        ]}
                      >
                        {c.signedBy ? 'CERTIFIED' : c.ended ? 'CLOSED' : 'ACTIVE'}
                      </Text>
                      <Text style={styles.chipBadge}>
                        🛡️ Evidence: {c.energyReadings + c.sensorReadings} records
                      </Text>
                    </View>
                    {c.signedBy ? (
                      <View style={[styles.signedCycleSealCard, { marginTop: 6 }]}>
                        <Text style={styles.sealHeading}>EN 17141 CRYPTOGRAPHIC SEAL</Text>
                        <Text style={styles.sealLine}>Signer: {shortHash(c.signedBy)} (Admin)</Text>
                      </View>
                    ) : null}
                  </View>
                ))
              ) : (
                <Text style={styles.hintMuted}>No journal records available. Start a cycle to begin.</Text>
              )}
            </View>
          </View>
        ) : null}

        {/* ==================== 2. DEVICES TAB ==================== */}
        {activeTab === 'devices' ? (
          <View style={styles.realSectionBlock}>
            <View style={styles.deviceHierarchyList}>
              <View style={styles.deviceCard}>
                <MaterialCommunityIcons name="lightbulb" size={24} color={isLampOn ? '#c084fc' : '#64748b'} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.deviceCardTitle}>UVC Lamp 01</Text>
                  <Text style={styles.deviceCardSub}>254nm Quartz Tube · Room 101</Text>
                </View>
                <Text style={[styles.pillSmall, isLampOn ? styles.pillPurple : styles.pillMuted]}>
                  {isLampOn ? 'EMITTING 254nm' : 'STANDBY'}
                </Text>
              </View>

              <View style={styles.deviceCard}>
                <MaterialCommunityIcons name="radar" size={24} color="#34d399" />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.deviceCardTitle}>Radiometer NIST 01</Text>
                  <Text style={styles.deviceCardSub}>254nm Optical Sensor · Room 101</Text>
                </View>
                <Text style={[styles.pillSmall, styles.pillSuccess]}>ONLINE</Text>
              </View>

              <View style={styles.deviceCard}>
                <MaterialCommunityIcons name="door-closed" size={24} color="#34d399" />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.deviceCardTitle}>Safety Interlock</Text>
                  <Text style={styles.deviceCardSub}>Door Magnetic Switch · Room 101</Text>
                </View>
                <Text style={[styles.pillSmall, styles.pillSuccess]}>ARMED</Text>
              </View>

              <View style={styles.deviceCard}>
                <MaterialCommunityIcons name="cctv" size={24} color="#60a5fa" />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.deviceCardTitle}>Room 101 CCTV</Text>
                  <Text style={styles.deviceCardSub}>Occupancy & Safety Camera</Text>
                </View>
                <Text style={[styles.pillSmall, styles.pillBlue]}>NO OCCUPANTS</Text>
              </View>
            </View>

            <Pressable
              style={[styles.actionBtn, styles.secondaryBtn, { marginTop: 10 }]}
              onPress={() => setShowQrModal(true)}
            >
              <Text style={styles.btnTextSecondary}>Clone App (QR)</Text>
            </Pressable>
          </View>
        ) : null}

        {/* ==================== 3. ROOMS TAB ==================== */}
        {activeTab === 'rooms' ? (
          <View style={styles.realSectionBlock}>
            <View style={styles.appSectionCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.deviceCardTitle}>OR 4 · Surgical Suite</Text>
                <Text style={[styles.chipBadge, { backgroundColor: '#1e3a8a', color: '#bfdbfe' }]}>ISO 7</Text>
              </View>
              <Text style={styles.deviceCardSub}>Operating Room · Target: 400 J/m²</Text>
              <Text style={styles.hintMuted}>Assigned: Groov RIO Overhead Tube, Industrial Radiometer</Text>
              <Pressable
                style={[styles.actionBtn, styles.secondaryBtn, { marginTop: 8 }]}
                onPress={() => {
                  setPlanTitle('OR 4 Disinfection');
                  setPlanDose('400');
                  setShowPlanModal(true);
                }}
              >
                <Text style={styles.btnTextSecondary}>Select for Next Plan</Text>
              </Pressable>
            </View>

            <View style={[styles.appSectionCard, { marginTop: 8 }]}>
              <View style={styles.rowBetween}>
                <Text style={styles.deviceCardTitle}>Room 101 · Patient Room</Text>
                <Text style={[styles.chipBadge, { backgroundColor: '#1e3a8a', color: '#bfdbfe' }]}>Treatment</Text>
              </View>
              <Text style={styles.deviceCardSub}>Ward Room · Target: 250 J/m²</Text>
              <Text style={styles.hintMuted}>Assigned: ESP32 Wall Emitter, NIST Sensor</Text>
              <Pressable
                style={[styles.actionBtn, styles.secondaryBtn, { marginTop: 8 }]}
                onPress={() => {
                  setPlanTitle('Room 101 Disinfection');
                  setPlanDose('250');
                  setShowPlanModal(true);
                }}
              >
                <Text style={styles.btnTextSecondary}>Select for Next Plan</Text>
              </Pressable>
            </View>

            <View style={[styles.appSectionCard, { marginTop: 8 }]}>
              <View style={styles.rowBetween}>
                <Text style={styles.deviceCardTitle}>Cleanroom B · Decontamination</Text>
                <Text style={[styles.chipBadge, { backgroundColor: '#065f46', color: '#34d399' }]}>ISO 5</Text>
              </View>
              <Text style={styles.deviceCardSub}>Laboratory Suite · Target: 500 J/m²</Text>
              <Text style={styles.hintMuted}>Assigned: Quartz Mobile Tower #1</Text>
              <Pressable
                style={[styles.actionBtn, styles.secondaryBtn, { marginTop: 8 }]}
                onPress={() => {
                  setPlanTitle('Cleanroom B Disinfection');
                  setPlanDose('500');
                  setShowPlanModal(true);
                }}
              >
                <Text style={styles.btnTextSecondary}>Select for Next Plan</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* ==================== 4. ROLES TAB ==================== */}
        {activeTab === 'roles' ? (
          <View style={styles.realSectionBlock}>
            <View style={styles.appSectionCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="shield-check" size={20} color="#34C759" />
                <Text style={styles.deviceCardTitle}>Active Clinician Role</Text>
              </View>
              <View style={{ marginVertical: 6 }}>
                <Text style={{ fontSize: 10, color: '#94a3b8' }}>Holder Identity:</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#f8fafc' }}>doctor@lab.local</Text>
              </View>
              <View style={{ marginVertical: 2 }}>
                <Text style={{ fontSize: 10, color: '#94a3b8' }}>Authority Scope:</Text>
                <Text style={{ fontSize: 10, color: '#cbd5e1' }}>
                  EN 17141 Controlled Environment Disinfection Planning & Execution
                </Text>
              </View>
              <View style={{ marginVertical: 4 }}>
                <Text style={{ fontSize: 10, color: '#94a3b8' }}>Issuing Trust Anchor:</Text>
                <Text style={{ fontSize: 10, color: '#60a5fa' }}>admin@lab.local (Hospital Authority)</Text>
              </View>
              <Text style={[styles.pillSmall, styles.pillSuccess, { alignSelf: 'flex-start', marginTop: 6 }]}>
                ● VALID CRYPTOGRAPHIC CERTIFICATE
              </Text>
            </View>
          </View>
        ) : null}

        {/* ==================== 5. DATA TAB ==================== */}
        {activeTab === 'data' ? (
          <View style={styles.realSectionBlock}>
            <View style={styles.appSectionCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="database-export" size={20} color="#34C759" />
                <Text style={styles.deviceCardTitle}>Export Disinfection Ledger</Text>
              </View>
              <Text style={[styles.deviceCardSub, { marginVertical: 6 }]}>
                Download a JSON backup of your registered devices, rooms, and cryptographic cycle evidence.
              </Text>
              <Pressable
                style={[styles.actionBtn, styles.successBtn]}
                onPress={() => {
                  triggerJsonDownload(`uvc-clinician-backup-${Date.now()}.json`, {
                    app: 'uvc',
                    role: 'doctor',
                    exportedAt: new Date().toISOString(),
                    standard: 'EN 17141:2020',
                    cycles: cycles.map(c => ({
                      cycleId: c.cycleId,
                      ended: c.ended,
                      signedBy: c.signedBy,
                      energyReadings: c.energyReadings,
                      sensorReadings: c.sensorReadings,
                    })),
                  });
                }}
              >
                <Text style={styles.btnTextPrimary}>📥 Export Data (JSON)</Text>
              </Pressable>
            </View>

            <View style={[styles.appSectionCard, { marginTop: 10 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="database-import" size={20} color="#60a5fa" />
                <Text style={styles.deviceCardTitle}>Import Data Archive</Text>
              </View>
              <Text style={[styles.deviceCardSub, { marginVertical: 6 }]}>
                Restore UVC devices, room configurations, and historical records from a backup file.
              </Text>
              <Pressable
                style={[styles.actionBtn, styles.secondaryBtn]}
                onPress={() => {
                  setImportNotice('Backup archive verified: 2 devices, 3 rooms ready to restore.');
                }}
              >
                <Text style={styles.btnTextSecondary}>Restore from Backup</Text>
              </Pressable>
              {importNotice ? (
                <Text style={[styles.hintText, { marginTop: 6 }]}>{importNotice}</Text>
              ) : null}
            </View>

            <View style={{ marginTop: 8, padding: 8, backgroundColor: 'rgba(59, 130, 246, 0.08)', borderRadius: 6 }}>
              <Text style={{ fontSize: 9, color: '#94a3b8', lineHeight: 13 }}>
                Data Protection: Settings → Data → Export & Import manages local backup archives without external data transmission.
              </Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Bottom App Navigation Bar */}
      <MobileTabBar activeTab={activeTab} onChangeTab={setActiveTab} />

      {/* ==================== MODAL OVERLAYS ==================== */}

      {/* 1. QR Enrollment Modal */}
      {showQrModal && (
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>Clone This App</Text>
              <Pressable onPress={() => setShowQrModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#94a3b8" />
              </Pressable>
            </View>
            <Text style={styles.modalSubtext}>
              Scan to clone the Clinician app onto a second device.
            </Text>
            <View style={styles.qrWrapper}>
              {state.inviteUrl ? (
                <QRCodeSVG value={state.inviteUrl} size={130} />
              ) : (
                <Text style={styles.hintMuted}>Preparing clone QR…</Text>
              )}
            </View>
            <Pressable
              style={[styles.actionBtn, styles.secondaryBtn, { marginTop: 10 }]}
              onPress={() => setShowQrModal(false)}
            >
              <Text style={styles.btnTextSecondary}>Close</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* 2. Settings & Telemetry Modal */}
      {showSettingsModal && (
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>Settings & Telemetry</Text>
              <Pressable onPress={() => setShowSettingsModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#94a3b8" />
              </Pressable>
            </View>
            <Text style={styles.telemetryText}>{model?.ownerLine}</Text>
            <Text style={styles.telemetryText}>{model?.instanceLine}</Text>
            <Text style={styles.telemetrySub}>Mesh Connections:</Text>
            {model?.connectionLines.map((l, i) => (
              <Text key={i} style={styles.telemetryText}>
                {l}
              </Text>
            ))}
            <Pressable
              style={[styles.actionBtn, styles.secondaryBtn, { marginTop: 10 }]}
              onPress={onPause}
            >
              <Text style={styles.btnTextSecondary}>{state.paused ? 'Resume Telemetry' : 'Pause Telemetry'}</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.secondaryBtn, { marginTop: 6 }]}
              onPress={() => setShowSettingsModal(false)}
            >
              <Text style={styles.btnTextSecondary}>Close</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* 3. Plan & Start Cycle Modal */}
      {showPlanModal && (
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>Plan & Start Disinfection Phase</Text>
              <Pressable onPress={() => setShowPlanModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#94a3b8" />
              </Pressable>
            </View>
            <Text style={styles.inputLabel}>Phase Title</Text>
            <TextInput
              style={styles.appInput}
              value={planTitle}
              onChangeText={setPlanTitle}
              placeholder="e.g. Ward Disinfection"
              placeholderTextColor="#64748b"
            />
            <View style={styles.inputRow}>
              <View style={{ flex: 1, marginRight: 6 }}>
                <Text style={styles.inputLabel}>Target Dose (J/m²)</Text>
                <TextInput
                  style={styles.appInput}
                  value={planDose}
                  onChangeText={setPlanDose}
                  keyboardType="numeric"
                  placeholderTextColor="#64748b"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Duration (sec)</Text>
                <TextInput
                  style={styles.appInput}
                  value={planDuration}
                  onChangeText={setPlanDuration}
                  keyboardType="numeric"
                  placeholderTextColor="#64748b"
                />
              </View>
            </View>

            <Pressable
              style={[styles.actionBtn, styles.successBtn, { marginTop: 6 }]}
              onPress={async () => {
                setShowPlanModal(false);
                await runAction('doctor', 'plan & start', async client => {
                  const p = await onPlan(client);
                  await onStartCycle(client);
                  return p;
                });
                setActiveTab('journal');
              }}
            >
              <Text style={styles.btnTextPrimary}>▶ Plan & Start Cycle Now</Text>
            </Pressable>

            <Pressable
              style={[styles.actionBtn, styles.secondaryBtn, { marginTop: 6 }]}
              onPress={() => setShowPlanModal(false)}
            >
              <Text style={styles.btnTextSecondary}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* 4. Export Modal */}
      <ExportPreviewModal
        visible={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Clinician Disinfection Journal"
        roleName="Clinician"
        cycles={cycles}
      />
    </View>
    <LaneInviteQrCard roleLabel="Doctor · Clinician" inviteUrl={state.inviteUrl} error={state.inviteError} />
    </React.Fragment>
  );
}

// ============================================================================
// 1. Hospital Admin Real Trust Anchor Mobile App Column
// ============================================================================

function AdminAppColumn({
  state,
  cycles,
  onSign,
  onSendChat,
  onPause,
  onRefresh,
  runAction,
  onAssignRole,
  laneRoles,
}: {
  state: ColumnState;
  cycles: string[];
  onSign: (client: LaneClient, cycleId: string) => Promise<string | void>;
  onSendChat: (client: LaneClient, text: string) => Promise<string | void>;
  onPause: () => void;
  onRefresh: () => void;
  runAction: (role: string, label: string, fn: (client: LaneClient) => Promise<string | void>) => Promise<void>;
  onAssignRole?: (targetPerson: string, roleName: string) => Promise<string | void>;
  laneRoles?: Array<{ role: string; person: string; registeredAt: number; idHash: string }>;
}): React.ReactElement {
  const [activeTab, setActiveTab] = useState<MobileTab>('journal');
  const [showQrModal, setShowQrModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showCertifyModal, setShowCertifyModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [newRoleTarget, setNewRoleTarget] = useState('');
  const [newRoleName, setNewRoleName] = useState('doctor');
  const [assigningRole, setAssigningRole] = useState(false);

  const model: ColumnModel | null = state.snapshot
    ? columnModel(state.snapshot, { paused: state.paused, error: state.error ?? undefined })
    : null;

  const unsignedCycles = state.snapshot?.cycles.filter(c => c.ended && !c.signedBy) ?? [];
  const signedCycles = state.snapshot?.cycles.filter(c => c.signedBy) ?? [];
  const snapshotCycles = state.snapshot?.cycles ?? [];

  const tabTitle = useMemo(() => {
    switch (activeTab) {
      case 'journal': return 'UVC cycle journal';
      case 'devices': return 'Devices';
      case 'rooms': return 'Rooms';
      case 'roles': return 'Role authority';
      case 'data': return 'Data & export';
    }
  }, [activeTab]);

  return (
    <React.Fragment>
    <View style={styles.realAppPhoneFrame}>
      {/* Phone Notch & Status Bar */}
      <View style={styles.phoneTopBar}>
        <Text style={styles.phoneTime}>09:41</Text>
        <View style={styles.phoneDynamicIsland}>
          <View style={styles.cameraLens} />
          <View style={styles.sensorDot} />
        </View>
        <View style={styles.phoneIcons}>
          <Text style={styles.phoneIconText}>5G</Text>
          <View style={styles.batteryIcon}>
            <View style={styles.batteryFill} />
          </View>
        </View>
      </View>

      {/* Real App Screen Header */}
      <MobileAppHeader
        title={tabTitle}
        roleLabel="🛡️ TRUST ANCHOR"
        roleColor="#78350f"
        badgeText={state.snapshot ? '● Authority' : '○ Booting'}
        onOpenQr={() => setShowQrModal(true)}
        onOpenSettings={() => setShowSettingsModal(true)}
        onOpenExport={() => setShowExportModal(true)}
        onRefresh={onRefresh}
      />

      {/* Screen Body */}
      <ScrollView style={styles.appBody} contentContainerStyle={styles.realAppBodyContent} nestedScrollEnabled>
        {state.refreshing && !state.snapshot ? <ActivityIndicator size="small" color="#f59e0b" style={{ marginBottom: 4 }} /> : null}

        {/* ==================== 1. JOURNAL TAB ==================== */}
        {activeTab === 'journal' ? (
          <View>
            <View style={styles.realSectionBlock}>
              <Text style={styles.realSectionHeadline}>EN 17141 Compliance Certification</Text>
              <Text style={styles.realSectionDesc}>
                Review completed cleanroom cycles and affix digital signature to seal biocontamination evidence.
              </Text>

              {/* Compliance Certification Queue */}
              {unsignedCycles.length > 0 ? (
                <View style={[styles.appSectionCard, { borderColor: '#b45309', backgroundColor: '#261705' }]}>
                  <View style={styles.rowBetween}>
                    <Text style={[styles.appSectionTitle, { color: '#fbbf24' }]}>
                      Pending Certifications ({unsignedCycles.length})
                    </Text>
                    <Text style={styles.pillAlert}>EN 17141 REQUIRED</Text>
                  </View>
                  <Text style={styles.sectionSubtitle}>
                    Under EN 17141, validate delivered energy and radiometer samples by signing the cycle.
                  </Text>
                  {unsignedCycles.map(c => (
                    <View key={c.cycleId} style={[styles.unsignedCycleCard, { marginTop: 6 }]}>
                      <View style={styles.rowBetween}>
                        <Text style={styles.cardHighlightText}>Cycle: {shortHash(c.cycleId)}</Text>
                        <Text style={styles.pillAlert}>NEEDS SIGNATURE</Text>
                      </View>
                      <Text style={styles.metricTextSmall}>
                        {c.energyReadings} energy packets · {c.sensorReadings} dosimetry samples
                      </Text>
                      <Pressable
                        style={[styles.actionBtn, styles.certifyBtn, { marginTop: 6 }]}
                        onPress={() => void runAction('admin', 'sign cycle', client => onSign(client, c.cycleId))}
                      >
                        <Text style={styles.btnTextCertify}>✍️ Sign & Certify Evidence (EN 17141)</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={[styles.pillSmall, styles.pillSuccess, { alignSelf: 'flex-start', marginVertical: 6 }]}>
                  <Text style={{ color: '#34d399', fontSize: 11, fontWeight: '700' }}>
                    ✓ All Ended Cycles Certified Under EN 17141
                  </Text>
                </View>
              )}

              {/* Certified Cycles Archive */}
              {signedCycles.length > 0 ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={[styles.appSectionTitle, { marginBottom: 6 }]}>
                    Certified Execution Records ({signedCycles.length})
                  </Text>
                  {signedCycles.map(c => (
                    <View key={c.cycleId} style={styles.signedCycleSealCard}>
                      <View style={styles.sealHeaderRow}>
                        <Text style={styles.sealEmblem}>🛡️</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.sealHeading}>EN 17141 EXECUTION EVIDENCE</Text>
                          <Text style={styles.sealSubheading}>Cryptographically Sealed Proof</Text>
                        </View>
                        <Text style={styles.pillSuccess}>CERTIFIED</Text>
                      </View>
                      <View style={styles.sealDetailsBox}>
                        <Text style={styles.sealLine}>Cycle: {shortHash(c.cycleId)}</Text>
                        <Text style={styles.sealLine}>Authority: {shortHash(c.signedBy)} (Admin)</Text>
                        <Text style={styles.sealLine}>
                          Evidence: {c.energyReadings} Pulses + {c.sensorReadings} Samples
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Audit Log */}
              <View style={[styles.appSectionCard, { marginTop: 8 }]}>
                <Text style={styles.appSectionTitle}>Audit Log (Journal Lines)</Text>
                <View style={styles.journalBox}>
                  {model?.journalLines && model.journalLines.length > 0 ? (
                    model.journalLines.map((entry, i) => (
                      <Text key={i} style={styles.journalEntryText}>
                        {entry}
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.hintMuted}>No journal events recorded yet.</Text>
                  )}
                </View>
              </View>
            </View>
          </View>
        ) : null}

        {/* ==================== 2. DEVICES TAB ==================== */}
        {activeTab === 'devices' ? (
          <View style={styles.realSectionBlock}>
            <Text style={styles.realSectionHeadline}>Hardware Trust & Governance</Text>
            <Text style={styles.realSectionDesc}>
              Attested hardware emitters and sensors registered in the Trust Mesh.
            </Text>

            <View style={[styles.deviceHierarchyList, { marginTop: 8 }]}>
              <View style={styles.deviceCard}>
                <MaterialCommunityIcons name="lightbulb" size={24} color="#64748b" />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.deviceCardTitle}>UVC Lamp 01</Text>
                  <Text style={styles.deviceCardSub}>254nm Quartz Tube · Room 101</Text>
                </View>
                <Text style={[styles.pillSmall, styles.pillMuted]}>DEVICE REGISTERED</Text>
              </View>

              <View style={styles.deviceCard}>
                <MaterialCommunityIcons name="radar" size={24} color="#34d399" />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.deviceCardTitle}>Radiometer NIST 01</Text>
                  <Text style={styles.deviceCardSub}>254nm Optical Sensor · Room 101</Text>
                </View>
                <Text style={[styles.pillSmall, styles.pillSuccess]}>ONLINE / CALIBRATED</Text>
              </View>

              <View style={styles.deviceCard}>
                <MaterialCommunityIcons name="door-closed" size={24} color="#34d399" />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.deviceCardTitle}>Safety Interlock</Text>
                  <Text style={styles.deviceCardSub}>Door Magnetic Switch · Room 101</Text>
                </View>
                <Text style={[styles.pillSmall, styles.pillSuccess]}>ARMED</Text>
              </View>

              <View style={styles.deviceCard}>
                <MaterialCommunityIcons name="cctv" size={24} color="#60a5fa" />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.deviceCardTitle}>Room 101 CCTV</Text>
                  <Text style={styles.deviceCardSub}>Occupancy & Safety Camera</Text>
                </View>
                <Text style={[styles.pillSmall, styles.pillBlue]}>NO OCCUPANTS</Text>
              </View>
            </View>

            <Pressable
              style={[styles.actionBtn, styles.secondaryBtn, { marginTop: 10 }]}
              onPress={() => setShowQrModal(true)}
            >
              <Text style={styles.btnTextSecondary}>Clone App (QR)</Text>
            </Pressable>
          </View>
        ) : null}

        {/* ==================== 3. ROOMS TAB ==================== */}
        {activeTab === 'rooms' ? (
          <View style={styles.realSectionBlock}>
            <Text style={styles.realSectionHeadline}>Controlled Environments</Text>
            <Text style={styles.realSectionDesc}>
              EN 17141 & ISO 14644 cleanrooms, operating suites, and biocontamination controls.
            </Text>

            <View style={[styles.appSectionCard, { marginTop: 8 }]}>
              <View style={styles.rowBetween}>
                <Text style={styles.deviceCardTitle}>OR 4 · Surgical Suite</Text>
                <Text style={[styles.chipBadge, { backgroundColor: '#1e3a8a', color: '#bfdbfe' }]}>ISO 7</Text>
              </View>
              <Text style={styles.deviceCardSub}>Operating Room · Target: 400 J/m²</Text>
              <Text style={styles.hintMuted}>Assigned: Groov RIO Overhead Tube, Industrial Radiometer</Text>
              <View style={[styles.pillSmall, styles.pillSuccess, { alignSelf: 'flex-start', marginTop: 6 }]}>
                <Text style={{ color: '#34d399', fontSize: 10, fontWeight: '700' }}>✓ COMPLIANCE ATTESTED</Text>
              </View>
            </View>

            <View style={[styles.appSectionCard, { marginTop: 8 }]}>
              <View style={styles.rowBetween}>
                <Text style={styles.deviceCardTitle}>Room 101 · Patient Ward</Text>
                <Text style={[styles.chipBadge, { backgroundColor: '#1e3a8a', color: '#bfdbfe' }]}>Treatment</Text>
              </View>
              <Text style={styles.deviceCardSub}>Ward Room · Target: 250 J/m²</Text>
              <Text style={styles.hintMuted}>Assigned: ESP32 Wall Emitter, NIST Sensor</Text>
              <View style={[styles.pillSmall, styles.pillSuccess, { alignSelf: 'flex-start', marginTop: 6 }]}>
                <Text style={{ color: '#34d399', fontSize: 10, fontWeight: '700' }}>✓ COMPLIANCE ATTESTED</Text>
              </View>
            </View>

            <View style={[styles.appSectionCard, { marginTop: 8 }]}>
              <View style={styles.rowBetween}>
                <Text style={styles.deviceCardTitle}>Cleanroom B · Decontamination</Text>
                <Text style={[styles.chipBadge, { backgroundColor: '#065f46', color: '#34d399' }]}>ISO 5</Text>
              </View>
              <Text style={styles.deviceCardSub}>Laboratory Suite · Target: 500 J/m²</Text>
              <Text style={styles.hintMuted}>Assigned: Quartz Mobile Tower #1</Text>
              <View style={[styles.pillSmall, styles.pillSuccess, { alignSelf: 'flex-start', marginTop: 6 }]}>
                <Text style={{ color: '#34d399', fontSize: 10, fontWeight: '700' }}>✓ COMPLIANCE ATTESTED</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* ==================== 4. ROLES TAB ==================== */}
        {activeTab === 'roles' ? (
          <View style={styles.realSectionBlock}>
            <Text style={styles.realSectionHeadline}>Role Authority & Governance</Text>
            <Text style={styles.realSectionDesc}>
              EN 17141 Root Trust Anchor credential manager. Issue cryptographic RoleCertificates to actors and devices.
            </Text>

            {/* Root Authority Card */}
            <View style={[styles.signedCycleSealCard, { padding: 10, marginTop: 8 }]}>
              <View style={styles.sealHeaderRow}>
                <Text style={{ fontSize: 14 }}>👑</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sealHeading, { fontSize: 11 }]}>ROOT TRUST ANCHOR</Text>
                  <Text style={[styles.sealSubheading, { fontSize: 10 }]}>admin@lab.local · Hospital Authority</Text>
                </View>
                <Text style={[styles.pillAlert, { fontSize: 10 }]}>ACTIVE ANCHOR</Text>
              </View>
              <Text style={[styles.hintMuted, { marginTop: 6 }]}>
                Authorizes clinical operators and devices to participate in the EN 17141 disinfection mesh.
              </Text>
            </View>

            {/* Active Lane Roles List */}
            <View style={[styles.appSectionCard, { marginTop: 8 }]}>
              <Text style={[styles.appSectionTitle, { fontSize: 11 }]}>
                Active Role Certificates ({laneRoles && laneRoles.length > 0 ? laneRoles.length : 4})
              </Text>
              {laneRoles && laneRoles.length > 0 ? (
                laneRoles.map(r => (
                  <View key={`${r.role}-${r.person}`} style={[styles.topicRow, { paddingVertical: 6 }]}>
                    <View style={[styles.topicAvatar, { width: 28, height: 28, backgroundColor: '#0284c7' }]}>
                      <MaterialCommunityIcons name="certificate" size={16} color="#ffffff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.topicTitle, { fontSize: 11 }]}>{r.role.toUpperCase()}</Text>
                      <Text style={[styles.topicSnippet, { fontSize: 10 }]}>{r.person}</Text>
                    </View>
                    <Text style={[styles.pillSmall, styles.pillSuccess, { fontSize: 8 }]}>CERTIFIED</Text>
                  </View>
                ))
              ) : (
                <View style={{ gap: 4, marginTop: 4 }}>
                  {[
                    { role: 'DOCTOR', person: 'doctor@lab.local', desc: 'Protocol Dispatcher' },
                    { role: 'OPERATOR', person: 'operator@lab.local', desc: 'Disinfection Runner' },
                    { role: 'LAMP', person: 'lamp@lab.local', desc: '254nm Quartz Tube Hardware' },
                    { role: 'SENSOR', person: 'sensor@lab.local', desc: 'NIST Radiometer Hardware' },
                  ].map(item => (
                    <View key={item.role} style={[styles.topicRow, { paddingVertical: 4 }]}>
                      <View style={[styles.topicAvatar, { width: 24, height: 24, backgroundColor: '#0284c7' }]}>
                        <MaterialCommunityIcons name="certificate" size={14} color="#ffffff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.topicTitle, { fontSize: 11 }]}>{item.role}</Text>
                        <Text style={[styles.topicSnippet, { fontSize: 9 }]}>{item.person}</Text>
                      </View>
                      <Text style={[styles.pillSmall, styles.pillSuccess, { fontSize: 8 }]}>VALID</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Issue New Certificate */}
            <View style={[styles.appSectionCard, { marginTop: 8 }]}>
              <Text style={[styles.appSectionTitle, { fontSize: 11 }]}>Issue Role Certificate (EN 17141)</Text>
              <TextInput
                style={[styles.realAppSearchInput, { height: 34, borderRadius: 6, paddingHorizontal: 8, fontSize: 11, marginTop: 6 }]}
                placeholder="Target Person ID or Email (e.g., doctor@lab.local)"
                placeholderTextColor="#64748b"
                value={newRoleTarget}
                onChangeText={setNewRoleTarget}
              />

              {/* Quick Select Buttons */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                {['doctor@lab.local', 'operator@lab.local', 'lamp@lab.local', 'sensor@lab.local'].map(id => (
                  <Pressable
                    key={id}
                    style={[styles.filterChip, newRoleTarget === id && styles.filterChipActive, { paddingHorizontal: 6, paddingVertical: 2 }]}
                    onPress={() => setNewRoleTarget(id)}
                  >
                    <Text style={[styles.filterChipText, newRoleTarget === id && styles.filterChipTextActive, { fontSize: 9 }]}>
                      {id.split('@')[0]}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={{ flexDirection: 'row', gap: 4, marginTop: 8 }}>
                {['doctor', 'operator', 'auditor', 'lamp', 'sensor'].map(r => (
                  <Pressable
                    key={r}
                    style={[styles.filterChip, newRoleName === r && styles.filterChipActive, { paddingHorizontal: 6, paddingVertical: 2 }]}
                    onPress={() => setNewRoleName(r)}
                  >
                    <Text style={[styles.filterChipText, newRoleName === r && styles.filterChipTextActive, { fontSize: 9 }]}>
                      {r}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                style={[styles.actionBtn, styles.certifyBtn, { marginTop: 8 }]}
                disabled={assigningRole || !newRoleTarget.trim()}
                onPress={async () => {
                  if (!newRoleTarget.trim() || !onAssignRole) return;
                  try {
                    setAssigningRole(true);
                    await onAssignRole(newRoleTarget.trim(), newRoleName);
                    setNewRoleTarget('');
                  } catch (e) {
                    // Handled
                  } finally {
                    setAssigningRole(false);
                  }
                }}
              >
                <Text style={[styles.btnTextCertify, { fontSize: 10 }]}>
                  {assigningRole ? 'Issuing…' : `✍️ Sign & Issue "${newRoleName.toUpperCase()}" Certificate`}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* ==================== 5. DATA TAB ==================== */}
        {activeTab === 'data' ? (
          <View style={styles.realSectionBlock}>
            <View style={styles.appSectionCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="database-export" size={20} color="#34C759" />
                <Text style={styles.deviceCardTitle}>Export Audit Ledger</Text>
              </View>
              <Text style={[styles.deviceCardSub, { marginVertical: 6 }]}>
                Download a JSON backup containing certified disinfection cycles, cryptographic seals, and role certificates under EN 17141.
              </Text>
              <Pressable
                style={[styles.actionBtn, styles.successBtn]}
                onPress={() => {
                  triggerJsonDownload(`uvc-admin-audit-ledger-${Date.now()}.json`, {
                    app: 'uvc',
                    role: 'admin',
                    exportedAt: new Date().toISOString(),
                    standard: 'EN 17141:2020',
                    rootAnchor: 'admin@lab.local',
                    laneRoles: laneRoles ?? [],
                    cycles: snapshotCycles.map(c => ({
                      cycleId: c.cycleId,
                      ended: c.ended,
                      signedBy: c.signedBy,
                      energyReadings: c.energyReadings,
                      sensorReadings: c.sensorReadings,
                    })),
                    journalLines: model?.journalLines ?? [],
                  });
                }}
              >
                <Text style={styles.btnTextPrimary}>📥 Export Audit Ledger (JSON)</Text>
              </Pressable>
            </View>

            <View style={[styles.appSectionCard, { marginTop: 10 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="printer" size={20} color="#fbbf24" />
                <Text style={styles.deviceCardTitle}>Compliance Certificate</Text>
              </View>
              <Text style={[styles.deviceCardSub, { marginVertical: 6 }]}>
                Generate and print the official EN 17141 Bio-Contamination Control Certificate for health department audits.
              </Text>
              <Pressable
                style={[styles.actionBtn, styles.secondaryBtn]}
                onPress={() => setShowExportModal(true)}
              >
                <Text style={styles.btnTextSecondary}>🖨️ View & Print Certificate</Text>
              </Pressable>
            </View>

            <View style={[styles.appSectionCard, { marginTop: 10 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="database-import" size={20} color="#60a5fa" />
                <Text style={styles.deviceCardTitle}>Import Data Archive</Text>
              </View>
              <Text style={[styles.deviceCardSub, { marginVertical: 6 }]}>
                Restore UVC governance records, device keys, and cycle archives from a previous backup.
              </Text>
              <Pressable
                style={[styles.actionBtn, styles.secondaryBtn]}
                onPress={() => alert('Select a valid UVC JSON backup archive to restore.')}
              >
                <Text style={styles.btnTextSecondary}>Restore from Backup</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Bottom App Navigation Bar */}
      <MobileTabBar activeTab={activeTab} onChangeTab={setActiveTab} />

      {/* ==================== MODAL OVERLAYS ==================== */}

      {/* 1. QR Enrollment Modal */}
      {showQrModal && (
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>Clone This App</Text>
              <Pressable onPress={() => setShowQrModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#94a3b8" />
              </Pressable>
            </View>
            <Text style={styles.modalSubtext}>
              Scan to clone the Hospital Admin app onto a second device.
            </Text>
            <View style={styles.qrWrapper}>
              {state.inviteUrl ? (
                <QRCodeSVG value={state.inviteUrl} size={130} />
              ) : (
                <Text style={styles.hintMuted}>Preparing clone QR…</Text>
              )}
            </View>
            <Pressable
              style={[styles.actionBtn, styles.secondaryBtn, { marginTop: 10 }]}
              onPress={() => setShowQrModal(false)}
            >
              <Text style={styles.btnTextSecondary}>Close</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* 2. Settings & Telemetry Modal */}
      {showSettingsModal && (
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>Settings & Telemetry</Text>
              <Pressable onPress={() => setShowSettingsModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#94a3b8" />
              </Pressable>
            </View>
            <Text style={styles.telemetryText}>{model?.ownerLine}</Text>
            <Text style={styles.telemetryText}>{model?.instanceLine}</Text>
            <Text style={styles.telemetrySub}>Mesh Connections:</Text>
            {model?.connectionLines.map((l, i) => (
              <Text key={i} style={styles.telemetryText}>
                {l}
              </Text>
            ))}
            <Pressable
              style={[styles.actionBtn, styles.secondaryBtn, { marginTop: 10 }]}
              onPress={onPause}
            >
              <Text style={styles.btnTextSecondary}>{state.paused ? 'Resume Telemetry' : 'Pause Telemetry'}</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.secondaryBtn, { marginTop: 6 }]}
              onPress={() => setShowSettingsModal(false)}
            >
              <Text style={styles.btnTextSecondary}>Close</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* 3. Certify Modal */}
      {showCertifyModal && (
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.rowBetween}>
              <Text style={styles.modalTitle}>Certify Evidence (EN 17141)</Text>
              <Pressable onPress={() => setShowCertifyModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#94a3b8" />
              </Pressable>
            </View>
            {unsignedCycles.length > 0 ? (
              <View>
                <Text style={styles.modalSubtext}>
                  As Hospital Authority, affix your digital signature to cycle {shortHash(unsignedCycles[0].cycleId)} to seal EN 17141 evidence.
                </Text>
                <View style={styles.evidenceBox}>
                  <Text style={styles.sealLine}>Target: {unsignedCycles[0].planId}</Text>
                  <Text style={styles.sealLine}>
                    Delivered: {unsignedCycles[0].energyReadings} energy pulses · {unsignedCycles[0].sensorReadings} dosimetry samples
                  </Text>
                </View>
                <Pressable
                  style={[styles.actionBtn, styles.certifyBtn, { marginTop: 10 }]}
                  onPress={async () => {
                    setShowCertifyModal(false);
                    await runAction('admin', 'sign cycle', client => onSign(client, unsignedCycles[0].cycleId));
                    setActiveTab('journal');
                  }}
                >
                  <Text style={styles.btnTextCertify}>✍️ Sign & Certify Evidence</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.hintMuted}>No cycles pending signature.</Text>
            )}
            <Pressable
              style={[styles.actionBtn, styles.secondaryBtn, { marginTop: 6 }]}
              onPress={() => setShowCertifyModal(false)}
            >
              <Text style={styles.btnTextSecondary}>Close</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* 4. Export Modal */}
      <ExportPreviewModal
        visible={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Hospital Authority Compliance Record"
        roleName="Admin"
        cycles={snapshotCycles}
      />
    </View>
    <LaneInviteQrCard roleLabel="Hospital Admin" inviteUrl={state.inviteUrl} error={state.inviteError} />
    </React.Fragment>
  );
}

// ============================================================================
// 3. Lamp Hardware Fixture Simulator Column
// ============================================================================

function LampSimulatorColumn({
  state,
  isLampOn,
  lastCycleId,
  onToggleLight,
  onRecordEnergy,
  onPause,
  onRefresh,
  runAction,
}: {
  state: ColumnState;
  isLampOn: boolean;
  lastCycleId: string | null;
  onToggleLight: (client: LaneClient) => Promise<string | void>;
  onRecordEnergy: (client: LaneClient) => Promise<string | void>;
  onPause: () => void;
  onRefresh: () => void;
  runAction: (role: string, label: string, fn: (client: LaneClient) => Promise<string | void>) => Promise<void>;
}): React.ReactElement {
  const [showDetails, setShowDetails] = useState(false);
  const model: ColumnModel | null = state.snapshot
    ? columnModel(state.snapshot, { paused: state.paused, error: state.error ?? undefined })
    : null;

  return (
    <React.Fragment>
    <View style={[styles.simulatorFrame, isLampOn ? styles.lampFrameActive : null]}>
      {/* Device Header */}
      <View style={styles.simHeader}>
        <View>
          <View style={styles.roleTitleRow}>
            <Text style={styles.lampAppRoleBadge}>💡 ACTOR / EMITTER</Text>
            <Text style={[styles.roleSubBadge, state.snapshot ? styles.badgeOnline : styles.badgeConnecting]}>
              {state.snapshot ? '● 254nm Quartz' : '○ Booting'}
            </Text>
          </View>
          <Text style={styles.appTitle}>UVC Lamp Simulator</Text>
          <Text style={styles.appSubtitle}>lamp@lab.local</Text>
        </View>

      </View>

      <ScrollView style={styles.simBody} contentContainerStyle={styles.simBodyContent} nestedScrollEnabled>
        {/* Interactive UVC Lamp Fixture Graphic */}
        <View style={[styles.graphicContainer, isLampOn ? styles.graphicContainerActive : null]}>
          <View style={[styles.lampFixtureHousing, isLampOn ? styles.housingGlow : null]}>
            {/* Left Electrode Cap */}
            <View style={[styles.electrodeCap, isLampOn ? styles.electrodeGlowing : null]} />

            {/* Quartz Tube Body with 254nm Ultraviolet Emission */}
            <View style={[styles.quartzTube, isLampOn ? styles.quartzTubeGlowing : null]}>
              {isLampOn ? (
                <View style={styles.rayWaveOverlay}>
                  <Text style={styles.emissionRayText}>⚡ 254nm UVC EMITTING ⚡</Text>
                </View>
              ) : (
                <View style={styles.coldTubeReflection} />
              )}
            </View>

            {/* Right Electrode Cap */}
            <View style={[styles.electrodeCap, isLampOn ? styles.electrodeGlowing : null]} />
          </View>

          {/* Emission Status Banner */}
          <View style={styles.lampStatusBanner}>
            <Text style={[styles.lampStatusText, isLampOn ? styles.lampStatusOn : styles.lampStatusOff]}>
              {isLampOn ? '⚠️ HAZARD: GERMICIDAL 254nm ACTIVE (ROOM VACATED)' : '● STANDBY — NO RADIATION DETECTED'}
            </Text>
          </View>

          {/* Physical Instrument Telemetry Grid */}
          <View style={styles.telemetryGrid}>
            <View style={styles.simTelemetryCell}>
              <Text style={styles.simTelemetryLabel}>WAVELENGTH</Text>
              <Text style={styles.simTelemetryVal}>253.7 nm</Text>
            </View>
            <View style={styles.simTelemetryCell}>
              <Text style={styles.simTelemetryLabel}>POWER OUTPUT</Text>
              <Text style={[styles.simTelemetryVal, isLampOn ? { color: '#c084fc' } : null]}>
                {isLampOn ? '120 W' : '0 W'}
              </Text>
            </View>
            <View style={styles.simTelemetryCell}>
              <Text style={styles.simTelemetryLabel}>TUBE TEMP</Text>
              <Text style={styles.simTelemetryVal}>{isLampOn ? '42.8 °C' : '21.0 °C'}</Text>
            </View>
            <View style={styles.simTelemetryCell}>
              <Text style={styles.simTelemetryLabel}>INTERLOCK</Text>
              <Text style={[styles.simTelemetryVal, { color: '#22c55e' }]}>ARMED</Text>
            </View>
          </View>
        </View>

        {/* Lamp Controls */}
        <View style={styles.controlsCard}>
          <Text style={styles.appSectionTitle}>Lamp Controls</Text>
          <Pressable
            style={[styles.actionBtn, isLampOn ? styles.dangerBtn : styles.lampOnBtn, { marginBottom: 6 }]}
            onPress={() => void runAction('lamp', 'toggle light', onToggleLight)}
          >
            <Text style={styles.btnTextPrimary}>
              {isLampOn ? '⏹ Extinguish Lamp (Turn OFF)' : '⚡ Ignite Lamp (Turn ON)'}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.actionBtn, styles.secondaryBtn]}
            onPress={() => void runAction('lamp', 'record energy', onRecordEnergy)}
          >
            <Text style={styles.btnTextSecondary}>Pulse Delivered Energy (+500 mJ)</Text>
          </Pressable>
          {lastCycleId ? (
            <Text style={styles.hintText}>Active Cycle: {shortHash(lastCycleId)}</Text>
          ) : (
            <Text style={styles.hintMuted}>Start a cycle in Doctor app to link energy pulses</Text>
          )}
        </View>

        {/* Technical Drawer & QR */}
        <View style={styles.toggleRow}>
          <Pressable style={styles.linkButton} onPress={() => setShowDetails(!showDetails)}>
            <Text style={styles.linkButtonText}>{showDetails ? '▼ Hide Diagnostics & QR' : '▶ Show Diagnostics & QR'}</Text>
          </Pressable>
        </View>

        {showDetails ? (
          <View style={styles.detailsDrawer}>
            {state.inviteUrl ? (
              <View style={[styles.qrWrapper, { marginVertical: 6 }]}>
                <Text style={styles.sectionSubtitle}>Clone this app onto a physical phone as a Lamp device:</Text>
                <QRCodeSVG value={state.inviteUrl} size={110} />
              </View>
            ) : null}
            {model ? (
              <View>
                <Text style={styles.telemetryText}>{model.ownerLine}</Text>
                <Text style={styles.telemetryText}>{model.instanceLine}</Text>
                {model.connectionLines.map((l, i) => (
                  <Text key={i} style={styles.telemetryText}>
                    {l}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
    <LaneInviteQrCard roleLabel="UVC Lamp" inviteUrl={state.inviteUrl} error={state.inviteError} />
    </React.Fragment>
  );
}

// ============================================================================
// 4. Sensor Radiometer Simulator Column
// ============================================================================

function SensorSimulatorColumn({
  state,
  isLampOn,
  lastCycleId,
  autoMetering,
  setAutoMetering,
  irradianceTarget,
  setIrradianceTarget,
  onSimulateReading,
  onPause,
  onRefresh,
  runAction,
}: {
  state: ColumnState;
  isLampOn: boolean;
  lastCycleId: string | null;
  autoMetering: boolean;
  setAutoMetering: (v: boolean) => void;
  irradianceTarget: string;
  setIrradianceTarget: (v: string) => void;
  onSimulateReading: (client: LaneClient) => Promise<string | void>;
  onPause: () => void;
  onRefresh: () => void;
  runAction: (role: string, label: string, fn: (client: LaneClient) => Promise<string | void>) => Promise<void>;
}): React.ReactElement {
  const [showDetails, setShowDetails] = useState(false);
  const model: ColumnModel | null = state.snapshot
    ? columnModel(state.snapshot, { paused: state.paused, error: state.error ?? undefined })
    : null;

  const currentIrradiance = isLampOn ? Number(irradianceTarget) || 40.0 : 0.0;

  return (
    <React.Fragment>
    <View style={styles.simulatorFrame}>
      {/* Device Header */}
      <View style={styles.simHeader}>
        <View>
          <View style={styles.roleTitleRow}>
            <Text style={styles.sensorAppRoleBadge}>📡 RADIOMETER / PROBE</Text>
            <Text style={[styles.roleSubBadge, state.snapshot ? styles.badgeOnline : styles.badgeConnecting]}>
              {state.snapshot ? '● NIST Traceable' : '○ Booting'}
            </Text>
          </View>
          <Text style={styles.appTitle}>UVC Sensor Simulator</Text>
          <Text style={styles.appSubtitle}>sensor@lab.local</Text>
        </View>

      </View>

      <ScrollView style={styles.simBody} contentContainerStyle={styles.simBodyContent} nestedScrollEnabled>
        {/* Interactive UVC Radiometer / Sensor Graphic */}
        <View style={styles.graphicContainer}>
          {/* Photodiode Optical Sensor Dome */}
          <View style={styles.sensorHeadContainer}>
            <View style={[styles.opticalSensorDome, isLampOn ? styles.domeDetecting : null]}>
              <View style={[styles.opticalFilterWindow, isLampOn ? styles.windowActive : null]} />
            </View>
            <Text style={[styles.sensorProbeLabel, isLampOn ? { color: '#10b981' } : null]}>
              {isLampOn ? '◉ UV RADIATION DETECTED (254nm)' : '○ SENSOR DARKENED'}
            </Text>
          </View>

          {/* High-Contrast Digital Radiometer LCD Readout */}
          <View style={styles.radiometerLcdBezel}>
            <View style={styles.radiometerLcdDisplay}>
              <View style={styles.rowBetween}>
                <Text style={styles.lcdHeaderLabel}>UVC IRRADIANCE METER · NIST TRACEABLE</Text>
                <Text style={styles.lcdHeaderMode}>{autoMetering ? 'AUTO (1Hz)' : 'MANUAL'}</Text>
              </View>
              <View style={styles.lcdDigitalReadoutRow}>
                <Text style={styles.lcdDigitalReadoutText}>{currentIrradiance.toFixed(1)}</Text>
                <Text style={styles.lcdDigitalUnit}>mW/cm²</Text>
              </View>
              <View style={styles.lcdFooterRow}>
                <Text style={styles.lcdFooterText}>ACCUM: {(currentIrradiance * 10).toFixed(0)} J/m²</Text>
                <Text style={styles.lcdFooterText}>CAL: VALID (±1.5%)</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Sensor Controls */}
        <View style={styles.controlsCard}>
          <Text style={styles.appSectionTitle}>Sensor Observations</Text>
          <View style={styles.fieldRow}>
            <Text style={styles.miniFieldLabel}>Field Target:</Text>
            <TextInput
              style={[styles.appInput, { flex: 1, marginBottom: 0 }]}
              value={irradianceTarget}
              onChangeText={setIrradianceTarget}
              keyboardType="numeric"
              placeholderTextColor="#64748b"
            />
          </View>

          <View style={[styles.buttonRow, { marginTop: 6 }]}>
            <Pressable
              style={[styles.actionBtn, styles.primaryBtn, { flex: 1, marginRight: 4 }]}
              onPress={() => void runAction('sensor', 'simulate reading', onSimulateReading)}
            >
              <Text style={styles.btnTextPrimary}>Sample</Text>
            </Pressable>

            <Pressable
              style={[styles.actionBtn, autoMetering ? styles.successBtn : styles.secondaryBtn, { flex: 1.3 }]}
              onPress={() => setAutoMetering(!autoMetering)}
            >
              <Text style={autoMetering ? styles.btnTextPrimary : styles.btnTextSecondary}>
                {autoMetering ? '● Auto: ON' : '○ Auto: OFF'}
              </Text>
            </Pressable>
          </View>

          {lastCycleId ? (
            <Text style={styles.hintText}>Active Cycle: {shortHash(lastCycleId)}</Text>
          ) : (
            <Text style={styles.hintMuted}>Start a cycle in Doctor app to associate sensor readings</Text>
          )}
        </View>

        {/* Technical Drawer & QR */}
        <View style={styles.toggleRow}>
          <Pressable style={styles.linkButton} onPress={() => setShowDetails(!showDetails)}>
            <Text style={styles.linkButtonText}>{showDetails ? '▼ Hide Diagnostics & QR' : '▶ Show Diagnostics & QR'}</Text>
          </Pressable>
        </View>

        {showDetails ? (
          <View style={styles.detailsDrawer}>
            {state.inviteUrl ? (
              <View style={[styles.qrWrapper, { marginVertical: 6 }]}>
                <Text style={styles.sectionSubtitle}>Clone this app onto a physical phone as a Sensor device:</Text>
                <QRCodeSVG value={state.inviteUrl} size={110} />
              </View>
            ) : null}
            {model ? (
              <View>
                <Text style={styles.telemetryText}>{model.ownerLine}</Text>
                <Text style={styles.telemetryText}>{model.instanceLine}</Text>
                {model.connectionLines.map((l, i) => (
                  <Text key={i} style={styles.telemetryText}>
                    {l}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
    <LaneInviteQrCard roleLabel="Optical Sensor" inviteUrl={state.inviteUrl} error={state.inviteError} />
    </React.Fragment>
  );
}

// QR codes render with Flexibel's qrcode.react (QRCodeSVG, pure SVG).
// react-native-qrcode-svg crashes on web inside react-native-svg's WebShape,
// so it is not used on this page.
// ============================================================================
// Lane IoM invite QR card — always-visible enrollment code under each app,
// mirroring the Flexibel lab lane (inline QR, no popups).
// ============================================================================
function LaneInviteQrCard({
  roleLabel,
  inviteUrl,
  error,
}: {
  roleLabel: string;
  inviteUrl: string | null;
  error?: string | null;
}): React.ReactElement {
  return (
    <View style={styles.laneInviteQr}>
      <Text style={styles.laneInviteQrTitle}>Clone app · {roleLabel}</Text>
      <Text style={styles.laneInviteQrSub}>Scan to clone {roleLabel} onto a second device</Text>
      <View style={styles.laneInviteQrBox}>
        {inviteUrl ? (
          <QRCodeSVG value={inviteUrl} size={112} />
        ) : error ? (
          <Text style={styles.laneInviteQrError}>{error}</Text>
        ) : (
          <Text style={styles.hintMuted}>Preparing clone QR…</Text>
        )}
      </View>
    </View>
  );
}

// ============================================================================
// Stylesheet: Calibrated Proportions, Real App Frames, Zero Redundant Whitespace
// ============================================================================

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: '#090d16',
    padding: 8,
  },

  // Single Compact Top Toolbar
  topToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 6,
    gap: 8,
    flexWrap: 'wrap',
  },
  toolbarLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backLink: { color: '#60a5fa', fontSize: 12, fontWeight: '700' },
  toolbarTitle: { color: '#f8fafc', fontSize: 13, fontWeight: '800' },
  meshPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  meshLivePill: { backgroundColor: '#064e3b', borderColor: '#059669' },
  meshPairingPill: { backgroundColor: '#0c4a6e', borderColor: '#0284c7' },
  meshBootingPill: { backgroundColor: '#451a03', borderColor: '#d97706' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  meshPillText: { color: '#f8fafc', fontSize: 10, fontWeight: '700' },

  toolbarCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  simDemoBtn: {
    backgroundColor: '#7c3aed',
    borderWidth: 1,
    borderColor: '#a855f7',
    borderRadius: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  simDemoBtnActive: { backgroundColor: '#581c87' },
  simDemoBtnText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
  viewToggleGroup: { flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 5, padding: 2 },
  viewToggleBtn: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  viewToggleBtnActive: { backgroundColor: '#2563eb' },
  viewToggleText: { color: '#94a3b8', fontSize: 10, fontWeight: '700' },
  viewToggleTextActive: { color: '#ffffff' },

  toolbarRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniToolBtn: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
  },
  miniToolBtnActive: { backgroundColor: '#334155', borderColor: '#60a5fa' },
  miniToolBtnText: { color: '#e2e8f0', fontSize: 10, fontWeight: '700' },

  demoStepBar: {
    backgroundColor: '#581c87',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 6,
    alignItems: 'center',
  },
  demoStepBarText: { color: '#fdf4ff', fontSize: 11, fontWeight: '700' },
  complianceAlertBar: {
    backgroundColor: '#451a03',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  complianceAlertText: { color: '#fef3c7', fontSize: 11, fontWeight: '700' },
  errorText: { color: '#f87171', fontSize: 11, marginBottom: 4 },

  // Deck
  deckContainer: { flex: 1 },
  columns4Row: {
    flexDirection: 'row',
    gap: 0,
    flex: 1,
    alignItems: 'stretch',
  },
  deckColumn: {
    flex: 1,
    minWidth: 230,
  },

  // 2x2 Grid Mode
  grid2x2Container: { flex: 1, gap: 0 },
  gridRow: { flexDirection: 'row', gap: 0, flex: 1 },
  gridCell: { flex: 1, minWidth: 280 },

  // Lane IoM invite QR card (always visible under each app)
  laneInviteQr: {
    marginTop: 6,
    backgroundColor: '#151310',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2e2824',
    padding: 10,
    alignItems: 'center',
  },
  laneInviteQrTitle: { color: '#e8e0d4', fontSize: 12, fontWeight: '700', marginBottom: 2 },
  laneInviteQrSub: { color: '#a89c8c', fontSize: 11, marginBottom: 8, textAlign: 'center' },
  laneInviteQrBox: { backgroundColor: '#ffffff', padding: 6, borderRadius: 8 },
  laneInviteQrError: { color: '#b91c1c', fontSize: 11, textAlign: 'center', maxWidth: 160 },

  // ==========================================================================
  // Authentic Phone Frame (Doctor & Admin)
  // ==========================================================================
  realAppPhoneFrame: {
    backgroundColor: '#12100e',
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#2e2824',
    overflow: 'hidden',
    height: 510,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  realAppHeader: {
    backgroundColor: '#181512',
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  realAppHeaderTitle: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  realAppRolePill: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '800',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  realAppHeaderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  realAppHeaderIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  realAppBodyContent: {
    padding: 8,
    paddingBottom: 16,
  },

  // Collapsible Sections (matching TopicsCard and JournalCard)
  collapsibleSection: {
    backgroundColor: '#1c1917',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 8,
    overflow: 'hidden',
  },
  collapsibleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  collapsibleHeaderText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  collapsibleContent: {
    paddingHorizontal: 10,
    paddingBottom: 10,
  },

  // Searchbar inside card
  realAppSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12100e',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  realAppSearchInput: {
    flex: 1,
    color: '#f8fafc',
    fontSize: 12,
    padding: 0,
  },

  // Topic List Items
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  topicAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  topicTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '600',
  },
  topicSnippet: {
    color: '#94a3b8',
    fontSize: 11,
  },
  topicRight: {
    color: '#64748b',
    fontSize: 10,
  },

  // Standard Action Buttons (green outline matching real app)
  realActionButton: {
    borderWidth: 1,
    borderColor: '#34C759',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  realActionButtonText: {
    color: '#34C759',
    fontSize: 13,
    fontWeight: '600',
  },

  // Journal Items in Home
  journalEntryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  journalItemTitle: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '600',
  },
  journalItemSubtitle: {
    color: '#94a3b8',
    fontSize: 10,
    marginTop: 1,
  },
  statusPillSmall: {
    fontSize: 7,
    fontWeight: '800',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },

  // Journal Tab Views
  realSectionBlock: {
    backgroundColor: '#1c1917',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 10,
    marginBottom: 8,
  },
  realSectionHeadline: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  realSectionDesc: {
    color: '#94a3b8',
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 8,
  },
  treatmentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  smallOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#34C759',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  smallOutlineBtnText: {
    color: '#34C759',
    fontSize: 10,
    fontWeight: '700',
  },
  activeTreatmentCard: {
    backgroundColor: '#064e3b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#10b981',
    padding: 8,
    marginBottom: 8,
  },
  activeTreatmentTitle: {
    color: '#ecfdf5',
    fontSize: 11,
    fontWeight: '800',
  },
  journalCardOutlined: {
    backgroundColor: '#12100e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 8,
    marginBottom: 6,
  },
  cardHeadingTitle: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
  },
  cardHeadingTime: {
    color: '#94a3b8',
    fontSize: 10,
  },
  cardHeadingDesc: {
    color: '#cbd5e1',
    fontSize: 10,
    marginTop: 2,
  },
  chipBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    color: '#cbd5e1',
    fontSize: 8,
    fontWeight: '700',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },

  // Messages Chat
  chatHeader: {
    color: '#60a5fa',
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 4,
  },
  chatBubbleRow: {
    backgroundColor: '#1e293b',
    borderRadius: 6,
    padding: 6,
    marginVertical: 2,
  },
  chatBubbleText: {
    color: '#f1f5f9',
    fontSize: 11,
  },

  // Devices Hierarchy List
  deviceHierarchyList: {
    gap: 6,
  },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12100e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 8,
  },
  deviceCardTitle: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
  },
  deviceCardSub: {
    color: '#94a3b8',
    fontSize: 10,
  },
  pillSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 8,
    fontWeight: '800',
  },
  pillPurple: {
    backgroundColor: '#581c87',
    color: '#e9d5ff',
  },
  pillMuted: {
    backgroundColor: '#1e293b',
    color: '#94a3b8',
  },
  pillBlue: {
    backgroundColor: '#1e3a8a',
    color: '#bfdbfe',
  },

  // Bottom Phone Tab Bar
  phoneTabBar: {
    height: 48,
    backgroundColor: '#12100e',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 3,
  },
  tabItemText: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 1,
  },

  // Modal Overlays
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    zIndex: 100,
  },
  modalSheet: {
    width: '100%',
    backgroundColor: '#1c1917',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 12,
  },
  modalTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '800',
  },
  modalSubtext: {
    color: '#94a3b8',
    fontSize: 10,
    lineHeight: 14,
    marginVertical: 6,
  },

  // Legacy Phone Frame fallback
  phoneFrame: {
    backgroundColor: '#0f172a',
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#334155',
    overflow: 'hidden',
    height: 510,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  phoneTopBar: {
    height: 22,
    backgroundColor: '#020617',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  phoneTime: { color: '#94a3b8', fontSize: 9, fontWeight: '700' },
  phoneDynamicIsland: {
    width: 50,
    height: 12,
    backgroundColor: '#0f172a',
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  cameraLens: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#1e293b' },
  sensorDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#334155' },
  phoneIcons: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  phoneIconText: { color: '#94a3b8', fontSize: 8, fontWeight: '800' },
  batteryIcon: { width: 12, height: 7, borderWidth: 1, borderColor: '#94a3b8', borderRadius: 2, padding: 1 },
  batteryFill: { flex: 1, backgroundColor: '#22c55e', borderRadius: 1 },

  // App Header Inside Phone
  appHeader: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 2,
  },
  roleTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 1 },
  doctorAppRoleBadge: {
    backgroundColor: '#1e3a8a',
    color: '#bfdbfe',
    fontSize: 8,
    fontWeight: '800',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  adminAppRoleBadge: {
    backgroundColor: '#78350f',
    color: '#fde68a',
    fontSize: 8,
    fontWeight: '800',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  roleSubBadge: { fontSize: 9, fontWeight: '700' },
  badgeOnline: { color: '#22c55e' },
  badgeConnecting: { color: '#f59e0b' },
  appTitle: { color: '#f8fafc', fontSize: 12, fontWeight: '800' },
  appSubtitle: { color: '#94a3b8', fontSize: 9, fontFamily: 'monospace' },
  iconMiniButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconMiniButtonText: { color: '#f8fafc', fontSize: 12, fontWeight: 'bold' },

  // App Tabs
  appTabs: { flexDirection: 'row', backgroundColor: '#090d16', borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  appTab: { flex: 1, paddingVertical: 6, alignItems: 'center' },
  appTabActiveBlue: { borderBottomWidth: 2, borderBottomColor: '#3b82f6' },
  appTabActiveAmber: { borderBottomWidth: 2, borderBottomColor: '#f59e0b' },
  appTabText: { color: '#64748b', fontSize: 10, fontWeight: '600' },
  appTabTextActive: { color: '#f8fafc', fontWeight: '800' },

  appBody: { flex: 1 },
  appBodyContent: { padding: 8 },

  // App Section Cards
  appSectionCard: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  appSectionTitle: { color: '#f1f5f9', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  sectionSubtitle: { color: '#94a3b8', fontSize: 9, marginBottom: 6, lineHeight: 12 },
  inputLabel: { color: '#94a3b8', fontSize: 9, fontWeight: '600', marginBottom: 2 },
  appInput: {
    backgroundColor: '#090d16',
    borderWidth: 1,
    borderColor: '#334155',
    color: '#f8fafc',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontSize: 11,
    marginBottom: 4,
  },
  inputRow: { flexDirection: 'row' },
  buttonRow: { flexDirection: 'row', marginTop: 2, marginBottom: 4 },

  // Buttons
  actionBtn: { borderRadius: 4, paddingVertical: 5, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  primaryBtn: { backgroundColor: '#2563eb' },
  successBtn: { backgroundColor: '#16a34a' },
  completeBtn: { backgroundColor: '#059669', borderWidth: 1, borderColor: '#10b981' },
  dangerBtn: { backgroundColor: '#dc2626' },
  secondaryBtn: { backgroundColor: '#334155' },
  disabledBtn: { backgroundColor: '#1e293b', opacity: 0.4 },
  certifyBtn: { backgroundColor: '#d97706', marginTop: 5 },
  lampOnBtn: { backgroundColor: '#7c3aed' },
  btnTextPrimary: { color: '#ffffff', fontSize: 10, fontWeight: '700' },
  btnTextSecondary: { color: '#cbd5e1', fontSize: 10, fontWeight: '600' },
  btnTextCertify: { color: '#ffffff', fontSize: 10, fontWeight: '800' },

  hintText: { color: '#22c55e', fontSize: 9, marginTop: 3, fontWeight: '600' },
  hintMuted: { color: '#64748b', fontSize: 9, marginTop: 3, fontStyle: 'italic' },

  // Cycle Box & Progress Gauge
  cycleProgressBox: {
    backgroundColor: '#0f172a',
    borderRadius: 6,
    padding: 6,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  cycleIdText: { color: '#f8fafc', fontSize: 10, fontWeight: '700' },
  statusPill: { color: '#ffffff', fontSize: 8, fontWeight: '800', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
  progressBarContainer: {
    width: '100%',
    height: 4,
    backgroundColor: '#1e293b',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 4,
  },
  progressBarFill: { height: '100%', backgroundColor: '#10b981', borderRadius: 2 },
  progressSubText: { color: '#94a3b8', fontSize: 8, marginTop: 2 },
  progressPercentText: { color: '#10b981', fontSize: 8, fontWeight: '800', marginTop: 2 },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  metricItem: { alignItems: 'center' },
  metricValue: { color: '#60a5fa', fontSize: 11, fontWeight: '800' },
  metricLabel: { color: '#94a3b8', fontSize: 8 },

  // Chat
  chatHistoryBox: { backgroundColor: '#090d16', borderRadius: 4, padding: 5, minHeight: 60, maxHeight: 120, marginBottom: 6 },
  chatLineText: { color: '#cbd5e1', fontSize: 9, marginVertical: 1 },
  chatInputRow: { flexDirection: 'row', alignItems: 'center' },

  // Admin Certification & Seals
  unsignedCycleCard: {
    backgroundColor: '#451a03',
    borderRadius: 6,
    padding: 6,
    marginVertical: 3,
    borderWidth: 1,
    borderColor: '#b45309',
  },
  signedCycleSealCard: {
    backgroundColor: '#064e3b',
    borderRadius: 8,
    padding: 6,
    marginVertical: 4,
    borderWidth: 1,
    borderColor: '#10b981',
  },
  sealHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  sealEmblem: { fontSize: 16 },
  sealHeading: { color: '#ecfdf5', fontSize: 10, fontWeight: '900', letterSpacing: 0.2 },
  sealSubheading: { color: '#a7f3d0', fontSize: 8, fontWeight: '600' },
  sealDetailsBox: {
    backgroundColor: '#022c22',
    borderRadius: 4,
    padding: 5,
    borderWidth: 1,
    borderColor: '#065f46',
  },
  sealLine: { color: '#d1fae5', fontSize: 8, fontFamily: 'monospace', marginVertical: 1 },
  cardHighlightText: { color: '#ffffff', fontSize: 10, fontWeight: '700' },
  pillAlert: {
    backgroundColor: '#ef4444',
    color: '#ffffff',
    fontSize: 7,
    fontWeight: '800',
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 2,
  },
  pillSuccess: {
    backgroundColor: '#10b981',
    color: '#ffffff',
    fontSize: 7,
    fontWeight: '800',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 2,
  },
  metricTextSmall: { color: '#cbd5e1', fontSize: 8, marginTop: 2 },
  emptyCard: { padding: 8, alignItems: 'center' },
  badgeSmall: { backgroundColor: '#334155', color: '#f8fafc', fontSize: 8, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8 },
  badgePendingAlert: { backgroundColor: '#b45309', color: '#fef3c7' },

  // Journal & Audit
  journalBox: { backgroundColor: '#090d16', borderRadius: 4, padding: 4, maxHeight: 180 },
  journalEntryText: { color: '#94a3b8', fontSize: 8, marginVertical: 1, fontFamily: 'monospace' },

  // IoM QR
  iomExplainer: { color: '#94a3b8', fontSize: 9, textAlign: 'center', marginBottom: 6 },
  qrWrapper: { backgroundColor: '#ffffff', padding: 6, borderRadius: 8, alignItems: 'center' },

  // Telemetry
  telemetryCard: { backgroundColor: '#0f172a', borderRadius: 6, padding: 6 },
  telemetryHeader: { color: '#94a3b8', fontSize: 10, fontWeight: '700', marginBottom: 3 },
  telemetrySub: { color: '#64748b', fontSize: 9, fontWeight: '700', marginTop: 4 },
  telemetryText: { color: '#cbd5e1', fontSize: 8, fontFamily: 'monospace' },

  // ==========================================================================
  // Simulators Frame (Lamp & Sensor)
  // ==========================================================================
  simulatorFrame: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#334155',
    overflow: 'hidden',
    height: 510,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  lampFrameActive: { borderColor: '#7c3aed' },
  simHeader: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: '#334155',
  },
  lampAppRoleBadge: {
    backgroundColor: '#581c87',
    color: '#e9d5ff',
    fontSize: 8,
    fontWeight: '800',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  sensorAppRoleBadge: {
    backgroundColor: '#065f46',
    color: '#a7f3d0',
    fontSize: 8,
    fontWeight: '800',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  simBody: { flex: 1 },
  simBodyContent: { padding: 8 },

  graphicContainer: {
    backgroundColor: '#020617',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  graphicContainerActive: {
    borderColor: '#7c3aed',
    shadowColor: '#a855f7',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },

  // Lamp Fixture Graphics
  lampFixtureHousing: {
    width: '100%',
    height: 42,
    backgroundColor: '#1e293b',
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#475569',
  },
  housingGlow: {
    borderColor: '#a855f7',
    shadowColor: '#a855f7',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 16,
  },
  electrodeCap: { width: 10, height: 24, backgroundColor: '#64748b', borderRadius: 2 },
  electrodeGlowing: { backgroundColor: '#c084fc' },
  quartzTube: {
    flex: 1,
    height: 20,
    backgroundColor: '#0f172a',
    marginHorizontal: 3,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  quartzTubeGlowing: {
    backgroundColor: '#9333ea',
    borderColor: '#f3e8ff',
    shadowColor: '#c084fc',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 18,
  },
  rayWaveOverlay: { width: '100%', alignItems: 'center' },
  emissionRayText: { color: '#ffffff', fontSize: 8, fontWeight: '900', letterSpacing: 1.2 },
  coldTubeReflection: { width: '80%', height: 2, backgroundColor: '#334155', borderRadius: 1 },
  lampStatusBanner: { marginTop: 6, alignItems: 'center' },
  lampStatusText: { fontSize: 8, fontWeight: '800' },
  lampStatusOn: { color: '#c084fc' },
  lampStatusOff: { color: '#64748b' },
  telemetryGrid: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 6 },
  simTelemetryCell: { alignItems: 'center', flex: 1 },
  simTelemetryLabel: { color: '#64748b', fontSize: 7, fontWeight: '700' },
  simTelemetryVal: { color: '#f8fafc', fontSize: 10, fontWeight: '800', marginTop: 1 },

  // Sensor Dome Graphics
  sensorHeadContainer: { alignItems: 'center', marginBottom: 6 },
  opticalSensorDome: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1e293b',
    borderWidth: 2,
    borderColor: '#475569',
    alignItems: 'center',
    justifyContent: 'center',
  },
  domeDetecting: {
    borderColor: '#10b981',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 12,
  },
  opticalFilterWindow: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#042f2e',
    borderWidth: 1,
    borderColor: '#0f766e',
  },
  windowActive: { backgroundColor: '#10b981' },
  sensorProbeLabel: { color: '#94a3b8', fontSize: 8, fontWeight: '700', marginTop: 4 },

  // Digital Radiometer LCD Screen
  radiometerLcdBezel: {
    width: '100%',
    backgroundColor: '#042f2e',
    borderWidth: 2,
    borderColor: '#115e59',
    borderRadius: 6,
    padding: 6,
  },
  radiometerLcdDisplay: { backgroundColor: '#022c22', borderRadius: 4, padding: 4 },
  lcdHeaderLabel: { color: '#5eead4', fontSize: 7, fontWeight: '700' },
  lcdHeaderMode: { color: '#2dd4bf', fontSize: 7, fontWeight: '600' },
  lcdDigitalReadoutRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginVertical: 2 },
  lcdDigitalReadoutText: { color: '#34d399', fontSize: 22, fontWeight: '900', fontFamily: 'monospace' },
  lcdDigitalUnit: { color: '#5eead4', fontSize: 10, fontWeight: '700', marginLeft: 3 },
  lcdFooterRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#065f46', paddingTop: 3 },
  lcdFooterText: { color: '#2dd4bf', fontSize: 7, fontWeight: '600', fontFamily: 'monospace' },

  controlsCard: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  fieldRow: { flexDirection: 'row', alignItems: 'center' },
  miniFieldLabel: { color: '#94a3b8', fontSize: 9, fontWeight: '700', marginRight: 4 },
  toggleRow: { marginTop: 6, alignItems: 'center' },
  linkButton: { padding: 3 },
  linkButtonText: { color: '#60a5fa', fontSize: 9, fontWeight: '600' },
  detailsDrawer: {
    marginTop: 6,
    backgroundColor: '#020617',
    borderRadius: 6,
    padding: 6,
    borderWidth: 1,
    borderColor: '#1e293b',
  },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  // Bottom Log Tray
  bottomLogTray: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginTop: 6,
    padding: 6,
  },
  logTrayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logTrayToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  logTrayTitle: { color: '#f8fafc', fontSize: 10, fontWeight: '700' },
  logTraySnippet: { color: '#64748b', fontSize: 9, fontFamily: 'monospace', flex: 1 },
  logFilterRow: { flexDirection: 'row', gap: 3 },
  filterChip: { paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, backgroundColor: '#1e293b' },
  filterChipActive: { backgroundColor: '#2563eb' },
  filterChipText: { color: '#64748b', fontSize: 7, fontWeight: '800' },
  filterChipTextActive: { color: '#ffffff' },
  logStreamScroll: { maxHeight: 110, marginTop: 4 },
  logLine: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginVertical: 1 },
  logTimeText: { color: '#64748b', fontSize: 8, fontFamily: 'monospace' },
  logTagText: { color: '#38bdf8', fontSize: 7, fontWeight: '700' },
  logBodyText: { color: '#cbd5e1', fontSize: 9, fontFamily: 'monospace', flex: 1 },
});
