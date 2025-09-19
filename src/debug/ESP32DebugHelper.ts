import { UdpModel } from '../models/network/UdpModel';

/**
 * ESP32 Debug Helper
 * Provides debugging utilities for ESP32 communication
 */
export class ESP32DebugHelper {
  /**
   * Quick test to verify UDP data reception is working
   */
  public static async quickUDPReceptionTest(): Promise<string> {
    const results: string[] = [];
    results.push('🧪 Testing UDP Data Reception...\n');
    
    try {
      // Get UdpModel
      const udpModel = UdpModel.getInstance();
      if (!udpModel.isInitialized()) {
        await udpModel.init();
      }
      
      // Create test socket
      const testSocket = await udpModel.createSocket({
        type: 'udp4',
        reuseAddr: true,
        broadcast: true,
        debug: true,
        debugLabel: 'UDP-Reception-Test'
      });
      
      results.push(`✅ Test socket created: ${testSocket.id}`);
      
      // Set up message handler
      let messageReceived = false;
      testSocket.on('message', (data: any, rinfo: any) => {
        messageReceived = true;
        results.push(`📦 MESSAGE RECEIVED! From ${rinfo.address}:${rinfo.port}`);
        results.push(`   Data: ${data.toString()}`);
      });
      
      // Bind to test port
      const testPort = 49499; // Different from discovery port
      await testSocket.bind(testPort);
      results.push(`✅ Socket bound to port ${testPort}`);
      
      // Send test message to ourselves
      const testMessage = `UDP-TEST-${Date.now()}`;
      await testSocket.send(testMessage, testPort, '127.0.0.1');
      results.push(`✅ Test message sent: ${testMessage}`);
      
      // Wait a moment for message to arrive
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (messageReceived) {
        results.push(`✅ SUCCESS: UDP data reception is working!`);
      } else {
        results.push(`❌ FAILURE: No message received (this was the bug)`);
      }
      
      // Clean up
      await testSocket.close();
      results.push(`✅ Test socket closed`);
      
    } catch (error) {
      results.push(`❌ Test failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return results.join('\n');
  }

  /**
   * Test ESP32 discovery response reception specifically
   */
  public static async testESP32DiscoveryReception(): Promise<string> {
    const results: string[] = [];
    results.push('🔍 Testing ESP32 Discovery Response Reception...\n');
    
    try {
      // Get UdpModel
      const udpModel = UdpModel.getInstance();
      if (!udpModel.isInitialized()) {
        await udpModel.init();
      }
      
      // Create discovery socket (same as real discovery)
      const discoverySocket = await udpModel.createSocket({
        type: 'udp4',
        reuseAddr: true,
        broadcast: true,
        debug: true,
        debugLabel: 'ESP32-Discovery-Test'
      });
      
      results.push(`✅ Discovery test socket created: ${discoverySocket.id}`);
      
      // Set up message handler for ESP32 responses
      let esp32ResponseReceived = false;
      let responseData = '';
      
      discoverySocket.on('message', (data: any, rinfo: any) => {
        esp32ResponseReceived = true;
        responseData = data.toString();
        results.push(`📦 ESP32 RESPONSE RECEIVED! From ${rinfo.address}:${rinfo.port}`);
        results.push(`   Response: ${responseData}`);
        
        // Parse response if it's JSON
        try {
          const parsed = JSON.parse(responseData);
          if (parsed.type === 'discovery_response' && parsed.deviceId) {
            results.push(`   ✅ Valid ESP32 discovery response from device: ${parsed.deviceId}`);
          }
        } catch (e) {
          results.push(`   ⚠️  Response is not valid JSON`);
        }
      });
      
      // Bind to discovery port
      const discoveryPort = 49497;
      await discoverySocket.bind(discoveryPort);
      results.push(`✅ Socket bound to discovery port ${discoveryPort}`);
      
      // Send discovery request to ESP32 specifically
      const discoveryRequest = JSON.stringify({
        type: "discovery_request",
        deviceId: "test-mobile-device",
        deviceName: "Test Mobile",
        deviceType: "mobile",
        version: "1.0.0",
        timestamp: Date.now(),
        capabilities: ["test"]
      });
      
      // Add service type byte prefix (type 1 = discovery service)
      const serviceTypeByte = new Uint8Array([1]);
      const requestBytes = new TextEncoder().encode(discoveryRequest);
      const fullRequest = new Uint8Array(serviceTypeByte.length + requestBytes.length);
      fullRequest.set(serviceTypeByte, 0);
      fullRequest.set(requestBytes, serviceTypeByte.length);
      
      // Send to ESP32's known IP
      const esp32IP = '192.168.178.57'; // From ESP32 logs
      await discoverySocket.send(fullRequest, discoveryPort, esp32IP);
      results.push(`✅ Discovery request sent to ESP32 at ${esp32IP}:${discoveryPort}`);
      
      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (esp32ResponseReceived) {
        results.push(`\n🎉 SUCCESS: ESP32 discovery response reception is working!`);
        results.push(`   This means the setDataEventHandler fix is working correctly.`);
      } else {
        results.push(`\n❌ FAILURE: No ESP32 response received`);
        results.push(`   This indicates the UDP data reception is still broken.`);
      }
      
      // Clean up
      await discoverySocket.close();
      results.push(`✅ Test socket closed`);
      
    } catch (error) {
      results.push(`❌ Test failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return results.join('\n');
  }
} 