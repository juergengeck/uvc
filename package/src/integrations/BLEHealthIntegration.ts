import { EventEmitter } from 'events';
import { 
  UnifiedBLEManager, 
  BLEDevice, 
  RingDevice,
  HealthData 
} from '@refinio/one.btle';
import { 
  ObservationWithSource,
  createDevice,
  DeviceTypes 
} from '../fhir';
import { HealthDataService } from '../services/HealthDataService';
import { bleDataToFHIR } from '../fhir/converters';

export interface BLEHealthIntegrationOptions {
  patientId: string;
  autoConnect?: boolean;
  syncInterval?: number; // milliseconds
  enableRealTimeSync?: boolean;
}

/**
 * Integration service between BLE devices and health data
 * Connects one.btle with one.health
 */
export class BLEHealthIntegration extends EventEmitter {
  private bleManager: UnifiedBLEManager;
  private healthService: HealthDataService;
  private activeMonitors: Map<string, () => void> = new Map();
  private options: BLEHealthIntegrationOptions;
  private syncInterval?: NodeJS.Timer;

  constructor(
    healthService: HealthDataService,
    options: BLEHealthIntegrationOptions
  ) {
    super();
    this.healthService = healthService;
    this.options = options;
    this.bleManager = new UnifiedBLEManager();
    
    this.setupEventHandlers();
    
    if (options.syncInterval) {
      this.startPeriodicSync();
    }
  }

  private setupEventHandlers() {
    // Handle device discovery
    this.bleManager.on('deviceDiscovered', (device: BLEDevice) => {
      this.handleDeviceDiscovered(device);
    });

    // Handle device connection
    this.bleManager.on('deviceConnected', (device: BLEDevice) => {
      this.handleDeviceConnected(device);
    });

    // Handle device disconnection
    this.bleManager.on('deviceDisconnected', (device: BLEDevice) => {
      this.handleDeviceDisconnected(device);
    });

    // Handle errors
    this.bleManager.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  private async handleDeviceDiscovered(device: BLEDevice) {
    // Create FHIR Device resource
    const fhirDevice = this.createFHIRDevice(device);
    
    try {
      await this.healthService.saveDevice(fhirDevice);
      this.emit('deviceRegistered', device, fhirDevice);

      // Auto-connect if enabled and device is a health monitor
      if (this.options.autoConnect && this.isHealthDevice(device)) {
        await this.connectDevice(device.id);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  private async handleDeviceConnected(device: BLEDevice) {
    if (!this.isHealthDevice(device)) return;

    try {
      // Start monitoring based on device type
      if (device.type === 'ring' || device.type === 'wearable') {
        await this.startHealthMonitoring(device);
      }

      this.emit('monitoringStarted', device);
    } catch (error) {
      this.emit('error', error);
    }
  }

  private async handleDeviceDisconnected(device: BLEDevice) {
    // Stop monitoring for this device
    const unsubscribe = this.activeMonitors.get(device.id);
    if (unsubscribe) {
      unsubscribe();
      this.activeMonitors.delete(device.id);
      this.emit('monitoringStopped', device);
    }
  }

  private isHealthDevice(device: BLEDevice): boolean {
    return ['ring', 'wearable', 'sensor'].includes(device.type);
  }

  private createFHIRDevice(bleDevice: BLEDevice) {
    let deviceType;
    
    switch (bleDevice.type) {
      case 'ring':
        deviceType = DeviceTypes.SMART_RING;
        break;
      case 'wearable':
        deviceType = DeviceTypes.FITNESS_TRACKER;
        break;
      default:
        deviceType = {
          coding: [{
            system: 'http://hl7.org/fhir/device-type',
            code: bleDevice.type,
            display: bleDevice.type
          }]
        };
    }

    return createDevice({
      id: bleDevice.id,
      identifier: [{
        system: 'ble-mac-address',
        value: bleDevice.id
      }],
      displayName: bleDevice.name,
      type: deviceType,
      manufacturer: bleDevice.metadata?.manufacturer,
      model: bleDevice.metadata?.model,
      version: bleDevice.metadata?.firmwareVersion,
      status: bleDevice.isConnected ? 'active' : 'inactive',
      patient: { reference: `Patient/${this.options.patientId}` }
    });
  }

  async startDiscovery(deviceTypes?: string[]) {
    await this.bleManager.startDiscovery({ 
      deviceTypes: deviceTypes as any 
    });
  }

  async stopDiscovery() {
    await this.bleManager.stopDiscovery();
  }

  async connectDevice(deviceId: string) {
    return await this.bleManager.connectToDevice(deviceId);
  }

  async disconnectDevice(deviceId: string) {
    await this.bleManager.disconnectDevice(deviceId);
  }

  private async startHealthMonitoring(device: BLEDevice) {
    if (!device.handler) return;

    const monitors: Array<() => void> = [];

    // Heart rate monitoring
    if (device.type === 'ring' || device.type === 'wearable') {
      const hrUnsubscribe = await this.startHeartRateMonitoring(device);
      if (hrUnsubscribe) monitors.push(hrUnsubscribe);

      const spo2Unsubscribe = await this.startSpO2Monitoring(device);
      if (spo2Unsubscribe) monitors.push(spo2Unsubscribe);
    }

    // Store all unsubscribe functions
    if (monitors.length > 0) {
      this.activeMonitors.set(device.id, () => {
        monitors.forEach(unsubscribe => unsubscribe());
      });
    }
  }

  private async startHeartRateMonitoring(device: BLEDevice): Promise<(() => void) | null> {
    try {
      const handler = device.handler as any;
      if (!handler.startHeartRateMonitoring) return null;

      return await handler.startHeartRateMonitoring(async (data: HealthData) => {
        await this.handleHealthData(data, device);
      });
    } catch (error) {
      this.emit('error', error);
      return null;
    }
  }

  private async startSpO2Monitoring(device: BLEDevice): Promise<(() => void) | null> {
    try {
      const handler = device.handler as any;
      if (!handler.startSPO2Monitoring) return null;

      return await handler.startSPO2Monitoring(async (data: HealthData) => {
        await this.handleHealthData(data, device);
      });
    } catch (error) {
      this.emit('error', error);
      return null;
    }
  }

  private async handleHealthData(data: HealthData, device: BLEDevice) {
    try {
      // Convert to FHIR Observation
      const observation = bleDataToFHIR(data, this.options.patientId);
      
      // Add device reference
      observation.device = {
        reference: `Device/${device.id}`,
        display: device.name
      };

      // Save to health service
      await this.healthService.saveObservation(observation);

      // Emit event
      this.emit('healthDataReceived', {
        device,
        data,
        observation
      });

      // Real-time sync if enabled
      if (this.options.enableRealTimeSync) {
        await this.healthService.syncObservation(observation);
      }
    } catch (error) {
      this.emit('error', error);
    }
  }

  private startPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(async () => {
      try {
        await this.syncAllHealthData();
      } catch (error) {
        this.emit('error', error);
      }
    }, this.options.syncInterval!);
  }

  async syncAllHealthData() {
    try {
      const pendingObservations = await this.healthService.getPendingObservations();
      
      for (const observation of pendingObservations) {
        await this.healthService.syncObservation(observation);
      }

      this.emit('syncCompleted', {
        count: pendingObservations.length,
        timestamp: new Date()
      });
    } catch (error) {
      this.emit('syncError', error);
      throw error;
    }
  }

  async getConnectedHealthDevices(): Promise<BLEDevice[]> {
    const connectedDevices = this.bleManager.getConnectedDevices();
    return connectedDevices.filter(device => this.isHealthDevice(device));
  }

  async getDeviceHealthHistory(deviceId: string, startDate: Date, endDate: Date) {
    return await this.healthService.getObservationsByDevice(deviceId, startDate, endDate);
  }

  async getHealthSummary(period: 'day' | 'week' | 'month' = 'day') {
    const endDate = new Date();
    const startDate = new Date();
    
    switch (period) {
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
    }

    return await this.healthService.getHealthSummary(
      this.options.patientId,
      startDate,
      endDate
    );
  }

  async destroy() {
    // Stop all monitoring
    for (const [deviceId, unsubscribe] of this.activeMonitors) {
      unsubscribe();
    }
    this.activeMonitors.clear();

    // Stop periodic sync
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
    }

    // Cleanup BLE manager
    this.bleManager.destroy();

    // Remove all listeners
    this.removeAllListeners();
  }
}