import React, { createContext, useContext, useCallback, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import type { Model as BaseModel } from '@refinio/one.models/lib/models/Model.js';
import type { LLMSettings, AISummaryConfig, CloudAISettings, LocalAISettings } from '@src/types/ai';
import type { DeviceConfig, DeviceSettingsGroup } from '@src/types/device';
import { defaultDeviceConfig } from '@src/types/device';
import { useInstance } from './useInstance';
import i18n from '@src/i18n/config';
import { setStoredLanguage, getStoredLanguage } from '@src/i18n/config';
import { SettingsManager } from '@src/settings/SettingsManager';

interface Model extends BaseModel {
  propertyTree: {
    getValue: (key: string) => Promise<string | null>;
    setValue: (key: string, value: string) => Promise<void>;
  };
}

interface SettingsContextType {
  // General settings
  language: string;
  setLanguage: (lang: string) => Promise<void>;
  darkMode: boolean;
  setDarkMode: (enabled: boolean) => Promise<void>;
  
  // AI settings
  providerConfigs: Record<string, LLMSettings>;
  summaryConfig: AISummaryConfig;
  updateProvider: (providerId: string, config: Partial<LLMSettings>) => Promise<void>;
  updateSummary: (config: Partial<AISummaryConfig>) => Promise<void>;
  
  // Device settings
  deviceConfig: DeviceConfig;
  deviceSettings: DeviceSettingsGroup;
  updateDeviceConfig: (config: Partial<DeviceConfig>) => Promise<void>;
  updateDeviceSettings: (settings: Partial<DeviceSettingsGroup>) => Promise<void>;
  
  // Loading states
  isLoading: boolean;
  error: string | null;
  
  // Import/Export
  importSettings: (settings: any) => Promise<void>;
  exportSettings: () => Promise<string>;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

interface SettingsProviderProps {
  children: React.ReactNode;
}

// Default configurations
const defaultProviderConfigs: Record<string, LLMSettings> = {
  local: {
    $type$: 'LLMSettings',
    name: 'local',
    creator: 'system',
    created: Date.now(),
    modified: Date.now(),
    createdAt: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
    llm: '', // Requires LLM ID Hash
    active: false, // Use 'active' instead of 'enabled'?
    modelType: 'local',
    // Add other required LLMSettings fields with defaults if necessary
    temperature: 0.7,
    threads: 4,
    batchSize: 512,
    nGpuLayers: 0
  },
  cloud: {
    $type$: 'LLMSettings',
    name: 'cloud',
    creator: 'system',
    created: Date.now(),
    modified: Date.now(),
    createdAt: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
    llm: '', // Requires LLM ID Hash
    active: false, // Use 'active' instead of 'enabled'?
    modelType: 'remote',
    // Add other required LLMSettings fields with defaults if necessary
    temperature: 0.7,
    maxTokens: 2048
  }
};

// Only define non-device default settings here
// Device settings should use SettingsManager.getDefaultDeviceSettings()
const defaultSummaryConfig: AISummaryConfig = {
  enabled: false,
  maxTokens: 100,
  temperature: 0.7,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
};

// Default device settings
const defaultDeviceSettingsGroup: DeviceSettingsGroup = {
  $type$: 'Settings.device',
  devices: {},
  discoveryEnabled: false,
  discoveryPort: 49497,
  autoConnect: false,
  addOnlyConnectedDevices: false,
  defaultDataPresentation: {
    $type$: 'ESP32DataPresentation',
    format: 'json'
  }
};

export function SettingsProvider({ children }: SettingsProviderProps) {
  // useInstance is active
  const { instance } = useInstance(); 
  console.log(`[SettingsProvider] Received instance defined: ${!!instance}`);
  
  // --- Re-enable loading/error state --- 
  const [isLoading, setIsLoading] = useState(false); 
  const [error, setError] = useState<string | null>(null);
  // --- End Re-enable loading/error state --- 
  
  const [language, setLanguageState] = useState('en');
  const [darkMode, setDarkModeState] = useState(false);
  const [providerConfigs, setProviderConfigs] = useState<Record<string, LLMSettings>>(defaultProviderConfigs);
  const [summaryConfig, setSummaryConfig] = useState<AISummaryConfig>(defaultSummaryConfig);
  const [deviceConfig, setDeviceConfig] = useState<DeviceConfig>(defaultDeviceConfig);
  const [deviceSettings, setDeviceSettings] = useState<DeviceSettingsGroup>(defaultDeviceSettingsGroup);
  
  // useEffect hooks are active
  const colorScheme = useColorScheme();
  
  // Load language from storage on mount
  useEffect(() => {
    const loadEarlySettings = async () => {
      try {
        const storedLang = await getStoredLanguage();
        if (storedLang && storedLang !== language) {
          console.log(`[SettingsProvider] Loading stored language: ${storedLang}`);
          setLanguageState(storedLang);
          await i18n.changeLanguage(storedLang);
        }
      } catch (error) {
        console.error('[SettingsProvider] Error loading stored language:', error);
      }
    };
    loadEarlySettings();
  }, []);
  
  useEffect(() => { /* ... */ }, [darkMode]);
  useEffect(() => { /* ... */ }, [language]); 

  // --- Restore loadSettings definition and propertyTree access --- 
  const loadSettings = async () => {
    // Check if AppModel is ready before attempting PropertyTree access
    if (!instance || instance.currentState !== 'Initialised') {
      console.warn('[SettingsProvider] AppModel not ready, using defaults');
      setDeviceSettings(SettingsManager.getDefaultDeviceSettings());
      setDeviceConfig({ ...defaultDeviceConfig, discoveryEnabled: false });
      setProviderConfigs(defaultProviderConfigs);
      setSummaryConfig(defaultSummaryConfig);
      setIsLoading(false);
      return;
    }

    // TEMPORARY: Disable PropertyTree access to prevent initialization blocking
    console.warn('[SettingsProvider] PropertyTree access temporarily disabled, using defaults');
    setDeviceSettings(SettingsManager.getDefaultDeviceSettings());
    setDeviceConfig({ ...defaultDeviceConfig, discoveryEnabled: false });
    setProviderConfigs(defaultProviderConfigs);
    setSummaryConfig(defaultSummaryConfig);
    setIsLoading(false);
    return;
    
    /* 
    if (!instance?.propertyTree) {
      console.warn('[SettingsProvider] PropertyTree not available, using defaults');
      setDeviceSettings(SettingsManager.getDefaultDeviceSettings());
      setDeviceConfig({ ...defaultDeviceConfig, discoveryEnabled: false });
      setProviderConfigs(defaultProviderConfigs);
      setSummaryConfig(defaultSummaryConfig);
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const savedLanguage = await instance.propertyTree.getValue('language');
      if (savedLanguage) {
        setLanguageState(savedLanguage);
        await i18n.changeLanguage(savedLanguage);
        console.log(`[SettingsProvider] Loaded language from propertyTree: ${savedLanguage}`);
      }
      
      const savedDarkMode = await instance.propertyTree.getValue('darkMode');
      if (savedDarkMode) {
        const isDarkMode = savedDarkMode === 'true';
        setDarkModeState(isDarkMode);
      }
      
      const savedProviderConfigs = await instance.propertyTree.getValue('aiProviders');
      if (savedProviderConfigs) {
        setProviderConfigs(JSON.parse(savedProviderConfigs));
      }
      
      const savedSummaryConfig = await instance.propertyTree.getValue('aiSummary');
      if (savedSummaryConfig) {
        setSummaryConfig(JSON.parse(savedSummaryConfig));
      }
      
      const savedDeviceConfig = await instance.propertyTree.getValue('deviceConfig');
      if (savedDeviceConfig) {
        setDeviceConfig(JSON.parse(savedDeviceConfig));
      }
      
      const savedDeviceSettings = await instance.propertyTree.getValue('deviceSettings');
      if (savedDeviceSettings) {
        setDeviceSettings(JSON.parse(savedDeviceSettings));
      } else {
        setDeviceSettings(SettingsManager.getDefaultDeviceSettings());
      }
    } catch (err) {
      console.error('[Settings] Failed to load settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
    */
  };
  // --- End Restore loadSettings definition --- 

  // Load settings when instance is available
  useEffect(() => {
    if (instance) { // Restore check
      loadSettings(); // Restore call
    } else {
      // If no instance, use defaults (keep existing logic)
      console.warn('[SettingsProvider] No instance available, using default settings');
      setDeviceSettings(SettingsManager.getDefaultDeviceSettings());
      setDeviceConfig({ ...defaultDeviceConfig, discoveryEnabled: false });
      setProviderConfigs(defaultProviderConfigs);
      setSummaryConfig(defaultSummaryConfig);
      setIsLoading(false);
    }
  }, [instance]); // Add instance dependency

  // --- Restore Callbacks with propertyTree access --- 
  const setLanguage = useCallback(async (lang: string) => {
    // TEMPORARY: Disable PropertyTree access
    console.log('[SettingsProvider] setLanguage called (PropertyTree disabled):', lang);
    await setStoredLanguage(lang);
    setLanguageState(lang);
    return;
    
    /* TODO: Re-enable PropertyTree access
    setIsLoading(true);
    setError(null);
    try {
      await setStoredLanguage(lang);
      setLanguageState(lang);
      if (instance?.propertyTree) {
        await instance.propertyTree.setValue('language', lang);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update language');
      throw err;
    } finally {
      setIsLoading(false);
    }
    */
  }, [instance]);

  const setDarkMode = useCallback(async (enabled: boolean) => {
    // TEMPORARY: Disable PropertyTree access
    console.log('[SettingsProvider] setDarkMode called (PropertyTree disabled):', enabled);
    setDarkModeState(enabled);
    return;
    
    /* TODO: Re-enable PropertyTree access
    if (!instance?.propertyTree) return;
    setIsLoading(true);
    setError(null);
    try {
      await instance.propertyTree.setValue('darkMode', enabled ? 'true' : 'false');
      setDarkModeState(enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update dark mode');
      throw err;
    } finally {
      setIsLoading(false);
    }
    */
  }, [instance]);

  // Keep updateProvider as dummy for now
  /*
  const updateProvider = (providerId: string, updates: Partial<LLMSettings>): Promise<void> => {
    // ... function body ...
  };
  */
  const updateProvider = async () => { console.log('Dummy updateProvider callback'); }; 

  // TEMPORARY: Disable PropertyTree access for all update functions
  const updateSummary = useCallback(async (config: Partial<AISummaryConfig>) => {
    console.log('[SettingsProvider] updateSummary called (PropertyTree disabled):', config);
    const newConfig = { ...summaryConfig, ...config };
    setSummaryConfig(newConfig);
  }, [summaryConfig]);
  
  const updateDeviceConfig = useCallback(async (config: Partial<DeviceConfig>) => {
    console.log('[SettingsProvider] updateDeviceConfig called (PropertyTree disabled):', config);
    console.log('[SettingsProvider] Current device config before update:', deviceConfig);
    
    // Use setTimeout to defer state update and avoid potential React batching issues
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        try {
          console.log('[SettingsProvider] Updating device config state...');
          setDeviceConfig(prevConfig => {
            const newConfig = { ...prevConfig, ...config, lastUpdated: Date.now() };
            console.log('[SettingsProvider] New device config:', newConfig);
            return newConfig;
          });
          console.log('[SettingsProvider] Device config state updated successfully');
          resolve();
        } catch (error) {
          console.error('[SettingsProvider] Error updating device config:', error);
          resolve(); // Resolve anyway to not block
        }
      }, 50);
    });
  }, [deviceConfig]);
  
  const updateDeviceSettings = useCallback(async (settings: Partial<DeviceSettingsGroup>) => {
    console.log('[SettingsProvider] updateDeviceSettings called (PropertyTree disabled):', settings);
    setDeviceSettings(prevSettings => ({ ...prevSettings, ...settings }));
  }, []);

  const importSettings = useCallback(async (settings: any) => {
    console.log('[SettingsProvider] importSettings called (PropertyTree disabled):', Object.keys(settings));
    if (settings.language) { setLanguageState(settings.language); await i18n.changeLanguage(settings.language); }
    if (settings.darkMode !== undefined) { setDarkModeState(settings.darkMode); }
    if (settings.providerConfigs) { setProviderConfigs(settings.providerConfigs); }
    if (settings.summaryConfig) { setSummaryConfig(settings.summaryConfig); }
    if (settings.deviceConfig) { setDeviceConfig(settings.deviceConfig); }
    if (settings.deviceSettings) { setDeviceSettings(settings.deviceSettings); }
  }, [setLanguageState, setDarkModeState, setProviderConfigs, setSummaryConfig, setDeviceConfig, setDeviceSettings]);

  // exportSettings doesn't need instance access
  const exportSettings = useCallback(async () => {
    return JSON.stringify({ language, darkMode, providerConfigs, summaryConfig, deviceConfig, deviceSettings }, null, 2);
  }, [language, darkMode, providerConfigs, summaryConfig, deviceConfig, deviceSettings]);
  // --- End Restore Callbacks --- 

  // Calculate the real context value (already using real value)
  const value = {
    language,
    setLanguage,
    darkMode,
    setDarkMode,
    providerConfigs,
    summaryConfig,
    updateProvider, // Pass the dummy function for now
    updateSummary,
    deviceConfig,
    deviceSettings,
    updateDeviceConfig,
    updateDeviceSettings,
    isLoading,
    error,
    importSettings,
    exportSettings,
  };

  return (
    // Use the real value
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
} 
