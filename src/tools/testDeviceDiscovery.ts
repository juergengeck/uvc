/**
 * Test Device Discovery
 * 
 * This tool tests if the device discovery mechanism is working
 * by listening for UDP broadcasts from ESP32 and other devices.
 */

import { DeviceDiscoveryModel } from '@src/models/network/DeviceDiscoveryModel';
import { runUDPDiagnostic } from './UDPDiagnostic';

export async function testDeviceDiscovery() {
  console.log('=== DEVICE DISCOVERY TEST ===');
  
  try {
    // First run a basic UDP diagnostic
    console.log('\n1. Running UDP diagnostic first...');
    const udpResult = await runUDPDiagnostic({ 
      timeout: 3000,
      port: 49497 
    });
    console.log('UDP diagnostic result:', udpResult);
    
    // Get the discovery model instance
    console.log('\n2. Getting DeviceDiscoveryModel instance...');
    const discoveryModel = DeviceDiscoveryModel.getInstance();
    
    // Check if it's initialized
    console.log('Discovery model initialized:', discoveryModel.isInitialized());
    
    // Listen for device events
    console.log('\n3. Setting up device discovery listeners...');
    
    const unsubscribers: (() => void)[] = [];
    
    // Device discovered
    const onDiscovered = discoveryModel.onDeviceDiscovered.listen((device) => {
      console.log('🆕 DEVICE DISCOVERED:', device);
    });
    unsubscribers.push(onDiscovered);
    
    // Device updated
    const onUpdated = discoveryModel.onDeviceUpdated.listen((device) => {
      console.log('🔄 DEVICE UPDATED:', device);
    });
    unsubscribers.push(onUpdated);
    
    // Device lost
    const onLost = discoveryModel.onDeviceLost.listen((deviceId) => {
      console.log('❌ DEVICE LOST:', deviceId);
    });
    unsubscribers.push(onLost);
    
    // Start discovery if not already running
    console.log('\n4. Starting device discovery...');
    if (!discoveryModel.isDiscovering()) {
      await discoveryModel.startDiscovery();
      console.log('Discovery started successfully');
    } else {
      console.log('Discovery was already running');
    }
    
    // Get current devices
    console.log('\n5. Current devices:');
    const devices = discoveryModel.getDevices();
    console.log(`Found ${devices.length} devices:`);
    devices.forEach((device, index) => {
      console.log(`  ${index + 1}. ${device.id} - ${device.name} (${device.type}) at ${device.address}:${device.port}`);
    });
    
    // Wait for a bit to see if any devices are discovered
    console.log('\n6. Waiting 5 seconds for device discoveries...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check devices again
    console.log('\n7. Devices after waiting:');
    const devicesAfter = discoveryModel.getDevices();
    console.log(`Found ${devicesAfter.length} devices:`);
    devicesAfter.forEach((device, index) => {
      console.log(`  ${index + 1}. ${device.id} - ${device.name} (${device.type}) at ${device.address}:${device.port}`);
    });
    
    // Clean up
    console.log('\n8. Cleaning up...');
    unsubscribers.forEach(unsub => unsub());
    
    console.log('\n=== DEVICE DISCOVERY TEST COMPLETE ===');
    
    return {
      success: true,
      devicesFound: devicesAfter.length,
      devices: devicesAfter
    };
    
  } catch (error) {
    console.error('Device discovery test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Export for use in other modules
export default testDeviceDiscovery;