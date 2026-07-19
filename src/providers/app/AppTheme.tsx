import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { View, Appearance, Platform } from 'react-native';
import { configureFonts, MD3DarkTheme, MD3LightTheme, Provider as PaperProvider } from 'react-native-paper';
import { Colors } from '@src/constants/Colors';
import { createThemedStyles } from '@src/constants/ThemeStyles';
import * as SecureStore from 'expo-secure-store';
import { getAuthenticator, getModel } from '@src/initialization';

type ThemeContextType = {
  isDarkMode: boolean;
  toggleTheme: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
  theme: ReturnType<typeof createCustomTheme>;
  styles: ReturnType<typeof createThemedStyles>;
};

// Determine system preference early to avoid white flash before stored preference loads
const systemPrefersDark = Appearance.getColorScheme() === 'dark';

interface AppThemeProviderProps {
  children: React.ReactNode;
}

const fontFamilies = {
  sans: Platform.select({
    ios: 'System',
    android: 'sans-serif',
    default: 'Inter, system-ui, sans-serif',
  }),
  serif: Platform.select({
    ios: 'Georgia',
    android: 'serif',
    default: 'Source Serif 4, Georgia, serif',
  }),
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'JetBrains Mono, ui-monospace, monospace',
  }),
};

const typographyOverrides = configureFonts({
  config: {
    displayLarge: { fontFamily: fontFamilies.serif, fontWeight: '500', letterSpacing: 0 },
    displayMedium: { fontFamily: fontFamilies.serif, fontWeight: '500', letterSpacing: 0 },
    displaySmall: { fontFamily: fontFamilies.serif, fontWeight: '500', letterSpacing: 0 },
    headlineLarge: { fontFamily: fontFamilies.serif, fontWeight: '500', letterSpacing: 0 },
    headlineMedium: { fontFamily: fontFamilies.serif, fontWeight: '500', letterSpacing: 0 },
    headlineSmall: { fontFamily: fontFamilies.serif, fontWeight: '600', letterSpacing: 0 },
    titleLarge: { fontFamily: fontFamilies.serif, fontWeight: '600', letterSpacing: 0 },
    titleMedium: { fontFamily: fontFamilies.sans, fontWeight: '600', letterSpacing: 0 },
    titleSmall: { fontFamily: fontFamilies.sans, fontWeight: '600', letterSpacing: 0 },
    labelLarge: { fontFamily: fontFamilies.sans, fontWeight: '600', letterSpacing: 0 },
    labelMedium: { fontFamily: fontFamilies.sans, fontWeight: '600', letterSpacing: 0 },
    labelSmall: { fontFamily: fontFamilies.sans, fontWeight: '600', letterSpacing: 0 },
    bodyLarge: { fontFamily: fontFamilies.sans, fontWeight: '400', letterSpacing: 0, lineHeight: 24 },
    bodyMedium: { fontFamily: fontFamilies.sans, fontWeight: '400', letterSpacing: 0, lineHeight: 21 },
    bodySmall: { fontFamily: fontFamilies.sans, fontWeight: '400', letterSpacing: 0, lineHeight: 18 },
  },
});

/**
 * Creates a custom theme by merging our color tokens with React Native Paper's theme
 */
function createCustomTheme(isDark: boolean) {
  const baseTheme = isDark ? MD3DarkTheme : MD3LightTheme;
  const colorScheme = isDark ? 'dark' : 'light';
  const colors = Colors[colorScheme];

  return {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      primary: colors.primary,
      brandPrimary: colors.primary,
      primaryContainer: colors.primaryContainer,
      onPrimary: colors.onPrimary,
      onPrimaryContainer: colors.onPrimaryContainer,
      secondary: colors.secondary,
      secondaryContainer: colors.secondaryContainer,
      onSecondary: colors.onSecondary,
      onSecondaryContainer: colors.onSecondaryContainer,
      background: colors.background,
      onBackground: colors.onBackground,
      surface: colors.surface,
      surfaceVariant: colors.surfaceVariant,
      surfaceDisabled: isDark ? 'rgba(240, 233, 223, 0.12)' : 'rgba(36, 35, 31, 0.12)',
      onSurface: colors.onSurface,
      onSurfaceVariant: colors.onSurfaceVariant,
      onSurfaceDisabled: isDark ? 'rgba(240, 233, 223, 0.38)' : 'rgba(36, 35, 31, 0.38)',
      error: colors.error,
      errorContainer: colors.errorContainer,
      onError: colors.onError,
      onErrorContainer: colors.onErrorContainer,
      notification: colors.notification,
      outline: colors.outline,
      outlineVariant: colors.outlineVariant,
      shadow: isDark ? '#000000' : '#24231f',
      scrim: colors.scrim,
      backdrop: colors.backdrop,
      elevation: {
        level0: 'transparent',
        level1: colors.surfaceRaised,
        level2: colors.surfaceRaised,
        level3: colors.surfaceRaised,
        level4: colors.surfaceRaised,
        level5: colors.surfaceRaised,
      },
      // Additional custom colors available through theme.colors
      card: colors.card,
      cardAlt: colors.cardAlt,
      text: colors.text,
      textPrimary: colors.textPrimary,
      textSecondary: colors.textSecondary,
      textTertiary: colors.textTertiary,
      textInverse: colors.textInverse,
      border: colors.border,
      divider: colors.divider,
      success: colors.success,
      warning: colors.warning,
      info: colors.info,
      surfaceRaised: colors.surfaceRaised,
      surfaceSunken: colors.surfaceSunken,
      userBubble: colors.userBubble,
      userBubbleForeground: colors.userBubbleForeground,
      modalBackground: colors.modalBackground,
    },
    fonts: {
      ...baseTheme.fonts,
      ...typographyOverrides,
    },
    roundness: 12,
  };
}

const defaultTheme = createCustomTheme(systemPrefersDark);
const defaultStyles = createThemedStyles(defaultTheme);

const ThemeContext = createContext<ThemeContextType>({
  isDarkMode: false,
  toggleTheme: async () => {},
  isLoading: false,
  error: null,
  theme: defaultTheme,
  styles: defaultStyles,
});

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within an AppThemeProvider');
  }
  return context;
};

/**
 * App Theme Provider Component
 * 
 * Manages the application's theme state and provides theme context to the app.
 * Handles theme persistence and theme switching.
 * 
 * @component
 */
export function AppThemeProvider({ children }: AppThemeProviderProps) {
  // Initialize dark mode based on system preference to prevent white flash
  const [isDarkMode, setIsDarkMode] = useState(systemPrefersDark);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState(defaultTheme);
  const [styles, setStyles] = useState(defaultStyles);
  
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Check authentication state
  useEffect(() => {
    const auth = getAuthenticator();
    if (auth) {
      const currentState = auth.authState.currentState;
      const loggedIn = currentState === 'logged_in';
      setIsLoggedIn(loggedIn);
      
      // Listen for auth state changes
      const unsubscribe = auth.authState.onStateChange.listen((_, newState) => {
        setIsLoggedIn(newState === 'logged_in');
      });
      
      return () => unsubscribe();
    }
  }, []);
  
  const updateTheme = useCallback((isDark: boolean) => {
    const newTheme = createCustomTheme(isDark);
    setTheme(newTheme);
    setStyles(createThemedStyles(newTheme));
    setIsDarkMode(isDark);
  }, []);

  // Load theme from direct storage at mount, before propertyTree is available
  useEffect(() => {
    const loadEarlyTheme = async () => {
      try {
        const darkMode = await getStoredDarkMode();
        console.log('[AppTheme] Early theme load:', darkMode);
        if (darkMode !== null) {
          updateTheme(darkMode);
        }
      } catch (error) {
        console.error('[AppTheme] Failed to load early theme:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadEarlyTheme();
  }, [updateTheme]);

  /**
   * Toggles between light and dark mode
   */
  const toggleTheme = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const newDarkMode = !isDarkMode;
      console.log('[AppTheme] Toggling theme to:', newDarkMode);
      
      // Update the theme immediately for better UX
      updateTheme(newDarkMode);
      
      if (isLoggedIn) {
        const appModel = getModel();
        if (!appModel?.settingsStorage) {
          throw new Error('Cannot persist theme before settings storage is initialized');
        }
        await appModel.settingsStorage.updateField('ui', 'darkMode', newDarkMode);
      }

      // Keep the small pre-login cache in sync with the canonical value.
      await setStoredDarkMode(newDarkMode);
    } catch (error) {
      console.error('[AppTheme] Failed to toggle theme:', error);
      // Revert on error
      updateTheme(isDarkMode);
      setError(error instanceof Error ? error.message : 'Failed to toggle theme');
    } finally {
      setIsLoading(false);
    }
  }, [isDarkMode, isLoggedIn, updateTheme]);

  const contextValue = {
    isDarkMode,
    toggleTheme,
    isLoading,
    error,
    theme,
    styles,
  };

  // If still loading theme, render a container with the current theme background
  // to prevent white flash during the transition
  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <ThemeContext.Provider value={contextValue}>
          <PaperProvider theme={theme}>
            {children}
          </PaperProvider>
        </ThemeContext.Provider>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ThemeContext.Provider value={contextValue}>
        <PaperProvider theme={theme}>
          {children}
        </PaperProvider>
      </ThemeContext.Provider>
    </View>
  );
}

export default AppThemeProvider;

// Direct access to theme setting via storage (available before propertyTree)
export async function getStoredDarkMode(): Promise<boolean | null> {
  try {
    if (Platform.OS === 'web') {
      const result = globalThis.localStorage?.getItem('app_darkMode') ?? null;
      return result === 'true' ? true : result === 'false' ? false : null;
    }
    const result = await SecureStore.getItemAsync('app_darkMode');
    return result === 'true' ? true : result === 'false' ? false : null;
  } catch (error) {
    console.error('[AppTheme] Error getting stored dark mode:', error);
    return null;
  }
}

export async function setStoredDarkMode(isDarkMode: boolean): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem('app_darkMode', String(isDarkMode));
      return;
    }
    await SecureStore.setItemAsync('app_darkMode', String(isDarkMode));
  } catch (error) {
    console.error('[AppTheme] Error setting stored dark mode:', error);
  }
} 
