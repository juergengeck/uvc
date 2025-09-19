/**
 * ONE Health Integration
 * Integrates health data with the ONE platform
 */

import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';
import { HealthStorageService, HealthRecord } from '../services/HealthStorageService';
import { HealthDataService } from '../services/HealthDataService';
import { HealthSyncService } from '../services/HealthSyncService';

export interface ONEHealthConfig {
  enableSync?: boolean;
  syncInterval?: number; // in milliseconds
  encryptData?: boolean;
  personId?: SHA256IdHash;
}

export class ONEHealthIntegration {
  private storageService: HealthStorageService;
  private dataService: HealthDataService;
  private syncService: HealthSyncService;
  private config: ONEHealthConfig;
  private syncTimer?: NodeJS.Timeout;
  private isInitialized = false;

  constructor(config: ONEHealthConfig = {}) {
    this.config = {
      enableSync: false,
      syncInterval: 60000, // 1 minute default
      encryptData: true,
      ...config
    };
    
    this.storageService = new HealthStorageService();
    this.dataService = new HealthDataService();
    this.syncService = new HealthSyncService();
  }

  /**
   * Initialize the ONE Health integration
   */
  async initialize(): Promise<void> {
    await this.storageService.initialize();
    await this.dataService.initialize();
    await this.syncService.initialize();
    
    if (this.config.enableSync) {
      this.startSync();
    }
    
    this.isInitialized = true;
  }

  /**
   * Store health data to ONE platform
   */
  async storeHealthData(data: {
    type: string;
    value: any;
    timestamp?: Date;
    source?: string;
    metadata?: Record<string, any>;
  }): Promise<SHA256IdHash | string> {
    if (!this.isInitialized) {
      throw new Error('ONEHealthIntegration not initialized');
    }

    const record: HealthRecord = {
      type: data.type,
      value: data.value,
      timestamp: data.timestamp || new Date(),
      source: data.source || 'one.health',
      metadata: {
        ...data.metadata,
        personId: this.config.personId,
        encrypted: this.config.encryptData
      }
    };

    // Encrypt if configured
    if (this.config.encryptData) {
      record.value = await this.encryptValue(record.value);
    }

    return await this.storageService.storeHealthRecord(record);
  }

  /**
   * Retrieve health data from ONE platform
   */
  async getHealthData(
    type: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      decrypt?: boolean;
    }
  ): Promise<HealthRecord[]> {
    if (!this.isInitialized) {
      throw new Error('ONEHealthIntegration not initialized');
    }

    const records = await this.storageService.getHealthRecords(type, options);

    // Decrypt if needed
    if (options?.decrypt !== false && this.config.encryptData) {
      for (const record of records) {
        record.value = await this.decryptValue(record.value);
      }
    }

    return records;
  }

  /**
   * Sync health data with connected devices/services
   */
  async syncHealthData(): Promise<{
    synced: number;
    failed: number;
    errors?: Error[];
  }> {
    if (!this.isInitialized) {
      throw new Error('ONEHealthIntegration not initialized');
    }

    return await this.syncService.syncAll();
  }

  /**
   * Start automatic sync
   */
  startSync(): void {
    if (this.syncTimer) {
      return;
    }

    this.syncTimer = setInterval(async () => {
      try {
        await this.syncHealthData();
      } catch (error) {
        console.error('[ONEHealthIntegration] Sync error:', error);
      }
    }, this.config.syncInterval!);
  }

  /**
   * Stop automatic sync
   */
  stopSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
  }

  /**
   * Get aggregated health metrics
   */
  async getHealthMetrics(
    type: string,
    period: 'day' | 'week' | 'month' | 'year',
    date: Date = new Date()
  ): Promise<{
    sum?: number;
    average?: number;
    min?: number;
    max?: number;
    count: number;
  }> {
    const { startDate, endDate } = this.getPeriodDates(period, date);
    
    const records = await this.getHealthData(type, { startDate, endDate });
    
    if (records.length === 0) {
      return { count: 0 };
    }

    const values = records
      .map(r => typeof r.value === 'number' ? r.value : r.value?.value)
      .filter(v => typeof v === 'number') as number[];

    return {
      sum: values.reduce((sum, val) => sum + val, 0),
      average: values.length > 0 ? values.reduce((sum, val) => sum + val, 0) / values.length : undefined,
      min: values.length > 0 ? Math.min(...values) : undefined,
      max: values.length > 0 ? Math.max(...values) : undefined,
      count: records.length
    };
  }

  /**
   * Export health data
   */
  async exportHealthData(format: 'json' | 'csv' = 'json'): Promise<string> {
    if (!this.isInitialized) {
      throw new Error('ONEHealthIntegration not initialized');
    }

    if (format === 'json') {
      return await this.storageService.exportToJSON();
    }

    // CSV export implementation would go here
    throw new Error(`Export format ${format} not implemented yet`);
  }

  /**
   * Import health data
   */
  async importHealthData(data: string, format: 'json' | 'csv' = 'json'): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('ONEHealthIntegration not initialized');
    }

    if (format === 'json') {
      await this.storageService.importFromJSON(data);
      return;
    }

    // CSV import implementation would go here
    throw new Error(`Import format ${format} not implemented yet`);
  }

  /**
   * Clear all health data
   */
  async clearAllData(): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('ONEHealthIntegration not initialized');
    }

    await this.storageService.clearAll();
  }

  /**
   * Destroy the integration and clean up
   */
  async destroy(): Promise<void> {
    this.stopSync();
    this.isInitialized = false;
  }

  /**
   * Get period date range
   */
  private getPeriodDates(period: 'day' | 'week' | 'month' | 'year', date: Date): {
    startDate: Date;
    endDate: Date;
  } {
    const startDate = new Date(date);
    const endDate = new Date(date);

    switch (period) {
      case 'day':
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'week':
        const dayOfWeek = startDate.getDay();
        startDate.setDate(startDate.getDate() - dayOfWeek);
        startDate.setHours(0, 0, 0, 0);
        endDate.setDate(endDate.getDate() + (6 - dayOfWeek));
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'month':
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setMonth(endDate.getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'year':
        startDate.setMonth(0, 1);
        startDate.setHours(0, 0, 0, 0);
        endDate.setMonth(11, 31);
        endDate.setHours(23, 59, 59, 999);
        break;
    }

    return { startDate, endDate };
  }

  /**
   * Encrypt a value (placeholder implementation)
   */
  private async encryptValue(value: any): Promise<any> {
    // In production, this would use ONE platform's encryption
    return value;
  }

  /**
   * Decrypt a value (placeholder implementation)
   */
  private async decryptValue(value: any): Promise<any> {
    // In production, this would use ONE platform's decryption
    return value;
  }
}