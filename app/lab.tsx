/** Fixed mobile lab views. Domain state lives in independent ONE workers. */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { UvcLogo } from '../src/components/brand/UvcLogo';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { QRCodeSVG } from 'qrcode.react';
import { Colors } from '../src/constants/Colors';
import { bootLane, mintIoMInvite, seedLaneMesh, snapshotRole } from '../src/lab/transport';
import type { LaneSeed } from '../src/lab/transport';
import { normalizeUvcLabUrl } from '../src/lab/iomInvite';
import { spawnLaneWorker } from '../src/lab/laneBrowserHost';
import type { RoleSnapshot } from '../src/lab/projection';
import type { FeedRow } from '../src/lab/portIpc';
import { LaneChat } from '../src/lab/LaneChat';
import { CLEAN_COMMAND, DEVICE_CHAT_COMMANDS } from '../src/lab/deviceChatCommands';
import { DEMO_CLEANING } from '../src/lab/demoCleaning';
import { roomCleaningStatus } from '../src/lab/laneViewModel';
import { labThemeIsDark, nextLabThemeMode, parseLabThemeMode, type LabThemeMode } from '../src/lab/theme';

const ROLES = ['admin', 'doctor', 'lamp', 'sensor'] as const;
type Role = typeof ROLES[number];
const LABELS: Record<Role, string> = { doctor: 'Doctor', lamp: 'Lamp', sensor: 'Sensor', admin: 'Admin' };
/** Chats with these workers carry only device commands. */
const DEVICE_ROLES: readonly Role[] = ['lamp', 'sensor'];
const DEVICE_SWITCHES = ['on', 'off'] as const;
/** The checkmark from the UVC logo marks every verified admin signature. */
const CHECKMARK = require('../src/assets/images/uvc-check-favicon.png');
const LANE = 'lab';
const THREAD = `${LANE}:welcome`;
const LAB_THEME_STORAGE_KEY = 'uvc-lab-theme';
const appThemeStorageKey = (role: Role) => `uvc-lab-${role}-theme`;
function initialLabTheme(): LabThemeMode {
  if (Platform.OS !== 'web') return 'system';
  try {
    return parseLabThemeMode(globalThis.localStorage?.getItem(LAB_THEME_STORAGE_KEY) ?? null) ?? 'system';
  } catch {
    return 'system';
  }
}
function initialAppThemes(): Partial<Record<Role, boolean>> {
  if (Platform.OS !== 'web') return {};
  try {
    return Object.fromEntries(ROLES.flatMap(role => {
      const value = globalThis.localStorage?.getItem(appThemeStorageKey(role));
      return value === 'dark' || value === 'light' ? [[role, value === 'dark']] : [];
    })) as Partial<Record<Role, boolean>>;
  } catch {
    return {};
  }
}
const short = (value?: string | null) => value ? `${value.slice(0, 8)}…${value.slice(-4)}` : 'Not available';
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
type Row = { time: string; role: string; text: string };
type Column = { snapshot?: RoleSnapshot; error?: string; snapshotError?: string; busy?: boolean; invite?: string; inviteError?: string; inviteBusy?: boolean; inviteNotice?: string };
type Plan = { planId: string; title: string };

export default function LabLane() {
  const systemTheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<LabThemeMode>(initialLabTheme);
  const dark = labThemeIsDark(themeMode, systemTheme === 'dark');
  const [appDark, setAppDark] = useState<Partial<Record<Role, boolean>>>(initialAppThemes);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    try { globalThis.localStorage?.setItem(LAB_THEME_STORAGE_KEY, themeMode); } catch { /* Storage can be unavailable. */ }
  }, [themeMode]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    try {
      for (const role of ROLES) {
        const override = appDark[role];
        if (override === undefined) globalThis.localStorage?.removeItem(appThemeStorageKey(role));
        else globalThis.localStorage?.setItem(appThemeStorageKey(role), override ? 'dark' : 'light');
      }
    } catch { /* Storage can be unavailable. */ }
  }, [appDark]);
  const changeLaneTheme = () => {
    setThemeMode(previous => nextLabThemeMode(previous));
    setAppDark({});
  };
  const toggleAppTheme = (role: Role, currentDark: boolean) => {
    setAppDark(previous => ({...previous, [role]: !currentDark}));
  };
  const c = Colors[dark ? 'dark' : 'light'];
  const [pages, setPages] = useState<Partial<Record<Role, 'app' | 'settings'>>>({});
  const [stage, setStage] = useState('Starting workers');
  const [status, setStatus] = useState<'starting' | 'ready' | 'partial' | 'failed'>('starting');
  const [columns, setColumns] = useState<Partial<Record<Role, Column>>>({});
  const [logs, setLogs] = useState<Row[]>([]);
  const [showLog, setShowLog] = useState(false);
  const activityRef = useRef<ScrollView>(null);
  const followActivityRef = useRef(true);
  const activityOffsetRef = useRef(0);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [title, setTitle] = useState<string>(DEMO_CLEANING.title);
  const [dose, setDose] = useState(String(DEMO_CLEANING.targetDoseJm2));
  const [duration, setDuration] = useState(String(DEMO_CLEANING.durationS));
  const [energy, setEnergy] = useState(String(DEMO_CLEANING.energyPerSecondMilli));
  const [irradiance, setIrradiance] = useState(String(DEMO_CLEANING.irradianceMwCm2));
  const [selectedCycle, setSelectedCycle] = useState('');
  const [cycleIds, setCycleIds] = useState<string[]>([]);
  const [join, setJoin] = useState<{ role: Role; url: string } | null>(null);
  const [joined, setJoined] = useState(false);
  const [dataErrors, setDataErrors] = useState<Partial<Record<Role, string>>>({});
  const seedRef = useRef<LaneSeed | undefined>(undefined);
  const inviteRefs = useRef<Partial<Record<Role, { seed: LaneSeed; token: string; invitationUrl: string }>>>({});
  const inviteMintingRef = useRef(new Set<Role>());
  const cyclesRef = useRef<string[]>([]);
  const busyRef = useRef(new Set<Role>());
  const refreshRef = useRef<(role: Role) => Promise<void>>(async () => {});
  const mounted = useRef(false);
  const log = (role: string, text: string) => {
    if (mounted.current) setLogs(previous => [...previous.slice(-199), { role, text, time: new Date().toLocaleTimeString() }]);
  };
  const followActivity = () => {
    if (followActivityRef.current) activityRef.current?.scrollToEnd({ animated: false });
  };
  useEffect(() => {
    if (!showLog) {
      followActivityRef.current = true;
      activityOffsetRef.current = 0;
      return;
    }
    // At the 200-entry limit, new rows need not change the content height.
    // Follow each committed update as well as layout/content-size changes.
    const frame = requestAnimationFrame(followActivity);
    return () => cancelAnimationFrame(frame);
  }, [logs, showLog]);
  const patch = (role: Role, value: Partial<Column>) => {
    if (mounted.current) setColumns(previous => ({ ...previous, [role]: { ...previous[role], ...value } }));
  };
  const rememberCycle = (id: string) => {
    if (!cyclesRef.current.includes(id)) {
      cyclesRef.current = [...cyclesRef.current, id];
      setCycleIds([...cyclesRef.current]);
      setSelectedCycle(previous => previous || id);
    }
  };
  const startDeviceInvite = async (role: Role, seed: LaneSeed): Promise<void> => {
    if (inviteMintingRef.current.has(role)) return;
    inviteMintingRef.current.add(role);
    patch(role, { inviteError: undefined, inviteNotice: undefined, inviteBusy: true });
    try {
      const invite = await mintIoMInvite({ client: seed.clients[role] });
      if (seedRef.current !== seed) return;
      const inviteUrl = new URL(invite.invitationUrl);
      inviteUrl.searchParams.set('adminPerson', seed.persons.admin);
      const invitationUrl = inviteUrl.href;
      inviteRefs.current[role] = { seed, token: invite.token, invitationUrl };
      patch(role, { invite: invitationUrl });
      log(LABELS[role], 'Device invitation ready');
      void seed.clients[role].call('uvcLane', 'awaitIoMInvite', { token: invite.token, timeoutMs: 600_000 })
        .then(() => {
          const active = inviteRefs.current[role];
          if (seedRef.current !== seed || active?.token !== invite.token || active.invitationUrl !== invitationUrl) return;
          delete inviteRefs.current[role];
          patch(role, { invite: undefined, inviteError: undefined, inviteNotice: 'Device paired. Create another QR invite to add a device.' });
          log(LABELS[role], 'Second device paired');
          void refreshRef.current(role);
        })
        .catch(error => {
          const active = inviteRefs.current[role];
          if (seedRef.current !== seed || active?.token !== invite.token || active.invitationUrl !== invitationUrl) return;
          delete inviteRefs.current[role];
          patch(role, { invite: undefined, inviteError: message(error) });
          log(LABELS[role], `Device invitation failed: ${message(error)}`);
        });
    } finally {
      if (seedRef.current === seed) {
        inviteMintingRef.current.delete(role);
        patch(role, { inviteBusy: false });
      }
    }
  };

  useEffect(() => {
    mounted.current = true;
    // Fast Refresh can restart this effect while retaining React state. Every
    // worker lifetime owns a fresh UI session, including pending operations.
    seedRef.current = undefined;
    inviteRefs.current = {};
    inviteMintingRef.current.clear();
    cyclesRef.current = [];
    busyRef.current.clear();
    refreshRef.current = async () => {};
    setJoined(false);
    setJoin(null);
    setColumns({});
    setPlans([]);
    setCycleIds([]);
    setSelectedCycle('');
    setPages({});
    setStage('Starting workers');
    setStatus('starting');
    setLogs([]);
    setShowLog(false);
    setDataErrors({});
    setTitle('');
    setDose('');
    setDuration('');
    setEnergy('');
    setIrradiance('');
    let cancelled = false;
    let running: LaneSeed | undefined;
    const unsubscribers: (() => void)[] = [];
    const timers = new Map<Role, ReturnType<typeof setTimeout>>();
    const reading = new Set<Role>();
    const dirty = new Set<Role>();
    const checkActive = () => { if (cancelled) throw new Error('Lane closed'); };
    const stageChanged = (text: string) => { if (!cancelled) { setStage(text); log('Lane', text); } };
    const refresh = async (role: Role) => {
      if (cancelled || !running) return;
      if (reading.has(role)) { dirty.add(role); return; }
      reading.add(role);
      try {
        const snapshot = await snapshotRole({ client: running.clients[role], role, threads: [THREAD], journalStream: `${LANE}:${role}`, cycleIds: [...cyclesRef.current] });
        if (!cancelled) patch(role, { snapshot, snapshotError: undefined });
      } catch (error) {
        if (!cancelled) patch(role, { snapshotError: message(error) });
      } finally {
        reading.delete(role);
        if (dirty.delete(role) && !cancelled) schedule(role);
      }
    };
    const schedule = (role: Role) => {
      if (cancelled || timers.has(role)) return;
      timers.set(role, setTimeout(() => { timers.delete(role); void refresh(role); }, 100));
    };
    refreshRef.current = refresh;
    void (async () => {
      try {
        if (Platform.OS !== 'web') throw new Error('Open /lab in a browser to run the independent lab workers.');
        const location = normalizeUvcLabUrl(window.location.href);
        const invited = location.searchParams.get('invited') === 'true';
        const queryRole = location.searchParams.get('role');
        if (invited && !ROLES.includes(queryRole as Role)) throw new Error('This invitation has no valid UVC role. Create a new device invitation from the lab.');
        const roles = invited ? [queryRole as Role] : [...ROLES];
        const email = location.searchParams.get('fe');
        const adminPerson = location.searchParams.get('adminPerson');
        if (invited && (!adminPerson || !/^[0-9a-f]{64}$/.test(adminPerson))) throw new Error('This invitation is missing the lab Admin identity. Create a new QR invitation from the lab.');
        if (invited && (!email || !email.includes('@') || !location.hash)) throw new Error('The device invitation is incomplete.');
        if (invited) { setJoin({ role: roles[0], url: location.href }); }
        const relay = location.searchParams.get('commServer') || 'wss://api.glue.one/comm';
        if (!['ws:', 'wss:'].includes(new URL(relay).protocol)) throw new Error('The relay must use ws:// or wss://.');
        const session = globalThis.crypto.randomUUID();
        running = await bootLane({ lane: LANE, roles, adminPerson: invited ? adminPerson! : undefined, onStage: stageChanged, spawn: role => {
          checkActive();
          const appBase = new URL(location.origin + location.pathname);
          appBase.searchParams.set('role', role);
          const workerVersion = process.env.EXPO_PUBLIC_LANE_WORKER_VERSION;
          const workerUrl = workerVersion ? `/lane.worker.js?v=${workerVersion}` : '/lane.worker.js';
          return spawnLaneWorker({ role, lane: LANE, email: invited ? email! : `${role}@lab.local`, secret: `lab-${role}`, session, commServerUrl: relay, appBaseUrl: appBase.href, workerUrl });
        } });
        if (cancelled) { await running.host.stop(); return; }
        seedRef.current = running;
        for (const role of roles) {
          unsubscribers.push(running.host.clients[role].onFeed((row: FeedRow) => {
            if (cancelled) return;
            if (row.type === 'UvcLaneCycle' && typeof row.obj?.cycleId === 'string') rememberCycle(row.obj.cycleId);
            if (row.type === 'UvcLanePhase' && typeof row.obj?.planId === 'string') {
              const plan = { planId: row.obj.planId, title: String(row.obj.title || row.obj.planId) };
              setPlans(previous => previous.some(p => p.planId === plan.planId) ? previous : [...previous, plan]);
            }
            log(LABELS[role], `${row.kind || row.type}: ${row.id}`);
            schedule(role);
          }));
          unsubscribers.push(running.host.clients[role].onControl(control => {
            const kind = (control as { kind?: string })?.kind;
            if (kind === 'connections-changed' || kind === 'automatic-attestation-changed') schedule(role);
          }));
        }
        if (invited) {
          stageChanged('Device ready to join');
          setStatus('ready');
        } else {
          const result = await seedLaneMesh({ seed: running, lane: LANE, roles, welcomeThread: THREAD, onStage: stageChanged });
          checkActive();
          stageChanged('Preparing contact chats');
          await Promise.all(roles.map(role => running!.clients[role].call('chat', 'watchPeers', {
            peers: roles.filter(peer => peer !== role).map(peer => running!.persons[peer]),
          })));
          checkActive();
          await running.clients.admin.call('uvcLane', 'enableAutomaticAttestation', { audience: Object.values(running.persons) });
          await Promise.all(DEVICE_ROLES.map(role => running!.clients[role].call('device', 'enable', { audience: Object.values(running!.persons) })));
          checkActive();
          result.failures.forEach(error => log('Lane', error));
          setStatus(result.failures.length ? 'partial' : 'ready');
          stageChanged(result.failures.length ? 'Some connections failed — see activity' : 'All four workers connected');
        }
        await Promise.all(roles.map(refresh));
        if (!invited && !cancelled) {
          await Promise.all(roles.map(async role => {
            try { await startDeviceInvite(role, running!); }
            catch (error) {
              if (!cancelled) {
                patch(role, { inviteError: message(error) });
                log(LABELS[role], `Device invitation failed: ${message(error)}`);
              }
            }
          }));
        }
      } catch (error) {
        if (!cancelled) { setStatus('failed'); stageChanged(message(error)); }
      }
    })();
    return () => {
      cancelled = true;
      mounted.current = false;
      seedRef.current = undefined;
      inviteRefs.current = {};
      inviteMintingRef.current.clear();
      busyRef.current.clear();
      refreshRef.current = async () => {};
      unsubscribers.forEach(unsubscribe => unsubscribe());
      timers.forEach(clearTimeout);
      if (running) void running.host.stop();
    };
  }, []);

  const roles: Role[] = join ? [join.role] : [...ROLES];
  const assertSession = (seed: LaneSeed) => {
    if (!mounted.current || seedRef.current !== seed) throw new Error('This lab session has ended.');
  };
  const run = async (role: Role, action: (seed: LaneSeed) => Promise<void>) => {
    const seed = seedRef.current;
    if (!seed || busyRef.current.has(role)) return;
    busyRef.current.add(role);
    patch(role, { busy: true, error: undefined });
    try { await action(seed); assertSession(seed); await refreshRef.current(role); }
    catch (error) { if (seedRef.current === seed) { patch(role, { error: message(error) }); log(LABELS[role], message(error)); } }
    finally { if (seedRef.current === seed) { busyRef.current.delete(role); patch(role, { busy: false }); } }
  };
  const positive = (value: string, label: string) => {
    const number = Number(value);
    if (!value.trim() || !Number.isFinite(number) || number <= 0) throw new Error(`${label} must be greater than zero.`);
    return number;
  };
  const call = async (seed: LaneSeed, role: Role, method: string, params: Record<string, unknown> = {}) => {
    assertSession(seed);
    const audience = new Set(Object.values(seed.persons));
    if (method !== 'acceptIoMInvite' && Object.keys(seed.clients).length === 1) {
      const assignments = await seed.clients[role].call<{ role: string; person: string }[]>('uvcLane', 'listRoles', { lane: LANE });
      assertSession(seed);
      assignments.forEach(assignment => audience.add(assignment.person));
      if (ROLES.some(expected => !assignments.some(assignment => assignment.role === expected))) throw new Error('Publish role assignments from the original Admin and wait for them to arrive before sharing team records.');
    }
    const result = await seed.clients[role].call('uvcLane', method, { ...params, audience: [...audience] });
    assertSession(seed);
    return result;
  };
  /** Doctor controls the lamp through the same chat command channel as the chat buttons. */
  const sendLampCommand = async (seed: LaneSeed, command: typeof DEVICE_SWITCHES[number] | typeof CLEAN_COMMAND) => {
    assertSession(seed);
    let lamp = seed.persons.lamp;
    if (!lamp) {
      const assignments = await seed.clients.doctor.call<{ role: string; person: string }[]>('uvcLane', 'listRoles', { lane: LANE });
      lamp = assignments.find(assignment => assignment.role === 'lamp')?.person ?? '';
    }
    if (!lamp) throw new Error('The lamp role has not arrived at this device yet.');
    await seed.clients.doctor.call('chat', 'sendChat', { peer: lamp, text: command });
    assertSession(seed);
  };
  const exportData = async (role: Role) => {
    const seed = seedRef.current;
    setDataErrors(previous => ({ ...previous, [role]: '' }));
    try {
      if (!seed) throw new Error('Wait for the lane workers to start.');
      const snapshots = await Promise.all([role].map(role => snapshotRole({ client: seed.clients[role], role, threads: [THREAD], journalStream: `${LANE}:${role}`, cycleIds: [...cyclesRef.current] })));
      assertSession(seed);
      const peers = [...new Set([
        ...Object.values(seed.persons),
        ...snapshots.flatMap(snapshot => snapshot.connections.map(link => link.remotePersonId).filter((person): person is string => !!person)),
      ])].filter(person => person !== seed.persons[role]);
      const messages = (await Promise.all(peers.map(async peer => {
        const result = await seed.clients[role].call<{messages: {id: string; text: string; sender: string; sentAt: number}[]}>('chat', 'readChat', {peer, count: 200});
        return result.messages.map(row => ({role, peer, ...row}));
      }))).flat();
      assertSession(seed);
      const XLSX = await import('xlsx');
      assertSession(seed);
      const book = XLSX.utils.book_new();
      const sheets: [string, object[]][] = [
        ['Overview', [{ exportedAt: new Date().toISOString(), scope: `${LABELS[role]} app snapshot; up to 20 recent journal entries and 200 messages per contact`, environment: 'Simulation, not clinical evidence' }]],
        ['Workers', snapshots.map(s => ({ role: s.role, person: s.person, instance: s.instanceId }))],
        ['Connections', snapshots.flatMap(s => s.connections.map(row => ({ role: s.role, ...row })))],
        ['Cycles', snapshots.flatMap(s => s.cycles.map(row => ({ role: s.role, ...row })))],
        ['Device changes', snapshots.flatMap(s => s.deviceChanges.map(row => ({ role: s.role, ...row })))],
        ['Attestations', snapshots.flatMap(s => s.attestations.map(({records, ...row}) => ({ role: s.role, ...row, records: records.join(', ') })))],
        ['Journal', snapshots.flatMap(s => s.journalTail.map(({ signatures, ...row }) => ({ role: s.role, ...row, signatures: signatures.join(', ') })))],
        ['Messages', messages],
      ];
      for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), name);
      XLSX.writeFile(book, `uvc-${role}-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (error) { if (seedRef.current === seed) setDataErrors(previous => ({ ...previous, [role]: message(error) })); }
  };

  const controls = (c: typeof Colors.light | typeof Colors.dark) => {
  const button = (label: string, action: () => void, disabled = false, primary = false) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={action} style={[s.button, { borderColor: c.border, backgroundColor: primary ? c.primary : c.surface, opacity: disabled ? 0.45 : 1 }]}>
      <Text style={[s.buttonText, { color: primary ? c.onPrimary : c.text }]}>{label}</Text>
    </Pressable>
  );
  const field = (label: string, value: string, onChangeText: (value: string) => void, numeric = false) => (
    <View style={s.field}><Text style={[s.caption, { color: c.textSecondary }]}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} keyboardType={numeric ? 'decimal-pad' : 'default'} style={[s.input, { borderColor: c.border, color: c.text, backgroundColor: c.background }]} /></View>
  );
  const note = (text: string) => <Text style={[s.body, { color: c.textSecondary }]}>{text}</Text>;
  const heading = (text: string) => <Text style={[s.sectionTitle, { color: c.text }]}>{text}</Text>;
  /** A big on/off state tile; `on === null` means nothing has been recorded yet. */
  const indicator = (icon: 'lightbulb' | 'motion-sensor', label: string, on: boolean | null, detail: string) => (
    <View accessibilityLabel={`${label} ${on === null ? 'unknown' : on ? 'on' : 'off'}`} accessibilityLiveRegion="polite" style={[s.indicator, { borderColor: on ? c.warning : c.border, backgroundColor: c.background }]}>
      <MaterialCommunityIcons name={icon === 'lightbulb' ? (on ? 'lightbulb-on' : 'lightbulb-outline') : (on ? 'motion-sensor' : 'motion-sensor-off')} size={44} color={on ? c.warning : c.textSecondary} />
      <View style={s.grow}>
        <Text style={[s.sectionTitle, { color: c.text }]}>{label} {on === null ? '—' : on ? 'on' : 'off'}</Text>
        <Text style={[s.caption, { color: c.textSecondary }]}>{detail}</Text>
      </View>
    </View>
  );
  return {button, field, note, heading, indicator};
  };
  const {button, note, heading} = controls(c);
  const ready = status === 'ready' || status === 'partial';

  return <View style={[s.root, { backgroundColor: c.background }]}>
    <View style={[s.header, { borderBottomColor: c.border }]}>
      <Text style={[s.title, { color: c.text }]}>UVC lab</Text>
      {status === 'starting' && <ActivityIndicator color={c.primary} />}
      <Text accessibilityLiveRegion="polite" style={[s.body, s.grow, { color: status === 'failed' || status === 'partial' ? c.error : c.textSecondary }]}>{stage}</Text>
      {button('Activity', () => setShowLog(!showLog))}
      <Pressable testID="lab-theme-toggle" accessibilityRole="button" accessibilityLabel={`Switch lab to ${nextLabThemeMode(themeMode)} mode`} accessibilityHint="Changes the lab and all four apps" onPress={changeLaneTheme} style={[s.themeButton, {borderColor: c.border, backgroundColor: c.surface}]}>
        <MaterialCommunityIcons name={nextLabThemeMode(themeMode) === 'system' ? 'monitor' : nextLabThemeMode(themeMode) === 'dark' ? 'weather-night' : 'weather-sunny'} size={20} color={c.textSecondary} />
      </Pressable>
    </View>
    <ScrollView testID="lab-workspace-scroll" contentContainerStyle={s.workspace}>
    <ScrollView horizontal testID="lab-lane-scroll" contentContainerStyle={s.lane}>
      {roles.map(role => {
          const roleDark = appDark[role] ?? dark;
          const c = Colors[roleDark ? 'dark' : 'light'];
          const {button, field, note, heading, indicator} = controls(c);
          const settings = pages[role] === 'settings';
          const column = columns[role] || {};
          const snap = column.snapshot;
          const lightOn = snap?.lightState ? snap.lightState.on : null;
          const cycle = snap?.cycles.find(row => row.cycleId === selectedCycle);
          const roomStatus = roomCleaningStatus(snap?.cycles ?? [], cycleIds, !snap || !!column.snapshotError);
          const disabled = !ready || !!column.busy || (!!join && !joined);
          const plan = plans[plans.length - 1];
          const changes = snap?.deviceChanges ?? [];
          const pendingChanges = changes.some(change => !change.attested);
          const peerPersons = [...new Set([
            ...Object.values(seedRef.current?.persons ?? {}),
            ...(snap?.connections.map(link => link.remotePersonId).filter((person): person is string => !!person) ?? []),
          ])].filter(person => person !== snap?.person && person !== seedRef.current?.persons[role]);
          const chatPeers = peerPersons.map(person => {
            const knownRole = ROLES.find(candidate => seedRef.current?.persons[candidate] === person);
            return {person, name: knownRole ? LABELS[knownRole] : short(person), commands: knownRole && DEVICE_ROLES.includes(knownRole) ? DEVICE_CHAT_COMMANDS : undefined};
          });
          return <View key={role} testID={`lab-column-${role}`} style={s.column}>
            <View testID={`lab-app-${role}`} style={[s.app, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[s.appHeader, {borderBottomColor: c.border}]}>
              <UvcLogo dark={roleDark} width={64} />
              <Text style={[s.appTitle, s.grow, {color: c.text}]}>{LABELS[role]}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`${LABELS[role]} ${roleDark ? 'light' : 'dark'} mode`} onPress={() => toggleAppTheme(role, roleDark)} style={s.iconButton}>
                <MaterialCommunityIcons name={roleDark ? 'weather-sunny' : 'weather-night'} size={20} color={c.textSecondary} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`${LABELS[role]} ${settings ? 'back to app' : 'settings'}`} onPress={() => setPages(previous => ({...previous, [role]: settings ? 'app' : 'settings'}))} style={s.iconButton}>
                <MaterialCommunityIcons name={settings ? 'arrow-left' : 'cog-outline'} size={20} color={settings ? c.primary : c.textSecondary} />
              </Pressable>
            </View>
            <ScrollView testID={`lab-app-scroll-${role}`} style={s.appScroll} contentContainerStyle={s.appContent} nestedScrollEnabled>
            {role === 'sensor' && !settings && <>
              {indicator('lightbulb', 'Lamp', lightOn, 'Lamp state as shared with this sensor')}
              {indicator('motion-sensor', 'Sensor', snap?.sensorState ? snap.sensorState.on : null, snap?.sensorState?.reason ?? 'No sensor state recorded.')}
              <View style={s.row}>{button('Record sensor on', () => { void run(role, async seed => { await call(seed, role, 'setSensorState', { on: true, reason: 'Manual lab simulation' }); }); }, disabled)}{button('Record sensor off', () => { void run(role, async seed => { await call(seed, role, 'setSensorState', { on: false, reason: 'Manual lab simulation' }); }); }, disabled)}</View>
            </>}
            {role === 'lamp' && !settings && <>
              {indicator('lightbulb', 'Lamp', lightOn, snap?.lightState?.reason ?? 'No light state recorded.')}
              <View style={s.row}>{button('Record light on', () => { void run(role, async seed => { await call(seed, role, 'setLightState', { on: true, reason: 'Manual lab simulation' }); }); }, disabled)}{button('Record light off', () => { void run(role, async seed => { await call(seed, role, 'setLightState', { on: false, reason: 'Manual lab simulation' }); }); }, disabled)}</View>
            </>}
            {column.busy && <ActivityIndicator color={c.primary} />}
            {(role !== 'doctor' || settings) && note(`${snap?.connections.filter(link => link.isConnected).length ?? 0} active connections · ${short(snap?.person)}`)}
            {column.error && <Text accessibilityRole="alert" selectable style={[s.body, { color: c.error }]}>{column.error}</Text>}
            {column.snapshotError && <Text accessibilityRole="alert" selectable style={[s.body, { color: c.error }]}>{column.snapshotError}</Text>}
            {join && !joined && <>{note('Join this browser as another device of the invited lab identity.')}{button('Join device', () => { void run(role, async seed => { await call(seed, role, 'acceptIoMInvite', { invitationUrl: join.url }); setJoined(true); setStage('Device joined'); }); }, !ready || !!column.busy, true)}</>}
            {!settings && <>
            {role === 'doctor' && <>
              {heading('Room cleaning')}
              <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
                {heading(roomStatus.title)}
                {note(roomStatus.detail)}
              </View>
              {button('Clean room', () => { void run(role, async seed => { await sendLampCommand(seed, CLEAN_COMMAND); }); }, disabled || !!snap?.cycles.some(row => !row.ended), true)}
              {note(`Demo cycle: lamp on for ${DEMO_CLEANING.durationS} s at ${DEMO_CLEANING.irradianceMwCm2} mW/cm² (${DEMO_CLEANING.targetDoseJm2} J/m²), ${DEMO_CLEANING.energyPerSecondMilli / 1000} J per second. The sensor measures while the lamp is on.`)}
              {heading('Lamp control')}
              {indicator('lightbulb', 'Lamp', lightOn, 'As last recorded by the lamp')}
              <View style={s.row}>{DEVICE_SWITCHES.map(command => <React.Fragment key={command}>{button(`Lamp ${command}`, () => { void run(role, async seed => { await sendLampCommand(seed, command); }); }, disabled, command === 'on')}</React.Fragment>)}</View>
              {note('The lamp switches itself and answers in your chat with Lamp.')}
            </>}
            {role === 'lamp' && <>
              {heading('Treatment parameters')}
              {field('Phase title', title, setTitle)}<View style={s.row}>{field('Target dose (J/m²)', dose, setDose, true)}{field('Duration (seconds)', duration, setDuration, true)}</View>
              {button('Save phase', () => { void run(role, async seed => {
                if (!title.trim()) throw new Error('Enter a phase title.');
                const result = await call(seed, role, 'planPhase', { title: title.trim(), targetDoseJm2: positive(dose, 'Target dose'), durationS: positive(duration, 'Duration') }) as { planId: string };
                setPlans(previous => previous.some(p => p.planId === result.planId) ? previous : [...previous, { planId: result.planId, title: title.trim() }]);
              }); }, disabled)}
              {note(plan ? `Latest phase: ${plan.title}` : 'No phase saved in this session.')}
              {button('Start cycle', () => { void run(role, async seed => { const result = await call(seed, role, 'startCycle', { planId: plan!.planId }) as { cycleId: string }; rememberCycle(result.cycleId); setSelectedCycle(result.cycleId); }); }, disabled || !plan, true)}
            </>}
            {role !== 'doctor' && <>
            {heading('Cycle recording')}
            {cycleIds.length ? <View style={s.row}>{cycleIds.map((id, index) => <React.Fragment key={id}>{button(`Cycle ${index + 1}`, () => setSelectedCycle(id), false, selectedCycle === id)}</React.Fragment>)}</View> : note('No cycles created in this session.')}
            {cycle ? <>{note(`${cycle.ended ? 'Closed' : 'Open'} · ${cycle.energyReadings} energy records · ${cycle.sensorReadings} sensor readings`)}{note(cycle.signedBy ? `Device records attested by ${short(cycle.signedBy)}` : 'Current cycle records are not fully attested.')}</> : !!selectedCycle && note('Waiting for this cycle to arrive at this worker.')}
            </>}
            {role === 'lamp' && button('Close cycle', () => { void run(role, async seed => { await call(seed, role, 'closeCycle', { cycleId: selectedCycle, reason: 'Closed by lamp operator in lab' }); }); }, disabled || !cycle || cycle.ended)}
            {role === 'lamp' && <>
              {field('Simulated energy (mJ)', energy, setEnergy, true)}
              {button('Record energy', () => { void run(role, async seed => { await call(seed, role, 'recordEnergy', { cycleId: selectedCycle, joulesMilli: positive(energy, 'Energy') }); }); }, disabled || !cycle || cycle.ended)}
            </>}
            {role === 'sensor' && <>
              {!snap?.sensorState?.on && note('Turn the simulated sensor on before recording readings.')}
              {field('Simulated irradiance (mW/cm²)', irradiance, setIrradiance, true)}
              {button('Record reading', () => { void run(role, async seed => { await call(seed, role, 'recordReading', { cycleId: selectedCycle, irradianceMwCm2: positive(irradiance, 'Irradiance') }); }); }, disabled || !snap?.sensorState?.on || !cycle || cycle.ended)}
            </>}
            </>}
            {((!settings && role === 'admin') || (settings && role === 'doctor')) && <>
              {heading('Device changes')}
              {!changes.length && note('Waiting for lamp and sensor changes to arrive.')}
              {changes.map(change => <View key={change.hash} style={[s.entry, { borderTopColor: c.border }]}>
                <Text style={[s.caption, { color: c.textSecondary }]}>{LABELS[change.sourceRole]} · {new Date(change.recordedAt).toLocaleTimeString()} · {change.attested ? 'Attested' : 'Pending attestation'}</Text>
                <Text selectable style={[s.body, { color: c.text }]}>{change.summary}</Text>
              </View>)}
              {role === 'admin' && <>
                {snap?.automaticAttestation?.error
                  ? <Text accessibilityRole="alert" style={{ color: c.error }}>Automatic signing failed: {snap.automaticAttestation.error}</Text>
                  : note(snap?.automaticAttestation?.busy || pendingChanges
                    ? 'Admin is automatically signing and sharing received changes with Doctor.'
                    : changes.length
                      ? 'All received changes are automatically attested and shared with Doctor.'
                      : 'Admin automatically signs lamp and sensor changes and shares them with Doctor.')}
              </>}
              {snap?.attestations.map(attestation => <View key={attestation.hash} style={[s.entry, { borderTopColor: c.border }]}>
                <Text style={[s.caption, { color: attestation.verified ? c.primary : c.textSecondary }]}>{attestation.verified ? 'Verified admin signature' : 'Signature not verified'} · {new Date(attestation.signedAt).toLocaleTimeString()}</Text>
                {note(`${attestation.records.length} device record${attestation.records.length === 1 ? '' : 's'} · Admin ${short(attestation.signer)}`)}
              </View>)}
            </>}
            {((!settings && role !== 'doctor') || (settings && role === 'doctor')) && <>
            {heading('Journal')}{!snap?.journalTail.length && note('No journal entries yet.')}
            {[...(snap?.journalTail ?? [])].sort((a, b) => b.recordedAt - a.recordedAt || b.seq - a.seq).map(row => row.kind === 'signal'
              ? <View key={row.idHash} accessibilityLabel={`${row.summary} ${row.verified ? 'signed by Admin, signature verified' : 'not verified'}`} style={[s.entry, s.signedEntry, { borderTopColor: c.border }]}>
                {row.verified ? <Image source={CHECKMARK} style={s.checkmark} accessibilityIgnoresInvertColors /> : <MaterialCommunityIcons name="alert-circle-outline" size={28} color={c.error} />}
                <View style={s.grow}>
                  <Text style={[s.sectionTitle, { color: c.text }]}>{row.summary}</Text>
                  <Text style={[s.caption, { color: row.verified ? c.primary : c.error }]}>{row.verified ? `Signed by Admin · ${new Date(row.recordedAt).toLocaleTimeString()} · signature verified` : 'Signature not verified'}</Text>
                </View>
              </View>
              : <View key={row.idHash} style={[s.entry, { borderTopColor: c.border }]}><Text style={[s.caption, { color: c.textSecondary }]}>{new Date(row.recordedAt).toLocaleTimeString()}</Text><Text selectable style={[s.body, { color: c.text }]}>{row.kind === 'attestation' && !row.verified ? 'Received attestation — signature not verified.' : row.summary}</Text>{row.kind === 'attestation' && <Text style={[s.caption, {color: row.verified ? c.primary : c.textSecondary}]}>{row.verified ? 'Verified admin attestation' : 'Unverified attestation'}</Text>}</View>)}
            </>}
            <LaneChat client={seedRef.current?.host.clients[role]} me={snap?.person ?? seedRef.current?.persons[role] ?? ''} peers={chatPeers} dark={roleDark} enabled={ready && (!join || joined)} hidden={settings} />
            {settings && <>
              {heading('Settings')}
              {heading('Appearance')}
              {note(`${LABELS[role]} is using ${roleDark ? 'dark' : 'light'} mode.`)}
              {button(`Use ${roleDark ? 'light' : 'dark'} mode`, () => toggleAppTheme(role, roleDark))}
              {heading('Data')}
              {note('Export this app’s records, connections, and recent journal and messages as an Excel workbook.')}
              {button('Export XLSX', () => { void exportData(role); }, !ready, true)}
              {!!dataErrors[role] && <Text accessibilityRole="alert" style={{color: c.error}}>{dataErrors[role]}</Text>}
            {heading('Connections')}
            {snap?.connections.map((link, index) => <Text key={`${link.remoteInstanceId}:${index}`} selectable style={[s.body, { color: c.textSecondary }]}>{link.isConnected ? 'Connected' : 'Disconnected'} · {link.isInternetOfMe ? 'Own device' : 'Peer'} · {short(link.remoteInstanceId)}</Text>)}
            {button('Refresh', () => { void refreshRef.current(role); }, !ready)}
              {role === 'admin' && <>
              {!join && <>{heading('Role assignments')}{note('Publish the lab role assignments explicitly.')}{button('Publish role assignments', () => { void run(role, async seed => { for (const target of ROLES) await call(seed, role, 'assignRole', { lane: LANE, targetPerson: seed.persons[target], roleName: target }); }); }, disabled)}</>}
              </>}
            </>}
            </ScrollView>
            </View>
            {!join && <View testID={`lab-invite-${role}`} style={[s.invite, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={s.row}><Text style={[s.sectionTitle, s.grow, { color: c.text }]}>{LABELS[role]} · IoM</Text>
                {button(column.invite ? 'New QR invite' : 'Create QR invite', () => { void run(role, async seed => { await startDeviceInvite(role, seed); }); }, disabled || !!column.inviteBusy)}
              </View>
              {note('Join this identity on another device.')}
              {column.inviteError && <Text accessibilityRole="alert" selectable style={[s.body, { color: c.error }]}>{column.inviteError}</Text>}
              {column.invite ? <>
                <View style={s.qr}><QRCodeSVG value={column.invite} size={176} title={`${LABELS[role]} IoM device invitation`} /></View>
                {note('Scan with your second device. Valid for ten minutes.')}
                <TextInput accessibilityLabel={`${LABELS[role]} device invitation link`} multiline editable={false} value={column.invite} style={[s.input, s.inviteLink, { color: c.text, borderColor: c.border }]} />
              </> : note(column.inviteError ? 'Create a new invitation to retry.' : column.inviteNotice || (column.inviteBusy ? 'Preparing device invitation…' : ready ? 'Create a QR invite to add a device.' : 'The QR invitation will appear when this app is ready.'))}
            </View>}
          </View>;
      })}
    </ScrollView>
    </ScrollView>
      {showLog && <ScrollView
        ref={activityRef}
        testID="lab-activity-scroll"
        style={s.activity}
        contentContainerStyle={[s.card, { backgroundColor: c.surface, borderColor: c.border }]}
        onLayout={followActivity}
        onContentSizeChange={followActivity}
        scrollEventThrottle={16}
        onScroll={({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
          const atBottom = contentSize.height - layoutMeasurement.height - contentOffset.y <= 32;
          // New rows can arrive between scrollToEnd and its scroll event. A
          // growing bottom gap alone must not be mistaken for scrolling up.
          if (atBottom) followActivityRef.current = true;
          else if (contentOffset.y < activityOffsetRef.current - 1) followActivityRef.current = false;
          activityOffsetRef.current = contentOffset.y;
        }}
      >{heading('Activity')}{note('Recent worker events and startup progress. Maximum 200 entries.')}{logs.map((row, index) => <Text selectable key={index} style={[s.log, { color: c.textSecondary }]}>{row.time} · {row.role} · {row.text}</Text>)}</ScrollView>}
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  title: { fontSize: 16, fontWeight: '600' }, grow: { flex: 1, minWidth: 0 },
  themeButton: { width: 44, height: 44, borderWidth: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  workspace: { flexGrow: 1 },
  lane: { padding: 16, gap: 12, alignItems: 'flex-start' },
  column: { width: 360, gap: 12, flexShrink: 0 },
  app: { width: 360, height: 640, borderWidth: 1, borderRadius: 8, overflow: 'hidden', flexShrink: 0 },
  appHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1 },
  appTitle: {fontSize: 14, fontWeight: '600'}, iconButton: {width: 36, height: 44, alignItems: 'center', justifyContent: 'center'},
  appScroll: { flex: 1, minHeight: 0 },
  appContent: {padding: 16, gap: 12}, activity: {maxHeight: 200},
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  signedEntry: { flexDirection: 'row', alignItems: 'center', gap: 10 }, checkmark: { width: 28, height: 28 },
  indicator: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 2, borderRadius: 8 },
  card: { padding: 20, borderWidth: 1, borderRadius: 8, gap: 12 }, sectionTitle: { fontSize: 17, lineHeight: 24, fontWeight: '600' }, body: { fontSize: 14, lineHeight: 21 }, caption: { fontSize: 12, lineHeight: 18 },
  button: { paddingHorizontal: 14, paddingVertical: 11, minHeight: 44, borderWidth: 1, borderRadius: 6, justifyContent: 'center', alignSelf: 'flex-start' }, buttonText: { fontSize: 13, fontWeight: '600' },
  field: { flexGrow: 1, minWidth: 120, gap: 5 }, input: { fontSize: 14, borderWidth: 1, borderRadius: 6, padding: 11, minHeight: 44, width: '100%' }, entry: { paddingTop: 9, borderTopWidth: 1, gap: 3 },
  invite: { gap: 12, padding: 16, borderWidth: 1, borderRadius: 8 }, inviteLink: {fontSize: 12, maxHeight: 76}, qr: { padding: 12, backgroundColor: '#fff', alignSelf: 'flex-start' }, log: { fontSize: 12, lineHeight: 19 },
});
