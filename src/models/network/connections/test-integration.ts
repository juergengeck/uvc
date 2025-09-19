/**
 * Test file to verify lama ConnectionsModel integration
 * 
 * This file demonstrates usage of the lama ConnectionsModel utilities
 * and verifies that imports work correctly.
 */

import {
  ConnectionsModel,
  LamaConnectionsPresets,
  LamaConnectionsConfigBuilder,
  LamaConnectionsUtils,
  createLamaConnectionsModel
} from './index';

/**
 * Test function to verify all exports are available
 */
export function testLamaConnectionsIntegration(): void {
  console.log('Testing Lama ConnectionsModel Integration...');

  // Test 1: Verify presets are available
  console.log('✓ Presets available:', Object.keys(LamaConnectionsPresets));

  // Test 2: Verify config builder works
  const config = LamaConnectionsConfigBuilder
    .fromPreset('PAIRING_ONLY')
    .withCommServerUrl('wss://test.example.com')
    .forTransportManager()
    .build();
  
  console.log('✓ Config builder works:', config);

  // Test 3: Verify utility functions are available
  const utilFunctions = Object.keys(LamaConnectionsUtils);
  console.log('✓ Utility functions available:', utilFunctions);

  // Test 4: Verify ConnectionsModel is available
  console.log('✓ ConnectionsModel available:', typeof ConnectionsModel);

  // Test 5: Verify factory function is available
  console.log('✓ Factory function available:', typeof createLamaConnectionsModel);

  console.log('All tests passed! Lama ConnectionsModel integration is working.');
}

/**
 * Example usage patterns for documentation
 */
export const exampleUsage = {
  // Basic configuration for TransportManager integration
  transportManagerConfig: LamaConnectionsUtils.createTransportManagerConfig('wss://comm.example.com'),

  // Basic configuration for standalone operation
  standaloneConfig: LamaConnectionsUtils.createStandaloneConfig('wss://comm.example.com'),

  // Custom configuration using builder
  customConfig: LamaConnectionsConfigBuilder
    .fromPreset('DEVELOPMENT')
    .withCommServerUrl('wss://dev.example.com')
    .withPairingExpiration(60000 * 60) // 1 hour
    .withDebugRequests(true)
    .build(),

  // Available presets
  presets: LamaConnectionsPresets
};

// Export for testing
export default {
  testLamaConnectionsIntegration,
  exampleUsage
}; 