import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { View, Appearance } from 'react-native';
import { MD3DarkTheme, MD3LightTheme, Provider as PaperProvider } from 'react-native-paper';
import { Colors } from '@src/constants/Colors';
import { createThemedStyles } from '@src/constants/ThemeStyles';
import type { Model as BaseModel } from '@refinio/one.models/lib/models/Model.js';
import * as SecureStore from 'expo-secure-store';
import { getAuthenticator, getModel } from '@src/initialization';

// Define the interface for propertyTree to match actual implementation
interface PropertyTree {
  getValue: (key: string) => Promise<string | null>;
  setValue: (key: string, value: string) => Promise<void>;
}

interface Model extends BaseModel {
  propertyTree: PropertyTree;
}

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

interface AppThemeProviderProps {
  children: React.ReactNode;
}

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
      primaryContainer: colors.primaryContainer,
      onPrimary: colors.onPrimary,
      onPrimaryContainer: colors.onPrimaryContainer,
      secondary: colors.secondary,
      secondaryContainer: colors.secondaryContainer,
      onSecondary: colors.onSecondary,
      onSecondaryContainer: colors.onSecondaryContainer,
      background: colors.background,
      surface: colors.surface,
      surfaceVariant: colors.surfaceVariant,
      onSurface: colors.onSurface,
      onSurfaceVariant: colors.onSurfaceVariant,
      error: colors.error,
      notification: colors.notification,
      // Additional custom colors available through theme.colors
      card: colors.card,
      cardAlt: colors.cardAlt,
      textSecondary: colors.textSecondary,
      textTertiary: colors.textTertiary,
      textInverse: colors.textInverse,
      border: colors.border,
      divider: colors.divider,
      success: colors.success,
      warning: colors.warning,
      info: colors.info,
      scrim: colors.scrim,
      modalBackground: colors.modalBackground,
    },
    roundness: 8,
  };
}

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
  
  // Get model instance only when authenticated
  const [instance, setInstance] = useState<Model | undefined>(undefined);
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
  
  // Try to access model only when logged in
  useEffect(() => {
    let isMounted = true;
    
    const getModelIfLoggedIn = async () => {
      if (!isLoggedIn) {
        if (instance) setInstance(undefined);
        return;
      }
      
      try {
        // Use getModel directly since it's imported at the top
        const appModel = getModel();
        
        if (appModel && isMounted) {
          console.log('[AppTheme] Model available after login');
          // Cast to appropriate type with propertyTree
          setInstance(appModel as unknown as Model);
        }
      } catch (error) {
        console.error('[AppTheme] Error accessing model after login:', error);
      }
    };
    
    getModelIfLoggedIn();
    
    return () => {
      isMounted = false;
    };
  }, [isLoggedIn, instance]);

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
   * Sync theme settings to propertyTree after login
   * TEMPORARILY DISABLED: Prevents Settings infinite loop during initialization
   */
  const syncThemeToPropertyTree = useCallback(async () => {
    if (!instance?.propertyTree || !isLoggedIn) {
      return;
    }
    
    // TEMPORARILY DISABLED: This causes infinite Settings object creation loop
    // that prevents AppModel initialization from completing
    console.log(`[AppTheme] PropertyTree sync temporarily disabled to prevent Settings loop`);
    return;
    
    try {
      await instance.propertyTree.setValue('darkMode', String(isDarkMode));
      console.log(`[AppTheme] Synced darkMode to propertyTree: ${isDarkMode}`);
    } catch (error) {
      console.error('[AppTheme] Failed to sync theme to propertyTree:', error);
    }
  }, [instance?.propertyTree, isLoggedIn, isDarkMode]);

  // Sync theme to propertyTree when user logs in
  useEffect(() => {
    if (instance?.propertyTree && isLoggedIn) {
      syncThemeToPropertyTree();
    }
  }, [instance?.propertyTree, isLoggedIn, syncThemeToPropertyTree]);

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
      
      // Save to direct storage
      await setStoredDarkMode(newDarkMode);
      
      // Save to propertyTree if logged in
      // TEMPORARILY DISABLED: Prevents Settings infinite loop during initialization
      if (instance?.propertyTree && isLoggedIn) {
        console.log(`[AppTheme] PropertyTree sync in toggleTheme temporarily disabled to prevent Settings loop`);
        // await instance.propertyTree.setValue('darkMode', String(newDarkMode));
      }
    } catch (error) {
      console.error('[AppTheme] Failed to toggle theme:', error);
      // Revert on error
      updateTheme(isDarkMode);
      setError(error instanceof Error ? error.message : 'Failed to toggle theme');
    } finally {
      setIsLoading(false);
    }
  }, [instance?.propertyTree, isDarkMode, updateTheme]);

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
    const result = await SecureStore.getItemAsync('app_darkMode');
    return result === 'true' ? true : result === 'false' ? false : null;
  } catch (error) {
    console.error('[AppTheme] Error getting stored dark mode:', error);
    return null;
  }
}

export async function setStoredDarkMode(isDarkMode: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync('app_darkMode', String(isDarkMode));
  } catch (error) {
    console.error('[AppTheme] Error setting stored dark mode:', error);
  }
} 