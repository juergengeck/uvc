import { useState, useEffect, useRef } from 'react';
import type { Model } from '@refinio/one.models/lib/models/Model.js';
import type { StateMachine } from '@refinio/one.models/lib/misc/StateMachine.js';

interface UseModelStateResult {
  isReady: boolean;
  error: string | null;
  isLoading: boolean;
}

// Type guard to check if it's a StateMachine
function isStateMachine(model: any): model is StateMachine<any, any> {
  return model && typeof model.currentState !== 'undefined' && typeof model.onStateChange === 'function';
}

// Type guard to check if it's a Model
function isModel(model: any): model is Model {
  return model && model.state && typeof model.state.currentState !== 'undefined';
}

/**
 * Hook to handle model state management consistently across components.
 * Tracks initialization state and provides loading/error states.
 * Supports both Model (with .state.currentState) and StateMachine (with .currentState)
 *
 * @param model The model instance to track (Model or StateMachine)
 * @param modelName Name of the model for logging (e.g. 'Questionnaire', 'StudyShare', 'OrganisationModel')
 * @returns Object containing isReady, error, and isLoading states
 */
export function useModelState(model: Model | StateMachine<any, any> | null | undefined, modelName: string): UseModelStateResult {
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

        // Get currentState based on model type
        let currentState: string;
        if (isStateMachine(model)) {
          currentState = model.currentState;
        } else if (isModel(model)) {
          currentState = model.state.currentState;
        } else {
          throw new Error('Model does not have a valid state property');
        }
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

    // Set up state change listener based on model type
    if (model) {
      if (isStateMachine(model)) {
        unsubscribe = model.onStateChange(() => {
          console.log(`[${modelName}] State changed - triggering check`);
          lastKnownStateRef.current = null; // Force recheck on state change
          checkModelState();
        });
      } else if (isModel(model) && model.state.onStateChange) {
        unsubscribe = model.state.onStateChange(() => {
          console.log(`[${modelName}] State changed - triggering check`);
          lastKnownStateRef.current = null; // Force recheck on state change
          checkModelState();
        });
      }
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