/**
 * ESP32 Debug Helper
 * 
 * Comprehensive debugging tool for diagnosing ESP32 discovery issues.
 * Provides detailed packet analysis, network diagnostics, and monitoring capabilities.
 */

import { UdpModel, UdpSocket, UdpRemoteInfo } from '../models/network/UdpModel';
import { DiscoveryProtocol, DiscoveryConfig } from '../models/network/discovery/DiscoveryProtocol';
import { NetworkServiceType } from '../models/network/interfaces';
import { Buffer } from '@refinio/one.core/lib/system/expo/index.js';
import Debug from 'debug';

// Enable debug for ESP32 debugging
const debug = Debug('one:esp32:debug');
debug.enabled = true;

export interface ESP32DebugConfig {
  discoveryPort: number;
  broadcastAddress: string;
  deviceSubnet?: string; // e.g., '192.168.178.0/24' to scan specific subnet
  timeoutMs: number;
  verboseLogging: boolean;
  packetCapture: boolean;
}

export interface PacketInfo {
  timestamp: Date;
  direction: 'inbound' | 'outbound';
  source: string;
  destination: string;
  port: number;
  size: number;
  serviceType?: number;
  data: Buffer;
  hexDump: string;
  textRepresentation: string;
}

export interface NetworkInterfaceInfo {
  name: string;
  address: string;
  netmask: string;
  family: string;
  internal: boolean;
}

export class ESP32DebugHelper {
  private config: ESP32DebugConfig;
  private udpModel: UdpModel;
  private testSocket: UdpSocket | null = null;
  private monitorSocket: UdpSocket | null = null;
  private discoveryProtocol: DiscoveryProtocol | null = null;
  private packetLog: PacketInfo[] = [];
  private isMonitoring: boolean = false;
  
  constructor(config: Partial<ESP32DebugConfig> = {}) {
    this.config = {
      discoveryPort: 49497,
      broadcastAddress: '255.255.255.255',
      timeoutMs: 10000,
      verboseLogging: true,
      packetCapture: false,
      ...config
    };
    
    this.udpModel = UdpModel.getInstance();
    
    console.log('[ESP32Debug] Initialized with config:', this.config);
    console.log('[ESP32Debug] Using ESP32 standard port 49497 without packet monitoring to avoid conflicts');
  }
  
  /**
   * Check if discovery is already running on the standard port
   */
  private async checkDiscoveryStatus(): Promise<void> {
    console.log('\n🔍 Checking Discovery Status:');
    
    try {
      // Try to create a test socket on the discovery port
      const testSocket = await this.udpModel.createSocket({
        type: 'udp4',
        reuseAddr: true,
        debugLabel: 'ESP32Debug-PortCheck'
      });
      
      try {
        await testSocket.bind(this.config.discoveryPort);
        console.log(`✅ Port ${this.config.discoveryPort} is available - discovery may not be running`);
        await testSocket.close();
      } catch (bindError) {
        if (String(bindError).includes('already in use')) {
          console.log(`🔄 Port ${this.config.discoveryPort} is in use - discovery system is likely running`);
          console.log(`✅ This is normal and expected behavior`);
        } else {
          console.warn(`⚠️  Unexpected error checking port: ${bindError}`);
        }
        try {
          await testSocket.close();
        } catch (closeError) {
          // Ignore close errors
        }
      }
    } catch (error) {
      console.error(`❌ Error checking discovery status: ${error}`);
    }
  }
  
  /**
   * Run comprehensive ESP32 discovery diagnostics
   */
  public async runComprehensiveDiagnostics(): Promise<void> {
    console.log('\n🔍 ===== ESP32 DISCOVERY COMPREHENSIVE DIAGNOSTICS =====\n');
    
    try {
      // Step 0: Check discovery status first
      await this.checkDiscoveryStatus();
      
      // Step 1: Network interface analysis
      await this.analyzeNetworkInterfaces();
      
      // Step 2: UDP stack verification
      await this.verifyUdpStack();
      
      // Step 3: Discovery protocol testing
      await this.testDiscoveryProtocol();
      
      // Step 4: Raw packet monitoring
      await this.startPacketMonitoring();
      
      // Step 5: ESP32-specific packet formats
      await this.testESP32PacketFormats();
      
      // Step 6: Network scanning
      if (this.config.deviceSubnet) {
        await this.scanForESP32Devices();
      }
      
      // Step 7: Summary and recommendations
      this.generateDiagnosticSummary();
      
    } catch (error) {
      console.error('🔍 Comprehensive diagnostics failed:', error);
    }
  }
  
  /**
   * Analyze network interfaces and routing
   */
  private async analyzeNetworkInterfaces(): Promise<void> {
    console.log('\n📡 Network Interface Analysis:');
    
    try {
      // Get local IP addresses using UdpModel
      const localIPs = await this.udpModel.getLocalIPAddresses();
      console.log('🔍 Local IP addresses detected:', localIPs);
      
      // Analyze each interface
      localIPs.forEach((ip, index) => {
        console.log(`🔍 Interface ${index + 1}: ${ip}`);
        
        // Detect interface type
        if (ip.startsWith('127.')) {
          console.log('  → Type: Loopback interface');
        } else if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
          console.log('  → Type: Private network interface');
          console.log('  → ESP32 discovery: ✅ Compatible');
        } else {
          console.log('  → Type: Public network interface');
          console.log('  → ESP32 discovery: ⚠️  May have restrictions');
        }
      });
      
      // Test broadcast capability
      for (const ip of localIPs) {
        if (!ip.startsWith('127.')) {
          await this.testBroadcastFromInterface(ip);
        }
      }
      
    } catch (error) {
      console.error('📡 Network interface analysis failed:', error);
    }
  }
  
  /**
   * Test broadcast capability from specific interface
   */
  private async testBroadcastFromInterface(sourceIP: string): Promise<void> {
    console.log(`\n🔍 Testing broadcast from interface ${sourceIP}:`);
    
    try {
      const socket = await this.udpModel.createSocket({
        type: 'udp4',
        reuseAddr: true,
        broadcast: true,
        debugLabel: `BroadcastTest-${sourceIP}`
      });
      
      // Try to bind to specific interface (may not work on all platforms)
      await socket.bind(0, sourceIP);
      await socket.setBroadcast(true);
      
      // Send test broadcast
      const testMessage = `BROADCAST_TEST_${Date.now()}_FROM_${sourceIP}`;
      const packet = Buffer.concat([
        Buffer.from([NetworkServiceType.DISCOVERY_SERVICE]),
        Buffer.from(JSON.stringify({
          type: 'test_broadcast',
          source: sourceIP,
          timestamp: Date.now()
        }))
      ]);
      
      await socket.send(packet, this.config.discoveryPort, this.config.broadcastAddress);
      console.log(`✅ Broadcast sent from ${sourceIP}`);
      
      await socket.close();
      
    } catch (error) {
      console.error(`❌ Broadcast test failed from ${sourceIP}:`, error);
    }
  }
  
  /**
   * Verify UDP stack functionality
   */
  public async verifyUdpStack(): Promise<void> {
    console.log('\n🔧 UDP Stack Verification:');
    
    try {
      // Initialize UDP model
      if (!this.udpModel.isInitialized()) {
        console.log('🔍 Initializing UdpModel...');
        const initialized = await this.udpModel.init();
        if (!initialized) {
          throw new Error('Failed to initialize UdpModel');
        }
      }
      console.log('✅ UdpModel initialized');
      
      // Check native module availability
      const isAvailable = this.udpModel.isNativeModuleAvailable();
      console.log(`🔍 Native UDP module available: ${isAvailable ? '✅' : '❌'}`);
      
      if (!isAvailable) {
        console.error('❌ Critical: UDP native module not available!');
        return;
      }
      
      // Test socket creation
      console.log('🔍 Testing socket creation...');
      const testSocket = await this.udpModel.createSocket({
        type: 'udp4',
        reuseAddr: true,
        broadcast: true,
        debugLabel: 'ESP32Debug-StackTest'
      });
      console.log('✅ Socket created successfully');
      
      // Test binding
      console.log('🔍 Testing socket binding...');
      await testSocket.bind(0); // Bind to any available port
      const address = await testSocket.address();
      console.log(`✅ Socket bound to ${address?.address}:${address?.port}`);
      
      // Test broadcast setting
      console.log('🔍 Testing broadcast mode...');
      await testSocket.setBroadcast(true);
      console.log('✅ Broadcast mode enabled');
      
      await testSocket.close();
      console.log('✅ UDP stack verification complete');
      
    } catch (error) {
      console.error('❌ UDP stack verification failed:', error);
    }
  }
  
  /**
   * Test discovery protocol functionality
   */
  public async testDiscoveryProtocol(): Promise<void> {
    console.log('\n🔍 Discovery Protocol Testing:');
    
    try {
      // Create discovery protocol instance
      const discoveryConfig: DiscoveryConfig = {
        deviceId: 'debug-test-device',
        deviceName: 'ESP32 Debug Tester',
        deviceType: 'mobile',
        capabilities: ['discovery', 'debug'],
        version: '1.0.0',
        discoveryPort: this.config.discoveryPort,
        discoveryInterval: 5000,
        maxAge: 30000,
        broadcastAddress: this.config.broadcastAddress
      };
      
      this.discoveryProtocol = new DiscoveryProtocol(discoveryConfig);
      
      // Set up event handlers
      this.discoveryProtocol.onDeviceDiscovered.listen((device) => {
        console.log('🔍 Device discovered:', device);
      });
      
      this.discoveryProtocol.onError.listen((error) => {
        console.error('🔍 Discovery error:', error);
      });
      
      // Initialize and start discovery
      console.log('🔍 Initializing discovery protocol...');
      const initialized = await this.discoveryProtocol.init();
      if (!initialized) {
        throw new Error('Failed to initialize discovery protocol');
      }
      console.log('✅ Discovery protocol initialized');
      
      console.log('🔍 Starting discovery...');
      await this.discoveryProtocol.startDiscovery();
      console.log('✅ Discovery started');
      
      // Let it run for a bit
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      await this.discoveryProtocol.stopDiscovery();
      console.log('✅ Discovery protocol test complete');
      
    } catch (error) {
      console.error('❌ Discovery protocol test failed:', error);
    }
  }
  
  /**
   * Start packet monitoring to capture all traffic
   */
  private async startPacketMonitoring(): Promise<void> {
    if (!this.config.packetCapture) return;
    
    console.log('\n📦 Starting Packet Monitoring:');
    
    // Try alternative ports to avoid conflicts with running discovery
    const monitoringPorts = [this.config.discoveryPort + 1, this.config.discoveryPort + 2, this.config.discoveryPort + 3];
    
    for (const port of monitoringPorts) {
      try {
        console.log(`🔍 Attempting to create monitoring socket on port ${port}...`);
        
        this.monitorSocket = await this.udpModel.createSocket({
          type: 'udp4',
          reuseAddr: true,
          debugLabel: `ESP32Debug-PacketMonitor-${port}`
        });
        
        await this.monitorSocket.bind(port);
        console.log(`🔍 Successfully monitoring UDP traffic on port ${port}`);
        console.log(`🔍 Note: This monitors a different port than discovery (${this.config.discoveryPort}) to avoid conflicts`);
        
        this.monitorSocket.on('message', (data: Buffer, rinfo: UdpRemoteInfo) => {
          this.capturePacket('inbound', data, rinfo);
        });
        
        this.isMonitoring = true;
        
        // Keep monitoring for a while
        setTimeout(() => {
          this.stopPacketMonitoring();
        }, this.config.timeoutMs);
        
        return; // Successfully bound, exit the loop
        
      } catch (error) {
        console.warn(`⚠️  Failed to bind monitoring socket to port ${port}: ${error}`);
        if (this.monitorSocket) {
          try {
            await this.monitorSocket.close();
          } catch (closeError) {
            // Ignore close errors
          }
          this.monitorSocket = null;
        }
      }
    }
    
    console.error('❌ Failed to bind monitoring socket to any alternative port');
    console.log('📦 Continuing without packet monitoring...');
  }
  
  /**
   * Stop packet monitoring
   */
  private async stopPacketMonitoring(): Promise<void> {
    if (this.monitorSocket) {
      console.log('\n📦 Stopping packet monitoring...');
      await this.monitorSocket.close();
      this.monitorSocket = null;
      this.isMonitoring = false;
      
      console.log(`📦 Captured ${this.packetLog.length} packets`);
      this.analyzePacketLog();
    }
  }
  
  /**
   * Capture packet information
   */
  private capturePacket(direction: 'inbound' | 'outbound', data: Buffer, rinfo: UdpRemoteInfo): void {
    const packetInfo: PacketInfo = {
      timestamp: new Date(),
      direction,
      source: rinfo.address,
      destination: direction === 'inbound' ? 'local' : rinfo.address,
      port: rinfo.port,
      size: data.length,
      data: data,
      hexDump: this.createHexDump(data),
      textRepresentation: this.createTextRepresentation(data)
    };
    
    // Try to parse service type
    if (data.length > 0) {
      packetInfo.serviceType = data[0];
    }
    
    this.packetLog.push(packetInfo);
    
    if (this.config.verboseLogging) {
      console.log(`📦 ${direction.toUpperCase()} packet from ${rinfo.address}:${rinfo.port}`);
      console.log(`   Size: ${data.length} bytes`);
      console.log(`   Service Type: ${packetInfo.serviceType}`);
      console.log(`   Hex: ${packetInfo.hexDump.substring(0, 64)}${data.length > 32 ? '...' : ''}`);
      console.log(`   Text: ${packetInfo.textRepresentation.substring(0, 100)}${data.length > 100 ? '...' : ''}`);
    }
  }
  
  /**
   * Test ESP32-specific packet formats
   */
  private async testESP32PacketFormats(): Promise<void> {
    console.log('\n🤖 Testing ESP32-Specific Packet Formats:');
    
    const testFormats = [
      {
        name: 'Standard Discovery Request',
        packet: this.createStandardDiscoveryPacket()
      },
      {
        name: 'ESP32 Binary Format',
        packet: this.createESP32BinaryPacket()
      },
      {
        name: 'Minimal Discovery',
        packet: this.createMinimalDiscoveryPacket()
      }
    ];
    
    try {
      const testSocket = await this.udpModel.createSocket({
        type: 'udp4',
        reuseAddr: true,
        broadcast: true,
        debugLabel: 'ESP32Debug-FormatTest'
      });
      
      await testSocket.bind(0);
      await testSocket.setBroadcast(true);
      
      for (const format of testFormats) {
        console.log(`🔍 Testing ${format.name}...`);
        console.log(`   Packet size: ${format.packet.length} bytes`);
        console.log(`   Hex: ${this.createHexDump(format.packet)}`);
        
        await testSocket.send(format.packet, this.config.discoveryPort, this.config.broadcastAddress);
        console.log(`✅ ${format.name} sent`);
        
        // Small delay between formats
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      await testSocket.close();
      
    } catch (error) {
      console.error('❌ ESP32 packet format testing failed:', error);
    }
  }
  
  /**
   * Scan for ESP32 devices on the network
   */
  private async scanForESP32Devices(): Promise<void> {
    console.log('\n🔍 Scanning for ESP32 Devices:');
    
    if (!this.config.deviceSubnet) {
      console.log('⚠️  No subnet specified, skipping device scan');
      return;
    }
    
    // Parse subnet (simple implementation for /24 networks)
    const [baseIP, cidr] = this.config.deviceSubnet.split('/');
    if (cidr !== '24') {
      console.log('⚠️  Only /24 subnets supported for scanning');
      return;
    }
    
    const [a, b, c] = baseIP.split('.').map(Number);
    console.log(`🔍 Scanning subnet ${baseIP}/${cidr}...`);
    
    try {
      const testSocket = await this.udpModel.createSocket({
        type: 'udp4',
        reuseAddr: true,
        debugLabel: 'ESP32Debug-SubnetScan'
      });
      
      await testSocket.bind(0);
      
      const discoveryPacket = this.createStandardDiscoveryPacket();
      
      // Scan last octet 1-254
      for (let d = 1; d <= 254; d++) {
        const targetIP = `${a}.${b}.${c}.${d}`;
        
        try {
          await testSocket.send(discoveryPacket, this.config.discoveryPort, targetIP);
          if (this.config.verboseLogging && d % 50 === 0) {
            console.log(`🔍 Scanned up to ${targetIP}...`);
          }
        } catch (error) {
          // Ignore individual send errors
        }
        
        // Small delay to avoid overwhelming the network
        if (d % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      console.log('✅ Subnet scan complete');
      await testSocket.close();
      
    } catch (error) {
      console.error('❌ Device scanning failed:', error);
    }
  }
  
  /**
   * Create standard discovery packet
   */
  private createStandardDiscoveryPacket(): Buffer {
    const message = {
      type: 'discovery_request',
      deviceId: 'debug-scanner',
      deviceName: 'ESP32 Debug Scanner',
      deviceType: 'mobile',
      capabilities: ['discovery', 'debug'],
      version: '1.0.0',
      timestamp: Date.now()
    };
    
    return Buffer.concat([
      Buffer.from([NetworkServiceType.DISCOVERY_SERVICE]),
      Buffer.from(JSON.stringify(message))
    ]);
  }
  
  /**
   * Create ESP32 binary format packet
   */
  private createESP32BinaryPacket(): Buffer {
    // Format that ESP32 might expect: "ONECORE_DISCOVERY" + version + device info
    const header = Buffer.from('ONECORE_DISCOVERY');
    const version = Buffer.from([1]);
    const deviceId = Buffer.from('DEBUG_SCANNER');
    
    return Buffer.concat([header, version, deviceId]);
  }
  
  /**
   * Create minimal discovery packet
   */
  private createMinimalDiscoveryPacket(): Buffer {
    return Buffer.concat([
      Buffer.from([NetworkServiceType.DISCOVERY_SERVICE]),
      Buffer.from('{"type":"discovery"}')
    ]);
  }
  
  /**
   * Create hex dump of data
   */
  private createHexDump(data: Buffer): string {
    return Array.from(data)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join(' ');
  }
  
  /**
   * Create text representation of data
   */
  private createTextRepresentation(data: Buffer): string {
    return data.toString('utf8').replace(/[\x00-\x1F\x7F-\xFF]/g, '.');
  }
  
  /**
   * Analyze captured packet log
   */
  private analyzePacketLog(): void {
    console.log('\n📊 Packet Analysis:');
    
    if (this.packetLog.length === 0) {
      console.log('❌ No packets captured during monitoring period');
      return;
    }
    
    // Group by source
    const sourceMap = new Map<string, PacketInfo[]>();
    for (const packet of this.packetLog) {
      const source = packet.source;
      if (!sourceMap.has(source)) {
        sourceMap.set(source, []);
      }
      sourceMap.get(source)!.push(packet);
    }
    
    console.log(`📊 Total packets: ${this.packetLog.length}`);
    console.log(`📊 Unique sources: ${sourceMap.size}`);
    
    for (const [source, packets] of sourceMap) {
      console.log(`\n📍 Source: ${source}`);
      console.log(`   Packets: ${packets.length}`);
      
      // Analyze service types
      const serviceTypes = new Set(packets.map(p => p.serviceType).filter(s => s !== undefined));
      console.log(`   Service types: ${Array.from(serviceTypes).join(', ')}`);
      
      // Check for ESP32-like patterns
      const hasESP32Pattern = packets.some(p => 
        p.textRepresentation.includes('ESP32') || 
        p.textRepresentation.includes('ONECORE') ||
        p.source.startsWith('192.168.')
      );
      
      if (hasESP32Pattern) {
        console.log('   🤖 Possible ESP32 device detected!');
      }
    }
  }
  
  /**
   * Generate diagnostic summary and recommendations
   */
  private generateDiagnosticSummary(): void {
    console.log('\n📋 ===== DIAGNOSTIC SUMMARY =====\n');
    
    const recommendations: string[] = [];
    
    // Check if any ESP32-like devices were found
    const esp32Devices = this.packetLog.filter(p => 
      p.textRepresentation.includes('ESP32') || 
      p.textRepresentation.includes('ONECORE')
    );
    
    if (esp32Devices.length > 0) {
      console.log('✅ ESP32 devices detected in network traffic');
      console.log('   Devices found:', esp32Devices.map(p => p.source).join(', '));
    } else {
      console.log('❌ No ESP32 devices detected');
      recommendations.push('Check ESP32 device power and network connection');
      recommendations.push('Verify ESP32 firmware is running discovery service');
      recommendations.push('Check ESP32 logs for error messages');
    }
    
    // Check for discovery traffic
    const discoveryPackets = this.packetLog.filter(p => p.serviceType === NetworkServiceType.DISCOVERY_SERVICE);
    if (discoveryPackets.length > 0) {
      console.log('✅ Discovery packets detected');
    } else {
      console.log('❌ No discovery service packets detected');
      recommendations.push('Check if discovery service is properly configured');
    }
    
    // Network recommendations
    if (this.packetLog.length === 0) {
      recommendations.push('Check firewall settings - UDP port 49497 may be blocked');
      recommendations.push('Verify mobile device and ESP32 are on same network segment');
      recommendations.push('Check router settings for multicast/broadcast restrictions');
    }
    
    if (recommendations.length > 0) {
      console.log('\n🔧 Recommendations:');
      recommendations.forEach((rec, index) => {
        console.log(`   ${index + 1}. ${rec}`);
      });
    }
    
    console.log('\n📋 ===== DIAGNOSTIC COMPLETE =====\n');
  }
  
  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up ESP32 debug helper...');
    
    if (this.isMonitoring) {
      await this.stopPacketMonitoring();
    }
    
    if (this.testSocket) {
      await this.testSocket.close();
      this.testSocket = null;
    }
    
    if (this.discoveryProtocol) {
      await this.discoveryProtocol.shutdown();
      this.discoveryProtocol = null;
    }
    
    console.log('✅ Cleanup complete');
  }
}

/**
 * Convenience function to run quick ESP32 diagnostics
 */
export async function runESP32Diagnostics(config?: Partial<ESP32DebugConfig>): Promise<void> {
  const debugHelper = new ESP32DebugHelper(config);
  
  try {
    await debugHelper.runComprehensiveDiagnostics();
  } finally {
    await debugHelper.cleanup();
  }
}

/**
 * Convenience function for quick network test
 */
export async function quickNetworkTest(): Promise<void> {
  console.log('🚀 Running quick network test...');
  
  const debugHelper = new ESP32DebugHelper({
    timeoutMs: 5000,
    verboseLogging: false,
    packetCapture: true
  });
  
  try {
    // Just test the basics
    await debugHelper.verifyUdpStack();
    await debugHelper.testDiscoveryProtocol();
  } finally {
    await debugHelper.cleanup();
  }
} 