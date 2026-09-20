import {
  Link,
  Outlet,
  RouterProvider,
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useRouter,
} from '@tanstack/react-router';
import {
  ChevronLeft,
  Menu,
  Moon,
  Sun,
} from 'lucide-react';
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
import { RoomsView } from './views/RoomsView.js';
import { RolesView } from './views/RolesView.js';
import { DataView } from './views/DataView.js';
import { UvcNavigation, type SidebarState } from './components/UvcNavigation.js';
import { UvcExportButton } from './components/UvcExportButton.js';
import { PrintPreviewOverlay } from './components/PrintPreviewOverlay.js';
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
  theme: string;
  toggleTheme: () => void;
  onOpenExport: () => void;
}

const UvcAppContext = createContext<UvcAppContextValue | null>(null);

export function useUvcApp(): UvcAppContextValue {
  const value = useContext(UvcAppContext);
  if (!value) {
    throw new Error('UvcApp routes must be rendered inside UvcApp.');
  }
  return value;
}

function AppLayout() {
  const { brandLogoUrl, onOpenExport, theme, toggleTheme } = useUvcApp();
  const [sidebarState, setSidebarState] = useState<SidebarState>('expanded');
  const router = useRouter();
  const currentPath = router.state.location.pathname;

  return (
    <div className="app-shell">
      <UvcNavigation
        activeView={currentPath}
        brandLogoUrl={brandLogoUrl}
        onOpenExport={onOpenExport}
        onSidebarStateChange={setSidebarState}
        onToggleTheme={toggleTheme}
        sidebarState={sidebarState}
        theme={theme}
      />

      <main className="content">
        {/* Responsive Header Bar when sidebar is collapsed or on narrow viewports */}
        <header className="app-topbar">
          <div className="app-topbar__left">
            {sidebarState === 'collapsed' && (
              <button
                className="action-button action-button--secondary action-button--icon"
                onClick={() => setSidebarState('expanded')}
                title="Open menu"
                type="button"
              >
                <Menu aria-hidden="true" />
              </button>
            )}
            {currentPath !== '/' && (
              <Link
                className="action-button action-button--ghost action-button--icon"
                title="Back to Journal"
                to="/"
              >
                <ChevronLeft aria-hidden="true" />
              </Link>
            )}
            <UvcExportButton activeView={currentPath} compact onClick={onOpenExport} />
          </div>

          <div className="app-topbar__right">
            <button
              className="action-button action-button--ghost action-button--icon"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              type="button"
            >
              {theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
            </button>
          </div>
        </header>

        <div className="app-main-content">
          <Outlet />
        </div>
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

function RoomsRoute() {
  return <RoomsView />;
}

function RolesRoute() {
  return <RolesView />;
}

function DataRoute() {
  return <DataView />;
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
const roomsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/rooms',
  component: RoomsRoute,
});
const rolesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/roles',
  component: RolesRoute,
});
const dataRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/data',
  component: DataRoute,
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

const routeTree = rootRoute.addChildren([
  journalRoute,
  roomsRoute,
  rolesRoute,
  dataRoute,
  settingsRoute,
  devicesRoute,
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
  const [theme, setTheme] = useState<string>('dark');
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);

  const toggleTheme = useCallback(() => {
    setTheme(current => (current === 'dark' ? 'light' : 'dark'));
  }, []);

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
    theme,
    toggleTheme,
    onOpenExport: () => setPrintPreviewOpen(true),
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
    theme,
    toggleTheme,
  ]);

  return (
    <UvcAppContext.Provider value={context}>
      <RouterProvider router={router} />
      <PrintPreviewOverlay
        activeView={window.location.hash || '/'}
        onClose={() => setPrintPreviewOpen(false)}
        open={printPreviewOpen}
      />
    </UvcAppContext.Provider>
  );
}
