import { Link } from '@tanstack/react-router';
import {
  Camera,
  ChevronRight,
  CircleDot,
  Radio,
  RefreshCw,
  ShieldCheck,
  ShieldQuestion,
  Wifi,
  WifiOff,
} from 'lucide-react';

import type { DiscoveryDeviceSnapshot, DiscoveryRuntimeSnapshot } from '@shared/contracts';

interface DevicesViewProps {
  busyDeviceIds: ReadonlySet<string>;
  isRefreshing: boolean;
  onRefresh: () => Promise<void>;
  onSetDeviceTrust: (deviceId: string, trusted: boolean) => Promise<void>;
  runtime: DiscoveryRuntimeSnapshot | null;
  runtimeError: string | null;
}

function normalizedTrustState(device: DiscoveryDeviceSnapshot): string {
  return (device.trustState ?? 'unknown').trim().toLowerCase();
}

function isTrusted(device: DiscoveryDeviceSnapshot): boolean {
  return Boolean(device.ownerId) || ['trusted', 'claimed', 'owned', 'accepted', 'verified'].includes(normalizedTrustState(device));
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

function DeviceCard({
  busy,
  device,
  onSetDeviceTrust,
}: {
  busy: boolean;
  device: DiscoveryDeviceSnapshot;
  onSetDeviceTrust: DevicesViewProps['onSetDeviceTrust'];
}) {
  const trusted = isTrusted(device);
  const connected = device.connected === true;
  const camera = isCamera(device);

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
        <button
          className={trusted ? 'action-button action-button--quiet' : 'action-button action-button--primary'}
          disabled={busy}
          onClick={() => void onSetDeviceTrust(device.id, !trusted)}
          type="button"
        >
          {busy ? 'Updating…' : trusted ? 'Remove approval' : 'Approve device'}
        </button>
        {camera && trusted ? (
          <Link className="device-link" to="/feeds">
            Open feed <ChevronRight />
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function DeviceGroup({
  busyDeviceIds,
  devices,
  emptyCopy,
  eyebrow,
  onSetDeviceTrust,
  title,
}: {
  busyDeviceIds: ReadonlySet<string>;
  devices: DiscoveryDeviceSnapshot[];
  emptyCopy: string;
  eyebrow: string;
  onSetDeviceTrust: DevicesViewProps['onSetDeviceTrust'];
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
              onSetDeviceTrust={onSetDeviceTrust}
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
  onRefresh,
  onSetDeviceTrust,
  runtime,
  runtimeError,
}: DevicesViewProps) {
  const devices = runtime?.devices ?? [];
  const connectedDevices = devices.filter((device) => device.connected === true);
  const discoveredDevices = devices.filter((device) => !isTrusted(device) && device.connected !== true);
  const approvedDevices = devices.filter((device) => isTrusted(device) && device.connected !== true);
  const onlineCount = devices.filter((device) => device.online).length;
  const discoveryEnabled = runtime?.config.discovery?.enabled !== false;
  const authorityHealthy = runtime?.status.healthy === true;

  return (
    <div className="devices-view">
      <header className="devices-hero">
        <div>
          <span className="eyebrow">Device workspace</span>
          <h1>Your UVC devices</h1>
          <p>Discover nearby hardware, approve it, and see when it becomes available to use.</p>
        </div>
        <div className="devices-hero__actions">
          <span className={`authority-state authority-state--${authorityHealthy ? 'online' : 'offline'}`}>
            <span aria-hidden="true" />
            {authorityHealthy ? 'Authority online' : 'Authority unavailable'}
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
          <div><strong>{runtime ? discoveredDevices.length : '—'}</strong><span>Need approval</span></div>
        </article>
        <article>
          <CircleDot />
          <div><strong>{runtime ? connectedDevices.length : '—'}</strong><span>Connected</span></div>
        </article>
      </section>

      {runtimeError ? (
        <section className="runtime-notice" role="status">
          <WifiOff aria-hidden="true" />
          <div>
            <strong>Cannot reach the UVC authority</strong>
            <p>No live device state is available from <span className="mono">{runtime?.authorityUrl ?? 'the configured endpoint'}</span>.</p>
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
            devices={discoveredDevices}
            emptyCopy={discoveryEnabled ? 'No new devices are asking to join.' : 'Discovery is disabled in settings.'}
            eyebrow="Step 1"
            onSetDeviceTrust={onSetDeviceTrust}
            title="Discovered devices"
          />
          <DeviceGroup
            busyDeviceIds={busyDeviceIds}
            devices={connectedDevices}
            emptyCopy="Approved devices will move here once they establish an authenticated connection."
            eyebrow="Ready"
            onSetDeviceTrust={onSetDeviceTrust}
            title="Connected devices"
          />
          <DeviceGroup
            busyDeviceIds={busyDeviceIds}
            devices={approvedDevices}
            emptyCopy="No approved devices are waiting or offline."
            eyebrow="Known"
            onSetDeviceTrust={onSetDeviceTrust}
            title="Approved devices"
          />
        </div>
      ) : null}
    </div>
  );
}
