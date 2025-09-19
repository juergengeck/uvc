import { NativeModules } from 'react-native';

/**
 * Comprehensive utility to inspect native modules in both legacy and New Architecture
 */

// Try to access TurboModuleRegistry if available
let TurboModuleRegistry;
try {
  // This is how TurboModuleRegistry is typically accessed
  TurboModuleRegistry = require('react-native').TurboModuleRegistry;
} catch (e) {
  console.log('TurboModuleRegistry not available');
}

// Try to access __turboModuleProxy if available (internal API)
const turboModuleProxy = global.__turboModuleProxy;

/**
 * Inspects available native modules using various detection methods
 */
export function inspectNativeModules() {
  // Result object
  const result = {
    legacyModules: {},
    turboModules: {},
    directAccessModules: {},
    allDetectedModuleNames: new Set()
  };

  // 1. Check legacy modules via Object.keys
  const legacyModuleNames = Object.keys(NativeModules);
  legacyModuleNames.forEach(name => {
    result.legacyModules[name] = {
      methods: Object.keys(NativeModules[name] || {})
    };
    result.allDetectedModuleNames.add(name);
  });

  // 2. Known module names to test (from logs + common modules)
  const moduleNamesToTest = [
    'RNLlama', 'llama-rn', 'Llama', 'LlamaRN', 
    'UDPModule', 'UDPDirectModule', 'BluetoothModule',
    'ExpoModulesCore', 'ExponentConstants', 'ExponentFileSystem'
  ];

  // 3. Direct property access check
  moduleNamesToTest.forEach(name => {
    if (NativeModules[name]) {
      result.directAccessModules[name] = {
        methods: Object.keys(NativeModules[name]),
        exists: true
      };
      result.allDetectedModuleNames.add(name);
    }
  });

  // 4. TurboModuleRegistry check
  if (TurboModuleRegistry && TurboModuleRegistry.get) {
    result.allDetectedModuleNames.forEach(name => {
      try {
        const module = TurboModuleRegistry.get(name);
        if (module) {
          result.turboModules[name] = {
            methods: Object.keys(module),
            fromRegistry: true
          };
        }
      } catch (e) {
        // Ignore errors
      }
    });
  }

  return result;
}

/**
 * Logs detailed information about available native modules
 */
export function logNativeModuleDetails() {
  console.log('\n========== NATIVE MODULES INSPECTION ==========');
  
  const inspectionResult = inspectNativeModules();
  const allModuleNames = Array.from(inspectionResult.allDetectedModuleNames);
  
  console.log(`\nDetected ${allModuleNames.length} unique module names\n`);
  
  // Log details for each detected module
  allModuleNames.forEach(name => {
    console.log(`\n📱 MODULE: ${name}`);
    
    // Check availability through different methods
    const inLegacy = name in inspectionResult.legacyModules;
    const inTurbo = name in inspectionResult.turboModules;
    const inDirect = name in inspectionResult.directAccessModules;
    
    console.log(`   Legacy enumerable: ${inLegacy}`);
    console.log(`   TurboModule: ${inTurbo}`);
    console.log(`   Direct access: ${inDirect}`);
    
    // Get methods (prefer turbo, then direct, then legacy)
    const methods = 
      (inTurbo && inspectionResult.turboModules[name].methods) ||
      (inDirect && inspectionResult.directAccessModules[name].methods) ||
      (inLegacy && inspectionResult.legacyModules[name].methods) ||
      [];
    
    if (methods.length > 0) {
      console.log(`   Methods (${methods.length}): ${methods.join(', ')}`);
    } else {
      console.log('   No methods detected');
    }
  });
  
  console.log('\n================================================');
  
  return inspectionResult;
}

/**
 * Gets a specific native module using the most appropriate method
 * 
 * @param {string} moduleName - The name of the module to get
 * @returns {Object|null} The native module or null if not found
 */
export function getNativeModule(moduleName) {
  // Try direct access first (most reliable)
  if (NativeModules[moduleName]) {
    return NativeModules[moduleName];
  }
  
  // Try TurboModuleRegistry if available
  if (TurboModuleRegistry && TurboModuleRegistry.get) {
    try {
      const module = TurboModuleRegistry.get(moduleName);
      if (module) return module;
    } catch (e) {
      // Ignore errors
    }
  }
  
  // Try turboModuleProxy if available
  if (turboModuleProxy && turboModuleProxy[moduleName]) {
    return turboModuleProxy[moduleName];
  }
  
  return null;
}

export default {
  inspectNativeModules,
  logNativeModuleDetails,
  getNativeModule
}; 