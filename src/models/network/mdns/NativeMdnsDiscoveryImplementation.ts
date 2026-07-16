import Zeroconf from 'react-native-zeroconf';
import {AppState, NativeModules} from 'react-native';
import type {NativeEventSubscription} from 'react-native';
import type {
  LocalDiscoveryProvider,
  LocalPeerInfo,
} from '@refinio/connection.core/discovery/DiscoveryService.js';
import {
  capabilitiesFromTxtRecord,
  normalizeAdvertisedCapabilities,
  serializeDiscoveryCapabilities,
} from '@refinio/connection.core/services/DiscoveryCapabilities.js';
import type {NativeMdnsConfig} from './NativeMdnsTypes';

const SERVICE_TYPE = 'one-refinio';
const PROTOCOL = 'udp';
const DOMAIN = 'local.';
const PEER_EXPIRATION_MS = 60_000;
const CLEANUP_INTERVAL_MS = 10_000;
const HEX_64_RE = /^[0-9a-f]{64}$/i;

function meaningfulHash(value: string | undefined): value is string {
  return !!value && HEX_64_RE.test(value) && !/^0{64}$/i.test(value);
}

function txtString(txt: Record<string, unknown>, key: string): string | undefined {
  const value = txt[key];
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * Native Bonjour adapter for the shared connection.core discovery contract.
 * Discovery establishes reachability only. Trust is established later by the
 * QUICVC/ONE handshake before the peer enters the certified phone book.
 */
export class NativeMdnsDiscovery implements LocalDiscoveryProvider {
  private zeroconf: Zeroconf | null = null;
  private readonly peers = new Map<string, LocalPeerInfo & {serviceName: string}>();
  private readonly discoveredCallbacks: Array<(peer: LocalPeerInfo) => void> = [];
  private readonly updatedCallbacks: Array<(peer: LocalPeerInfo) => void> = [];
  private readonly lostCallbacks: Array<(peerId: string) => void> = [];
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private appStateSubscription?: NativeEventSubscription;
  private listening = false;
  private resumeListening = false;
  private publishedServiceName?: string;

  constructor(private config: NativeMdnsConfig) {}

  async initialize(): Promise<void> {
    if (this.zeroconf) {
      return;
    }
    if (!NativeModules.RNZeroconf) {
      throw new Error('[UvcMdns] RNZeroconf is unavailable; rebuild the native app');
    }

    this.zeroconf = new Zeroconf();
    this.zeroconf.on('resolved', service => this.handleResolved(service));
    this.zeroconf.on('remove', name => this.handleRemoved(String(name)));
    this.zeroconf.on('error', error => {
      const message = String(error);
      if (!message.includes('-72004') && !message.includes('-72007')) {
        console.error('[UvcMdns] Bonjour error:', error);
      }
    });

    this.appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'background' && this.listening) {
        this.resumeListening = true;
        this.pauseScan();
      } else if (state === 'active' && this.resumeListening) {
        this.resumeListening = false;
        this.startScan();
      }
    });
  }

  async startListening(): Promise<void> {
    if (this.listening) {
      return;
    }
    if (!this.zeroconf) {
      throw new Error('[UvcMdns] initialize() must complete before startListening()');
    }
    if (!meaningfulHash(this.config.deviceId) || !meaningfulHash(this.config.pubKey)) {
      throw new Error('[UvcMdns] instance id and public key must be non-zero 64-character hashes');
    }

    this.publishedServiceName = this.config.deviceId.slice(0, 16);
    const txt: Record<string, string> = {
      deviceId: this.config.deviceId,
      pubkey: this.config.pubKey,
      personId: this.config.personId,
      name: this.config.displayName,
      deviceType: this.config.deviceType,
      platform: 'one',
      capabilities: serializeDiscoveryCapabilities(
        normalizeAdvertisedCapabilities(this.config.capabilities),
      ),
    };

    this.zeroconf.publishService(
      SERVICE_TYPE,
      PROTOCOL,
      DOMAIN,
      this.publishedServiceName,
      this.config.quicvcPort,
      txt,
    );
    this.startScan();
    console.log(`[UvcMdns] Advertising _${SERVICE_TYPE}._${PROTOCOL} as ${this.publishedServiceName}`);
  }

  stopListening(): void {
    if (!this.zeroconf) {
      return;
    }
    if (this.publishedServiceName) {
      this.zeroconf.unpublishService(this.publishedServiceName);
      this.publishedServiceName = undefined;
    }
    this.resumeListening = false;
    this.pauseScan();
  }

  async scan(_timeout: number): Promise<LocalPeerInfo[]> {
    return [...this.peers.values()].map(({serviceName: _serviceName, ...peer}) => peer);
  }

  onPeerDiscovered(callback: (peer: LocalPeerInfo) => void): void {
    this.discoveredCallbacks.push(callback);
  }

  onPeerUpdated(callback: (peer: LocalPeerInfo) => void): void {
    this.updatedCallbacks.push(callback);
  }

  onPeerLost(callback: (peerId: string) => void): void {
    this.lostCallbacks.push(callback);
  }

  async shutdown(): Promise<void> {
    this.stopListening();
    this.appStateSubscription?.remove();
    this.appStateSubscription = undefined;
    this.zeroconf?.removeDeviceListeners();
    this.zeroconf = null;
    for (const peerId of this.peers.keys()) {
      this.lostCallbacks.forEach(callback => callback(peerId));
    }
    this.peers.clear();
  }

  updateDisplayName(displayName: string): void {
    const normalized = displayName.trim();
    if (!normalized || normalized === this.config.displayName) {
      return;
    }
    this.config = {...this.config, displayName: normalized};
    if (this.listening) {
      this.stopListening();
      void this.startListening();
    }
  }

  private startScan(): void {
    if (!this.zeroconf || this.listening) {
      return;
    }
    this.zeroconf.scan(SERVICE_TYPE, PROTOCOL, DOMAIN);
    this.cleanupTimer = setInterval(() => this.expireStalePeers(), CLEANUP_INTERVAL_MS);
    this.listening = true;
  }

  private pauseScan(): void {
    this.zeroconf?.stop();
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.listening = false;
  }

  private handleResolved(service: any): void {
    const txt = (service.txt ?? {}) as Record<string, unknown>;
    const deviceId = txtString(txt, 'deviceId');
    const publicKey = txtString(txt, 'pubkey');
    if (
      !meaningfulHash(deviceId)
      || !meaningfulHash(publicKey)
      || deviceId === this.config.deviceId
    ) {
      return;
    }

    const addresses: string[] = service.addresses ?? [];
    const address = addresses.find(value => !value.includes(':') && !value.startsWith('169.254'))
      ?? addresses.find(value => !value.includes(':'));
    const name = txtString(txt, 'name');
    if (!address || !name) {
      return;
    }

    const now = Date.now();
    const port = Number(service.port) || 49497;
    const serviceName = typeof service.name === 'string'
      ? service.name
      : deviceId.slice(0, 16);
    const existing = this.peers.get(deviceId);
    const peer: LocalPeerInfo & {serviceName: string} = {
      id: deviceId,
      name,
      address: `${address}:${port}`,
      publicKey,
      personId: txtString(txt, 'personId'),
      email: txtString(txt, 'email'),
      deviceType: txtString(txt, 'deviceType'),
      capabilities: capabilitiesFromTxtRecord(txt, address),
      discoveredAt: existing?.discoveredAt ?? now,
      lastSeenAt: now,
      serviceName,
    };
    this.peers.set(deviceId, peer);
    (existing ? this.updatedCallbacks : this.discoveredCallbacks)
      .forEach(callback => callback(peer));
  }

  private handleRemoved(serviceName: string): void {
    for (const [deviceId, peer] of this.peers) {
      if (peer.serviceName === serviceName || deviceId.slice(0, 16) === serviceName) {
        this.removePeer(deviceId);
        return;
      }
    }
  }

  private expireStalePeers(): void {
    const cutoff = Date.now() - PEER_EXPIRATION_MS;
    for (const [deviceId, peer] of this.peers) {
      if (peer.lastSeenAt < cutoff) {
        this.removePeer(deviceId);
      }
    }
  }

  private removePeer(deviceId: string): void {
    if (this.peers.delete(deviceId)) {
      this.lostCallbacks.forEach(callback => callback(deviceId));
    }
  }
}
