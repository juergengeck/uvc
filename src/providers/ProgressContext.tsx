import React, { createContext, useContext, useRef, useCallback, ReactNode } from 'react';

interface ProgressContextValue {
  setGeneratingProgress: (progress: number) => void;
  subscribeToGeneratingProgress: (listener: (progress: number) => void) => () => void;
  getGeneratingProgress: () => number;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const progressRef = useRef<number>(0);
  const listenersRef = useRef<Set<(progress: number) => void>>(new Set());

  const setGeneratingProgress = useCallback((progress: number) => {
    progressRef.current = progress;
    // Notify all listeners
    listenersRef.current.forEach(listener => listener(progress));
  }, []);

  const subscribeToGeneratingProgress = useCallback((listener: (progress: number) => void) => {
    listenersRef.current.add(listener);
    // Immediately call with current value
    listener(progressRef.current);
    
    // Return unsubscribe function
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const getGeneratingProgress = useCallback(() => progressRef.current, []);

  const value = {
    setGeneratingProgress,
    subscribeToGeneratingProgress,
    getGeneratingProgress,
  };

  return (
    <ProgressContext.Provider value={value}>
      {children}
    </ProgressContext.Provider>
  );
}

export function useProgress() {
  const context = useContext(ProgressContext);
  if (!context) {
    throw new Error('useProgress must be used within a ProgressProvider');
  }
  return context;
}

/**
 * Hook to use progress value with local state
 * This will cause re-renders, so use sparingly (e.g., only in the progress indicator component)
 */
export function useProgressValue() {
  const { subscribeToGeneratingProgress } = useProgress();
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    return subscribeToGeneratingProgress(setProgress);
  }, [subscribeToGeneratingProgress]);

  return progress;
}