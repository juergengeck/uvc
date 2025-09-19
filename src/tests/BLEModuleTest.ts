/**
 * Test file to verify BLE module functionality with Expo prebuild
 */

import { Platform } from 'react-native';
import { RefactoredBTLEService } from '../services/RefactoredBTLEService';

export class BLEModuleTest {
  private btleService: RefactoredBTLEService;

  constructor() {
    this.btleService = new RefactoredBTLEService();
  }

  /**
   * Test 1: Check if BLE module can be initialized
   */
  async testInitialization(): Promise<boolean> {
    console.log('[BLEModuleTest] Testing BLE initialization...');
    
    try {
      const initialized = await this.btleService.initialize();
      
      if (initialized) {
        console.log('[BLEModuleTest] ✅ BLE module initialized successfully');
        return true;
      } else {
        console.log('[BLEModuleTest] ⚠️ BLE module not available (expected on simulator/web)');
        return false;
      }
    } catch (error) {
      console.error('[BLEModuleTest] ❌ Failed to initialize BLE:', error);
      return false;
    }
  }

  /**
   * Test 2: Check Bluetooth availability
   */
  async testBluetoothAvailability(): Promise<boolean> {
    console.log('[BLEModuleTest] Testing Bluetooth availability...');
    
    try {
      const available = await this.btleService.isBTLEAvailable();
      
      if (available) {
        console.log('[BLEModuleTest] ✅ Bluetooth is available and powered on');
        return true;
      } else {
        console.log('[BLEModuleTest] ⚠️ Bluetooth not available or not powered on');
        return false;
      }
    } catch (error) {
      console.error('[BLEModuleTest] ❌ Error checking Bluetooth availability:', error);
      return false;
    }
  }

  /**
   * Test 3: Test device discovery (5 seconds)
   */
  async testDeviceDiscovery(): Promise<boolean> {
    console.log('[BLEModuleTest] Testing device discovery (5 seconds)...');
    
    return new Promise<boolean>(async (resolve) => {
      try {
        const devices: any[] = [];
        
        // Listen for discovered devices
        this.btleService.on('deviceDiscovered', (device) => {
          console.log('[BLEModuleTest] 📱 Device discovered:', device.name, device.type);
          devices.push(device);
        });
        
        // Start discovery
        await this.btleService.startDiscovery();
        console.log('[BLEModuleTest] 🔍 Scanning for devices...');
        
        // Stop after 5 seconds
        setTimeout(async () => {
          await this.btleService.stopDiscovery();
          
          if (devices.length > 0) {
            console.log(`[BLEModuleTest] ✅ Found ${devices.length} device(s)`);
            resolve(true);
          } else {
            console.log('[BLEModuleTest] ⚠️ No devices found (normal if no BLE devices nearby)');
            resolve(true); // Still pass - no devices is valid
          }
        }, 5000);
      } catch (error) {
        console.error('[BLEModuleTest] ❌ Discovery test failed:', error);
        resolve(false);
      }
    });
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<void> {
    console.log('');
    console.log('========================================');
    console.log('     BLE MODULE TEST SUITE');
    console.log('========================================');
    console.log(`Platform: ${Platform.OS} v${Platform.Version}`);
    console.log('');
    
    const results = {
      initialization: false,
      availability: false,
      discovery: false
    };
    
    // Test 1: Initialization
    results.initialization = await this.testInitialization();
    console.log('');
    
    // Only continue if initialization succeeded
    if (results.initialization) {
      // Test 2: Bluetooth availability
      results.availability = await this.testBluetoothAvailability();
      console.log('');
      
      // Test 3: Device discovery (only if Bluetooth is available)
      if (results.availability) {
        results.discovery = await this.testDeviceDiscovery();
        console.log('');
      }
    }
    
    // Summary
    console.log('========================================');
    console.log('           TEST RESULTS');
    console.log('========================================');
    console.log(`Initialization: ${results.initialization ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Availability:   ${results.availability ? '✅ PASS' : '⚠️ NOT AVAILABLE'}`);
    console.log(`Discovery:      ${results.discovery ? '✅ PASS' : '⚠️ SKIPPED'}`);
    console.log('========================================');
    console.log('');
    
    // Cleanup
    await this.btleService.cleanup();
  }
}

/**
 * Helper function to run tests from React Native code
 */
export async function runBLETests(): Promise<void> {
  const tester = new BLEModuleTest();
  await tester.runAllTests();
}