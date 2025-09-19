/**
 * Hook for tracking screen navigation and logging to journal
 */

import { useEffect } from 'react';
import { usePathname, useGlobalSearchParams } from 'expo-router';
import { logScreenView } from '../utils/appJournal';

export function useScreenTracking() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  
  useEffect(() => {
    if (!pathname) return;
    
    // Log screen view
    logScreenView(pathname, params as Record<string, any>).catch(error => {
      console.error('[useScreenTracking] Error logging screen view:', error);
    });
    
    console.log('[useScreenTracking] Screen viewed:', pathname, params);
  }, [pathname, params]);
}