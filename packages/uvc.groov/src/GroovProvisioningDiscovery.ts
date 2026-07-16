import Bonjour from 'bonjour-service';

export interface GroovProvisioningDiscoveryIdentity {
  hardwareDeviceId: string;
  bootstrapPublicKey: string;
  displayName: string;
  port: number;
}

export function buildGroovProvisioningTxtRecord(
  identity: GroovProvisioningDiscoveryIdentity,
): Record<string, string> {
  return {
    hardwareDeviceId: identity.hardwareDeviceId,
    bootstrapKey: identity.bootstrapPublicKey,
    name: identity.displayName,
    deviceType: 'groov',
    protocol: 'uvc-headless-provisioning-v1',
    capabilities: 'identity-assignment,device-key-generation,admin-grant',
  };
}

/**
 * Advertises only bootstrap reachability. Stop this service permanently when
 * UvcHeadlessProvisioningDevice completes and start GroovPeerDiscovery with
 * the newly created ONE identity.
 */
export class GroovProvisioningDiscovery {
  private bonjour: Bonjour | undefined;
  private advertisement: ReturnType<Bonjour['publish']> | undefined;

  constructor(private readonly identity: GroovProvisioningDiscoveryIdentity) {
    for (const [field, value] of Object.entries(identity)) {
      if (typeof value === 'string' && !value.trim()) {
        throw new Error(`[uvc.groov] ${field} is required for provisioning discovery`);
      }
    }
    if (!Number.isInteger(identity.port) || identity.port <= 0 || identity.port > 65535) {
      throw new Error('[uvc.groov] provisioning port is invalid');
    }
  }

  start(): void {
    if (this.bonjour) {
      return;
    }
    this.bonjour = new Bonjour({}, (error: Error) => {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EADDRNOTAVAIL' || code === 'ENETUNREACH') {
        console.warn(`[uvc.groov] mDNS interface changed while advertising provisioning (${code})`);
        return;
      }
      console.error('[uvc.groov] provisioning mDNS error:', error);
    });
    this.advertisement = this.bonjour.publish({
      name: this.identity.hardwareDeviceId,
      type: 'uvc-provision',
      protocol: 'udp',
      port: this.identity.port,
      txt: buildGroovProvisioningTxtRecord(this.identity),
    });
  }

  stop(): void {
    this.advertisement?.stop();
    this.advertisement = undefined;
    this.bonjour?.destroy();
    this.bonjour = undefined;
  }
}
