import { useRef, useCallback } from 'react';

/**
 * Hook that provides a ref-based progress tracking system
 * to avoid re-renders on every progress update
 */
export function useProgressRef() {
  const progressRef = useRef<number>(0);
  const listenersRef = useRef<Set<(progress: number) => void>>(new Set());

  const setProgress = useCallback((progress: number) => {
    progressRef.current = progress;
    // Notify all listeners
    listenersRef.current.forEach(listener => listener(progress));
  }, []);

  const subscribeToProgress = useCallback((listener: (progress: number) => void) => {
    listenersRef.current.add(listener);
    // Immediately call with current value
    listener(progressRef.current);
    
    // Return unsubscribe function
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const getProgress = useCallback(() => progressRef.current, []);

  return {
    setProgress,
    subscribeToProgress,
    getProgress,
    progressRef
  };
}