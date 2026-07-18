export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function encodeDiscoveryPacket(serviceType: number, payload: unknown): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const packet = new Uint8Array(json.length + 1);
  packet[0] = serviceType;
  packet.set(json, 1);
  return packet;
}

export function calculateIPv4BroadcastAddress(
  address: string | null | undefined,
  subnet: string | null | undefined,
): string | undefined {
  const addressParts = address?.split('.').map(Number);
  const subnetParts = subnet?.split('.').map(Number);
  if (
    addressParts?.length !== 4
    || subnetParts?.length !== 4
    || [...addressParts, ...subnetParts].some(part => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return undefined;
  }
  return addressParts
    .map((part, index) => (part | (255 ^ subnetParts[index])) & 255)
    .join('.');
}
