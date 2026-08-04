import { Link } from '@tanstack/react-router';
import {useCallback, useEffect, useRef, useState} from 'react';
import {
  Camera,
  ChevronRight,
  CircleDot,
  Lightbulb,
  Link2,
  Radio,
  RefreshCw,
  ShieldCheck,
  ShieldQuestion,
  Wifi,
  WifiOff,
} from 'lucide-react';

import type {
  UvcDevice as DiscoveryDeviceSnapshot,
  UvcDevicesViewProps,
  UvcLightDeviceKind,
  UvcLightState,
} from '@uvc/uvc.ui';

function normalizedTrustState(device: DiscoveryDeviceSnapshot): string {
  return (device.trustState ?? 'unknown').trim().toLowerCase();
}

function isTrusted(device: DiscoveryDeviceSnapshot): boolean {
  return ['paired', 'trusted', 'claimed', 'owned', 'accepted', 'verified'].includes(normalizedTrustState(device));
}

function isCamera(device: DiscoveryDeviceSnapshot): boolean {
  const searchable = [device.name, device.type, device.role, ...(device.capabilities ?? [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return ['camera', 'esp32-cam', 'mjpeg', 'rtsp', 'image'].some((value) => searchable.includes(value));
}

function formatLastSeen(value?: string): string {
  if (!value) {
    return 'Not reported';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const elapsedMs = Date.now() - parsed.getTime();
  const elapsedMinutes = Math.max(0, Math.floor(elapsedMs / 60_000));
  if (elapsedMinutes < 1) {
    return 'Just now';
  }
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h ago`;
  }

  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function deviceEndpoint(device: DiscoveryDeviceSnapshot): string {
  if (!device.address) {
    return device.mdnsName ?? 'Address not reported';
  }

  return `${device.address}${device.port ? `:${device.port}` : ''}`;
}

function deviceKindLabel(device: DiscoveryDeviceSnapshot): string {
  const kind = (device.type ?? device.role ?? 'device').trim().toLowerCase();
  if (kind === 'esp32') return 'ESP32';
  if (kind === 'groov') return 'Groov';
  if (kind === 'expo') return 'Expo';
  return 'device';
}

function isHeadlessDevice(device: DiscoveryDeviceSnapshot): boolean {
  return ['esp32', 'groov'].includes((device.type ?? device.role ?? '').trim().toLowerCase());
}

function isEsp32Device(device: DiscoveryDeviceSnapshot): boolean {
  return (device.type ?? device.role ?? '').trim().toLowerCase() === 'esp32';
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function Esp32LedToggle({
  available,
  deviceId,
  onReadLight,
  onSetLight,
}: {
  available: boolean;
  deviceId: string;
  onReadLight: (deviceId: string, kind: UvcLightDeviceKind) => Promise<UvcLightState>;
  onSetLight: (deviceId: string, kind: UvcLightDeviceKind, enabled: boolean) => Promise<UvcLightState>;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const readState = useCallback(async () => {
    const request = ++requestVersion.current;
    if (!available) {
      setBusy(false);
      setError('LED control is unavailable while the ESP32 is offline.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const observed = await onReadLight(deviceId, 'esp32');
      if (request === requestVersion.current) {
        setEnabled(observed.enabled);
      }
    } catch (cause) {
      if (request === requestVersion.current) {
        setError(messageFromError(cause));
      }
    } finally {
      if (request === requestVersion.current) {
        setBusy(false);
      }
    }
  }, [available, deviceId, onReadLight]);

  useEffect(() => {
    void readState();
    return () => {
      requestVersion.current += 1;
    };
  }, [readState]);

  const toggle = async () => {
    if (enabled === null || busy || !available) {
      return;
    }
    const requested = !enabled;
    const request = ++requestVersion.current;
    setBusy(true);
    setError(null);
    try {
      const observed = await onSetLight(deviceId, 'esp32', requested);
      if (request !== requestVersion.current) {
        return;
      }
      setEnabled(observed.enabled);
      if (observed.enabled !== requested) {
        setError(`ESP32 readback remained ${observed.enabled ? 'on' : 'off'}.`);
      }
    } catch (cause) {
      if (request === requestVersion.current) {
        setError(messageFromError(cause));
      }
    } finally {
      if (request === requestVersion.current) {
        setBusy(false);
      }
    }
  };

  const label = busy
    ? enabled === null ? 'Reading…' : 'Updating…'
    : enabled === null ? 'Unknown' : enabled ? 'On' : 'Off';

  return (
    <div className="esp32-led-control">
      <div className="esp32-led-control__heading">
        <Lightbulb aria-hidden="true" />
        <span>Attached LED</span>
      </div>
      <button
        aria-checked={enabled === true}
        aria-label={`Turn ESP32 LED ${enabled ? 'off' : 'on'}`}
        className={`led-toggle${enabled ? ' led-toggle--on' : ''}`}
        disabled={!available || busy || enabled === null}
        onClick={() => void toggle()}
        role="switch"
        type="button"
      >
        <span className="led-toggle__track" aria-hidden="true"><span /></span>
        <span>{label}</span>
      </button>
      {error ? (
        <div className="esp32-led-control__error" role="status">
          <span title={error}>{error}</span>
          {available ? (
            <button disabled={busy} onClick={() => void readState()} type="button">Retry</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DeviceCard({
  busy,
  device,
  local = false,
  pairing,
  onPairDevice,
  onReadLight,
  onSetLight,
  onSetupDevice,
}: {
  busy: boolean;
  device: DiscoveryDeviceSnapshot;
  local?: boolean;
  pairing: boolean;
  onPairDevice: (device: DiscoveryDeviceSnapshot) => void;
  onReadLight: (deviceId: string, kind: UvcLightDeviceKind) => Promise<UvcLightState>;
  onSetLight: (deviceId: string, kind: UvcLightDeviceKind, enabled: boolean) => Promise<UvcLightState>;
  onSetupDevice: (device: DiscoveryDeviceSnapshot) => void;
}) {
  const trusted = isTrusted(device);
  const connected = device.connected === true;
  const camera = isCamera(device);
  const setupAvailable = !trusted
    && !device.ownerId
    && normalizedTrustState(device) === 'unprovisioned'
    && isHeadlessDevice(device);
  const pairingAvailable = !trusted && Boolean(device.ownerId);

  return (
    <article className={`flow-device-card${!device.online ? ' flow-device-card--offline' : ''}`}>
      <div className="flow-device-card__icon" aria-hidden="true">
        {camera ? <Camera /> : <Radio />}
      </div>

      <div className="flow-device-card__body">
        <div className="flow-device-card__heading">
          <div>
            <h3>{device.name || device.id}</h3>
            <p>{device.role || device.type || 'UVC device'}</p>
          </div>
          <div className="device-state-row" aria-label="Device state">
            <span className={`device-state device-state--${device.online ? 'online' : 'offline'}`}>
              {device.online ? <Wifi /> : <WifiOff />}
              {device.online ? 'Online' : 'Offline'}
            </span>
            {connected ? (
              <span className="device-state device-state--connected">
                <CircleDot /> Connected
              </span>
            ) : null}
            {trusted ? (
              <span className="device-state device-state--trusted">
                <ShieldCheck /> Approved
              </span>
            ) : null}
          </div>
        </div>

        <div className="flow-device-card__meta">
          <span className="mono">{deviceEndpoint(device)}</span>
          <span>Seen {formatLastSeen(device.lastSeenAt)}</span>
        </div>

        {device.capabilities?.length ? (
          <div className="capability-list" aria-label="Capabilities">
            {device.capabilities.slice(0, 4).map((capability) => (
              <span key={capability}>{capability}</span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flow-device-card__actions">
        {!local && trusted && isEsp32Device(device) ? (
          <Esp32LedToggle
            available={device.online === true}
            deviceId={device.id}
            onReadLight={onReadLight}
            onSetLight={onSetLight}
          />
        ) : null}
        {local ? (
          <span className="device-state device-state--local">
            <CircleDot /> On this Mac
          </span>
        ) : setupAvailable ? (
          <button
            className="action-button action-button--primary"
            disabled={busy}
            onClick={() => onSetupDevice(device)}
            type="button"
          >
            <ShieldQuestion /> {busy ? 'Setting up…' : `Set up ${deviceKindLabel(device)}`}
          </button>
        ) : pairingAvailable ? (
          <button
            className="action-button action-button--primary"
            disabled={pairing}
            onClick={() => onPairDevice(device)}
            type="button"
          >
            <Link2 /> {pairing ? 'Creating invite…' : `Pair ${deviceKindLabel(device)}`}
          </button>
        ) : connected ? (
          <span className="device-state device-state--trusted">
            <ShieldCheck /> Authenticated
          </span>
        ) : trusted ? (
          <span className="device-state device-state--offline">
            <CircleDot /> Waiting for secure connection
          </span>
        ) : (
          <span className="device-state">
            <Radio /> Discovered
          </span>
        )}
      </div>
    </article>
  );
}

function DeviceGroup({
  busyDeviceIds,
  devices,
  emptyCopy,
  eyebrow,
  pairingDeviceId,
  onPairDevice,
  onReadLight,
  onSetLight,
  onSetupDevice,
  title,
}: {
  busyDeviceIds: ReadonlySet<string>;
  devices: DiscoveryDeviceSnapshot[];
  emptyCopy: string;
  eyebrow: string;
  pairingDeviceId: string | null;
  onPairDevice: (device: DiscoveryDeviceSnapshot) => void;
  onReadLight: (deviceId: string, kind: UvcLightDeviceKind) => Promise<UvcLightState>;
  onSetLight: (deviceId: string, kind: UvcLightDeviceKind, enabled: boolean) => Promise<UvcLightState>;
  onSetupDevice: (device: DiscoveryDeviceSnapshot) => void;
  title: string;
}) {
  return (
    <section className="device-group">
      <div className="device-group__header">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <span className="device-group__count">{devices.length}</span>
      </div>

      {devices.length ? (
        <div className="flow-device-list">
          {devices.map((device) => (
            <DeviceCard
              busy={busyDeviceIds.has(device.id)}
              device={device}
              key={device.id}
              pairing={pairingDeviceId === device.id}
              onPairDevice={onPairDevice}
              onReadLight={onReadLight}
              onSetLight={onSetLight}
              onSetupDevice={onSetupDevice}
            />
          ))}
        </div>
      ) : (
        <div className="device-group__empty">{emptyCopy}</div>
      )}
    </section>
  );
}

export function DevicesView({
  busyDeviceIds,
  isRefreshing,
  onAcceptInvitation,
  onCreateInvitation,
  onReadLight,
  onRefresh,
  onSetLight,
  onSetupDevice,
  runtime,
  runtimeError,
}: UvcDevicesViewProps) {
  const [invitation, setInvitation] = useState('');
  const [invitationInput, setInvitationInput] = useState('');
  const [pairingStatus, setPairingStatus] = useState<string | null>(null);
  const [isCreatingInvitation, setIsCreatingInvitation] = useState(false);
  const [isPairingManagerOpen, setIsPairingManagerOpen] = useState(false);
  const [pairingDeviceId, setPairingDeviceId] = useState<string | null>(null);
  const [setupDevice, setSetupDevice] = useState<DiscoveryDeviceSnapshot | null>(null);
  const [setupName, setSetupName] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);
  const localInstances = runtime?.localInstances ?? [];
  const devices = runtime?.devices ?? [];
  const discoveredDevices = devices.filter((device) => !isTrusted(device));
  const approvedDevices = devices.filter(isTrusted);
  const onlineCount = devices.filter((device) => device.online).length;
  const discoveryEnabled = runtime?.config.discovery?.enabled !== false;
  const discoveryHealthy = runtime?.status.healthy === true;

  const createInvitation = async (device?: DiscoveryDeviceSnapshot) => {
    setIsPairingManagerOpen(true);
    setIsCreatingInvitation(true);
    setPairingDeviceId(device?.id ?? null);
    try {
      const created = await onCreateInvitation();
      setInvitation(JSON.stringify(created));
      setPairingStatus(device
        ? `Pairing invitation ready for ${device.name || deviceKindLabel(device)}. Open it on that device to finish pairing.`
        : 'Pairing invitation ready. Send it to the other UVC device.');
      if (device) {
        requestAnimationFrame(() => {
          document.getElementById('pair-device')?.scrollIntoView({behavior: 'smooth', block: 'center'});
        });
      }
    } catch (error) {
      setPairingStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCreatingInvitation(false);
      setPairingDeviceId(null);
    }
  };

  const acceptInvitation = async () => {
    try {
      const parsed = JSON.parse(invitationInput) as unknown;
      await onAcceptInvitation(parsed);
      setPairingStatus('Device paired successfully.');
      setInvitationInput('');
      await onRefresh();
    } catch (error) {
      setPairingStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const openDeviceSetup = (device: DiscoveryDeviceSnapshot) => {
    setSetupDevice(device);
    setSetupName(deviceKindLabel(device));
    setSetupError(null);
  };

  const submitDeviceSetup = async () => {
    if (!setupDevice || !setupName.trim()) {
      return;
    }
    setSetupError(null);
    try {
      await onSetupDevice(setupDevice.id, setupName.trim());
      setSetupDevice(null);
      setSetupName('');
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="devices-view">
      <header className="devices-hero">
        <div>
          <span className="eyebrow">Device workspace</span>
          <h1>Your UVC devices</h1>
          <p>Discover nearby hardware, approve it, and see when it becomes available to use.</p>
        </div>
        <div className="devices-hero__actions">
          <span className={`discovery-state discovery-state--${discoveryHealthy ? 'online' : 'offline'}`}>
            <span aria-hidden="true" />
            {discoveryHealthy ? 'mDNS browsing' : 'Discovery unavailable'}
          </span>
          <button
            className="action-button action-button--primary refresh-button"
            disabled={isRefreshing}
            onClick={() => void onRefresh()}
            type="button"
          >
            <RefreshCw className={isRefreshing ? 'spin' : ''} />
            {isRefreshing ? 'Scanning…' : 'Scan for devices'}
          </button>
        </div>
      </header>

      {runtime ? (
        <section className="device-group local-instance-group" aria-label="Instances on this Mac">
          <div className="device-group__header">
            <div>
              <span className="eyebrow">This Mac</span>
              <h2>Local {localInstances.length === 1 ? 'instance' : 'instances'}</h2>
            </div>
            <span className="device-group__count">{localInstances.length}</span>
          </div>
          {localInstances.length ? (
            <div className="flow-device-list">
              {localInstances.map((device) => (
                <DeviceCard
                  busy={false}
                  device={device}
                  key={device.id}
                  local
                  pairing={false}
                  onPairDevice={() => undefined}
                  onReadLight={onReadLight}
                  onSetLight={onSetLight}
                  onSetupDevice={() => undefined}
                />
              ))}
            </div>
          ) : (
            <div className="device-group__empty">Local runtime identity is not available.</div>
          )}
        </section>
      ) : null}

      <section className="device-summary" aria-label="Device summary">
        <article>
          <Radio />
          <div><strong>{runtime ? devices.length : '—'}</strong><span>Discovered</span></div>
        </article>
        <article>
          <Wifi />
          <div><strong>{runtime ? onlineCount : '—'}</strong><span>Online now</span></div>
        </article>
        <article>
          <ShieldQuestion />
          <div><strong>{runtime ? discoveredDevices.length : '—'}</strong><span>Need setup</span></div>
        </article>
        <article>
          <ShieldCheck />
          <div><strong>{runtime ? approvedDevices.length : '—'}</strong><span>Approved</span></div>
        </article>
      </section>

      {runtimeError ? (
        <section className="runtime-notice" role="status">
          <WifiOff aria-hidden="true" />
          <div>
            <strong>No local UVC peers discovered</strong>
            <p>No peers are currently visible through <span className="mono">{runtime?.discoverySource ?? 'local mDNS'}</span>.</p>
          </div>
          <Link className="device-link" to="/settings">Check connection settings <ChevronRight /></Link>
        </section>
      ) : null}

      {!runtime && !runtimeError ? (
        <section className="device-loading" aria-live="polite">
          <Radio className="pulse" />
          <strong>Looking for UVC devices…</strong>
          <span>The first discovery result will appear here.</span>
        </section>
      ) : null}

      {runtime ? (
        <div className="device-groups">
          <DeviceGroup
            busyDeviceIds={busyDeviceIds}
            devices={approvedDevices}
            emptyCopy="Devices become available here after setup or pairing."
            eyebrow="Ready to use"
            pairingDeviceId={pairingDeviceId}
            onPairDevice={(device) => void createInvitation(device)}
            onReadLight={onReadLight}
            onSetLight={onSetLight}
            onSetupDevice={openDeviceSetup}
            title="Connected devices"
          />
        </div>
      ) : null}

      <section className="panel pairing-flow" id="pair-device">
        <div className="panel__header panel__header--with-actions">
          <div>
            <span className="eyebrow">Device pairing</span>
            <h2>Pair device</h2>
            <p>Set up or pair a nearby device to make it available here.</p>
          </div>
          <button
            aria-expanded={isPairingManagerOpen}
            aria-controls="pairing-link-manager"
            className="action-button pairing-flow__manage-button"
            onClick={() => setIsPairingManagerOpen((open) => !open)}
            type="button"
          >
            <Link2 aria-hidden="true" />
            {isPairingManagerOpen ? 'Hide pairing links' : 'Manage pairing links'}
          </button>
        </div>

        {isPairingManagerOpen ? (
          <div className="pairing-flow__manager" id="pairing-link-manager">
            <div className="pairing-flow__manager-header">
              <div>
                <h3>Pairing links</h3>
                <p>Create a link to share, or paste one received from another UVC device.</p>
              </div>
              <button
                className="action-button action-button--primary pairing-flow__icon-button"
                disabled={isCreatingInvitation}
                onClick={() => void createInvitation()}
                type="button"
              >
                <Link2 aria-hidden="true" />
                {isCreatingInvitation ? 'Creating…' : 'Create pairing link'}
              </button>
            </div>
            {invitation ? <textarea className="field-input field-input--textarea mono" readOnly value={invitation} /> : null}
            <div className="action-row">
              <input
                className="field-input"
                onChange={(event) => setInvitationInput(event.target.value)}
                placeholder="Paste a pairing link"
                value={invitationInput}
              />
              <button
                className="action-button pairing-flow__icon-button"
                disabled={!invitationInput.trim()}
                onClick={() => void acceptInvitation()}
                type="button"
              >
                <Link2 aria-hidden="true" />
                Pair device
              </button>
            </div>
            {pairingStatus ? <p className="pairing-flow__status" role="status">{pairingStatus}</p> : null}
          </div>
        ) : null}

        <div className="pairing-flow__devices" aria-label="Nearby devices requiring setup or pairing">
          {discoveredDevices.length ? (
            <div className="flow-device-list">
              {discoveredDevices.map((device) => (
                <DeviceCard
                  busy={busyDeviceIds.has(device.id)}
                  device={device}
                  key={device.id}
                  pairing={pairingDeviceId === device.id}
                  onPairDevice={(candidate) => void createInvitation(candidate)}
                  onReadLight={onReadLight}
                  onSetLight={onSetLight}
                  onSetupDevice={openDeviceSetup}
                />
              ))}
            </div>
          ) : (
            <div className="pairing-flow__empty">
              {discoveryEnabled ? 'No nearby devices need setup or pairing.' : 'Discovery is disabled in settings.'}
            </div>
          )}
        </div>
      </section>

      {setupDevice ? (
        <div className="setup-dialog-backdrop">
          <section
            aria-labelledby="setup-dialog-title"
            aria-modal="true"
            className="setup-dialog"
            role="dialog"
          >
            <span className="eyebrow">New device</span>
            <h2 id="setup-dialog-title">Set up {deviceKindLabel(setupDevice)}</h2>
            <p>
              Give this device a name. It will create its security keys on the device and give you administrator access.
            </p>

            <label className="setup-dialog__field">
              <span>Device name</span>
              <input
                autoFocus
                className="field-input"
                disabled={busyDeviceIds.has(setupDevice.id)}
                maxLength={80}
                onChange={(event) => setSetupName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void submitDeviceSetup();
                  if (event.key === 'Escape' && !busyDeviceIds.has(setupDevice.id)) setSetupDevice(null);
                }}
                value={setupName}
              />
            </label>

            <div className="setup-dialog__summary">
              <ShieldCheck aria-hidden="true" />
              <span>This UVC becomes the device administrator.</span>
            </div>

            {setupError ? <p className="setup-dialog__error" role="alert">{setupError}</p> : null}

            <div className="setup-dialog__actions">
              <button
                className="action-button action-button--quiet"
                disabled={busyDeviceIds.has(setupDevice.id)}
                onClick={() => setSetupDevice(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="action-button action-button--primary"
                disabled={busyDeviceIds.has(setupDevice.id) || !setupName.trim()}
                onClick={() => void submitDeviceSetup()}
                type="button"
              >
                {busyDeviceIds.has(setupDevice.id) ? 'Setting up…' : `Set up ${deviceKindLabel(setupDevice)}`}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
