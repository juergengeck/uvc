/**
 * Root layout component for the application.
 */

// CRITICAL: Load one.core polyfills FIRST before any other code
console.log('🚀 Loading one.core polyfills in _layout.tsx...');
import '@refinio/one.core/lib/util/feature-detection';
import '@refinio/one.core/lib/system/load-expo';
console.log('✅ one.core polyfills loaded successfully');

// CRITICAL: Import polyfill FIRST before any other code
import '@src/global/references';
// Import i18n configuration
import '../i18n';
// Import enhanced i18n config separately to load all translations
import '@src/i18n/config';

import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, Linking, useColorScheme, Appearance, AppState } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
// Import the new singleton initializer
import { initializeApp } from '@src/initialization/singleton';
// We only need getAuthenticator now
import { getAuthenticator, cleanupApp } from '@src/initialization';
import { AppThemeProvider, useTheme } from '@src/providers/app/AppTheme';
import { Text } from 'react-native-paper';
import { Stack, useRouter } from 'expo-router';
import { AppModelProvider } from '@src/providers/app/AppModelProvider';
import { ErrorBoundary } from '@src/components/ErrorBoundary';
import { OneProvider } from '@src/providers/app/OneProvider';
import { useScreenTracking } from '@src/hooks/useScreenTracking';
import { getStoredDarkMode } from '@src/providers/app/AppTheme';

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync().catch(e => {
  console.warn('[RootLayout] Error preventing splash screen from hiding:', e);
});

export default function RootLayout() {
  // Track auth state directly in the layout component
  const [authState, setAuthState] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [auth, setAuth] = useState<any>(null);
  const systemColorScheme = useColorScheme();
  const [isDarkMode, setIsDarkMode] = useState<boolean>(systemColorScheme === 'dark');

  // Don't mark render complete here - wait until after login and model initialization
  
  // Single initialization effect - ONLY runs once 
  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | undefined;

    // The new, simplified initialization function
    async function initialize() {
      console.log('[RootLayout] Starting initial setup using singleton...');
      try {
        // Load theme preference early
        const storedDarkMode = await getStoredDarkMode();
        if (storedDarkMode !== null && isMounted) {
          setIsDarkMode(storedDarkMode);
        }
        
        // 1. Run the singleton initializer. It runs only once.
        await initializeApp();
        if (!isMounted) return;

        // 2. Get the now-guaranteed-to-exist authenticator.
        const auth = getAuthenticator();
        if (!auth) {
          // This should never happen if initializeApp succeeded
          throw new Error('Authenticator not found after initialization.');
        }

        // 3. Attempt credential restoration (logic is unchanged)
        const initialState = auth.authState.currentState;
        console.log('[RootLayout] Initial auth state:', initialState);
        console.log('[RootLayout] SKIPPING automatic credential restoration for pairing testing');
        
        // 4. Set state and listeners (logic is unchanged)
        const finalState = auth.authState.currentState;
        console.log('[RootLayout] Final auth state after restoration:', finalState);
        
        setAuth(auth);
        setAuthState(finalState);
        
        unsubscribe = auth.authState.onStateChange.listen((_, toState) => {
          console.log(`[RootLayout] Auth state changed to: ${toState}`);
          if (isMounted) {
            setAuthState(toState);
          }
        });
        
        setInitialized(true);
        console.log('[RootLayout] Initialization complete, component ready');
        
      } catch (err) {
        console.error('[RootLayout] Initialization error:', err);
        if (isMounted) {
          setError(err as Error);
        }
      } finally {
        if (isMounted) {
          SplashScreen.hideAsync().catch(console.error);
        }
      }
    }
    
    initialize();

    return () => {
      console.log('[RootLayout] Cleanup - component unmounting');
      isMounted = false;
      if (unsubscribe) unsubscribe();

      // DO NOT cleanup app resources on component unmount
      // This component can unmount/remount during development (hot reload, fast refresh)
      // App cleanup should only happen on process termination, not component lifecycle
    };
  }, []); // Empty dependency array - only run once
  
  // Handle app state changes (background/foreground)
  useEffect(() => {
    let previousAppState = AppState.currentState;
    
    const handleAppStateChange = async (nextAppState: string) => {
      console.log('[RootLayout] App state changed from', previousAppState, 'to:', nextAppState);
      
      // Log app lifecycle events
      try {
        const { logAppBackground, logAppForeground } = await import('../src/utils/appJournal');
        
        if (previousAppState === 'active' && nextAppState.match(/inactive|background/)) {
          // App is going to background
          await logAppBackground();
          console.log('[RootLayout] Logged app background event');
        } else if (previousAppState.match(/inactive|background/) && nextAppState === 'active') {
          // App is coming to foreground
          await logAppForeground();
          console.log('[RootLayout] Logged app foreground event');
        }
      } catch (error) {
        console.error('[RootLayout] Error logging app state change:', error);
      }
      
      previousAppState = nextAppState;
      
      // Don't cleanup on background - only on actual app termination
      // This prevents issues when the app is just backgrounded
    };
    
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription.remove();
    };
  }, []);
  
  // Show error state if initialization failed
  if (error) {
    return (
      <View style={[styles.container, isDarkMode && styles.darkContainer]}>
        <Text style={isDarkMode && styles.darkText}>Error: {error.message}</Text>
      </View>
    );
  }
  
  // Show loading state until initialization completes
  if (!initialized || !auth) {
    return (
      <View style={[styles.container, isDarkMode && styles.darkContainer]}>
        <ActivityIndicator size="large" color={isDarkMode ? '#16a34a' : '#22c55e'} />
        <Text style={[styles.loadingText, isDarkMode && styles.darkText]}>Initializing...</Text>
      </View>
    );
  }

  // Log the rendering of the main app structure
  console.log('[RootLayout] Rendering app with auth state:', authState);

  // Always wrap in a dark view to prevent any white flash
  console.log('[RootLayout] RENDERING MAIN APP');
  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      <ErrorBoundary>
        <AppThemeProvider>
          <OneProvider authenticator={auth}>
            <AppModelProvider>
              <ThemedStack />
            </AppModelProvider>
          </OneProvider>
        </AppThemeProvider>
      </ErrorBoundary>
    </View>
  );
}

function ThemedStack() {
  const { theme, isDarkMode, isLoading } = useTheme();
  const [storedDarkMode, setStoredDarkMode] = useState<boolean | null>(null);
  
  // Track screen navigation
  useScreenTracking();
  
  useEffect(() => {
    getStoredDarkMode().then(setStoredDarkMode);
  }, []);
  
  // Use stored preference, then theme, then system appearance
  // Determine background color prioritizing dark mode to avoid white flash
  const backgroundColor = storedDarkMode !== null
    ? (storedDarkMode ? '#121212' : '#ffffff')
    : (isDarkMode || Appearance.getColorScheme() === 'dark' ? '#121212' : '#ffffff');
  
  console.log('[ThemedStack] backgroundColor:', backgroundColor, 'stored:', storedDarkMode, 'theme:', theme.colors.background);
  
  return (
    <View style={{ flex: 1, backgroundColor }}>
      <Stack 
        initialRouteName="index"
        screenOptions={{ 
          headerShown: false,
          contentStyle: {
            backgroundColor
          },
          // Disable the default card style to prevent white flashes
          cardStyle: {
            backgroundColor
          },
          sceneContainerStyle: {
            backgroundColor
          },
          // Force immediate render without animation
          animationEnabled: false,
          // Ensure container has background
          cardOverlayEnabled: false
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            headerShown: false,
            animation: 'none',
          }}
        />
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
            animation: 'none',
            contentStyle: {
              backgroundColor
            },
            cardStyle: {
              backgroundColor
            }
          }}
        />
        <Stack.Screen
          name="(auth)"
          options={{
            headerShown: false,
            animation: 'fade',
          }}
        />
        <Stack.Screen
          name="(screens)"
          options={{
            headerShown: false,
            animation: 'slide_from_right',
          }}
        />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    backgroundColor: '#121212'
  },
  darkContainer: {
    backgroundColor: '#121212'
  },
  loadingText: {
    marginTop: 8,
    fontSize: 16,
    color: '#000'
  },
  darkText: {
    color: '#fff'
  }
});