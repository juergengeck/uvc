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
