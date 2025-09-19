/**
 * UDP Diagnostic Navigation Helper
 * 
 * This utility provides a function to navigate to the UDP diagnostic screen
 * from anywhere in the app.
 */

import { useRouter, router } from 'expo-router';

/**
 * Navigate to the UDP diagnostic screen
 */
export function navigateToUDPDiagnostic() {
  try {
    // Use the router from expo-router (already imported at top)
    if (router) {
      router.push('/(screens)/udp-diagnostic');
    } else {
      console.warn('[Navigation] Router object not available');
    }
  } catch (error) {
    console.error('[Navigation] Failed to navigate to UDP diagnostic:', error);
  }
}

/**
 * Hook to get a function that navigates to the UDP diagnostic screen
 */
export function useUDPDiagnosticNavigation() {
  const routerHook = useRouter();
  
  return () => {
    try {
      routerHook.push('/(screens)/udp-diagnostic');
    } catch (error) {
      console.error('[Navigation] Failed to navigate to UDP diagnostic:', error);
    }
  };
} 