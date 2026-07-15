import {
  Link,
  Outlet,
  RouterProvider,
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type {
  DiscoveryRuntimeSnapshot,
  SettingsSectionSnapshot,
  SettingsSnapshot,
  SettingsValues,
  SystemInfo,
  WorkspaceHighlight,
  WorkspacePackageInfo,
  WorkspaceSnapshot,
} from '@shared/contracts';
import { UVC_DISCOVERY_SECTION_ID } from '@shared/settings/registry';

import { ChatView } from './views/ChatView';
import { DevicesView } from './views/DevicesView';
import { SettingsView } from './views/SettingsView';

interface UvcRuntime {
  systemInfo: SystemInfo | null;
  workspace: WorkspaceSnapshot | null;
  settingsSections: SettingsSectionSnapshot[];
  settingsSnapshot: SettingsSnapshot | null;
  discoveryRuntime: DiscoveryRuntimeSnapshot | null;
  isSavingSettings: boolean;
  isRefreshingRuntime: boolean;
  error: string | null;
  runtimeError: string | null;
  busyDeviceIds: ReadonlySet<string>;
  availableHighlightCount: number;
  onSaveSection: (sectionId: string, values: SettingsValues) => Promise<void>;
  onRefreshRuntime: (refresh?: boolean) => Promise<void>;
  onSetDeviceTrust: (deviceId: string, trusted: boolean) => Promise<void>;
  onPushDiscoverySettings: () => Promise<void>;
}

const UvcRuntimeContext = createContext<UvcRuntime | null>(null);

function useUvcRuntime(): UvcRuntime {
  const runtime = useContext(UvcRuntimeContext);
  if (!runtime) {
    throw new Error('UVC runtime context is unavailable.');
  }

  return runtime;
}

const rootRoute = createRootRoute({
  component: AppLayout,
});

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: OverviewRoute,
});

const feedsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/feeds',
  component: FeedsRoute,
});

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/chat',
  component: ChatRoute,
});

const packagesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/packages',
  component: PackagesRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsRoute,
});

const routeTree = rootRoute.addChildren([
  overviewRoute,
  feedsRoute,
  chatRoute,
  packagesRoute,
  settingsRoute,
]);

const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

function StatusPill({ status }: { status: WorkspaceHighlight['status'] }) {
  return (
    <span className={`status-pill status-pill--${status}`}>
      {status}
    </span>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function ErrorPanel() {
  const { error } = useUvcRuntime();

  if (!error) {
    return null;
  }

  return (
    <Panel title="Startup Error" description="The desktop shell could not inspect the local workspace.">
      <pre className="error-block">{error}</pre>
    </Panel>
  );
}

function LoadingPanel() {
  return (
    <Panel title="Loading Workspace" description="Inspecting the local UVC packages and desktop runtime.">
      <div className="loading-skeleton">
        <div />
        <div />
        <div />
      </div>
    </Panel>
  );
}

function formatPackageDescription(pkg: WorkspacePackageInfo): string {
  if (pkg.description?.trim()) {
    return pkg.description;
  }

  return 'Local workspace package';
}

function AppLayout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="eyebrow">UVC control</span>
          <h1>UVC Cube</h1>
          <p>Find, approve, and monitor the devices around you.</p>
        </div>

        <nav className="nav-list" aria-label="Primary">
          <Link activeProps={{ className: 'nav-item nav-item--active' }} className="nav-item" to="/">
            Devices
          </Link>
          <Link activeProps={{ className: 'nav-item nav-item--active' }} className="nav-item" to="/feeds">
            Feeds
          </Link>
          <Link activeProps={{ className: 'nav-item nav-item--active' }} className="nav-item" to="/chat">
            Chat
          </Link>
          <Link activeProps={{ className: 'nav-item nav-item--active' }} className="nav-item" to="/settings">
            Settings
          </Link>
        </nav>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}

function OverviewRoute() {
  const {
    busyDeviceIds,
    discoveryRuntime,
    isRefreshingRuntime,
    onRefreshRuntime,
    onSetDeviceTrust,
    runtimeError,
  } = useUvcRuntime();

  return (
    <DevicesView
      busyDeviceIds={busyDeviceIds}
      isRefreshing={isRefreshingRuntime}
      onRefresh={async () => onRefreshRuntime(true)}
      onSetDeviceTrust={onSetDeviceTrust}
      runtime={discoveryRuntime}
      runtimeError={runtimeError}
    />
  );
}

function FeedsRoute() {
  const { error, systemInfo, workspace } = useUvcRuntime();

  if (error) {
    return <ErrorPanel />;
  }

  if (!systemInfo || !workspace) {
    return <LoadingPanel />;
  }

  return (
    <Panel title="Feed Wall" description="This is the landing zone for desktop camera monitoring.">
      <div className="callout-grid">
        <article className="callout-card">
          <h3>ESP32-CAM Surfaces</h3>
          <p>
            Prepare a grid of live MJPEG or RTSP-backed cards, one per device, with
            connection quality, capture status, and a fast path into device details.
          </p>
        </article>
        <article className="callout-card">
          <h3>Operator Workflow</h3>
          <p>
            Pin important cameras, expand a single stream, and keep transport or
            discovery state visible without leaving the desktop shell.
          </p>
        </article>
        <article className="callout-card">
          <h3>Bridge Strategy</h3>
          <p>
            The main process already owns IPC, so the next step is wiring feed
            discovery and stream health into typed desktop handlers.
          </p>
        </article>
      </div>
    </Panel>
  );
}

function ChatRoute() {
  const { discoveryRuntime, workspace } = useUvcRuntime();

  return (
    <ChatView
      devices={discoveryRuntime?.devices ?? []}
      workspacePackageCount={workspace?.packageCount ?? 0}
    />
  );
}

function PackagesRoute() {
  const { error, systemInfo, workspace } = useUvcRuntime();

  if (error) {
    return <ErrorPanel />;
  }

  if (!systemInfo || !workspace) {
    return <LoadingPanel />;
  }

  return (
    <Panel title="Workspace Packages" description="Local packages discovered under the UVC repository.">
      <div className="table-wrap">
        <table className="package-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Version</th>
              <th>Path</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {workspace.packages.map((pkg) => (
              <tr key={pkg.path}>
                <td>{pkg.name}</td>
                <td>{pkg.version}</td>
                <td className="mono">{pkg.path}</td>
                <td>{formatPackageDescription(pkg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function SettingsRoute() {
  const {
    discoveryRuntime,
    isRefreshingRuntime,
    isSavingSettings,
    onPushDiscoverySettings,
    onRefreshRuntime,
    onSaveSection,
    runtimeError,
    settingsSections,
    settingsSnapshot,
  } = useUvcRuntime();

  return (
    <SettingsView
      isRefreshing={isRefreshingRuntime}
      isSaving={isSavingSettings}
      onPushDiscoverySettings={onPushDiscoverySettings}
      onRefreshRuntime={async () => {
        await onRefreshRuntime(true);
      }}
      onSaveSection={onSaveSection}
      runtime={discoveryRuntime}
      runtimeError={runtimeError}
      sections={settingsSections}
      settings={settingsSnapshot}
    />
  );
}

export default function App() {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [settingsSections, setSettingsSections] = useState<SettingsSectionSnapshot[]>([]);
  const [settingsSnapshot, setSettingsSnapshot] = useState<SettingsSnapshot | null>(null);
  const [discoveryRuntime, setDiscoveryRuntime] = useState<DiscoveryRuntimeSnapshot | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isRefreshingRuntime, setIsRefreshingRuntime] = useState(false);
  const [busyDeviceIds, setBusyDeviceIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const loadDiscoveryRuntime = useCallback(async (refresh = false) => {
    try {
      setRuntimeError(null);
      setIsRefreshingRuntime(refresh);
      const runtime = refresh
        ? await window.electronAPI.refreshDiscoveryRuntime()
        : await window.electronAPI.getDiscoveryRuntimeSnapshot();
      setDiscoveryRuntime(runtime);
    } catch (caughtError) {
      setRuntimeError(caughtError instanceof Error ? caughtError.message : 'Failed to load discovery runtime.');
    } finally {
      setIsRefreshingRuntime(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const [info, snapshot, sections, settings] = await Promise.all([
          window.electronAPI.getSystemInfo(),
          window.electronAPI.getWorkspaceSnapshot(),
          window.electronAPI.getSettingsSections(),
          window.electronAPI.getSettingsSnapshot(),
        ]);

        if (cancelled) {
          return;
        }

        setSystemInfo(info);
        setWorkspace(snapshot);
        setSettingsSections(sections);
        setSettingsSnapshot(settings);
      } catch (caughtError) {
        if (cancelled) {
          return;
        }

        setError(caughtError instanceof Error ? caughtError.message : 'Failed to load UVC workspace data.');
      }
    }

    void load();
    void loadDiscoveryRuntime();

    return () => {
      cancelled = true;
    };
  }, [loadDiscoveryRuntime]);

  useEffect(() => {
    const intervalSeconds = Number(settingsSnapshot?.[UVC_DISCOVERY_SECTION_ID]?.refreshIntervalSeconds ?? 0);
    if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadDiscoveryRuntime();
    }, intervalSeconds * 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadDiscoveryRuntime, settingsSnapshot]);

  const handleSaveSection = useCallback(async (sectionId: string, values: SettingsValues) => {
    setIsSavingSettings(true);
    try {
      const updated = await window.electronAPI.updateSettingsSection(sectionId, values);
      setSettingsSnapshot(updated);

      if (sectionId === UVC_DISCOVERY_SECTION_ID) {
        await loadDiscoveryRuntime();
      }
    } finally {
      setIsSavingSettings(false);
    }
  }, [loadDiscoveryRuntime]);

  const handlePushDiscoverySettings = useCallback(async () => {
    setIsRefreshingRuntime(true);
    try {
      const result = await window.electronAPI.pushDiscoverySettings();
      setDiscoveryRuntime(result.runtime);
    } catch (caughtError) {
      setRuntimeError(caughtError instanceof Error ? caughtError.message : 'Failed to push discovery settings.');
    } finally {
      setIsRefreshingRuntime(false);
    }
  }, []);

  const handleSetDeviceTrust = useCallback(async (deviceId: string, trusted: boolean) => {
    setBusyDeviceIds((current) => new Set(current).add(deviceId));
    setRuntimeError(null);

    try {
      const nextRuntime = await window.electronAPI.setDiscoveryDeviceTrust(deviceId, trusted);
      setDiscoveryRuntime(nextRuntime);
    } catch (caughtError) {
      setRuntimeError(caughtError instanceof Error ? caughtError.message : 'Failed to update device approval.');
    } finally {
      setBusyDeviceIds((current) => {
        const next = new Set(current);
        next.delete(deviceId);
        return next;
      });
    }
  }, []);

  const availableHighlightCount = useMemo(() => {
    return workspace?.highlights.filter((highlight) => highlight.status === 'available').length ?? 0;
  }, [workspace]);

  const runtime = useMemo<UvcRuntime>(() => ({
    systemInfo,
    workspace,
    settingsSections,
    settingsSnapshot,
    discoveryRuntime,
    isSavingSettings,
    isRefreshingRuntime,
    error,
    runtimeError,
    busyDeviceIds,
    availableHighlightCount,
    onSaveSection: handleSaveSection,
    onRefreshRuntime: loadDiscoveryRuntime,
    onSetDeviceTrust: handleSetDeviceTrust,
    onPushDiscoverySettings: handlePushDiscoverySettings,
  }), [
    availableHighlightCount,
    busyDeviceIds,
    discoveryRuntime,
    error,
    handlePushDiscoverySettings,
    handleSaveSection,
    handleSetDeviceTrust,
    isRefreshingRuntime,
    isSavingSettings,
    loadDiscoveryRuntime,
    runtimeError,
    settingsSections,
    settingsSnapshot,
    systemInfo,
    workspace,
  ]);

  return (
    <UvcRuntimeContext.Provider value={runtime}>
      <RouterProvider router={router} />
    </UvcRuntimeContext.Provider>
  );
}
