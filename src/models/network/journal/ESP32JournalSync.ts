/**
 * ESP32 Journal Synchronization
 * 
 * Implements journal-based data synchronization with ESP32 devices.
 * Uses QUIC-VC for secure transport and ensures only authorized owners can sync.
 */

import { IQuicTransport, NetworkServiceType } from '../interfaces';
import { ESP32ConnectionManager, ESP32Device } from '../esp32/ESP32ConnectionManager';
import { OEvent } from '@refinio/one.models/lib/misc/OEvent.js';
import { Buffer } from '@refinio/one.core/lib/system/expo/index.js';
import Debug from 'debug';
import type { SHA256IdHash } from '@refinio/one.core/lib/util/type-checks.js';
import type { Person } from '@refinio/one.core/lib/recipes.js';
import { UdpRemoteInfo } from '../UdpModel';

const debug = Debug('one:esp32:journal');

export interface ESP32ESP32JournalEntry {
  id: string;
  timestamp: number;
  type: 'sensor_data' | 'config_change' | 'command' | 'event';
  data: any;
  deviceId: string;
  signature?: string; // Ed25519 signature for authenticity
}

export interface JournalSyncRequest {
  type: 'sync_request';
  deviceId: string;
  lastSyncTimestamp: number;
  requestId: string;
}

export interface JournalSyncResponse {
  type: 'sync_response';
  requestId: string;
  entries: ESP32ESP32JournalEntry[];
  hasMore: boolean;
  nextTimestamp?: number;
}

export interface JournalAck {
  type: 'sync_ack';
  requestId: string;
  processedCount: number;
  lastProcessedId: string;
}

export class ESP32JournalSync {
  private transport: IQuicTransport;
  private connectionManager: ESP32ConnectionManager;
  private ownPersonId: SHA256IdHash<Person>;
  private syncStates: Map<string, { lastSync: number, syncing: boolean }> = new Map();
  private pendingSyncs: Map<string, { resolve: (entries: ESP32JournalEntry[]) => void, reject: (error: Error) => void, timeout: NodeJS.Timeout }> = new Map();
  
  // Events
  public readonly onESP32JournalEntry = new OEvent<(deviceId: string, entry: ESP32JournalEntry) => void>();
  public readonly onSyncComplete = new OEvent<(deviceId: string, entriesCount: number) => void>();
  public readonly onError = new OEvent<(error: Error) => void>();

  constructor(
    transport: IQuicTransport,
    connectionManager: ESP32ConnectionManager,
    ownPersonId: SHA256IdHash<Person>
  ) {
    this.transport = transport;
    this.connectionManager = connectionManager;
    this.ownPersonId = ownPersonId;
    
    // Register service handler for journal sync
    this.transport.addService(NetworkServiceType.JOURNAL_SYNC_SERVICE, this.handleJournalMessage.bind(this));
    
    debug('ESP32JournalSync initialized');
  }

  /**
   * Start journal synchronization with an ESP32 device
   */
  public async syncWithDevice(deviceId: string): Promise<ESP32JournalEntry[]> {
    const device = this.connectionManager.getDevice(deviceId);
    
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }
    
    if (!device.isAuthenticated) {
      throw new Error(`Device ${deviceId} not authenticated`);
    }
    
    if (!this.connectionManager.isDeviceOwner(deviceId)) {
      throw new Error(`Not authorized to sync with device ${deviceId}`);
    }
    
    // Check if already syncing
    const syncState = this.syncStates.get(deviceId);
    if (syncState?.syncing) {
      throw new Error(`Already syncing with device ${deviceId}`);
    }
    
    // Update sync state
    this.syncStates.set(deviceId, {
      lastSync: syncState?.lastSync || 0,
      syncing: true
    });
    
    try {
      const entries = await this.performSync(device);
      
      // Update last sync timestamp
      if (entries.length > 0) {
        const lastTimestamp = Math.max(...entries.map(e => e.timestamp));
        this.syncStates.set(deviceId, {
          lastSync: lastTimestamp,
          syncing: false
        });
      } else {
        this.syncStates.set(deviceId, {
          lastSync: Date.now(),
          syncing: false
        });
      }
      
      this.onSyncComplete.emit(deviceId, entries.length);
      return entries;
    } catch (error) {
      // Reset sync state on error
      this.syncStates.set(deviceId, {
        lastSync: syncState?.lastSync || 0,
        syncing: false
      });
      throw error;
    }
  }

  /**
   * Perform the actual sync operation
   */
  private async performSync(device: ESP32Device): Promise<ESP32JournalEntry[]> {
    const requestId = `sync-${device.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const syncState = this.syncStates.get(device.id);
    const lastSync = syncState?.lastSync || 0;
    
    const syncRequest: JournalSyncRequest = {
      type: 'sync_request',
      deviceId: device.id,
      lastSyncTimestamp: lastSync,
      requestId
    };
    
    const packet = Buffer.concat([
      Buffer.from([NetworkServiceType.JOURNAL_SYNC_SERVICE]),
      Buffer.from(JSON.stringify(syncRequest))
    ]);
    
    return new Promise((resolve, reject) => {
      // Set timeout for sync operation
      const timeout = setTimeout(() => {
        this.pendingSyncs.delete(requestId);
        console.warn(`[ESP32JournalSync] Journal sync timeout for device ${device.id} - device may not be responding`);
        reject(new Error(`Device not responding - journal sync timed out`));
      }, 30000); // 30 second timeout for journal sync
      
      this.pendingSyncs.set(requestId, { resolve, reject, timeout });
      
      // Send sync request
      this.transport.send(packet, device.address, device.port).catch(error => {
        clearTimeout(timeout);
        this.pendingSyncs.delete(requestId);
        reject(error);
      });
      
      debug(`Journal sync request sent to ${device.id}`);
    });
  }

  /**
   * Handle incoming journal messages
   */
  private async handleJournalMessage(data: Buffer, rinfo: UdpRemoteInfo): Promise<void> {
    debug(`Received journal message from ${rinfo.address}:${rinfo.port}`);
    
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'sync_response') {
        const response = message as JournalSyncResponse;
        const requestId = response.requestId;
        
        if (this.pendingSyncs.has(requestId)) {
          const pending = this.pendingSyncs.get(requestId)!;
          clearTimeout(pending.timeout);
          this.pendingSyncs.delete(requestId);
          
          // Process entries
          const processedEntries: ESP32JournalEntry[] = [];
          for (const entry of response.entries) {
            // Verify entry authenticity if signature is present
            if (entry.signature) {
              // TODO: Verify signature using device's public key from VC
              debug(`Entry ${entry.id} has signature, verification pending implementation`);
            }
            
            // Emit individual entry event
            this.onESP32JournalEntry.emit(entry.deviceId, entry);
            processedEntries.push(entry);
          }
          
          // Send acknowledgment
          if (processedEntries.length > 0) {
            const ack: JournalAck = {
              type: 'sync_ack',
              requestId,
              processedCount: processedEntries.length,
              lastProcessedId: processedEntries[processedEntries.length - 1].id
            };
            
            const ackPacket = Buffer.concat([
              Buffer.from([NetworkServiceType.JOURNAL_SYNC_SERVICE]),
              Buffer.from(JSON.stringify(ack))
            ]);
            
            // Find device by address
            const device = Array.from(this.connectionManager.getDevices()).find(
              d => d.address === rinfo.address && d.port === rinfo.port
            );
            
            if (device) {
              await this.transport.send(ackPacket, device.address, device.port);
              debug(`Sent acknowledgment for ${processedEntries.length} entries`);
            }
          }
          
          // If there are more entries, we could implement pagination here
          if (response.hasMore && response.nextTimestamp) {
            debug(`Device ${response.entries[0]?.deviceId} has more entries after timestamp ${response.nextTimestamp}`);
            // TODO: Implement pagination for large journal syncs
          }
          
          pending.resolve(processedEntries);
        }
      } else if (message.type === 'sync_request') {
        // ESP32 devices might also request journal sync from the app
        debug('Received sync request from ESP32, not implemented yet');
        // TODO: Implement app-to-ESP32 journal sync
      }
    } catch (error) {
      debug('Failed to parse journal message:', error);
      this.onError.emit(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get last sync timestamp for a device
   */
  public getLastSyncTimestamp(deviceId: string): number {
    return this.syncStates.get(deviceId)?.lastSync || 0;
  }

  /**
   * Check if currently syncing with a device
   */
  public isSyncing(deviceId: string): boolean {
    return this.syncStates.get(deviceId)?.syncing || false;
  }

  /**
   * Clear sync state for a device
   */
  public clearSyncState(deviceId: string): void {
    this.syncStates.delete(deviceId);
  }

  /**
   * Shutdown the journal sync service
   */
  public async shutdown(): Promise<void> {
    debug('Shutting down ESP32JournalSync...');
    
    // Cancel all pending syncs
    for (const [requestId, pending] of this.pendingSyncs) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Journal sync shutting down'));
    }
    this.pendingSyncs.clear();
    
    // Clear sync states
    this.syncStates.clear();
    
    // Remove service handler
    this.transport.removeService(NetworkServiceType.JOURNAL_SYNC_SERVICE);
    
    debug('ESP32JournalSync shutdown complete');
  }
}