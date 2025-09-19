/**
 * Unified BTLE Service using BLETurboModule
 * Provides app-to-app and ESP32 communication capabilities
 */
export class RefactoredBTLEService {
  private service: any = null;

  constructor() {
    console.log('[RefactoredBTLEService] Creating instance - will lazy load BLETurboModule');
  }

  private async getService() {
    if (!this.service) {
      try {
        const { btleService } = await import('./BLETurboModule');
        this.service = btleService;
        console.log('[RefactoredBTLEService] BLETurboModule loaded successfully');
      } catch (error) {
        console.log('[RefactoredBTLEService] Failed to load BLETurboModule:', error);
        throw new Error('Native BTLE module not available');
      }
    }
    return this.service;
  }

  async initialize(): Promise<boolean> {
    try {
      const service = await this.getService();
      return await service.initialize();
    } catch (error) {
      console.log('[RefactoredBTLEService] Initialization failed:', error);
      return false;
    }
  }

  async startDiscovery(): Promise<void> {
    try {
      const service = await this.getService();
      return await service.startDiscovery();
    } catch (error) {
      console.log('[RefactoredBTLEService] startDiscovery failed:', error);
      throw error;
    }
  }

  async stopDiscovery(): Promise<void> {
    try {
      const service = await this.getService();
      return await service.stopDiscovery();
    } catch (error) {
      console.log('[RefactoredBTLEService] stopDiscovery failed:', error);
      throw error;
    }
  }

  async isBTLEAvailable(): Promise<boolean> {
    try {
      const service = await this.getService();
      return await service.isBTLEAvailable();
    } catch (error) {
      console.log('[RefactoredBTLEService] isBTLEAvailable failed:', error);
      return false;
    }
  }

  async cleanup(): Promise<void> {
    try {
      const service = await this.getService();
      return await service.cleanup();
    } catch (error) {
      console.log('[RefactoredBTLEService] cleanup failed:', error);
    }
  }

  async connectToDevice(deviceId: string): Promise<any> {
    try {
      const service = await this.getService();
      return await service.connectToDevice(deviceId);
    } catch (error) {
      console.log('[RefactoredBTLEService] connectToDevice failed:', error);
      throw error;
    }
  }

  async getState(): Promise<string> {
    try {
      const service = await this.getService();
      return await service.getState();
    } catch (error) {
      console.log('[RefactoredBTLEService] getState failed:', error);
      return 'Unknown';
    }
  }

  // Event handling
  on(event: string, handler: (...args: any[]) => void): void {
    if (this.service) {
      this.service.on(event, handler);
    } else {
      console.log('[RefactoredBTLEService] Cannot add listener - service not loaded');
    }
  }

  off(event: string, handler: (...args: any[]) => void): void {
    if (this.service) {
      this.service.off(event, handler);
    }
  }

  removeAllListeners(event?: string): void {
    if (this.service) {
      this.service.removeAllListeners(event);
    }
  }
}