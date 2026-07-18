/**
 * Root layout component for the application.
 */

// CRITICAL: Load one.core polyfills FIRST before any other code
console.log('🚀 Loading one.core polyfills in _layout.tsx...');
import '../src/polyfills/structuredClone';
import '@refinio/one.core/lib/util/feature-detection.js';
import '@refinio/one.core-expo/dist/load-expo.js';
console.log('✅ one.core polyfills loaded successfully');

// CRITICAL: Import polyfill FIRST before any other code
import '@src/global/references';
// Import i18n configuration
import '../i18n';
// Import enhanced i18n config separately to load all translations
import '@src/i18n/config';

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, useColorScheme, Appearance, AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
// Import the new singleton initializer
import { initializeApp } from '@src/initialization/singleton';
// We only need getAuthenticator now
import { getAuthenticator, restoreStoredCredentials } from '@src/initialization';
import { AppThemeProvider, useTheme } from '@src/providers/app/AppTheme';
import { Text } from 'react-native-paper';
import { Stack } from 'expo-router';
import { AppModelProvider } from '@src/providers/app/AppModelProvider';
import { ErrorBoundary } from '@src/components/ErrorBoundary';
import { OneProvider } from '@src/providers/app/OneProvider';
import { useScreenTracking } from '@src/hooks/useScreenTracking';
import { getStoredDarkMode } from '@src/providers/app/AppTheme';
import { Colors } from '@src/constants/Colors';
import { useDeepLinks } from '@src/hooks/useDeepLinks';

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync().catch(e => {
  console.warn('[RootLayout] Error preventing splash screen from hiding:', e);
});

function getBootstrapColors(isDarkMode: boolean) {
  const colors = isDarkMode ? Colors.dark : Colors.light;
  return {
    background: colors.background,
    text: colors.onBackground,
    spinner: colors.primary,
  };
}

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
        if (initialState !== 'logged_in') {
          const restored = await restoreStoredCredentials(auth);
          console.log('[RootLayout] Stored credential restoration:', restored ? 'restored' : 'not available');
        }
        
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
    if (process.env.EXPO_PUBLIC_UVC_INTEGRATION === '1') {
      return;
    }
    let previousAppState: AppStateStatus = AppState.currentState;
    
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
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
    const colors = getBootstrapColors(isDarkMode);
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.messageText, { color: colors.text }]}>Error: {error.message}</Text>
      </View>
    );
  }
  
  // Show loading state until initialization completes
  if (!initialized || !auth) {
    const colors = getBootstrapColors(isDarkMode);
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.spinner} />
        <Text style={[styles.loadingText, { color: colors.text }]}>Initializing...</Text>
      </View>
    );
  }

  // Log the rendering of the main app structure
  console.log('[RootLayout] Rendering app with auth state:', authState);

  const colors = getBootstrapColors(isDarkMode);

  // Wrap with the stored/system theme background to prevent launch flashes.
  console.log('[RootLayout] RENDERING MAIN APP');
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
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

  // Invitation URLs must be handled by a persistent component. Route-local
  // listeners are unmounted when Expo Router follows the invitation URL.
  useDeepLinks();
  
  // Track screen navigation
  useScreenTracking();
  
  useEffect(() => {
    getStoredDarkMode().then(setStoredDarkMode);
  }, []);
  
  // Use stored preference, then theme, then system appearance
  // Determine background color prioritizing dark mode to avoid white flash
  const backgroundColor = storedDarkMode !== null
    ? (storedDarkMode ? Colors.dark.background : Colors.light.background)
    : (isDarkMode || Appearance.getColorScheme() === 'dark' ? Colors.dark.background : Colors.light.background);
  
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
          animation: 'none'
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
    backgroundColor: Colors.light.background
  },
  loadingText: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 24,
    color: Colors.light.onBackground
  },
  messageText: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    color: Colors.light.onBackground
  }
});
