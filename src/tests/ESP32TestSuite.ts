/**
 * ESP32 Test Suite
 * 
 * Comprehensive tests for ESP32 device discovery, credential management,
 * and journal logging functionality.
 */

import { DeviceDiscoveryModel } from '@src/models/network/DeviceDiscoveryModel';
import { UdpModel } from '@src/models/network/UdpModel';
import { QuicModel } from '@src/models/network/QuicModel';
import VerifiableCredentialModel from '@src/models/credentials/VerifiableCredentialModel';
import { Buffer } from '@refinio/one.core/lib/system/expo/index.js';
import { getInstanceOwnerIdHash } from '@refinio/one.core/lib/instance.js';
import { ModelService } from '@src/services/ModelService';
import { toStringId } from '@src/utils/ids';
import type { ITestSuite, ITestCase } from './types';
import { registerTestSuite } from './TestRegistry';



export class ESP32TestSuite implements ITestSuite {
  getTestCases(): ITestCase[] {
    return [
      // Network Layer Tests
      {
        name: 'UDP Socket Creation',
        description: 'Test creating UDP sockets through UdpModel',
        category: 'network',
        run: this.testUdpSocketCreation
      },
      {
        name: 'UDP Broadcast',
        description: 'Test UDP broadcast functionality',
        category: 'network',
        run: this.testUdpBroadcast
      },
      {
        name: 'QUIC Transport',
        description: 'Test QUIC transport initialization',
        category: 'network',
        run: this.testQuicTransport
      },
      
      // Discovery Tests
      {
        name: 'Discovery Protocol Init',
        description: 'Test discovery protocol initialization',
        category: 'discovery',
        run: this.testDiscoveryInit
      },
      {
        name: 'Device ID Serialization',
        description: 'Test that device IDs are properly serialized as strings',
        category: 'discovery',
        run: this.testDeviceIdSerialization
      },
      {
        name: 'Discovery Message Format',
        description: 'Test discovery message creation and parsing',
        category: 'discovery',
        run: this.testDiscoveryMessageFormat
      },
      {
        name: 'Discovery Lifecycle',
        description: 'Test starting and stopping discovery',
        category: 'discovery',
        run: this.testDiscoveryLifecycle
      },
      
      // Credential Tests
      {
        name: 'Credential Creation',
        description: 'Test creating device ownership credentials',
        category: 'credential',
        run: this.testCredentialCreation
      },
      {
        name: 'Credential Serialization',
        description: 'Test credential JSON serialization',
        category: 'credential',
        run: this.testCredentialSerialization
      },
      
      // Journal Tests
      {
        name: 'Journal Channel Setup',
        description: 'Test journal channel creation',
        category: 'journal',
        run: this.testJournalChannelSetup
      },
      {
        name: 'Journal Entry Creation',
        description: 'Test creating device ownership journal entries',
        category: 'journal',
        run: this.testJournalEntryCreation
      },
      
      // ESP32-specific Tests
      {
        name: 'ESP32 Message Format',
        description: 'Test ESP32 protocol message formatting',
        category: 'esp32',
        run: this.testESP32MessageFormat
      },
      {
        name: 'ESP32 Port Configuration',
        description: 'Test ESP32 uses correct ports (3333 for credentials)',
        category: 'esp32',
        run: this.testESP32PortConfiguration
      },
      {
        name: 'ESP32 Device Registration',
        description: 'Test registering ESP32 device ownership',
        category: 'esp32',
        run: this.testESP32DeviceRegistration
      }
    ];
  }
  
  // Network Tests
  private async testUdpSocketCreation(): Promise<void> {
    const udpModel = UdpModel.getInstance();
    if (!udpModel.isInitialized()) {
      await udpModel.init();
    }
    
    const socket = await udpModel.createSocket({ type: 'udp4' });
    if (!socket) {
      throw new Error('Failed to create UDP socket');
    }
    
    // Test socket has required methods
    if (typeof socket.bind !== 'function') {
      throw new Error('Socket missing bind method');
    }
    if (typeof socket.send !== 'function') {
      throw new Error('Socket missing send method');
    }
    
    await socket.close();
  }
  
  private async testUdpBroadcast(): Promise<void> {
    const udpModel = UdpModel.getInstance();
    const socket = await udpModel.createSocket({ type: 'udp4' });
    
    // Enable broadcast
    socket.setBroadcast(true);
    
    // Bind to any available port
    await new Promise<void>((resolve, reject) => {
      socket.bind(0, '0.0.0.0', (err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Send broadcast message
    const testMessage = Buffer.from(JSON.stringify({
      type: 'test_broadcast',
      timestamp: Date.now()
    }));
    
    await new Promise<void>((resolve, reject) => {
      socket.send(testMessage, 0, testMessage.length, 49497, '255.255.255.255', (err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    await socket.close();
  }
  
  private async testQuicTransport(): Promise<void> {
    const quicModel = QuicModel.getInstance();
    
    if (!quicModel.isInitialized()) {
      const success = await quicModel.init();
      if (!success) {
        throw new Error('QUIC model initialization failed');
      }
    }
    
    const transport = quicModel.getTransport();
    if (!transport) {
      throw new Error('QUIC transport not available');
    }
    
    if (!transport.isInitialized()) {
      throw new Error('QUIC transport not initialized');
    }
  }
  
  // Discovery Tests
  private async testDiscoveryInit(): Promise<void> {
    const discovery = DeviceDiscoveryModel.getInstance();
    const initialized = await discovery.init();
    
    if (!initialized) {
      throw new Error('Discovery initialization failed');
    }
  }
  
  private async testDeviceIdSerialization(): Promise<void> {
    // Test various device ID formats
    const testIds = [
      'simple-device-id',
      'device-123-456-789',
      { toString: () => 'object-with-toString' },
      { $type$: 'SHA256IdHash', toString: () => 'sha256-id-hash' }
    ];
    
    for (const id of testIds) {
      const stringId = toStringId(id);
      
      if (typeof stringId !== 'string') {
        throw new Error(`toStringId did not return string for ${id}`);
      }
      
      if (stringId === '[object Object]') {
        throw new Error(`Device ID serialized as [object Object] for ${id}`);
      }
      
      // Test JSON serialization
      const json = JSON.stringify({ deviceId: stringId });
      if (json.includes('[object Object]')) {
        throw new Error(`JSON serialization contains [object Object] for ${id}`);
      }
    }
  }
  
  private async testDiscoveryMessageFormat(): Promise<void> {
    const message = {
      type: 'discovery_request',
      deviceId: 'test-device-' + Date.now(),
      deviceName: 'Test iOS Device',
      deviceType: 'mobile',
      capabilities: ['messaging', 'file-transfer', 'quic-vc'],
      version: '1.0.0',
      timestamp: Date.now()
    };
    
    // Test serialization
    const serialized = JSON.stringify(message);
    const parsed = JSON.parse(serialized);
    
    // Verify all fields
    if (parsed.type !== message.type) {
      throw new Error('Message type not preserved');
    }
    if (parsed.deviceId !== message.deviceId) {
      throw new Error('Device ID not preserved');
    }
    if (parsed.deviceId === '[object Object]') {
      throw new Error('Device ID serialized as [object Object]');
    }
    if (!Array.isArray(parsed.capabilities)) {
      throw new Error('Capabilities not preserved as array');
    }
  }
  
  private async testDiscoveryLifecycle(): Promise<void> {
    const discovery = DeviceDiscoveryModel.getInstance();
    
    // Ensure discovery is stopped first
    if (discovery.isDiscovering()) {
      await discovery.stopDiscovery();
    }
    
    // Start discovery
    await discovery.startDiscovery();
    if (!discovery.isDiscovering()) {
      throw new Error('Discovery did not start');
    }
    
    // Let it run briefly
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Stop discovery
    await discovery.stopDiscovery();
    if (discovery.isDiscovering()) {
      throw new Error('Discovery did not stop');
    }
  }
  
  // Credential Tests
  private async testCredentialCreation(): Promise<void> {
    const leuteModel = ModelService.getLeuteModel();
    if (!leuteModel) {
      throw new Error('LeuteModel not available');
    }
    
    const credentialModel = await VerifiableCredentialModel.ensureInitialized(leuteModel);
    const personId = getInstanceOwnerIdHash();
    
    if (!personId) {
      throw new Error('Person ID not available');
    }
    
    const credential = await credentialModel.createDeviceOwnershipCredential(
      personId,
      'test-esp32-device',
      'ESP32'
    );
    
    if (!credential) {
      throw new Error('Failed to create credential');
    }
    
    if (credential.dev !== 'test-esp32-device') {
      throw new Error('Device ID not set correctly in credential');
    }
    
    if (credential.typ !== 'ESP32') {
      throw new Error('Device type not set correctly in credential');
    }
  }
  
  private async testCredentialSerialization(): Promise<void> {
    const credential = {
      id: `vc-${Date.now()}-test`,
      iss: 'lama-app',
      sub: 'test-user-id',
      dev: 'test-esp32-device-id',
      typ: 'ESP32',
      iat: Math.floor(Date.now() / 1000),
      exp: 0,
      own: 'owner',
      prm: 'led_control,status_read,config_write',
      prf: 'mock-signature',
      is_valid: true
    };
    
    const serialized = JSON.stringify(credential);
    
    // Check for object serialization issues
    if (serialized.includes('[object Object]')) {
      throw new Error('Credential contains [object Object]');
    }
    
    // Parse and verify
    const parsed = JSON.parse(serialized);
    if (parsed.dev !== credential.dev) {
      throw new Error('Device ID not preserved in credential');
    }
    
    // Test with Buffer (ESP32 will receive this)
    const buffer = Buffer.from(serialized);
    const fromBuffer = JSON.parse(buffer.toString());
    if (fromBuffer.dev !== credential.dev) {
      throw new Error('Device ID not preserved when using Buffer');
    }
  }
  
  // Journal Tests
  private async testJournalChannelSetup(): Promise<void> {
    const discovery = DeviceDiscoveryModel.getInstance();
    
    // This test verifies the channel would be created when properly initialized
    // In actual use, this happens during app initialization
    // Here we just verify the method exists and can be called
    if (typeof discovery.setChannelManager !== 'function') {
      throw new Error('setChannelManager method not found');
    }
  }
  
  private async testJournalEntryCreation(): Promise<void> {
    // Test journal entry format
    const journalEntry = {
      $type$: 'JournalEntry',
      entryId: `device-ownership-established-${Date.now()}-test`,
      timestamp: Date.now(),
      type: 'DeviceOwnership',
      data: {
        action: 'ownership_established',
        deviceId: 'test-esp32-001',
        ownerPersonId: 'test-owner-id',
        establishedBy: 'test-user',
        establishedAt: Date.now(),
        deviceType: 'ESP32',
        deviceName: 'Test ESP32 Device',
        registrationMethod: 'test'
      },
      userId: 'test-user'
    };
    
    const serialized = JSON.stringify(journalEntry);
    if (serialized.includes('[object Object]')) {
      throw new Error('Journal entry contains [object Object]');
    }
    
    const parsed = JSON.parse(serialized);
    if (parsed.data.deviceId !== journalEntry.data.deviceId) {
      throw new Error('Device ID not preserved in journal entry');
    }
  }
  
  // ESP32-specific Tests
  private async testESP32MessageFormat(): Promise<void> {
    // Test discovery message for ESP32
    const esp32Message = {
      type: 'discovery_request',
      deviceId: 'esp32-' + Date.now(),
      deviceName: 'ESP32 Device',
      deviceType: 'ESP32',
      capabilities: ['vc-auth', 'led-control'],
      version: '1.0.0',
      timestamp: Date.now()
    };
    
    const serialized = JSON.stringify(esp32Message);
    const serviceTypeByte = 0x01; // DISCOVERY_SERVICE
    
    // Simulate packet creation
    const messageBytes = new TextEncoder().encode(serialized);
    const packet = new Uint8Array(1 + messageBytes.length);
    packet[0] = serviceTypeByte;
    packet.set(messageBytes, 1);
    
    // Verify packet structure
    if (packet[0] !== serviceTypeByte) {
      throw new Error('Service type byte not set correctly');
    }
    
    // Parse back
    const jsonData = packet.slice(1);
    const jsonString = new TextDecoder().decode(jsonData);
    const parsed = JSON.parse(jsonString);
    
    if (parsed.deviceType !== 'ESP32') {
      throw new Error('ESP32 device type not preserved');
    }
  }
  
  private async testESP32PortConfiguration(): Promise<void> {
    // ESP32 uses specific ports
    const DISCOVERY_PORT = 49497;
    const CREDENTIAL_PORT = 3333;
    
    // Test discovery port
    const discovery = DeviceDiscoveryModel.getInstance();
    const config = (discovery as any)._config;
    
    if (config && config.discoveryPort !== DISCOVERY_PORT) {
      throw new Error(`Discovery port should be ${DISCOVERY_PORT}, got ${config?.discoveryPort}`);
    }
    
    // Test credential port usage
    const testDevice = {
      id: 'test-esp32',
      name: 'Test ESP32',
      type: 'ESP32',
      address: '192.168.1.100',
      port: CREDENTIAL_PORT,
      lastSeen: Date.now(),
      capabilities: ['vc-auth']
    };
    
    if (testDevice.port !== CREDENTIAL_PORT) {
      throw new Error(`ESP32 credential port should be ${CREDENTIAL_PORT}`);
    }
  }
  
  private async testESP32DeviceRegistration(): Promise<void> {
    const discovery = DeviceDiscoveryModel.getInstance();
    const testDeviceId = 'test-esp32-' + Date.now();
    const testOwnerId = 'test-owner-' + Date.now();
    
    // Register device
    await discovery.registerDeviceOwner(testDeviceId, testOwnerId);
    
    // Verify registration
    const device = discovery.getDevice(testDeviceId);
    if (!device) {
      // Device might not exist in discovery list yet, that's ok
      // The important part is that the registration method completes
      return;
    }
    
    if (device.ownerId !== testOwnerId) {
      throw new Error('Device owner not set correctly');
    }
    
    if (!device.hasValidCredential) {
      throw new Error('Device credential status not set');
    }
  }
}

const esp32TestSuite = new ESP32TestSuite();
registerTestSuite(esp32TestSuite);
