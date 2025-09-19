/**
 * Simple utility to check if native modules are properly loaded
 */
import { NativeModules, TurboModuleRegistry } from 'react-native';

/**
 * Call this function early in the app initialization
 * to detect if modules are properly loaded
 */
export function checkNativeModules() {
  const modules = {
    RNLlama: {
      nativeModule: !!NativeModules.RNLlama,
      turboModule: false,
      methods: NativeModules.RNLlama ? Object.keys(NativeModules.RNLlama) : []
    },
    UDPModule: {
      nativeModule: !!NativeModules.UDPModule,
      turboModule: false,
      methods: NativeModules.UDPModule ? Object.keys(NativeModules.UDPModule) : []
    },
    UDPDirectModule: {
      nativeModule: !!NativeModules.UDPDirectModule,
      turboModule: false,
      methods: NativeModules.UDPDirectModule ? Object.keys(NativeModules.UDPDirectModule) : []
    },
  };

  // Try to get modules from TurboModuleRegistry
  try {
    modules.RNLlama.turboModule = !!TurboModuleRegistry.get('RNLlama');
    modules.UDPModule.turboModule = !!TurboModuleRegistry.get('UDPModule');
    modules.UDPDirectModule.turboModule = !!TurboModuleRegistry.get('UDPDirectModule');
  } catch (e) {
    console.error('Error checking TurboModuleRegistry:', e);
  }

  // Log results
  console.log('===== NATIVE MODULE CHECK =====');
  Object.entries(modules).forEach(([name, info]) => {
    console.log(`${name}: ${info.nativeModule ? '✅' : '❌'} (Native) ${info.turboModule ? '✅' : '❌'} (Turbo)`);
    if (info.methods.length > 0) {
      console.log(`  Methods: ${info.methods.join(', ')}`);
    }
  });
  console.log('===============================');

  return modules;
}

// Automatically run the check in development
if (__DEV__) {
  setTimeout(checkNativeModules, 500);
} 