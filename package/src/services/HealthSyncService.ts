/**
 * Health Sync Service
 * 
 * Handles synchronization of health data between different sources
 */

import { EventEmitter } from 'events';
import { Observation } from 'fhir/r4';
import { HealthDataService } from './HealthDataService';
import { AppleHealthService } from '../apple/AppleHealthService';

export interface SyncOptions {
  sources: ('apple' | 'ble' | 'manual')[];
  autoSync: boolean;
  syncInterval: number; // in milliseconds
  conflictResolution: 'latest' | 'highest_confidence' | 'manual';
}

export interface SyncResult {
  source: string;
  syncedCount: number;
  errors: string[];
  timestamp: Date;
}

export class HealthSyncService extends EventEmitter {
  private healthDataService: HealthDataService;
  private appleHealthService?: AppleHealthService;
  private syncOptions: SyncOptions;
  private syncTimer?: NodeJS.Timer;
  private syncing: boolean = false;

  constructor(
    healthDataService: HealthDataService,
    options: Partial<SyncOptions> = {}
  ) {
    super();
    this.healthDataService = healthDataService;
    this.syncOptions = {
      sources: ['apple', 'ble'],
      autoSync: true,
      syncInterval: 300000, // 5 minutes
      conflictResolution: 'latest',
      ...options
    };

    if (this.syncOptions.autoSync) {
      this.startAutoSync();
    }
  }

  /**
   * Set Apple Health service for syncing
   */
  setAppleHealthService(service: AppleHealthService): void {
    this.appleHealthService = service;
  }

  /**
   * Start automatic synchronization
   */
  startAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    this.syncTimer = setInterval(() => {
      this.syncAll().catch(error => {
        this.emit('syncError', error);
      });
    }, this.syncOptions.syncInterval);

    this.emit('autoSyncStarted');
  }

  /**
   * Stop automatic synchronization
   */
  stopAutoSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
    this.emit('autoSyncStopped');
  }

  /**
   * Sync all configured sources
   */
  async syncAll(): Promise<SyncResult[]> {
    if (this.syncing) {
      throw new Error('Sync already in progress');
    }

    this.syncing = true;
    this.emit('syncStarted');

    const results: SyncResult[] = [];

    try {
      for (const source of this.syncOptions.sources) {
        try {
          const result = await this.syncSource(source);
          results.push(result);
          this.emit('sourceSync', result);
        } catch (error) {
          const result: SyncResult = {
            source,
            syncedCount: 0,
            errors: [error instanceof Error ? error.message : String(error)],
            timestamp: new Date()
          };
          results.push(result);
          this.emit('sourceSyncError', result);
        }
      }

      this.emit('syncCompleted', results);
      return results;
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Sync a specific source
   */
  async syncSource(source: 'apple' | 'ble' | 'manual'): Promise<SyncResult> {
    const result: SyncResult = {
      source,
      syncedCount: 0,
      errors: [],
      timestamp: new Date()
    };

    try {
      switch (source) {
        case 'apple':
          if (this.appleHealthService) {
            const observations = await this.syncAppleHealth();
            result.syncedCount = observations.length;
          } else {
            result.errors.push('Apple Health service not configured');
          }
          break;

        case 'ble':
          // BLE sync is handled by BLEHealthIntegration
          // This is a placeholder for future direct BLE sync
          result.errors.push('Direct BLE sync not implemented');
          break;

        case 'manual':
          // Manual sync doesn't need active syncing
          break;

        default:
          result.errors.push(`Unknown sync source: ${source}`);
      }
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * Sync data from Apple Health
   */
  private async syncAppleHealth(): Promise<Observation[]> {
    if (!this.appleHealthService) {
      throw new Error('Apple Health service not available');
    }

    const lastSyncTime = await this.getLastSyncTime('apple');
    const endTime = new Date();
    
    // Get new data since last sync
    const heartRateData = await this.appleHealthService.getHeartRateData(lastSyncTime, endTime);
    const stepData = await this.appleHealthService.getStepData(lastSyncTime, endTime);
    
    const observations: Observation[] = [];
    
    // Convert and save heart rate data
    for (const hr of heartRateData) {
      try {
        const observation = await this.appleHealthService.convertToObservation(hr, 'heart_rate');
        await this.healthDataService.saveObservation(observation);
        observations.push(observation);
      } catch (error) {
        this.emit('conversionError', { data: hr, error });
      }
    }

    // Convert and save step data
    for (const steps of stepData) {
      try {
        const observation = await this.appleHealthService.convertToObservation(steps, 'steps');
        await this.healthDataService.saveObservation(observation);
        observations.push(observation);
      } catch (error) {
        this.emit('conversionError', { data: steps, error });
      }
    }

    // Update last sync time
    await this.setLastSyncTime('apple', endTime);

    return observations;
  }

  /**
   * Get last sync time for a source
   */
  private async getLastSyncTime(source: string): Promise<Date> {
    // TODO: Implement persistent storage of sync times
    // For now, return 24 hours ago
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
    return twentyFourHoursAgo;
  }

  /**
   * Set last sync time for a source
   */
  private async setLastSyncTime(source: string, time: Date): Promise<void> {
    // TODO: Implement persistent storage of sync times
    console.log(`Last sync time for ${source} set to:`, time);
  }

  /**
   * Resolve conflicts between observations
   */
  private resolveConflicts(observations: Observation[]): Observation[] {
    const resolved: Observation[] = [];
    const groups = this.groupObservationsByTypeAndTime(observations);

    for (const group of groups) {
      if (group.length === 1) {
        resolved.push(group[0]);
        continue;
      }

      switch (this.syncOptions.conflictResolution) {
        case 'latest':
          resolved.push(this.getLatestObservation(group));
          break;
        case 'highest_confidence':
          resolved.push(this.getHighestConfidenceObservation(group));
          break;
        case 'manual':
          // Emit conflict for manual resolution
          this.emit('conflict', group);
          // For now, use latest as fallback
          resolved.push(this.getLatestObservation(group));
          break;
      }
    }

    return resolved;
  }

  /**
   * Group observations by type and time window
   */
  private groupObservationsByTypeAndTime(observations: Observation[]): Observation[][] {
    const groups: Map<string, Observation[]> = new Map();
    const timeWindow = 60000; // 1 minute

    for (const obs of observations) {
      const type = obs.code.coding?.[0]?.code || 'unknown';
      const time = new Date(obs.effectiveDateTime || obs.effectivePeriod?.start || '').getTime();
      const windowStart = Math.floor(time / timeWindow) * timeWindow;
      const key = `${type}-${windowStart}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(obs);
    }

    return Array.from(groups.values());
  }

  /**
   * Get the latest observation from a group
   */
  private getLatestObservation(observations: Observation[]): Observation {
    return observations.reduce((latest, current) => {
      const latestTime = new Date(latest.effectiveDateTime || latest.effectivePeriod?.start || '').getTime();
      const currentTime = new Date(current.effectiveDateTime || current.effectivePeriod?.start || '').getTime();
      return currentTime > latestTime ? current : latest;
    });
  }

  /**
   * Get the observation with highest confidence from a group
   */
  private getHighestConfidenceObservation(observations: Observation[]): Observation {
    return observations.reduce((highest, current) => {
      const highestConfidence = this.getObservationConfidence(highest);
      const currentConfidence = this.getObservationConfidence(current);
      return currentConfidence > highestConfidence ? current : highest;
    });
  }

  /**
   * Extract confidence score from observation
   */
  private getObservationConfidence(observation: Observation): number {
    // Look for confidence in components
    if (observation.component) {
      const confidenceComponent = observation.component.find(comp =>
        comp.code.coding?.some(coding => coding.code === 'confidence')
      );
      if (confidenceComponent?.valueQuantity?.value) {
        return confidenceComponent.valueQuantity.value;
      }
    }

    // Default confidence based on source
    if (observation.device?.reference?.includes('apple')) {
      return 90; // High confidence for Apple Health
    }
    if (observation.device?.reference?.includes('ble')) {
      return 80; // Good confidence for BLE devices
    }
    return 50; // Default confidence
  }

  /**
   * Get sync status
   */
  getSyncStatus(): {
    syncing: boolean;
    autoSync: boolean;
    lastSync: Date | null;
    sources: string[];
  } {
    return {
      syncing: this.syncing,
      autoSync: this.syncTimer !== undefined,
      lastSync: null, // TODO: Implement
      sources: this.syncOptions.sources
    };
  }

  /**
   * Update sync options
   */
  updateSyncOptions(options: Partial<SyncOptions>): void {
    this.syncOptions = { ...this.syncOptions, ...options };
    
    if (options.autoSync !== undefined) {
      if (options.autoSync) {
        this.startAutoSync();
      } else {
        this.stopAutoSync();
      }
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopAutoSync();
    this.removeAllListeners();
  }
}