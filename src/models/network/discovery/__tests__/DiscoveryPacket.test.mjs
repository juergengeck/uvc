import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bytesToHex,
  calculateIPv4BroadcastAddress,
  encodeDiscoveryPacket,
} from '../DiscoveryPacket.ts';

test('encodes a discovery service byte followed by UTF-8 JSON', () => {
  const packet = encodeDiscoveryPacket(1, {type: 'app_discovery', name: 'UVC'});

  assert.equal(packet[0], 1);
  assert.deepEqual(
    JSON.parse(new TextDecoder().decode(packet.subarray(1))),
    {type: 'app_discovery', name: 'UVC'},
  );
});

test('encodes public key bytes as lowercase hex', () => {
  assert.equal(bytesToHex(new Uint8Array([0, 15, 16, 255])), '000f10ff');
});

test('derives a directed IPv4 broadcast address from the active interface', () => {
  assert.equal(calculateIPv4BroadcastAddress('192.168.178.73', '255.255.255.0'), '192.168.178.255');
  assert.equal(calculateIPv4BroadcastAddress('10.4.7.9', '255.255.0.0'), '10.4.255.255');
  assert.equal(calculateIPv4BroadcastAddress('invalid', '255.255.255.0'), undefined);
});
