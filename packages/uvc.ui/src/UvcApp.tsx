import {
  Link,
  Outlet,
  RouterProvider,
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { CalendarDays, Settings } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { SettingsSection } from '@refinio/settings.core';

import { JournalView } from './views/JournalView.js';
import { SettingsView } from './views/SettingsView.js';
import type {
  UvcDevicesViewComponent,
  UvcDiscoveryRuntime,
  UvcPlatform,
} from './types.js';

interface UvcAppContextValue {
  brandLogoUrl?: string;
  busyDeviceIds: ReadonlySet<string>;
  DevicesView: UvcDevicesViewComponent;
  discoveryRuntime: UvcDiscoveryRuntime | null;
  isRefreshingRuntime: boolean;
  platform: UvcPlatform;
  refreshRuntime(refresh?: boolean): Promise<void>;
  runtimeError: string | null;
  settingsSections: SettingsSection[];
  setupDevice(deviceId: string, assignedInstanceName: string): Promise<void>;
}

const UvcAppContext = createContext<UvcAppContextValue | null>(null);

function useUvcApp(): UvcAppContextValue {
  const value = useContext(UvcAppContext);
  if (!value) {
    throw new Error('UvcApp routes must be rendered inside UvcApp.');
  }
  return value;
}

function AppLayout() {
  const { brandLogoUrl } = useUvcApp();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="eyebrow">UVC cycle record</span>
          {brandLogoUrl
            ? <img alt="UVC.one" className="brand-logo" src={brandLogoUrl} />
            : <h1>UVC</h1>}
          <p>Document where, when, and with which resources UVC cycles were executed.</p>
        </div>

        <nav className="nav-list" aria-label="Primary">
          <Link
            activeOptions={{ exact: true }}
            activeProps={{ className: 'nav-item nav-item--active' }}
            className="nav-item"
            to="/"
          >
            <CalendarDays aria-hidden="true" />
            Journal
          </Link>
        </nav>

        <nav className="nav-list nav-list--settings" aria-label="Application">
          <Link
            activeProps={{ className: 'nav-item nav-item--active' }}
            className="nav-item"
            to="/settings"
          >
            <Settings aria-hidden="true" />
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

function JournalRoute() {
  const { discoveryRuntime, platform } = useUvcApp();
  return (
    <JournalView
      deviceCount={discoveryRuntime?.devices.length ?? 0}
      loadRecords={() => platform.listJournalRecords()}
    />
  );
}

function SettingsRoute() {
  const { discoveryRuntime, runtimeError, settingsSections } = useUvcApp();
  return (
    <SettingsView
      discoveryRuntime={discoveryRuntime}
      runtimeError={runtimeError}
      sections={settingsSections}
    />
  );
}

function DevicesRoute() {
  const {
    busyDeviceIds,
    DevicesView,
    discoveryRuntime,
    isRefreshingRuntime,
    platform,
    refreshRuntime,
    runtimeError,
    setupDevice,
  } = useUvcApp();
  const readLight = useCallback((deviceId: string, kind: 'groov' | 'esp32') => (
    platform.readLight(deviceId, kind)
  ), [platform]);
  const setLight = useCallback((deviceId: string, kind: 'groov' | 'esp32', enabled: boolean) => (
    platform.setLight(deviceId, kind, enabled)
  ), [platform]);

  return (
    <DevicesView
      busyDeviceIds={busyDeviceIds}
      isRefreshing={isRefreshingRuntime}
      onAcceptInvitation={async invitation => {
        await platform.acceptPairingInvitation(invitation);
        await refreshRuntime(true);
      }}
      onCreateInvitation={() => platform.createPairingInvitation()}
      onReadLight={readLight}
      onRefresh={() => refreshRuntime(true)}
      onSetLight={setLight}
      onSetupDevice={setupDevice}
      runtime={discoveryRuntime}
      runtimeError={runtimeError}
    />
  );
}

const rootRoute = createRootRoute({ component: AppLayout });
const journalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: JournalRoute,
});
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsRoute,
});
const devicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings/devices',
  component: DevicesRoute,
});

const routeTree = rootRoute.addChildren([journalRoute, settingsRoute, devicesRoute]);
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

export interface UvcAppProps {
  brandLogoUrl?: string;
  DevicesView: UvcDevicesViewComponent;
  platform: UvcPlatform;
}

export function UvcApp({ brandLogoUrl, DevicesView, platform }: UvcAppProps) {
  const [settingsSections, setSettingsSections] = useState<SettingsSection[]>([]);
  const [discoveryRuntime, setDiscoveryRuntime] = useState<UvcDiscoveryRuntime | null>(null);
  const [isRefreshingRuntime, setIsRefreshingRuntime] = useState(false);
  const [busyDeviceIds, setBusyDeviceIds] = useState<Set<string>>(new Set());
  const [runtimeError, setRuntimeError] = useState<string | null>(null);

  const refreshRuntime = useCallback(async (refresh = false) => {
    setRuntimeError(null);
    setIsRefreshingRuntime(refresh);
    try {
      const runtime = refresh
        ? await platform.refreshDiscoveryRuntime()
        : await platform.getDiscoveryRuntime();
      setDiscoveryRuntime(runtime);
    } catch (cause) {
      setRuntimeError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setIsRefreshingRuntime(false);
    }
  }, [platform]);

  useEffect(() => {
    let active = true;
    void platform.getSettingsSections()
      .then(sections => {
        if (active) setSettingsSections(sections);
      })
      .catch(cause => {
        if (active) setRuntimeError(cause instanceof Error ? cause.message : String(cause));
      });
    void refreshRuntime();
    const unsubscribe = platform.subscribeDiscovery(() => void refreshRuntime());
    return () => {
      active = false;
      unsubscribe();
    };
  }, [platform, refreshRuntime]);

  const setupDevice = useCallback(async (deviceId: string, assignedInstanceName: string) => {
    setBusyDeviceIds(current => new Set(current).add(deviceId));
    setRuntimeError(null);
    try {
      await platform.setupDevice(deviceId, assignedInstanceName);
      await refreshRuntime(true);
    } catch (cause) {
      setRuntimeError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    } finally {
      setBusyDeviceIds(current => {
        const next = new Set(current);
        next.delete(deviceId);
        return next;
      });
    }
  }, [platform, refreshRuntime]);

  const context = useMemo<UvcAppContextValue>(() => ({
    brandLogoUrl,
    busyDeviceIds,
    DevicesView,
    discoveryRuntime,
    isRefreshingRuntime,
    platform,
    refreshRuntime,
    runtimeError,
    settingsSections,
    setupDevice,
  }), [
    brandLogoUrl,
    busyDeviceIds,
    DevicesView,
    discoveryRuntime,
    isRefreshingRuntime,
    platform,
    refreshRuntime,
    runtimeError,
    settingsSections,
    setupDevice,
  ]);

  return (
    <UvcAppContext.Provider value={context}>
      <RouterProvider router={router} />
    </UvcAppContext.Provider>
  );
}
