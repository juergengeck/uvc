export interface NativeMdnsConfig {
  deviceId: string;
  pubKey: string;
  personId: string;
  displayName: string;
  deviceType: string;
  quicvcPort: number;
  capabilities: readonly string[];
}
