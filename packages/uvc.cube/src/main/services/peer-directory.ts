import Bonjour from 'bonjour-service';
import {networkInterfaces} from 'node:os';

import type {
  DiscoveryConfigSnapshot,
  DiscoveryDeviceSnapshot,
  DiscoveryRuntimeSnapshot,
  SettingsSnapshot,
} from '@shared/contracts';
import {getCubeSettingsService} from './cube-settings.js';
import type {CubeOneIdentity} from './cube-one-runtime.js';

const SERVICE_TYPE = 'one-refinio';
const PROVISIONING_SERVICE_TYPE = 'uvc-provision';
const DISCOVERY_SOURCE = 'mdns://_one-refinio._udp.local';
type BonjourBrowser = ReturnType<Bonjour['find']>;
type BonjourService = BonjourBrowser['services'][number];

function txtString(txt: Record<string, unknown>, key: string): string | undefined {
  const value = txt[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function serviceId(service: BonjourService): string {
  return txtString(service.txt ?? {}, 'deviceId') ?? service.name;
}

function localIpv4Addresses(): Set<string> {
  const result = new Set<string>(['127.0.0.1']);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        result.add(address.address);
      }
    }
  }
  return result;
}

function primaryLocalIpv4Address(): string | undefined {
  return [...localIpv4Addresses()].find(address => address !== '127.0.0.1');
}

function isHostedLocally(device: DiscoveryDeviceSnapshot): boolean {
  return Boolean(device.address && localIpv4Addresses().has(device.address));
}

function quicVcPort(): number {
  const port = Number(process.env.UVC_QUICVC_PORT ?? 49497);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`[CubePeerDirectory] invalid UVC_QUICVC_PORT ${process.env.UVC_QUICVC_PORT ?? ''}`);
  }
  return port;
}

function normalizeService(service: BonjourService, provisioning = false): DiscoveryDeviceSnapshot | undefined {
  const txt = (service.txt ?? {}) as Record<string, unknown>;
  const id = txtString(txt, provisioning ? 'hardwareDeviceId' : 'deviceId');
  const publicKey = txtString(txt, provisioning ? 'bootstrapKey' : 'pubkey');
  const address = service.addresses?.find(candidate => (
    !candidate.includes(':') && !candidate.startsWith('169.254')
  )) ?? service.referer?.address;
  if (!id || !publicKey || !address || !service.port) {
    return undefined;
  }

  const capabilities = (txtString(txt, 'capabilities') ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return {
    id,
    ...(!provisioning ? {instanceId: id} : {}),
    name: txtString(txt, 'name') ?? service.name,
    type: txtString(txt, 'deviceType') ?? 'one-peer',
    role: txtString(txt, 'role'),
    address,
    port: service.port,
    mdnsName: service.host,
    online: true,
    connected: false,
    ...(!provisioning && txtString(txt, 'personId') ? {ownerId: txtString(txt, 'personId')} : {}),
    publicKey,
    lastSeenAt: new Date().toISOString(),
    trustState: provisioning ? 'unprovisioned' : 'discovered',
    capabilities,
  };
}

function buildDiscoveryConfig(_settings: SettingsSnapshot): DiscoveryConfigSnapshot {
  return {
    discovery: {
      enabled: true,
      mode: 'mdns',
      serviceType: SERVICE_TYPE,
      domain: 'local',
    },
    trust: {
      autoTrustKnownDevices: false,
    },
  };
}

class CubePeerDirectory {
  private bonjour?: Bonjour;
  private browser?: BonjourBrowser;
  private provisioningBrowser?: BonjourBrowser;
  private readonly devices = new Map<string, DiscoveryDeviceSnapshot>();
  private readonly localInstances = new Map<string, DiscoveryDeviceSnapshot>();
  private lastScanAt?: string;
  private identity?: CubeOneIdentity;
  private publishedService?: ReturnType<Bonjour['publish']>;
  private onDiscovery?: (device: DiscoveryDeviceSnapshot) => Promise<void>;
  private canonicalizeDevice?: (device: DiscoveryDeviceSnapshot) => DiscoveryDeviceSnapshot;
  private isPaired?: (personId: string) => boolean;
  private readonly changeListeners = new Set<() => void>();

  onChanged(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  start(
    identity?: CubeOneIdentity,
    onDiscovery?: (device: DiscoveryDeviceSnapshot) => Promise<void>,
    isPaired?: (personId: string) => boolean,
    canonicalizeDevice?: (device: DiscoveryDeviceSnapshot) => DiscoveryDeviceSnapshot,
  ): void {
    this.identity = identity ?? this.identity;
    this.onDiscovery = onDiscovery ?? this.onDiscovery;
    this.isPaired = isPaired ?? this.isPaired;
    this.canonicalizeDevice = canonicalizeDevice ?? this.canonicalizeDevice;
    if (this.bonjour) {
      return;
    }
    if (!this.identity) {
      throw new Error('[CubePeerDirectory] cannot advertise without a ONE identity');
    }
    this.bonjour = new Bonjour({}, (error: Error) => {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EADDRNOTAVAIL' || code === 'ENETUNREACH') {
        console.warn(`[CubePeerDirectory] mDNS interface changed while sending: ${code}`);
        return;
      }
      console.error('[CubePeerDirectory] mDNS transport failed:', error);
    });
    this.publishedService = this.bonjour.publish({
      name: this.identity.instanceId.slice(0, 16),
      type: SERVICE_TYPE,
      protocol: 'udp',
      port: quicVcPort(),
      txt: {
        deviceId: this.identity.instanceId,
        pubkey: this.identity.publicKey,
        personId: this.identity.personId,
        name: this.identity.displayName,
        deviceType: 'cube',
        platform: 'one',
        capabilities: 'chum,phone-book,trie,device-control,journal',
      },
    });
    this.publishedService.on('error', error => {
      console.error('[CubePeerDirectory] mDNS advertisement failed:', error);
    });
    this.startBrowser();
  }

  stop(): void {
    this.browser?.stop();
    this.browser = undefined;
    this.provisioningBrowser?.stop();
    this.provisioningBrowser = undefined;
    this.publishedService?.stop();
    this.publishedService = undefined;
    this.bonjour?.destroy();
    this.bonjour = undefined;
    this.devices.clear();
    this.localInstances.clear();
  }

  refresh(): void {
    if (!this.bonjour) {
      this.start();
      return;
    }
    // A browser restart replays bonjour-service's in-memory cache and can make
    // an offline peer look freshly observed. Recreate the Bonjour instance so
    // a refresh is backed only by answers received from the network now.
    this.stop();
    this.start();
    this.emitChanged();
  }

  async snapshot(): Promise<DiscoveryRuntimeSnapshot> {
    const settings = await getCubeSettingsService().getSettings();
    const fetchedAt = new Date().toISOString();
    const localInstances = new Map(this.localInstances);
    if (this.identity) {
      const advertised = localInstances.get(this.identity.instanceId);
      localInstances.set(this.identity.instanceId, {
        ...advertised,
        id: this.identity.instanceId,
        instanceId: this.identity.instanceId,
        name: this.identity.displayName,
        type: 'cube',
        role: 'local runtime',
        address: advertised?.address ?? primaryLocalIpv4Address(),
        port: quicVcPort(),
        online: true,
        connected: true,
        ownerId: this.identity.personId,
        publicKey: this.identity.publicKey,
        lastSeenAt: fetchedAt,
        trustState: 'owned',
        capabilities: ['chum', 'phone-book', 'trie', 'device-control', 'journal'],
      });
    }
    const withPairingState = (device: DiscoveryDeviceSnapshot): DiscoveryDeviceSnapshot => {
      const paired = Boolean(device.ownerId && this.isPaired?.(device.ownerId));
      return paired ? {...device, trustState: 'paired'} : device;
    };
    const byName = (left: DiscoveryDeviceSnapshot, right: DiscoveryDeviceSnapshot) => (
      (left.name ?? left.id).localeCompare(right.name ?? right.id)
    );
    return {
      discoverySource: DISCOVERY_SOURCE,
      status: {
        service: 'uvc-cube-peer-directory',
        role: 'cube-observer',
        status: 'browsing',
        healthy: Boolean(this.browser),
        ownerId: this.identity?.personId,
        instanceId: this.identity?.instanceId,
        updatedAt: new Date().toISOString(),
        mdns: {
          serviceType: `_${SERVICE_TYPE}._udp`,
          serviceName: this.identity?.instanceId.slice(0, 16),
          domain: 'local',
        },
        discovery: {
          protocol: 'mdns',
          peersSeen: this.devices.size,
          lastScanAt: this.lastScanAt,
        },
      },
      localInstances: [...localInstances.values()].map(withPairingState).sort(byName),
      devices: [...this.devices.values()].map(withPairingState).sort(byName),
      config: buildDiscoveryConfig(settings),
      fetchedAt,
    };
  }

  private consumeStandardService(service: BonjourService): void {
    const normalized = normalizeService(service);
    const canonical = normalized && this.canonicalizeDevice?.(normalized) || normalized;
    const previous = canonical && this.devices.get(canonical.id);
    const device = canonical && previous?.connected
      ? {...canonical, connected: true}
      : canonical;
    if (!device) return;

    if (isHostedLocally(device) || device.id === this.identity?.instanceId) {
      if (normalized && normalized.id !== device.id) this.localInstances.delete(normalized.id);
      this.devices.delete(device.id);
      this.localInstances.set(device.id, device);
      this.emitChanged();
      return;
    }

    if (normalized && normalized.id !== device.id) this.devices.delete(normalized.id);
    this.localInstances.delete(device.id);
    this.devices.set(device.id, device);
    this.emitChanged();
    console.log(`[CubePeerDirectory] Discovered ${device.name} at ${device.address}:${device.port}`);
    void this.onDiscovery?.(device).catch(error => {
      console.error(`[CubePeerDirectory] failed to record ${device.id}:`, error);
    });
  }

  private startBrowser(): void {
    if (!this.bonjour) {
      return;
    }
    this.lastScanAt = new Date().toISOString();
    this.browser = this.bonjour.find({type: SERVICE_TYPE, protocol: 'udp'});
    this.browser.on('up', service => this.consumeStandardService(service));
    this.browser.on('down', service => {
      const id = serviceId(service);
      if (this.devices.delete(id) || this.localInstances.delete(id)) {
        this.emitChanged();
        console.log(`[CubePeerDirectory] Lost ${id}`);
      }
    });
    this.browser.on('txt-update', service => this.consumeStandardService(service));
    this.provisioningBrowser = this.bonjour.find({
      type: PROVISIONING_SERVICE_TYPE,
      protocol: 'udp',
    });
    const consumeProvisioning = (service: BonjourService) => {
      const device = normalizeService(service, true);
      if (device) {
        this.devices.set(device.id, device);
        this.emitChanged();
        void this.onDiscovery?.(device).catch(error => {
          console.error(`[CubePeerDirectory] failed to record bootstrap device ${device.id}:`, error);
        });
      }
    };
    this.provisioningBrowser.on('up', consumeProvisioning);
    this.provisioningBrowser.on('txt-update', consumeProvisioning);
    this.provisioningBrowser.on('down', service => {
      const id = txtString((service.txt ?? {}) as Record<string, unknown>, 'hardwareDeviceId') ?? service.name;
      if (this.devices.delete(id)) {
        this.emitChanged();
      }
    });
  }

  private emitChanged(): void {
    for (const listener of this.changeListeners) {
      listener();
    }
  }

  setDeviceConnection(deviceId: string, connected: boolean): void {
    let changed = false;
    for (const [key, device] of this.devices) {
      if (device.id !== deviceId && device.instanceId !== deviceId) continue;
      if (device.connected === connected) continue;
      this.devices.set(key, {...device, connected});
      changed = true;
    }
    if (changed) this.emitChanged();
  }
}

const peerDirectory = new CubePeerDirectory();

export function startPeerDirectory(
  identity?: CubeOneIdentity,
  onDiscovery?: (device: DiscoveryDeviceSnapshot) => Promise<void>,
  isPaired?: (personId: string) => boolean,
  canonicalizeDevice?: (device: DiscoveryDeviceSnapshot) => DiscoveryDeviceSnapshot,
): void {
  peerDirectory.start(identity, onDiscovery, isPaired, canonicalizeDevice);
}

export function stopPeerDirectory(): void {
  peerDirectory.stop();
}

export function onPeerDirectoryChanged(listener: () => void): () => void {
  return peerDirectory.onChanged(listener);
}

export function setDiscoveryDeviceConnection(deviceId: string, connected: boolean): void {
  peerDirectory.setDeviceConnection(deviceId, connected);
}

export async function getDiscoveryRuntimeSnapshot(): Promise<DiscoveryRuntimeSnapshot> {
  peerDirectory.start();
  return peerDirectory.snapshot();
}

export async function refreshDiscoveryRuntime(): Promise<DiscoveryRuntimeSnapshot> {
  peerDirectory.refresh();
  return peerDirectory.snapshot();
}

export async function setDiscoveryDeviceTrust(
  _deviceId: string,
  _trusted: boolean,
): Promise<DiscoveryRuntimeSnapshot> {
  throw new Error('A discovered peer must complete ONE pairing before its trust can change');
}

export async function pushDiscoverySettings() {
  const runtime = await refreshDiscoveryRuntime();
  return {config: runtime.config, runtime};
}
