import { BleManager, Device, State } from 'react-native-ble-plx';
import { EventEmitter } from 'events';

type BTLEState = State | 'Unknown';

class BLETurboModuleService extends EventEmitter {
  private manager: BleManager | null = null;
  private initialized: boolean = false;
  private currentState: BTLEState = 'Unknown';
  private scanning: boolean = false;

  public async initialize(): Promise<boolean> {
    if (this.initialized && this.manager) return true;

    try {
      this.manager = new BleManager();
      this.initialized = true;

      // Prime state and subscribe to changes
      try {
        this.currentState = await this.manager.state();
        console.log('[BLETurboModule] Initial state:', this.currentState);
        this.emit('stateChanged', this.currentState);
      } catch (error) {
        console.error('[BLETurboModule] Error getting initial state:', error);
        this.currentState = 'Unknown';
      }

      this.manager.onStateChange((state) => {
        console.log('[BLETurboModule] State changed from', this.currentState, 'to', state);
        this.currentState = state;
        this.emit('stateChanged', state);
        if (state === State.PoweredOn) this.emit('ready');
      }, true);

      return true;
    } catch (error) {
      console.error('[BLETurboModule] initialize failed:', (error as any)?.message || error);
      this.initialized = false;
      this.manager = null;
      return false;
    }
  }

  public async getState(): Promise<BTLEState> {
    if (!this.manager) return this.currentState;
    try {
      this.currentState = await this.manager.state();
      return this.currentState;
    } catch {
      return this.currentState;
    }
  }

  public async isBTLEAvailable(): Promise<boolean> {
    if (!this.initialized || !this.manager) return false;
    const state = await this.getState();
    return state === State.PoweredOn;
  }

  public async startDiscovery(): Promise<void> {
    await this.startScan();
  }

  public async stopDiscovery(): Promise<void> {
    await this.stopScan();
  }

  public async startScan(): Promise<void> {
    if (!this.manager) throw new Error('BLE manager not initialized');
    if (this.scanning) return;
    this.scanning = true;
    this.emit('scanStarted');

    this.manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) {
        this.emit('error', error);
        return;
      }
      if (device) {
        this.emit('deviceDiscovered', {
          id: device.id,
          name: device.name,
          rssi: device.rssi,
          type: (device.name || '').toLowerCase().includes('esp32') ? 'ESP32' : 'BLE',
          isConnected: false,
          lastSeen: Date.now(),
        });
      }
    });
  }

  public async stopScan(): Promise<void> {
    if (!this.manager) return;
    if (!this.scanning) return;
    try {
      this.manager.stopDeviceScan();
    } finally {
      this.scanning = false;
      this.emit('scanStopped');
    }
  }

  public async connectToDevice(deviceId: string): Promise<Device> {
    if (!this.manager) throw new Error('BLE manager not initialized');
    const device = await this.manager.connectToDevice(deviceId, { autoConnect: false, timeout: 10000 });
    return device;
  }

  public async cleanup(): Promise<void> {
    try {
      await this.stopScan();
    } catch {}
    try {
      await this.manager?.destroy();
    } catch {}
    this.manager = null;
    this.initialized = false;
    this.currentState = 'Unknown';
  }
}

export const btleService = new BLETurboModuleService();


