/**
 * One Provider Component
 * 
 * Provides access to authenticator and model instances.
 * Uses centralized model management from initialization module.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { PropsWithChildren } from 'react';
import { getModel, onModelReady, initModelAfterLogin } from '@src/initialization';
import type { AppModel as Model } from '@src/models/AppModel';
import type Authenticator from '@refinio/one.models/lib/models/Authenticator/Authenticator';
import { StyleSheet, ActivityIndicator, View, Text, useColorScheme } from 'react-native';
import { getStoredDarkMode } from '../app/AppTheme';

/**
 * Context for sharing the model with child components
 */
export interface OneContext {
  model: Model;
  initialized: boolean;
}

export const OneContext = createContext<OneContext | null>(null);

/**
 * Props for OneProvider
 */
interface OneProviderProps extends PropsWithChildren {
  authenticator: Authenticator;
}

/**
 * OneProvider component - provides access to the app model
 * 
 * IMPORTANT: The model is ONLY available after login, as it requires
 * access to user storage which is encrypted until login completes.
 */
export function OneProvider({ authenticator, children }: OneProviderProps) {
  // Initialize model state to undefined
  const [model, setModel] = useState<Model | undefined>(undefined);
  const [initialized, setInitialized] = useState(false);
  const [isInitializingModel, setIsInitializingModel] = useState(false);
  const colorScheme = useColorScheme();
  const [userDarkModePref, setUserDarkModePref] = useState<boolean | null>(null);
  
  // Load user's dark mode preference
  useEffect(() => {
    getStoredDarkMode().then(pref => {
      setUserDarkModePref(pref);
    });
  }, []);
  
  // Log authentication state for debugging - only changes, not every check
  useEffect(() => {
    if (!authenticator || !authenticator.authState) return;
    
    // Only log the initial state, not on every render
    console.log(`[OneProvider] Initial auth state: ${authenticator.authState.currentState}`);
    
    // Listen for auth state changes - this will only log actual changes
    // onStateChange should always exist after MultiUser construction
    const unsubscribe = authenticator.authState.onStateChange.listen((_, newState) => {
      console.log(`[OneProvider] Auth state changed to: ${newState}`);
    });
    
    return () => {
      unsubscribe();
    };
  }, [authenticator]);
  
  // Initialize model when we're logged in and don't have a model yet
  useEffect(() => {
    // Skip if we already have a model or are currently initializing
    if (model || isInitializingModel) return;
    
    // Skip if auth state is not ready or not logged in
    console.log(`[OneProvider] Auth state check: authenticator=${!!authenticator}, authState=${!!authenticator?.authState}, currentState=${authenticator?.authState?.currentState}`);
    if (!authenticator || !authenticator.authState || authenticator.authState.currentState !== 'logged_in') {
      console.log('[OneProvider] Auth state check failed, skipping model initialization');
      return;
    }
    
    console.log('[OneProvider] User is logged in, checking for model');
    
    // Check if model is already available
    const existingModel = getModel();
    if (existingModel) {
      console.log('[OneProvider] Model found after login, using it');
      setModel(existingModel);
      return;
    }
    
    // No model available - initialize it now that we're logged in
    console.log('[OneProvider] No model available - initializing after login');
    setIsInitializingModel(true);
    
    initModelAfterLogin()
      .then((newModel) => {
        console.log('[OneProvider] Model initialized successfully after login');
        setModel(newModel);
      })
      .catch((error) => {
        console.error('[OneProvider] Failed to initialize model after login:', error);
        // Reset initialization flag so we can try again
        setIsInitializingModel(false);
      })
      .finally(() => {
        setIsInitializingModel(false);
      });
  }, [authenticator, authenticator?.authState?.currentState, model]);
  
  // Listen for the model's onReady event to know when it's fully initialized
  useEffect(() => {
    if (!model) return;

    // Check initial state - use public property instead of private
    if ((model as any).isInitialized) {
      setInitialized(true);
      return;
    }
    
    // Debug the onReady property
    console.log('[OneProvider] 🔍 Debugging model.onReady:', {
      hasOnReady: !!model.onReady,
      onReadyType: typeof model.onReady,
      hasListen: !!model.onReady?.listen,
      listenType: typeof model.onReady?.listen,
      modelConstructor: model.constructor.name
    });
    
    // Check if onReady exists and has listen method
    if (!model.onReady || typeof model.onReady.listen !== 'function') {
      console.error('[OneProvider] ❌ model.onReady is not properly initialized:', model.onReady);
      return;
    }
    
    // Listen for the onReady event
    const unsubscribe = model.onReady.listen(() => {
      console.log('[OneProvider] ✅ AppModel reported it is initialized.');
      setInitialized(true);
    });

    return () => {
      if (unsubscribe && unsubscribe.remove) {
        unsubscribe.remove();
      }
    };
  }, [model]);
  
  // If not logged in, render children without context to allow login flow
  if (authenticator.authState?.currentState !== 'logged_in') {
    // Use user preference if available, otherwise use system color scheme
    const isDarkMode = userDarkModePref !== null ? userDarkModePref : colorScheme === 'dark';
    const backgroundColor = isDarkMode ? '#121212' : '#ffffff';
    
    return (
      <View style={{ flex: 1, backgroundColor }}>
        {children}
      </View>
    );
  }
  
  // If logged in but no model, show loading (should be brief)
  if (!model) {
    // Use user preference if set, otherwise use system color scheme
    const isDarkMode = userDarkModePref !== null ? userDarkModePref : colorScheme === 'dark';
    const backgroundColor = isDarkMode ? '#121212' : '#ffffff';
    const textColor = isDarkMode ? '#ffffff' : '#000000';
    const spinnerColor = isDarkMode ? '#16a34a' : '#22c55e';
    
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <ActivityIndicator size="large" color={spinnerColor} />
        <Text style={[styles.text, { color: textColor }]}>
          {isInitializingModel ? 'Initializing user data...' : 'Accessing user data...'}
        </Text>
      </View>
    );
  }
  
  // Render children with model context when everything is ready
  // Keep showing loading until model is FULLY initialized
  if (!initialized) {
    const isDarkMode = userDarkModePref !== null ? userDarkModePref : colorScheme === 'dark';
    const backgroundColor = isDarkMode ? '#121212' : '#ffffff';
    const textColor = isDarkMode ? '#ffffff' : '#000000';
    const spinnerColor = isDarkMode ? '#16a34a' : '#22c55e';
    
    console.log('[OneProvider] Still waiting for initialization, showing loading screen');
    return (
      <View style={[styles.container, { backgroundColor }]}>
        <ActivityIndicator size="large" color={spinnerColor} />
        <Text style={[styles.text, { color: textColor }]}>
          Preparing your experience...
        </Text>
      </View>
    );
  }
  
  console.log('[OneProvider] Model initialized, rendering children');
  
  // Always wrap children in a view with background to prevent flash
  const isDarkMode = userDarkModePref !== null ? userDarkModePref : colorScheme === 'dark';
  const backgroundColor = isDarkMode ? '#121212' : '#ffffff';
  
  return (
    <View style={{ flex: 1, backgroundColor }}>
      <OneContext.Provider value={{ model, initialized }}>
        {children}
      </OneContext.Provider>
    </View>
  );
}

// Hook for child components to get the model from context
export function useModel(): OneContext {
  const context = useContext(OneContext);
  if (!context) {
    throw new Error('No model available - you may be trying to access the model before login is complete');
  }
  return context;
}

// Error boundary component for catching errors in child components
class ModelErrorWrapper extends React.Component<PropsWithChildren, { hasError: boolean }> {
  constructor(props: PropsWithChildren) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error to the console
    console.error('[ModelErrorWrapper] Error in child component:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      // Fallback UI when an error occurs
      return (
        <View style={styles.container}>
          <Text style={styles.text}>Component Error</Text>
          <Text style={styles.debug}>Error accessing model in logged out state</Text>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16
  },
  text: {
    marginTop: 16,
    fontSize: 16
  },
  debug: {
    marginTop: 8,
    fontSize: 12,
    color: '#888'
  }
}); 