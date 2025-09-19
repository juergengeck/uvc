/**
 * Health Data Service
 * 
 * Main service for managing health data storage and synchronization
 * Integrates with ONE platform for data persistence
 */

import { EventEmitter } from 'events';
import { Observation, Bundle, Patient, Device } from 'fhir/r4';
import { ObservationWithSource } from '../fhir/types';

export interface HealthDataServiceConfig {
  storage: any; // ONE platform instance
  patientId: string;
  autoSync?: boolean;
  syncInterval?: number;
}

export interface HealthSummary {
  patientId: string;
  period: {
    start: Date;
    end: Date;
  };
  metrics: {
    heartRate?: {
      latest: number;
      average: number;
      min: number;
      max: number;
      count: number;
    };
    steps?: {
      total: number;
      daily: number[];
    };
    spo2?: {
      latest: number;
      average: number;
      min: number;
      max: number;
      count: number;
    };
    sleep?: {
      totalHours: number;
      quality: string;
      sessions: number;
    };
  };
}

export class HealthDataService extends EventEmitter {
  private config: HealthDataServiceConfig;
  private observations: Map<string, ObservationWithSource> = new Map();
  private pendingSync: Set<string> = new Set();
  private syncTimer?: NodeJS.Timer;

  constructor(config: HealthDataServiceConfig) {
    super();
    this.config = {
      autoSync: true,
      syncInterval: 300000, // 5 minutes
      ...config
    };

    if (this.config.autoSync) {
      this.startAutoSync();
    }
  }

  /**
   * Save a single observation
   */
  async saveObservation(observation: Observation): Promise<void> {
    const id = observation.id || this.generateId();
    const obsWithSource: ObservationWithSource = {
      ...observation,
      id,
      meta: {
        ...observation.meta,
        lastUpdated: new Date().toISOString()
      }
    };

    this.observations.set(id, obsWithSource);
    this.pendingSync.add(id);

    // Store in ONE platform
    try {
      await this.storeInONE(obsWithSource);
      this.emit('observationSaved', obsWithSource);
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Save multiple observations
   */
  async saveObservations(observations: Observation[]): Promise<void> {
    for (const obs of observations) {
      await this.saveObservation(obs);
    }
  }

  /**
   * Save a device
   */
  async saveDevice(device: Device): Promise<void> {
    try {
      // Store device in ONE platform
      await this.storeDeviceInONE(device);
      this.emit('deviceSaved', device);
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Get observations by device
   */
  async getObservationsByDevice(
    deviceId: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<Observation[]> {
    const observations: Observation[] = [];
    
    for (const [_, obs] of this.observations) {
      if (obs.device?.reference === `Device/${deviceId}`) {
        const effectiveDate = new Date(obs.effectiveDateTime || '');
        if (effectiveDate >= startDate && effectiveDate <= endDate) {
          observations.push(obs);
        }
      }
    }

    return observations.sort((a, b) => {
      const dateA = new Date(a.effectiveDateTime || '');
      const dateB = new Date(b.effectiveDateTime || '');
      return dateB.getTime() - dateA.getTime();
    });
  }

  /**
   * Get pending observations for sync
   */
  async getPendingObservations(): Promise<Observation[]> {
    const pending: Observation[] = [];
    
    for (const id of this.pendingSync) {
      const obs = this.observations.get(id);
      if (obs) {
        pending.push(obs);
      }
    }

    return pending;
  }

  /**
   * Sync a single observation
   */
  async syncObservation(observation: Observation): Promise<void> {
    try {
      // Sync to remote if configured
      // For now, just mark as synced
      if (observation.id) {
        this.pendingSync.delete(observation.id);
      }
      this.emit('observationSynced', observation);
    } catch (error) {
      this.emit('syncError', error);
      throw error;
    }
  }

  /**
   * Get health summary for a period
   */
  async getHealthSummary(
    patientId: string,
    startDate: Date,
    endDate: Date
  ): Promise<HealthSummary> {
    const summary: HealthSummary = {
      patientId,
      period: { start: startDate, end: endDate },
      metrics: {}
    };

    // Collect all observations for the period
    const observations: Observation[] = [];
    for (const [_, obs] of this.observations) {
      if (obs.subject?.reference === `Patient/${patientId}`) {
        const effectiveDate = new Date(obs.effectiveDateTime || '');
        if (effectiveDate >= startDate && effectiveDate <= endDate) {
          observations.push(obs);
        }
      }
    }

    // Process heart rate data
    const heartRates = observations.filter(obs => 
      obs.code.coding?.some(c => c.code === '8867-4') // LOINC code for heart rate
    );
    if (heartRates.length > 0) {
      const values = heartRates.map(hr => hr.valueQuantity?.value || 0);
      summary.metrics.heartRate = {
        latest: values[0],
        average: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        count: values.length
      };
    }

    // Process step count data
    const steps = observations.filter(obs =>
      obs.code.coding?.some(c => c.code === '55423-8') // LOINC code for steps
    );
    if (steps.length > 0) {
      const total = steps.reduce((sum, s) => sum + (s.valueQuantity?.value || 0), 0);
      summary.metrics.steps = {
        total,
        daily: steps.map(s => s.valueQuantity?.value || 0)
      };
    }

    // Process SpO2 data
    const spo2s = observations.filter(obs =>
      obs.code.coding?.some(c => c.code === '59408-5') // LOINC code for SpO2
    );
    if (spo2s.length > 0) {
      const values = spo2s.map(s => s.valueQuantity?.value || 0);
      summary.metrics.spo2 = {
        latest: values[0],
        average: values.reduce((a, b) => a + b, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        count: values.length
      };
    }

    return summary;
  }

  /**
   * Start automatic sync
   */
  private startAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(async () => {
      try {
        const pending = await this.getPendingObservations();
        for (const obs of pending) {
          await this.syncObservation(obs);
        }
      } catch (error) {
        this.emit('error', error);
      }
    }, this.config.syncInterval!);
  }

  /**
   * Stop automatic sync
   */
  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
  }

  /**
   * Store observation in ONE platform
   */
  private async storeInONE(observation: ObservationWithSource): Promise<void> {
    // TODO: Implement actual ONE platform storage
    // For now, just simulate storage
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Store device in ONE platform
   */
  private async storeDeviceInONE(device: Device): Promise<void> {
    // TODO: Implement actual ONE platform storage
    // For now, just simulate storage
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `obs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopAutoSync();
    this.removeAllListeners();
    this.observations.clear();
    this.pendingSync.clear();
  }
}