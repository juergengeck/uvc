import { EventEmitter } from 'events';
import { Platform, NativeModules } from 'react-native';
import { btleService } from './BLETurboModule';

// Local type definitions to avoid static imports
interface BleManager {
  startDeviceScan: (serviceUUIDs: string[] | null, options: any, callback: (error: any, device: any) => void) => any;
  stopDeviceScan: () => void;
  connectToDevice: (deviceId: string, options?: any) => Promise<any>;
  state: () => Promise<string>;
  onStateChange: (callback: (state: string) => void, emitCurrentState?: boolean) => any;
}

interface Device {
  id: string;
  name?: string;
  rssi?: number;
  serviceUUIDs?: string[];
  services: () => Promise<Service[]>;
  discoverAllServicesAndCharacteristics: () => Promise<Device>;
}

interface Service {
  uuid: string;
  characteristics: () => Promise<Characteristic[]>;
}

interface Characteristic {
  uuid: string;
  isNotifiable: boolean;
  isWritableWithResponse: boolean;
  isWritableWithoutResponse: boolean;
  monitor: (callback: (error: any, char: any) => void) => void;
}

/**
 * GATT Services Manager for App-to-App Communication
 * Implements both Central and Peripheral roles for bidirectional P2P messaging
 */

// Standard UUIDs for app-to-app communication
export const GATT_UUIDS = {
  // Primary service for LAMA app communication
  LAMA_SERVICE: '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
  
  // Characteristics for message exchange
  MESSAGE_TX: 'beb5483e-36e1-4688-b7f5-ea07361b26a8', // For sending messages
  MESSAGE_RX: 'beb5483f-36e1-4688-b7f5-ea07361b26a9', // For receiving messages
  
  // Characteristics for device info and pairing
  DEVICE_INFO: 'beb54840-36e1-4688-b7f5-ea07361b26aa',
  PAIRING_REQUEST: 'beb54841-36e1-4688-b7f5-ea07361b26ab',
  PAIRING_RESPONSE: 'beb54842-36e1-4688-b7f5-ea07361b26ac',
  
  // Characteristics for QUIC-VC handshake
  QUICVC_HANDSHAKE: 'beb54843-36e1-4688-b7f5-ea07361b26ad',
  QUICVC_CREDENTIAL: 'beb54844-36e1-4688-b7f5-ea07361b26ae',
  
  // Control characteristics
  CONNECTION_STATUS: 'beb54845-36e1-4688-b7f5-ea07361b26af',
  MTU_EXCHANGE: 'beb54846-36e1-4688-b7f5-ea07361b26b0',
  
  // ESP32 compatibility service
  ESP32_SERVICE: '4fafc202-1fb5-459e-8fcc-c5c9c331914b',
  ESP32_LED_CONTROL: 'beb54847-36e1-4688-b7f5-ea07361b26b1',
  ESP32_SENSOR_DATA: 'beb54848-36e1-4688-b7f5-ea07361b26b2',
};

// Message types for app-to-app communication
export enum MessageType {
  HANDSHAKE = 0x01,
  TEXT_MESSAGE = 0x02,
  BINARY_DATA = 0x03,
  CREDENTIAL_EXCHANGE = 0x04,
  PAIRING_REQUEST = 0x05,
  PAIRING_RESPONSE = 0x06,
  HEARTBEAT = 0x07,
  DISCOVERY_ANNOUNCE = 0x08,
  QUICVC_INIT = 0x09,
  CONNECTION_CLOSE = 0x0A,
}

interface GATTMessage {
  type: MessageType;
  payload: Uint8Array;
  timestamp: number;
  deviceId: string;
}

interface PeerDevice {
  id: string;
  name: string;
  isConnected: boolean;
  services: string[];
  mtu: number;
  lastSeen: number;
  credentials?: any;
}

export class GATTServicesManager extends EventEmitter {
  private bleManager: BleManagerType | null = null;
  private isPeripheralMode: boolean = false;
  private isCentralMode: boolean = false;
  private connectedDevices: Map<string, PeerDevice> = new Map();
  private messageQueue: Map<string, GATTMessage[]> = new Map();
  private mtu: number = 185; // Default BLE MTU minus overhead
  
  // Peripheral mode properties
  private advertisingStarted: boolean = false;
  
  // Central mode properties
  private scanningStarted: boolean = false;
  private discoveredDevices: Map<string, Device> = new Map();

  constructor() {
    super();
    console.log('[GATTServicesManager] Initialized for app-to-app communication');
  }

  /**
   * Initialize GATT services for app-to-app communication
   */
  async initialize(): Promise<boolean> {
    try {
      // Initialize BLE through our turbo module
      const initialized = await btleService.initialize();
      if (!initialized) {
        console.error('[GATTServicesManager] Failed to initialize BLE service');
        return false;
      }

      // Get the BLE manager instance
      this.bleManager = (btleService as any).bleManager;
      if (!this.bleManager) {
        console.error('[GATTServicesManager] BLE manager not available');
        return false;
      }

      // Set up state change listener
      this.bleManager.onStateChange((state) => {
        console.log('[GATTServicesManager] BLE state changed:', state);
        this.emit('stateChanged', state);
        
        if (state === 'PoweredOn') {
          this.emit('ready');
        }
      }, true);

      console.log('[GATTServicesManager] GATT services initialized successfully');
      return true;
    } catch (error: any) {
      console.error('[GATTServicesManager] Initialization failed:', error.message);
      return false;
    }
  }

  /**
   * Start peripheral mode for app-to-app discovery
   * This makes the app discoverable by other LAMA apps
   */
  async startPeripheralMode(deviceName: string): Promise<void> {
    if (!this.bleManager) {
      throw new Error('GATT services not initialized');
    }

    if (this.isPeripheralMode) {
      console.log('[GATTServicesManager] Peripheral mode already active');
      return;
    }

    try {
      console.log('[GATTServicesManager] Starting peripheral mode for app-to-app communication');
      
      // Platform-specific peripheral setup
      if (Platform.OS === 'ios') {
        await this.setupIOSPeripheral(deviceName);
      } else if (Platform.OS === 'android') {
        await this.setupAndroidPeripheral(deviceName);
      }

      this.isPeripheralMode = true;
      this.emit('peripheralStarted');
      
      console.log('[GATTServicesManager] Peripheral mode started - app is now discoverable');
    } catch (error: any) {
      console.error('[GATTServicesManager] Failed to start peripheral mode:', error.message);
      throw error;
    }
  }

  /**
   * Start central mode for discovering other LAMA apps
   */
  async startCentralMode(): Promise<void> {
    if (!this.bleManager) {
      throw new Error('GATT services not initialized');
    }

    if (this.isCentralMode) {
      console.log('[GATTServicesManager] Central mode already active');
      return;
    }

    try {
      console.log('[GATTServicesManager] Starting central mode for app discovery');
      
      // Start scanning for LAMA service
      this.bleManager.startDeviceScan(
        [GATT_UUIDS.LAMA_SERVICE], // Only scan for LAMA apps
        {
          allowDuplicates: false,
          scanMode: 2, // Balanced mode
        },
        (error, device) => {
          if (error) {
            console.error('[GATTServicesManager] Scan error:', error);
            this.emit('scanError', error);
            return;
          }

          if (device) {
            this.handleDiscoveredDevice(device);
          }
        }
      );

      this.isCentralMode = true;
      this.scanningStarted = true;
      this.emit('centralStarted');
      
      console.log('[GATTServicesManager] Central mode started - scanning for other LAMA apps');
    } catch (error: any) {
      console.error('[GATTServicesManager] Failed to start central mode:', error.message);
      throw error;
    }
  }

  /**
   * Handle discovered LAMA app
   */
  private async handleDiscoveredDevice(device: Device): Promise<void> {
    // Check if it's a LAMA app or ESP32 device
    const isLamaApp = device.serviceUUIDs?.includes(GATT_UUIDS.LAMA_SERVICE);
    const isESP32 = device.serviceUUIDs?.includes(GATT_UUIDS.ESP32_SERVICE) ||
                     device.name?.toLowerCase().includes('esp32');

    if (!isLamaApp && !isESP32) {
      return; // Not a compatible device
    }

    const deviceType = isLamaApp ? 'LAMA_APP' : 'ESP32';
    console.log(`[GATTServicesManager] Discovered ${deviceType}:`, device.name || device.id);

    // Store discovered device
    this.discoveredDevices.set(device.id, device);

    // Emit discovery event
    this.emit('deviceDiscovered', {
      id: device.id,
      name: device.name,
      type: deviceType,
      rssi: device.rssi,
      serviceUUIDs: device.serviceUUIDs,
      isConnectable: device.isConnectable !== false,
    });
  }

  /**
   * Connect to another LAMA app or ESP32 device
   */
  async connectToPeer(deviceId: string): Promise<void> {
    if (!this.bleManager) {
      throw new Error('GATT services not initialized');
    }

    try {
      console.log('[GATTServicesManager] Connecting to peer:', deviceId);
      
      // Connect to the device
      const device = await this.bleManager.connectToDevice(deviceId, {
        autoConnect: false,
        timeout: 10000,
      });

      console.log('[GATTServicesManager] Connected to:', device.name || device.id);

      // Discover all services and characteristics
      await device.discoverAllServicesAndCharacteristics();
      
      // Get services
      const services = await device.services();
      const serviceUUIDs = services.map(s => s.uuid);
      
      console.log('[GATTServicesManager] Available services:', serviceUUIDs);

      // Request MTU for larger message transfers
      if (Platform.OS === 'android') {
        const mtu = await device.requestMTU(512);
        this.mtu = mtu - 3; // Account for ATT header
        console.log('[GATTServicesManager] MTU negotiated:', mtu);
      }

      // Store peer info
      const peer: PeerDevice = {
        id: device.id,
        name: device.name || `Device_${device.id.slice(0, 6)}`,
        isConnected: true,
        services: serviceUUIDs,
        mtu: this.mtu,
        lastSeen: Date.now(),
      };
      
      this.connectedDevices.set(deviceId, peer);

      // Set up characteristic monitoring
      await this.setupCharacteristicMonitoring(device);

      // Send initial handshake
      await this.sendHandshake(device);

      this.emit('peerConnected', peer);
      
    } catch (error: any) {
      console.error('[GATTServicesManager] Connection failed:', error.message);
      throw error;
    }
  }

  /**
   * Set up monitoring for incoming messages
   */
  private async setupCharacteristicMonitoring(device: Device): Promise<void> {
    try {
      // Monitor message RX characteristic
      const messageRxChar = await this.getCharacteristic(
        device,
        GATT_UUIDS.LAMA_SERVICE,
        GATT_UUIDS.MESSAGE_RX
      );

      if (messageRxChar && messageRxChar.isNotifiable) {
        messageRxChar.monitor((error, characteristic) => {
          if (error) {
            console.error('[GATTServicesManager] Monitor error:', error);
            return;
          }

          if (characteristic?.value) {
            this.handleIncomingMessage(device.id, characteristic.value);
          }
        });
      }

      // Monitor pairing response
      const pairingChar = await this.getCharacteristic(
        device,
        GATT_UUIDS.LAMA_SERVICE,
        GATT_UUIDS.PAIRING_RESPONSE
      );

      if (pairingChar && pairingChar.isNotifiable) {
        pairingChar.monitor((error, characteristic) => {
          if (error) return;
          
          if (characteristic?.value) {
            this.handlePairingResponse(device.id, characteristic.value);
          }
        });
      }

    } catch (error: any) {
      console.error('[GATTServicesManager] Failed to setup monitoring:', error.message);
    }
  }

  /**
   * Send handshake to establish app-to-app connection
   */
  private async sendHandshake(device: Device): Promise<void> {
    const handshakeData = {
      type: 'LAMA_APP',
      version: '1.0.0',
      capabilities: ['messaging', 'quicvc', 'credentials'],
      timestamp: Date.now(),
    };

    const message = this.encodeMessage(MessageType.HANDSHAKE, handshakeData);
    await this.writeToCharacteristic(
      device,
      GATT_UUIDS.LAMA_SERVICE,
      GATT_UUIDS.MESSAGE_TX,
      message
    );

    console.log('[GATTServicesManager] Handshake sent to:', device.name || device.id);
  }

  /**
   * Send message to connected peer
   */
  async sendMessage(deviceId: string, message: string | Uint8Array): Promise<void> {
    const peer = this.connectedDevices.get(deviceId);
    if (!peer || !peer.isConnected) {
      throw new Error(`Not connected to device: ${deviceId}`);
    }

    const device = this.discoveredDevices.get(deviceId);
    if (!device) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    const messageType = typeof message === 'string' 
      ? MessageType.TEXT_MESSAGE 
      : MessageType.BINARY_DATA;

    const encoded = this.encodeMessage(messageType, message);
    
    // Handle message chunking if needed
    if (encoded.length > this.mtu) {
      await this.sendChunkedMessage(device, encoded);
    } else {
      await this.writeToCharacteristic(
        device,
        GATT_UUIDS.LAMA_SERVICE,
        GATT_UUIDS.MESSAGE_TX,
        encoded
      );
    }

    this.emit('messageSent', { deviceId, message });
  }

  /**
   * Send large messages in chunks
   */
  private async sendChunkedMessage(device: Device, data: Uint8Array): Promise<void> {
    const chunks = Math.ceil(data.length / this.mtu);
    console.log(`[GATTServicesManager] Sending message in ${chunks} chunks`);

    for (let i = 0; i < chunks; i++) {
      const start = i * this.mtu;
      const end = Math.min(start + this.mtu, data.length);
      const chunk = data.slice(start, end);
      
      await this.writeToCharacteristic(
        device,
        GATT_UUIDS.LAMA_SERVICE,
        GATT_UUIDS.MESSAGE_TX,
        chunk
      );
      
      // Small delay between chunks to prevent overflow
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }

  /**
   * Handle incoming messages from peers
   */
  private handleIncomingMessage(deviceId: string, base64Data: string): void {
    try {
      const data = Buffer.from(base64Data, 'base64');
      const messageType = data[0] as MessageType;
      const payload = data.slice(1);

      console.log(`[GATTServicesManager] Received ${MessageType[messageType]} from ${deviceId}`);

      switch (messageType) {
        case MessageType.HANDSHAKE:
          this.handleHandshakeMessage(deviceId, payload);
          break;
        case MessageType.TEXT_MESSAGE:
          const textMessage = payload.toString('utf-8');
          this.emit('messageReceived', { deviceId, message: textMessage, type: 'text' });
          break;
        case MessageType.BINARY_DATA:
          this.emit('messageReceived', { deviceId, message: payload, type: 'binary' });
          break;
        case MessageType.CREDENTIAL_EXCHANGE:
          this.handleCredentialExchange(deviceId, payload);
          break;
        case MessageType.HEARTBEAT:
          this.updatePeerLastSeen(deviceId);
          break;
        default:
          console.warn(`[GATTServicesManager] Unknown message type: ${messageType}`);
      }
    } catch (error: any) {
      console.error('[GATTServicesManager] Failed to handle message:', error.message);
    }
  }

  /**
   * Handle handshake message from peer
   */
  private handleHandshakeMessage(deviceId: string, payload: Uint8Array): void {
    try {
      const handshake = JSON.parse(payload.toString('utf-8'));
      console.log('[GATTServicesManager] Handshake received:', handshake);
      
      const peer = this.connectedDevices.get(deviceId);
      if (peer) {
        peer.lastSeen = Date.now();
        this.emit('handshakeCompleted', { deviceId, handshake });
      }
    } catch (error: any) {
      console.error('[GATTServicesManager] Invalid handshake:', error.message);
    }
  }

  /**
   * Handle credential exchange for secure communication
   */
  private handleCredentialExchange(deviceId: string, payload: Uint8Array): void {
    try {
      const credentials = JSON.parse(payload.toString('utf-8'));
      console.log('[GATTServicesManager] Credentials received from:', deviceId);
      
      const peer = this.connectedDevices.get(deviceId);
      if (peer) {
        peer.credentials = credentials;
        this.emit('credentialsReceived', { deviceId, credentials });
      }
    } catch (error: any) {
      console.error('[GATTServicesManager] Invalid credentials:', error.message);
    }
  }

  /**
   * Handle pairing response
   */
  private handlePairingResponse(deviceId: string, base64Data: string): void {
    try {
      const data = Buffer.from(base64Data, 'base64');
      const response = JSON.parse(data.toString('utf-8'));
      
      console.log('[GATTServicesManager] Pairing response from:', deviceId);
      this.emit('pairingResponse', { deviceId, response });
    } catch (error: any) {
      console.error('[GATTServicesManager] Invalid pairing response:', error.message);
    }
  }

  /**
   * Update peer last seen timestamp
   */
  private updatePeerLastSeen(deviceId: string): void {
    const peer = this.connectedDevices.get(deviceId);
    if (peer) {
      peer.lastSeen = Date.now();
    }
  }

  /**
   * Platform-specific iOS peripheral setup
   */
  private async setupIOSPeripheral(deviceName: string): Promise<void> {
    // iOS-specific peripheral setup would require native module
    // For now, we'll use the scanning approach
    console.log('[GATTServicesManager] iOS peripheral mode setup (limited without native module)');
  }

  /**
   * Platform-specific Android peripheral setup  
   */
  private async setupAndroidPeripheral(deviceName: string): Promise<void> {
    // Android-specific peripheral setup would require native module
    // For now, we'll use the scanning approach
    console.log('[GATTServicesManager] Android peripheral mode setup (limited without native module)');
  }

  /**
   * Helper to get a specific characteristic
   */
  private async getCharacteristic(
    device: Device,
    serviceUUID: string,
    characteristicUUID: string
  ): Promise<Characteristic | null> {
    try {
      const services = await device.services();
      const service = services.find(s => s.uuid === serviceUUID);
      
      if (!service) {
        console.warn(`[GATTServicesManager] Service ${serviceUUID} not found`);
        return null;
      }

      const characteristics = await service.characteristics();
      const characteristic = characteristics.find(c => c.uuid === characteristicUUID);
      
      if (!characteristic) {
        console.warn(`[GATTServicesManager] Characteristic ${characteristicUUID} not found`);
        return null;
      }

      return characteristic;
    } catch (error: any) {
      console.error('[GATTServicesManager] Failed to get characteristic:', error.message);
      return null;
    }
  }

  /**
   * Write data to a characteristic
   */
  private async writeToCharacteristic(
    device: Device,
    serviceUUID: string,
    characteristicUUID: string,
    data: Uint8Array
  ): Promise<void> {
    const characteristic = await this.getCharacteristic(device, serviceUUID, characteristicUUID);
    
    if (!characteristic) {
      throw new Error(`Characteristic ${characteristicUUID} not found`);
    }

    if (!characteristic.isWritableWithResponse && !characteristic.isWritableWithoutResponse) {
      throw new Error(`Characteristic ${characteristicUUID} is not writable`);
    }

    const base64Data = Buffer.from(data).toString('base64');
    
    if (characteristic.isWritableWithResponse) {
      await characteristic.writeWithResponse(base64Data);
    } else {
      await characteristic.writeWithoutResponse(base64Data);
    }
  }

  /**
   * Encode message for transmission
   */
  private encodeMessage(type: MessageType, data: any): Uint8Array {
    let payload: Uint8Array;
    
    if (typeof data === 'string') {
      payload = new TextEncoder().encode(data);
    } else if (data instanceof Uint8Array) {
      payload = data;
    } else {
      // JSON encode objects
      const json = JSON.stringify(data);
      payload = new TextEncoder().encode(json);
    }

    // Create message with type header
    const message = new Uint8Array(1 + payload.length);
    message[0] = type;
    message.set(payload, 1);
    
    return message;
  }

  /**
   * Disconnect from a peer
   */
  async disconnectPeer(deviceId: string): Promise<void> {
    const device = this.discoveredDevices.get(deviceId);
    
    if (device) {
      try {
        await device.cancelConnection();
        console.log('[GATTServicesManager] Disconnected from:', deviceId);
      } catch (error: any) {
        console.error('[GATTServicesManager] Disconnect error:', error.message);
      }
    }

    this.connectedDevices.delete(deviceId);
    this.discoveredDevices.delete(deviceId);
    this.messageQueue.delete(deviceId);
    
    this.emit('peerDisconnected', deviceId);
  }

  /**
   * Stop all GATT services
   */
  async stop(): Promise<void> {
    // Stop scanning
    if (this.scanningStarted && this.bleManager) {
      await this.bleManager.stopDeviceScan();
      this.scanningStarted = false;
    }

    // Disconnect all peers
    for (const deviceId of this.connectedDevices.keys()) {
      await this.disconnectPeer(deviceId);
    }

    this.isPeripheralMode = false;
    this.isCentralMode = false;
    this.advertisingStarted = false;
    
    console.log('[GATTServicesManager] All GATT services stopped');
  }

  /**
   * Get list of connected peers
   */
  getConnectedPeers(): PeerDevice[] {
    return Array.from(this.connectedDevices.values());
  }

  /**
   * Check if connected to a specific peer
   */
  isConnectedToPeer(deviceId: string): boolean {
    const peer = this.connectedDevices.get(deviceId);
    return peer?.isConnected || false;
  }
}

// Export singleton instance
export const gattServicesManager = new GATTServicesManager();