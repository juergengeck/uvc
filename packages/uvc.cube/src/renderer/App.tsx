import { useCallback, useEffect, useMemo, useState } from 'react';

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

import { SettingsView } from './views/SettingsView';

type ViewId = 'overview' | 'feeds' | 'packages' | 'settings';

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

function formatPackageDescription(pkg: WorkspacePackageInfo): string {
  if (pkg.description?.trim()) {
    return pkg.description;
  }

  return 'Local workspace package';
}

export default function App() {
  const [activeView, setActiveView] = useState<ViewId>('overview');
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSnapshot | null>(null);
  const [settingsSections, setSettingsSections] = useState<SettingsSectionSnapshot[]>([]);
  const [settingsSnapshot, setSettingsSnapshot] = useState<SettingsSnapshot | null>(null);
  const [discoveryRuntime, setDiscoveryRuntime] = useState<DiscoveryRuntimeSnapshot | null>(null);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isRefreshingRuntime, setIsRefreshingRuntime] = useState(false);
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

  const availableHighlightCount = useMemo(() => {
    return workspace?.highlights.filter((highlight) => highlight.status === 'available').length ?? 0;
  }, [workspace]);

  const content = (() => {
    if (error) {
      return (
        <Panel title="Startup Error" description="The desktop shell could not inspect the local workspace.">
          <pre className="error-block">{error}</pre>
        </Panel>
      );
    }

    if (!systemInfo || !workspace) {
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

    if (activeView === 'feeds') {
      return (
        <Panel
          title="Feed Wall"
          description="This is the landing zone for desktop camera monitoring."
        >
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

    if (activeView === 'packages') {
      return (
        <Panel
          title="Workspace Packages"
          description="Local packages discovered under the UVC repository."
        >
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

    if (activeView === 'settings') {
      return (
        <SettingsView
          isRefreshing={isRefreshingRuntime}
          isSaving={isSavingSettings}
          onPushDiscoverySettings={handlePushDiscoverySettings}
          onRefreshRuntime={async () => {
            await loadDiscoveryRuntime(true);
          }}
          onSaveSection={handleSaveSection}
          runtime={discoveryRuntime}
          runtimeError={runtimeError}
          sections={settingsSections}
          settings={settingsSnapshot}
        />
      );
    }

    return (
      <div className="stack">
        <Panel title="Desktop Runtime" description="A small Electron shell with the same main/preload/renderer split that powers `vger.cube`.">
          <div className="stats-grid">
            <article className="stat-card">
              <span className="stat-card__label">App</span>
              <strong>{systemInfo.appName}</strong>
              <span>{systemInfo.version}</span>
            </article>
            <article className="stat-card">
              <span className="stat-card__label">Platform</span>
              <strong>{systemInfo.platform}</strong>
              <span>{systemInfo.arch}</span>
            </article>
            <article className="stat-card">
              <span className="stat-card__label">Electron</span>
              <strong>{systemInfo.electron}</strong>
              <span>Chrome {systemInfo.chrome}</span>
            </article>
            <article className="stat-card">
              <span className="stat-card__label">Workspace</span>
              <strong>{workspace.packageCount} packages</strong>
              <span>{availableHighlightCount} core modules present</span>
            </article>
          </div>
        </Panel>

        <Panel title="UVC Stack" description="A quick read on the modules that shape the desktop build-out.">
          <div className="highlight-list">
            {workspace.highlights.map((highlight) => (
              <article className="highlight-card" key={highlight.expectedPackage}>
                <div className="highlight-card__topline">
                  <h3>{highlight.title}</h3>
                  <StatusPill status={highlight.status} />
                </div>
                <p>{highlight.description}</p>
                <code>{highlight.expectedPackage}</code>
              </article>
            ))}
          </div>
        </Panel>

        <Panel title="Repository" description="Resolved from the Electron main process so we can keep renderer code browser-safe.">
          <dl className="meta-grid">
            <div>
              <dt>Workspace root</dt>
              <dd className="mono">{workspace.rootPath}</dd>
            </div>
            <div>
              <dt>Packages directory</dt>
              <dd className="mono">{workspace.packagesPath}</dd>
            </div>
          </dl>
        </Panel>
      </div>
    );
  })();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="eyebrow">Electron Workspace</span>
          <h1>UVC Cube</h1>
          <p>Desktop shell for transport, device, and camera workflows.</p>
        </div>

        <nav className="nav-list" aria-label="Primary">
          <button
            className={activeView === 'overview' ? 'nav-item nav-item--active' : 'nav-item'}
            onClick={() => setActiveView('overview')}
            type="button"
          >
            Overview
          </button>
          <button
            className={activeView === 'feeds' ? 'nav-item nav-item--active' : 'nav-item'}
            onClick={() => setActiveView('feeds')}
            type="button"
          >
            Feeds
          </button>
          <button
            className={activeView === 'packages' ? 'nav-item nav-item--active' : 'nav-item'}
            onClick={() => setActiveView('packages')}
            type="button"
          >
            Packages
          </button>
          <button
            className={activeView === 'settings' ? 'nav-item nav-item--active' : 'nav-item'}
            onClick={() => setActiveView('settings')}
            type="button"
          >
            Settings
          </button>
        </nav>
      </aside>

      <main className="content">{content}</main>
    </div>
  );
}
