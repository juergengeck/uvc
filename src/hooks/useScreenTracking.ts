/**
 * Hook for tracking screen navigation and logging to journal
 */

import { useEffect, useRef } from 'react';
import { usePathname, useGlobalSearchParams } from 'expo-router';
import { logScreenView } from '../utils/appJournal';

export function useScreenTracking() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const lastLoggedRef = useRef<string>('');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!pathname) return;

    const currentPath = `${pathname}:${JSON.stringify(params)}`;

    // Skip if this exact path/params combo was already logged recently
    if (lastLoggedRef.current === currentPath) return;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Debounce screen tracking to avoid rapid-fire logging during UI updates
    timeoutRef.current = setTimeout(() => {
      lastLoggedRef.current = currentPath;

      // Log screen view asynchronously without blocking UI
      logScreenView(pathname, params as Record<string, any>).catch(error => {
        console.error('[useScreenTracking] Error logging screen view:', error);
      });

      console.log('[useScreenTracking] Screen viewed:', pathname, params);
    }, 500); // 500ms debounce

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [pathname, params]);
}