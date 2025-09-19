import { useState, useEffect, useRef } from 'react';
import type { Model } from '@refinio/one.models/lib/models/Model.js';

interface UseModelStateResult {
  isReady: boolean;
  error: string | null;
  isLoading: boolean;
}

/**
 * Hook to handle model state management consistently across components.
 * Tracks initialization state and provides loading/error states.
 * 
 * @param model The model instance to track
 * @param modelName Name of the model for logging (e.g. 'Questionnaire', 'StudyShare')
 * @returns Object containing isReady, error, and isLoading states
 */
export function useModelState(model: Model | null | undefined, modelName: string): UseModelStateResult {
  // Always declare state hooks first, regardless of model existence
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Add refs to cache state and reduce redundant checks
  const lastKnownStateRef = useRef<string | null>(null);
  const lastCheckTimeRef = useRef<number>(0);
  const CHECK_DEBOUNCE = 1000; // Only check state every 1 second max

  // Single effect to handle all state management
  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    function updateState(ready: boolean, err: string | null, loading: boolean) {
      if (!mounted) return;
      setIsReady(ready);
      setError(err);
      setIsLoading(loading);
    }

    function checkModelState() {
      if (!model) {
        console.log(`[${modelName}] Model not available`);
        updateState(false, `${modelName} model not available`, true);
        return;
      }

      try {
        const now = Date.now();
        
        // Optimize: If we recently checked and model was ready, skip repeated checks
        if (lastKnownStateRef.current === 'Initialised' && 
            (now - lastCheckTimeRef.current) < CHECK_DEBOUNCE) {
          return; // Skip redundant state check
        }
        
        const currentState = model.state.currentState;
        lastCheckTimeRef.current = now;
        
        // Only log if state changed to reduce noise
        if (currentState !== lastKnownStateRef.current) {
          console.log(`[${modelName}] State changed from '${lastKnownStateRef.current}' to '${currentState}'`);
          lastKnownStateRef.current = currentState;
        }

        if (currentState !== 'Initialised') {
          updateState(false, `${modelName} model not initialized`, true);
          return;
        }

        updateState(true, null, false);
      } catch (e) {
        console.error(`[${modelName}] Failed to check model state:`, e);
        updateState(false, `Failed to initialize ${modelName.toLowerCase()} model`, true);
      }
    }

    // Initial check
    checkModelState();

    // Set up state change listener if model exists
    if (model) {
      unsubscribe = model.state.onStateChange(() => {
        console.log(`[${modelName}] State changed - triggering check`);
        lastKnownStateRef.current = null; // Force recheck on state change
        checkModelState();
      });
    }

    // Cleanup function
    return () => {
      mounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [model, modelName]); // Only re-run if model or modelName changes

  return { isReady, error, isLoading };
} 