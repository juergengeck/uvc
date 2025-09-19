import { useCallback, useRef, useLayoutEffect } from 'react';

/**
 * A hook that returns a memoized callback that always has the latest version of its dependencies,
 * without changing its reference. This is useful for callbacks that need to be passed to child
 * components but should always have access to the latest values from their closure.
 */
export default function useLatestCallback<T extends (...args: any[]) => any>(callback: T): T {
  const callbackRef = useRef(callback);

  useLayoutEffect(() => {
    callbackRef.current = callback;
  });

  return useCallback((...args: Parameters<T>) => {
    return callbackRef.current(...args);
  }, []) as T;
} 