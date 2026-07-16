import type {
  LocalDiscoveryProvider,
  LocalPeerInfo,
} from '@refinio/connection.core/discovery/DiscoveryService.js';
import type {NativeMdnsConfig} from './NativeMdnsTypes';
export type {NativeMdnsConfig} from './NativeMdnsTypes';

/**
 * Browser implementation. Browsers cannot browse or publish DNS-SD services;
 * they receive the directory through their paired ONE/CHUM connection.
 */
export class NativeMdnsDiscovery implements LocalDiscoveryProvider {
  constructor(_config: NativeMdnsConfig) {}
  async initialize(): Promise<void> {}
  async startListening(): Promise<void> {}
  stopListening(): void {}
  async scan(_timeout: number): Promise<LocalPeerInfo[]> { return []; }
  onPeerDiscovered(_callback: (peer: LocalPeerInfo) => void): void {}
  onPeerUpdated(_callback: (peer: LocalPeerInfo) => void): void {}
  onPeerLost(_callback: (peerId: string) => void): void {}
  async shutdown(): Promise<void> {}
}
