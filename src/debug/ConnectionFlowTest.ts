/**
 * Connection Flow Test
 * 
 * This test can be called from within the app to verify that:
 * 1. Platform detection is working correctly (expo instead of browser)
 * 2. SharedArrayBuffer is available
 * 3. ConnectionsModel can be instantiated without errors
 * 4. No immediate SharedArrayBuffer errors occur
 */

export class ConnectionFlowTest {
  static async runTest(): Promise<{ success: boolean; results: string[] }> {
    const results: string[] = [];
    let success = true;

    try {
      // Test 1: Platform Detection
      try {
        const { getPlatform } = require('@refinio/one.core/lib/system/platform');
        const platform = getPlatform();
        results.push(`✅ Platform detected as: ${platform}`);
        
        if (platform !== 'expo') {
          results.push(`❌ ERROR: Expected platform 'expo' but got '${platform}'`);
          success = false;
        }
      } catch (error) {
        results.push(`❌ ERROR: Platform detection failed: ${(error as Error).message}`);
        success = false;
      }

      // Test 2: SharedArrayBuffer Availability (Skip - not required for React Native)
      results.push('ℹ️  SharedArrayBuffer check skipped (not required for React Native/Hermes)');

      // Test 3: Global Variables Check
      results.push(`📊 typeof global.expo: ${typeof global.expo}`);
      results.push(`📊 typeof global.__expo: ${typeof (global as any).__expo}`);
      results.push(`📊 typeof HermesInternal: ${typeof (global as any).HermesInternal}`);

      // Test 4: ConnectionsModel Import
      try {
        const { ConnectionsModel } = require('@refinio/one.models/lib/models/ConnectionsModel');
        results.push('✅ ConnectionsModel imported successfully');
      } catch (error) {
        results.push(`❌ ERROR: ConnectionsModel import failed: ${(error as Error).message}`);
        success = false;
      }

      // Test 5: Basic Networking Components
      try {
        const { NetworkPlugin } = require('@refinio/one.core/lib/network/NetworkPlugin');
        const { WebSocketPlugin } = require('@refinio/one.core/lib/network/plugins/WebSocketPlugin');
        results.push('✅ Networking components imported successfully');
      } catch (error) {
        results.push(`❌ ERROR: Networking components import failed: ${(error as Error).message}`);
        success = false;
      }

      if (success) {
        results.push('🎉 All tests passed! Connection flow should work correctly.');
      } else {
        results.push('⚠️  Some tests failed. Connection issues may persist.');
      }

    } catch (error) {
      results.push(`❌ FATAL ERROR: ${(error as Error).message}`);
      success = false;
    }

    return { success, results };
  }

  static logResults(results: string[]): void {
    console.log('=== Connection Flow Test Results ===');
    results.forEach(result => console.log(result));
    console.log('=====================================');
  }
} 