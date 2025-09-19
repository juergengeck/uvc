import { useRouter, usePathname } from 'expo-router';

/**
 * Hook for navigating back with a fallback route
 */
export function useNavigateBack(options?: { failRoute?: string }) {
  const router = useRouter();

  return () => {
    try {
      router.back();
    } catch (error) {
      if (options?.failRoute) {
        router.replace(options.failRoute);
      }
    }
  };
}

/**
 * Hook for navigation actions
 */
export function useNavigate() {
  const router = useRouter();
  const pathname = usePathname();

  return {
    navigate: (path: string) => router.push(path),
    replace: (path: string) => router.replace(path),
    back: () => router.back(),
    getCurrentPath: () => pathname,
  };
}

/**
 * Re-export expo-router hooks directly
 */
export { useRouter, usePathname };

export default {
    useNavigateBack,
    useNavigate,
};