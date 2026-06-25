import { useCallback, useEffect, useMemo, useState } from 'react';
import { getHeadlessAuthorityService } from '@src/services/HeadlessAuthorityService';
import { getNetworkSettingsService } from '@src/services/NetworkSettingsService';
import type {
  HeadlessAuthorityConfig,
  HeadlessAuthorityState,
  HeadlessAuthorityTrustDeviceRequest,
} from '@src/types/headlessAuthority';

export function useHeadlessAuthority() {
  const authorityService = useMemo(() => getHeadlessAuthorityService(), []);
  const networkSettingsService = useMemo(() => getNetworkSettingsService(), []);

  const [baseUrl, setBaseUrlState] = useState(() => authorityService.getBaseUrl());
  const [state, setState] = useState<HeadlessAuthorityState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    try {
      const nextState = await authorityService.fetchState();
      setState(nextState);
      setBaseUrlState(authorityService.getBaseUrl());
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
    } finally {
      setIsRefreshing(false);
    }
  }, [authorityService]);

  const load = useCallback(async () => {
    setIsLoading(true);
    await refresh();
    setIsLoading(false);
  }, [refresh]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const subscription = networkSettingsService.onHeadlessAuthorityUrlChanged.listen((url: string) => {
      setBaseUrlState(url);
      void refresh();
    });

    return () => {
      subscription.remove?.();
    };
  }, [networkSettingsService, refresh]);

  const updateBaseUrl = useCallback(async (url: string) => {
    setError(null);
    await authorityService.setBaseUrl(url);
    setBaseUrlState(authorityService.getBaseUrl());
    await refresh();
  }, [authorityService, refresh]);

  const resetBaseUrl = useCallback(async () => {
    setError(null);
    await authorityService.resetBaseUrl();
    setBaseUrlState(authorityService.getBaseUrl());
    await refresh();
  }, [authorityService, refresh]);

  const refreshDiscovery = useCallback(async () => {
    setError(null);
    await authorityService.refreshDiscovery();
    await refresh();
  }, [authorityService, refresh]);

  const setDeviceTrust = useCallback(async (request: HeadlessAuthorityTrustDeviceRequest) => {
    setError(null);
    await authorityService.setDeviceTrust(request);
    await refresh();
  }, [authorityService, refresh]);

  const updateConfig = useCallback(async (config: HeadlessAuthorityConfig) => {
    setError(null);
    await authorityService.updateConfig(config);
    await refresh();
  }, [authorityService, refresh]);

  return {
    baseUrl,
    state,
    isLoading,
    isRefreshing,
    error,
    refresh,
    updateBaseUrl,
    resetBaseUrl,
    refreshDiscovery,
    setDeviceTrust,
    updateConfig,
  };
}
