import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppState as RNAppState, AppStateStatus } from 'react-native';
import { QuicModel } from '../../models/network/QuicModel';
import { ModelService } from '../../services/ModelService';

type AppContextState = {
  appState: 'active' | 'background' | 'inactive';
  isReady: boolean;
  quicModel?: QuicModel;
};

const AppContext = createContext<AppContextState>({
  appState: 'active',
  isReady: true
});

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

interface AppProviderProps {
  children: React.ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [state, setState] = useState<AppContextState>({
    appState: 'active',
    isReady: true
  });

  // Listen for app state changes to properly clean up resources
  useEffect(() => {
    // Define app state change handler
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      console.log('[AppProvider] App state changed to:', nextAppState);
      
      // Update app state in context
      setState(prev => ({
        ...prev,
        appState: nextAppState as 'active' | 'background' | 'inactive'
      }));
      
      // Handle cleanup when app goes to background
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        console.log('[AppProvider] App going to background, performing cleanup...');
        
        // Stop device discovery to clean up resources
        try {
          // Get discovery model from AppModel (only available after login)
          const appModel = ModelService.getAppModel();
          const deviceDiscoveryModel = appModel?.deviceDiscoveryModel;
          if (deviceDiscoveryModel && typeof deviceDiscoveryModel.isDiscovering === 'function' && deviceDiscoveryModel.isDiscovering()) {
            console.log('[AppProvider] Stopping device discovery on app background');
            deviceDiscoveryModel.stopDiscovery().catch(error => {
              console.error('[AppProvider] Error stopping discovery on app background:', error);
            });
          }
        } catch (error) {
          console.error('[AppProvider] Error accessing DeviceDiscoveryModel for cleanup:', error);
        }
      } else if (nextAppState === 'active') {
        console.log('[AppProvider] App returning to foreground');
        // AppModel will handle restarting discovery if needed based on settings
      }
    };
    
    // Register app state change listener
    const subscription = RNAppState.addEventListener('change', handleAppStateChange);
    
    // Cleanup function
    return () => {
      try {
        if (subscription && typeof subscription.remove === 'function') {
          subscription.remove();
        }
      } catch (error) {
        console.error('[AppProvider] Error removing app state listener:', error);
      }
    };
  }, []);

  return (
    <AppContext.Provider value={state}>
      {children}
    </AppContext.Provider>
  );
}

export default AppProvider; 