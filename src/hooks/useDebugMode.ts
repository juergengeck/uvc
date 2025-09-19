import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Hook that provides debug mode state for the application
 * @returns Object containing debug mode state and functions to enable/disable it
 */
export function useDebugMode() {
  const [debugModeEnabled, setDebugModeEnabled] = useState(false);
  
  // Load debug mode setting from AsyncStorage on mount
  useEffect(() => {
    async function loadDebugMode() {
      try {
        const storedValue = await AsyncStorage.getItem('debugModeEnabled');
        if (storedValue !== null) {
          setDebugModeEnabled(storedValue === 'true');
        }
      } catch (error) {
        console.error('Error loading debug mode setting:', error);
      }
    }
    
    loadDebugMode();
  }, []);
  
  // Function to toggle debug mode
  const toggleDebugMode = async () => {
    try {
      const newValue = !debugModeEnabled;
      setDebugModeEnabled(newValue);
      await AsyncStorage.setItem('debugModeEnabled', String(newValue));
    } catch (error) {
      console.error('Error saving debug mode setting:', error);
    }
  };
  
  // Function to explicitly enable debug mode
  const enableDebugMode = async () => {
    try {
      setDebugModeEnabled(true);
      await AsyncStorage.setItem('debugModeEnabled', 'true');
    } catch (error) {
      console.error('Error enabling debug mode:', error);
    }
  };
  
  // Function to explicitly disable debug mode
  const disableDebugMode = async () => {
    try {
      setDebugModeEnabled(false);
      await AsyncStorage.setItem('debugModeEnabled', 'false');
    } catch (error) {
      console.error('Error disabling debug mode:', error);
    }
  };
  
  return {
    debugModeEnabled,
    toggleDebugMode,
    enableDebugMode,
    disableDebugMode
  };
}

export default useDebugMode; 