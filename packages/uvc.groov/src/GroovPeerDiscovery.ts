import Bonjour from 'bonjour-service';

const HASH_RE = /^[0-9a-f]{64}$/i;

function isMeaningfulHash(value: string): boolean {
  return HASH_RE.test(value) && !/^0{64}$/i.test(value);
}

export interface GroovPeerIdentity {
  personId: string;
  instanceId: string;
  publicKey: string;
  displayName: string;
  port: number;
}

export interface GroovDiscoveredPeer {
  deviceId: string;
  publicKey: string;
  claimedPersonId: string;
  deviceKind: string;
  address: string;
  port: number;
  capabilities: string[];
  observedAt: number;
  expiresAt: number;
}

export function buildGroovTxtRecord(identity: GroovPeerIdentity): Record<string, string> {
  if (
    !isMeaningfulHash(identity.instanceId)
    || !isMeaningfulHash(identity.personId)
    || !isMeaningfulHash(identity.publicKey)
  ) {
    throw new Error('[uvc.groov] mDNS identity fields must be non-zero 64-character hashes');
  }
  return {
    deviceId: identity.instanceId,
    pubkey: identity.publicKey,
    personId: identity.personId,
    name: identity.displayName,
    deviceType: 'groov',
    platform: 'one',
    capabilities: 'quicvc,chum,phone-book,trie,device-control,journal,light',
  };
}

/** Native Groov host adapter. Every discovery is fed directly to its phone-book plan. */
export class GroovPeerDiscovery {
  private bonjour: Bonjour | undefined;
  private browser: ReturnType<Bonjour['find']> | undefined;
  private advertisement: ReturnType<Bonjour['publish']> | undefined;

  constructor(
    private readonly identity: GroovPeerIdentity,
    private readonly recordDiscovery: (peer: GroovDiscoveredPeer) => Promise<void>,
  ) {}

  start(): void {
    if (this.bonjour) {
      return;
    }
    this.bonjour = new Bonjour();
    this.advertisement = this.bonjour.publish({
      name: this.identity.instanceId.slice(0, 16),
      type: 'one-refinio',
      protocol: 'udp',
      port: this.identity.port,
      txt: buildGroovTxtRecord(this.identity),
    });
    this.browser = this.bonjour.find({type: 'one-refinio', protocol: 'udp'});
    const consume = (service: ReturnType<Bonjour['find']>['services'][number]) => {
      const txt = service.txt ?? {};
      const deviceId = String(txt.deviceId ?? '');
      const publicKey = String(txt.pubkey ?? '');
      const claimedPersonId = String(txt.personId ?? '');
      const address = service.addresses?.find(candidate => !candidate.includes(':'));
      if (
        deviceId === this.identity.instanceId
        || !isMeaningfulHash(deviceId)
        || !isMeaningfulHash(publicKey)
        || !isMeaningfulHash(claimedPersonId)
        || !address
        || !service.port
      ) {
        return;
      }
      const observedAt = Date.now();
      void this.recordDiscovery({
        deviceId,
        publicKey,
        claimedPersonId,
        deviceKind: String(txt.deviceType ?? 'one-peer'),
        address,
        port: service.port,
        capabilities: String(txt.capabilities ?? '').split(',').filter(Boolean),
        observedAt,
        expiresAt: observedAt + 60_000,
      });
    };
    this.browser.on('up', consume);
    this.browser.on('txt-update', consume);
  }

  stop(): void {
    this.browser?.stop();
    this.browser = undefined;
    this.advertisement?.stop();
    this.advertisement = undefined;
    this.bonjour?.destroy();
    this.bonjour = undefined;
  }
}
