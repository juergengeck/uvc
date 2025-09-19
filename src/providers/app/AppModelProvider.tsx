/**
 * AppModelProvider Component
 * 
 * Provides access to the AppModel instance.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { AppModel } from '@src/models/AppModel';
import { getModel, onModelReady, getAuthenticator } from '@src/initialization';
import { ActivityIndicator, View } from 'react-native';

export interface AppModelContextState {
  model?: AppModel;
  initialized: boolean;
  isLoading: boolean;
}

const AppModelContext = createContext<AppModelContextState>({
  model: undefined,
  initialized: false,
  isLoading: true,
});

export function useAppModel(): AppModelContextState {
  return useContext(AppModelContext);
}

/**
 * Provider component that makes AppModel available to child components
 * Now relies on OneProvider to handle model initialization after login
 */
export function AppModelProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AppModelContextState>({
    model: undefined,
    initialized: false,
    isLoading: true,
  });

  useEffect(() => {
    const authenticator = getAuthenticator();
    if (!authenticator) {
      console.log('[AppModelProvider] No authenticator available');
      return;
    }

    const handleModelReady = () => {
      const model = getModel();
      if (model) {
        console.log('[AppModelProvider] Model is ready, updating state.');
        setState({
          model,
          initialized: true,
          isLoading: false,
        });
      }
    };

    // Check current auth state
    const currentState = authenticator.authState?.currentState;
    
    if (currentState === 'logged_in') {
      // Already logged in - check if model is available
      const existingModel = getModel();
      if (existingModel) {
        console.log('[AppModelProvider] Model already available during initialization');
        handleModelReady();
      } else {
        console.log('[AppModelProvider] Logged in but no model - waiting for initialization');
    // Listen for the model ready event
    const unsubscribe = onModelReady.on(handleModelReady);

    // Cleanup listener on unmount
    return () => {
      unsubscribe();
    };
      }
    } else {
      // Not logged in - wait for login and model initialization
      console.log('[AppModelProvider] Not logged in - waiting for login and model initialization');
      
      // Listen for the model ready event
      const unsubscribe = onModelReady.on(handleModelReady);
      
      // Also listen for auth state changes
      const authUnsubscribe = authenticator.authState?.onStateChange?.listen((_, newState) => {
        if (newState === 'logged_in') {
          console.log('[AppModelProvider] User logged in - waiting for model initialization');
        } else if (newState === 'logged_out') {
          console.log('[AppModelProvider] User logged out - clearing model state');
          setState({
            model: undefined,
            initialized: false,
            isLoading: true,
          });
        }
      });
      
      // Cleanup listeners on unmount
      return () => {
        unsubscribe();
        if (authUnsubscribe) {
          authUnsubscribe();
        }
      };
    }
  }, []);

  console.log(`[AppModelProvider] Rendering with model: ${!!state.model}, isLoading: ${state.isLoading}, initialized: ${state.initialized}`);

  return (
    <AppModelContext.Provider value={state}>
      {children}
    </AppModelContext.Provider>
  );
}