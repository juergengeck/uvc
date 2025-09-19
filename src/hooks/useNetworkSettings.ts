import { useState, useEffect, useCallback } from 'react';
import { getNetworkSettingsService } from '../services/NetworkSettingsService';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import type { Invitation } from '@refinio/one.models/lib/misc/ConnectionEstablishment/PairingManager.js';
import type { SomeoneConnectionSummary } from '../types/someone';
import { ModelService } from '../services/ModelService';

/**
 * Hook for using network settings
 * Provides access to device discovery, leute connections, and other network settings
 */
export const useNetworkSettings = () => {
  const networkSettingsService = getNetworkSettingsService();
  
  // State
  const [leuteConnected, setLeuteConnected] = useState<boolean>(
    networkSettingsService.isLeuteConnected()
  );
  const [discoveryEnabled, setDiscoveryEnabled] = useState<boolean>(
    false
  );
  const [autoConnectEnabled, setAutoConnectEnabled] = useState<boolean>(
    false
  );
  const [connections, setConnections] = useState<any[]>(
    []
  );
  const [someoneConnections, setSomeoneConnections] = useState<SomeoneConnectionSummary[]>(
    []
  );
  const [commServerUrl, setCommServerUrl] = useState<string>(
    networkSettingsService.getCommServerUrl()
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  // Effect to listen for network state changes
  useEffect(() => {
    // Get initial states (only the ones available)
    setLeuteConnected(networkSettingsService.isLeuteConnected());
    
    // Load initial connections using both methods for compatibility
    const loadConnections = async () => {
      try {
        // Load raw connections for backwards compatibility
        const connectionsList = await networkSettingsService.getConnections();
        console.log('[useNetworkSettings] Loaded raw connections:', connectionsList.length);
        setConnections(connectionsList);
        
        // Load Someone connection summaries using LeuteModel directly
        const appModel = ModelService.getModel();
        if (appModel?.leuteModel) {
          // Use LeuteModel.others() to get Someone objects directly
          const someoneObjects = await appModel.leuteModel.others();
          
          const someoneConnectionSummaries: SomeoneConnectionSummary[] = someoneObjects.map(someone => {
            // Get the Someone data safely
            const someoneData = (someone as any).pSomeone;
            const someoneId = someoneData?.someoneId || someoneData?.idHash || someone.idHash || 'unknown';
            
            return {
              someone: {
                personId: someoneData?.personId || 'unknown',
                someoneId: someoneId,
                displayName: someone.name || 'Unknown Contact',
                ...someone // Include all other properties
              },
              connections: [], // TODO: Get actual connection data from ConnectionsModel
              summary: {
                totalConnections: 0,
                activeConnections: 0,
                internetOfMeConnections: 0,
                internetOfPeopleConnections: 0
              }
            };
          });
          console.log('[useNetworkSettings] Loaded Someone connections via LeuteModel:', someoneConnectionSummaries.length);
          setSomeoneConnections(someoneConnectionSummaries);
        } else {
          console.warn('[useNetworkSettings] LeuteModel not available for Someone connections');
        }
      } catch (error) {
        console.error('[useNetworkSettings] Failed to load connections:', error);
      }
    };
    
    loadConnections();
    
    // Set up connection change listener  
    const unsubscribe1 = networkSettingsService.onConnectionsChanged.listen(() => {
      console.log('[useNetworkSettings] onConnectionsChanged triggered, reloading connections');
      loadConnections();
    });

    // Set up CommServer URL change listener
    const unsubscribe2 = networkSettingsService.onCommServerUrlChanged.listen((url: string) => {
      console.log('[useNetworkSettings] CommServer URL changed:', url);
      setCommServerUrl(url);
    });

    // Set up LeuteModel.onUpdated listener for Someone changes
    const appModel = ModelService.getModel();
    let unsubscribe3: { remove?: () => void } | undefined;
    if (appModel?.leuteModel) {
      unsubscribe3 = appModel.leuteModel.onUpdated.listen(() => {
        console.log('[useNetworkSettings] LeuteModel updated, reloading Someone connections');
        loadConnections();
      });
    }
    
    return () => {
      unsubscribe1.remove?.();
      unsubscribe2.remove?.();
      unsubscribe3?.remove?.();
    };
  }, []);
  
  // Connect to leute.one
  const connectToLeute = useCallback(async () => {
    if (leuteConnected) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const success = await networkSettingsService.connectToLeute();
      if (!success) {
        setError('Failed to connect to leute.one');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Error connecting to leute.one: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [leuteConnected]);
  
  // Disconnect from leute.one
  const disconnectFromLeute = useCallback(async () => {
    if (!leuteConnected) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      await networkSettingsService.disconnectFromLeute();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Error disconnecting from leute.one: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [leuteConnected]);
  
  // Toggle device discovery
  const toggleDiscovery = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await networkSettingsService.setDeviceDiscoveryEnabled(!discoveryEnabled);
      setDiscoveryEnabled(!discoveryEnabled);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Error toggling device discovery: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [discoveryEnabled]);
  
  // Toggle auto-connect
  const toggleAutoConnect = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await networkSettingsService.setDeviceAutoConnectEnabled(!autoConnectEnabled);
      setAutoConnectEnabled(!autoConnectEnabled);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Error toggling auto-connect: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [autoConnectEnabled]);
  
  // Toggle leute connections enabled
  const toggleLeuteConnectionsEnabled = useCallback((enabled: boolean) => {
    networkSettingsService.setLeuteConnectionsEnabled(enabled);
  }, []);
  

  
  // Accept a pairing invitation
  const acceptInvitation = useCallback(async (invitation: Invitation): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const success = await networkSettingsService.acceptInvitation(invitation);
      return success;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Error accepting invitation: ${errorMessage}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // Accept a pairing invitation from a URL - simplified to use core pairing directly
  const acceptInvitationFromUrl = useCallback(async (url: string): Promise<boolean> => {
    console.log('[useNetworkSettings] acceptInvitationFromUrl called with URL:', url);
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Use the simplified InviteManager method which calls core pairing directly
      const appModel = ModelService.getModel();
      if (!appModel?.inviteManager) {
        throw new Error('InviteManager not available');
      }
      
      await appModel.inviteManager.acceptInvitationFromUrl(url);
      console.log('[useNetworkSettings] acceptInvitationFromUrl completed successfully');
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[useNetworkSettings] Error in acceptInvitationFromUrl:', errorMessage);
      setError(`Error accepting invitation from URL: ${errorMessage}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Update CommServer URL
  const updateCommServerUrl = useCallback(async (url: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      await networkSettingsService.setCommServerUrl(url);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Error updating CommServer URL: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Reset CommServer URL to default
  const resetCommServerUrl = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await networkSettingsService.resetCommServerUrl();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Error resetting CommServer URL: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    // State
    leuteConnected,
    discoveryEnabled,
    autoConnectEnabled,
    connections,
    someoneConnections,
    commServerUrl,
    isLoading,
    error,
    
    // Connection actions
    connectToLeute,
    disconnectFromLeute,
    toggleDiscovery,
    toggleAutoConnect,
    toggleLeuteConnectionsEnabled,
    
    // CommServer URL actions
    updateCommServerUrl,
    resetCommServerUrl,
    
    // Pairing actions
    acceptInvitation,
    acceptInvitationFromUrl
  };
};

export default useNetworkSettings;