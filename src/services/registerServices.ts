/**
 * Register Services
 * 
 * This function registers all services with the application model.
 */

import { NetworkConnectivityService } from './NetworkConnectivityService';
import Debug from 'debug';
import { createDeviceSettingsService, createDefaultDeviceSettingsService } from './createDeviceSettingsService';
import { ModelService } from './ModelService';
import { getNetworkSettingsService } from './NetworkSettingsService';

// Enable debug logging
const debug = Debug('one:services:register');

// Service instances
let networkConnectivityService: NetworkConnectivityService | null = null;

/**
 * Register all services with the application model
 * 
 * @param appModel The application model
 * @param deviceSettingsService Optional device settings service instance
 */
export function registerServices(appModel: any, customDeviceSettingsService?: any): void {
  debug('Registering services with app model');
  
  try {
    // Initialize and register network connectivity service
    if (!networkConnectivityService) {
      debug('Creating NetworkConnectivityService');
      networkConnectivityService = new NetworkConnectivityService();
      
      // Initialize in the background - don't await
      networkConnectivityService.init().catch(error => {
        console.error('[Services] Failed to initialize NetworkConnectivityService:', error);
      });
      
      debug('NetworkConnectivityService created');
    }
    
    // Handle device settings service
    let deviceSettingsService = customDeviceSettingsService;
    
    if (!deviceSettingsService) {
      debug('Creating DeviceSettingsService with model');
      deviceSettingsService = createDeviceSettingsService(appModel);
    }
    
    // Initialize NetworkSettingsService lazily to prevent early chum operations
    // NOTE: NetworkSettingsService will be created on first access via getNetworkSettingsService()
    const networkSettingsServiceLazy = {
      getInstance: () => getNetworkSettingsService()
    };
    
    // Register services with app model
    if (appModel) {
      if (typeof appModel.registerService === 'function') {
        // Register using registerService method
        debug('Registering services with app model.registerService');
        
        if (deviceSettingsService) {
          appModel.registerService('deviceSettings', deviceSettingsService);
          debug('DeviceSettingsService registered');
        }
        
        if (networkConnectivityService) {
          appModel.registerService('networkConnectivity', networkConnectivityService);
          debug('NetworkConnectivityService registered');
        }
        
        // Register lazy wrapper instead of actual instance
        appModel.registerService('networkSettings', networkSettingsServiceLazy);
        debug('NetworkSettingsService registered (lazy)');
      } else if (appModel.services instanceof Map) {
        // Register using services Map
        debug('Registering services with app model.services Map');
        
        appModel.services.set('deviceSettings', deviceSettingsService);
        appModel.services.set('networkConnectivity', networkConnectivityService);
        appModel.services.set('networkSettings', networkSettingsServiceLazy);
      } else {
        debug('No valid registration method found on app model');
      }
    }
    
    // Register services with global context for debugging
    if (__DEV__) {
      console.log('[registerServices] Services initialized - ConnectionsModel handles all connection functionality');
      
      (global as any).services = {
        deviceSettings: deviceSettingsService,
        modelService: ModelService,
        network: () => getNetworkSettingsService() // Lazy access for debugging
      };
      console.log('[registerServices] Registered services with global context for debugging');
    }
    
    debug('Services registered successfully');
  } catch (error) {
    debug('Error registering services: %o', error);
    console.error('[Services] Failed to register services:', error);
  }
}

/**
 * Get the network connectivity service instance
 */
export function getNetworkConnectivityService(): NetworkConnectivityService | null {
  return networkConnectivityService;
}

/**
 * Clean up all services
 */
export function cleanupServices(): void {
  debug('Cleaning up services');
  
  try {
    // Clean up network connectivity service
    if (networkConnectivityService) {
      networkConnectivityService.cleanup();
      networkConnectivityService = null;
      debug('NetworkConnectivityService cleaned up');
    }
  } catch (error) {
    debug('Error cleaning up services: %o', error);
    console.error('[Services] Failed to clean up services:', error);
  }
}

export default {
  registerServices,
  getNetworkConnectivityService,
  cleanupServices
}; 