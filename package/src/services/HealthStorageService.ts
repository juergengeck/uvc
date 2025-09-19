/**
 * Health Storage Service
 * Manages storage and retrieval of health data using ONE platform
 */

import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks';

export interface HealthRecord {
  id?: SHA256IdHash;
  type: string;
  value: any;
  timestamp: Date;
  source?: string;
  metadata?: Record<string, any>;
}

export class HealthStorageService {
  private storage: Map<string, HealthRecord[]> = new Map();
  private isInitialized = false;

  constructor() {}

  /**
   * Initialize the storage service
   */
  async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  /**
   * Store a health record
   */
  async storeHealthRecord(record: HealthRecord): Promise<SHA256IdHash | string> {
    if (!this.isInitialized) {
      throw new Error('HealthStorageService not initialized');
    }

    const records = this.storage.get(record.type) || [];
    const id = this.generateId(record);
    const recordWithId = { ...record, id };
    records.push(recordWithId);
    this.storage.set(record.type, records);
    
    return id;
  }

  /**
   * Store multiple health records
   */
  async storeHealthRecords(records: HealthRecord[]): Promise<(SHA256IdHash | string)[]> {
    const ids: (SHA256IdHash | string)[] = [];
    for (const record of records) {
      const id = await this.storeHealthRecord(record);
      ids.push(id);
    }
    return ids;
  }

  /**
   * Retrieve health records by type
   */
  async getHealthRecords(
    type: string,
    options?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<HealthRecord[]> {
    if (!this.isInitialized) {
      throw new Error('HealthStorageService not initialized');
    }

    let records = this.storage.get(type) || [];

    // Apply date filters
    if (options?.startDate) {
      records = records.filter(r => r.timestamp >= options.startDate!);
    }
    if (options?.endDate) {
      records = records.filter(r => r.timestamp <= options.endDate!);
    }

    // Sort by timestamp (newest first)
    records.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    if (options?.offset !== undefined) {
      records = records.slice(options.offset);
    }
    if (options?.limit !== undefined) {
      records = records.slice(0, options.limit);
    }

    return records;
  }

  /**
   * Get a single health record by ID
   */
  async getHealthRecord(id: SHA256IdHash | string): Promise<HealthRecord | null> {
    if (!this.isInitialized) {
      throw new Error('HealthStorageService not initialized');
    }

    for (const records of this.storage.values()) {
      const record = records.find(r => r.id === id);
      if (record) {
        return record;
      }
    }
    return null;
  }

  /**
   * Delete a health record
   */
  async deleteHealthRecord(id: SHA256IdHash | string): Promise<boolean> {
    if (!this.isInitialized) {
      throw new Error('HealthStorageService not initialized');
    }

    for (const [type, records] of this.storage.entries()) {
      const index = records.findIndex(r => r.id === id);
      if (index !== -1) {
        records.splice(index, 1);
        this.storage.set(type, records);
        return true;
      }
    }
    return false;
  }

  /**
   * Get aggregated data for a specific type
   */
  async getAggregatedData(
    type: string,
    aggregationType: 'sum' | 'average' | 'min' | 'max',
    startDate: Date,
    endDate: Date
  ): Promise<number | null> {
    const records = await this.getHealthRecords(type, { startDate, endDate });
    
    if (records.length === 0) {
      return null;
    }

    const values = records
      .map(r => typeof r.value === 'number' ? r.value : r.value?.value)
      .filter(v => typeof v === 'number') as number[];

    if (values.length === 0) {
      return null;
    }

    switch (aggregationType) {
      case 'sum':
        return values.reduce((sum, val) => sum + val, 0);
      case 'average':
        return values.reduce((sum, val) => sum + val, 0) / values.length;
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      default:
        return null;
    }
  }

  /**
   * Clear all stored health records
   */
  async clearAll(): Promise<void> {
    this.storage.clear();
  }

  /**
   * Export health records to JSON
   */
  async exportToJSON(): Promise<string> {
    const allRecords: Record<string, HealthRecord[]> = {};
    for (const [type, records] of this.storage.entries()) {
      allRecords[type] = records;
    }
    return JSON.stringify(allRecords, null, 2);
  }

  /**
   * Import health records from JSON
   */
  async importFromJSON(json: string): Promise<void> {
    const data = JSON.parse(json) as Record<string, HealthRecord[]>;
    for (const [type, records] of Object.entries(data)) {
      // Convert date strings back to Date objects
      const processedRecords = records.map(r => ({
        ...r,
        timestamp: new Date(r.timestamp)
      }));
      this.storage.set(type, processedRecords);
    }
  }

  /**
   * Generate a unique ID for a health record
   */
  private generateId(record: HealthRecord): string {
    // Simple ID generation - in production would use proper hash
    return `${record.type}_${record.timestamp.getTime()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}