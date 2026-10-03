/**
 * Test ESP32 Discovery Command
 * 
 * Run this command to diagnose ESP32 discovery issues using the actual QuicVC discovery system.
 */

import { DeviceDiscoveryModel } from '../models/network/DeviceDiscoveryModel';
import { QuicModel } from '@refinio/esp32.host';
import {esp32QuicOptions} from '@src/models/network/esp32Seams';

/**
 * Test ESP32 discovery using the actual QuicVC system
 */
export async function testESP32Discovery(): Promise<void> {
  console.log('\n🚀 Testing ESP32 Discovery (QuicVC)...\n');
  
  try {
    // Get the actual discovery models
    const quicModel = QuicModel.getInstance(esp32QuicOptions());
    const discoveryModel = DeviceDiscoveryModel.getInstance();
    
    console.log('🔍 Checking QuicModel status...');
    console.log(`   Initialized: ${quicModel.isInitialized()}`);
    console.log(`   Ready: ${quicModel.isReady()}`);
    
    console.log('🔍 Checking DeviceDiscoveryModel status...');
    console.log(`   Initialized: ${(discoveryModel as any)._initialized || false}`);
    console.log(`   Is Discovering: ${discoveryModel.isDiscovering()}`);
    
    // Get current devices
    const devices = discoveryModel.getDevices();
    console.log(`🔍 Currently discovered devices: ${devices.length}`);
    
    if (devices.length > 0) {
      devices.forEach((device, index) => {
        console.log(`   Device ${index + 1}: ${device.name} (${device.id})`);
        console.log(`     Type: ${device.type}`);
        console.log(`     Address: ${device.address || 'unknown'}:${device.port || 'unknown'}`);
        console.log(`     Has Valid Credential: ${device.hasValidCredential || false}`);
      });
    } else {
      console.log('   No devices currently discovered');
    }
    
    // Test discovery restart
    console.log('\n🔄 Testing discovery restart...');
    
    if (discoveryModel.isDiscovering()) {
      console.log('   Stopping current discovery...');
      await discoveryModel.stopDiscovery();
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    }
    
    console.log('   Starting discovery...');
    await discoveryModel.startDiscovery();
    console.log('   ✅ Discovery started');
    
    // Wait and check for new devices
    console.log('   Waiting 10 seconds for ESP32 responses...');
    
    let discoveredCount = 0;
    const startTime = Date.now();
    
    // Listen for new devices
    const discoveryHandler = (device: any) => {
      discoveredCount++;
      console.log(`🎉 NEW DEVICE DISCOVERED: ${device.name} (${device.id})`);
      console.log(`   Type: ${device.type}`);
      console.log(`   Address: ${device.address}:${device.port}`);
      console.log(`   Capabilities: ${device.capabilities?.join(', ') || 'none'}`);
    };
    
    discoveryModel.onDeviceDiscovered.listen(discoveryHandler);
    
    // Wait for discovery
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Remove listener
    // Note: This is a simplified approach - in real code you'd want proper cleanup
    
    const finalDevices = discoveryModel.getDevices();
    console.log(`\n📊 Discovery Results:`);
    console.log(`   Devices found during test: ${discoveredCount}`);
    console.log(`   Total devices now: ${finalDevices.length}`);
    
    if (finalDevices.length > 0) {
      console.log(`\n✅ ESP32 discovery test completed successfully!`);
    } else {
      console.log(`\n⚠️  No devices discovered - check ESP32 status`);
    }
    
  } catch (error) {
    console.error('\n❌ ESP32 discovery test failed:', error);
  }
}

/**
 * Run quick ESP32 test using QuicVC
 */
export async function quickESP32Test(): Promise<void> {
  console.log('\n⚡ Quick ESP32 Test (QuicVC)...\n');
  
  try {
    const discoveryModel = DeviceDiscoveryModel.getInstance();
    
    // Get diagnostic info
    const diagnosticInfo = discoveryModel.getDiagnosticInfo();
    console.log('🔍 DeviceDiscoveryModel Diagnostic Info:');
    console.log(diagnosticInfo);
    
    console.log('\n✅ Quick test completed!\n');
  } catch (error) {
    console.error('\n❌ Quick test failed:', error);
  }
}

/**
 * Safe network scan using the actual discovery system
 */
export async function safeESP32NetworkScan(): Promise<void> {
  console.log('\n🔍 Safe ESP32 Network Scan (QuicVC)...\n');
  
  try {
    const discoveryModel = DeviceDiscoveryModel.getInstance();
    const quicModel = QuicModel.getInstance(esp32QuicOptions());
    
    console.log('📋 System Status Check:');
    console.log(`   QuicModel ready: ${quicModel.isReady()}`);
    console.log(`   Discovery initialized: ${(discoveryModel as any)._initialized || false}`);
    console.log(`   Currently discovering: ${discoveryModel.isDiscovering()}`);
    
    const currentDevices = discoveryModel.getDevices();
    console.log(`   Known devices: ${currentDevices.length}`);
    
    // Force a discovery cycle
    console.log('\n🔄 Forcing discovery restart...');
    
    if (discoveryModel.isDiscovering()) {
      await discoveryModel.stopDiscovery();
      console.log('   Discovery stopped');
    }
    
    await discoveryModel.startDiscovery();
    console.log('   Discovery restarted');
    
    // Check transport diagnostics
    console.log('\n🔧 Transport Diagnostics:');
    const transport = quicModel.getTransport();
    if (transport && typeof transport.runDiagnostics === 'function') {
      const diagnostics = await transport.runDiagnostics();
      console.log(diagnostics);
    } else {
      console.log('   Transport diagnostics not available');
    }
    
    console.log('\n✅ Safe network scan completed!\n');
    
  } catch (error) {
    console.error('\n❌ Safe network scan failed:', error);
  }
}

/**
 * Make the functions available globally for console debugging
 */
declare global {
  interface Window {
    testESP32Discovery: typeof testESP32Discovery;
    quickESP32Test: typeof quickESP32Test;
    safeESP32NetworkScan: typeof safeESP32NetworkScan;
  }
}

// Export to global scope for console access
if (typeof window !== 'undefined') {
  window.testESP32Discovery = testESP32Discovery;
  window.quickESP32Test = quickESP32Test;
  window.safeESP32NetworkScan = safeESP32NetworkScan;
} 